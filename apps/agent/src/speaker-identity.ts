import { slugifyGraphId } from "@copilot/graph";
import type { SessionState, SpeakerProfile, TranscriptChunk } from "@copilot/shared";
import { getSpeakerProfileSourceSpeakerIds } from "@copilot/shared";

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

type LoggerApi = Pick<Console, "log">;

interface InferSpeakerProfileOptions {
  debug?: boolean;
  logger?: LoggerApi;
}

interface WorkingSpeakerProfile extends SpeakerProfile {
  sourceSpeakerIds: string[];
}

const DEFAULT_LOGGER: LoggerApi = {
  log: (...args) => console.log(...args),
};

export function inferSpeakerProfileUpdates(
  state: SessionState,
  options: InferSpeakerProfileOptions = {},
): SpeakerProfile[] {
  const currentProfiles = new Map(
    state.speakerProfiles.map((profile) => [profile.speakerId, profile]),
  );
  const recomputedProfiles = computeSpeakerProfiles(state.transcript, currentProfiles, options);

  return recomputedProfiles.filter((profile) => {
    const current = currentProfiles.get(profile.speakerId);
    return (
      !current ||
      current.name !== profile.name ||
      current.confidence !== profile.confidence ||
      current.evidenceCount !== profile.evidenceCount ||
      !sameSourceSpeakerIds(current.sourceSpeakerIds, profile.sourceSpeakerIds)
    );
  });
}

function computeSpeakerProfiles(
  transcript: TranscriptChunk[],
  currentProfiles: Map<string, SpeakerProfile>,
  options: InferSpeakerProfileOptions,
): SpeakerProfile[] {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const profiles = new Map<string, WorkingSpeakerProfile>();
  const canonicalIdByName = new Map<string, string>();
  const rawSpeakerToCanonicalId = new Map<string, string>();
  const directEvidence = new Map<string, number>();
  const heuristicEvidence = new Map<string, number>();

  for (const profile of currentProfiles.values()) {
    const cloned = cloneProfile(profile);
    profiles.set(cloned.speakerId, cloned);

    const normalizedName = normalizeName(cloned.name);
    if (normalizedName && !canonicalIdByName.has(normalizedName)) {
      canonicalIdByName.set(normalizedName, cloned.speakerId);
    }

    for (const rawSpeakerId of cloned.sourceSpeakerIds) {
      rawSpeakerToCanonicalId.set(rawSpeakerId, cloned.speakerId);
    }
  }

  for (let index = 0; index < transcript.length; index += 1) {
    const chunk = transcript[index];
    const directNames = extractSelfIdentifiedNames(chunk.text);

    for (const name of directNames) {
      const normalizedName = normalizeName(name);
      if (!normalizedName) {
        continue;
      }

      const currentlyMappedCanonicalId = rawSpeakerToCanonicalId.get(chunk.speaker);
      const currentlyMappedProfile = currentlyMappedCanonicalId
        ? profiles.get(currentlyMappedCanonicalId) ?? null
        : null;
      const currentlyMappedName = currentlyMappedProfile
        ? normalizeName(currentlyMappedProfile.name)
        : null;

      if (
        currentlyMappedProfile &&
        currentlyMappedProfile.confidence === "high" &&
        currentlyMappedName &&
        currentlyMappedName !== normalizedName
      ) {
        debugLog(options, logger, "ignore-direct-conflict", {
          rawSpeakerId: chunk.speaker,
          currentCanonicalId: currentlyMappedProfile.speakerId,
          currentName: currentlyMappedProfile.name,
          ignoredName: name,
        });
        continue;
      }

      const canonicalId = ensureCanonicalProfile(name, profiles, canonicalIdByName);
      if (!canonicalId) {
        continue;
      }

      const profile = profiles.get(canonicalId);
      if (!profile) {
        continue;
      }

      const attached = attachSourceSpeakerId(profile, chunk.speaker);
      rawSpeakerToCanonicalId.set(chunk.speaker, canonicalId);
      addEvidence(directEvidence, canonicalId, DIRECT_IDENTITY_WEIGHT);

      debugLog(options, logger, "direct-self-id", {
        rawSpeakerId: chunk.speaker,
        canonicalId,
        name: profile.name,
        attachedNewRawSpeakerId: attached,
      });
    }

    const previous = transcript[index - 1];
    if (!previous || previous.speaker === chunk.speaker) {
      continue;
    }

    if (chunk.timestamp - previous.timestamp > RESPONSE_WINDOW_SECONDS) {
      continue;
    }

    const addressedNames = extractAddressedNames(previous.text);
    if (addressedNames.length !== 1) {
      continue;
    }

    const canonicalId = rawSpeakerToCanonicalId.get(chunk.speaker);
    if (!canonicalId) {
      continue;
    }

    const profile = profiles.get(canonicalId);
    const normalizedAddressedName = normalizeName(addressedNames[0]);
    if (!profile || !normalizedAddressedName) {
      continue;
    }

    if (normalizeName(profile.name) !== normalizedAddressedName) {
      continue;
    }

    addEvidence(heuristicEvidence, canonicalId, RESPONSE_TO_ADDRESS_WEIGHT);
    debugLog(options, logger, "heuristic-strengthen", {
      rawSpeakerId: chunk.speaker,
      canonicalId,
      name: profile.name,
      fromAddress: addressedNames[0],
    });
  }

  const nextProfiles: SpeakerProfile[] = [];
  const sortedProfiles = [...profiles.values()].sort((left, right) =>
    left.speakerId.localeCompare(right.speakerId),
  );

  for (const profile of sortedProfiles) {
    const current = currentProfiles.get(profile.speakerId);
    const score = Math.max(
      current?.evidenceCount ?? 0,
      (directEvidence.get(profile.speakerId) ?? 0) + (heuristicEvidence.get(profile.speakerId) ?? 0),
    );

    const confidence = resolveConfidence(current, directEvidence.get(profile.speakerId) ?? 0, score);
    nextProfiles.push({
      speakerId: profile.speakerId,
      name: profile.name,
      confidence,
      evidenceCount: score,
      sourceSpeakerIds: [...new Set(profile.sourceSpeakerIds)].sort(),
    });
  }

  return nextProfiles;
}

