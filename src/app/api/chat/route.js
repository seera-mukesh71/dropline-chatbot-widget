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

const EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

// Translation model: flash-lite = ~1000/day free, good at Indian languages.
// For higher quality at lower quota, use "gemini-2.5-flash".
const TRANSLATE_MODEL = "gemini-2.5-flash-lite";
const GEMINI_GEN_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

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

// --- Gemini call used for translation (with 429 retry) ---
async function geminiGenerate(prompt, maxTokens, retries = 2) {
  const res = await fetch(`${GEMINI_GEN_URL(TRANSLATE_MODEL)}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (res.status === 429 && retries > 0) {
    await new Promise((r) => setTimeout(r, 2000));
    return geminiGenerate(prompt, maxTokens, retries - 1);
  }
  if (!res.ok) {
    const detail = await res.text();
    console.error(`[translate] ${res.status}: ${detail}`);
    throw new Error(`translate_failed_${res.status}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

// Translate user input -> English. Handles native script, romanized, or English.
// On any failure, falls back to the original text so the request still works.
async function translateToEnglish(text, langCode) {
  if (langCode === "en") return text;
  const langName = LANGUAGE_NAMES[langCode] || "the user's language";
  const prompt = `You are a translation engine. The user's message may be written in ${langName} native script, in romanized/phonetic ${langName} using English letters (for example "namaskaram" for a greeting), or in English. Understand the user's intent and output ONLY the equivalent English text — no quotes, no explanation, no extra words. If it is already English, return it unchanged.

User message:
"""${text}"""`;
  try {
    const out = await geminiGenerate(prompt, 1000);
    return out || text;
  } catch {
    return text; // graceful fallback
  }
}

// Translate the English answer -> the user's language.
async function translateFromEnglish(text, langCode) {
  if (langCode === "en") return text;
  const langName = LANGUAGE_NAMES[langCode] || "the target language";
  const prompt = `Translate the following English text into ${langName}, using the native ${langName} script. Keep it clear and simple for a non-technical reader. Output ONLY the translation — no quotes, no explanation.

English text:
"""${text}"""`;
  try {
    const out = await geminiGenerate(prompt, 1500);
    return out || text;
  } catch {
    return text; // graceful fallback: show English rather than nothing
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

  // Validate language; default to English
  const language = LANGUAGE_NAMES[body.language] ? body.language : "en";
  const history = buildHistory(body.history); // already English

  try {
    // Step 1: bring the question into English (native / romanized / English all handled)
    const questionEn = await translateToEnglish(rawQuestion, language);

    // Step 2: retrieval — fold in the previous English question for pronouns
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

    // Step 3: generate (or fallback), always producing English first
    let answerEn;
    if (!matches || matches.length === 0) {
      answerEn =
        "I don't have information about that in my documents. Please contact support for help.";
    } else {
      const context = matches.map((m) => m.content).join("\n---\n");
      answerEn = await generateAnswer(history, context, questionEn);
    }

    // Step 4: translate the answer back to the user's language for display
    const answer = await translateFromEnglish(answerEn, language);

    // Return display text (answer) + English versions (for memory)
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