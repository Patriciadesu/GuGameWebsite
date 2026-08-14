import mongoose from 'mongoose';
import ApprovalRequest from '../models/ApprovalRequest';
import Skill from '../models/Skill';
import User from '../models/User';
import ConstellationMap from '../models/ConstellationMap';

type ApprovalErrorCode =
  | 'REQUEST_NOT_FOUND'
  | 'ALREADY_PROCESSED'
  | 'USER_NOT_FOUND'
  | 'SKILL_NOT_FOUND'
  | 'MAIN_QUEST_LEVEL_MISMATCH'
  | 'INSUFFICIENT_AP';

export class ApprovalOperationError extends Error {
  constructor(
    public readonly code: ApprovalErrorCode,
    message: string,
    public readonly status: number,
    public readonly details: Record<string, number> = {}
  ) {
    super(message);
    this.name = 'ApprovalOperationError';
  }
}

export interface ApprovalResult {
  userId: string;
  skillId: string;
  remainingAssetPoints: number;
  nextQuestCost: number;
  level: number;
  leveledUp: boolean;
  completedLevel?: number;
}

export const approveQuestRequest = async (
  requestId: string,
  adminId: string,
  rewardAP: number
): Promise<ApprovalResult> => {
  const session = await mongoose.startSession();
  let result: ApprovalResult | null = null;

  try {
    await session.withTransaction(async () => {
      const approvalRequest = await ApprovalRequest.findById(requestId).session(session);
      if (!approvalRequest) {
        throw new ApprovalOperationError('REQUEST_NOT_FOUND', 'Approval request not found', 404);
      }
      if (approvalRequest.status !== 'pending') {
        throw new ApprovalOperationError('ALREADY_PROCESSED', 'This request has already been processed', 409);
      }

      const user = await User.findOne({ discordId: approvalRequest.userId }).session(session);
      if (!user) {
        throw new ApprovalOperationError('USER_NOT_FOUND', 'User not found', 404);
      }
      const skill = await Skill.findById(approvalRequest.skillId).session(session);
      if (!skill) {
        throw new ApprovalOperationError('SKILL_NOT_FOUND', 'Quest not found', 404);
      }

      const mainMap = skill.constellationMapId
        ? await ConstellationMap.findById(skill.constellationMapId).select('constellationType').session(session).lean()
        : null;
      const isMainQuest = mainMap?.constellationType === 'main';
      if (isMainQuest && (!Number.isInteger(skill.mainQuestLevel) || skill.mainQuestLevel !== user.level)) {
        throw new ApprovalOperationError(
          'MAIN_QUEST_LEVEL_MISMATCH',
          `This Main Quest is for Level ${skill.mainQuestLevel || '?'}, but the user is Level ${user.level}`,
          409,
          { requiredLevel: skill.mainQuestLevel || 0, userLevel: user.level }
        );
      }
      const nextQuestCost = isMainQuest ? 0 : (skill.nextQuestCost ?? 25);
      if ((user.assetPoints || 0) < nextQuestCost) {
        throw new ApprovalOperationError(
          'INSUFFICIENT_AP',
          `User needs ${nextQuestCost} AP to continue to the next quest`,
          400,
          { required: nextQuestCost, available: user.assetPoints || 0 }
        );
      }

      const updatedUser = await User.findOneAndUpdate(
        {
          _id: user._id,
          assetPoints: { $gte: nextQuestCost },
          completedQuestRewards: { $ne: approvalRequest.skillId },
          ...(isMainQuest ? { level: skill.mainQuestLevel } : {})
        },
        {
          $addToSet: {
            unlockedSkills: approvalRequest.skillId,
            completedQuestRewards: approvalRequest.skillId
          },
          $inc: {
            assetPoints: rewardAP - nextQuestCost,
            ...(isMainQuest ? { level: 1 } : {})
          }
        },
        { new: true, session }
      );
      if (!updatedUser) {
        throw new ApprovalOperationError(
          'ALREADY_PROCESSED',
          'This quest has already been approved for this user',
          409
        );
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
        nextQuestCost,
        level: updatedUser.level,
        leveledUp: isMainQuest,
        ...(isMainQuest ? { completedLevel: skill.mainQuestLevel } : {})
      };
    });
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new Error('Approval transaction completed without a result');
  }
  return result;
};
