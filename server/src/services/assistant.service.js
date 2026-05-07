import { AssistantDecision } from "../models/assistant-decision.model.js";
import { KnowledgeBase } from "../models/knowledge-base.model.js";
import { assembleReasoning, callLLMJson } from "./llm.service.js";
import { getWorkspaceId, workspaceFilter } from "../utils/workspace.js";

const PRICE_CHANGE_TYPES = new Set(["increase", "decrease", "flat", "unknown"]);
const DEMAND_CHANGE_TYPES = new Set(["up", "down", "flat", "unknown"]);
const STOCK_CONTEXTS = new Set(["high", "low", "normal", "unknown"]);
const COMPETITOR_CONTEXTS = new Set(["cheaper", "expensive", "same", "unknown"]);

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNonNegativeNumber(value) {
  const parsed = parseNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function normalizeEnum(value, allowed, fallback = "unknown") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "unchanged") return allowed.has("flat") ? "flat" : fallback;
  return allowed.has(normalized) ? normalized : fallback;
}

function isGreeting(message) {
  return /^(hi|hello|hey|namaste|good morning|good evening|good afternoon)(\s+there)?[!.\s]*$/i.test(String(message || "").trim());
}

function isWeakProduct(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const unitOnly = /^(per\s+)?(liter|litre|l|kg|kilogram|gram|g|ml|milliliter|millilitre|each|piece|pieces|pc|pcs|unit|units|box|boxes|pack|packet|bottle|dozen)$/i.test(normalized)
    || normalized === "per"
    || /^per\s+\w+$/i.test(normalized);
  
  const RESPONSE_WORDS = new Set([
    'yes', 'no', 'yeah', 'nope', 'yep', 'nah',
    'correct', 'right', 'okay', 'ok', 'sure', 
    'fine', 'exactly', 'true', 'false', 'maybe',
    'l', 'k', 'y', 'n', 'yup', 'agreed',
    'hi', 'hello', 'hey', 'namaste',
    'good', 'bad', 'great', 'nice', 'cool'
  ]);

  return !normalized 
    || normalized === "unknown product"
    || unitOnly
    || normalized.length === 1
    || RESPONSE_WORDS.has(normalized);
}

