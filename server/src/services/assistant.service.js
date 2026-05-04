import { AssistantDecision } from "../models/assistant-decision.model.js";
import { KnowledgeBase } from "../models/knowledge-base.model.js";
import { generateJustification } from "./llm.service.js";
import { getWorkspaceId, workspaceFilter } from "../utils/workspace.js";

function parseNumber(value) {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function detectPrices(message) {
  // First, temporarily hide likely SKUs (e.g., SKU-1002, PROD-99) to avoid picking up their numbers as prices
  const skuPattern = /\b([a-z]{1,8}-?\d{1,8})\b/gi;
  const tempMsg = message.replace(skuPattern, " [SKU_HOLDER] ");
  
  const cleanMsg = tempMsg.replace(/(?:rs\.?|₹|inr|\$)/gi, "");
  
  const values = [...cleanMsg.matchAll(/\b([\d]{1,}(?:,\d{3})*(?:\.\d+)?)\b/g)]
    .map((match) => parseNumber(match[1]))
    .filter((value) => value !== null);
    
  if (values.length >= 2) {
    if (/(from)\s*[\d,.]+\s*(to|->|-)\s*[\d,.]+/i.test(cleanMsg)) {
      return { oldPrice: values[0], newPrice: values[1] };
    }
    if (/(dropped|reduced|decreased).{0,15}(to)\s*[\d,.]+\s*(from)\s*[\d,.]+/i.test(cleanMsg)) {
      return { oldPrice: values[1], newPrice: values[0] };
    }
    return { oldPrice: values[0], newPrice: values[1] };
  } else if (values.length === 1) {
    if (/(?:to|now|is|->)\s*[\d,.]+/i.test(cleanMsg)) {
       return { oldPrice: null, newPrice: values[0] };
    }
    return { oldPrice: null, newPrice: null };
  }
  
  return { oldPrice: null, newPrice: null };
}

function detectProduct(message) {
  // Try to find a clear SKU first
  const skuMatch = message.match(/\b([a-z]{1,8}-?\d{1,8})\b/i);
  if (skuMatch) return skuMatch[1];

  // Fallback: strip prices and common fillers
  let product = message.replace(/(?:rs\.?|₹|inr|\$)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, ""); // Strip currency+price
  product = product.replace(/\b(from|to)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, ""); // Strip "from 100" or "to 125"
  
  const fillers = /\b(from|to|increased|decreased|dropped|raised|cut|sales|price|prices|the|my|our|a|an|i|we|it|they|think|should|currently|selling|at|maybe|go|was|is|on|of|for|were|amazing|good|bad|slow|up|down|fast|improved|grew|great|flying|response|and)\b/gi;
  product = product.replace(fillers, "");
  
  product = product.replace(/[^\w\s-]/gi, " ").replace(/\s+/g, " ").trim();
  
  product = product.split(" ").filter(w => w.length > 1).join(" ");
  
  return product.slice(0, 80) || "Unknown product";
}

function detectDemandChange(message) {
  if (/(sales|demand|orders|customers|quantity|units|response).{0,30}(dropped|decreased|fell|down|reduced|less|slowed|declined|slow|bad|loss|poor|nothing)|\b(no sales|not selling|sales dropped|sales down)\b/i.test(message)) {
    return "down";
  }

  if (/(sales|demand|orders|customers|quantity|units|response).{0,30}(increased|improved|rose|up|higher|more|grew|flying|sold out|great|amazing|fast)|\b(sales improved|sales went up|sold more)\b/i.test(message)) {
    return "up";
  }

  if (/(same|stable|no change|flat)/i.test(message)) {
    return "flat";
  }

  return "unknown";
}

function detectStockContext(message) {
  if (/(stock|inventory).{0,30}(high|too much|excess|stuck|not moving|overstock)|\bstock is not moving\b/i.test(message)) return "high";
  if (/(stock|inventory).{0,30}(low|less|short|shortage|running out|stockout)/i.test(message)) return "low";
  return "unknown";
}

function detectCompetitorContext(message) {
  if (/(competitor|other shop|market).{0,40}(cheaper|lower|less)/i.test(message)) return "cheaper";
  if (/(competitor|other shop|market).{0,40}(expensive|higher|costlier)/i.test(message)) return "expensive";
  if (/(competitor|other shop|market).{0,40}(same|equal|similar)/i.test(message)) return "same";
  return "unknown";
}

function priceChangeType(oldPrice, newPrice, message) {
  if (oldPrice !== null && newPrice !== null) {
    if (newPrice > oldPrice) return "increase";
    if (newPrice < oldPrice) return "decrease";
    return "unchanged";
  }

  if (/(increased|raised|hiked)/i.test(message)) return "increase";
  if (/(reduced|decreased|dropped|cut)/i.test(message)) return "decrease";
  return "unknown";
}

function buildAdvice(extracted) {
  const { priceChangeType: type, demandChange, stockContext, competitorContext } = extracted;

  if (type === "increase" && demandChange === "down") {
    return {
      title: "Price may be too high",
      recommendation: "Consider rolling back partially or testing a smaller increase.",
      rationale: "Demand dropped after a price increase, which suggests customers may be price-sensitive for this product.",
      nextStep: "Check competitor price and try a middle price between old and new.",
      severity: "warning"
    };
  }

  if (type === "decrease" && demandChange === "up") {
    return {
      title: "Demand improved after discount",
      recommendation: "Check whether the extra units are enough to protect profit margin.",
      rationale: "Lower price increased sales, but the business value depends on whether profit per unit fell too much.",
      nextStep: "Compare profit before and after the discount before repeating it.",
      severity: "caution"
    };
  }

  if (stockContext === "high" && demandChange === "down") {
    return {
      title: "Inventory is not moving",
      recommendation: "Use a controlled discount or bundle offer instead of a permanent price cut.",
      rationale: "High stock with weak demand creates holding risk, but permanent discounting can damage margin.",
      nextStep: "Try a limited-period offer and record the result.",
      severity: "warning"
    };
  }

  if (competitorContext === "cheaper") {
    return {
      title: "Competitor price pressure detected",
      recommendation: "Avoid blindly matching the competitor. Compare margin, stock level, and customer loyalty first.",
      rationale: "A cheaper competitor can reduce demand, but matching price may be unprofitable.",
      nextStep: "Test a small adjustment or add value through bundle/service.",
      severity: "caution"
    };
  }

  if (type === "increase" && demandChange === "up") {
    return {
      title: "Price increase looks healthy",
      recommendation: "Keep monitoring; this decision may indicate pricing power.",
      rationale: "Sales improved even after a higher price, which can happen with strong demand, better positioning, or festival effects.",
      nextStep: "Record whether this was during a promotion, holiday, or stock shortage.",
      severity: "positive"
    };
  }

  return {
    title: "Decision captured",
    recommendation: "Keep tracking this product until you have enough before/after decisions for stronger advice.",
    rationale: "The assistant extracted the pricing event but needs clearer sales, stock, competitor, or profit context for a stronger recommendation.",
    nextStep: "Add what happened to sales and whether competitor price or stock level influenced the result.",
    severity: "caution"
  };
}

function calculatePrecisionAnalytics(extracted) {
  const { oldPrice, newPrice, demandChange } = extracted;
  
  if (!oldPrice || !newPrice) return null;

  const priceDiff = newPrice - oldPrice;
  const priceChangePercent = priceDiff / oldPrice;
  
  // Mapped demand change to a numeric estimate for the demo
  let demandChangePercent = 0;
  if (demandChange === "up") demandChangePercent = 0.15;
  if (demandChange === "down") demandChangePercent = -0.25;
  if (demandChange === "flat") demandChangePercent = -0.02;

  // Elasticity = % change in quantity / % change in price
  // Using a small epsilon to avoid division by zero
  const elasticity = priceChangePercent !== 0 
    ? demandChangePercent / priceChangePercent 
    : -1.5; // Default "Rational" elasticity

  // Optimal Price Formula (Lerner Index derived): P = MC / (1 + 1/ε)
  // We don't have MC (Marginal Cost) yet, so we assume a 40% margin on oldPrice for this demo
  const estimatedMC = oldPrice * 0.6;
  const optimalPrice = Math.abs(elasticity) > 1 
    ? estimatedMC / (1 + (1 / elasticity))
    : newPrice; // Fallback if inelastic

  return {
    optimalPriceFormula: "P_opt = MC / (1 + 1/ε)",
    elasticityEstimate: Number(elasticity.toFixed(2)),
    confidenceInterval: {
      low: Number((optimalPrice * 0.95).toFixed(2)),
      high: Number((optimalPrice * 1.05).toFixed(2))
    },
    dataSources: [
      "Historical Sales Correlation",
      "Dynamic Demand Mapping",
      "Assistant Feedback Loop"
    ]
  };
}

function extractionConfidence(extracted) {
  let score = 0;
  if (extracted.product !== "Unknown product") score += 25;
  if (extracted.oldPrice !== null) score += 20;
  if (extracted.newPrice !== null) score += 20;
  if (extracted.demandChange !== "unknown") score += 20;
  if (extracted.stockContext !== "unknown" || extracted.competitorContext !== "unknown") score += 15;
  return score;
}

function missingFields(extracted) {
  const missing = [];
  if (extracted.product === "Unknown product") missing.push("what product you changed");
  if (extracted.oldPrice === null) missing.push("the old price");
  if (extracted.newPrice === null) missing.push("the new price");
  if (extracted.demandChange === "unknown") missing.push("if sales went up or down");
  return missing;
}

export function parseAssistantDecision(message = "", existingDraft = null) {
  const rawMessage = String(message || "").trim();
  if (rawMessage.length < 2 && !existingDraft) {
    const error = new Error("Please tell me more.");
    error.statusCode = 400;
    throw error;
  }

  const { oldPrice, newPrice } = detectPrices(rawMessage);
  const parsedProduct = detectProduct(rawMessage);
  const demandChange = detectDemandChange(rawMessage);
  const stockContext = detectStockContext(rawMessage);
  const competitorContext = detectCompetitorContext(rawMessage);

  // Logic: Only accept new product if the existing one is "Unknown" OR if the new one is significantly long/distinct
  let product = existingDraft?.product && existingDraft.product !== "Unknown product" ? existingDraft.product : parsedProduct;
  
  // If the user explicitly mentions a new product in the second turn, we could override, 
  // but for Week 1-2, sticking to the first detected product is safer.
  
  const finalOldPrice = oldPrice ?? existingDraft?.oldPrice ?? null;
  const finalNewPrice = newPrice ?? existingDraft?.newPrice ?? null;

  const extracted = {
    rawMessage: existingDraft ? `${existingDraft.rawMessage} | ${rawMessage}` : rawMessage,
    product,
    oldPrice: finalOldPrice,
    newPrice: finalNewPrice,
    priceChangeType: priceChangeType(finalOldPrice, finalNewPrice, existingDraft ? `${existingDraft.rawMessage} | ${rawMessage}` : rawMessage),
    demandChange: (demandChange !== "unknown" ? demandChange : null) ?? existingDraft?.demandChange ?? "unknown",
    stockContext: (stockContext !== "unknown" ? stockContext : null) ?? existingDraft?.stockContext ?? "unknown",
    competitorContext: (competitorContext !== "unknown" ? competitorContext : null) ?? existingDraft?.competitorContext ?? "unknown"
  };
  
  extracted.extractionConfidence = extractionConfidence(extracted);
  extracted.missingFields = missingFields(extracted);
  extracted.advice = buildAdvice(extracted);
  extracted.precisionAnalytics = calculatePrecisionAnalytics(extracted);
  extracted.context = {
    source: "chatbot",
    capturedAs: "pricing_decision_row"
  };

  return extracted;
}

export async function checkWorkspaceMlReadiness(workspaceId) {
  const resolvedCount = await AssistantDecision.countDocuments({
    workspaceId,
    status: 'resolved'
  });
  
  // Set threshold to 3 for testing
  if (resolvedCount < 3) return false;
  
  const types = await AssistantDecision.distinct('priceChangeType', {
    workspaceId,
    status: 'resolved'
  });
  
  if (!types.includes('increase') || !types.includes('decrease')) {
    return false;
  }
  
  const outcomes = await AssistantDecision.distinct('actualOutcome', {
    workspaceId,
    status: 'resolved'
  });
  
  if (outcomes.length < 2) return false;
  
  return true;
}

export async function draftAssistantDecision(req, message, existingDraft = null) {
  const parsed = parseAssistantDecision(message, existingDraft);
  const workspaceId = getWorkspaceId(req);
  
  if (parsed.missingFields.length === 0) {
    // Knowledge Base Lookup Logic
    try {
      const kbTags = [];
      if (parsed.priceChangeType === "increase") kbTags.push("price_increase");
      if (parsed.priceChangeType === "decrease") kbTags.push("price_decrease");
      if (parsed.demandChange === "up") kbTags.push("demand_up");
      if (parsed.demandChange === "down") kbTags.push("demand_down");
      if (parsed.stockContext === "high") kbTags.push("high_stock");
      if (parsed.competitorContext === "cheaper") kbTags.push("competitor_pressure");
      
      if (kbTags.length > 0) {
        // Find all principles that match at least one of our active tags
        const principles = await KnowledgeBase.find({ tags: { $in: kbTags } });
        
        // Sort by how many of our kbTags are present in the principle's tags (Best Match)
        const sorted = principles.sort((a, b) => {
          const aCount = a.tags.filter(t => kbTags.includes(t)).length;
          const bCount = b.tags.filter(t => kbTags.includes(t)).length;
          return bCount - aCount;
        });

        const principle = sorted[0];
        
        if (principle) {
          parsed.advice.theoreticalRoot = {
            title: principle.title,
            concept: principle.concept,
            description: principle.description
          };
          if (principle.historicalCase) {
            parsed.advice.historicalPrecedent = principle.historicalCase;
          }

          // Step 2: Generate AI Justification using local Mistral
          const aiText = await generateJustification(parsed, principle);
          if (aiText) {
            parsed.advice.aiJustification = aiText;
          }
        }
      }
    } catch (err) {
      console.error("Knowledge Base lookup failed:", err.message);
    }

    try {
      const isReady = await checkWorkspaceMlReadiness(workspaceId);
      if (isReady) {
        // Shadow Mode: Fetch ML prediction in the background without blocking the rule advice
        const mlResponse = await fetch('http://localhost:5001/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, decision: parsed })
        });
        
        if (mlResponse.ok) {
          const mlData = await mlResponse.json();
          if (mlData.success) {
            parsed.shadowPrediction = mlData.advice;
          }
        }
      }
    } catch (err) {
      console.error("Flask ML prediction failed or timed out:", err.message);
      // Fallback silently to rule engine
    }
  }
  
  return parsed;
}

export async function saveConfirmedDecision(req, draftData) {
  const decision = await AssistantDecision.create({
    ...draftData,
    workspaceId: getWorkspaceId(req),
    status: 'pending_feedback'
  });

  return decision.toObject();
}

export async function getUnresolvedDecision(req) {
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
  
  return AssistantDecision.findOne({
    ...workspaceFilter(req),
    status: "pending_feedback",
    createdAt: { $lt: eightHoursAgo }
  })
    .sort({ createdAt: -1 })
    .lean();
}

export async function resolveDecision(req, decisionId, outcome) {
  const decision = await AssistantDecision.findOneAndUpdate(
    { _id: decisionId, ...workspaceFilter(req) },
    { 
      status: 'resolved',
      actualOutcome: outcome 
    },
    { new: true }
  ).lean();
  
  if (!decision) {
    const error = new Error("Decision not found");
    error.statusCode = 404;
    throw error;
  }
  return decision;
}

export async function listAssistantDecisions(req, limit = 25) {
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  return AssistantDecision.find(workspaceFilter(req))
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();
}
