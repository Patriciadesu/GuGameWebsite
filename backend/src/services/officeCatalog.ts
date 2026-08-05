import axios from 'axios';
import { AsyncTtlCache } from './asyncCache';

const getOfficeCatalogUrl = (): string =>
  process.env.OFFICE_CATALOG_URL || 'https://api.hamsterquest.com/api/v1/catalog/items';

export interface OfficeCatalogItem {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  type?: string;
  rarity?: string;
  isPixelArt?: boolean;
  isShinyPixelArt?: boolean;
  updatedAt?: string;
}

const getCatalogData = (data: unknown): OfficeCatalogItem[] => {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { data?: unknown }).data)) {
    throw new Error('Office catalog returned an invalid response');
  }

  return (data as { data: OfficeCatalogItem[] }).data;
};

const catalogCache = new AsyncTtlCache<OfficeCatalogItem[]>(60_000);

export const getOfficeCatalogItems = async (forceRefresh = false): Promise<OfficeCatalogItem[]> =>
  catalogCache.get(async () => {
    const response = await axios.get(getOfficeCatalogUrl(), {
      timeout: 10000,
      headers: { Accept: 'application/json' }
    });

    return getCatalogData(response.data);
  }, forceRefresh);

export const getOfficeCatalogItem = async (itemId: string): Promise<OfficeCatalogItem | null> => {
  try {
    const response = await axios.get(`${getOfficeCatalogUrl()}/${encodeURIComponent(itemId)}`, {
      timeout: 10000,
      headers: { Accept: 'application/json' }
    });
    const item = (response.data as { data?: OfficeCatalogItem }).data;
    return item && typeof item._id === 'string' ? item : null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
};