function cloneProfile(profile: SpeakerProfile): WorkingSpeakerProfile {
  return {
    ...profile,
    sourceSpeakerIds: [...new Set(getSpeakerProfileSourceSpeakerIds(profile))].sort(),
  };
}

function ensureCanonicalProfile(
  rawName: string,
  profiles: Map<string, WorkingSpeakerProfile>,
  canonicalIdByName: Map<string, string>,
) {
  const normalizedName = normalizeName(rawName);
  if (!normalizedName) {
    return null;
  }

  const existingCanonicalId = canonicalIdByName.get(normalizedName);
  if (existingCanonicalId) {
    return existingCanonicalId;
  }

  const canonicalId = slugifyGraphId(normalizedName);
  const dedupedCanonicalId = dedupeCanonicalId(canonicalId, profiles);
  const name = toDisplayName(normalizedName);

  profiles.set(dedupedCanonicalId, {
    speakerId: dedupedCanonicalId,
    name,
    confidence: "high",
    evidenceCount: DIRECT_IDENTITY_WEIGHT,
    sourceSpeakerIds: [],
  });
  canonicalIdByName.set(normalizedName, dedupedCanonicalId);
  return dedupedCanonicalId;
}

function dedupeCanonicalId(baseId: string, profiles: Map<string, WorkingSpeakerProfile>) {
  if (!profiles.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (profiles.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
}

function attachSourceSpeakerId(profile: WorkingSpeakerProfile, rawSpeakerId: string) {
  if (profile.sourceSpeakerIds.includes(rawSpeakerId)) {
    return false;
  }

  profile.sourceSpeakerIds.push(rawSpeakerId);
  profile.sourceSpeakerIds.sort();
  return true;
}

function resolveConfidence(
  current: SpeakerProfile | undefined,
  directScore: number,
  totalScore: number,
): SpeakerProfile["confidence"] {
  if (directScore >= DIRECT_IDENTITY_WEIGHT) {
    return "high";
  }

  if (current?.confidence === "high") {
    return "high";
  }

  if (current?.confidence === "medium" && totalScore >= current.evidenceCount) {
    return "medium";
  }

  if (totalScore >= 2) {
    return "medium";
  }

  return current?.confidence ?? "low";
}

function addEvidence(target: Map<string, number>, canonicalId: string, weight: number) {
  target.set(canonicalId, (target.get(canonicalId) ?? 0) + weight);
}

function sameSourceSpeakerIds(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
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

function toDisplayName(normalizedName: string) {
  return normalizedName
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function debugLog(
  options: InferSpeakerProfileOptions,
  logger: LoggerApi,
  event: string,
  fields: Record<string, unknown>,
) {
  if (!options.debug) {
    return;
  }

  logger.log(`[SpeakerIdentity] ${event} ${JSON.stringify(fields)}`);
}
