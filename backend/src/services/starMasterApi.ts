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
  hint?: StarMasterDescriptionPart[];
  hintCost?: number;
}

export interface StarMasterUser {
  id: string;
  discordId: string;
  discordUsername?: string;
  discordNickname?: string;
  currentHouseId?: string | null;
}

export interface StarMasterUserHouse {
  house: StarMasterHouse;
  joinedAt?: string;
  lastActivatedAt?: string | null;
  disabledAt?: string | null;
}

export interface StarMasterUserQuestSubQuest {
  subQuestId: string;
  title: string;
  description?: StarMasterDescriptionPart[];
  subQuestType?: string;
  status: 'Active' | 'Pending' | 'Completed';
  submissionId?: string | null;
  hint?: StarMasterDescriptionPart[];
  hintPurchased?: boolean;
}

export interface StarMasterUserQuest {
  _id: string;
  status: 'Active' | 'Pending' | 'Completed';
  houseId?: string;
  lifecycleStatus: 'active' | 'completed';
  quest: {
    originalQuestId: string;
    title: string;
    subQuests: StarMasterUserQuestSubQuest[];
  };
}

export interface StarMasterQuestSubmission {
  message: string;
  submission: { _id: string; status?: string };
  mainQuestAutoSubmitted?: boolean;
  mainQuestSubmission?: { _id: string; status?: string } | null;
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

export const findStarMasterUserByDiscordId = async (discordId: string): Promise<StarMasterUser | null> => {
  const envelope = await request<ListEnvelope<StarMasterUser>>({
    method: 'GET',
    url: `${getStarMasterApiBaseUrl()}/users`,
    params: { discordIds: discordId, page: 1, limit: 100 }
  });
  if (!Array.isArray(envelope.data)) throw new StarMasterApiError('StarMaster returned an invalid User list');
  return envelope.data.find(user => user.discordId === discordId) || null;
};

export const listStarMasterUserHouses = async (userId: string): Promise<StarMasterUserHouse[]> => {
  const envelope = await request<DataEnvelope<StarMasterUserHouse[]>>({
    method: 'GET',
    url: `${getStarMasterApiBaseUrl()}/users/${encodeURIComponent(userId)}/houses`
  });
  if (!Array.isArray(envelope.data)) throw new StarMasterApiError('StarMaster returned an invalid User House list');
  return envelope.data;
};

export const listStarMasterUserQuests = async (userId: string): Promise<StarMasterUserQuest[]> => {
  const quests: StarMasterUserQuest[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const envelope = await request<ListEnvelope<StarMasterUserQuest>>({
      method: 'GET',
      url: `${getStarMasterApiBaseUrl()}/users/${encodeURIComponent(userId)}/quests`,
      params: { status: 'all', page, limit: 100 }
    });
    if (!Array.isArray(envelope.data)) throw new StarMasterApiError('StarMaster returned an invalid User Quest list');
    quests.push(...envelope.data);
    totalPages = Math.max(1, Number(envelope.meta?.totalPages) || 1);
    page += 1;
  } while (page <= totalPages);
  return quests;
};

export const getStarMasterUserQuest = async (
  userId: string,
  userQuestId: string
): Promise<StarMasterUserQuest> => {
  const envelope = await request<DataEnvelope<StarMasterUserQuest>>({
    method: 'GET',
    url: `${getStarMasterApiBaseUrl()}/users/${encodeURIComponent(userId)}/quests/${encodeURIComponent(userQuestId)}`
  });
  if (!envelope.data?._id) throw new StarMasterApiError('StarMaster returned an invalid User Quest');
  return envelope.data;
};

export const assignStarMasterUserQuest = async (input: {
  userId: string;
  questId: string;
  houseId: string;
}): Promise<{ userId: string; questId: string; houseId: string; userQuestId: string }> => {
  const envelope = await request<DataEnvelope<{ userId: string; questId: string; houseId: string; userQuestId: string }>>({
    method: 'POST',
    url: `${getStarMasterApiBaseUrl()}/users/${encodeURIComponent(input.userId)}/assign`,
    data: { questId: input.questId, houseId: input.houseId }
  });
  if (!envelope.data?.userQuestId) throw new StarMasterApiError('StarMaster returned an invalid Quest assignment');
  return envelope.data;
};

export const submitStarMasterUserQuest = async (input: {
  userId: string;
  userQuestId: string;
  subQuestId: string;
  description?: string;
  imageProof?: string;
}): Promise<StarMasterQuestSubmission> => {
  const envelope = await request<DataEnvelope<StarMasterQuestSubmission>>({
    method: 'POST',
    url: `${getStarMasterApiBaseUrl()}/users/${encodeURIComponent(input.userId)}/quests/${encodeURIComponent(input.userQuestId)}/submit`,
    data: {
      subQuestId: input.subQuestId,
      ...(input.description ? { description: input.description } : {}),
      ...(input.imageProof ? { imageProof: input.imageProof } : {})
    }
  });
  if (!envelope.data?.submission?._id) throw new StarMasterApiError('StarMaster returned an invalid submission');
  return envelope.data;
};

export const isMissingStarMasterQuest = (error: unknown): boolean =>
  error instanceof StarMasterApiError && error.status === 404;
