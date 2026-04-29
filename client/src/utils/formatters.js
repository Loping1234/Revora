export function formatCurrency(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(2)}`;
  }
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function formatSegmentName(segment) {
  if (segment === "all") return "All customers";
  if (String(segment || "").toLowerCase() === "b2b") return "B2B";

  return String(segment || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function getPriceSensitivityLabel(model) {
  if (!model) return "Not measured";
  const value = Math.abs(model.b);
  if (value >= 5) return "High";
  if (value >= 3) return "Moderate";
  return "Low";
}

export function getConfidenceLabel(model) {
  if (!model) return "Not measured";
  if (model.modelReliabilityLabel) return model.modelReliabilityLabel;
  if (model.reliabilityLabel) return model.reliabilityLabel;
  if (model.rSquared >= 0.7) return "Strong";
  if (model.rSquared >= 0.35) return "Usable";
  return "Weak";
}
