import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

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
  description?: Array<{ type?: string; content?: string; isPixelArt?: boolean }> | string;
  tags?: OfficeQuestTag[];
  subQuests?: Array<{ _id?: string; title?: string; description?: Array<{ type?: string; content?: string }> | string; subQuestType?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

const getOfficeQuestUrl = (): string =>
  process.env.STAR_MASTER_API_URL || process.env.HAMQUEST_STAR_MASTER_API_URL || process.env.OFFICE_QUEST_API_URL ||
  'https://test.api.hamsterquest.com/api/v1/integrations/star-master/quests';

const getStarMasterBearerToken = (): string => {
  const tokenFile = process.env.STAR_MASTER_BEARER_TOKEN_FILE;
  return process.env.STAR_MASTER_BEARER_TOKEN || (tokenFile ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
};

const getOfficeQuestKey = (): string => {
  const keyFile = process.env.STAR_MASTER_API_KEY_FILE || process.env.HAMQUEST_STAR_MASTER_API_KEY_FILE;
  const key = process.env.STAR_MASTER_API_KEY || process.env.HAMQUEST_STAR_MASTER_API_KEY || process.env.OFFICE_QUEST_API_KEY ||
    (keyFile ? fs.readFileSync(keyFile, 'utf8').trim() : '');
  if (!key) throw new Error('STAR_MASTER_API_KEY is not configured');
  return key;
};

const getRequestHeaders = () => {
  const bearerToken = getStarMasterBearerToken();
  return {
    Accept: 'application/json',
    Authorization: bearerToken ? `Bearer ${bearerToken}` : `ApiKey ${getOfficeQuestKey()}`
  };
};

const usesProductionUserApi = (): boolean => Boolean(getStarMasterBearerToken());

export const getOfficeQuestDescription = (description: OfficeQuest['description']): string => {
  if (typeof description === 'string') return description.trim();
  if (!Array.isArray(description)) return '';
  return description
    .map(part => (!part?.type || part.type === 'Text') && typeof part.content === 'string' ? part.content.trim() : '')
    .filter(Boolean)
    .join('\n');
};

export const getOfficeQuestImageUrl = (quest: OfficeQuest): string | undefined => {
  const descriptions = [
    ...(Array.isArray(quest.description) ? quest.description : []),
    ...(quest.subQuests || []).flatMap(subQuest => Array.isArray(subQuest.description) ? subQuest.description : [])
  ];
  return descriptions.find(part => part?.type === 'Image' && typeof part.content === 'string' && part.content.trim())
    ?.content?.trim();
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
    const result = await getOfficeQuestPage({ page, limit });
    quests.push(...result.quests);
    totalPages = result.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return quests;
};

export const getOfficeQuestPage = async (options: {
  page: number;
  limit: number;
  search?: string;
  type?: string;
  tagIds?: string;
  includeNoTags?: boolean;
}) => {
  const productionUserApi = usesProductionUserApi();
  const response = await axios.get(getOfficeQuestUrl(), {
    params: productionUserApi
      ? {
          offset: (options.page - 1) * options.limit,
          limit: options.limit,
          ...(options.search ? { search: options.search } : {}),
          ...(options.type ? { type: options.type } : {}),
          ...(options.tagIds ? { tagIds: options.tagIds } : {}),
          ...(options.includeNoTags ? { includeNoTags: '1' } : {})
        }
      : options,
    timeout: 30000,
    headers: getRequestHeaders()
  });
  const quests = productionUserApi ? response.data?.quests : response.data?.data;
  if (!Array.isArray(quests)) throw new Error('StarMaster API returned an invalid response');
  const total = Number(productionUserApi ? response.data?.total : response.data?.meta?.total) || quests.length;
  return {
    quests: quests as OfficeQuest[],
    pagination: {
      page: productionUserApi ? options.page : Number(response.data.meta?.page) || options.page,
      limit: productionUserApi ? options.limit : Number(response.data.meta?.limit) || options.limit,
      total,
      totalPages: productionUserApi ? Math.max(1, Math.ceil(total / options.limit)) : Number(response.data.meta?.totalPages) || 1
    }
  };
};

export const getOfficeQuestTags = async (): Promise<OfficeQuestTag[]> => {
  const response = await axios.get(getOfficeQuestUrl().replace(/\/quests\/?$/, '/tags'), {
    timeout: 30000,
    headers: getRequestHeaders()
  });
  const tags = Array.isArray(response.data) ? response.data : response.data?.tags || response.data?.data;
  if (!Array.isArray(tags)) throw new Error('StarMaster tag API returned an invalid response');
  return tags;
};

export const getOfficeQuestById = async (externalQuestId: string): Promise<OfficeQuest> => {
  const response = await axios.get(`${getOfficeQuestUrl().replace(/\/+$/, '')}/${encodeURIComponent(externalQuestId)}`, {
    timeout: 30000,
    headers: getRequestHeaders()
  });
  const quest = usesProductionUserApi() ? response.data : response.data?.data;
  if (!quest?._id) throw new Error('StarMaster API returned an invalid quest');
  return quest;
};
