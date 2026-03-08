const GREETING_ONLY_PATTERN = /^(hey|hi|hello)\s*,?\s*cricket[.!?]*$/i;
const REQUEST_HINT_PATTERN = /\?|\b(what|who|when|where|why|how|which|can|could|would|will|do|does|did|is|are|am|should|tell|show|give|summarize|explain|check|help|need|know|think|missing|status|owner|blocker|risk|next)\b/i;
const STRONG_HELP_PATTERN = /\b(i need your help|help me|what are we missing|any blockers|who owns|what's blocking|what is blocking|what's the status|what is the status|next step|next steps|do you know|can you hear me)\b/i;

export function containsCricketWakeWord(text: string) {
  return /\bcricket\b/i.test(text);
}

export function looksLikeCricketRequest(text: string) {
  const normalized = normalizeCricketText(text);
  if (!normalized || !containsCricketWakeWord(normalized)) {
    return false;
  }

  if (GREETING_ONLY_PATTERN.test(normalized)) {
    return false;
  }

  const postWakeText = normalized.split(/\bcricket\b/i).slice(1).join(" ").trim();
  const target = postWakeText || normalized;
  return STRONG_HELP_PATTERN.test(normalized) || REQUEST_HINT_PATTERN.test(target);
}

export function extractCricketRequestText(text: string) {
  const normalized = normalizeCricketText(text);
  return looksLikeCricketRequest(normalized) ? normalized : null;
}

export function normalizeCricketText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
