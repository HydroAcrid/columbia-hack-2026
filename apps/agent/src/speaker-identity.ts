import type { SessionState, SpeakerProfile, TranscriptChunk } from "@copilot/shared";

const DIRECT_NAME_PATTERNS = [
  /\b(?:this is|it(?:'s| is))\s+me\s*,\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
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
  "me",
  "my",
  "myself",
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

const NON_NAME_FIRST_TOKENS = new Set([
  "about",
  "against",
  "around",
  "because",
  "considering",
  "for",
  "from",
  "heard",
  "hearing",
  "if",
  "into",
  "kind",
  "listening",
  "name",
  "of",
  "on",
  "one",
  "over",
  "said",
  "saying",
  "since",
  "sort",
  "than",
  "thinking",
  "through",
  "toward",
  "under",
  "until",
  "with",
]);

const NON_NAME_TOKENS = new Set([
  ...NAME_STOPWORDS,
  ...NON_NAME_FIRST_TOKENS,
  "heard",
  "idea",
  "name",
  "thinking",
]);

const DIRECT_IDENTITY_WEIGHT = 3;
const RESPONSE_TO_ADDRESS_WEIGHT = 1;
const RESPONSE_WINDOW_SECONDS = 12;
const HEURISTIC_SWITCH_MARGIN = 2;

export function inferSpeakerProfileUpdates(state: SessionState): SpeakerProfile[] {
  const currentProfiles = new Map(
    state.speakerProfiles.map((profile) => [profile.speakerId, profile]),
  );
  const recomputedProfiles = computeSpeakerProfiles(state.transcript, currentProfiles);

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

function computeSpeakerProfiles(
  transcript: TranscriptChunk[],
  currentProfiles: Map<string, SpeakerProfile>,
): SpeakerProfile[] {
  const evidenceBySpeaker = new Map<string, Map<string, number>>();
  const lockedNames = new Map<string, string>();

  for (let index = 0; index < transcript.length; index += 1) {
    const chunk = transcript[index];

    for (const name of extractSelfIdentifiedNames(chunk.text)) {
      if (!lockedNames.has(chunk.speaker)) {
        lockedNames.set(chunk.speaker, name);
      }

      const lockedName = lockedNames.get(chunk.speaker);
      if (lockedName === name) {
        addEvidence(evidenceBySpeaker, chunk.speaker, name, DIRECT_IDENTITY_WEIGHT);
      }
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
      const lockedName = lockedNames.get(chunk.speaker);
      if (lockedName && lockedName !== addressedNames[0]) {
        continue;
      }

      addEvidence(
        evidenceBySpeaker,
        chunk.speaker,
        addressedNames[0],
        RESPONSE_TO_ADDRESS_WEIGHT,
      );
    }
  }

  const profiles: SpeakerProfile[] = [];
  const speakerIds = new Set([
    ...evidenceBySpeaker.keys(),
    ...lockedNames.keys(),
    ...currentProfiles.keys(),
  ]);

  for (const speakerId of speakerIds) {
    const evidence = evidenceBySpeaker.get(speakerId) ?? new Map<string, number>();
    const lockedName = lockedNames.get(speakerId);
    if (lockedName) {
      const score = Math.max(evidence.get(lockedName) ?? 0, DIRECT_IDENTITY_WEIGHT);
      profiles.push({
        speakerId,
        name: lockedName,
        confidence: "high",
        evidenceCount: score,
      });
      continue;
    }

    const ranked = [...evidence.entries()].sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return left[0].localeCompare(right[0]);
    });

    const topCandidate = ranked[0];
    if (!topCandidate) {
      continue;
    }

    const current = currentProfiles.get(speakerId);
    const [topName, topScore] = topCandidate;
    const currentScore = current ? evidence.get(current.name) ?? current.evidenceCount : 0;
    if (current && current.name === topName) {
      const score = Math.max(current.evidenceCount, topScore);
      profiles.push({
        speakerId,
        name: current.name,
        confidence: resolveConfidence(score, ranked[1]?.[1] ?? 0),
        evidenceCount: score,
      });
      continue;
    }

    const shouldKeepCurrent =
      current &&
      current.name !== topName &&
      topScore < Math.max(currentScore + HEURISTIC_SWITCH_MARGIN, 2);

    const name = shouldKeepCurrent ? current.name : topName;
    const score = shouldKeepCurrent ? Math.max(currentScore, current.evidenceCount) : topScore;
    const runnerUpScore = shouldKeepCurrent
      ? Math.max(topScore, ranked.find(([candidateName]) => candidateName !== name)?.[1] ?? 0)
      : ranked[1]?.[1] ?? currentScore;

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

  const tokens = normalized.split(" ");
  const primaryToken = tokens[0]?.toLowerCase();
  if (!primaryToken || NAME_STOPWORDS.has(primaryToken) || NON_NAME_FIRST_TOKENS.has(primaryToken)) {
    return null;
  }

  if (tokens.some((token) => NON_NAME_TOKENS.has(token.toLowerCase()))) {
    return null;
  }

  if (normalized.length < 2) {
    return null;
  }

  return normalized;
}
