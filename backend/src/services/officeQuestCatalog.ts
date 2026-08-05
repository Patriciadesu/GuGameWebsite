import axios from 'axios';
import crypto from 'crypto';

export interface OfficeQuestTag {
  _id?: string;
  id?: string;
  name?: string;
  color?: string;
}

export interface OfficeQuest {
  _id: string;
  title?: string;
  type?: string;
  description?: Array<{ type?: string; content?: string }> | string;
  tags?: OfficeQuestTag[];
  subQuests?: Array<{ _id?: string; title?: string; description?: Array<{ type?: string; content?: string }> | string; subQuestType?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

const getOfficeQuestUrl = (): string =>
  process.env.OFFICE_QUEST_API_URL || 'https://office.hamsterquest.com/api/v1/integrations/star-master/quests';

const getOfficeQuestKey = (): string => {
  const key = process.env.OFFICE_QUEST_API_KEY;
  if (!key) throw new Error('OFFICE_QUEST_API_KEY is not configured');
  return key;
};

export const getOfficeQuestDescription = (description: OfficeQuest['description']): string => {
  if (typeof description === 'string') return description.trim();
  if (!Array.isArray(description)) return '';
  return description
    .map(part => typeof part?.content === 'string' ? part.content.trim() : '')
    .filter(Boolean)
    .join('\n');
};

export const getOfficeQuestDescriptionParts = (description: OfficeQuest['description']): Array<{ type: string; content: string }> => {
  if (typeof description === 'string') return description.trim() ? [{ type: 'Text', content: description.trim() }] : [];
  if (!Array.isArray(description)) return [];
  return description
    .filter(part => typeof part?.content === 'string' && part.content.trim())
    .map(part => ({ type: typeof part?.type === 'string' ? part.type : 'Text', content: part.content!.trim() }));
};

const normalized = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

export const getOfficeQuestDetailHash = (quest: OfficeQuest): string => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    title: normalized(quest.title || ''),
    type: normalized(quest.type || ''),
    description: normalized(getOfficeQuestDescription(quest.description)),
    subQuests: (quest.subQuests || []).map((subQuest: any) => ({
      title: normalized(String(subQuest?.title || '')),
      type: normalized(String(subQuest?.subQuestType || '')),
      description: getOfficeQuestDescriptionParts(subQuest?.description).map(part => ({ type: normalized(part.type), content: normalized(part.content) }))
    }))
  }))
  .digest('hex');

export const getOfficeQuests = async (): Promise<OfficeQuest[]> => {
  const quests: OfficeQuest[] = [];
  const limit = 100;
  let page = 1;
  let totalPages = 1;

  do {
    const response = await axios.get(getOfficeQuestUrl(), {
      params: { page, limit },
      timeout: 30000,
      headers: { Accept: 'application/json', 'x-office-sync-key': getOfficeQuestKey() }
    });
    const data = response.data?.data;
    if (!Array.isArray(data)) throw new Error('Office quest API returned an invalid response');
    quests.push(...data);
    totalPages = Number(response.data?.meta?.totalPages) || page;
    page += 1;
  } while (page <= totalPages);

  return quests;
};
