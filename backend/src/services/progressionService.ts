import User from '../models/User';

export const areQuestStepsComplete = (
  steps: Array<{ externalId?: string }>,
  completedStepIds: ReadonlySet<string>
) => steps.length > 0 && steps.every((step, index) =>
  completedStepIds.has(step.externalId || `step-${index}`)
);

export const completeQuestStepOnce = (
  userId: string,
  skillId: string,
  stepId: string,
  rewardAP: number
) => User.findOneAndUpdate(
  {
    discordId: userId,
    completedQuestSteps: {
      $not: { $elemMatch: { skillId, stepId } }
    }
  },
  {
    $push: { completedQuestSteps: { skillId, stepId, completedAt: new Date() } },
    $inc: { assetPoints: rewardAP }
  },
  { new: true }
);

export const unlockSkillOnce = (
  userId: string,
  skillId: string,
  cost: number,
  rewardAP = 0
) => User.findOneAndUpdate(
  {
    discordId: userId,
    unlockedSkills: { $ne: skillId },
    ...(cost > 0 ? { assetPoints: { $gte: cost } } : {})
  },
  {
    $addToSet: { unlockedSkills: skillId },
    ...(rewardAP !== cost ? { $inc: { assetPoints: rewardAP - cost } } : {})
  },
  { new: true }
);
