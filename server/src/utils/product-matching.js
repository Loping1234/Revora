const ignoredProductTokens = new Set(["the", "and", "for", "with", "product", "item", "set", "mini", "pro", "plus"]);

export function normalizeProductKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function levenshteinDistance(left, right) {
  const a = normalizeProductKey(left);
  const b = normalizeProductKey(right);
  if (!a || !b) return Math.max(a.length, b.length);
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[a.length][b.length];
}

export function similarityScore(left, right) {
  const length = Math.max(normalizeProductKey(left).length, normalizeProductKey(right).length);
  if (!length) return 0;
  return 1 - levenshteinDistance(left, right) / length;
}

export function productTokens(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !ignoredProductTokens.has(token));
}

export function sharedTokens(left, right) {
  const leftTokens = new Set(productTokens(left));
  const rightTokens = new Set(productTokens(right));
  return [...leftTokens].filter((token) => rightTokens.has(token));
}

export function tokenOverlap(left, right) {
  const leftTokens = new Set(productTokens(left));
  const rightTokens = new Set(productTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  return sharedTokens(left, right).length / Math.max(leftTokens.size, rightTokens.size);
}

export function priceRangeScore(left, right) {
  const leftPrice = Number(left?.basePrice);
  const rightPrice = Number(right?.basePrice);
  if (!Number.isFinite(leftPrice) || !Number.isFinite(rightPrice) || leftPrice <= 0 || rightPrice <= 0) return 0;
  const gap = Math.abs(leftPrice - rightPrice) / Math.max(leftPrice, rightPrice);
  if (gap <= 0.1) return 1;
  if (gap <= 0.3) return 0.6;
  return 0;
}

export function getDuplicateEvidence(left, right) {
  const sameCategory = normalizeProductKey(left.category) === normalizeProductKey(right.category);
  if (!sameCategory) return null;

  const nameScore = similarityScore(left.name, right.name);
  const skuScore = similarityScore(left.sku, right.sku);
  const aliasScore = Math.max(
    0,
    ...(left.aliases || []).flatMap((leftAlias) => (right.aliases || []).map((rightAlias) => similarityScore(leftAlias, rightAlias)))
  );
  const overlap = Math.max(
    tokenOverlap(left.name, right.name),
    ...(left.aliases || []).flatMap((leftAlias) => (right.aliases || []).map((rightAlias) => tokenOverlap(leftAlias, rightAlias)))
  );
  const sharedNameTokens = [
    ...new Set([
      ...sharedTokens(left.name, right.name),
      ...(left.aliases || []).flatMap((leftAlias) => (right.aliases || []).flatMap((rightAlias) => sharedTokens(leftAlias, rightAlias)))
    ])
  ];
  const exactIdentityMatch = Boolean(
    normalizeProductKey(left.sku) &&
    normalizeProductKey(left.sku) === normalizeProductKey(right.sku)
  ) || (left.externalProductIds || []).some((id) => (right.externalProductIds || []).includes(id));
  const textScore = Math.max(nameScore, aliasScore);
  const priceScore = priceRangeScore(left, right);
  const needsManualReview = textScore >= 0.94 && overlap >= 0.85 && sharedNameTokens.length > 0;

  if (!exactIdentityMatch && !needsManualReview) return null;

  return {
    exactIdentityMatch,
    textScore,
    skuScore,
    overlap,
    priceScore,
    sharedNameTokens,
    reviewScore: exactIdentityMatch ? 1 : Math.min(textScore, overlap)
  };
}
