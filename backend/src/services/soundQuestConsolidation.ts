import {
  StarMasterDescriptionPart,
  StarMasterQuest,
  StarMasterQuestMutation
} from './starMasterApi';

const portableParts = (parts: StarMasterDescriptionPart[] | undefined): StarMasterDescriptionPart[] =>
  (parts || [])
    .filter(part => part && typeof part.content === 'string' && part.content.trim())
    .map(part => ({
      type: ['Text', 'Image', 'YouTube', 'GoogleDrive'].includes(part.type) ? part.type : 'Text',
      content: part.content.trim().slice(0, 100_000)
    }));

const stepDescriptionFor = (quest: StarMasterQuest): StarMasterDescriptionPart[] => {
  const sourceSteps = quest.subQuests || [];
  if (sourceSteps.length === 0) return portableParts(quest.description);
  return sourceSteps.flatMap((step, index) => [
    ...(sourceSteps.length > 1
      ? [{ type: 'Text', content: `ส่วนที่ ${index + 1}: ${step.title}` }]
      : []),
    ...portableParts(step.description)
  ]);
};

export const buildConsolidatedSoundQuest = (input: {
  topicName: string;
  houseId: string;
  tagId: string;
  starQuests: StarMasterQuest[];
}): StarMasterQuestMutation => {
  if (input.starQuests.length === 0) throw new Error(`${input.topicName} has no Star quests to consolidate`);
  const previewImages = input.starQuests
    .flatMap(quest => portableParts(quest.description))
    .filter(part => part.type === 'Image')
    .slice(0, 4);
  return {
    title: input.topicName.trim().slice(0, 500),
    type: 'MainQuest',
    description: [
      { type: 'Text', content: `เส้นทาง Sound: ${input.topicName} · รวม ${input.starQuests.length} Step จาก GuGame` },
      ...previewImages
    ],
    subQuests: input.starQuests.map(quest => {
      const hint = (quest.subQuests || []).flatMap(step => portableParts(step.hint));
      return {
        title: quest.title.trim().slice(0, 500),
        description: stepDescriptionFor(quest),
        subQuestType: 'ImageNote' as const,
        ...(hint.length > 0 ? { hint } : {})
      };
    }),
    tags: [input.tagId],
    assignedHouses: [input.houseId],
    completionRewards: []
  };
};