function titleCase(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function hasPricingSignals(message) {
  const text = String(message || "").toLowerCase();
  return /\d/.test(text)
    || /\b(price|old|new|current|cost|bought|purchased|paid|sell|selling|sales|demand|stock|competitor|profit|margin|revenue|discount|increase|increased|decrease|decreased|raised|reduced|dropped|customers|orders|units)\b/i.test(text);
}

function isCorrection(message) {
  return /^(no|nah|nope|wrong|incorrect|not correct|not right|that is wrong|that's wrong|retype|i'll retype)\b/i.test(String(message || "").trim());
}

function hasActionableCorrection(message) {
  const text = String(message || "").trim();
  return isCorrection(text) && hasPricingSignals(text);
}

function isSmallTalk(message) {
  const text = String(message || "").trim().toLowerCase();
  return /^(how are you|how r u|how are u|what's up|whats up|who are you|what can you do|thanks|thank you|ok|okay|cool|nice|great)[?!. ]*$/i.test(text);
}

function isOutOfScope(message) {
  const text = String(message || "").trim().toLowerCase();
  if (hasPricingSignals(text)) return false;
  return /\?$/.test(text) || /\b(weather|joke|capital|news|recipe|movie|song|cricket|football|game|homework)\b/i.test(text);
}

function detectConversationIntent(message, existingDraft = null) {
  const raw = String(message || "").trim();
  if (isCorrection(raw)) return hasActionableCorrection(raw) ? "pricing_info" : "correction";
  if ((isGreeting(raw) || /^(hi|hello|hey|namaste)\b/i.test(raw)) && !hasPricingSignals(raw)) return "greeting";
  if (isSmallTalk(raw) && !hasPricingSignals(raw)) return "small_talk";
  if (isOutOfScope(raw)) return "out_of_scope";
  if (existingDraft || raw) return "pricing_info";
  return "small_talk";
}

function localConversationReply(intent, existingDraft = null) {
  if (intent === "greeting") {
    return "Hey, good to see you. Tell me one price change you made recently, and I will help you think through whether it was a good move.";
  }

  if (intent === "small_talk") {
    return "I am here and ready to help. Tell me a recent price change when you want a second opinion on it.";
  }

  if (intent === "correction") {
    return existingDraft
      ? "Got it. Tell me what I got wrong, and I will update the draft instead of saving it."
      : "Got it. Send me the corrected pricing decision, and I will rebuild it carefully.";
  }

  if (intent === "out_of_scope") {
    return "I may be less useful on that than on pricing. Bring me a product price change, and I will help you reason through the move.";
  }

  return "";
}

function detectPrices(message) {
  const labelMsg = String(message || "").replace(/(?:rs\.?|â‚¹|inr|\$)/gi, "");
  const sellingOldLabel = labelMsg.match(/\bold(?:\s+selling)?\s+price\s*(?:was|is|[-:=])\s*([\d]{1,}(?:,\d{3})*(?:\.\d+)?)/i);
  const sellingNewLabel = labelMsg.match(/\bnew(?:\s+(?:selling\s+)?price| one)?\s*(?:was|is|[-:=])\s*([\d]{1,}(?:,\d{3})*(?:\.\d+)?)/i);

  if (sellingOldLabel || sellingNewLabel) {
    return {
      oldPrice: sellingOldLabel ? parseNumber(sellingOldLabel[1]) : null,
      newPrice: sellingNewLabel ? parseNumber(sellingNewLabel[1]) : null
    };
  }

  const directOldLabel = labelMsg.match(/\b(old|previous|earlier)\s*price\s*[-:=]?\s*([\d]{1,}(?:,\d{3})*(?:\.\d+)?)/i);
  const directNewLabel = labelMsg.match(/\b(new|current|latest|now)\s*price\s*[-:=]?\s*([\d]{1,}(?:,\d{3})*(?:\.\d+)?)/i);

  if (directOldLabel || directNewLabel) {
    return {
      oldPrice: directOldLabel ? parseNumber(directOldLabel[2]) : null,
      newPrice: directNewLabel ? parseNumber(directNewLabel[2]) : null
    };
  }

  const skuPattern = /\b([a-z]{1,8}-?\d{1,8})\b/gi;
  const tempMsg = message
    .replace(skuPattern, " [SKU_HOLDER] ")
    .replace(/\b(cost|costs|buying price|purchase price|wholesale price|competitor price|rival price)\b\s*(?:is|at|=|:)?\s*(?:rs\.?|â‚¹|inr|\$)?\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, " ");
  const cleanMsg = tempMsg.replace(/(?:rs\.?|₹|inr|\$)/gi, "");

  const oldLabel = cleanMsg.match(/\b(old|previous|earlier)\s*price\s*[-:=]?\s*([\d]{1,}(?:,\d{3})*(?:\.\d+)?)/i);
  const newLabel = cleanMsg.match(/\b(new|current|latest|now)\s*price\s*[-:=]?\s*([\d]{1,}(?:,\d{3})*(?:\.\d+)?)/i);

  if (oldLabel || newLabel) {
    return {
      oldPrice: oldLabel ? parseNumber(oldLabel[2]) : null,
      newPrice: newLabel ? parseNumber(newLabel[2]) : null
    };
  }

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
  }

  if (values.length === 1 && /(?:to|now|is|at|selling|sell|->)\s*[\d,.]+/i.test(cleanMsg)) {
    return { oldPrice: null, newPrice: values[0] };
  }

  return { oldPrice: null, newPrice: null };
}

function detectCost(message) {
  const purchaseMatch = String(message || "").match(/\b(bought|purchased|buy|paid)\b.{0,25}?\b(?:for|at)?\s*(?:rs\.?|Ã¢â€šÂ¹|inr|\$)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i);
  if (purchaseMatch) return parseNonNegativeNumber(purchaseMatch[2]);

  const match = String(message || "").match(/\b(cost|costs|buying price|purchase price|wholesale price|bought|purchased|buy price)\b\s*(?:is|was|at|=|:)?\s*(?:for|at)?\s*(?:rs\.?|â‚¹|inr|\$)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i);
  return match ? parseNonNegativeNumber(match[2]) : null;
}

function detectCompetitorPrice(message) {
  const match = String(message || "").match(/\b(competitor price|rival price|other shop|market price)\b\s*(?:is|at|=|:)?\s*(?:rs\.?|â‚¹|inr|\$)?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/i);
  return match ? parseNonNegativeNumber(match[2]) : null;
}

function detectSingleNumber(message) {
  const values = [...String(message || "").matchAll(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\b/g)]
    .map((match) => parseNonNegativeNumber(match[1]))
    .filter((value) => value !== null);
  return values.length === 1 ? values[0] : null;
}

function applyPendingFieldInterpretation(message, pendingField, detected) {
  const singleNumber = detectSingleNumber(message);
  const next = { ...detected };

  if (pendingField === "cost" && next.cost === null && next.oldPrice === null && next.newPrice === null && singleNumber !== null) {
    next.cost = singleNumber;
  }

  if (pendingField === "oldPrice" && next.oldPrice === null && next.newPrice === null && singleNumber !== null) {
    next.oldPrice = singleNumber;
  }

  if (pendingField === "newPrice" && next.oldPrice === null && next.newPrice === null && singleNumber !== null) {
    next.newPrice = singleNumber;
  }

  return next;
}

function detectGoal(message) {
  const raw = String(message || "");
  if (/\b(profit|margin|earn more|make more)\b/i.test(raw)) return "protect profit";
  if (/\b(revenue|sales value|turnover)\b/i.test(raw)) return "increase revenue";
  if (/\b(clear stock|clear inventory|move stock|sell stock|liquidate)\b/i.test(raw)) return "clear inventory";
  if (/\b(match competitor|beat competitor|competitive|competitor)\b/i.test(raw)) return "stay competitive";
  if (/\b(grow sales|sell more|increase sales|more orders|more customers)\b/i.test(raw)) return "grow sales";
  return "";
}

function detectProduct(message) {
  if (isGreeting(message)) return "Unknown product";

  const skuMatch = message.match(/\b([a-z]{1,8}-?\d{1,8})\b/i);
  if (skuMatch && !/(price|cost|old|new|demand)/i.test(skuMatch[1])) return skuMatch[1];

  let product = message.replace(/(?:rs\.?|₹|inr|\$)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, "");
  product = product.replace(/\b(old|previous|earlier|new|current|latest|now)\s*price\s*[-:=]?\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, "");
  product = product.replace(/\bdemand\b\s*(increased|decreased|dropped|rose|fell|went up|went down)?\s*(from)?\s*\d+(?:,\d{3})*(?:\.\d+)?\s*(people|customers|orders|units)?\s*(to|-|->)?\s*\d*(?:,\d{3})*(?:\.\d+)?/gi, "");
  product = product.replace(/\b(cost|costs|buying price|purchase price|wholesale price|competitor price|rival price)\b\s*(?:is|at|=|:)?\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, "");
  product = product.replace(/\bgoal\b\s*(?:is|=|:)?\s*[^,.|]+/gi, "");
  product = product.replace(/\b(selling|sell|at|now|is)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, "");
  product = product.replace(/\b(from|form|to)\s*\d+(?:,\d{3})*(?:\.\d+)?/gi, "");
  product = product.replace(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g, "");

  const fillers = /\b(from|form|to|changed|increased|decreased|dropped|fell|declined|raised|reduced|hiked|cut|sales|sale|price|prices|cost|costs|goal|grow|want|customers|orders|people|demand|the|my|our|a|an|i|we|it|they|think|should|currently|selling|sell|at|maybe|go|was|is|are|on|of|for|were|went|amazing|good|bad|poor|slow|up|down|fast|improved|grew|great|flying|response|and|but|profit|feels|low|minimal|thin|gone|left|lost|fewer|less)\b/gi;
  product = product.replace(fillers, "");
  product = product.replace(/[^\w\s-]/gi, " ").replace(/\s+/g, " ").trim();
  product = product.split(" ").filter((word) => word.length > 1).join(" ");

  return product.slice(0, 80) || "Unknown product";
}

function detectDemandChange(message) {
  if (/^\s*(down|dropped|decreased|fell|slow|less)\s*$/i.test(message)) {
    return "down";
  }

  if (/^\s*(up|increased|improved|rose|more|higher|better)\s*$/i.test(message)) {
    return "up";
  }

  if (/^\s*(same|stable|flat|no change)\s*$/i.test(message)) {
    return "flat";
  }

  if (/(sales|demand|orders|customers|quantity|units|response).{0,30}(dropped|decreased|fell|down|reduced|less|slowed|declined|slow|bad|poor|nothing)|\b(no sales|not selling|sales dropped|sales down)\b/i.test(message)) {
    return "down";
  }

  if (/\b(down|dropped|decreased|fell|slow|less)\b/i.test(message) && !/\b(cost|profit|margin)\b.{0,15}\b(down|dropped|decreased|fell|slow|less)\b/i.test(message)) {
    return "down";
  }

  if (/(sales|demand|orders|customers|quantity|units|response).{0,30}(increased|improved|rose|up|higher|more|grew|flying|sold out|great|amazing|fast)|\b(sales improved|sales went up|sold more)\b/i.test(message)) {
    return "up";
  }

  if (/\b(up|improved|rose|more|higher|better)\b/i.test(message)) {
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
  if (/(stock|inventory).{0,30}(normal|fine|okay)/i.test(message)) return "normal";
  return "unknown";
}

function detectCompetitorContext(message) {
  if (/(competitor|other shop|market).{0,40}(cheaper|lower|less)/i.test(message)) return "cheaper";
  if (/(competitor|other shop|market).{0,40}(expensive|higher|costlier)/i.test(message)) return "expensive";
  if (/(competitor|other shop|market).{0,40}(same|equal|similar)/i.test(message)) return "same";
  return "unknown";
}

function detectPriceChangeType(oldPrice, newPrice, message) {
  if (oldPrice !== null && newPrice !== null) {
    if (newPrice > oldPrice) return "increase";
    if (newPrice < oldPrice) return "decrease";
    return "flat";
  }

  if (/(increased|raised|hiked)/i.test(message)) return "increase";
  if (/(reduced|decreased|dropped|cut)/i.test(message)) return "decrease";
  if (/(same|stable|no change|flat)/i.test(message)) return "flat";
  return "unknown";
}

function classifyPricingTurn({
  parsedProduct,
  oldPrice,
  newPrice,
  cost,
  competitorPrice,
  goal,
  demandChange,
  stockContext,
  competitorContext
}) {
  const hasProduct = !isWeakProduct(parsedProduct);
  const hasPrice = oldPrice !== null || newPrice !== null;
  const hasCost = cost !== null && cost !== undefined;
  const hasCompetitorPrice = competitorPrice !== null && competitorPrice !== undefined;
  const hasGoal = Boolean(goal);
  const hasDemand = demandChange !== "unknown";
  const hasStock = stockContext !== "unknown";
  const hasCompetitor = competitorContext !== "unknown";
  const signalCount = [hasProduct, hasPrice, hasCost, hasCompetitorPrice, hasGoal, hasDemand, hasStock, hasCompetitor]
    .filter(Boolean).length;

  if (hasProduct && signalCount === 1) return "product_only";
  if (hasPrice && signalCount === 1) return "price_only";
  if (hasDemand && signalCount === 1) return "demand_only";
  if (hasCost && signalCount === 1) return "cost_only";
  if (hasGoal && signalCount === 1) return "goal_only";
  return "mixed_pricing_info";
}

function priceChangePercent(extracted) {
  if (!extracted?.oldPrice || extracted.newPrice === null || extracted.newPrice === undefined) return null;
  return ((extracted.newPrice - extracted.oldPrice) / extracted.oldPrice) * 100;
}

function roundedPercent(value) {
  return value === null || value === undefined ? null : Math.round(Math.abs(value));
}

function productName(extracted) {
  return isWeakProduct(extracted?.product) ? "this product" : extracted.product;
}

function detectCorrectedFields(message, detected) {
  if (!isCorrection(message)) return [];

  const text = String(message || "").toLowerCase();
  const corrected = new Set();

  if (detected.cost !== null || /\b(cost|buying price|purchase price|bought|paid)\b/i.test(text)) {
    corrected.add("cost");
  }

  if (detected.oldPrice !== null && detected.newPrice !== null) {
    corrected.add("oldPrice");
    corrected.add("newPrice");
  } else {
    if (detected.oldPrice !== null || /\b(old|previous|earlier)\b.{0,20}\bprice\b/i.test(text)) corrected.add("oldPrice");
    if (detected.newPrice !== null || /\b(new|current|latest|now)\b.{0,20}\bprice\b/i.test(text)) corrected.add("newPrice");
  }

  if (detected.demandChange !== "unknown" && /\b(sales|demand|customer|customers|orders|units)\b/i.test(text)) {
    corrected.add("demandChange");
  }

  if (detected.goal) corrected.add("goal");
  if (!isWeakProduct(detected.parsedProduct) && /\b(product|item)\b/i.test(text)) corrected.add("product");

  return [...corrected];
}

function nextPendingField(extracted) {
  if (extracted.readyForConfirmation) return null;
  if (extracted.product === "Unknown product") return "product";
  if (extracted.oldPrice === null && extracted.newPrice === null) return "priceMove";
  if (extracted.oldPrice === null) return "oldPrice";
  if (extracted.newPrice === null) return "newPrice";
  if (extracted.demandChange === "unknown") return "demandChange";
  if (extracted.cost === null || extracted.cost === undefined) return "cost";
  if (!extracted.goal) return "goal";
  return null;
}

function hasAdviceCore(extracted) {
  return !isWeakProduct(extracted.product)
    && extracted.oldPrice !== null
    && extracted.newPrice !== null
    && extracted.cost !== null
    && extracted.cost !== undefined
    && extracted.demandChange !== "unknown";
}

function onlyGoalMissing(extracted) {
  return hasAdviceCore(extracted)
    && !extracted.goal
    && extracted.missingFields?.length === 1
    && extracted.missingFields[0] === "your pricing goal";
}

function detectBusinessSignals(message, extracted, existingDraft = null, turnKind = "mixed_pricing_info") {
  const text = String(message || "").toLowerCase();
  const previous = existingDraft?.context?.businessSignals || {};
  const salesUpText = /(sales|demand|orders|quantity|units|response).{0,35}(increased|improved|rose|up|higher|more|grew|fast|great|amazing)|\b(sales improved|sales went up|sold more)\b/i.test(text);
  const weakDemandText = /(sales|demand|orders|customers|quantity|units|response).{0,35}(poor|bad|slow|nothing|dropped|decreased|fell|down|reduced|less|slowed|declined)|\b(no sales|not selling|sales dropped|sales down|sales went poor)\b/i.test(text);
  const customerLossText = /(customers?|regulars?|buyers?|people).{0,35}(gone|left|lost|less|fewer|down|reduced|stopped|not coming|decreased)|\b(customers? gone|lost customers?|fewer customers?)\b/i.test(text);
  const profitPressureText = /(profit|margin).{0,35}(minimal|low|less|poor|thin|small|down|not much|only)|\b(no profit|profit minimal|minimal profit)\b/i.test(text);
  const footfallText = /\b(footfall|daily|regular|main product|come in|come for|buy other|other things)\b/i.test(text);
  const pct = priceChangePercent(extracted);
  const grossMarginPercent = extracted?.newPrice && extracted.cost !== null && extracted.cost !== undefined
    ? ((extracted.newPrice - extracted.cost) / extracted.newPrice) * 100
    : null;

  const customerLoss = Boolean(previous.customerLoss || customerLossText);
  const salesImproved = Boolean(previous.salesImproved || salesUpText || extracted.demandChange === "up");

  const signals = {
    ...previous,
    lastTurnKind: turnKind,
    weakDemand: Boolean(previous.weakDemand || weakDemandText || extracted.demandChange === "down"),
    salesImproved,
    customerLoss,
    profitPressure: Boolean(previous.profitPressure || profitPressureText),
    footfallRiskHint: Boolean(previous.footfallRiskHint || footfallText),
    priceIncreaseDemandDown: Boolean(previous.priceIncreaseDemandDown || (extracted.priceChangeType === "increase" && extracted.demandChange === "down")),
    largePriceIncrease: Boolean(previous.largePriceIncrease || (extracted.priceChangeType === "increase" && pct !== null && pct >= 15)),
    salesCustomerContradiction: Boolean(previous.salesCustomerContradiction || (salesImproved && customerLoss)),
    loyaltyRisk: Boolean(previous.loyaltyRisk || (customerLoss && extracted.priceChangeType === "increase")),
    marginRisk: Boolean(previous.marginRisk || profitPressureText || (grossMarginPercent !== null && grossMarginPercent < 20)),
    costMissingAfterDemandSignal: Boolean(extracted.cost === null && extracted.demandChange !== "unknown" && extracted.oldPrice !== null && extracted.newPrice !== null)
  };

  if (pct !== null) signals.priceChangePercent = Number(pct.toFixed(2));
  if (grossMarginPercent !== null) signals.grossMarginPercent = Number(grossMarginPercent.toFixed(2));
  return signals;
}

function buildAdvice(extracted) {
  const { priceChangeType, demandChange, stockContext, competitorContext, goal, newPrice, currentPrice, cost } = extracted;
  const effectivePrice = newPrice ?? currentPrice;
  const marginText = effectivePrice !== null && effectivePrice !== undefined && cost !== null && cost !== undefined && effectivePrice > 0
    ? ` Current gross margin is about ${Math.round(((effectivePrice - cost) / effectivePrice) * 100)}%.`
    : "";

  if (priceChangeType === "increase" && demandChange === "down") {
    return {
      title: "Price may be too high",
      recommendation: "Consider rolling back partially or testing a smaller increase.",
      rationale: `Demand dropped after a price increase, which suggests customers may be price-sensitive for this product.${marginText}`,
      nextStep: "Check competitor price and try a middle price between old and new.",
      severity: "warning"
    };
  }

  if (priceChangeType === "decrease" && demandChange === "up") {
    return {
      title: "Demand improved after discount",
      recommendation: "Check whether the extra units are enough to protect profit margin.",
      rationale: `Lower price increased sales, but the business value depends on whether profit per unit fell too much.${marginText}`,
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

  if (priceChangeType === "increase" && demandChange === "up") {
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
    recommendation: goal ? `Use this as a cautious ${goal} test and keep tracking the next sales outcome.` : "Keep tracking this product until you have enough before/after decisions for stronger advice.",
    rationale: "The assistant extracted the pricing event but needs clearer sales, stock, competitor, or profit context for a stronger recommendation.",
    nextStep: "Add what happened to sales and whether competitor price or stock level influenced the result.",
    severity: "caution"
  };
}

function calculatePrecisionAnalytics(extracted) {
  const { oldPrice, newPrice, demandChange, cost } = extracted;
  if (!oldPrice || !newPrice) return null;

  const priceChangePercent = (newPrice - oldPrice) / oldPrice;
  let demandChangePercent = 0;
  if (demandChange === "up") demandChangePercent = 0.15;
  if (demandChange === "down") demandChangePercent = -0.25;
  if (demandChange === "flat") demandChangePercent = -0.02;

  const elasticity = priceChangePercent !== 0 ? demandChangePercent / priceChangePercent : -1.5;
  const estimatedCost = cost ?? oldPrice * 0.6;
  const targetPrice = Math.abs(elasticity) > 1
    ? estimatedCost / (1 + (1 / elasticity))
    : newPrice;

  return {
    label: "Rough target range",
    caveat: cost === null || cost === undefined
      ? "This is a rough estimate based on chat context and an assumed margin, not a final optimized price."
      : "This is a rough estimate based on chat context and the stated cost, not a final optimized price.",
    formulaLabel: "Rough range estimate",
    optimalPriceFormula: "Target range uses estimated cost and observed price response",
    elasticityEstimate: Number(elasticity.toFixed(2)),
    confidenceInterval: {
      low: Number((targetPrice * 0.95).toFixed(2)),
      high: Number((targetPrice * 1.05).toFixed(2))
    },
    dataSources: [
      "Chat decision context",
      "Rule-based demand mapping",
      "Assistant feedback loop"
    ]
  };
}

function extractionConfidence(extracted) {
  let score = 0;
  if (extracted.product !== "Unknown product") score += 20;
  if (extracted.oldPrice !== null) score += 15;
  if (extracted.newPrice !== null) score += 15;
  if (extracted.cost !== null && extracted.cost !== undefined) score += 15;
  if (extracted.demandChange !== "unknown") score += 15;
  if (extracted.goal) score += 10;
  if (extracted.stockContext !== "unknown" || extracted.competitorContext !== "unknown" || extracted.competitorPrice !== null) score += 10;
  return score;
}

function missingFields(extracted) {
  const missing = [];
  if (extracted.product === "Unknown product") missing.push("what product you changed");
  if (extracted.oldPrice === null) missing.push("the old price");
  if (extracted.newPrice === null) missing.push("the new price");
  if (extracted.cost === null || extracted.cost === undefined) missing.push("the product cost");
  if (extracted.demandChange === "unknown") missing.push("if sales went up or down");
  if (!extracted.goal) missing.push("your pricing goal");
  return missing;
}

function buildConversationalResponse(extracted, greetingOnly = false) {
  if (greetingOnly) {
    return "";
  }

  if (extracted.missingFields?.length) {
    return "";
  }

  return "";
}

function completeParsed(extracted, greetingOnly = false) {
  extracted.oldPrice = parseNonNegativeNumber(extracted.oldPrice);
  extracted.newPrice = parseNonNegativeNumber(extracted.newPrice);
  extracted.currentPrice = parseNonNegativeNumber(extracted.currentPrice ?? extracted.newPrice);
  extracted.cost = parseNonNegativeNumber(extracted.cost);
  extracted.competitorPrice = parseNonNegativeNumber(extracted.competitorPrice);
  extracted.goal = String(extracted.goal || "").trim().slice(0, 80);
  extracted.priceChangeType = normalizeEnum(extracted.priceChangeType, PRICE_CHANGE_TYPES);
  extracted.demandChange = normalizeEnum(extracted.demandChange, DEMAND_CHANGE_TYPES);
  extracted.stockContext = normalizeEnum(extracted.stockContext, STOCK_CONTEXTS);
  extracted.competitorContext = normalizeEnum(extracted.competitorContext, COMPETITOR_CONTEXTS);
  extracted.extractionConfidence = extractionConfidence(extracted);
  extracted.missingFields = missingFields(extracted);
  extracted.readyForConfirmation = extracted.missingFields.length === 0;
  extracted.advice = buildAdvice(extracted);
  extracted.precisionAnalytics = calculatePrecisionAnalytics(extracted);
  const existingContext = extracted.context && typeof extracted.context === "object" ? extracted.context : {};
  extracted.context = {
    ...existingContext,
    pendingField: nextPendingField(extracted),
    source: "chatbot",
    capturedAs: "pricing_decision_row"
  };
  extracted.conversationalResponse = extracted.conversationalResponse || buildConversationalResponse(extracted, greetingOnly);
  return extracted;
}

export function parseAssistantDecision(message = "", existingDraft = null) {
  const rawMessage = String(message || "").trim();
  if (rawMessage.length < 2 && !existingDraft) {
    const error = new Error("Please tell me more.");
    error.statusCode = 400;
    throw error;
  }

  const mergedMessage = existingDraft ? `${existingDraft.rawMessage} | ${rawMessage}` : rawMessage;
  const pendingField = existingDraft?.context?.pendingField || "";
  let { oldPrice, newPrice } = detectPrices(rawMessage);
  let cost = detectCost(rawMessage);
  const competitorPrice = detectCompetitorPrice(rawMessage);
  const goal = detectGoal(rawMessage);
  const parsedProduct = detectProduct(rawMessage);
  const demandChange = detectDemandChange(rawMessage);
  const stockContext = detectStockContext(rawMessage);
  const competitorContext = detectCompetitorContext(rawMessage);
  ({ oldPrice, newPrice, cost } = applyPendingFieldInterpretation(rawMessage, pendingField, {
    oldPrice,
    newPrice,
    cost
  }));
  const turnKind = classifyPricingTurn({
    parsedProduct,
    oldPrice,
    newPrice,
    cost,
    competitorPrice,
    goal,
    demandChange,
    stockContext,
    competitorContext
  });
const parsedProductLooksNoisy = 
  !isWeakProduct(existingDraft?.product) && 
  parsedProduct.split(/\s+/).length > 3;

// Once a real product is confirmed in the draft,
// NEVER overwrite it unless user explicitly corrects
const existingProductConfirmed = 
  !isWeakProduct(existingDraft?.product);

const canReplaceExistingProduct = 
  !existingProductConfirmed  // only replace if nothing confirmed yet
  || existingDraft?.conversationIntent === "correction"; // or explicit correction

const product = (
  !isWeakProduct(parsedProduct) && 
  !parsedProductLooksNoisy && 
  (turnKind === "product_only" || canReplaceExistingProduct)
)
  ? parsedProduct
  : (existingProductConfirmed 
      ? existingDraft.product 
      : "Unknown product");
  const finalOldPrice = oldPrice ?? existingDraft?.oldPrice ?? null;
  const finalNewPrice = newPrice ?? existingDraft?.newPrice ?? null;
  const correctedFields = detectCorrectedFields(rawMessage, {
    oldPrice,
    newPrice,
    cost,
    demandChange,
    goal,
    parsedProduct
  });
  const draftData = {
    rawMessage: mergedMessage,
    product,
    oldPrice: finalOldPrice,
    newPrice: finalNewPrice,
    currentPrice: finalNewPrice,
    cost: cost ?? existingDraft?.cost ?? null,
    competitorPrice: competitorPrice ?? existingDraft?.competitorPrice ?? null,
    goal: goal || existingDraft?.goal || "",
    priceChangeType: detectPriceChangeType(finalOldPrice, finalNewPrice, mergedMessage),
    demandChange: demandChange !== "unknown" ? demandChange : existingDraft?.demandChange ?? "unknown",
    stockContext: stockContext !== "unknown" ? stockContext : existingDraft?.stockContext ?? "unknown",
    competitorContext: competitorContext !== "unknown" ? competitorContext : existingDraft?.competitorContext ?? "unknown"
  };
  draftData.context = {
    ...(existingDraft?.context || {}),
    turnKind,
    correctionMode: hasActionableCorrection(rawMessage),
    correctedFields,
    businessSignals: detectBusinessSignals(rawMessage, draftData, existingDraft, turnKind)
  };

  return completeParsed(draftData, isGreeting(rawMessage));
}

export function mergeLlmExtraction(fallback, llmExtraction = {}) {
  const oldPrice = parseNonNegativeNumber(llmExtraction.oldPrice);
  const newPrice = parseNonNegativeNumber(llmExtraction.newPrice ?? llmExtraction.currentPrice);
  const cost = parseNonNegativeNumber(llmExtraction.cost);
  const competitorPrice = parseNonNegativeNumber(llmExtraction.competitorPrice);
  const product = String(llmExtraction.product || "").trim();
  const correctedFields = new Set(fallback.context?.correctedFields || []);
  const canUseProduct = isWeakProduct(fallback.product) || correctedFields.has("product");
  const canUseOldPrice = fallback.oldPrice === null || correctedFields.has("oldPrice");
  const canUseNewPrice = fallback.newPrice === null || correctedFields.has("newPrice");
  const canUseCost = fallback.cost === null || fallback.cost === undefined || correctedFields.has("cost");
  const merged = {
    ...fallback,
    product: canUseProduct && !isWeakProduct(product) ? product.slice(0, 80) : fallback.product,
    oldPrice: canUseOldPrice ? oldPrice ?? fallback.oldPrice : fallback.oldPrice,
    newPrice: canUseNewPrice ? newPrice ?? fallback.newPrice : fallback.newPrice,
    currentPrice: canUseNewPrice ? newPrice ?? fallback.currentPrice ?? fallback.newPrice : fallback.currentPrice ?? fallback.newPrice,
    cost: canUseCost ? cost ?? fallback.cost : fallback.cost,
    competitorPrice: competitorPrice ?? fallback.competitorPrice,
    goal: String(llmExtraction.goal || "").trim().slice(0, 80) || fallback.goal || "",
    demandChange: normalizeEnum(llmExtraction.demandChange, DEMAND_CHANGE_TYPES, fallback.demandChange),
    stockContext: normalizeEnum(llmExtraction.stockContext, STOCK_CONTEXTS, fallback.stockContext),
    competitorContext: normalizeEnum(llmExtraction.competitorContext, COMPETITOR_CONTEXTS, fallback.competitorContext)
  };

  merged.priceChangeType = merged.oldPrice !== null && merged.newPrice !== null
    ? detectPriceChangeType(merged.oldPrice, merged.newPrice, merged.rawMessage)
    : normalizeEnum(llmExtraction.priceChangeType, PRICE_CHANGE_TYPES, fallback.priceChangeType);
  return completeParsed(merged);
}

function money(value) {
  return value !== null && value !== undefined ? String(value) : "unknown";
}

function highestValueQuestion(extracted) {
  const name = productName(extracted);
  const hasProduct = !isWeakProduct(extracted.product);
  const hasPriceMove = extracted.oldPrice !== null && extracted.newPrice !== null;

  if (!hasProduct) return "Which product was this for?";
  if (extracted.oldPrice === null && extracted.newPrice === null) {
    return `Did you change ${name}'s price recently? Tell me the old and new price.`;
  }
  if (extracted.oldPrice === null) return "What was the old price before this change?";
  if (extracted.newPrice === null) return "What is the new or current selling price?";
  if (hasPriceMove && extracted.demandChange === "unknown") {
    return "What happened to sales or customer visits after the change?";
  }
  if (extracted.cost === null || extracted.cost === undefined) {
    return `What is your cost price for ${name}?`;
  }
  if (!extracted.goal) {
    return "What is your goal here: protect profit, grow sales, clear stock, or match competition?";
  }
  return "";
}

function buildProvisionalAdviceReply(extracted) {
  const signals = extracted.context?.businessSignals || {};
  const pct = roundedPercent(signals.priceChangePercent ?? priceChangePercent(extracted));
  const margin = extracted.newPrice ? Math.round(((extracted.newPrice - extracted.cost) / extracted.newPrice) * 100) : null;
  const marginText = margin !== null
    ? ` Selling at ${money(extracted.newPrice)} with cost ${money(extracted.cost)} gives roughly ${margin}% gross margin.`
    : "";

  if (extracted.priceChangeType === "increase" && extracted.demandChange === "down") {
    const jumpText = pct !== null ? ` after a ${pct}% increase` : " after the price increase";
    return `Now I have enough to judge it.${marginText} Demand fell${jumpText}, so I would test a partial rollback before raising further. What is your goal here: protect profit, grow sales, clear stock, or match competition?`;
  }

  if (extracted.priceChangeType === "increase" && extracted.demandChange === "up") {
    return `Now I have enough to judge it.${marginText} Demand still improved after the increase, so I would hold this price and watch repeat buyers. What is your goal here: protect profit, grow sales, clear stock, or match competition?`;
  }

  if (extracted.priceChangeType === "decrease" && extracted.demandChange === "up") {
    return `Now I have enough to judge it.${marginText} The discount helped demand, but the next check is whether volume protects total profit. What is your goal here: protect profit, grow sales, clear stock, or match competition?`;
  }

  return `Now I have enough to judge the move.${marginText} What is your goal here: protect profit, grow sales, clear stock, or match competition?`;
}

function buildConfirmationReply(extracted) {
  const signals = extracted.context?.businessSignals || {};
  const pct = roundedPercent(signals.priceChangePercent ?? priceChangePercent(extracted));
  const margin = signals.grossMarginPercent !== null && signals.grossMarginPercent !== undefined
    ? Math.round(signals.grossMarginPercent)
    : null;

  if (extracted.priceChangeType === "increase" && extracted.demandChange === "down") {
    const marginText = margin !== null ? ` Selling at ${money(extracted.newPrice)} with cost ${money(extracted.cost)} gives roughly ${margin}% gross margin.` : "";
    const jumpText = pct !== null ? ` after a ${pct}% increase` : " after the price increase";
    return `Now I have enough to judge it.${marginText} Demand fell${jumpText}, so I would test a partial rollback before raising further. Confirm this and I will save it.`;
  }

  if (signals.salesCustomerContradiction) {
    return "Now I have enough to save it. The unusual part is that sales improved while customer count weakened, so I would watch repeat buyers closely before treating this as a clean win. Confirm this and I will save it.";
  }

  if (extracted.priceChangeType === "increase" && extracted.demandChange === "up") {
    return "This looks promising: customers accepted the higher price and demand still improved. I would hold the price steady and watch repeat demand before pushing higher again. Confirm this and I will save it.";
  }

  if (extracted.priceChangeType === "decrease" && extracted.demandChange === "up") {
    return "The discount seems to have helped demand, but the real test is whether extra volume protects total profit. Confirm this and I will save it.";
  }

  return "I have enough to save this pricing decision. Confirm it and I will keep it in your decision history.";
}

function buildStateAwareReply(extracted) {
  if (extracted.readyForConfirmation) {
    return buildConfirmationReply(extracted);
  }

  const signals = extracted.context?.businessSignals || {};
  const turnKind = extracted.context?.turnKind || signals.lastTurnKind;
  const name = productName(extracted);
  const pct = roundedPercent(signals.priceChangePercent ?? priceChangePercent(extracted));

  if (turnKind === "product_only" && extracted.oldPrice === null && extracted.newPrice === null) {
    return `${titleCase(name)}, got it. Did you change its price recently, or are you thinking about changing it?`;
  }

  if (turnKind === "price_only" && extracted.oldPrice !== null && extracted.newPrice !== null && extracted.demandChange === "unknown") {
    const moveText = pct !== null && extracted.priceChangeType === "increase"
      ? ` That is a ${pct}% jump, which is not small for a daily-use product.`
      : "";
    return `So ${name} went from ${money(extracted.oldPrice)} to ${money(extracted.newPrice)}.${moveText} What happened to sales or customer visits after the change?`;
  }

  if (signals.salesCustomerContradiction) {
  // If we already asked the footfall question, 
  // handle their yes/no answer
  if (signals.footfallQuestionAsked) {
    const raw = String(extracted.rawMessage || "")
      .split("|").pop().trim().toLowerCase();
    
    const isYes = /^(yes|yeah|yep|yup|sure|correct|right|true|it is|it does)\b/i
      .test(raw);
    const isNo = /^(no|nah|nope|not really|not a|doesn't|dont|no it)\b/i
      .test(raw);

    if (isYes) {
      signals.footfallRiskConfirmed = true;
      return `That makes this more serious. If ${name} is your 
        footfall driver, losing regular customers means they are 
        also skipping your other products. Your overall shop 
        revenue may be falling even if ${name} margin looks okay. 
        ${highestValueQuestion(extracted)}`;
    }

    if (isNo) {
      return `Good — if ${name} is not a footfall product, the 
        customer drop is less urgent. The margin on fewer, 
        higher-paying buyers can still work. 
        ${highestValueQuestion(extracted)}`;
    }
  }

  // First time seeing this contradiction — ask the footfall question
  signals.footfallQuestionAsked = true;
  return `That is an interesting signal: sales value improved but customer count dropped. You may be selling more to fewer buyers, which can hurt regular footfall. Is ${name} a product that brings people in to buy other things too?`;
}

  if (signals.priceIncreaseDemandDown && (extracted.cost === null || extracted.cost === undefined)) {
    const jumpText = pct !== null ? `the ${pct}% increase` : "the price increase";
    return `That is a warning sign: ${jumpText} may be pushing some buyers away. Before I call it a bad move, I need to know your cost price for ${name}.`;
  }

  if (signals.profitPressure && (extracted.cost === null || extracted.cost === undefined)) {
    return `Profit being thin is exactly why cost matters here. What is your cost price for ${name}?`;
  }

  if (onlyGoalMissing(extracted)) {
    return buildProvisionalAdviceReply(extracted);
  }

  if (turnKind === "cost_only" && extracted.cost !== null && !extracted.goal) {
    const margin = extracted.newPrice ? Math.round(((extracted.newPrice - extracted.cost) / extracted.newPrice) * 100) : null;
    const marginText = margin !== null ? ` That puts gross margin around ${margin}%.` : "";
    return `Cost noted at ${money(extracted.cost)}.${marginText} What is your goal here: protect profit, grow sales, clear stock, or match competition?`;
  }

  if (extracted.priceChangeType === "increase" && extracted.demandChange === "up") {
    return `That is a good sign: demand improved even after ${name}'s price went up. I would still check whether repeat customers stay. ${highestValueQuestion(extracted)}`;
  }

  if (extracted.priceChangeType === "decrease" && extracted.demandChange === "up") {
    return `The lower price seems to be pulling demand up. The question is whether the extra sales cover the lower margin. ${highestValueQuestion(extracted)}`;
  }

  return highestValueQuestion(extracted) || "Tell me one more detail about what changed after this price move.";
}

function withConversationMetadata(parsed, intent = "pricing_info", replySource = "local_conversation") {
  parsed.conversationIntent = intent;
  parsed.replySource = replySource;
  return parsed;
}

function conversationOnlyDraft(message, intent, existingDraft = null, replySource = "local_conversation") {
  const base = completeParsed({
    rawMessage: existingDraft?.rawMessage ? `${existingDraft.rawMessage} | ${String(message || "").trim()}` : String(message || "").trim(),
    product: existingDraft?.product || "Unknown product",
    oldPrice: existingDraft?.oldPrice ?? null,
    newPrice: existingDraft?.newPrice ?? null,
    currentPrice: existingDraft?.currentPrice ?? existingDraft?.newPrice ?? null,
    cost: existingDraft?.cost ?? null,
    competitorPrice: existingDraft?.competitorPrice ?? null,
    goal: existingDraft?.goal || "",
    priceChangeType: existingDraft?.priceChangeType || "unknown",
    demandChange: existingDraft?.demandChange || "unknown",
    stockContext: existingDraft?.stockContext || "unknown",
    competitorContext: existingDraft?.competitorContext || "unknown",
    context: existingDraft?.context || {}
  });

  base.readyForConfirmation = false;
  base.missingFields = intent === "correction" ? existingDraft?.missingFields || [] : [];
  base.conversationalResponse = localConversationReply(intent, existingDraft);
  base.context = {
    ...base.context,
    correctionMode: intent === "correction",
    pendingField: intent === "correction" ? "correction" : base.context?.pendingField ?? null,
    conversationOnly: intent !== "correction"
  };
  return withConversationMetadata(base, intent, replySource);
}

function pendingFieldWasResolved(existingDraft, extracted) {
  const pendingField = existingDraft?.context?.pendingField;
  if (!pendingField) return false;

  if (pendingField === "cost") {
    return (existingDraft?.cost === null || existingDraft?.cost === undefined) && extracted.cost !== null && extracted.cost !== undefined;
  }

  if (pendingField === "demandChange") {
    return (existingDraft?.demandChange || "unknown") === "unknown" && extracted.demandChange !== "unknown";
  }

  if (pendingField === "goal") {
    return !existingDraft?.goal && Boolean(extracted.goal);
  }

  if (pendingField === "oldPrice") {
    return existingDraft?.oldPrice === null && extracted.oldPrice !== null;
  }

  if (pendingField === "newPrice") {
    return existingDraft?.newPrice === null && extracted.newPrice !== null;
  }

  if (pendingField === "priceMove") {
    return extracted.oldPrice !== null || extracted.newPrice !== null;
  }

  return false;
}

function shouldUseMistral(message, extracted, existingDraft = null) {
  const raw = String(message || "").trim();
  
  // Never use Mistral for greetings
  if (isGreeting(raw)) return false;

  if (pendingFieldWasResolved(existingDraft, extracted)) return false;
  if (extracted.context?.correctedFields?.length) return false;
  
  // Always use Mistral for corrections
  if (/^(no|nah|nope|wrong|not correct|incorrect)$/i.test(raw)) 
    return true;
  
  // Don't use Mistral when ready to confirm — local reply is fine
  if (extracted.readyForConfirmation) return false;
  
  // Use Mistral when interesting signals exist and 
  // user is responding to a follow-up question
  const signals = extracted.context?.businessSignals || {};
  if (signals.footfallQuestionAsked || 
      signals.salesCustomerContradiction || 
      signals.loyaltyRisk || 
      signals.marginRisk) {
    return true;
  }
  
  // Use Mistral only if product is still unknown
  if (extracted.product === "Unknown product" && !existingDraft?.product) 
    return true;
  
  return false;
}

function replyConflictsWithState(reply, extracted) {
  const text = String(reply || "").toLowerCase();
  if (!text.trim()) return true;

  const missing = new Set(extracted.missingFields || []);
  const fieldChecks = [
    { label: "the old price", patterns: ["old price", "previous price"] },
    { label: "the new price", patterns: ["new price", "current price"] },
    { label: "the product cost", patterns: ["cost", "bought", "pay for"] },
    { label: "if sales went up or down", patterns: ["sales went", "demand", "sales have"] },
    { label: "your pricing goal", patterns: ["goal", "objective"] }
  ];

  return fieldChecks.some(({ label, patterns }) => !missing.has(label) && patterns.some((pattern) => text.includes(pattern)) && /\b(need|missing|tell|share|provide|could you|please)\b/.test(text));
}

function chooseAssistantReply(agentReply, extracted) {
  if (replyConflictsWithState(agentReply, extracted)) {
    return buildStateAwareReply(extracted);
  }
  return agentReply.trim();
}

function rememberAssistantReply(parsed, reply) {
  parsed.conversationalResponse = reply || "";
  parsed.context = {
    ...(parsed.context || {}),
    pendingField: nextPendingField(parsed),
    ...(reply ? { lastAssistantQuestion: reply } : {})
  };
  return parsed;
}

function compactDraftForPrompt(draft = {}) {
  if (!draft) return {};
  return {
    product: draft.product || "Unknown product",
    oldPrice: draft.oldPrice ?? null,
    newPrice: draft.newPrice ?? null,
    currentPrice: draft.currentPrice ?? draft.newPrice ?? null,
    cost: draft.cost ?? null,
    competitorPrice: draft.competitorPrice ?? null,
    goal: draft.goal || "",
    priceChangeType: draft.priceChangeType || "unknown",
    demandChange: draft.demandChange || "unknown",
    stockContext: draft.stockContext || "unknown",
    competitorContext: draft.competitorContext || "unknown",
    missingFields: draft.missingFields || [],
    readyForConfirmation: draft.readyForConfirmation === true
  };
}

function buildAssistantAgentPrompt({ message, existingDraft, normalizedDraft, opening = false }) {
  const compactExisting = compactDraftForPrompt(existingDraft);
  const compactNormalized = compactDraftForPrompt(normalizedDraft);

  return `
You are Revora, a sharp pricing advisor for small shopkeepers.
Be brief, natural, and opinionated. Push back when price logic is risky.
${opening ? "The user opened a new pricing-assistant chat." : `User message: ${JSON.stringify(message)}`}
Previous draft: ${JSON.stringify(compactExisting)}
Server draft: ${JSON.stringify(compactNormalized)}
Missing fields: ${JSON.stringify(compactNormalized.missingFields || [])}

Rules:
- Return one valid JSON object only, no markdown.
- Trust Server draft as known truth unless the user clearly corrects it.
- "bought for", "paid", "purchase price", and "cost" mean product cost, not old selling price.
- Ask only for fields still listed in Missing fields.
- If readyForConfirmation is true, ask for confirmation and give one pricing opinion.
- If price increased and demand fell, oppose raising more unless cost pressure is extreme.
- Keep reply to two short sentences.

JSON shape:
{"reply":"","extraction":{"product":"","oldPrice":null,"newPrice":null,"currentPrice":null,"cost":null,"competitorPrice":null,"goal":"","priceChangeType":"unknown","demandChange":"unknown","stockContext":"unknown","competitorContext":"unknown"},"missingFields":[],"readyForConfirmation":false,"adviceDraft":""}
  `;
}

function toKnowledgeBaseView(principle) {
  if (!principle) return null;
  return {
    tag: principle.tag,
    economicPrinciple: principle.economicPrinciple,
    explanation: principle.explanation,
    historicalCase: principle.historicalCase,
    recommendation: principle.recommendation,
    risk: principle.risk
  };
}

async function attachKnowledgeBase(parsed) {
  if (!parsed || parsed.missingFields?.length) return parsed;
  if (parsed.priceChangeType === "unknown" || parsed.demandChange === "unknown") return parsed;
  if (KnowledgeBase.db.readyState !== 1) return parsed;

  try {
    const kbTag = `price_${parsed.priceChangeType}_demand_${parsed.demandChange}`;
    const principle = await KnowledgeBase.findOne({ tag: kbTag }).lean();
    if (!principle) return parsed;

    parsed.knowledgeBase = toKnowledgeBaseView(principle);
    parsed.advice.theoreticalRoot = {
      economicPrinciple: principle.economicPrinciple,
      explanation: principle.explanation,
      recommendation: principle.recommendation,
      risk: principle.risk
    };
    parsed.advice.historicalPrecedent = principle.historicalCase;

    const aiText = await assembleReasoning(null, principle, parsed);
    if (aiText) {
      parsed.advice.aiJustification = aiText;
    }
  } catch (err) {
    console.error("KB grounding failed:", err.message);
  }

  return parsed;
}

export async function checkWorkspaceMlReadiness(workspaceId) {
  const resolvedCount = await AssistantDecision.countDocuments({
    workspaceId,
    status: "resolved"
  });

  if (resolvedCount < 3) return false;

  const types = await AssistantDecision.distinct("priceChangeType", {
    workspaceId,
    status: "resolved"
  });

  if (!types.includes("increase") || !types.includes("decrease")) {
    return false;
  }

  const outcomes = await AssistantDecision.distinct("actualOutcome", {
    workspaceId,
    status: "resolved"
  });

  return outcomes.length >= 2;
}

async function draftConversationTurn(message, existingDraft, intent, forceMistral) {
  const startedAt = Date.now();
  const draft = conversationOnlyDraft(message, intent, existingDraft);

  if (!forceMistral) {
    return rememberAssistantReply(draft, draft.conversationalResponse);
  }

  try {
    const { rawResponse, data } = await callLLMJson(buildAssistantAgentPrompt({
      message,
      existingDraft,
      normalizedDraft: draft
    }), {
      timeoutMs: Number(process.env.OLLAMA_TEST_TIMEOUT_MS || 65000),
      options: { num_ctx: 1024, num_predict: 120, temperature: 0.2 }
    });

    if (typeof data?.reply === "string" && data.reply.trim()) {
      draft.conversationalResponse = data.reply.trim();
      draft.replySource = "mistral";
      draft.modelDiagnostics = {
        mode: "mistral",
        forced: true,
        parsed: true,
        latencyMs: Date.now() - startedAt,
        rawResponse: rawResponse?.slice(0, 600) || ""
      };
      return rememberAssistantReply(draft, draft.conversationalResponse);
    }
  } catch (err) {
    console.error("[Assistant] Conversational LLM turn failed:", err.message);
  }

  draft.replySource = "fallback";
  draft.modelDiagnostics = {
    mode: "mistral",
    forced: true,
    parsed: false,
    fallbackUsed: true,
    latencyMs: Date.now() - startedAt
  };
  return rememberAssistantReply(draft, draft.conversationalResponse);
}

export async function draftAssistantDecision(req, message, existingDraft = null, options = {}) {
  const intent = detectConversationIntent(message, existingDraft);
  const forceMistral = options.forceMistral === true;

  if (intent !== "pricing_info") {
    return draftConversationTurn(message, existingDraft, intent, forceMistral);
  }

  const fallback = withConversationMetadata(parseAssistantDecision(message, existingDraft), "pricing_info", "local_conversation");

  if (!forceMistral && !shouldUseMistral(message, fallback, existingDraft)) {
    rememberAssistantReply(fallback, buildStateAwareReply(fallback));
    return attachKnowledgeBase(fallback);
  }

  const startedAt = Date.now();
  console.log(`[Assistant] Mistral turn${forceMistral ? " (forced)" : ""} for: "${message}"`);
  const agentPrompt = buildAssistantAgentPrompt({
    message,
    existingDraft,
    normalizedDraft: fallback
  });

  try {
    const { rawResponse, data: agentResult } = await callLLMJson(agentPrompt, {
      timeoutMs: forceMistral ? Number(process.env.OLLAMA_TEST_TIMEOUT_MS || 65000) : undefined,
      options: forceMistral ? { num_ctx: 1024, num_predict: 220, temperature: 0.15 } : {}
    });
    if (agentResult?.extraction) {
      const merged = mergeLlmExtraction(fallback, agentResult.extraction);
      if (typeof agentResult.adviceDraft === "string" && agentResult.adviceDraft.trim()) {
        merged.advice = {
          ...merged.advice,
          recommendation: agentResult.adviceDraft.trim()
        };
      }
      const reply = typeof agentResult.reply === "string" && agentResult.reply.trim()
        ? chooseAssistantReply(agentResult.reply, merged)
        : buildStateAwareReply(merged);
      rememberAssistantReply(merged, reply);
      withConversationMetadata(merged, "pricing_info", "mistral");
      if (forceMistral) {
        merged.modelDiagnostics = {
          mode: "mistral",
          forced: true,
          parsed: true,
          latencyMs: Date.now() - startedAt,
          rawResponse: rawResponse?.slice(0, 600) || ""
        };
      }
      return attachKnowledgeBase(merged);
    }
  } catch (err) {
    console.error("[Assistant] LLM extraction failed:", err.message);
  }

  rememberAssistantReply(fallback, buildStateAwareReply(fallback));
  fallback.replySource = "fallback";
  if (forceMistral) {
    fallback.modelDiagnostics = {
      mode: "mistral",
      forced: true,
      parsed: false,
      fallbackUsed: true,
      latencyMs: Date.now() - startedAt
    };
  }
  return attachKnowledgeBase(fallback);
}

export async function getAssistantOpeningMessage() {
  return localConversationReply("greeting");
}

export async function saveConfirmedDecision(req, draftData = {}) {
  for (const field of ["oldPrice", "newPrice", "currentPrice", "cost", "competitorPrice"]) {
    const parsed = parseNumber(draftData[field]);
    if (parsed !== null && parsed < 0) {
      const error = new Error(`${field} cannot be negative`);
      error.statusCode = 400;
      throw error;
    }
  }

  const decision = await AssistantDecision.create({
    ...draftData,
    oldPrice: parseNonNegativeNumber(draftData.oldPrice),
    newPrice: parseNonNegativeNumber(draftData.newPrice),
    currentPrice: parseNonNegativeNumber(draftData.currentPrice ?? draftData.newPrice),
    cost: parseNonNegativeNumber(draftData.cost),
    competitorPrice: parseNonNegativeNumber(draftData.competitorPrice),
    goal: String(draftData.goal || "").trim(),
    priceChangeType: normalizeEnum(draftData.priceChangeType, PRICE_CHANGE_TYPES),
    demandChange: normalizeEnum(draftData.demandChange, DEMAND_CHANGE_TYPES),
    stockContext: normalizeEnum(draftData.stockContext, STOCK_CONTEXTS),
    competitorContext: normalizeEnum(draftData.competitorContext, COMPETITOR_CONTEXTS),
    workspaceId: getWorkspaceId(req),
    status: "pending_feedback"
  });

  return decision.toObject();
}

export async function getUnresolvedDecision() {
  return null;
}

export async function resolveDecision(req, decisionId, outcome) {
  const decision = await AssistantDecision.findOneAndUpdate(
    { _id: decisionId, ...workspaceFilter(req) },
    {
      status: "resolved",
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
