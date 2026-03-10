import type { SpeakerProfile } from "./schemas.js";

export function getSpeakerProfileSourceSpeakerIds(profile: SpeakerProfile) {
  return profile.sourceSpeakerIds.length ? profile.sourceSpeakerIds : [profile.speakerId];
}

export function resolveSpeakerProfile(
  profiles: SpeakerProfile[],
  rawSpeakerId: string,
) {
  return profiles.find((profile) => getSpeakerProfileSourceSpeakerIds(profile).includes(rawSpeakerId)) ?? null;
}

export function resolveSpeakerDisplayName(
  profiles: SpeakerProfile[],
  rawSpeakerId: string,
) {
  return resolveSpeakerProfile(profiles, rawSpeakerId)?.name ?? rawSpeakerId;
}

export function mergeSpeakerProfiles(
  currentProfiles: SpeakerProfile[],
  nextProfiles: SpeakerProfile[] | undefined,
) {
  if (!nextProfiles?.length) {
    return currentProfiles;
  }

  const merged = new Map(currentProfiles.map((profile) => [profile.speakerId, profile]));

  for (const incoming of nextProfiles) {
    const existing = merged.get(incoming.speakerId);
    if (!existing) {
      merged.set(incoming.speakerId, incoming);
      continue;
    }

    merged.set(incoming.speakerId, {
      ...existing,
      ...incoming,
      evidenceCount: Math.max(existing.evidenceCount, incoming.evidenceCount),
      sourceSpeakerIds: [...new Set([
        ...getSpeakerProfileSourceSpeakerIds(existing),
        ...getSpeakerProfileSourceSpeakerIds(incoming),
      ])].sort(),
    });
  }

  return [...merged.values()].sort((left, right) => left.speakerId.localeCompare(right.speakerId));
}
