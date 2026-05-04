import fs from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { spawn } from "child_process";

const ROOT_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const ML_OUTPUT_DIR = path.join(ROOT_DIR, "generated", "ml");
const ML_PREDICT_SCRIPT = path.join(ROOT_DIR, "scripts", "ml_decision_predict.py");
const REQUIRED_DECISION_FIELDS = [
  "currentPrice",
  "previousPrice",
  "quantitySold",
  "unitsBeforeChange",
  "revenueBeforeChange",
  "profitBeforeChange"
];

async function readJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readFeatureImportance(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => {
        const [feature, importance] = line.split(",");
        return {
          feature,
          importance: Number(importance || 0)
        };
      })
      .filter((item) => item.feature);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function fredWarnings(statuses = {}) {
  return Object.entries(statuses)
    .filter(([, status]) => status !== "loaded_from_cache" && status !== "fetched")
    .map(([seriesId, status]) => `${seriesId}: ${status}`);
}

export async function getMlDecisionQualitySummary() {
  const profilePath = path.join(ML_OUTPUT_DIR, "pricing_decision_dataset_profile.json");
  const metricsPath = path.join(ML_OUTPUT_DIR, "decision_quality_metrics.json");
  const importancePath = path.join(ML_OUTPUT_DIR, "decision_quality_feature_importance.csv");
  const modelPath = path.join(ML_OUTPUT_DIR, "decision_quality_model.joblib");

  const [profile, metrics, featureImportance] = await Promise.all([
    readJsonFile(profilePath),
    readJsonFile(metricsPath),
    readFeatureImportance(importancePath)
  ]);

  if (!profile || !metrics) {
    return {
      available: false,
      statusLabel: "ML model not trained",
      message: "Run npm run ml:train to generate the offline decision-quality assistant.",
      outputFolder: ML_OUTPUT_DIR,
      expectedFiles: [
        "pricing_decision_training_dataset.csv",
        "pricing_decision_dataset_profile.json",
        "decision_quality_model.joblib",
        "decision_quality_metrics.json",
        "decision_quality_feature_importance.csv"
      ]
    };
  }

  const modelFile = await fs.stat(modelPath).catch(() => null);
  const macroWarnings = fredWarnings(profile.fred_series_status);

  return {
    available: true,
    statusLabel: metrics.usefulness?.useful ? "ML assistant trained" : "ML assistant needs review",
    message: metrics.usefulness?.reason || "Offline ML decision-quality artifact is available.",
    outputFolder: ML_OUTPUT_DIR,
    generatedAt: metrics.created_at || profile.created_at || null,
    modelFile: {
      path: modelPath,
      sizeBytes: modelFile?.size || 0,
      artifactFormat: metrics.artifact_format || "unknown"
    },
    dataset: {
      rowCount: metrics.row_count || profile.rows || 0,
      trainRows: metrics.train_rows || 0,
      testRows: metrics.test_rows || 0,
      labelDistribution: metrics.label_distribution || profile.label_distribution || {},
      sourceCounts: profile.source_counts || {},
      supplementalContext: profile.supplemental_context || {}
    },
    model: {
      implementation: metrics.model_implementation || "Unknown",
      accuracy: metrics.model?.accuracy ?? null,
      macroF1: metrics.model?.macro_f1 ?? null,
      modelBeatsMajorityBaseline: Boolean(metrics.model_beats_majority_baseline),
      modelBeatsSimpleProfitRule: Boolean(metrics.model_beats_simple_profit_lift_rule),
      macroF1LiftVsMajority: metrics.usefulness?.macro_f1_lift_vs_majority ?? null,
      macroF1LiftVsSimpleProfitRule: metrics.usefulness?.macro_f1_lift_vs_simple_profit_rule ?? null,
      perClass: metrics.model?.per_class || {},
      confusionMatrix: metrics.model?.confusion_matrix || null
    },
    baselines: metrics.baselines || {},
    featureImportance: featureImportance.slice(0, 12),
    macroData: {
      fredSeriesStatus: profile.fred_series_status || {},
      warnings: macroWarnings
    },
    warnings: [
      metrics.warning,
      "This ML artifact is advisory only. It does not replace the current explainable pricing engine.",
      ...(macroWarnings.length ? ["FRED macro data is not fully populated. Add FRED_API_KEY and rerun npm run ml:train for macro enrichment."] : [])
    ].filter(Boolean)
  };
}

