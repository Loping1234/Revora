const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const API_KEY = import.meta.env.VITE_API_KEY || "";
const SESSION_KEY = "dp_di_session";

let authToken = "";

function notifySessionExpired(message = "Your session expired. Please log in again.") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dp-di-session-expired", { detail: { message } }));
  }
}

export function getStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");

    if (session?.expiresAt && Date.now() >= Number(session.expiresAt)) {
      setStoredSession(null);
      notifySessionExpired();
      return null;
    }

    authToken = session?.token || "";
    return session;
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  authToken = session?.token || "";

  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function apiHeaders(extraHeaders = {}) {
  getStoredSession();

  return {
    ...extraHeaders,
    ...(API_KEY ? { "x-api-key": API_KEY } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };
}

async function readPayload(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return null;
}

async function assertOk(response, fallbackMessage) {
  if (response.ok) return readPayload(response);

  const payload = await readPayload(response);
  const message = payload?.error?.message || fallbackMessage || `Request failed with status ${response.status}`;

  if (response.status === 401) {
    setStoredSession(null);
    notifySessionExpired(message);
  }

  const error = new Error(response.status === 403 ? `Permission denied: ${message}` : message);
  error.status = response.status;
  throw error;
}

export async function login({ role, password }) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ role, password })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Login failed with status ${response.status}`);
  }

  const session = {
    token: payload.data.token,
    user: payload.data.user,
    expiresAt: payload.data.expiresAt
  };
  setStoredSession(session);

  return session;
}

export async function validateSession() {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: apiHeaders()
  });
  const payload = await assertOk(response, `Session check failed with status ${response.status}`);
  const session = {
    token: payload.data.token,
    user: payload.data.user,
    expiresAt: payload.data.expiresAt
  };
  setStoredSession(session);
  return session;
}

export async function getHealthStatus() {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  return response.json();
}

export async function getProducts() {
  const response = await fetch(`${API_BASE_URL}/products`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Products request failed with status ${response.status}`);
}

export async function uploadSalesCsv(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload/sales/stage`, {
    method: "POST",
    headers: apiHeaders(),
    body: formData
  });
  const payload = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      setStoredSession(null);
      notifySessionExpired(payload?.error?.message);
    }
    const error = new Error(payload?.error?.message || `Upload failed with status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function previewSalesCsv(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload/sales/preview`, {
    method: "POST",
    headers: apiHeaders(),
    body: formData
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Preview failed with status ${response.status}`);
  }

  return payload;
}

export async function getImportBatchReview(importBatchId) {
  const response = await fetch(`${API_BASE_URL}/upload/sales/batches/${importBatchId}/review`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Import review failed with status ${response.status}`);
}

export async function commitImportBatch(importBatchId) {
  const response = await fetch(`${API_BASE_URL}/upload/sales/batches/${importBatchId}/commit`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ confirm: "COMMIT" })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Commit failed with status ${response.status}`);
  }

  return payload;
}

export async function rejectImportBatch(importBatchId) {
  const response = await fetch(`${API_BASE_URL}/upload/sales/batches/${importBatchId}/reject`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ confirm: "REJECT" })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Reject failed with status ${response.status}`);
  }

  return payload;
}

export async function rollbackImportBatch(importBatchId) {
  const response = await fetch(`${API_BASE_URL}/upload/sales/batches/${importBatchId}/rollback`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ confirm: "ROLLBACK" })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Rollback failed with status ${response.status}`);
  }

  return payload;
}

export async function fitDemandModel({ productId, segment }) {
  const response = await fetch(`${API_BASE_URL}/fit-model`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ productId, segment })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Model fit failed with status ${response.status}`);
  }

  return payload;
}

export async function simulatePrice({ productId, segment, price, competitorPrice }) {
  const response = await fetch(`${API_BASE_URL}/simulate`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ productId, segment, price, competitorPrice })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Simulation failed with status ${response.status}`);
  }

  return payload;
}

export async function createRecommendation({ productId, segment, objective, minPrice, maxPrice, step, competitorPrice }) {
  const response = await fetch(`${API_BASE_URL}/recommendations`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ productId, segment, objective, minPrice, maxPrice, step, competitorPrice })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Recommendation failed with status ${response.status}`);
  }

  return payload;
}

export async function getRecommendations() {
  const response = await fetch(`${API_BASE_URL}/recommendations`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Recommendation history failed with status ${response.status}`);
}

export async function applyRecommendation({ recommendationId, appliedPrice, startDate, endDate, expectedTarget }) {
  const response = await fetch(`${API_BASE_URL}/recommendations/${recommendationId}/apply`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ appliedPrice, startDate, endDate, expectedTarget })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Apply recommendation failed with status ${response.status}`);
  }

  return payload;
}

export async function getRecommendationPerformance() {
  const response = await fetch(`${API_BASE_URL}/analytics/recommendation-performance`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Recommendation performance failed with status ${response.status}`);
  }

  return response.json();
}

export async function getProductDuplicates() {
  const response = await fetch(`${API_BASE_URL}/products/duplicates`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Product duplicate request failed with status ${response.status}`);
}

export async function mergeProducts({ masterProductId, duplicateProductId }) {
  const response = await fetch(`${API_BASE_URL}/products/merge`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ masterProductId, duplicateProductId })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Product merge failed with status ${response.status}`);
  }

  return payload;
}

export async function getDashboardSummary() {
  const response = await fetch(`${API_BASE_URL}/analytics/dashboard`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Dashboard request failed with status ${response.status}`);
}

export async function getInsightReadiness() {
  const response = await fetch(`${API_BASE_URL}/analytics/insight-readiness`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Insight readiness request failed with status ${response.status}`);
}

