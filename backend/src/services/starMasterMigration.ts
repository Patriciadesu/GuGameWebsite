import crypto from 'node:crypto';
import { StarMasterDescriptionPart, StarMasterQuest, StarMasterQuestMutation } from './starMasterApi';

export interface MigratableQuestStep {
  externalId?: string;
  title: string;
  description?: string;
  descriptionParts?: Array<{ type: string; content: string }>;
  type?: string;
  choices?: Array<{ text: string; isCorrect?: boolean }>;
  hintParts?: Array<{ type: string; content: string }>;
}

export interface MigratableStar {
  _id: unknown;
  title: string;
  description?: string;
  nodeType?: string;
  nodePreview?: { imageUrl?: string };
  previewClip?: string[];
  contentYouTube?: string[];
  contentGoogleDrive?: string[];
  subQuests?: MigratableQuestStep[];
}

export interface StarMasterQuestContentUpdates {
  title?: string;
  description?: string;
  nodePreview?: { imageUrl?: string } | null;
  previewClip?: string[] | string;
  contentYouTube?: string[] | string;
  contentGoogleDrive?: string[] | string;
  subQuests?: MigratableQuestStep[];
}

const DESCRIPTION_TYPES = new Set(['Text', 'Image', 'YouTube', 'GoogleDrive']);

const normalizePartType = (value: unknown): string => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (DESCRIPTION_TYPES.has(candidate)) return candidate;
  return 'Text';
};

export const normalizeMigrationDescriptionParts = (
  value: MigratableQuestStep['descriptionParts'],
  fallbackText = ''
): StarMasterDescriptionPart[] => {
  const parts = Array.isArray(value)
    ? value
      .filter(part => part && typeof part.content === 'string' && part.content.trim())
      .slice(0, 100)
      .map(part => ({ type: normalizePartType(part.type), content: part.content.trim().slice(0, 100_000) }))
    : [];
  if (parts.length > 0) return parts;
  const fallback = fallbackText.trim();
  return fallback ? [{ type: 'Text', content: fallback.slice(0, 100_000) }] : [];
};

export const buildStarMasterQuestMutation = (
  star: MigratableStar,
  houseId: string,
  tagId: string
): { payload: StarMasterQuestMutation; warnings: string[] } => {
  const warnings: string[] = [];
  const description = normalizeMigrationDescriptionParts(undefined, star.description || '');
  const imageUrl = star.nodePreview?.imageUrl?.trim();
  if (imageUrl && !description.some(part => part.type === 'Image' && part.content === imageUrl)) {
    description.push({ type: 'Image', content: imageUrl.slice(0, 100_000) });
  }
  const appendLinks = (values: string[] | undefined, type: 'YouTube' | 'GoogleDrive') => {
    for (const value of values || []) {
      const content = value?.trim();
      if (content && !description.some(part => part.type === type && part.content === content)) {
        description.push({ type, content: content.slice(0, 100_000) });
      }
    }
  };
  appendLinks([...(star.previewClip || []), ...(star.contentYouTube || [])], 'YouTube');
  appendLinks(star.contentGoogleDrive, 'GoogleDrive');

  const subQuests = (star.subQuests || [])
    .filter(step => step?.title?.trim())
    .slice(0, 100)
    .map((step, index) => {
      const requestedType = step.type === 'Choice' || step.type === 'System' ? step.type : 'ImageNote';
      let subQuestType: 'Choice' | 'ImageNote' | 'System' = requestedType;
      const choices = (step.choices || [])
        .filter(choice => choice && typeof choice.text === 'string' && choice.text.trim())
        .map(choice => ({ text: choice.text.trim().slice(0, 5_000), isCorrect: choice.isCorrect === true }));
      if (subQuestType === 'Choice' && choices.length === 0) {
        subQuestType = 'ImageNote';
        warnings.push(`Step ${index + 1} (${step.title.trim()}) had Choice type without choices and was migrated as ImageNote`);
      }
      if (subQuestType === 'System') {
        subQuestType = 'ImageNote';
        warnings.push(`Step ${index + 1} (${step.title.trim()}) had no portable System requirements and was migrated as ImageNote`);
      }
      return {
        title: step.title.trim().slice(0, 500),
        description: normalizeMigrationDescriptionParts(step.descriptionParts, step.description || ''),
        subQuestType,
        ...(step.hintParts?.length ? { hint: normalizeMigrationDescriptionParts(step.hintParts) } : {}),
        ...(subQuestType === 'Choice' ? { choices } : {})
      };
    });

  const type = star.nodeType === 'EXTRA' ? 'ExtraQuest' : 'MainQuest';
  return {
    payload: {
      title: star.title.trim().slice(0, 500),
      type,
      description,
      subQuests,
      tags: [tagId],
      assignedHouses: [houseId],
      completionRewards: [],
      ...(type === 'ExtraQuest' ? { canRepeat: false } : {})
    },
    warnings
  };
};

