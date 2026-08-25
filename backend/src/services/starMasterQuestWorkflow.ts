import ApprovalRequest from '../models/ApprovalRequest';
import HamsterQuestSubmission, { HamsterQuestSubmissionStatus } from '../models/HamsterQuestSubmission';
import User from '../models/User';
import { approveQuestRequest, ApprovalOperationError } from './approvalService';
import { completeQuestStepOnce } from './progressionService';
import {
  assignStarMasterUserQuest,
  findStarMasterUserByDiscordId,
  listStarMasterUserHouses,
  listStarMasterUserQuests,
  StarMasterApiError,
  StarMasterUser,
  StarMasterUserHouse,
  StarMasterUserQuest,
  submitStarMasterUserQuest
} from './starMasterApi';

export const HAMSTERQUEST_STEP_REWARD_AP = 5;

export type HamsterQuestStepStatus = 'available' | 'pending' | 'approved' | 'rejected';

export interface HamsterQuestWorkflowStep {
  stepId: string;
  status: HamsterQuestStepStatus;
  submissionId?: string;
}

export interface HamsterQuestWorkflow {
  connected: boolean;
  setupIssue?: 'user-not-found' | 'house-required';
  setupMessage?: string;
  externalUserQuestId?: string;
  questStatus?: 'Active' | 'Pending' | 'Completed';
  lifecycleStatus?: 'active' | 'completed';
  steps: HamsterQuestWorkflowStep[];
  allStepsApproved: boolean;
  questCompleted: boolean;
  syncWarning?: string;
}

interface WorkflowInput {
  discordId: string;
  skillId: string;
  externalQuestId: string;
  stepIds: string[];
}

interface ResolvedContext {
  user: StarMasterUser;
  houses: StarMasterUserHouse[];
  completion: StarMasterUserQuest | null;
}

const idString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '_id' in value) return String((value as { _id: unknown })._id);
  return String(value ?? '');
};

const originalQuestId = (completion: StarMasterUserQuest): string => idString(completion.quest?.originalQuestId);

const findCompletion = (quests: StarMasterUserQuest[], externalQuestId: string): StarMasterUserQuest | null =>
  quests.find(quest => originalQuestId(quest) === externalQuestId) || null;

const activeHouses = (memberships: StarMasterUserHouse[]): StarMasterUserHouse[] =>
  memberships.filter(membership => !membership.disabledAt && membership.house?._id);

export const selectSubmissionHouse = (
  user: StarMasterUser,
  memberships: StarMasterUserHouse[]
): StarMasterUserHouse | null => {
  const available = activeHouses(memberships);
  if (available.length === 0) return null;
  return available.find(membership => membership.house._id === user.currentHouseId)
    || [...available].sort((left, right) =>
      new Date(right.lastActivatedAt || right.joinedAt || 0).getTime()
      - new Date(left.lastActivatedAt || left.joinedAt || 0).getTime()
    )[0];
};

const resolveContext = async (input: WorkflowInput): Promise<ResolvedContext | HamsterQuestWorkflow> => {
  const user = await findStarMasterUserByDiscordId(input.discordId);
  if (!user) {
    return {
      connected: false,
      setupIssue: 'user-not-found',
      setupMessage: 'Connect this Discord account to HamsterQuest before submitting.',
      steps: input.stepIds.map(stepId => ({ stepId, status: 'available' })),
      allStepsApproved: false,
      questCompleted: false
    };
  }
  const [houses, quests] = await Promise.all([
    listStarMasterUserHouses(user.id),
    listStarMasterUserQuests(user.id)
  ]);
  if (!selectSubmissionHouse(user, houses)) {
    return {
      connected: false,
      setupIssue: 'house-required',
      setupMessage: 'Join at least one active HamsterQuest House before submitting.',
      steps: input.stepIds.map(stepId => ({ stepId, status: 'available' })),
      allStepsApproved: false,
      questCompleted: false
    };
  }
  return { user, houses, completion: findCompletion(quests, input.externalQuestId) };
};

const isWorkflow = (value: ResolvedContext | HamsterQuestWorkflow): value is HamsterQuestWorkflow =>
  'connected' in value;

const syncCompletionApproval = async (
  input: WorkflowInput,
  completion: StarMasterUserQuest
): Promise<string | undefined> => {
  const user = await User.findOne({ discordId: input.discordId }).select('completedQuestRewards').lean();
  if (user?.completedQuestRewards?.includes(input.skillId)) return undefined;

  let request = await ApprovalRequest.findOne({
    userId: input.discordId,
    skillId: input.skillId,
    status: 'pending'
  });
  if (request && request.reviewSystem !== 'hamsterquest') {
    return 'A legacy GuGame approval request is still pending for this Quest.';
  }
  if (!request) {
    request = await ApprovalRequest.create({
      userId: input.discordId,
      skillId: input.skillId,
      message: 'Approved through HamsterQuest Backoffice',
      status: 'pending',
      reviewSystem: 'hamsterquest',
      externalQuestId: input.externalQuestId,
      externalUserQuestId: completion._id
    });
  }
  try {
    await approveQuestRequest(request.id, 'hamsterquest', 0);
    return undefined;
  } catch (error) {
    if (error instanceof ApprovalOperationError && error.code === 'ALREADY_PROCESSED') return undefined;
    if (error instanceof ApprovalOperationError && error.code === 'INSUFFICIENT_AP') {
      return `HamsterQuest approved this Quest, but ${error.details.required || 0} AP is required to unlock the next Star.`;
    }
    throw error;
  }
};

