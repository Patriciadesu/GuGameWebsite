import { randomUUID } from 'node:crypto';

export interface QuestStepIdentity {
  externalId?: string;
}

const cleanExternalId = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

export const normalizeQuestStepExternalIds = <T extends QuestStepIdentity>(
  steps: readonly T[],
  persistedSteps: readonly QuestStepIdentity[] = []
): Array<T & { externalId: string }> => {
  const persistedIds = persistedSteps.map(step => cleanExternalId(step.externalId));
  const persistedIdSet = new Set(persistedIds.filter((id): id is string => Boolean(id)));
  const assignedIds = new Set<string>();

  return steps.map((step, index) => {
    const proposedId = cleanExternalId(step.externalId);
    const persistedId = persistedIds[index];
    let externalId: string;

    if (proposedId && persistedIdSet.has(proposedId)) {
      externalId = proposedId;
    } else if (persistedId && !assignedIds.has(persistedId)) {
      externalId = persistedId;
    } else {
      externalId = proposedId || `step-${randomUUID()}`;
    }

    if (assignedIds.has(externalId)) {
      throw new Error(`Quest step externalId must be unique: ${externalId}`);
    }
    assignedIds.add(externalId);
    return { ...step, externalId };
  });
};
