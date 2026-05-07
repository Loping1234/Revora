import assert from "node:assert/strict";
import { parseAssistantDecision, mergeLlmExtraction, draftAssistantDecision } from "../services/assistant.service.js";
import { AssistantDecision } from "../models/assistant-decision.model.js";
import { KnowledgeBase } from "../models/knowledge-base.model.js";
import { parseJsonFromText } from "../services/llm.service.js";

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`âœ“ ${name}`);
  } catch (error) {
    console.error(`âœ— ${name}`);
    throw error;
  }
}

const VALID_KB_TAGS = [
  "price_increase_demand_up",
  "price_increase_demand_down",
  "price_increase_demand_flat",
  "price_decrease_demand_up",
  "price_decrease_demand_down",
  "price_decrease_demand_flat",
  "price_flat_demand_down",
  "price_flat_demand_up"
];

test("extracts complete increase plus demand down", () => {
  const parsed = parseAssistantDecision("I increased shirt price from 800 to 950, cost is 500, sales dropped, and my goal is profit.");
  assert.equal(parsed.product, "shirt");
  assert.equal(parsed.oldPrice, 800);
  assert.equal(parsed.newPrice, 950);
  assert.equal(parsed.currentPrice, 950);
  assert.equal(parsed.cost, 500);
  assert.equal(parsed.goal, "protect profit");
  assert.equal(parsed.priceChangeType, "increase");
  assert.equal(parsed.demandChange, "down");
  assert.equal(parsed.missingFields.length, 0);
  assert.equal(parsed.readyForConfirmation, true);
});

test("extracts decrease plus demand up without treating profit as demand down", () => {
  const parsed = parseAssistantDecision("I reduced jeans from 1500 to 1200, cost is 850, sales improved but profit feels low.");
  assert.equal(parsed.product, "jeans");
  assert.equal(parsed.oldPrice, 1500);
  assert.equal(parsed.newPrice, 1200);
  assert.equal(parsed.cost, 850);
  assert.equal(parsed.goal, "protect profit");
  assert.equal(parsed.priceChangeType, "decrease");
  assert.equal(parsed.demandChange, "up");
});

test("handles greeting as a follow-up prompt", () => {
  const parsed = parseAssistantDecision("hello");
  assert.equal(parsed.product, "Unknown product");
  assert.equal(parsed.priceChangeType, "unknown");
  assert.equal(parsed.demandChange, "unknown");
  assert.ok(parsed.missingFields.length >= 5);
  assert.equal(parsed.conversationalResponse, "");
});

await testAsync("draft greets naturally without field dump", async () => {
  const draft = await draftAssistantDecision({}, "hi");
  assert.equal(draft.conversationIntent, "greeting");
  assert.equal(draft.replySource, "local_conversation");
  assert.equal(draft.readyForConfirmation, false);
  assert.deepEqual(draft.missingFields, []);
  assert.match(draft.conversationalResponse, /good to see you/i);
  assert.doesNotMatch(draft.conversationalResponse, /I only need|My read/i);
});

await testAsync("draft handles small talk and redirects gently", async () => {
  const draft = await draftAssistantDecision({}, "how are you?");
  assert.equal(draft.conversationIntent, "small_talk");
  assert.equal(draft.readyForConfirmation, false);
  assert.deepEqual(draft.missingFields, []);
  assert.match(draft.conversationalResponse, /ready to help/i);
  assert.match(draft.conversationalResponse, /price change/i);
});

await testAsync("correction intent keeps existing draft context", async () => {
  const existingDraft = parseAssistantDecision("milk: old price-100, new price-120. demand decreased and i want profit");
  const draft = await draftAssistantDecision({}, "wrong", existingDraft);
  assert.equal(draft.conversationIntent, "correction");
  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 120);
  assert.equal(draft.readyForConfirmation, false);
  assert.match(draft.conversationalResponse, /what I got wrong/i);
});

test("does not keep greeting as product across follow-up turns", () => {
  let draft = parseAssistantDecision("hi");
  draft = parseAssistantDecision("milk form 100 to 120", draft);
  draft = parseAssistantDecision("down, cost is 75, goal is profit", draft);

  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 120);
  assert.equal(draft.cost, 75);
  assert.equal(draft.goal, "protect profit");
  assert.equal(draft.priceChangeType, "increase");
  assert.equal(draft.demandChange, "down");
  assert.equal(draft.missingFields.length, 0);
});

