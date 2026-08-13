"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOfficeCatalogItem = exports.getOfficeCatalogItems = void 0;
const axios_1 = __importDefault(require("axios"));
const asyncCache_1 = require("./asyncCache");
const getOfficeCatalogUrl = () => process.env.OFFICE_CATALOG_URL || 'https://api.hamsterquest.com/api/v1/catalog/items';
const getCatalogData = (data) => {
    if (!data || typeof data !== 'object' || !Array.isArray(data.data)) {
        throw new Error('Office catalog returned an invalid response');
    }
    return data.data;
};
const catalogCache = new asyncCache_1.AsyncTtlCache(60000);
const getOfficeCatalogItems = async (forceRefresh = false) => catalogCache.get(async () => {
    const response = await axios_1.default.get(getOfficeCatalogUrl(), {
        timeout: 10000,
        headers: { Accept: 'application/json' }
    });
    return getCatalogData(response.data);
}, forceRefresh);
exports.getOfficeCatalogItems = getOfficeCatalogItems;
const getOfficeCatalogItem = async (itemId) => {
    try {
        const response = await axios_1.default.get(`${getOfficeCatalogUrl()}/${encodeURIComponent(itemId)}`, {
            timeout: 10000,
            headers: { Accept: 'application/json' }
        });
        const item = response.data.data;
        return item && typeof item._id === 'string' ? item : null;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error) && error.response?.status === 404) {
            return null;
        }
        throw error;
    }
};
exports.getOfficeCatalogItem = getOfficeCatalogItem;
