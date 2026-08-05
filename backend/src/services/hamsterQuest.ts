import axios from 'axios';

const getBaseUrl = () => (process.env.HAMSTERQUEST_API_URL || 'https://api.hamsterquest.com').replace(/\/+$/, '');
const getBotSecret = () => process.env.HAMSTERQUEST_BOT_SECRET || '';

const getBotHeaders = () => {
  const botSecret = getBotSecret();
  if (!botSecret) {
    throw new Error('HamsterQuest integration is not configured');
  }
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-bot-secret': botSecret
  };
};

export interface HamsterQuestInventoryItem {
  inventoryItemId: string;
  kind: string;
  itemId: string;
  itemName: string;
  itemType: string;
  icon?: string;
  rarity?: string;
  quantity: number;
  acquiredAt?: string;
}

export const isHamsterQuestConfigured = () => Boolean(getBotSecret());

export const ensureHamsterQuestUser = async (discordId: string) => {
  const response = await axios.post(
    `${getBaseUrl()}/api/v1/bot/users`,
    { discordId },
    { timeout: 15000, headers: getBotHeaders() }
  );
  return response.data?.user;
};

export const getHamsterQuestInventory = async (discordId: string): Promise<HamsterQuestInventoryItem[]> => {
  try {
    const response = await axios.get(
      `${getBaseUrl()}/api/v1/bot/inventory/${encodeURIComponent(discordId)}`,
      { timeout: 15000, headers: getBotHeaders() }
    );
    return Array.isArray(response.data?.inventory) ? response.data.inventory : [];
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      await ensureHamsterQuestUser(discordId);
      const response = await axios.get(
        `${getBaseUrl()}/api/v1/bot/inventory/${encodeURIComponent(discordId)}`,
        { timeout: 15000, headers: getBotHeaders() }
      );
      return Array.isArray(response.data?.inventory) ? response.data.inventory : [];
    }
    throw error;
  }
};

export const grantHamsterQuestItem = async (discordId: string, itemId: string, quantity = 1) => {
  const grant = () => axios.post(
    `${getBaseUrl()}/api/v1/bot/inventory/grant`,
    { discordId, itemId, quantity },
    { timeout: 15000, headers: getBotHeaders() }
  );

  try {
    return (await grant()).data;
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? String((error.response?.data as { message?: string; error?: string } | undefined)?.message || (error.response?.data as { error?: string } | undefined)?.error || '')
      : '';
    const missingUser = axios.isAxiosError(error) && error.response?.status === 404 && message.toLowerCase().includes('user not found');
    if (!missingUser) throw error;

    await ensureHamsterQuestUser(discordId);
    return (await grant()).data;
  }
};

export const useHamsterQuestItem = async (accessToken: string, inventoryItemId: string, quantity = 1) => {
  const response = await axios.post(
    `${getBaseUrl()}/api/v1/users/me/inventory/${encodeURIComponent(inventoryItemId)}/use`,
    { quantity },
    {
      timeout: 30000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  return response.data;
};

export const validateHamsterQuestToken = async (accessToken: string) => {
  const response = await axios.get(`${getBaseUrl()}/api/v1/users/me`, {
    timeout: 15000,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`
    }
  });
  return response.data;
};

export const getHamsterQuestLinkUrl = (callbackUrl: string) =>
  `${getBaseUrl()}/auth/discord?redirectUri=${encodeURIComponent(callbackUrl)}`;

export const isHamsterQuestUnauthorized = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 401;

export const getHamsterQuestErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'HamsterQuest request failed';
  }
  const data = error.response?.data as { message?: string; error?: string } | undefined;
  return data?.message || data?.error || error.message;
};
