const CANONICAL_LABEL_OVERRIDES: Record<string, string> = {
  "super base": "Supabase",
  superbase: "Supabase",
  "supa base": "Supabase",
  "supa bass": "Supabase",
  supabase: "Supabase",
  gcp: "Google Cloud",
  "g c p": "Google Cloud",
  "google cloud platform": "Google Cloud",
  "cloud run": "Cloud Run",
  cloudrun: "Cloud Run",
  postgres: "Postgres",
  postgress: "Postgres",
  postgresql: "Postgres",
};

export function canonicalizeGraphLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    return trimmed;
  }

  const override = CANONICAL_LABEL_OVERRIDES[normalizeRawLabel(trimmed)];
  return override ?? trimmed;
}

export function normalizeGraphLabel(label: string) {
  return normalizeRawLabel(canonicalizeGraphLabel(label));
}

export function slugifyGraphId(label: string) {
  return normalizeGraphLabel(label).replace(/\s+/g, "-");
}

export function getCanonicalAliasEntries() {
  return Object.entries(CANONICAL_LABEL_OVERRIDES).map(([spoken, canonical]) => ({
    spoken,
    canonical,
  }));
}

function normalizeRawLabel(label: string) {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
