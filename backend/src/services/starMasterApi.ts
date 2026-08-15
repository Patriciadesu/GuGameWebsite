import axios, { AxiosRequestConfig } from 'axios';
import fs from 'node:fs';

export interface StarMasterHouse {
  _id: string;
  name: string;
  description?: string;
  owner?: unknown;
  quests?: string[];
}

export interface StarMasterTag {
  _id: string;
  name: string;
  color?: string;
}

export interface StarMasterDescriptionPart {
  _id?: string;
  type: string;
  content: string;
  isPixelArt?: boolean;
}

export interface StarMasterSubQuest {
  _id?: string;
  title: string;
  description?: StarMasterDescriptionPart[];
  subQuestType: 'Choice' | 'ImageNote' | 'System';
  choices?: Array<{ text: string; isCorrect?: boolean }>;
}

export interface StarMasterQuest {
  _id: string;
  title: string;
  type: string;
  description?: StarMasterDescriptionPart[];
  subQuests?: StarMasterSubQuest[];
  tags?: StarMasterTag[];
  assignedHouses?: Array<string | { _id?: string }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface StarMasterQuestMutation {
  title: string;
  type: 'MainQuest' | 'ExtraQuest';
  description: StarMasterDescriptionPart[];
  subQuests: Array<Omit<StarMasterSubQuest, '_id'>>;
  tags: string[];
  assignedHouses: string[];
  completionRewards?: unknown[];
  canRepeat?: boolean;
}

interface ListEnvelope<T> {
  data: T[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

interface DataEnvelope<T> {
  data: T;
}

export class StarMasterApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'StarMasterApiError';
  }
}

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

export const getStarMasterApiBaseUrl = (): string => {
  const configured = process.env.STAR_MASTER_API_BASE_URL ||
    process.env.HAMQUEST_STAR_MASTER_API_BASE_URL ||
    process.env.STAR_MASTER_API_URL ||
    process.env.HAMQUEST_STAR_MASTER_API_URL ||
    process.env.OFFICE_QUEST_API_URL ||
    'https://test.api.hamsterquest.com/api/v1/integrations/star-master';
  return stripTrailingSlashes(configured).replace(/\/quests$/, '');
};

const getApiKey = (): string => {
  const keyFile = process.env.STAR_MASTER_API_KEY_FILE || process.env.HAMQUEST_STAR_MASTER_API_KEY_FILE;
  const key = process.env.STAR_MASTER_API_KEY || process.env.HAMQUEST_STAR_MASTER_API_KEY ||
    process.env.OFFICE_QUEST_API_KEY || (keyFile ? fs.readFileSync(keyFile, 'utf8').trim() : '');
  if (!key) throw new StarMasterApiError('STAR_MASTER_API_KEY is not configured');
  return key;
};

const requestHeaders = () => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Authorization: `ApiKey ${getApiKey()}`
});

const toApiError = (error: unknown): StarMasterApiError => {
  if (error instanceof StarMasterApiError) return error;
  if (!axios.isAxiosError(error)) {
    return new StarMasterApiError(error instanceof Error ? error.message : 'StarMaster request failed');
  }
  const body = error.response?.data as {
    error?: { code?: string; message?: string; details?: unknown };
  } | undefined;
  return new StarMasterApiError(
    body?.error?.message || error.message || 'StarMaster request failed',
    error.response?.status,
    body?.error?.code,
    body?.error?.details
  );
};

const request = async <T>(config: AxiosRequestConfig): Promise<T> => {
  try {
    const response = await axios.request<T>({
      timeout: 30_000,
      ...config,
      headers: { ...requestHeaders(), ...(config.headers || {}) }
    });
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
};

export const listStarMasterHouses = async (): Promise<StarMasterHouse[]> => {
  const envelope = await request<DataEnvelope<StarMasterHouse[]>>({
    method: 'GET',
    url: `${getStarMasterApiBaseUrl()}/houses`
  });
  if (!Array.isArray(envelope.data)) throw new StarMasterApiError('StarMaster returned an invalid House list');
  return envelope.data;
};

export const createStarMasterHouse = async (input: {
  name: string;
  description: string;
  owner: string;
  showInPowerAnalysis: boolean;
}): Promise<StarMasterHouse> => {
  const envelope = await request<DataEnvelope<StarMasterHouse>>({
    method: 'POST',
    url: `${getStarMasterApiBaseUrl()}/houses`,
    data: input
  });
  if (!envelope.data?._id) throw new StarMasterApiError('StarMaster returned an invalid House');
  return envelope.data;
};

export const listStarMasterQuests = async (): Promise<StarMasterQuest[]> => {
  const quests: StarMasterQuest[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const envelope = await request<ListEnvelope<StarMasterQuest>>({
      method: 'GET',
      url: `${getStarMasterApiBaseUrl()}/quests`,
      params: { page, limit: 100 }
    });
    if (!Array.isArray(envelope.data)) throw new StarMasterApiError('StarMaster returned an invalid Quest list');
    quests.push(...envelope.data);
    totalPages = Math.max(1, Number(envelope.meta?.totalPages) || 1);
    page += 1;
  } while (page <= totalPages);
  return quests;
};

export const getStarMasterQuest = async (questId: string): Promise<StarMasterQuest> => {
  const envelope = await request<DataEnvelope<StarMasterQuest>>({
    method: 'GET',
    url: `${getStarMasterApiBaseUrl()}/quests/${encodeURIComponent(questId)}`
  });
  if (!envelope.data?._id) throw new StarMasterApiError('StarMaster returned an invalid Quest');
  return envelope.data;
};

export const createStarMasterQuest = async (input: StarMasterQuestMutation): Promise<StarMasterQuest> => {
  const envelope = await request<DataEnvelope<StarMasterQuest>>({
    method: 'POST',
    url: `${getStarMasterApiBaseUrl()}/quests`,
    data: input
  });
  if (!envelope.data?._id) throw new StarMasterApiError('StarMaster returned an invalid created Quest');
  return envelope.data;
};

export const updateStarMasterQuest = async (
  questId: string,
  input: Partial<StarMasterQuestMutation>
): Promise<StarMasterQuest> => {
  const envelope = await request<DataEnvelope<StarMasterQuest>>({
    method: 'PATCH',
    url: `${getStarMasterApiBaseUrl()}/quests/${encodeURIComponent(questId)}`,
    data: input
  });
  if (!envelope.data?._id) throw new StarMasterApiError('StarMaster returned an invalid updated Quest');
  return envelope.data;
};

export const deleteStarMasterQuest = async (questId: string): Promise<void> => {
  await request<void>({
    method: 'DELETE',
    url: `${getStarMasterApiBaseUrl()}/quests/${encodeURIComponent(questId)}`
  });
};

export const isMissingStarMasterQuest = (error: unknown): boolean =>
  error instanceof StarMasterApiError && error.status === 404;
