"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeQuestStepExternalIds = void 0;
const node_crypto_1 = require("node:crypto");
const cleanExternalId = (value) => {
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim();
    return normalized || undefined;
};
const normalizeQuestStepExternalIds = (steps, persistedSteps = []) => {
    const persistedIds = persistedSteps.map(step => cleanExternalId(step.externalId));
    const persistedIdSet = new Set(persistedIds.filter((id) => Boolean(id)));
    const assignedIds = new Set();
    return steps.map((step, index) => {
        const proposedId = cleanExternalId(step.externalId);
        const persistedId = persistedIds[index];
        let externalId;
        if (proposedId && persistedIdSet.has(proposedId)) {
            externalId = proposedId;
        }
        else if (persistedId && !assignedIds.has(persistedId)) {
            externalId = persistedId;
        }
        else {
            externalId = proposedId || `step-${(0, node_crypto_1.randomUUID)()}`;
        }
        if (assignedIds.has(externalId)) {
            throw new Error(`Quest step externalId must be unique: ${externalId}`);
        }
        assignedIds.add(externalId);
        return { ...step, externalId };
    });
};
exports.normalizeQuestStepExternalIds = normalizeQuestStepExternalIds;
