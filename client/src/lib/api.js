const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
const API_KEY = import.meta.env.VITE_API_KEY || "";
const SESSION_KEY = "dp_di_session";

let authToken = "";

export function getStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
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
  return {
    ...extraHeaders,
    ...(API_KEY ? { "x-api-key": API_KEY } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };
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
    user: payload.data.user
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
  const response = await fetch(`${API_BASE_URL}/products`);

  if (!response.ok) {
    throw new Error(`Products request failed with status ${response.status}`);
  }

  return response.json();
}

export async function uploadSalesCsv(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/upload/sales`, {
    method: "POST",
    headers: apiHeaders(),
    body: formData
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Upload failed with status ${response.status}`);
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

  if (!response.ok) {
    throw new Error(`Recommendation history failed with status ${response.status}`);
  }

  return response.json();
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
  const response = await fetch(`${API_BASE_URL}/products/duplicates`);

  if (!response.ok) {
    throw new Error(`Product duplicate request failed with status ${response.status}`);
  }

  return response.json();
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

  if (!response.ok) {
    throw new Error(`Dashboard request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getInsightReadiness() {
  const response = await fetch(`${API_BASE_URL}/analytics/insight-readiness`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Insight readiness request failed with status ${response.status}`);
  }

  return response.json();
}

export async function getDataQualitySummary() {
  const response = await fetch(`${API_BASE_URL}/analytics/data-quality`, {
    headers: apiHeaders()
  });

  if (!response.ok) {
    throw new Error(`Data quality request failed with status ${response.status}`);
  }

  return response.json();
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

  if (!response.ok) {
    throw new Error(`Settings request failed with status ${response.status}`);
  }

  return response.json();
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
