import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeInput } from "../../lib/sanitize";
import { rateLimit } from "../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

const EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// ~14,400 requests/day free. For better quality at lower volume,
// use "llama-3.3-70b-versatile".
const GROQ_MODEL = "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `You are a helpful assistant for a financial product website.
You answer ONLY using the provided context, which comes from official PDF documents
(policies, rules, and product FAQs).

Strict rules:
- You have NO access to any user account, personal data, or financial records.
- If a user asks about their own account, balance, personal data, or anything
  user-specific, politely refuse and tell them to log in or contact support.
- If the answer is not in the provided context, say you don't have that information
  and suggest they contact support. Do NOT make up answers.
- Keep answers clear, short, and simple. Answer in English.`;

async function embedQuestion(text, retries = 2) {
  const res = await fetch(`${EMBED_URL}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    }),
  });

  if (res.status === 429 && retries > 0) {
    await new Promise((r) => setTimeout(r, 2000));
    return embedQuestion(text, retries - 1);
  }
  if (!res.ok) {
    const detail = await res.text();
    console.error(`[embed] ${res.status}: ${detail}`);
    if (res.status === 429) throw new Error("RATE_LIMIT");
    throw new Error(`embed_failed_${res.status}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

async function generateAnswer(context, question, retries = 2) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Context from documents:\n"""${context}"""\n\nUser question: ${question}`,
        },
      ],
    }),
  });

  if (res.status === 429 && retries > 0) {
    await new Promise((r) => setTimeout(r, 2000));
    return generateAnswer(context, question, retries - 1);
  }
  if (!res.ok) {
    const detail = await res.text();
    console.error(`[generate] ${res.status}: ${detail}`);
    if (res.status === 429) throw new Error("RATE_LIMIT");
    throw new Error(`generate_failed_${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) {
    console.error("Empty generation:", JSON.stringify(data));
    return "Sorry, I couldn't find a clear answer. Please contact support.";
  }
  return text;
}

export async function POST(req) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip).allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = sanitizeInput(body.question);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  const question = result.clean;

  try {
    const queryVector = await embedQuestion(question);

    const { data: matches, error } = await supabase.rpc("match_documents", {
      query_embedding: queryVector,
      match_count: 5,
    });
    if (error) throw error;

    if (!matches || matches.length === 0) {
      return NextResponse.json({
        answer:
          "I don't have information about that in my documents. Please contact support for help.",
      });
    }

    const context = matches.map((m) => m.content).join("\n---\n");
    const answer = await generateAnswer(context, question);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("chat error:", err);
    if (err instanceof Error && err.message === "RATE_LIMIT") {
      return NextResponse.json(
        { error: "We're getting a lot of questions right now. Please wait a few seconds and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