const remoteStepStatus = (status: string, tracked?: HamsterQuestSubmissionStatus): HamsterQuestStepStatus => {
  if (status === 'Completed') return 'approved';
  if (status === 'Pending') return 'pending';
  if (tracked === 'pending' || tracked === 'rejected') return 'rejected';
  return 'available';
};

const syncContext = async (input: WorkflowInput, context: ResolvedContext): Promise<HamsterQuestWorkflow> => {
  const completion = context.completion;
  if (!completion) {
    return {
      connected: true,
      steps: input.stepIds.map(stepId => ({ stepId, status: 'available' })),
      allStepsApproved: false,
      questCompleted: false
    };
  }

  const tracked = await HamsterQuestSubmission.find({ userId: input.discordId, skillId: input.skillId });
  const trackedByStep = new Map(tracked.map(item => [item.externalSubQuestId, item]));
  const remoteByStep = new Map((completion.quest?.subQuests || []).map(step => [idString(step.subQuestId), step]));

  for (const stepId of input.stepIds) {
    const remote = remoteByStep.get(stepId);
    if (!remote) continue;
    const local = trackedByStep.get(stepId);
    const status = remoteStepStatus(remote.status, local?.status);
    if (status === 'approved') {
      await completeQuestStepOnce(input.discordId, input.skillId, stepId, HAMSTERQUEST_STEP_REWARD_AP);
    }
    if (local || status !== 'available') {
      await HamsterQuestSubmission.findOneAndUpdate(
        { userId: input.discordId, skillId: input.skillId, externalSubQuestId: stepId },
        {
          $set: {
            externalUserId: context.user.id,
            externalQuestId: input.externalQuestId,
            externalUserQuestId: completion._id,
            externalHouseId: idString(completion.houseId),
            externalSubmissionId: idString(remote.submissionId) || local?.externalSubmissionId,
            status,
            syncedAt: new Date()
          },
          $setOnInsert: { submittedAt: new Date() }
        },
        { upsert: true, new: true }
      );
    }
  }

  const refreshed = await HamsterQuestSubmission.find({ userId: input.discordId, skillId: input.skillId }).lean();
  const refreshedByStep = new Map(refreshed.map(item => [item.externalSubQuestId, item]));
  const steps = input.stepIds.map(stepId => {
    const remote = remoteByStep.get(stepId);
    const local = refreshedByStep.get(stepId);
    return {
      stepId,
      status: remote ? remoteStepStatus(remote.status, local?.status) : (local?.status || 'available'),
      ...(remote?.submissionId || local?.externalSubmissionId
        ? { submissionId: idString(remote?.submissionId) || local?.externalSubmissionId }
        : {})
    } as HamsterQuestWorkflowStep;
  });
  const allStepsApproved = steps.length > 0 && steps.every(step => step.status === 'approved');
  const questCompleted = completion.lifecycleStatus === 'completed' || completion.status === 'Completed';
  const syncWarning = questCompleted ? await syncCompletionApproval(input, completion) : undefined;

  return {
    connected: true,
    externalUserQuestId: completion._id,
    questStatus: completion.status,
    lifecycleStatus: completion.lifecycleStatus,
    steps,
    allStepsApproved,
    questCompleted,
    ...(syncWarning ? { syncWarning } : {})
  };
};

export const getHamsterQuestWorkflow = async (input: WorkflowInput): Promise<HamsterQuestWorkflow> => {
  const context = await resolveContext(input);
  return isWorkflow(context) ? context : syncContext(input, context);
};

export const submitHamsterQuestStep = async (input: WorkflowInput & {
  stepId: string;
  message?: string;
  imageUrl?: string;
}): Promise<HamsterQuestWorkflow> => {
  const resolved = await resolveContext(input);
  if (isWorkflow(resolved)) {
    throw new StarMasterApiError(resolved.setupMessage || 'HamsterQuest setup is incomplete', 409, resolved.setupIssue);
  }
  let completion = resolved.completion;
  if (!completion) {
    const house = selectSubmissionHouse(resolved.user, resolved.houses);
    if (!house) throw new StarMasterApiError('Join a HamsterQuest House before submitting', 409, 'house-required');
    try {
      const assignment = await assignStarMasterUserQuest({
        userId: resolved.user.id,
        questId: input.externalQuestId,
        houseId: house.house._id
      });
      completion = {
        _id: assignment.userQuestId,
        status: 'Active',
        houseId: assignment.houseId,
        lifecycleStatus: 'active',
        quest: { originalQuestId: input.externalQuestId, title: '', subQuests: [] }
      };
    } catch (error) {
      if (!(error instanceof StarMasterApiError) || error.status !== 409) throw error;
      completion = findCompletion(await listStarMasterUserQuests(resolved.user.id), input.externalQuestId);
      if (!completion) throw error;
    }
  }

  const result = await submitStarMasterUserQuest({
    userId: resolved.user.id,
    userQuestId: completion._id,
    subQuestId: input.stepId,
    description: input.message,
    imageProof: input.imageUrl
  });
  await HamsterQuestSubmission.findOneAndUpdate(
    { userId: input.discordId, skillId: input.skillId, externalSubQuestId: input.stepId },
    {
      $set: {
        externalUserId: resolved.user.id,
        externalQuestId: input.externalQuestId,
        externalUserQuestId: completion._id,
        externalSubQuestId: input.stepId,
        externalHouseId: idString(completion.houseId),
        externalSubmissionId: result.submission._id,
        status: 'pending',
        message: input.message || '',
        imageUrl: input.imageUrl,
        submittedAt: new Date(),
        syncedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
  const latest = findCompletion(await listStarMasterUserQuests(resolved.user.id), input.externalQuestId) || completion;
  return syncContext(input, { ...resolved, completion: latest });
};
