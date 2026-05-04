/**
 * LLM Service - Communicates with local Ollama instance
 */

const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const MODEL_NAME = "mistral";

export async function generateJustification(decision, principle, mlPrediction = null) {
  console.log(`[LLM] Generating justification for ${decision.product}...`);
  try {
    const prompt = `
      You are an expert Pricing Mentor for small shopkeepers. 
      The shopkeeper made a decision: ${decision.priceChangeType} price of ${decision.product} from ${decision.oldPrice} to ${decision.newPrice}.
      The sales outcome was: ${decision.demandChange}.
      
      Expert Economic Principle: ${principle.title} - ${principle.concept}. ${principle.description}
      
      ${mlPrediction ? `Our ML Data prediction: ${mlPrediction}` : ""}

      TASK: Write a professional, empathetic, and encouraging 2-sentence justification for the shopkeeper. 
      EXPLAIN why their decision worked or failed based on the economic principle.
      Keep it brief and conversational. Do not use markdown or complex formatting.
    `;

    console.log("[LLM] Sending request to Ollama...");
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        prompt: prompt,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    console.log("[LLM] Generation successful!");
    return data.response.trim();
  } catch (error) {
    console.error("[LLM] Generation failed:", error.message);
    return null; // Silent fallback
  }
}
