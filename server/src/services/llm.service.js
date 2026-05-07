/**
 * LLM Service - Communicates with local Ollama instance
 * Based on the "Week 3" roadmap requirements.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const MODEL_NAME = process.env.OLLAMA_MODEL || "mistral";
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "10m";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 8000);

function llmOptions(overrides = {}) {
  return {
    temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.25),
    num_ctx: Number(process.env.OLLAMA_NUM_CTX || 2048),
    num_predict: Number(process.env.OLLAMA_NUM_PREDICT || 180),
    ...overrides
  };
}

export function parseJsonFromText(rawResponse) {
  if (!rawResponse) return null;

  try {
    return JSON.parse(rawResponse);
  } catch {
    const fencedMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1] || rawResponse.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) return null;

    try {
      return JSON.parse(candidate);
    } catch (error) {
      console.error("[LLM] JSON parse failed:", error.message);
      return null;
    }
  }
}

/**
 * Core LLM Call - Day 2-3
 * Sends a raw prompt to Ollama and returns the response text.
 */
export async function callLLM(prompt, requestOptions = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestOptions.timeoutMs || OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: prompt,
        stream: false,
        keep_alive: requestOptions.keepAlive || OLLAMA_KEEP_ALIVE,
        ...(requestOptions.format ? { format: requestOptions.format } : {}),
        options: llmOptions(requestOptions.options)
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.response.trim();
  } catch (error) {
    console.error("[LLM] callLLM failed:", error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callLLMJson(prompt, requestOptions = {}) {
  const rawResponse = await callLLM(prompt, {
    ...requestOptions,
    format: requestOptions.format || "json",
    options: {
      num_predict: 220,
      temperature: 0.2,
      ...requestOptions.options
    }
  });
  return {
    rawResponse,
    data: parseJsonFromText(rawResponse)
  };
}

/**
 * Reasoning Assembler - Day 4-5
 * Combines ML predictions, Knowledge Base cases, and User context.
 */
export async function assembleReasoning(mlPrediction, kbCase, userData) {
  if (!kbCase) return null;

  const prompt = `
    You are Revora, a specialized Pricing Mentor for small shopkeepers.
    
    USER CONTEXT:
    The vendor changed the price of "${userData.product}" from ${userData.oldPrice} to ${userData.newPrice}.
    The resulting demand was: "${userData.demandChange}".
    
    ML PREDICTION:
    "${mlPrediction || "No specific ML prediction available for this case."}"
    
    ECONOMIC GROUNDING (From Knowledge Base):
    Principle: ${kbCase.economicPrinciple}
    Explanation: ${kbCase.explanation}
    Historical Case: In ${kbCase.historicalCase.year}, ${kbCase.historicalCase.market} experienced: ${kbCase.historicalCase.what_happened}. Outcome: ${kbCase.historicalCase.outcome}
    Expert Recommendation: ${kbCase.recommendation}
    Risk Factor: ${kbCase.risk}

    TASK:
    Write a 3-4 sentence justified recommendation for the vendor. 
    1. Start by explaining their current situation using the Economic Principle.
    2. Mention the historical case or ML data to build trust.
    3. Give a specific, actionable next step.
    
    STYLE: Professional, grounded, and empathetic. Use INR or Rs for currency. Keep it conversational.
  `;

  return await callLLM(prompt);
}

/**
 * Conversational Extractor
 * Uses Mistral to understand natural language and turn it into structured data.
 * This replaces "hardcoded rules."
 */
export async function extractDecisionFromChat(message) {
  const prompt = `
    You are a data extraction assistant for a Pricing App.
    USER MESSAGE: "${message}"

    TASK: Extract the following fields in JSON format:
    - product (the item mentioned)
    - oldPrice (number or null)
    - newPrice (number or null)
    - demandChange ("up", "down", "flat", or "unknown")
    - priceChangeType ("increase", "decrease", "flat", or "unknown")

    RULES:
    1. Only return the JSON object. No extra text.
    2. If a price is "30 to 35", oldPrice is 30, newPrice is 35, type is "increase".
    3. If sales are "flying" or "better", demandChange is "up".
    4. If sales are "slow" or "dropped", demandChange is "down".

    JSON:
  `;

  const response = await callLLM(prompt);
  if (!response) return null;

  return parseJsonFromText(response);
}
