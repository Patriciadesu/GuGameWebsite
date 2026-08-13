"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlockSkillOnce = exports.completeQuestStepOnce = exports.areQuestStepsComplete = void 0;
const User_1 = __importDefault(require("../models/User"));
const areQuestStepsComplete = (steps, completedStepIds) => steps.length > 0 && steps.every((step, index) => completedStepIds.has(step.externalId || `step-${index}`));
exports.areQuestStepsComplete = areQuestStepsComplete;
const completeQuestStepOnce = (userId, skillId, stepId, rewardAP) => User_1.default.findOneAndUpdate({
    discordId: userId,
    completedQuestSteps: {
        $not: { $elemMatch: { skillId, stepId } }
    }
}, {
    $push: { completedQuestSteps: { skillId, stepId, completedAt: new Date() } },
    $inc: { assetPoints: rewardAP }
}, { new: true });
exports.completeQuestStepOnce = completeQuestStepOnce;
const unlockSkillOnce = (userId, skillId, cost, rewardAP = 0) => User_1.default.findOneAndUpdate({
    discordId: userId,
    unlockedSkills: { $ne: skillId },
    ...(cost > 0 ? { assetPoints: { $gte: cost } } : {})
}, {
    $addToSet: { unlockedSkills: skillId },
    ...(rewardAP !== cost ? { $inc: { assetPoints: rewardAP - cost } } : {})
}, { new: true });
exports.unlockSkillOnce = unlockSkillOnce;