function parseRequiredNumber(payload, field, label, { positive = false, min = null } = {}) {
  const value = Number(payload?.[field]);

  if (!Number.isFinite(value)) {
    const error = new Error(`${label} must be a valid number.`);
    error.statusCode = 400;
    throw error;
  }

  if (positive && value <= 0) {
    const error = new Error(`${label} must be greater than zero.`);
    error.statusCode = 400;
    throw error;
  }

  if (min !== null && value < min) {
    const error = new Error(`${label} must be at least ${min}.`);
    error.statusCode = 400;
    throw error;
  }

  return value;
}

function optionalNumber(payload, field) {
  if (payload?.[field] === undefined || payload?.[field] === null || payload?.[field] === "") return "";
  const value = Number(payload[field]);
  return Number.isFinite(value) ? value : "";
}

async function assertPredictionReady() {
  const [modelFile, scriptFile] = await Promise.all([
    fs.stat(path.join(ML_OUTPUT_DIR, "decision_quality_model.joblib")).catch(() => null),
    fs.stat(ML_PREDICT_SCRIPT).catch(() => null)
  ]);

  if (!modelFile) {
    const error = new Error("ML model artifact is missing. Run npm run ml:train first.");
    error.statusCode = 409;
    throw error;
  }

  if (!scriptFile) {
    const error = new Error("ML prediction script is missing.");
    error.statusCode = 500;
    throw error;
  }
}

function validateDecisionPayload(payload = {}) {
  for (const field of REQUIRED_DECISION_FIELDS) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      const error = new Error("Fill all required decision tester fields before predicting.");
      error.statusCode = 400;
      throw error;
    }
  }

  const currentPrice = parseRequiredNumber(payload, "currentPrice", "Current price", { positive: true });
  const previousPrice = parseRequiredNumber(payload, "previousPrice", "Previous price", { positive: true });
  const quantitySold = parseRequiredNumber(payload, "quantitySold", "Quantity sold", { min: 0 });
  const unitsBeforeChange = parseRequiredNumber(payload, "unitsBeforeChange", "Units before change", { min: 0 });
  const revenueBeforeChange = parseRequiredNumber(payload, "revenueBeforeChange", "Revenue before change", { min: 0 });
  const profitBeforeChange = parseRequiredNumber(payload, "profitBeforeChange", "Profit before change");

  return {
    currentPrice,
    previousPrice,
    quantitySold,
    unitsBeforeChange,
    revenueBeforeChange,
    profitBeforeChange,
    competitorPrice: optionalNumber(payload, "competitorPrice"),
    discountPercent: optionalNumber(payload, "discountPercent"),
    inventoryLevel: optionalNumber(payload, "inventoryLevel"),
    holidayFlag: Boolean(payload.holidayFlag),
    category: String(payload.category || "Unknown"),
    customerSegment: String(payload.customerSegment || "Unknown"),
    region: String(payload.region || "Unknown")
  };
}

function runPythonPrediction(payload) {
  return new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || "python";
    const child = spawn(pythonBin, [ML_PREDICT_SCRIPT], {
      cwd: ROOT_DIR,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      const error = new Error("ML prediction timed out. Try again after confirming Python and the model artifact are available.");
      error.statusCode = 504;
      reject(error);
    }, 15000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      const wrapped = new Error(`Python could not start for ML prediction: ${error.message}`);
      wrapped.statusCode = 500;
      reject(wrapped);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        const error = new Error(stderr.trim() || `ML prediction failed with exit code ${code}.`);
        error.statusCode = 500;
        reject(error);
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        const error = new Error("ML prediction returned unreadable output.");
        error.statusCode = 500;
        reject(error);
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function explanationForPrediction(label, confidence) {
  const confidenceLabel = confidence >= 0.75 ? "strong" : confidence >= 0.5 ? "moderate" : "low";
  return `The ML assistant classifies this pricing decision as ${label} with ${confidenceLabel} confidence based on patterns learned from historical price-change outcomes. Use this as a second opinion beside the explainable Math Space result.`;
}

export async function predictMlDecisionQuality(payload) {
  await assertPredictionReady();
  const normalized = validateDecisionPayload(payload);
  const prediction = await runPythonPrediction(normalized);
  const summary = await getMlDecisionQualitySummary();

  return {
    ...prediction,
    confidencePercent: Math.round(Number(prediction.confidence || 0) * 1000) / 10,
    businessExplanation: explanationForPrediction(prediction.predictedLabel, Number(prediction.confidence || 0)),
    topInfluencingSignals: (summary.featureImportance || []).slice(0, 5),
    warning: "Advisory ML signal only. Do not use it as an autonomous price change approval.",
    input: normalized
  };
}
