export function getReadinessStyles(status) {
  if (status === "Ready") return "bg-emerald-50 text-emerald-700";
  if (status === "Limited") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export function getReliabilityStyles(label) {
  if (label === "Strong" || label === "Recommended" || label === "recommended") return "bg-emerald-50 text-emerald-700";
  if (label === "Usable" || label === "Usable, not backtested" || label === "Use with caution" || label === "use_with_caution") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export function getResultModeStyles(mode) {
  if (mode === "Price Response Model") return "bg-emerald-50 text-emerald-700";
  if (mode === "Business Summary Only") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}