const strings = (value: string[] | string | undefined): string[] =>
  Array.isArray(value) ? value : value ? [value] : [];

/** Merge editor changes onto the authoritative remote Quest without relying on local Quest content. */
export const mergeStarMasterQuestMutation = (
  quest: StarMasterQuest,
  updates: StarMasterQuestContentUpdates,
  houseId: string,
  tagId: string
): StarMasterQuestMutation => {
  let description = (quest.description || [])
    .filter(part => typeof part?.content === 'string' && part.content.trim())
    .map(part => ({ type: normalizePartType(part.type), content: part.content.trim().slice(0, 100_000) }));

  if (updates.description !== undefined) {
    description = description.filter(part => part.type !== 'Text');
    const text = updates.description.trim();
    if (text) description.unshift({ type: 'Text', content: text.slice(0, 100_000) });
  }
  if (updates.nodePreview !== undefined) {
    description = description.filter(part => part.type !== 'Image');
    const imageUrl = updates.nodePreview?.imageUrl?.trim();
    if (imageUrl) description.push({ type: 'Image', content: imageUrl.slice(0, 100_000) });
  }
  if (updates.previewClip !== undefined || updates.contentYouTube !== undefined) {
    description = description.filter(part => part.type !== 'YouTube');
    for (const content of [...strings(updates.previewClip), ...strings(updates.contentYouTube)]) {
      const link = content.trim();
      if (link && !description.some(part => part.type === 'YouTube' && part.content === link)) {
        description.push({ type: 'YouTube', content: link.slice(0, 100_000) });
      }
    }
  }
  if (updates.contentGoogleDrive !== undefined) {
    description = description.filter(part => part.type !== 'GoogleDrive');
    for (const content of strings(updates.contentGoogleDrive)) {
      const link = content.trim();
      if (link && !description.some(part => part.type === 'GoogleDrive' && part.content === link)) {
        description.push({ type: 'GoogleDrive', content: link.slice(0, 100_000) });
      }
    }
  }

  const subQuests = updates.subQuests === undefined
    ? (quest.subQuests || []).map(step => ({
      title: step.title.trim().slice(0, 500),
      description: normalizeMigrationDescriptionParts(step.description),
      subQuestType: step.subQuestType,
      ...(step.hint?.length ? { hint: normalizeMigrationDescriptionParts(step.hint) } : {}),
      ...(step.subQuestType === 'Choice' ? { choices: step.choices || [] } : {})
    }))
    : buildStarMasterQuestMutation({
      _id: quest._id,
      title: updates.title || quest.title,
      subQuests: updates.subQuests
    }, houseId, tagId).payload.subQuests.map((step, index) => {
      const localStep = updates.subQuests?.[index];
      const remoteStep = (quest.subQuests || []).find(candidate =>
        Boolean(localStep?.externalId) && candidate._id === localStep?.externalId
      ) || quest.subQuests?.[index];
      const hint = localStep?.hintParts?.length
        ? normalizeMigrationDescriptionParts(localStep.hintParts)
        : normalizeMigrationDescriptionParts(remoteStep?.hint);
      return { ...step, ...(hint.length ? { hint } : {}) };
    });

  const type = quest.type === 'ExtraQuest' ? 'ExtraQuest' : 'MainQuest';
  return {
    title: (updates.title !== undefined ? updates.title : quest.title).trim().slice(0, 500),
    type,
    description,
    subQuests,
    tags: [tagId],
    assignedHouses: [houseId],
    completionRewards: [],
    ...(type === 'ExtraQuest' ? { canRepeat: false } : {})
  };
};

const normalizedQuestForHash = (quest: StarMasterQuestMutation | StarMasterQuest) => ({
  title: String(quest.title || '').trim(),
  type: String(quest.type || '').trim(),
  description: (quest.description || []).map(part => ({ type: part.type, content: part.content })),
  subQuests: (quest.subQuests || []).map(step => ({
    title: step.title,
    subQuestType: step.subQuestType,
    description: (step.description || []).map(part => ({ type: part.type, content: part.content })),
    hint: (step.hint || []).map(part => ({ type: part.type, content: part.content })),
    choices: step.choices || []
  })),
  tags: (quest.tags || []).map(tag => typeof tag === 'string' ? tag : tag._id).filter(Boolean).sort(),
  assignedHouses: (quest.assignedHouses || []).map(house =>
    typeof house === 'string' ? house : house._id
  ).filter(Boolean).sort()
});

export const starMasterQuestContentHash = (quest: StarMasterQuestMutation | StarMasterQuest): string =>
  crypto.createHash('sha256').update(JSON.stringify(normalizedQuestForHash(quest))).digest('hex');

export const remoteQuestMatchesMutation = (
  quest: StarMasterQuest,
  mutation: StarMasterQuestMutation
): boolean => starMasterQuestContentHash(quest) === starMasterQuestContentHash(mutation);
