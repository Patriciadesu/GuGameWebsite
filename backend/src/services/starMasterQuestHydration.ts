import { AsyncTtlCache } from './asyncCache';
import {
  getOfficeQuestDescription,
  getOfficeQuestDescriptionParts,
  getOfficeQuestImageUrl,
  getOfficeQuests,
  isOfficeQuestCatalogConfigured,
  OfficeQuest
} from './officeQuestCatalog';

export type QuestDataStatus = 'remote' | 'local-fallback' | 'missing';

const questCatalogCache = new AsyncTtlCache<Map<string, OfficeQuest>>(30_000);

const loadQuestCatalog = () => questCatalogCache.get(async () => {
  const quests = await getOfficeQuests();
  return new Map(quests.map(quest => [quest._id, quest]));
});

export const projectStarMasterQuestOntoSkill = (skill: any, quest: OfficeQuest): any => {
  const description = getOfficeQuestDescription(quest.description);
  const descriptionParts = getOfficeQuestDescriptionParts(quest.description);
  const imageUrl = getOfficeQuestImageUrl(quest);
  const subQuests = (quest.subQuests || []).map((step, index) => ({
    externalId: step._id || `${quest._id}-step-${index + 1}`,
    title: step.title?.trim() || `Step ${index + 1}`,
    description: getOfficeQuestDescription(step.description),
    descriptionParts: getOfficeQuestDescriptionParts(step.description),
    hintParts: getOfficeQuestDescriptionParts(step.hint),
    hasHint: Array.isArray(step.hint) && step.hint.some(part => part?.content?.trim()),
    type: step.subQuestType
  }));
  return {
    ...skill,
    title: quest.title?.trim() || skill.constellationLabel || skill.title || 'Quest',
    description,
    previewClip: descriptionParts.filter(part => part.type === 'YouTube').map(part => part.content),
    contentYouTube: descriptionParts.filter(part => part.type === 'YouTube').map(part => part.content),
    contentGoogleDrive: descriptionParts.filter(part => part.type === 'GoogleDrive').map(part => part.content),
    nodePreview: {
      ...(skill.nodePreview || {}),
      ...(imageUrl ? { imageUrl } : { imageUrl: undefined }),
      summary: (description || `Open ${quest.title || 'this quest'} in HamsterQuest.`).slice(0, 280),
      outcomes: subQuests.map(step => step.title).slice(0, 4),
      actionLabel: 'Open Quest'
    },
    subQuests,
    questDataSource: 'hamsterquest',
    questDataStatus: 'remote' as QuestDataStatus
  };
};

const localFallback = (skill: any, status: Exclude<QuestDataStatus, 'remote'>) => ({
  ...skill,
  title: skill.title || skill.constellationLabel || 'Quest temporarily unavailable',
  description: skill.description || '',
  subQuests: Array.isArray(skill.subQuests) ? skill.subQuests : [],
  questDataSource: 'local',
  questDataStatus: status
});

export const hydrateSkillsFromStarMaster = async (
  skills: any[],
  options: { loader?: () => Promise<Map<string, OfficeQuest>>; failClosed?: boolean } = {}
): Promise<any[]> => {
  const linked = skills.filter(skill => skill.externalSource === 'star-master' && skill.externalQuestId);
  if (linked.length === 0 || (!options.loader && !isOfficeQuestCatalogConfigured())) return skills;
  try {
    const catalog = await (options.loader || loadQuestCatalog)();
    return skills.map(skill => {
      if (skill.externalSource !== 'star-master' || !skill.externalQuestId) return skill;
      const quest = catalog.get(skill.externalQuestId);
      return quest ? projectStarMasterQuestOntoSkill(skill, quest) : localFallback(skill, 'missing');
    });
  } catch (error) {
    if (options.failClosed || process.env.STAR_MASTER_QUEST_FAIL_CLOSED === 'true') throw error;
    console.warn('[StarMasterQuestHydration] Remote catalog unavailable; serving local fallback');
    return skills.map(skill =>
      skill.externalSource === 'star-master' && skill.externalQuestId
        ? localFallback(skill, 'local-fallback')
        : skill
    );
  }
};

export const clearStarMasterQuestHydrationCache = () => questCatalogCache.clear();
