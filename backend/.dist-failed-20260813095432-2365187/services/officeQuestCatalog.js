"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOfficeQuestById = exports.getOfficeQuestTags = exports.getOfficeQuestPage = exports.getOfficeQuests = exports.getOfficeQuestDetailHash = exports.getOfficeQuestDescriptionParts = exports.getOfficeQuestImageUrl = exports.getOfficeQuestDescription = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const getOfficeQuestUrl = () => process.env.STAR_MASTER_API_URL || process.env.HAMQUEST_STAR_MASTER_API_URL || process.env.OFFICE_QUEST_API_URL ||
    'https://test.api.hamsterquest.com/api/v1/integrations/star-master/quests';
const getStarMasterBearerToken = () => {
    const tokenFile = process.env.STAR_MASTER_BEARER_TOKEN_FILE;
    return process.env.STAR_MASTER_BEARER_TOKEN || (tokenFile ? fs_1.default.readFileSync(tokenFile, 'utf8').trim() : '');
};
const getOfficeQuestKey = () => {
    const keyFile = process.env.STAR_MASTER_API_KEY_FILE || process.env.HAMQUEST_STAR_MASTER_API_KEY_FILE;
    const key = process.env.STAR_MASTER_API_KEY || process.env.HAMQUEST_STAR_MASTER_API_KEY || process.env.OFFICE_QUEST_API_KEY ||
        (keyFile ? fs_1.default.readFileSync(keyFile, 'utf8').trim() : '');
    if (!key)
        throw new Error('STAR_MASTER_API_KEY is not configured');
    return key;
};
const getRequestHeaders = () => {
    const bearerToken = getStarMasterBearerToken();
    return {
        Accept: 'application/json',
        Authorization: bearerToken ? `Bearer ${bearerToken}` : `ApiKey ${getOfficeQuestKey()}`
    };
};
const usesProductionUserApi = () => Boolean(getStarMasterBearerToken());
const getOfficeQuestDescription = (description) => {
    if (typeof description === 'string')
        return description.trim();
    if (!Array.isArray(description))
        return '';
    return description
        .map(part => (!part?.type || part.type === 'Text') && typeof part.content === 'string' ? part.content.trim() : '')
        .filter(Boolean)
        .join('\n');
};
exports.getOfficeQuestDescription = getOfficeQuestDescription;
const getOfficeQuestImageUrl = (quest) => {
    const descriptions = [
        ...(Array.isArray(quest.description) ? quest.description : []),
        ...(quest.subQuests || []).flatMap(subQuest => Array.isArray(subQuest.description) ? subQuest.description : [])
    ];
    return descriptions.find(part => part?.type === 'Image' && typeof part.content === 'string' && part.content.trim())
        ?.content?.trim();
};
exports.getOfficeQuestImageUrl = getOfficeQuestImageUrl;
const getOfficeQuestDescriptionParts = (description) => {
    if (typeof description === 'string')
        return description.trim() ? [{ type: 'Text', content: description.trim() }] : [];
    if (!Array.isArray(description))
        return [];
    return description
        .filter(part => typeof part?.content === 'string' && part.content.trim())
        .map(part => ({ type: typeof part?.type === 'string' ? part.type : 'Text', content: part.content.trim() }));
};
exports.getOfficeQuestDescriptionParts = getOfficeQuestDescriptionParts;
const normalized = (value) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const getOfficeQuestDetailHash = (quest) => crypto_1.default
    .createHash('sha256')
    .update(JSON.stringify({
    title: normalized(quest.title || ''),
    type: normalized(quest.type || ''),
    description: normalized((0, exports.getOfficeQuestDescription)(quest.description)),
    subQuests: (quest.subQuests || []).map((subQuest) => ({
        title: normalized(String(subQuest?.title || '')),
        type: normalized(String(subQuest?.subQuestType || '')),
        description: (0, exports.getOfficeQuestDescriptionParts)(subQuest?.description).map(part => ({ type: normalized(part.type), content: normalized(part.content) }))
    }))
}))
    .digest('hex');
exports.getOfficeQuestDetailHash = getOfficeQuestDetailHash;
const getOfficeQuests = async () => {
    const quests = [];
    const limit = 100;
    let page = 1;
    let totalPages = 1;
    do {
        const result = await (0, exports.getOfficeQuestPage)({ page, limit });
        quests.push(...result.quests);
        totalPages = result.pagination.totalPages;
        page += 1;
    } while (page <= totalPages);
    return quests;
};
exports.getOfficeQuests = getOfficeQuests;
const getOfficeQuestPage = async (options) => {
    const productionUserApi = usesProductionUserApi();
    const response = await axios_1.default.get(getOfficeQuestUrl(), {
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
    if (!Array.isArray(quests))
        throw new Error('StarMaster API returned an invalid response');
    const total = Number(productionUserApi ? response.data?.total : response.data?.meta?.total) || quests.length;
    return {
        quests: quests,
        pagination: {
            page: productionUserApi ? options.page : Number(response.data.meta?.page) || options.page,
            limit: productionUserApi ? options.limit : Number(response.data.meta?.limit) || options.limit,
            total,
            totalPages: productionUserApi ? Math.max(1, Math.ceil(total / options.limit)) : Number(response.data.meta?.totalPages) || 1
        }
    };
};
exports.getOfficeQuestPage = getOfficeQuestPage;
const getOfficeQuestTags = async () => {
    const response = await axios_1.default.get(getOfficeQuestUrl().replace(/\/quests\/?$/, '/tags'), {
        timeout: 30000,
        headers: getRequestHeaders()
    });
    const tags = Array.isArray(response.data) ? response.data : response.data?.tags || response.data?.data;
    if (!Array.isArray(tags))
        throw new Error('StarMaster tag API returned an invalid response');
    return tags;
};
exports.getOfficeQuestTags = getOfficeQuestTags;
const getOfficeQuestById = async (externalQuestId) => {
    const response = await axios_1.default.get(`${getOfficeQuestUrl().replace(/\/+$/, '')}/${encodeURIComponent(externalQuestId)}`, {
        timeout: 30000,
        headers: getRequestHeaders()
    });
    const quest = usesProductionUserApi() ? response.data : response.data?.data;
    if (!quest?._id)
        throw new Error('StarMaster API returned an invalid quest');
    return quest;
};
exports.getOfficeQuestById = getOfficeQuestById;