export async function getDataQualitySummary() {
  const response = await fetch(`${API_BASE_URL}/analytics/data-quality`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Data quality request failed with status ${response.status}`);
}

export async function setActiveImportBatch(importBatchId) {
  const response = await fetch(`${API_BASE_URL}/analytics/active-import-batch`, {
    method: "PUT",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ importBatchId })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Active import batch update failed with status ${response.status}`);
  }

  return payload;
}

export async function getProductIntelligence() {
  const response = await fetch(`${API_BASE_URL}/analytics/product-intelligence`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Product intelligence request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getCustomerSegments() {
  const response = await fetch(`${API_BASE_URL}/analytics/customer-segments`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Customer segment request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getCompetitorMarket() {
  const response = await fetch(`${API_BASE_URL}/analytics/competitor-market`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Competitor market request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getSeasonalitySummary() {
  const response = await fetch(`${API_BASE_URL}/analytics/seasonality`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Seasonality request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getProductRelationships() {
  const response = await fetch(`${API_BASE_URL}/analytics/product-relationships`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Product relationships request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getMlDecisionSummary() {
  const response = await fetch(`${API_BASE_URL}/ml/decision-quality/summary`, {
    headers: apiHeaders()
  });

  return assertOk(response, `ML decision summary failed with status ${response.status}`);
}

export async function getAssistantDecisions(limit = 25) {
  const url = new URL(`${API_BASE_URL}/assistant/decisions`);
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, {
    headers: apiHeaders()
  });

  return assertOk(response, `Assistant decision history failed with status ${response.status}`);
}

export async function getAssistantOpening() {
  const response = await fetch(`${API_BASE_URL}/assistant/opening`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Assistant opening failed with status ${response.status}`);
}

export async function parseAssistantDecision(message, existingDraft = null, options = {}) {
  const response = await fetch(`${API_BASE_URL}/assistant/parse-decision`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ message, existingDraft, ...options })
  });

  return assertOk(response, `Assistant decision parse failed with status ${response.status}`);
}

export async function confirmAssistantDecision(draftData) {
  const response = await fetch(`${API_BASE_URL}/assistant/confirm`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ draftData })
  });

  return assertOk(response, `Assistant decision confirmation failed with status ${response.status}`);
}

export async function getUnresolvedAssistantDecision() {
  const response = await fetch(`${API_BASE_URL}/assistant/unresolved`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Fetching unresolved decision failed with status ${response.status}`);
}

export async function resolveAssistantDecision(id, outcome) {
  const response = await fetch(`${API_BASE_URL}/assistant/resolve/${id}`, {
    method: "PUT",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ outcome })
  });

  return assertOk(response, `Resolving decision failed with status ${response.status}`);
}

export async function predictMlDecisionQuality(decision) {
  const response = await fetch(`${API_BASE_URL}/ml/decision-quality/predict`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(decision)
  });

  return assertOk(response, `ML decision prediction failed with status ${response.status}`);
}

export async function compareModels({ productId, segment = "all" }) {
  const url = new URL(`${API_BASE_URL}/models/compare`);
  url.searchParams.set("productId", productId);
  url.searchParams.set("segment", segment);

  const response = await fetch(url, {
    headers: apiHeaders()
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Model comparison failed with status ${response.status}`);
  }

  return payload;
}

export async function planScenarios({ productId, segment, prices, competitorPrice }) {
  const response = await fetch(`${API_BASE_URL}/analytics/scenario-planner`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ productId, segment, prices, competitorPrice })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Scenario planner failed with status ${response.status}`);
  }

  return payload;
}

export async function resetWorkspaceData() {
  const response = await fetch(`${API_BASE_URL}/admin/reset-data`, {
    method: "POST",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({ confirm: "RESET" })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Reset failed with status ${response.status}`);
  }

  return payload;
}

export async function getWorkspaceSettings() {
  const response = await fetch(`${API_BASE_URL}/settings`, {
    headers: apiHeaders()
  });

  return assertOk(response, `Settings request failed with status ${response.status}`);
}

export async function getAuditLogs(limit = 100) {
  const url = new URL(`${API_BASE_URL}/audit-logs`);
  url.searchParams.set("limit", String(limit));
  const response = await fetch(url, {
    headers: apiHeaders()
  });

  return assertOk(response, `Audit trail request failed with status ${response.status}`);
}

export async function updateWorkspaceSettings(settings) {
  const response = await fetch(`${API_BASE_URL}/settings`, {
    method: "PUT",
    headers: apiHeaders({
      "Content-Type": "application/json"
    }),
    body: JSON.stringify(settings)
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Settings update failed with status ${response.status}`);
  }

  return payload;
}

export async function downloadRecommendationReport() {
  const response = await fetch(`${API_BASE_URL}/reports/recommendations.csv`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Report download failed with status ${response.status}`);
  }

  return response.blob();
}

const reportPaths = {
  dashboard: "dashboard.xlsx",
  products: "products.xlsx",
  salesData: "sales-data.xlsx",
  pricingInsights: "pricing-insights.xlsx",
  recommendations: "recommendations.xlsx",
  recommendationHistory: "recommendation-history.xlsx",
  examinerWorkbook: "examiner-workbook.xlsx",
  importSummary: "import-summary.xlsx"
};

export async function downloadReport(reportType, params = {}) {
  const path = reportPaths[reportType];

  if (!path) {
    throw new Error("Unknown report type");
  }

  const url = new URL(`${API_BASE_URL}/reports/${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Report download failed with status ${response.status}`);
  }

  return response.blob();
}

export { API_BASE_URL };
