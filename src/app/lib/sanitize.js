const BLOCK_PATTERNS = [
  /<[^>]*>/,                                  // HTML / script tags
  /;\s*(drop|delete|insert|update|alter)\b/i, // chained SQL
  /\bunion\s+select\b/i,                      // SQL injection
  /--\s*$/,                                    // SQL comment
  /'\s*or\s*'?1'?\s*=\s*'?1/i,                 // ' or '1'='1
  /ignore\s+(all\s+)?previous\s+instructions/i, // prompt injection
  /\b(system\s+prompt|you\s+are\s+now|act\s+as)\b/i, // role hijack
];

export function sanitizeInput(raw) {
  if (typeof raw !== "string") {
    return { ok: false, reason: "Question must be text." };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: "Please type a question." };
  }
  if (trimmed.length > 500) {
    return { ok: false, reason: "Question is too long (max 500 characters)." };
  }
  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: "That input isn't allowed. Please rephrase your question." };
    }
  }
  return { ok: true, clean: trimmed };
}