import { Router } from "express";
import { logAudit } from "../services/audit.service.js";
import {
  listAssistantDecisions,
  draftAssistantDecision,
  saveConfirmedDecision,
  getUnresolvedDecision,
  resolveDecision
} from "../services/assistant.service.js";

export const assistantRouter = Router();

assistantRouter.get("/decisions", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await listAssistantDecisions(req, req.query.limit)
    });
  } catch (error) {
    next(error);
  }
});

assistantRouter.post("/parse-decision", async (req, res, next) => {
  try {
    const draft = await draftAssistantDecision(req, req.body?.message, req.body?.existingDraft);
    res.json({
      success: true,
      data: draft
    });
  } catch (error) {
    next(error);
  }
});

assistantRouter.post("/confirm", async (req, res, next) => {
  try {
    const decision = await saveConfirmedDecision(req, req.body?.draftData);
    await logAudit(req, {
      action: "assistant.decision_captured",
      targetType: "AssistantDecision",
      targetId: decision._id,
      summary: `Assistant captured pricing decision for ${decision.product}`,
      metadata: {
        product: decision.product,
        priceChangeType: decision.priceChangeType,
        demandChange: decision.demandChange,
        extractionConfidence: decision.extractionConfidence
      }
    });

    res.status(201).json({
      success: true,
      data: decision
    });
  } catch (error) {
    next(error);
  }
});

assistantRouter.get("/unresolved", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await getUnresolvedDecision(req)
    });
  } catch (error) {
    next(error);
  }
});

assistantRouter.put("/resolve/:id", async (req, res, next) => {
  try {
    const decision = await resolveDecision(req, req.params.id, req.body?.outcome);
    res.json({
      success: true,
      data: decision
    });
  } catch (error) {
    next(error);
  }
});