await testAsync("reported milk flow preserves state and avoids checklist replies", async () => {
  let draft = null;
  draft = await draftAssistantDecision({}, "hi", draft);
  draft = await draftAssistantDecision({}, "milk", draft);
  assert.equal(draft.product, "milk");
  assert.equal(draft.context.turnKind, "product_only");
  assert.match(draft.conversationalResponse, /Milk, got it/i);
  assert.doesNotMatch(draft.conversationalResponse, /I have|My read|I only need/i);

  draft = await draftAssistantDecision({}, "100 to 120", draft);
  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 120);
  assert.equal(draft.context.turnKind, "price_only");
  assert.match(draft.conversationalResponse, /milk went from 100 to 120/i);
  assert.match(draft.conversationalResponse, /sales or customer visits/i);
  assert.doesNotMatch(draft.conversationalResponse, /I have|My read|I only need/i);

  draft = await draftAssistantDecision({}, "sales went poor", draft);
  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 120);
  assert.equal(draft.demandChange, "down");
  assert.equal(draft.context.businessSignals.priceIncreaseDemandDown, true);
  assert.match(draft.conversationalResponse, /warning sign/i);
  assert.match(draft.conversationalResponse, /cost price for milk/i);
  assert.doesNotMatch(draft.conversationalResponse, /I have|My read|I only need|the product cost, your pricing goal/i);
});

await testAsync("cost answer with unit fills pending cost without overwriting product", async () => {
  let draft = null;
  draft = await draftAssistantDecision({}, "hi", draft);
  draft = await draftAssistantDecision({}, "milk", draft);
  draft = await draftAssistantDecision({}, "yes from 100 to 120", draft);
  draft = await draftAssistantDecision({}, "customer went down", draft);
  draft = await draftAssistantDecision({}, "50 per liter", draft);

  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 120);
  assert.equal(draft.cost, 50);
  assert.equal(draft.demandChange, "down");
  assert.deepEqual(draft.missingFields, ["your pricing goal"]);
  assert.doesNotMatch(draft.conversationalResponse, /cost price for per liter|cost price for milk/i);
  assert.match(draft.conversationalResponse, /enough to judge|partial rollback|goal/i);
});

await testAsync("bare number fills pending cost after demand question", async () => {
  let draft = null;
  draft = await draftAssistantDecision({}, "milk", draft);
  draft = await draftAssistantDecision({}, "100 to 120", draft);
  draft = await draftAssistantDecision({}, "down", draft);
  draft = await draftAssistantDecision({}, "50", draft);

  assert.equal(draft.product, "milk");
  assert.equal(draft.cost, 50);
  assert.equal(draft.demandChange, "down");
  assert.deepEqual(draft.missingFields, ["your pricing goal"]);
});

await testAsync("correction updates wrong price without losing other draft fields", async () => {
  let draft = parseAssistantDecision("milk old price 100 new price 120 sales went poor cost is 50");
  draft = await draftAssistantDecision({}, "no my mistake price was 100 to 110", draft);

  assert.equal(draft.conversationIntent, "pricing_info");
  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 110);
  assert.equal(draft.cost, 50);
  assert.equal(draft.demandChange, "down");
});

await testAsync("correction updates wrong cost without losing other draft fields", async () => {
  let draft = parseAssistantDecision("milk old price 100 new price 120 sales went poor cost is 50");
  draft = await draftAssistantDecision({}, "no, cost was 60", draft);

  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 120);
  assert.equal(draft.cost, 60);
  assert.equal(draft.demandChange, "down");
});

test("unit phrase after product prompt does not overwrite product", () => {
  let draft = parseAssistantDecision("milk");
  draft = parseAssistantDecision("50 per kg", draft);

  assert.equal(draft.product, "milk");
  assert.notEqual(draft.product, "per kg");
});

test("LLM merge cannot overwrite confirmed product with unit phrase", () => {
  const fallback = parseAssistantDecision("milk old price 100 new price 120 sales went poor cost is 50");
  const merged = mergeLlmExtraction(fallback, {
    product: "per liter",
    oldPrice: 100,
    newPrice: 120,
    cost: 50,
    demandChange: "down"
  });

  assert.equal(merged.product, "milk");
});

test("price-only and demand-only follow-ups do not overwrite product", () => {
  let draft = parseAssistantDecision("milk");
  draft = parseAssistantDecision("100 to 120", draft);
  draft = parseAssistantDecision("sales went poor", draft);

  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 120);
  assert.equal(draft.demandChange, "down");
  assert.equal(draft.context.businessSignals.weakDemand, true);
});

test("cost-only follow-up keeps previous product and prices", () => {
  let draft = parseAssistantDecision("milk 100 to 120 sales went poor");
  draft = parseAssistantDecision("cost 80", draft);

  assert.equal(draft.product, "milk");
  assert.equal(draft.oldPrice, 100);
  assert.equal(draft.newPrice, 120);
  assert.equal(draft.cost, 80);
  assert.equal(draft.demandChange, "down");
});

