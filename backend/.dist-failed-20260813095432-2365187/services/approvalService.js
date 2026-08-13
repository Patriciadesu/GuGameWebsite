"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveQuestRequest = exports.ApprovalOperationError = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ApprovalRequest_1 = __importDefault(require("../models/ApprovalRequest"));
const Skill_1 = __importDefault(require("../models/Skill"));
const User_1 = __importDefault(require("../models/User"));
class ApprovalOperationError extends Error {
    constructor(code, message, status, details = {}) {
        super(message);
        this.code = code;
        this.status = status;
        this.details = details;
        this.name = 'ApprovalOperationError';
    }
}
exports.ApprovalOperationError = ApprovalOperationError;
const approveQuestRequest = async (requestId, adminId, rewardAP) => {
    const session = await mongoose_1.default.startSession();
    let result = null;
    try {
        await session.withTransaction(async () => {
            const approvalRequest = await ApprovalRequest_1.default.findById(requestId).session(session);
            if (!approvalRequest) {
                throw new ApprovalOperationError('REQUEST_NOT_FOUND', 'Approval request not found', 404);
            }
            if (approvalRequest.status !== 'pending') {
                throw new ApprovalOperationError('ALREADY_PROCESSED', 'This request has already been processed', 409);
            }
            const user = await User_1.default.findOne({ discordId: approvalRequest.userId }).session(session);
            if (!user) {
                throw new ApprovalOperationError('USER_NOT_FOUND', 'User not found', 404);
            }
            const skill = await Skill_1.default.findById(approvalRequest.skillId).session(session);
            if (!skill) {
                throw new ApprovalOperationError('SKILL_NOT_FOUND', 'Quest not found', 404);
            }
            const nextQuestCost = skill.nextQuestCost ?? 25;
            if ((user.assetPoints || 0) < nextQuestCost) {
                throw new ApprovalOperationError('INSUFFICIENT_AP', `User needs ${nextQuestCost} AP to continue to the next quest`, 400, { required: nextQuestCost, available: user.assetPoints || 0 });
            }
            const updatedUser = await User_1.default.findOneAndUpdate({
                _id: user._id,
                assetPoints: { $gte: nextQuestCost },
                completedQuestRewards: { $ne: approvalRequest.skillId }
            }, {
                $addToSet: {
                    unlockedSkills: approvalRequest.skillId,
                    completedQuestRewards: approvalRequest.skillId
                },
                $inc: { assetPoints: rewardAP - nextQuestCost }
            }, { new: true, session });
            if (!updatedUser) {
                throw new ApprovalOperationError('ALREADY_PROCESSED', 'This quest has already been approved for this user', 409);
            }
            approvalRequest.status = 'approved';
            approvalRequest.rewardAP = rewardAP;
            approvalRequest.reviewedBy = adminId;
            approvalRequest.reviewedAt = new Date();
            await approvalRequest.save({ session });
            result = {
                userId: approvalRequest.userId,
                skillId: approvalRequest.skillId,
                remainingAssetPoints: updatedUser.assetPoints,
                nextQuestCost
            };
        });
    }
    finally {
        await session.endSession();
    }
    if (!result) {
        throw new Error('Approval transaction completed without a result');
    }
    return result;
};
exports.approveQuestRequest = approveQuestRequest;
