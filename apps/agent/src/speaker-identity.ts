import type { SessionState, SpeakerProfile, TranscriptChunk } from "@copilot/shared";

const DIRECT_NAME_PATTERNS = [
  /\b(?:i am|i'm|this is|my name is)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
];

const VOCATIVE_PATTERNS = [
  /^(?:hey|hi|okay|ok|so|well)?\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*[,?:-]/i,
  /\b(?:hey|hi|thanks|thank you|sorry)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
  /\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*,\s*(?:can|could|will|would|do|did|are|is|have|has|should)\b/i,
];

const NAME_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "anyone",
  "app",
  "backend",
  "both",
  "buddy",
  "by",
  "can",
  "design",
  "engineering",
  "everyone",
  "folks",
  "frontend",
  "guys",
  "hello",
  "hey",
  "hi",
  "i",
  "it",
  "launch",
  "let",
  "maybe",
  "my",
  "no",
  "not",
  "now",
  "okay",
  "ops",
  "our",
  "pm",
  "please",
  "product",
  "qa",
  "right",
  "so",
  "someone",
  "sorry",
  "team",
  "thanks",
  "the",
  "there",
  "this",
  "we",
  "well",
  "yes",
  "you",
]);

const DIRECT_IDENTITY_WEIGHT = 3;
const RESPONSE_TO_ADDRESS_WEIGHT = 1;
const RESPONSE_WINDOW_SECONDS = 12;

export function inferSpeakerProfileUpdates(state: SessionState): SpeakerProfile[] {
  const currentProfiles = new Map(
    state.speakerProfiles.map((profile) => [profile.speakerId, profile]),
  );
  const recomputedProfiles = computeSpeakerProfiles(state.transcript);

  return recomputedProfiles.filter((profile) => {
    const current = currentProfiles.get(profile.speakerId);
    return (
      !current ||
      current.name !== profile.name ||
      current.confidence !== profile.confidence ||
      current.evidenceCount !== profile.evidenceCount
    );
  });
}

function computeSpeakerProfiles(transcript: TranscriptChunk[]): SpeakerProfile[] {
  const evidenceBySpeaker = new Map<string, Map<string, number>>();

  for (let index = 0; index < transcript.length; index += 1) {
    const chunk = transcript[index];

    for (const name of extractSelfIdentifiedNames(chunk.text)) {
      addEvidence(evidenceBySpeaker, chunk.speaker, name, DIRECT_IDENTITY_WEIGHT);
    }

    const previous = transcript[index - 1];
    if (!previous || previous.speaker === chunk.speaker) {
      continue;
    }

    if (chunk.timestamp - previous.timestamp > RESPONSE_WINDOW_SECONDS) {
      continue;
    }

    const addressedNames = extractAddressedNames(previous.text);
    if (addressedNames.length === 1) {
      addEvidence(
        evidenceBySpeaker,
        chunk.speaker,
        addressedNames[0],
        RESPONSE_TO_ADDRESS_WEIGHT,
      );
    }
  }

  const profiles: SpeakerProfile[] = [];
  for (const [speakerId, evidence] of evidenceBySpeaker) {
    const ranked = [...evidence.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    });

    const [name, score] = ranked[0] ?? [];
    if (!name || !score) {
      continue;
    }

    const runnerUpScore = ranked[1]?.[1] ?? 0;
    profiles.push({
      speakerId,
      name,
      confidence: resolveConfidence(score, runnerUpScore),
      evidenceCount: score,
    });
  }

  return profiles.sort((left, right) => left.speakerId.localeCompare(right.speakerId));
}

function resolveConfidence(score: number, runnerUpScore: number): SpeakerProfile["confidence"] {
  if (score >= 4 && score >= runnerUpScore + 2) {
    return "high";
  }

  if (score >= 2 && score > runnerUpScore) {
    return "medium";
  }

  return "low";
}

function addEvidence(
  evidenceBySpeaker: Map<string, Map<string, number>>,
  speakerId: string,
  name: string,
  weight: number,
) {
  if (!name) {
    return;
  }

  const speakerEvidence = evidenceBySpeaker.get(speakerId) ?? new Map<string, number>();
  speakerEvidence.set(name, (speakerEvidence.get(name) ?? 0) + weight);
  evidenceBySpeaker.set(speakerId, speakerEvidence);
}

function extractSelfIdentifiedNames(text: string): string[] {
  const names = new Set<string>();

  for (const pattern of DIRECT_NAME_PATTERNS) {
    const match = text.match(pattern);
    const candidate = match?.[1] ? normalizeName(match[1]) : null;
    if (candidate) {
      names.add(candidate);
    }
  }

  return [...names];
}

function extractAddressedNames(text: string): string[] {
  const names = new Set<string>();

  for (const pattern of VOCATIVE_PATTERNS) {
    const match = text.match(pattern);
    const candidate = match?.[1] ? normalizeName(match[1]) : null;
    if (candidate) {
      names.add(candidate);
    }
  }

  return [...names];
}

function normalizeName(raw: string) {
  const sanitized = raw
    .replace(/[^A-Za-z\s'-]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.replace(/[^A-Za-z'-]/g, ""))
    .filter(Boolean);

  if (!sanitized.length) {
    return null;
  }

  const normalized = sanitized
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

  const primaryToken = normalized.split(" ")[0]?.toLowerCase();
  if (!primaryToken || NAME_STOPWORDS.has(primaryToken)) {
    return null;
  }

  if (normalized.length < 2) {
    return null;
  }

  return normalized;
}