await testAsync("advisor detects sales up with customer loss as contradiction", async () => {
  let draft = parseAssistantDecision("milk old price 100 new price 120");
  draft = await draftAssistantDecision({}, "sales went up but customers gone, profit minimal", draft);

  assert.equal(draft.product, "milk");
  assert.equal(draft.demandChange, "up");
  assert.equal(draft.context.businessSignals.salesCustomerContradiction, true);
  assert.equal(draft.context.businessSignals.profitPressure, true);
  assert.match(draft.conversationalResponse, /sales value improved but customer count dropped/i);
  assert.match(draft.conversationalResponse, /footfall|buy other things/i);
});

test("identifies missing old price", () => {
  const parsed = parseAssistantDecision("I changed mango price to 120, cost is 80, sales improved, goal is grow sales.");
  assert.equal(parsed.product, "mango");
  assert.equal(parsed.oldPrice, null);
  assert.equal(parsed.newPrice, 120);
  assert.equal(parsed.cost, 80);
  assert.equal(parsed.demandChange, "up");
  assert.ok(parsed.missingFields.includes("the old price"));
});

test("identifies missing demand outcome", () => {
  const parsed = parseAssistantDecision("I increased soap price from 40 to 45.");
  assert.equal(parsed.priceChangeType, "increase");
  assert.equal(parsed.demandChange, "unknown");
  assert.ok(parsed.missingFields.includes("if sales went up or down"));
});

test("does not treat cost as the previous price when only current price is given", () => {
  const parsed = parseAssistantDecision("I sell mangoes at 120, cost is 80, sales are slow.");
  assert.equal(parsed.product, "mangoes");
  assert.equal(parsed.oldPrice, null);
  assert.equal(parsed.newPrice, 120);
  assert.equal(parsed.cost, 80);
  assert.equal(parsed.demandChange, "down");
  assert.ok(parsed.missingFields.includes("the old price"));
  assert.ok(parsed.missingFields.includes("your pricing goal"));
});

test("uses labeled old and new prices instead of demand counts", () => {
  const parsed = parseAssistantDecision("milk: old price-100, new price-120. demand decreased from 20 people to 15 and i want profit");
  assert.equal(parsed.product, "milk");
  assert.equal(parsed.oldPrice, 100);
  assert.equal(parsed.newPrice, 120);
  assert.equal(parsed.demandChange, "down");
  assert.equal(parsed.goal, "protect profit");
  assert.deepEqual(parsed.missingFields, ["the product cost"]);
});

test("does not leak demand verbs into product names", () => {
  const parsed = parseAssistantDecision("milk old price 100 new price 120 demand fell goal profit");
  assert.equal(parsed.product, "milk");
  assert.equal(parsed.oldPrice, 100);
  assert.equal(parsed.newPrice, 120);
  assert.equal(parsed.demandChange, "down");
  assert.deepEqual(parsed.missingFields, ["the product cost"]);
});

test("captures bought-for cost in a follow-up without losing existing prices", () => {
  const firstDraft = parseAssistantDecision("milk: old price-100, new price-120. demand decreased from 20 people to 15 and i want profit");
  const parsed = parseAssistantDecision("i am a shop vendor and i bought this for 80. old selling price was 100 and new one is 120", firstDraft);
  assert.equal(parsed.product, "milk");
  assert.equal(parsed.oldPrice, 100);
  assert.equal(parsed.newPrice, 120);
  assert.equal(parsed.cost, 80);
  assert.equal(parsed.readyForConfirmation, true);
});

test("merges Mistral-style extraction into the existing draft", () => {
  const fallback = parseAssistantDecision("I sell mangoes at 120, cost is 80, sales are slow.");
  const merged = mergeLlmExtraction(fallback, {
    product: "mangoes",
    oldPrice: 100,
    newPrice: 120,
    cost: 80,
    demandChange: "down",
    goal: "protect profit",
    stockContext: "normal",
    competitorContext: "unknown"
  });

  assert.equal(merged.oldPrice, 100);
  assert.equal(merged.newPrice, 120);
  assert.equal(merged.cost, 80);
  assert.equal(merged.readyForConfirmation, true);
});

test("parses JSON from fenced Mistral responses", () => {
  const parsed = parseJsonFromText("```json\n{\"reply\":\"ok\",\"readyForConfirmation\":false}\n```");
  assert.equal(parsed.reply, "ok");
  assert.equal(parsed.readyForConfirmation, false);
});

test("confirmed decision validates with canonical flat value", () => {
  const decision = new AssistantDecision({
    rawMessage: "Price stayed 100 and sales dropped.",
    product: "notebook",
    oldPrice: 100,
    newPrice: 100,
    currentPrice: 100,
    cost: 60,
    goal: "protect profit",
    priceChangeType: "flat",
    demandChange: "down"
  });

  const validation = decision.validateSync();
  assert.equal(validation, undefined);
});

test("knowledge-base schema contains every assistant tag", () => {
  const enumValues = KnowledgeBase.schema.path("tag").enumValues;
  assert.deepEqual([...enumValues].sort(), [...VALID_KB_TAGS].sort());
});

console.log("Assistant tests passed.");
