import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeInput } from "../../lib/sanitize";
import { rateLimit } from "../../lib/rateLimit";
import { LANGUAGE_NAMES } from "../../data/languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;
const INDICTRANS_URL = process.env.INDICTRANS_URL;

const EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

// App language code -> IndicTrans2 (FLORES) code
const FLORES = {
  en: "eng_Latn",
  hi: "hin_Deva",
  te: "tel_Telu",
  ta: "tam_Taml",
  kn: "kan_Knda",
  mr: "mar_Deva",
};

const SYSTEM_PROMPT = `You are a helpful assistant for a financial product website.
You answer ONLY using the provided context, which comes from official PDF documents
(policies, rules, and product FAQs).

Strict rules:
- You have NO access to any user account, personal data, or financial records.
- If a user asks about their own account, balance, personal data, or anything
  user-specific, politely refuse and tell them to log in or contact support.
- You may use the earlier conversation to understand follow-up questions, but
  every factual claim must come from the provided document context. If the
  context doesn't contain the answer, say you don't have that information and
  suggest contacting support. Do NOT make up answers.
- Keep answers clear, short, and simple. Answer in English.`;

function buildHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "bot") &&
        typeof m.text === "string"
    )
    .slice(-6)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 1000) }));
}

// --- Translation now via your IndicTrans2 Space ---
async function callIndicTrans(text, sourceLang, targetLang) {
  const controller = new AbortController();
  // generous timeout because a sleeping free Space can cold-start slowly
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${INDICTRANS_URL}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error(`[indictrans] ${res.status}: ${detail}`);
      throw new Error(`indictrans_failed_${res.status}`);
    }
    const data = await res.json();
    return data.translation;
  } finally {
    clearTimeout(timer);
  }
}

async function translateToEnglish(text, langCode) {
  if (langCode === "en") return text;
  const src = FLORES[langCode];
  if (!src) return text;
  try {
    const out = await callIndicTrans(text, src, "eng_Latn");
    return out || text;
  } catch (err) {
    console.error("translateToEnglish failed:", err);
    return text; // fallback: pass original through
  }
}

async function translateFromEnglish(text, langCode) {
  if (langCode === "en") return text;
  const tgt = FLORES[langCode];
  if (!tgt) return text;
  try {
    const out = await callIndicTrans(text, "eng_Latn", tgt);
    return out || text;
  } catch (err) {
    console.error("translateFromEnglish failed:", err);
    return text; // fallback: show English rather than nothing
  }
}

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

async function generateAnswer(history, context, question, retries = 2) {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const m of history) {
    messages.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    });
  }
  messages.push({
    role: "user",
    content: `Context from documents:\n"""${context}"""\n\nUser question: ${question}`,
  });

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
      messages,
    }),
  });

  if (res.status === 429 && retries > 0) {
    await new Promise((r) => setTimeout(r, 2000));
    return generateAnswer(history, context, question, retries - 1);
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
  const rawQuestion = result.clean;

  const language = LANGUAGE_NAMES[body.language] ? body.language : "en";
  const history = buildHistory(body.history); // English

  try {
    const questionEn = await translateToEnglish(rawQuestion, language);

    const prevUser = history
      .filter((m) => m.role === "user")
      .slice(-1)
      .map((m) => m.text);
    const retrievalText = [...prevUser, questionEn].join(" ");
    const queryVector = await embedQuestion(retrievalText);

    const { data: matches, error } = await supabase.rpc("match_documents", {
      query_embedding: queryVector,
      match_count: 5,
    });
    if (error) throw error;

    let answerEn;
    if (!matches || matches.length === 0) {
      answerEn =
        "I don't have information about that in my documents. Please contact support for help.";
    } else {
      const context = matches.map((m) => m.content).join("\n---\n");
      answerEn = await generateAnswer(history, context, questionEn);
    }

    const answer = await translateFromEnglish(answerEn, language);

    return NextResponse.json({ answer, answerEn, questionEn });
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