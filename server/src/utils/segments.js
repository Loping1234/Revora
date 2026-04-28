function compactSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeSegmentValue(value) {
  const raw = String(value || "").trim();
  const compact = compactSegment(raw || "Retail");
  const key = compact.replace(/\s+/g, "-") || "retail";
  const aliases = {
    b2b: { key: "b2b", label: "B2B" },
    business: { key: "b2b", label: "B2B" },
    enterprise: { key: "b2b", label: "B2B" },
    wholesale: { key: "b2b", label: "B2B" },
    retail: { key: "retail", label: "Retail" },
    standard: { key: "retail", label: "Retail" },
    premium: { key: "premium", label: "Premium" },
    vip: { key: "premium", label: "Premium" }
  };

  if (aliases[key]) return aliases[key];

  return {
    key,
    label: raw.toUpperCase() === raw && raw.length <= 4 ? raw : titleCase(raw || key)
  };
}

export function formatSegmentLabel(segment) {
  if (segment === "all") return "All customers";
  return normalizeSegmentValue(segment).label;
}

export function isValidSegment(segment) {
  return segment === "all" || /^[a-z0-9][a-z0-9-]{0,63}$/.test(String(segment || ""));
}
