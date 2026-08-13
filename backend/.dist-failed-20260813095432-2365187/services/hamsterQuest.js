"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHamsterQuestErrorMessage = exports.isHamsterQuestUnauthorized = exports.getHamsterQuestLinkUrl = exports.validateHamsterQuestToken = exports.useHamsterQuestItem = exports.grantHamsterQuestItem = exports.getHamsterQuestInventory = exports.ensureHamsterQuestUser = exports.isHamsterQuestConfigured = void 0;
const axios_1 = __importDefault(require("axios"));
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
const isHamsterQuestConfigured = () => Boolean(getBotSecret());
exports.isHamsterQuestConfigured = isHamsterQuestConfigured;
const ensureHamsterQuestUser = async (discordId) => {
    const response = await axios_1.default.post(`${getBaseUrl()}/api/v1/bot/users`, { discordId }, { timeout: 15000, headers: getBotHeaders() });
    return response.data?.user;
};
exports.ensureHamsterQuestUser = ensureHamsterQuestUser;
const getHamsterQuestInventory = async (discordId) => {
    try {
        const response = await axios_1.default.get(`${getBaseUrl()}/api/v1/bot/inventory/${encodeURIComponent(discordId)}`, { timeout: 15000, headers: getBotHeaders() });
        return Array.isArray(response.data?.inventory) ? response.data.inventory : [];
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error) && error.response?.status === 404) {
            await (0, exports.ensureHamsterQuestUser)(discordId);
            const response = await axios_1.default.get(`${getBaseUrl()}/api/v1/bot/inventory/${encodeURIComponent(discordId)}`, { timeout: 15000, headers: getBotHeaders() });
            return Array.isArray(response.data?.inventory) ? response.data.inventory : [];
        }
        throw error;
    }
};
exports.getHamsterQuestInventory = getHamsterQuestInventory;
const grantHamsterQuestItem = async (discordId, itemId, quantity = 1, operationId) => {
    const headers = {
        ...getBotHeaders(),
        ...(operationId ? { 'Idempotency-Key': operationId } : {})
    };
    const grant = () => axios_1.default.post(`${getBaseUrl()}/api/v1/bot/inventory/grant`, { discordId, itemId, quantity }, { timeout: 15000, headers });
    try {
        return (await grant()).data;
    }
    catch (error) {
        const message = axios_1.default.isAxiosError(error)
            ? String(error.response?.data?.message || error.response?.data?.error || '')
            : '';
        const missingUser = axios_1.default.isAxiosError(error) && error.response?.status === 404 && message.toLowerCase().includes('user not found');
        if (!missingUser)
            throw error;
        await (0, exports.ensureHamsterQuestUser)(discordId);
        return (await grant()).data;
    }
};
exports.grantHamsterQuestItem = grantHamsterQuestItem;
const useHamsterQuestItem = async (accessToken, inventoryItemId, quantity = 1) => {
    const response = await axios_1.default.post(`${getBaseUrl()}/api/v1/users/me/inventory/${encodeURIComponent(inventoryItemId)}/use`, { quantity }, {
        timeout: 30000,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
        }
    });
    return response.data;
};
exports.useHamsterQuestItem = useHamsterQuestItem;
const validateHamsterQuestToken = async (accessToken) => {
    const response = await axios_1.default.get(`${getBaseUrl()}/api/v1/users/me`, {
        timeout: 15000,
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`
        }
    });
    return response.data;
};
exports.validateHamsterQuestToken = validateHamsterQuestToken;
const getHamsterQuestLinkUrl = (callbackUrl) => `${getBaseUrl()}/auth/discord?redirectUri=${encodeURIComponent(callbackUrl)}`;
exports.getHamsterQuestLinkUrl = getHamsterQuestLinkUrl;
const isHamsterQuestUnauthorized = (error) => axios_1.default.isAxiosError(error) && error.response?.status === 401;
exports.isHamsterQuestUnauthorized = isHamsterQuestUnauthorized;
const getHamsterQuestErrorMessage = (error) => {
    if (!axios_1.default.isAxiosError(error)) {
        return error instanceof Error ? error.message : 'HamsterQuest request failed';
    }
    const data = error.response?.data;
    return data?.message || data?.error || error.message;
};
exports.getHamsterQuestErrorMessage = getHamsterQuestErrorMessage;
