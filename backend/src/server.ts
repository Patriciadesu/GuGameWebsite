import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import axios from 'axios';
import multer from 'multer';
import crypto from 'crypto';
import User, { IUser } from './models/User';
import Guild, { IGuild } from './models/Guild';
import Skill, { ISkill } from './models/Skill';
import ConstellationMap from './models/ConstellationMap';
import SkillTreeSettings from './models/SkillTreeSettings';
import ApprovalRequest from './models/ApprovalRequest';
import ShopItem from './models/ShopItem';
import Purchase from './models/Purchase';
import ExternalPurchaseOperation from './models/ExternalPurchaseOperation';
import FictionContribution from './models/FictionContribution';
import FictionWritingLock from './models/FictionWritingLock';
import OfficeQuestCache from './models/OfficeQuestCache';
import { VoiceTracker } from './services/voiceTracker';
import { getOfficeCatalogItem, getOfficeCatalogItems, OfficeCatalogItem } from './services/officeCatalog';
import { getOfficeQuestById, getOfficeQuestDescription, getOfficeQuestDescriptionParts, getOfficeQuestDetailHash, getOfficeQuestImageUrl, getOfficeQuestPage, getOfficeQuestTags, getOfficeQuests } from './services/officeQuestCatalog';
import { AsyncTtlCache, KeyedAsyncTtlCache } from './services/asyncCache';
import { CachedSessionStore } from './services/cachedSessionStore';
import { KeyedBatchLoader } from './services/keyedBatchLoader';
import {
  completeExternalPurchase,
  PurchaseOperationError,
  reserveExternalPurchase,
  reserveLocalPurchase,
  rollbackExternalPurchase,
  rollbackLocalPurchase
} from './services/purchaseService';
import { normalizeQuestStepExternalIds } from './services/questStepNormalization';
import { retireShopItem, ShopItemOperationError } from './services/shopItemService';
import { areQuestStepsComplete, completeQuestStepOnce, unlockSkillOnce } from './services/progressionService';
import {
  assertConstellationMapCanBeDeleted,
  assertSkillCanBeDeleted,
  assertRoleAllowedForScope,
  ConstellationOperationError,
  mainQuestReadinessIssues,
  normalizeConstellationLayout,
  validateConstellationMapContents,
  validateConstellationMapLinkage,
  validateSkillMapAssignment
} from './services/constellationService';
import {
  ApprovalOperationError,
  approveQuestRequest
} from './services/approvalService';
import {
  acquireFictionWritingLock,
  contributeToFiction,
  FictionOperationError
} from './services/fictionService';
import {
  ensureHamsterQuestUser,
  getHamsterQuestErrorMessage,
  getHamsterQuestInventory,
  getHamsterQuestLinkUrl,
  grantHamsterQuestItem,
  isHamsterQuestConfigured,
  isHamsterQuestUnauthorized,
  useHamsterQuestItem,
  validateHamsterQuestToken
} from './services/hamsterQuest';

// Extend Express types for Passport
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
      email?: string;
      isAdmin: boolean;
      role: 'user' | 'admin' | 'super-admin';
      level: number;
      guildId?: string;
      state?: {
        nickname?: string;
        level: number;
        assetPoints: number;
        techTokens: number;
        voiceMinutesToday: number;
        totalVoiceMinutes: number;
        unlockedSkills: string[];
        completedQuestSteps: Array<{ skillId: string; stepId: string; completedAt: Date }>;
        completedQuestRewards: string[];
        hamsterQuestLinked: boolean;
        createdAt?: Date;
        updatedAt?: Date;
      };
    }
  }
}

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const FRONTEND_ORIGIN = (() => {
  try {
    return new URL(FRONTEND_URL).origin;
  } catch {
    return FRONTEND_URL;
  }
})();
const isAllowedClientOrigin = (origin: string, requestOrigin?: string) => {
  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  if (normalizedOrigin === FRONTEND_ORIGIN || normalizedOrigin === requestOrigin) return true;
  return process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(normalizedOrigin);
};
const ADMIN_GUILD_ID = process.env.ADMIN_GUILD_ID || '';
const ADMIN_ROLE_IDS = process.env.ADMIN_ROLE_IDS?.split(',') || [];
const SUPER_ADMIN_ROLE_IDS = process.env.SUPER_ADMIN_ROLE_IDS?.split(',') || [];
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const TEST_BYPASS_KEY = process.env.TEST_BYPASS_KEY || '';
const HAMSTERQUEST_USABLE_ITEM_TYPES = new Set(['GachaItem', 'DiscordNotifyItem']);
const hamsterInventorySyncCache = new KeyedAsyncTtlCache<any[]>(30_000, 2_000);
const userInventoryCache = new KeyedAsyncTtlCache<any[]>(15_000, 2_000);
const inventoryShopItemsCache = new AsyncTtlCache<Map<string, any>>(30_000);
const inventoryPurchasesLoader = new KeyedBatchLoader<any[]>(async discordIds => {
  const purchases = await Purchase.find({
    userId: { $in: discordIds },
    $or: [{ quantity: { $gt: 0 } }, { quantity: { $exists: false } }]
  }).sort({ updatedAt: -1 }).lean();
  const purchasesByUserId = new Map(discordIds.map(discordId => [discordId, [] as any[]]));
  purchases.forEach(purchase => {
    purchasesByUserId.get(purchase.userId)?.push(purchase);
  });
  return purchasesByUserId;
});

const getInventoryShopItemsById = () => inventoryShopItemsCache.get(async () => {
  const items = await ShopItem.find({}).lean();
  return new Map(items.map(item => [item._id.toString(), item]));
});

const invalidateInventoryItemCache = () => {
  inventoryShopItemsCache.clear();
  userInventoryCache.clear();
};

const getUserSummariesByDiscordId = async (discordIds: string[]) => {
  const uniqueIds = [...new Set(discordIds)];
  if (uniqueIds.length === 0) return new Map<string, any>();
  const users = await User.find({ discordId: { $in: uniqueIds } })
    .select('discordId username nickname discriminator avatar guildId')
    .lean();
  return new Map(users.map(user => [user.discordId, user]));
};

const presentUserSummary = (user: any) => user ? {
  username: user.nickname || user.username,
  nickname: user.nickname,
  discriminator: user.discriminator,
  avatar: user.avatar,
  guildId: user.guildId
} : null;

const presentShopItems = async (items: any[]) => {
  const itemObjects = items.map(item => typeof item.toObject === 'function' ? item.toObject() : item);
  const externalItemIds = itemObjects
    .filter(item => item.externalSource === 'office-catalog' && item.externalItemId)
    .map(item => item.externalItemId as string);

  if (externalItemIds.length === 0) {
    return itemObjects;
  }

  let catalogById = new Map<string, OfficeCatalogItem>();
  try {
    const catalogItems = await getOfficeCatalogItems();
    catalogById = new Map(catalogItems.map(item => [item._id, item]));
  } catch (error) {
    console.error('Unable to resolve Office catalog items:', error);
  }

  return itemObjects.map(item => {
    if (item.externalSource !== 'office-catalog' || !item.externalItemId) {
      return item;
    }

    const catalogItem = catalogById.get(item.externalItemId);
    return {
      ...item,
      title: catalogItem?.name || item.title || 'Unavailable Office catalog item',
      description: catalogItem?.description || item.description || '',
      imageUrl: catalogItem?.icon || item.imageUrl || '',
      externalItemType: catalogItem?.type || item.externalItemType,
      externalRarity: catalogItem?.rarity || item.externalRarity,
      externalItem: catalogItem || null,
      externalItemUnavailable: !catalogItem,
      isInventoryUsable: HAMSTERQUEST_USABLE_ITEM_TYPES.has(catalogItem?.type || item.externalItemType)
    };
  });
};

const performHamsterQuestInventorySync = async (discordId: string) => {
  if (!isHamsterQuestConfigured()) {
    throw new Error('HamsterQuest integration is not configured');
  }

  const [remoteInventory, catalogItems] = await Promise.all([
    getHamsterQuestInventory(discordId),
    getOfficeCatalogItems().catch(() => [] as OfficeCatalogItem[])
  ]);
  const catalogById = new Map(catalogItems.map(item => [item._id, item]));
  const remoteByItemId = new Map<string, { quantity: number; item: typeof remoteInventory[number] }>();

  remoteInventory.forEach(item => {
    if (!item.itemId) return;
    const current = remoteByItemId.get(item.itemId);
    if (current) {
      current.quantity += Math.max(1, Number(item.quantity) || 1);
    } else {
      remoteByItemId.set(item.itemId, {
        quantity: Math.max(1, Number(item.quantity) || 1),
        item
      });
    }
  });

  if (remoteByItemId.size > 0) {
    try {
      await ShopItem.bulkWrite([...remoteByItemId].map(([externalItemId, remoteEntry]) => {
        const catalogItem = catalogById.get(externalItemId);
        return {
          updateOne: {
            filter: { externalSource: 'office-catalog', externalItemId },
            update: {
              $set: {
                title: catalogItem?.name || remoteEntry.item.itemName || 'HamsterQuest Item',
                description: catalogItem?.description || '',
                imageUrl: catalogItem?.icon || remoteEntry.item.icon || '',
                externalItemType: catalogItem?.type || remoteEntry.item.itemType,
                externalRarity: catalogItem?.rarity || remoteEntry.item.rarity
              },
              $setOnInsert: {
                price: 0,
                isActive: false,
                isInventoryOnly: true,
                itemType: 'normal',
                availableToAllGuilds: true,
                guildIds: []
              }
            },
            upsert: true
          }
        };
      }), { ordered: false });
    } catch (error: any) {
      const writeErrors = error?.writeErrors || [];
      if (writeErrors.length === 0 || writeErrors.some((writeError: any) => writeError?.code !== 11000)) {
        throw error;
      }
    }
    invalidateInventoryItemCache();
  }

  const existingExternalItems = await ShopItem.find({
    externalSource: 'office-catalog',
    externalItemId: { $exists: true }
  }).select('_id externalItemId');

  const purchaseOperations = existingExternalItems.flatMap(shopItem => {
    const externalItemId = shopItem.externalItemId || '';
    const quantity = remoteByItemId.get(externalItemId)?.quantity || 0;
    if (quantity === 0) {
      return [{
        updateOne: {
          filter: { userId: discordId, shopItemId: shopItem._id },
          update: { $set: { quantity: 0 } },
          upsert: false
        }
      }];
    }
    return [{
      updateOne: {
        filter: { userId: discordId, shopItemId: shopItem._id },
        update: {
          $set: { quantity, status: 'completed' },
          $setOnInsert: { purchasedAt: new Date(), contributionCredits: 0 }
        },
        upsert: true
      }
    }];
  });
  if (purchaseOperations.length > 0) {
    await Purchase.bulkWrite(purchaseOperations as any[], { ordered: false });
  }

  userInventoryCache.delete(discordId);
  return remoteInventory;
};

const syncHamsterQuestInventory = async (discordId: string, forceRefresh = false) => {
  if (forceRefresh) hamsterInventorySyncCache.delete(discordId);
  return hamsterInventorySyncCache.get(discordId, () => performHamsterQuestInventorySync(discordId));
};

const loadPresentedUserInventory = async (discordId: string, resolveCatalog: boolean) => {
  const [purchases, shopItemsById] = await Promise.all([
    inventoryPurchasesLoader.load(discordId),
    getInventoryShopItemsById()
  ]);
  const inventoryRows = purchases.flatMap(purchase => {
    const shopItem = shopItemsById.get(purchase.shopItemId.toString());
    return shopItem ? [{ purchase, shopItem }] : [];
  });
  const presentedItems = resolveCatalog
    ? await presentShopItems(inventoryRows.map(row => row.shopItem))
    : inventoryRows.map(row => row.shopItem);

  return inventoryRows.flatMap(({ purchase }, index) => {
    const item = presentedItems[index];
    if (!item || item.itemType === 'fiction') return [];
    const externalType = item.externalItem?.type || item.externalItemType;
    return [{
      _id: purchase._id,
      shopItemId: item._id,
      title: item.title,
      description: item.description,
      imageUrl: item.imageUrl,
      quantity: purchase.quantity ?? 1,
      itemType: item.itemType,
      externalSource: item.externalSource,
      externalItemId: item.externalItemId,
      externalItemType: externalType,
      externalRarity: item.externalItem?.rarity || item.externalRarity,
      isUsable: item.externalSource === 'office-catalog' && HAMSTERQUEST_USABLE_ITEM_TYPES.has(externalType),
      purchasedAt: purchase.purchasedAt,
      lastUsedAt: purchase.lastUsedAt
    }];
  });
};

const presentUserInventory = (discordId: string, resolveCatalog = true) => {
  if (resolveCatalog) return loadPresentedUserInventory(discordId, true);
  return userInventoryCache.get(discordId, () => loadPresentedUserInventory(discordId, false));
};

const getShopGuildScope = async (availableToAllGuilds: unknown, guildIds: unknown) => {
  if (availableToAllGuilds !== false) {
    return { availableToAllGuilds: true, guildIds: [] as string[] };
  }

  if (!Array.isArray(guildIds)) {
    throw new Error('Select at least one guild or make the item available to all guilds');
  }

  const selectedGuildIds = [...new Set(guildIds.filter((guildId): guildId is string => typeof guildId === 'string' && guildId.trim().length > 0))];
  if (selectedGuildIds.length === 0) {
    throw new Error('Select at least one guild or make the item available to all guilds');
  }

  const validGuilds = await Guild.find({ _id: { $in: selectedGuildIds } }).select('_id').lean();
  if (validGuilds.length !== selectedGuildIds.length) {
    throw new Error('One or more selected guilds no longer exist');
  }

  return { availableToAllGuilds: false, guildIds: selectedGuildIds };
};

const isShopItemAvailableToUser = (shopItem: any, user: IUser): boolean =>
  shopItem.availableToAllGuilds !== false || Boolean(user.guildId && shopItem.guildIds?.includes(user.guildId));

interface ProgressionMember {
  userId: string;
  name: string;
  avatar: string | null;
  guildId?: string;
  progress: number;
}

interface ProgressionGuild {
  guildId: string;
  name: string;
  assetPointName: string;
  memberCount: number;
  progress: number;
}

interface ProgressionSnapshot {
  totalSkills: number;
  guildsById: Map<string, ProgressionGuild>;
  membersByGuildId: Map<string, ProgressionMember[]>;
  rankedGuilds: ProgressionGuild[];
  pendingApprovalsByUserId: Map<string, string[]>;
}

const activeSkillsCache = new AsyncTtlCache<any[]>(30_000);
const constellationMapPageCache = new KeyedAsyncTtlCache<{
  maps: any[];
  nextCursor: string | null;
}>(30_000, 500);
const progressionCache = new AsyncTtlCache<ProgressionSnapshot>(10_000);
const sessionUserCache = new KeyedAsyncTtlCache<Express.User | null>(15_000, 2_000);
const discordRoleCache = new KeyedAsyncTtlCache<'user' | 'admin' | 'super-admin'>(5 * 60_000, 2_000);

const getActiveSkills = () => activeSkillsCache.get(() =>
  Skill.find({ isActive: true }).sort({ layer: 1, position: 1 }).lean()
);

interface ConstellationMapPageOptions {
  constellationType?: 'main' | 'skill';
  scope?: 'discipline' | 'topic';
  parentMapId?: string;
  gatewaySkillId?: string;
  includeInactive: boolean;
  limit: number;
  cursor?: string;
}

const encodeConstellationCursor = (displayOrder: number, id: string) =>
  Buffer.from(JSON.stringify({ displayOrder, id }), 'utf8').toString('base64url');

const decodeConstellationCursor = (cursor: string) => {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Number.isFinite(parsed.displayOrder) || !mongoose.Types.ObjectId.isValid(parsed.id)) {
      throw new Error('Invalid cursor values');
    }
    return { displayOrder: Number(parsed.displayOrder), id: String(parsed.id) };
  } catch {
    throw new ConstellationOperationError('cursor is invalid');
  }
};

const getConstellationMapPage = (options: ConstellationMapPageOptions) => {
  const cacheKey = JSON.stringify(options);
  return constellationMapPageCache.get(cacheKey, async () => {
    const query: any = {
      ...(options.includeInactive ? {} : { isActive: true }),
      ...(options.constellationType === 'main' ? { constellationType: 'main' } : {}),
      ...(options.constellationType === 'skill' ? {
        $and: [{ $or: [{ constellationType: 'skill' }, { constellationType: { $exists: false } }] }]
      } : {}),
      ...(options.scope ? { scope: options.scope } : {}),
      ...(options.parentMapId ? { parentMapId: options.parentMapId } : {}),
      ...(options.gatewaySkillId ? { gatewaySkillId: options.gatewaySkillId } : {})
    };
    if (options.cursor) {
      const cursor = decodeConstellationCursor(options.cursor);
      query.$or = [
        { displayOrder: { $gt: cursor.displayOrder } },
        { displayOrder: cursor.displayOrder, _id: { $gt: cursor.id } }
      ];
    }

    const rows = await ConstellationMap.find(query)
      .sort({ displayOrder: 1, _id: 1 })
      .limit(options.limit + 1)
      .lean();
    const hasMore = rows.length > options.limit;
    const maps = hasMore ? rows.slice(0, options.limit) : rows;
    const lastMap = maps[maps.length - 1];
    return {
      maps,
      nextCursor: hasMore && lastMap
        ? encodeConstellationCursor(lastMap.displayOrder, lastMap._id.toString())
        : null
    };
  });
};

const presentSkillsForUser = (skills: any[], user: { role: string; unlockedSkills?: string[] }) => {
  const unlockedSkills = new Set(user.unlockedSkills || []);
  const isAdmin = user.role === 'admin' || user.role === 'super-admin';
  return skills.map(skill => {
    const isAssetNode = skill.nodeType === 'asset' || skill.nodeColor === 'blue';
    if (!isAdmin && isAssetNode && !unlockedSkills.has(skill._id.toString())) {
      return { ...skill, contentYouTube: [], contentGoogleDrive: [] };
    }
    return skill;
  });
};

const filterSkillsForUserLevel = async (skills: any[], userLevel: number) => {
  const mapIds = [...new Set(skills.map(skill => skill.constellationMapId?.toString()).filter(Boolean))];
  if (mapIds.length === 0) return skills;
  const maps = await ConstellationMap.find({ _id: { $in: mapIds } })
    .select('_id scope level constellationType')
    .lean();
  const mapsById = new Map(maps.map(map => [map._id.toString(), map]));
  const allowedTopicMaps = await ConstellationMap.find({
    scope: 'topic',
    isActive: true,
    level: { $gte: userLevel, $lte: userLevel + 2 }
  }).select('_id gatewaySkillId level').lean();
  const topicByGatewayId = new Map(allowedTopicMaps
    .filter(map => map.gatewaySkillId)
    .map(map => [map.gatewaySkillId!.toString(), map]));
  return skills.flatMap(skill => {
    if (!skill.constellationMapId) return [skill];
    const map = mapsById.get(skill.constellationMapId.toString());
    if (!map) return [];
    if (map.constellationType === 'main') return [skill];
    if (map.scope === 'discipline') {
      const topic = topicByGatewayId.get(skill._id.toString());
      return topic ? [{ ...skill, topicLevel: topic.level || 1 }] : [];
    }
    return (map.level || 1) === userLevel ? [skill] : [];
  });
};

const getProgressionSnapshot = () => progressionCache.get(async () => {
  const [users, guilds, skills, pendingApprovals] = await Promise.all([
    User.find().select('discordId username nickname avatar guildId unlockedSkills').lean(),
    Guild.find().select('name assetPointName').lean(),
    getActiveSkills(),
    ApprovalRequest.find({ status: 'pending' }).select('userId skillId').lean()
  ]);
  const progressSkillIds = new Set(
    skills
      .filter(skill => skill.nodeType !== 'marker' && skill.nodeColor !== 'yellow')
      .map(skill => skill._id.toString())
  );
  const membersByGuildId = new Map<string, ProgressionMember[]>();

  for (const user of users) {
    if (!user.guildId) continue;
    const guildId = user.guildId.toString();
    const progress = new Set((user.unlockedSkills || []).filter(skillId => progressSkillIds.has(skillId))).size;
    const members = membersByGuildId.get(guildId) || [];
    members.push({
      userId: user.discordId,
      name: user.nickname || user.username,
      avatar: user.avatar,
      guildId,
      progress
    });
    membersByGuildId.set(guildId, members);
  }

  const compareProgress = <T extends { progress: number; name: string }>(a: T, b: T) =>
    b.progress - a.progress || a.name.localeCompare(b.name);
  membersByGuildId.forEach(members => members.sort(compareProgress));

  const guildsById = new Map<string, ProgressionGuild>();
  for (const guild of guilds) {
    const guildId = guild._id.toString();
    const members = membersByGuildId.get(guildId) || [];
    guildsById.set(guildId, {
      guildId,
      name: guild.name,
      assetPointName: guild.assetPointName || 'Asset Point',
      memberCount: members.length,
      // Use average unlocked quests so larger guilds do not get an automatic score advantage.
      progress: members.length > 0
        ? members.reduce((total, member) => total + member.progress, 0) / members.length
        : 0
    });
  }

  return {
    totalSkills: progressSkillIds.size,
    guildsById,
    membersByGuildId,
    rankedGuilds: [...guildsById.values()].sort(compareProgress),
    pendingApprovalsByUserId: pendingApprovals.reduce((requestsByUser, request) => {
      const requests = requestsByUser.get(request.userId) || [];
      requests.push(request.skillId);
      requestsByUser.set(request.userId, requests);
      return requestsByUser;
    }, new Map<string, string[]>())
  };
});

const presentProgressionLeaderboard = (
  snapshot: ProgressionSnapshot,
  currentUserId: string,
  currentGuildId?: string
) => {
  const currentGuild = currentGuildId ? snapshot.guildsById.get(currentGuildId) : undefined;
  return {
    totalSkills: snapshot.totalSkills,
    currentGuild: currentGuild ? { id: currentGuild.guildId, name: currentGuild.name } : null,
    guildMembers: (currentGuildId ? snapshot.membersByGuildId.get(currentGuildId) || [] : [])
      .slice(0, 8)
      .map((member, index) => ({
        userId: member.userId,
        name: member.name,
        avatar: member.avatar,
        progress: member.progress,
        isCurrentUser: member.userId === currentUserId,
        rank: index + 1
      })),
    guilds: snapshot.rankedGuilds.slice(0, 8).map((guild, index) => ({
      guildId: guild.guildId,
      name: guild.name,
      memberCount: guild.memberCount,
      progress: guild.progress,
      rank: index + 1
    }))
  };
};

const invalidateSkillCaches = () => {
  activeSkillsCache.clear();
  progressionCache.clear();
};

const invalidateConstellationMapCache = () => {
  constellationMapPageCache.clear();
};

const deleteSkillsWithReferences = async (skillObjectIds: mongoose.Types.ObjectId[]) => {
  if (skillObjectIds.length === 0) return 0;
  const skillIds = skillObjectIds.map(id => id.toString());

  await Promise.all([
    Skill.updateMany(
      { _id: { $nin: skillObjectIds } },
      {
        $pull: {
          connections: { targetSkillId: { $in: skillIds } },
          prerequisites: { $in: skillIds }
        }
      }
    ),
    User.updateMany({}, {
      $pull: {
        unlockedSkills: { $in: skillIds },
        completedQuestSteps: { skillId: { $in: skillIds } },
        completedQuestRewards: { $in: skillIds }
      }
    }),
    ApprovalRequest.deleteMany({ skillId: { $in: skillIds } })
  ]);

  const result = await Skill.deleteMany({ _id: { $in: skillObjectIds } });
  sessionUserCache.clear();
  invalidateProgressionCache();
  invalidateSkillCaches();
  return result.deletedCount;
};

const collectConstellationMapIds = async (rootMapId: mongoose.Types.ObjectId) => {
  const collected = [rootMapId];
  let frontier = [rootMapId];
  while (frontier.length > 0) {
    const children = await ConstellationMap.find({ parentMapId: { $in: frontier } }).select('_id').lean();
    frontier = children.map(child => child._id);
    collected.push(...frontier);
  }
  return collected;
};

const sendConstellationError = (res: Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof ConstellationOperationError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: error.message });
  }
  if ((error as { code?: number })?.code === 11000) {
    return res.status(409).json({ error: 'That map slug, gateway skill, or Main Quest Level is already in use' });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
};

const getPlayerEligibleSkill = async (skillId: string, userLevel: number) => {
  const skill = await Skill.findOne({ _id: skillId, isActive: true });
  if (!skill?.constellationMapId) return null;

  const map = await ConstellationMap.findOne({
    _id: skill.constellationMapId,
    isActive: true,
    $or: [
      { constellationType: 'main', scope: 'discipline' },
      { constellationType: 'skill', scope: 'topic', level: userLevel }
    ]
  }).select('constellationType').lean();
  if (!map) return null;
  if (map.constellationType === 'main' && skill.mainQuestLevel !== userLevel) return null;
  return skill;
};

const assertValidConnectionTargets = async (
  sourceSkillId: string,
  sourceMapId: mongoose.Types.ObjectId | undefined,
  connections: unknown
) => {
  if (!Array.isArray(connections)) {
    throw new ConstellationOperationError('Connections must be an array');
  }
  if (!sourceMapId) {
    throw new ConstellationOperationError('Connected stars must belong to a constellation map', 409);
  }

  const targetIds = connections.map(connection => String(connection?.targetSkillId || ''));
  if (targetIds.some(targetId => !mongoose.Types.ObjectId.isValid(targetId))) {
    throw new ConstellationOperationError('Every connection target must be a valid star ID');
  }
  if (targetIds.includes(sourceSkillId)) {
    throw new ConstellationOperationError('A star cannot connect to itself');
  }
  if (new Set(targetIds).size !== targetIds.length) {
    throw new ConstellationOperationError('A star cannot contain duplicate connections');
  }
  if (targetIds.length === 0) return;

  const matchingTargets = await Skill.countDocuments({
    _id: { $in: targetIds },
    constellationMapId: sourceMapId
  });
  if (matchingTargets !== targetIds.length) {
    throw new ConstellationOperationError('Connection targets must exist in the same constellation map', 409);
  }
};

const mutableConstellationMapFields = [
  'name',
  'slug',
  'description',
  'constellationType',
  'scope',
  'parentMapId',
  'gatewaySkillId',
  'displayOrder',
  'isActive',
  'level',
  'visualTheme',
  'viewport',
  'schemaVersion'
] as const;

const applyConstellationMapFields = (map: InstanceType<typeof ConstellationMap>, body: any) => {
  for (const field of mutableConstellationMapFields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    map.set(field, body[field] === null ? undefined : body[field]);
  }
};

const assertValidLevel = (value: unknown, fieldName = 'level') => {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ConstellationOperationError(`${fieldName} must be a positive integer`);
  }
};

const invalidateProgressionCache = () => {
  progressionCache.clear();
};

const toSessionUser = (user: any): Express.User => ({
  id: user.discordId,
  username: user.nickname || user.username,
  discriminator: user.discriminator,
  avatar: user.avatar,
  email: user.email,
  isAdmin: user.isAdmin,
  role: user.role,
  level: user.level || 1,
  guildId: user.guildId,
  state: {
    nickname: user.nickname,
    level: user.level || 1,
    assetPoints: user.assetPoints || 0,
    techTokens: user.techTokens || 0,
    voiceMinutesToday: user.voiceMinutesToday || 0,
    totalVoiceMinutes: user.totalVoiceMinutes || 0,
    unlockedSkills: user.unlockedSkills || [],
    completedQuestSteps: user.completedQuestSteps || [],
    completedQuestRewards: user.completedQuestRewards || [],
    hamsterQuestLinked: Boolean(user.hamsterQuestLinkedAt),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }
});

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

if (!ADMIN_GUILD_ID || ADMIN_ROLE_IDS.length === 0) {
  console.warn('⚠️ ADMIN_GUILD_ID and ADMIN_ROLE_IDS not set - all users will be marked as regular users');
}

if (SUPER_ADMIN_ROLE_IDS.length === 0) {
  console.warn('⚠️ SUPER_ADMIN_ROLE_IDS not set - no users will have super-admin access');
} else {
  console.log(`✅ Super-Admin Role IDs loaded: ${SUPER_ADMIN_ROLE_IDS.join(', ')}`);
}

if (ADMIN_ROLE_IDS.length > 0) {
  console.log(`✅ Admin Role IDs loaded: ${ADMIN_ROLE_IDS.join(', ')}`);
}

console.log(`✅ Admin Guild ID: ${ADMIN_GUILD_ID}`);

// Initialize voice tracker (will be initialized after MongoDB connection)
let voiceTracker: VoiceTracker | null = null;

// Helper function to check user's role and get nickname in the admin guild
async function fetchUserRoleAndNickname(accessToken: string, userId: string): Promise<{ role: 'user' | 'admin' | 'super-admin', nickname?: string }> {
    // Fetch the user's guild member information
    const response = await axios.get(
      `https://discord.com/api/v10/users/@me/guilds/${ADMIN_GUILD_ID}/member`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const memberData = response.data;
    const userRoles: string[] = memberData.roles || [];
    const nickname = memberData.nick || undefined; // Guild nickname

    // Debug logging
    console.log(`🔍 Checking roles for user ${userId}:`);
    console.log(`  User's Discord roles: ${userRoles.join(', ')}`);
    console.log(`  Guild nickname: ${nickname || 'None (using username)'}`);
    console.log(`  Super-Admin role IDs to check: ${SUPER_ADMIN_ROLE_IDS.join(', ')}`);
    console.log(`  Admin role IDs to check: ${ADMIN_ROLE_IDS.join(', ')}`);

    // Check for super-admin role first (highest priority)
    const hasSuperAdminRole = SUPER_ADMIN_ROLE_IDS.some(roleId => {
      const trimmedRoleId = roleId.trim();
      const hasRole = userRoles.includes(trimmedRoleId);
      if (hasRole) {
        console.log(`  ✅ Found super-admin role: ${trimmedRoleId}`);
      }
      return hasRole;
    });
    
    if (hasSuperAdminRole) {
      console.log(`  🔐 Result: SUPER-ADMIN`);
      return { role: 'super-admin', nickname };
    }

    // Check for admin role
    const hasAdminRole = ADMIN_ROLE_IDS.some(roleId => {
      const trimmedRoleId = roleId.trim();
      const hasRole = userRoles.includes(trimmedRoleId);
      if (hasRole) {
        console.log(`  ✅ Found admin role: ${trimmedRoleId}`);
      }
      return hasRole;
    });
    
    if (hasAdminRole) {
      console.log(`  ⚡ Result: ADMIN`);
      return { role: 'admin', nickname };
    }

    // Default to regular user
    console.log(`  👤 Result: USER (no special roles found)`);
    return { role: 'user', nickname };
}

async function checkUserRoleAndNickname(accessToken: string, userId: string): Promise<{ role: 'user' | 'admin' | 'super-admin', nickname?: string }> {
  try {
    return await fetchUserRoleAndNickname(accessToken, userId);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ Error checking user roles: ${error.response?.status} - ${error.response?.statusText}`);
      console.error('Response data:', error.response?.data);
    } else {
      console.error('❌ Error checking user roles:', error);
    }
    return { role: 'user' };
  }
}

// Trust proxy for cookies behind Nginx
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// CORS configuration
app.use((req: Request, res: Response, next) => cors({
  origin: (origin, callback) => {
    const host = req.get('host');
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    if (!origin || isAllowedClientOrigin(origin, requestOrigin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Test-Bypass-Key', 'Idempotency-Key']
})(req, res, next));

// MongoDB connection
mongoose.connect(MONGODB_URI, MONGODB_DB_NAME ? { dbName: MONGODB_DB_NAME } : undefined)
  .then(() => {
    console.log('✅ Connected to MongoDB');
    
    // Initialize voice tracker after MongoDB connection
    if (DISCORD_BOT_TOKEN && ADMIN_GUILD_ID) {
      console.log('🎤 Initializing voice tracker...');
      voiceTracker = new VoiceTracker(ADMIN_GUILD_ID);
      voiceTracker.initialize(DISCORD_BOT_TOKEN).catch((error) => {
        console.error('❌ Failed to initialize voice tracker:', error);
      });
    } else {
      console.warn('⚠️ DISCORD_BOT_TOKEN or ADMIN_GUILD_ID not set - voice tracking disabled');
    }
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Session configuration
const persistentSessionStore = MongoStore.create({
  mongoUrl: MONGODB_URI,
  ...(MONGODB_DB_NAME ? { dbName: MONGODB_DB_NAME } : {}),
  touchAfter: 24 * 3600
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: new CachedSessionStore(persistentSessionStore),
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
app.use((req: Request, res: Response, next) => {
  if (!unsafeMethods.has(req.method) || !req.isAuthenticated()) return next();

  const source = req.get('origin') || req.get('referer');
  const host = req.get('host');
  if (!source || !host) {
    return res.status(403).json({ error: 'Forbidden', message: 'A trusted Origin or Referer is required' });
  }

  let sourceOrigin: string;
  try {
    sourceOrigin = new URL(source).origin;
  } catch {
    return res.status(403).json({ error: 'Forbidden', message: 'Invalid Origin or Referer' });
  }
  const requestOrigin = `${req.protocol}://${host}`;
  if (!isAllowedClientOrigin(sourceOrigin, requestOrigin)) {
    return res.status(403).json({ error: 'Forbidden', message: 'Origin is not allowed' });
  }
  next();
});

// Passport Discord Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  callbackURL: process.env.DISCORD_CALLBACK_URL || '',
  scope: ['identify', 'email', 'guilds.members.read']
},
async (accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    // Check user's role and get nickname from Discord guild
    const { role: userRole, nickname } = await checkUserRoleAndNickname(accessToken, profile.id);
    const isAdmin = userRole === 'admin' || userRole === 'super-admin';

    // Log the user's role
    const displayName = nickname || profile.username;
    if (userRole === 'super-admin') {
      console.log(`🔐 User ${displayName} (${profile.id}) logged in as SUPER-ADMIN`);
    } else if (userRole === 'admin') {
      console.log(`✅ User ${displayName} (${profile.id}) logged in as ADMIN`);
    } else {
      console.log(`ℹ️ User ${displayName} (${profile.id}) logged in as regular USER`);
    }

    let user = await User.findOne({ discordId: profile.id });

    if (user) {
      // Update existing user
      user.username = profile.username;
      user.nickname = nickname;
      user.discriminator = profile.discriminator;
      user.avatar = profile.avatar;
      user.email = profile.email;
      user.accessToken = accessToken;
      user.refreshToken = refreshToken;
      user.isAdmin = isAdmin;
      user.role = userRole;
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        discordId: profile.id,
        username: profile.username,
        nickname: nickname,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
        email: profile.email,
        accessToken,
        refreshToken,
        isAdmin,
        role: userRole
      });
    }

    if (isHamsterQuestConfigured()) {
      try {
        await ensureHamsterQuestUser(user.discordId);
      } catch (error) {
        console.error(`Unable to sync HamsterQuest account for Discord user ${user.discordId}:`, getHamsterQuestErrorMessage(error));
      }
    }

    const sessionUser = toSessionUser(user);
    sessionUserCache.set(user.discordId, sessionUser);
    discordRoleCache.set(user.discordId, userRole);
    return done(null, sessionUser);
  } catch (error) {
    return done(error, null);
  }
}));

// Serialize user
passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

// Deserialize user
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await sessionUserCache.get(id, async () => {
      const storedUser = await User.findOne({ discordId: id })
        .select('discordId username nickname discriminator avatar email isAdmin role level guildId assetPoints techTokens voiceMinutesToday totalVoiceMinutes unlockedSkills completedQuestSteps completedQuestRewards hamsterQuestLinkedAt createdAt updatedAt')
        .lean();
      return storedUser ? toSessionUser(storedUser) : null;
    });
    done(null, user || false);
  } catch (error) {
    done(error, null);
  }
});

// Middleware for role-based access control
const requireAuth = (req: Request, res: Response, next: any) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized', message: 'You must be logged in to access this resource' });
};

const refreshPrivilegedRole = async (req: Request) => {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super-admin')) return req.user?.role || 'user';
  const storedUser = await User.findOne({ discordId: req.user.id }).select('accessToken role').lean();
  if (!storedUser?.accessToken) {
    if (process.env.NODE_ENV !== 'production') return req.user.role;
    throw new Error('Discord access token is unavailable for role verification');
  }

  const role = await discordRoleCache.get(req.user.id, async () =>
    (await fetchUserRoleAndNickname(storedUser.accessToken!, req.user!.id)).role
  );
  if (storedUser.role !== role) {
    await User.updateOne(
      { discordId: req.user.id },
      { $set: { role, isAdmin: role === 'admin' || role === 'super-admin' } }
    );
    sessionUserCache.delete(req.user.id);
  }
  req.user.role = role;
  req.user.isAdmin = role === 'admin' || role === 'super-admin';
  return role;
};

const requireAdmin = async (req: Request, res: Response, next: any) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
  }
  try {
    const role = await refreshPrivilegedRole(req);
    if (role === 'admin' || role === 'super-admin') return next();
    return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
  } catch (error) {
    console.error('Unable to refresh Discord admin role:', error);
    return res.status(503).json({ error: 'Role verification unavailable', message: 'Try again shortly' });
  }
};

const requireSuperAdmin = async (req: Request, res: Response, next: any) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(403).json({ error: 'Forbidden', message: 'Super-admin access required' });
  }
  try {
    const role = await refreshPrivilegedRole(req);
    return role === 'super-admin'
      ? next()
      : res.status(403).json({ error: 'Forbidden', message: 'Super-admin access required' });
  } catch (error) {
    console.error('Unable to refresh Discord super-admin role:', error);
    return res.status(503).json({ error: 'Role verification unavailable', message: 'Try again shortly' });
  }
};

const requireConstellationSkillEditor = async (req: Request, res: Response, next: any) => {
  if (!req.isAuthenticated() || !req.user || (req.user.role !== 'admin' && req.user.role !== 'super-admin')) {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
  }

  try {
    const refreshedRole = await refreshPrivilegedRole(req);
    if (refreshedRole !== 'admin' && refreshedRole !== 'super-admin') {
      return res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
    }
    if (refreshedRole === 'super-admin') return next();
    const skillId = req.params.id;
    if (!skillId) {
      const constellationMapId = String(req.body.constellationMapId || '');
      if (!mongoose.Types.ObjectId.isValid(constellationMapId)) {
        return res.status(403).json({ error: 'Forbidden', message: 'Admins can only create Constellation stars' });
      }
      const mapExists = await ConstellationMap.exists({ _id: constellationMapId });
      return mapExists ? next() : res.status(404).json({ error: 'Constellation map not found' });
    }

    if (!mongoose.Types.ObjectId.isValid(skillId)) {
      return res.status(400).json({ error: 'Invalid skill ID' });
    }
    const constellationSkillExists = await Skill.exists({ _id: skillId, constellationMapId: { $exists: true } });
    return constellationSkillExists
      ? next()
      : res.status(403).json({ error: 'Forbidden', message: 'Admins can only edit Constellation stars' });
  } catch (error) {
    console.error('Error authorizing Constellation editor:', error);
    return res.status(500).json({ error: 'Unable to verify Constellation editor access' });
  }
};

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'GuGame Backend API' });
});

// Discord OAuth routes
app.get('/api/auth/discord', passport.authenticate('discord'));

app.get('/api/auth/discord/callback',
  passport.authenticate('discord', { 
    failureRedirect: `${FRONTEND_URL}/login?error=auth_failed`
  }),
  (req: Request, res: Response) => {
    res.redirect(`${FRONTEND_URL}/mainmenu`);
  }
);

// Check authentication status
app.get('/api/auth/user', (req: Request, res: Response) => {
  if (req.isAuthenticated()) {
    const { state: _state, ...user } = req.user!;
    res.json({ authenticated: true, user });
  } else {
    res.json({ authenticated: false });
  }
});

const presentMainMenuUser = (user: Express.User, assetPointName: string) => ({
  discordId: user.id,
  username: user.username,
  nickname: user.state?.nickname,
  discriminator: user.discriminator,
  avatar: user.avatar,
  email: user.email,
  role: user.role,
  level: user.state?.level || 1,
  guildId: user.guildId,
  assetPoints: user.state?.assetPoints || 0,
  assetPointName,
  techTokens: user.state?.techTokens || 0,
  voiceMinutesToday: user.state?.voiceMinutesToday || 0,
  totalVoiceMinutes: user.state?.totalVoiceMinutes || 0,
  unlockedSkills: user.state?.unlockedSkills || [],
  isAdmin: user.isAdmin,
  createdAt: user.state?.createdAt,
  updatedAt: user.state?.updatedAt
});

const loadMainMenuState = async (user: Express.User, includeInitialData: boolean) => {
  const progressionSnapshot = await getProgressionSnapshot();
  if (!user.state) return null;

  const guildId = user.guildId?.toString();
  const assetPointName = guildId
    ? progressionSnapshot.guildsById.get(guildId)?.assetPointName || 'Asset Point'
    : 'Asset Point';
  const commonState = {
    userStats: presentMainMenuUser(user, assetPointName),
    unlockedSkills: user.state.unlockedSkills,
    questProgress: {
      completedSteps: user.state.completedQuestSteps.map(step => ({
        skillId: step.skillId,
        stepId: step.stepId
      })),
      completedQuests: user.state.completedQuestRewards,
      pendingApprovalSkillIds: progressionSnapshot.pendingApprovalsByUserId.get(user.id) || []
    },
    progressionLeaderboard: presentProgressionLeaderboard(
      progressionSnapshot,
      user.id,
      guildId
    )
  };

  if (!includeInitialData) return commonState;
  const [allSkills, inventoryItems] = await Promise.all([
    getActiveSkills(),
    presentUserInventory(user.id, false)
  ]);
  const skills = user.role === 'admin' || user.role === 'super-admin'
    ? allSkills
    : await filterSkillsForUserLevel(allSkills, user.state.level || 1);
  return {
    ...commonState,
    skills: presentSkillsForUser(skills, {
      role: user.role,
      unlockedSkills: user.state.unlockedSkills
    }),
    inventory: {
      items: inventoryItems,
      hamsterQuestLinked: user.state.hamsterQuestLinked,
      hamsterQuestConfigured: isHamsterQuestConfigured(),
      syncWarning: null
    }
  };
};

app.get('/api/mainmenu/bootstrap', requireAuth, async (req: Request, res: Response) => {
  try {
    const state = await loadMainMenuState(req.user!, true);
    if (!state) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, ...state });
  } catch (error) {
    console.error('Error loading Main Menu bootstrap:', error);
    res.status(500).json({ error: 'Failed to load Main Menu' });
  }
});

app.get('/api/mainmenu/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const state = await loadMainMenuState(req.user!, false);
    if (!state) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, ...state });
  } catch (error) {
    console.error('Error refreshing Main Menu status:', error);
    res.status(500).json({ error: 'Failed to refresh Main Menu status' });
  }
});

if (process.env.NODE_ENV !== 'production') {
  // Test-only entrypoint. Production never registers this route.
  app.post('/api/auth/test-login', async (req: Request, res: Response) => {
    const remoteAddress = req.socket.remoteAddress || '';
    const isLoopbackRequest = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(remoteAddress);
    const suppliedKey = req.get('x-test-bypass-key') || '';
    const suppliedKeyBuffer = Buffer.from(suppliedKey);
    const expectedKeyBuffer = Buffer.from(TEST_BYPASS_KEY);
    const hasValidTestKey = Boolean(
      TEST_BYPASS_KEY &&
      suppliedKeyBuffer.length === expectedKeyBuffer.length &&
      crypto.timingSafeEqual(suppliedKeyBuffer, expectedKeyBuffer)
    );
    if (!hasValidTestKey && !isLoopbackRequest) {
      return res.status(404).end();
    }

    try {
      const requestedUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
      const testUser = requestedUserId
        ? await User.findOne({ discordId: requestedUserId })
        : await User.findOne({ role: 'super-admin' }) || await User.findOne({ role: 'admin' });
      if (!testUser) {
        return res.status(503).json({ error: 'No admin account is available for test login' });
      }

      const sessionUser = toSessionUser(testUser);
      sessionUserCache.set(testUser.discordId, sessionUser);
      req.login(sessionUser, (error) => {
        if (error) {
          console.error('Test login failed:', error);
          return res.status(500).json({ error: 'Failed to create test session' });
        }
        res.redirect(`${FRONTEND_URL}/admin`);
      });
    } catch (error) {
      console.error('Error creating test login:', error);
      res.status(500).json({ error: 'Failed to create test session' });
    }
  });
}

// Logout route
app.post('/api/auth/logout', (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Protected routes examples
// Example: User-only route (requires authentication)
app.get('/api/user/profile', requireAuth, (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'User profile accessed',
    user: req.user 
  });
});

// Example: Admin route (requires admin or super-admin role)
app.get('/api/admin/dashboard', requireAdmin, (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'Admin dashboard accessed',
    role: req.user?.role 
  });
});

// Example: Super-admin route (requires super-admin role only)
app.get('/api/super-admin/settings', requireSuperAdmin, (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'Super-admin settings accessed',
    role: req.user?.role 
  });
});

// ===== GUILD MANAGEMENT ROUTES =====

// Create a new guild (super-admin only)
app.post('/api/guilds', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, guildLeaderIds, adminIds } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Guild name is required' });
    }

    // Check if guild name already exists
    const existingGuild = await Guild.findOne({ name });
    if (existingGuild) {
      return res.status(400).json({ error: 'Guild name already exists' });
    }

    // Verify guild leaders exist and have appropriate role
    const leaderIdsArray = Array.isArray(guildLeaderIds) ? guildLeaderIds : (guildLeaderIds ? [guildLeaderIds] : []);
    if (leaderIdsArray.length > 0) {
      for (const leaderId of leaderIdsArray) {
        const leader = await User.findOne({ discordId: leaderId });
        if (!leader) {
          return res.status(400).json({ error: `Guild leader ${leaderId} not found` });
        }
        if (leader.role !== 'admin' && leader.role !== 'super-admin') {
          return res.status(400).json({ error: 'Guild leader must be an admin or super-admin' });
        }
      }
    }

    const guild = await Guild.create({
      name,
      guildLeaderIds: leaderIdsArray,
      adminIds: adminIds || [],
      createdBy: req.user!.id
    });

    invalidateProgressionCache();
    res.json({ success: true, guild });
  } catch (error) {
    console.error('Error creating guild:', error);
    res.status(500).json({ error: 'Failed to create guild' });
  }
});

// Get all guilds (public - for guild selection)
app.get('/api/guilds', async (req: Request, res: Response) => {
  try {
    const guilds = await Guild.find().sort({ createdAt: -1 });
    res.json({ success: true, guilds });
  } catch (error) {
    console.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// Get guild by ID (admin and super-admin)
app.get('/api/guilds/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const guild = await Guild.findById(req.params.id);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }
    res.json({ success: true, guild });
  } catch (error) {
    console.error('Error fetching guild:', error);
    res.status(500).json({ error: 'Failed to fetch guild' });
  }
});

// Update guild (super-admin only)
app.put('/api/guilds/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, guildLeaderIds, adminIds, assetPointName } = req.body;
    const guild = await Guild.findById(req.params.id);

    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    // Verify guild leaders if provided
    if (guildLeaderIds !== undefined) {
      const leaderIdsArray = Array.isArray(guildLeaderIds) ? guildLeaderIds : (guildLeaderIds ? [guildLeaderIds] : []);
      if (leaderIdsArray.length > 0) {
        for (const leaderId of leaderIdsArray) {
          const leader = await User.findOne({ discordId: leaderId });
          if (!leader) {
            return res.status(400).json({ error: `Guild leader ${leaderId} not found` });
          }
          if (leader.role !== 'admin' && leader.role !== 'super-admin') {
            return res.status(400).json({ error: 'Guild leader must be an admin or super-admin' });
          }
        }
      }
      guild.guildLeaderIds = leaderIdsArray;
    }

    if (name) guild.name = name;
    if (adminIds !== undefined) guild.adminIds = adminIds;
    if (assetPointName !== undefined) guild.assetPointName = assetPointName;

    await guild.save();
    invalidateProgressionCache();
    res.json({ success: true, guild });
  } catch (error) {
    console.error('Error updating guild:', error);
    res.status(500).json({ error: 'Failed to update guild' });
  }
});

// Delete guild (super-admin only)
app.delete('/api/guilds/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const guild = await Guild.findByIdAndDelete(req.params.id);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    // Remove guild association from all users
    await User.updateMany({ guildId: req.params.id }, { $unset: { guildId: '' } });

    sessionUserCache.clear();
    invalidateProgressionCache();
    res.json({ success: true, message: 'Guild deleted successfully' });
  } catch (error) {
    console.error('Error deleting guild:', error);
    res.status(500).json({ error: 'Failed to delete guild' });
  }
});

// Get guild members (admin and super-admin)
app.get('/api/guilds/:id/members', requireAdmin, async (req: Request, res: Response) => {
  try {
    const members = await User.find({ guildId: req.params.id }).select('-accessToken -refreshToken');
    
    // Transform members to use nickname as username
    const transformedMembers = members.map(member => ({
      discordId: member.discordId,
      username: member.nickname || member.username, // Use nickname if available
      discriminator: member.discriminator,
      avatar: member.avatar,
      email: member.email,
      role: member.role,
      guildId: member.guildId,
      assetPoints: member.assetPoints,
      techTokens: member.techTokens,
      voiceMinutesToday: member.voiceMinutesToday,
      totalVoiceMinutes: member.totalVoiceMinutes || 0,
      isAdmin: member.isAdmin
    }));
    
    res.json({ success: true, members: transformedMembers });
  } catch (error) {
    console.error('Error fetching guild members:', error);
    res.status(500).json({ error: 'Failed to fetch guild members' });
  }
});

// Get guild statistics (for guild leaders)
app.get('/api/guilds/:id/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const guild = await Guild.findById(req.params.id);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    // Get all members
    const members = await User.find({ guildId: req.params.id }).select('-accessToken -refreshToken');
    
    // Calculate statistics
    const totalMembers = members.length;
    const totalAssetPoints = members.reduce((sum, member) => sum + member.assetPoints, 0);
    const totalTechTokens = members.reduce((sum, member) => sum + member.techTokens, 0);
    const totalVoiceMinutes = members.reduce((sum, member) => sum + member.voiceMinutesToday, 0);
    
    // Get guild leaders info
    const guildLeaders = [];
    if (guild.guildLeaderIds && guild.guildLeaderIds.length > 0) {
      for (const leaderId of guild.guildLeaderIds) {
        const leader = await User.findOne({ discordId: leaderId }).select('-accessToken -refreshToken');
        if (leader) {
          guildLeaders.push({
            discordId: leader.discordId,
            username: leader.nickname || leader.username,
            role: leader.role
          });
        }
      }
    }

    res.json({
      success: true,
      stats: {
        guildName: guild.name,
        guildLeaders,
        totalMembers,
        totalAssetPoints,
        totalTechTokens,
        totalVoiceMinutes,
        topMembers: members
          .sort((a, b) => b.assetPoints - a.assetPoints)
          .slice(0, 5)
          .map(m => ({
            username: m.nickname || m.username,
            assetPoints: m.assetPoints
          }))
      }
    });
  } catch (error) {
    console.error('Error fetching guild stats:', error);
    res.status(500).json({ error: 'Failed to fetch guild stats' });
  }
});

// Helper function to get asset point name for a user based on their guild
async function getAssetPointName(userId: string): Promise<string> {
  try {
    const user = await User.findOne({ discordId: userId });
    if (!user || !user.guildId) {
      return 'Asset Point'; // Default name if no guild
    }
    
    const guild = await Guild.findById(user.guildId);
    if (!guild) {
      return 'Asset Point'; // Default name if guild not found
    }
    
    return guild.assetPointName || 'Asset Point';
  } catch (error) {
    console.error('Error getting asset point name:', error);
    return 'Asset Point'; // Default on error
  }
}

// Get user's guild info (for dashboard)
app.get('/api/user/guild-info', requireAdmin, async (req: Request, res: Response) => {
  try {
    // Find guilds where user is one of the leaders
    const leaderGuilds = await Guild.find({ guildLeaderIds: req.user!.id });
    
    if (leaderGuilds.length === 0) {
      return res.json({ success: true, isLeader: false, guild: null });
    }

    // Return the first guild (in case user leads multiple)
    const guild = leaderGuilds[0];
    const members = await User.find({ guildId: guild._id }).select('-accessToken -refreshToken');
    
    const totalMembers = members.length;
    const totalAssetPoints = members.reduce((sum, member) => sum + member.assetPoints, 0);

    res.json({
      success: true,
      isLeader: true,
      guild: {
        _id: guild._id,
        name: guild.name,
        assetPointName: guild.assetPointName || 'Asset Point',
        totalMembers,
        totalAssetPoints
      }
    });
  } catch (error) {
    console.error('Error fetching user guild info:', error);
    res.status(500).json({ error: 'Failed to fetch guild info' });
  }
});

// Get user by ID (for authenticated users to get their own stats)
app.get('/api/users/:userId', requireAuth, async (req: Request, res: Response) => {
  try {
    const requestingUserId = req.user!.id; // Discord ID from session
    const targetUserId = req.params.userId; // Can be Discord ID or MongoDB _id

    // Allow admins to view any user, regular users can only view themselves
    let targetUser;
    if (req.user!.role === 'admin' || req.user!.role === 'super-admin') {
      // Admin can view by Discord ID or MongoDB _id
      const query: any[] = [{ discordId: targetUserId }];
      
      // Only try to query by _id if it's a valid MongoDB ObjectId
      if (mongoose.Types.ObjectId.isValid(targetUserId)) {
        try {
          query.push({ _id: new mongoose.Types.ObjectId(targetUserId) });
        } catch (e) {
          // Invalid ObjectId, skip this query option
        }
      }
      
      targetUser = await User.findOne({ $or: query });
    } else {
      // Regular users can only view themselves
      if (targetUserId !== requestingUserId) {
        return res.status(403).json({ error: 'Forbidden: You can only view your own data' });
      }
      targetUser = await User.findOne({ discordId: requestingUserId });
    }

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const progressionSnapshot = await getProgressionSnapshot();
    const assetPointName = targetUser.guildId
      ? progressionSnapshot.guildsById.get(targetUser.guildId.toString())?.assetPointName || 'Asset Point'
      : 'Asset Point';

    // Return user data with all stats
    res.json({
      success: true,
      user: {
        _id: targetUser._id,
        discordId: targetUser.discordId,
        username: targetUser.nickname || targetUser.username,
        nickname: targetUser.nickname,
        discriminator: targetUser.discriminator,
        avatar: targetUser.avatar,
        email: targetUser.email,
        role: targetUser.role,
        level: targetUser.level || 1,
        guildId: targetUser.guildId,
        assetPoints: targetUser.assetPoints || 0,
        assetPointName: assetPointName, // Include custom asset point name
        techTokens: targetUser.techTokens || 0,
        voiceMinutesToday: targetUser.voiceMinutesToday || 0,
        totalVoiceMinutes: targetUser.totalVoiceMinutes || 0,
        unlockedSkills: targetUser.unlockedSkills || [],
        isAdmin: targetUser.isAdmin,
        createdAt: targetUser.createdAt,
        updatedAt: targetUser.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Get all users (for guild assignment, admin and super-admin)
app.get('/api/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await User.find().select('-accessToken -refreshToken').sort({ username: 1 });
    
    // Transform users to use nickname as username
    const transformedUsers = users.map(user => ({
      discordId: user.discordId,
      username: user.nickname || user.username, // Use nickname if available
      discriminator: user.discriminator,
      avatar: user.avatar,
      email: user.email,
      role: user.role,
      level: user.level || 1,
      guildId: user.guildId,
      assetPoints: user.assetPoints,
      techTokens: user.techTokens,
      voiceMinutesToday: user.voiceMinutesToday,
      totalVoiceMinutes: user.totalVoiceMinutes || 0,
      unlockedSkills: user.unlockedSkills || [], // Include unlocked skills
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
    
    res.json({ success: true, users: transformedUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Assign user to guild (admin and super-admin)
// Assign user to guild (admin can assign any user, regular users can only assign themselves)
app.post('/api/users/:userId/guild', async (req: Request, res: Response) => {
  try {
    const { guildId } = req.body;
    const requestingUserId = req.user?.id; // From session
    const targetUserId = req.params.userId;

    // Check if user is authenticated
    if (!requestingUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const requestingUser = await User.findOne({ discordId: requestingUserId });
    if (!requestingUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Regular users can only assign themselves, admins can assign anyone
    if (requestingUser.role !== 'admin' && requestingUser.role !== 'super-admin' && requestingUserId !== targetUserId) {
      return res.status(403).json({ error: 'You can only assign yourself to a guild' });
    }

    const user = await User.findOne({ discordId: targetUserId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify guild exists
    if (guildId) {
      const guild = await Guild.findById(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
      }
    }

    user.guildId = guildId || undefined;
    await user.save();

    sessionUserCache.delete(targetUserId);
    invalidateProgressionCache();
    res.json({ success: true, user: { ...user.toObject(), accessToken: undefined, refreshToken: undefined } });
  } catch (error) {
    console.error('Error assigning user to guild:', error);
    res.status(500).json({ error: 'Failed to assign user to guild' });
  }
});

// Update user asset points (admin and super-admin)
app.post('/api/users/:userId/asset-points', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { amount, operation } = req.body; // operation: 'add' or 'subtract'
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ error: 'Amount must be a non-negative number' });
    }
    if (!['add', 'subtract', 'set'].includes(operation)) {
      return res.status(400).json({ error: 'Invalid operation. Use "add", "subtract", or "set"' });
    }
    const user = await User.findOne({ discordId: req.params.userId });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (operation === 'add') {
      user.assetPoints += amount;
    } else if (operation === 'subtract') {
      user.assetPoints = Math.max(0, user.assetPoints - amount);
    } else if (operation === 'set') {
      user.assetPoints = amount;
    } else {
      return res.status(400).json({ error: 'Invalid operation. Use "add", "subtract", or "set"' });
    }

    await user.save();

    sessionUserCache.delete(user.discordId);
    res.json({ 
      success: true, 
      user: { 
        discordId: user.discordId,
        username: user.nickname || user.username,
        assetPoints: user.assetPoints 
      } 
    });
  } catch (error) {
    console.error('Error updating asset points:', error);
    res.status(500).json({ error: 'Failed to update asset points' });
  }
});

app.patch('/api/users/:userId/level', requireAdmin, async (req: Request, res: Response) => {
  try {
    assertValidLevel(req.body?.level, 'User level');
    const user = await User.findOne({ discordId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.level = req.body.level;
    await user.save();
    sessionUserCache.delete(user.discordId);
    res.json({ success: true, user: { discordId: user.discordId, level: user.level } });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to update user level');
  }
});

// ==================== SKILL MANAGEMENT API ====================

const presentOfficeQuestCatalog = async () => {
  const [quests, importedSkills] = await Promise.all([
    OfficeQuestCache.find({}).sort({ title: 1 }).lean(),
    Skill.find({ externalSource: 'office-quest' }).select('externalQuestId').lean()
  ]);
  const importedIds = new Set(importedSkills.map(skill => skill.externalQuestId).filter(Boolean));
  return quests.map(quest => ({ ...quest, imported: importedIds.has(quest.externalId) }));
};

const normalizeDescriptionParts = (value: unknown): Array<{ type: string; content: string }> => Array.isArray(value)
  ? value.filter((part: any) => part && typeof part.content === 'string' && part.content.trim()).slice(0, 100)
    .map((part: any) => ({ type: typeof part.type === 'string' ? part.type.slice(0, 40) : 'Text', content: part.content.trim().slice(0, 100000) }))
  : [];

const normalizeSubQuests = (
  value: unknown,
  persistedSteps: Array<{ externalId?: string }> = []
): Array<{ externalId: string; title: string; description: string; descriptionParts?: Array<{ type: string; content: string }>; type?: string }> => {
  if (!Array.isArray(value)) return [];
  const steps = value
    .filter((subQuest: any) => subQuest && typeof subQuest.title === 'string' && subQuest.title.trim())
    .slice(0, 100)
    .map((subQuest: any) => ({
      externalId: typeof subQuest.externalId === 'string' ? subQuest.externalId : undefined,
      title: subQuest.title.trim().slice(0, 500),
      description: typeof subQuest.description === 'string' ? subQuest.description.slice(0, 100000) : '',
      descriptionParts: normalizeDescriptionParts(subQuest.descriptionParts),
      type: typeof subQuest.type === 'string' ? subQuest.type.slice(0, 80) : undefined
    }));
  return normalizeQuestStepExternalIds(steps, persistedSteps);
};

const officeQuestNodePreview = (quest: {
  title?: string;
  description?: string;
  imageUrl?: string;
  subQuests?: Array<{ title?: string; descriptionParts?: Array<{ type: string; content: string }> }>;
}) => ({
  imageUrl: quest.imageUrl || (quest.subQuests || []).flatMap(step => step.descriptionParts || [])
    .find(part => part.type.toLowerCase() === 'image' && part.content.trim())?.content.trim(),
  summary: (quest.description || `Learn ${quest.title || 'this quest'}.`).slice(0, 280),
  outcomes: (quest.subQuests || []).map(step => step.title?.trim()).filter((title): title is string => Boolean(title)).slice(0, 4),
  actionLabel: 'Open Quest'
});

const validControlPoints = (value: unknown): value is Array<{ x: number; y: number }> =>
  Array.isArray(value) && value.length === 2 && value.every(point =>
    point && Number.isFinite((point as { x?: number }).x) && Number.isFinite((point as { y?: number }).y)
  );

app.get('/api/admin/star-master/tags', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const tags = await getOfficeQuestTags();
    res.json({
      success: true,
      tags: tags
        .filter(tag => tag._id && tag.name)
        .map(tag => ({ id: tag._id, name: tag.name, color: tag.color }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    });
  } catch (error: any) {
    console.error('Error loading StarMaster tags:', error.response?.data || error.message || error);
    res.status(500).json({ error: error.message || 'Unable to load StarMaster tags' });
  }
});

app.get(['/api/admin/star-master/quests', '/api/admin/hamquest/quests'], requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type.trim().slice(0, 80) : undefined;
    const tagIds = typeof req.query.tagIds === 'string' ? req.query.tagIds.trim().slice(0, 3000) : undefined;
    const includeNoTags = req.query.includeNoTags === 'true' || req.query.includeNoTags === '1';
    const [{ quests, pagination }, importedSkills] = await Promise.all([
      getOfficeQuestPage({
        page,
        limit,
        ...(search ? { search } : {}),
        ...(type ? { type } : {}),
        ...(tagIds ? { tagIds } : {}),
        ...(includeNoTags ? { includeNoTags: true } : {})
      }),
      Skill.find({ externalQuestId: { $exists: true } }).select('externalQuestId constellationMapId').lean()
    ]);
    const importedById = new Map(importedSkills.map(skill => [skill.externalQuestId, skill.constellationMapId?.toString()]));
    res.json({
      success: true,
      quests: quests.map(quest => ({
        externalId: quest._id,
        title: quest.title || 'Untitled quest',
        type: quest.type,
        description: getOfficeQuestDescription(quest.description),
        imageUrl: getOfficeQuestImageUrl(quest),
        tags: (quest.tags || []).map(tag => ({ id: tag._id || tag.id, name: tag.name, color: tag.color })).filter(tag => tag.id && tag.name),
        subQuestCount: quest.subQuests?.length || 0,
        imported: importedById.has(quest._id),
        importedMapId: importedById.get(quest._id)
      })),
      pagination
    });
  } catch (error: any) {
    console.error('Error loading StarMaster quests:', error.response?.data || error.message || error);
    res.status(error.response?.status === 401 || error.response?.status === 403 ? 502 : 500).json({
      error: error.response?.data?.error?.message || error.message || 'Unable to load StarMaster quests'
    });
  }
});

const starMasterSkillPayload = (
  quest: any,
  map: any,
  constellationMapId: string,
  mapSkillIndex: number,
  totalSkillIndex: number
) => {
  const columns = 3;
  const column = mapSkillIndex % columns;
  const row = Math.floor(mapSkillIndex / columns);
  const description = getOfficeQuestDescription(quest.description) || 'Imported from StarMaster.';
  const imageUrl = getOfficeQuestImageUrl(quest);
  const outcomes = (quest.subQuests || []).map((subQuest: any) => subQuest.title?.trim()).filter(Boolean).slice(0, 4) as string[];
  return {
    title: quest.title || 'Untitled quest',
    description,
    cost: 0,
    layer: 0,
    position: totalSkillIndex * 100,
    treePosition: { x: ((totalSkillIndex % 3) - 1) * 180, y: 620 - Math.floor(totalSkillIndex / 3) * 180 },
    constellationPosition: {
      x: Math.round(map.viewport.width / 2 + (column - 1) * 280),
      y: Math.min(map.viewport.height - 80, 180 + row * 180)
    },
    constellationMapId,
    mainQuestLevel: map.constellationType === 'main' ? mapSkillIndex + 1 : undefined,
    mapNodeRole: 'lesson',
    nodePreview: {
      imageUrl,
      summary: description.slice(0, 280),
      outcomes,
      actionLabel: 'Open Quest'
    },
    nodeColor: 'green',
    nodeType: 'quest',
    externalSource: 'star-master',
    externalQuestId: quest._id,
    subQuests: normalizeSubQuests((quest.subQuests || []).map((subQuest: any) => ({
      externalId: subQuest?._id,
      title: subQuest?.title,
      description: getOfficeQuestDescription(subQuest?.description),
      descriptionParts: getOfficeQuestDescriptionParts(subQuest?.description),
      type: subQuest?.subQuestType
    }))),
    isActive: true
  };
};

const getStarMasterImportMap = async (constellationMapId: string) => {
  if (!mongoose.Types.ObjectId.isValid(constellationMapId)) {
    throw Object.assign(new Error('Select a quest destination before importing'), { status: 400 });
  }
  const map = await ConstellationMap.findById(constellationMapId).lean();
  if (!map) throw Object.assign(new Error('Quest destination not found'), { status: 404 });
  const isSkillTopic = map.constellationType !== 'main' && map.scope === 'topic';
  const isMainQuestPath = map.constellationType === 'main' && map.scope === 'discipline';
  if (!isSkillTopic && !isMainQuestPath) {
    throw Object.assign(new Error('Select a Skill Topic or Main Quest path before importing'), { status: 400 });
  }
  return map;
};

app.post('/api/admin/star-master/quests/import', requireAdmin, async (req: Request, res: Response) => {
  const externalQuestIds: string[] = Array.isArray(req.body.externalQuestIds)
    ? [...new Set<string>((req.body.externalQuestIds as unknown[])
      .filter((value): value is string => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean))]
    : [];
  if (externalQuestIds.length === 0) return res.status(400).json({ error: 'Select at least one quest to import' });
  if (externalQuestIds.length > 50) return res.status(400).json({ error: 'Import up to 50 quests at a time' });

  try {
    const constellationMapId = String(req.body.constellationMapId || '');
    const map = await getStarMasterImportMap(constellationMapId);
    const [mapSkillCount, totalSkillCount] = await Promise.all([
      Skill.countDocuments({ constellationMapId }),
      Skill.countDocuments()
    ]);
    const imported: ISkill[] = [];
    const failed: Array<{ externalQuestId: string; error: string }> = [];
    let cursor = 0;

    const importNext = async () => {
      while (cursor < externalQuestIds.length) {
        const itemIndex = cursor++;
        const externalQuestId = externalQuestIds[itemIndex];
        try {
          const quest = await getOfficeQuestById(externalQuestId);
          const skill = await Skill.create(starMasterSkillPayload(
            quest,
            map,
            constellationMapId,
            mapSkillCount + itemIndex,
            totalSkillCount + itemIndex
          ));
          imported.push(skill);
        } catch (error: any) {
          failed.push({
            externalQuestId,
            error: error.response?.data?.error?.message || error.message || 'Import failed'
          });
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(4, externalQuestIds.length) }, () => importNext()));
    if (imported.length > 0) invalidateSkillCaches();
    res.json({
      success: failed.length === 0,
      imported,
      skipped: [],
      failed
    });
  } catch (error: any) {
    console.error('Error batch importing StarMaster quests:', error.response?.data || error.message || error);
    res.status(error.status || 500).json({ error: error.response?.data?.error?.message || error.message || 'Failed to import StarMaster quests' });
  }
});

app.post(['/api/admin/star-master/quests/:externalQuestId/import', '/api/admin/hamquest/quests/:externalQuestId/import'], requireAdmin, async (req: Request, res: Response) => {
  try {
    const constellationMapId = String(req.body.constellationMapId || '');
    const map = await getStarMasterImportMap(constellationMapId);

    const [quest, mapSkillCount, totalSkillCount] = await Promise.all([
      getOfficeQuestById(req.params.externalQuestId),
      Skill.countDocuments({ constellationMapId }),
      Skill.countDocuments()
    ]);
    const skill = await Skill.create(starMasterSkillPayload(quest, map, constellationMapId, mapSkillCount, totalSkillCount));
    invalidateSkillCaches();
    res.status(201).json({ success: true, skill });
  } catch (error: any) {
    console.error('Error importing StarMaster quest:', error.response?.data || error.message || error);
    res.status(error.status || 500).json({ error: error.response?.data?.error?.message || error.message || 'Failed to import StarMaster quest' });
  }
});

// Cached Office quest catalog. Reading this endpoint never calls Office.
app.get('/api/admin/office-quest-catalog', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const items = await presentOfficeQuestCatalog();
    const latestSync = await OfficeQuestCache.findOne({}).sort({ syncedAt: -1 }).select('syncedAt').lean();
    res.json({ success: true, items, syncedAt: latestSync?.syncedAt || null });
  } catch (error) {
    console.error('Error loading cached Office quests:', error);
    res.status(500).json({ error: 'Unable to load the cached Office quest catalog' });
  }
});

// Sync is explicit because the Office quest catalog can be large.
app.post('/api/admin/office-quest-catalog/sync', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const sourceQuests = await getOfficeQuests();
    const seenDetails = new Set<string>();
    const syncedAt = new Date();
    const uniqueQuests = sourceQuests.filter(quest => {
      if (!quest?._id || !quest.title?.trim()) return false;
      const detailHash = getOfficeQuestDetailHash(quest);
      if (seenDetails.has(detailHash)) return false;
      seenDetails.add(detailHash);
      return true;
    });

    const syncOperations = uniqueQuests.map(quest => {
      const tags = (Array.isArray(quest.tags) ? quest.tags : [])
        .map(tag => ({ externalId: String(tag?._id || tag?.id || ''), name: String(tag?.name || '').trim(), color: tag?.color }))
        .filter(tag => tag.externalId && tag.name);
      return {
        updateOne: {
          filter: { externalId: quest._id },
          update: {
            $set: {
              title: String(quest.title).trim(),
              type: quest.type?.trim() || undefined,
              description: getOfficeQuestDescription(quest.description),
              imageUrl: getOfficeQuestImageUrl(quest),
              tags,
              subQuestCount: Array.isArray(quest.subQuests) ? quest.subQuests.length : 0,
              subQuests: normalizeSubQuests((quest.subQuests || []).map(subQuest => ({
                externalId: subQuest?._id,
                title: subQuest?.title,
                description: getOfficeQuestDescription(subQuest?.description),
                descriptionParts: getOfficeQuestDescriptionParts(subQuest?.description),
                type: subQuest?.subQuestType
              }))),
              sourceCreatedAt: quest.createdAt ? new Date(quest.createdAt) : undefined,
              sourceUpdatedAt: quest.updatedAt ? new Date(quest.updatedAt) : undefined,
              detailHash: getOfficeQuestDetailHash(quest),
              syncedAt
            }
          },
          upsert: true
        }
      };
    });
    if (syncOperations.length > 0) await OfficeQuestCache.bulkWrite(syncOperations);
    await OfficeQuestCache.deleteMany({ externalId: { $nin: uniqueQuests.map(quest => quest._id) } });

    const importedQuestSteps = uniqueQuests.map(quest => ({
      updateOne: {
        filter: { externalSource: 'office-quest' as const, externalQuestId: quest._id },
        update: {
          $set: {
            subQuests: normalizeSubQuests((quest.subQuests || []).map(subQuest => ({
              externalId: subQuest?._id,
              title: subQuest?.title,
              description: getOfficeQuestDescription(subQuest?.description),
              descriptionParts: getOfficeQuestDescriptionParts(subQuest?.description),
              type: subQuest?.subQuestType
            }))),
            nodePreview: officeQuestNodePreview({
              title: quest.title,
              description: getOfficeQuestDescription(quest.description),
              imageUrl: getOfficeQuestImageUrl(quest),
              subQuests: (quest.subQuests || []).map(subQuest => ({
                title: subQuest?.title,
                descriptionParts: getOfficeQuestDescriptionParts(subQuest?.description)
              }))
            })
          }
        }
      }
    }));
    if (importedQuestSteps.length > 0) {
      await Skill.bulkWrite(importedQuestSteps);
      invalidateSkillCaches();
    }

    res.json({ success: true, syncedAt, sourceCount: sourceQuests.length, uniqueCount: uniqueQuests.length });
  } catch (error: any) {
    console.error('Error syncing Office quest catalog:', error);
    res.status(502).json({ error: error.message || 'Unable to sync the Office quest catalog' });
  }
});

app.post('/api/admin/office-quest-catalog/:externalQuestId/import', requireAdmin, async (req: Request, res: Response) => {
  try {
    const quest = await OfficeQuestCache.findOne({ externalId: req.params.externalQuestId });
    if (!quest) return res.status(404).json({ error: 'Quest is not in the cached catalog. Sync it first.' });

    const existing = await Skill.findOne({ externalSource: 'office-quest', externalQuestId: quest.externalId });
    if (existing) return res.status(409).json({ error: 'This Office quest has already been imported' });

    const count = await Skill.countDocuments();
    const skill = await Skill.create({
      title: quest.title,
      description: quest.description || 'Imported from Office.',
      cost: 0,
      layer: 0,
      position: count * 100,
      treePosition: { x: ((count % 3) - 1) * 180, y: 620 - Math.floor(count / 3) * 180 },
      nodeColor: 'green',
      nodeType: 'quest',
      externalSource: 'office-quest',
      externalQuestId: quest.externalId,
      nodePreview: officeQuestNodePreview(quest),
      subQuests: quest.subQuests || [],
      isActive: true
    });
    invalidateSkillCaches();
    res.status(201).json({ success: true, skill });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ error: 'This Office quest has already been imported' });
    console.error('Error importing cached Office quest:', error);
    res.status(500).json({ error: 'Failed to import Office quest' });
  }
});

// Re-import refreshes Office-owned content without disturbing the Quest Tree layout or GuGame settings.
app.post('/api/admin/office-quest-catalog/:externalQuestId/reimport', requireAdmin, async (req: Request, res: Response) => {
  try {
    const quest = await OfficeQuestCache.findOne({ externalId: req.params.externalQuestId });
    if (!quest) return res.status(404).json({ error: 'Quest is not in the cached catalog. Sync it first.' });

    const skill = await Skill.findOne({ externalSource: 'office-quest', externalQuestId: quest.externalId });
    if (!skill) return res.status(404).json({ error: 'This Office quest has not been imported yet.' });

    skill.title = quest.title;
    skill.description = quest.description || 'Imported from Office.';
    skill.set('nodePreview', officeQuestNodePreview(quest));
    skill.subQuests = normalizeSubQuests(quest.subQuests || []);
    await skill.save();
    invalidateSkillCaches();

    res.json({ success: true, skill });
  } catch (error) {
    console.error('Error re-importing cached Office quest:', error);
    res.status(500).json({ error: 'Failed to re-import Office quest' });
  }
});

app.get('/api/admin/quest-tree/json', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const skills = await Skill.find({}).sort({ createdAt: 1 });
    res.json({
      version: 1,
      quests: skills.map((skill) => ({
        key: skill._id.toString(),
        title: skill.title,
        description: skill.description,
        cost: skill.cost,
        nextQuestCost: skill.nextQuestCost,
        nodeColor: skill.nodeColor,
        treePosition: skill.treePosition,
        previewClip: skill.previewClip || [],
        contentYouTube: skill.contentYouTube || [],
        contentGoogleDrive: skill.contentGoogleDrive || [],
        subQuests: skill.subQuests || [],
        prerequisites: skill.prerequisites || [],
        minAP: skill.minAP,
        maxAP: skill.maxAP,
        isActive: skill.isActive,
        isAdvancedLocked: skill.isAdvancedLocked === true,
        connections: (skill.connections || []).map((connection) => ({
          targetKey: connection.targetSkillId,
          connectionType: connection.connectionType,
          hasArrowhead: connection.hasArrowhead !== false,
          curveMode: connection.curveMode === 'bezier' ? 'bezier' : 'auto',
          controlPoints: connection.controlPoints || []
        }))
      }))
    });
  } catch (error) {
    console.error('Error exporting quest tree JSON:', error);
    res.status(500).json({ error: 'Failed to export quest tree JSON' });
  }
});

app.post('/api/admin/quest-tree/import', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const quests = Array.isArray(req.body?.quests) ? req.body.quests : req.body;
    if (!Array.isArray(quests) || quests.length === 0 || quests.length > 200) {
      return res.status(400).json({ error: 'Provide a quests array containing between 1 and 200 quests' });
    }

    const allowedColors = new Set(['yellow', 'blue', 'green', 'white', 'purple']);
    const keys = quests.map((quest: any, index: number) => String(quest.key || `quest-${index + 1}`));
    if (new Set(keys).size !== keys.length) {
      return res.status(400).json({ error: 'Every imported quest needs a unique key' });
    }

    for (let index = 0; index < quests.length; index++) {
      const quest = quests[index] || {};
      if (!quest.title || !quest.description || !Number.isFinite(quest.cost)) {
        return res.status(400).json({ error: `Quest ${index + 1} requires title, description, and numeric cost` });
      }
      if (quest.nodeColor !== undefined && !allowedColors.has(quest.nodeColor)) {
        return res.status(400).json({ error: `Quest ${index + 1} has an invalid nodeColor` });
      }
      if (quest.treePosition !== undefined &&
        (!Number.isFinite(quest.treePosition?.x) || !Number.isFinite(quest.treePosition?.y))) {
        return res.status(400).json({ error: `Quest ${index + 1} needs numeric treePosition.x and treePosition.y` });
      }

      const references = [
        ...(Array.isArray(quest.prerequisites) ? quest.prerequisites : []),
        ...(Array.isArray(quest.connections) ? quest.connections.map((connection: any) => connection.targetKey) : [])
      ].filter(Boolean).map(String);
      if (references.some((reference) => !keys.includes(reference))) {
        return res.status(400).json({ error: `Quest ${index + 1} references a key that is not included in this import` });
      }
    }

    const created = await Skill.insertMany(quests.map((quest: any, index: number) => new Skill({
      title: String(quest.title).trim(),
      description: String(quest.description).trim(),
      cost: Number(quest.cost),
      nextQuestCost: Number.isFinite(quest.nextQuestCost) ? Number(quest.nextQuestCost) : 25,
      previewClip: Array.isArray(quest.previewClip) ? quest.previewClip : [],
      contentYouTube: Array.isArray(quest.contentYouTube) ? quest.contentYouTube : [],
      contentGoogleDrive: Array.isArray(quest.contentGoogleDrive) ? quest.contentGoogleDrive : [],
      subQuests: normalizeSubQuests(quest.subQuests),
      layer: 0,
      position: index * 100,
      treePosition: quest.treePosition || { x: ((index % 3) - 1) * 180, y: 620 - Math.floor(index / 3) * 180 },
      nodeColor: quest.nodeColor || 'blue',
      nodeType: quest.nodeType,
      prerequisites: [],
      connections: [],
      minAP: quest.minAP,
      maxAP: quest.maxAP,
      isActive: quest.isActive !== false,
      isAdvancedLocked: quest.isAdvancedLocked === true
    })));

    const importedIdByKey = new Map(keys.map((key, index) => [key, created[index]._id.toString()]));
    await Promise.all(created.map(async (skill, index) => {
      const quest = quests[index];
      skill.prerequisites = (Array.isArray(quest.prerequisites) ? quest.prerequisites : [])
        .map((key: string) => importedIdByKey.get(String(key)))
        .filter(Boolean) as string[];
      skill.connections = (Array.isArray(quest.connections) ? quest.connections : []).map((connection: any) => ({
        targetSkillId: importedIdByKey.get(String(connection.targetKey)),
        connectionType: connection.connectionType === 'special' ? 'special' : 'normal',
        hasArrowhead: connection.hasArrowhead !== false,
        breakPoints: [],
        curveMode: connection.curveMode === 'bezier' ? 'bezier' : 'auto',
        controlPoints: validControlPoints(connection.controlPoints) ? connection.controlPoints : []
      })).filter((connection: any) => connection.targetSkillId);
      await skill.save();
    }));

    invalidateSkillCaches();
    res.status(201).json({ success: true, createdCount: created.length });
  } catch (error) {
    console.error('Error importing quest tree JSON:', error);
    res.status(500).json({ error: 'Failed to import quest tree JSON' });
  }
});

// List constellation maps. Regular players only receive active maps.
const assertMainQuestMapReady = async (map: { _id: unknown; constellationType?: string; isActive?: boolean }) => {
  if (map.constellationType !== 'main' || !map.isActive) return;
  const quests = await Skill.find({ constellationMapId: map._id, isActive: true })
    .select('title mainQuestLevel isActive subQuests.title')
    .lean();
  const issues = mainQuestReadinessIssues(quests);
  if (issues.length > 0) throw new ConstellationOperationError(issues[0], 409);
};

const assertPublishedMainQuestReady = async (skill: {
  title?: string;
  constellationMapId?: unknown;
  mainQuestLevel?: number;
  isActive?: boolean;
  subQuests?: Array<{ title?: string }>;
}) => {
  if (!skill.constellationMapId || !skill.isActive) return;
  const map = await ConstellationMap.findById(skill.constellationMapId).select('constellationType').lean();
  if (map?.constellationType !== 'main') return;
  const issues = mainQuestReadinessIssues([skill]);
  if (issues.length > 0) throw new ConstellationOperationError(issues[0], 409);
};

app.get('/api/constellation-maps', requireAuth, async (req: Request, res: Response) => {
  try {
    const scope = typeof req.query.scope === 'string' ? req.query.scope : undefined;
    const constellationType = typeof req.query.constellationType === 'string' ? req.query.constellationType : undefined;
    const parentMapId = typeof req.query.parentMapId === 'string' ? req.query.parentMapId : undefined;
    const gatewaySkillId = typeof req.query.gatewaySkillId === 'string' ? req.query.gatewaySkillId : undefined;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const requestedLimit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (scope && scope !== 'discipline' && scope !== 'topic') {
      return res.status(400).json({ error: 'scope must be discipline or topic' });
    }
    if (constellationType && constellationType !== 'main' && constellationType !== 'skill') {
      return res.status(400).json({ error: 'constellationType must be main or skill' });
    }
    if (parentMapId && !mongoose.Types.ObjectId.isValid(parentMapId)) {
      return res.status(400).json({ error: 'parentMapId must be a valid ID' });
    }
    if (gatewaySkillId && !mongoose.Types.ObjectId.isValid(gatewaySkillId)) {
      return res.status(400).json({ error: 'gatewaySkillId must be a valid ID' });
    }
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      return res.status(400).json({ error: 'limit must be an integer between 1 and 100' });
    }

    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super-admin';
    const includeInactive = isAdmin && req.query.includeInactive === 'true';
    const page = await getConstellationMapPage({
      constellationType: constellationType as 'main' | 'skill' | undefined,
      scope: scope as 'discipline' | 'topic' | undefined,
      parentMapId,
      gatewaySkillId,
      includeInactive,
      limit: requestedLimit,
      cursor
    });

    const visibleMaps = isAdmin
      ? page.maps
      : page.maps.filter(map => map.scope === 'discipline' || (
        (map.level || 1) >= (req.user!.state?.level || 1) &&
        (map.level || 1) <= (req.user!.state?.level || 1) + 2
      ));
    res.json({
      success: true,
      maps: visibleMaps,
      pagination: { limit: requestedLimit, nextCursor: page.nextCursor }
    });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to fetch constellation maps');
  }
});

// Fetch a map and the skill nodes placed on it.
app.get('/api/constellation-maps/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid constellation map ID' });
    }
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super-admin';
    const map = await ConstellationMap.findOne({
      _id: req.params.id,
      ...(isAdmin ? {} : {
        isActive: true,
        $or: [{ scope: 'discipline' }, { scope: 'topic', level: req.user!.state?.level || 1 }]
      })
    }).lean();
    if (!map) return res.status(404).json({ error: 'Constellation map not found' });

    const skills = await Skill.find({
      constellationMapId: map._id,
      ...(isAdmin ? {} : { isActive: true })
    }).sort({ layer: 1, position: 1 }).lean();
    let visibleSkills = skills;
    if (!isAdmin && map.constellationType !== 'main' && map.scope === 'discipline') {
      const visibleTopicMaps = await ConstellationMap.find({
        parentMapId: map._id,
        scope: 'topic',
        isActive: true,
        level: {
          $gte: req.user!.state?.level || 1,
          $lte: (req.user!.state?.level || 1) + 2
        }
      }).select('gatewaySkillId level').lean();
      const topicByGatewayId = new Map(visibleTopicMaps
        .filter(topic => topic.gatewaySkillId)
        .map(topic => [topic.gatewaySkillId!.toString(), topic]));
      visibleSkills = skills.flatMap(skill => {
        const topic = topicByGatewayId.get(skill._id.toString());
        return topic ? [{ ...skill, topicLevel: topic.level || 1 }] : [];
      });
    }
    res.json({
      success: true,
      map,
      skills: presentSkillsForUser(visibleSkills, {
        role: req.user!.role,
        unlockedSkills: req.user!.state?.unlockedSkills
      })
    });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to fetch constellation map');
  }
});

// Constellation editors are available to admins and super-admins.
app.post('/api/constellation-maps', requireAdmin, async (req: Request, res: Response) => {
  try {
    const map = new ConstellationMap();
    applyConstellationMapFields(map, req.body);
    if (map.scope === 'topic') assertValidLevel(map.level || 1, 'Topic level');
    else map.level = 1;
    if (!Object.prototype.hasOwnProperty.call(req.body, 'isActive')) map.isActive = false;
    await validateConstellationMapLinkage({
      constellationType: map.constellationType,
      scope: map.scope,
      parentMapId: map.parentMapId,
      gatewaySkillId: map.gatewaySkillId
    });
    await assertMainQuestMapReady(map);
    await map.save();
    invalidateConstellationMapCache();
    res.status(201).json({ success: true, map });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to create constellation map');
  }
});

app.patch('/api/constellation-maps/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid constellation map ID' });
    }
    const map = await ConstellationMap.findById(req.params.id);
    if (!map) return res.status(404).json({ error: 'Constellation map not found' });

    applyConstellationMapFields(map, req.body);
    if (map.scope === 'topic') assertValidLevel(map.level || 1, 'Topic level');
    else map.level = 1;
    await validateConstellationMapContents(map._id.toString(), map.scope, map.constellationType);
    await validateConstellationMapLinkage({
      constellationType: map.constellationType,
      scope: map.scope,
      parentMapId: map.parentMapId,
      gatewaySkillId: map.gatewaySkillId
    }, map._id.toString());
    await assertMainQuestMapReady(map);
    await map.save();
    invalidateConstellationMapCache();
    res.json({ success: true, map });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to update constellation map');
  }
});

// Persist visual editor coordinates in one bounded write instead of one request per node.
app.patch('/api/constellation-maps/:id/layout', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid constellation map ID' });
    }
    const map = await ConstellationMap.findById(req.params.id).select('_id viewport').lean();
    if (!map) return res.status(404).json({ error: 'Constellation map not found' });

    const nodes = normalizeConstellationLayout(req.body?.nodes, map.viewport);
    const matchingSkillCount = await Skill.countDocuments({
      _id: { $in: nodes.map(node => node.skillId) },
      constellationMapId: map._id
    });
    if (matchingSkillCount !== nodes.length) {
      throw new ConstellationOperationError('Every layout node must belong to this constellation map', 409);
    }

    const result = await Skill.bulkWrite(nodes.map(node => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(node.skillId), constellationMapId: map._id },
        update: { $set: { constellationPosition: { x: node.x, y: node.y } } }
      }
    })), { ordered: true });
    invalidateSkillCaches();
    res.json({ success: true, updatedCount: result.modifiedCount });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to update constellation layout');
  }
});

// Deletion is conservative by default; the editor can explicitly request a cascade.
app.delete('/api/constellation-maps/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid constellation map ID' });
    }
    const map = await ConstellationMap.findById(req.params.id).select('_id');
    if (!map) return res.status(404).json({ error: 'Constellation map not found' });

    const cascade = req.query.cascade === 'true';
    if (!cascade) {
      await assertConstellationMapCanBeDeleted(req.params.id);
      await map.deleteOne();
      invalidateConstellationMapCache();
      return res.json({ success: true, message: 'Constellation map deleted successfully', deletedMaps: 1, deletedSkills: 0 });
    }

    const mapIds = await collectConstellationMapIds(map._id);
    const ownedSkills = await Skill.find({ constellationMapId: { $in: mapIds } }).select('_id').lean();
    const deletedSkills = await deleteSkillsWithReferences(ownedSkills.map(skill => skill._id));
    const deletedMaps = await ConstellationMap.deleteMany({ _id: { $in: mapIds } });
    invalidateConstellationMapCache();
    res.json({
      success: true,
      message: 'Constellation and its contents deleted successfully',
      deletedMaps: deletedMaps.deletedCount,
      deletedSkills
    });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to delete constellation map');
  }
});

// Get all skills (authenticated users can view)
app.get('/api/skills', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!req.user!.state) return res.status(404).json({ error: 'User not found' });
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super-admin';
    const includeInactive = isAdmin && req.query.includeInactive === 'true';
    const allSkills = includeInactive
      ? await Skill.find({}).sort({ layer: 1, position: 1 }).lean()
      : await getActiveSkills();
    const skills = isAdmin
      ? allSkills
      : await filterSkillsForUserLevel(allSkills, req.user!.state.level || 1);
    
    res.json({
      success: true,
      skills: presentSkillsForUser(skills, {
        role: req.user!.role,
        unlockedSkills: req.user!.state.unlockedSkills
      })
    });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Get single skill by ID
app.get('/api/skills/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    const unlockedSkills = req.user!.state?.unlockedSkills || [];
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super-admin';
    if (!isAdmin) {
      const visibleSkills = await filterSkillsForUserLevel([skill.toObject()], req.user!.state?.level || 1);
      if (visibleSkills.length === 0) return res.status(404).json({ error: 'Skill not found' });
    }
    const isUnlocked = unlockedSkills.includes(skill._id.toString());
    
    // For asset nodes, hide content links until unlocked (unless admin)
    const isAssetNode = skill.nodeType === 'asset' || skill.nodeColor === 'blue';
    const skillData = skill.toObject();
    
    // Admins can always see content, regular users need to unlock asset nodes
    if (isAssetNode && !isUnlocked && !isAdmin) {
      // Hide content links for locked asset nodes (non-admins only)
      skillData.contentYouTube = [];
      skillData.contentGoogleDrive = [];
    }
    
    res.json({ success: true, skill: skillData });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ error: 'Failed to fetch skill' });
  }
});

// Constellation star editing is available to admins and super-admins.
app.post('/api/skills', requireConstellationSkillEditor, async (req: Request, res: Response) => {
  try {
    const { title, description, cost, nextQuestCost, previewClip, contentYouTube, contentGoogleDrive, layer, position, treePosition, constellationPosition, prerequisites, nodeColor, subQuests, minAP, maxAP, isActive, isAdvancedLocked, constellationMapId, constellationLabel, mainQuestLevel, mapNodeRole, nodePreview } = req.body;

    if (!title || !description || cost === undefined) {
      return res.status(400).json({ error: 'Missing required fields: title, description, cost' });
    }
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
      return res.status(400).json({ error: 'Cost must be a non-negative number' });
    }
    if (nextQuestCost !== undefined &&
      (typeof nextQuestCost !== 'number' || !Number.isFinite(nextQuestCost) || nextQuestCost < 0)) {
      return res.status(400).json({ error: 'Next quest cost must be a non-negative number' });
    }
    if (mainQuestLevel !== undefined && (!Number.isInteger(mainQuestLevel) || mainQuestLevel < 1)) {
      return res.status(400).json({ error: 'Main Quest level must be a positive integer' });
    }

    if (treePosition !== undefined &&
      (!Number.isFinite(treePosition?.x) || !Number.isFinite(treePosition?.y))) {
      return res.status(400).json({ error: 'Tree position must contain numeric x and y values' });
    }
    if (constellationPosition !== undefined &&
      (!Number.isFinite(constellationPosition?.x) || !Number.isFinite(constellationPosition?.y))) {
      return res.status(400).json({ error: 'Constellation position must contain numeric x and y values' });
    }

    const questCount = await Skill.countDocuments();
    const defaultTreePosition = {
      x: ((questCount % 3) - 1) * 180,
      y: 620 - Math.floor(questCount / 3) * 180
    };

    const skill = new Skill({
      title,
      description,
      cost,
      nextQuestCost: nextQuestCost !== undefined ? nextQuestCost : 25,
      previewClip,
      contentYouTube,
      contentGoogleDrive,
      layer: layer ?? 0,
      position: position ?? questCount * 100,
      treePosition: treePosition ?? defaultTreePosition,
      constellationPosition,
      nodeColor: nodeColor || 'blue',
      constellationMapId: constellationMapId || undefined,
      constellationLabel: constellationLabel?.trim() || undefined,
      mainQuestLevel: mainQuestLevel ?? undefined,
      mapNodeRole: mapNodeRole || 'lesson',
      nodePreview,
      isActive: isActive !== undefined ? isActive === true : true,
      isAdvancedLocked: isAdvancedLocked === true,
      prerequisites: prerequisites || [],
      connections: [],
      subQuests: normalizeSubQuests(subQuests),
      minAP: minAP !== undefined ? minAP : undefined,
      maxAP: maxAP !== undefined ? maxAP : undefined
    });

    console.log(`✨ Creating skill: ${title}`, { treePosition: skill.treePosition, nodeColor, minAP, maxAP });

    await validateSkillMapAssignment({
      constellationMapId: skill.constellationMapId,
      mapNodeRole: skill.mapNodeRole,
      mainQuestLevel: skill.mainQuestLevel
    });
    await assertPublishedMainQuestReady(skill);
    await skill.save();
    invalidateSkillCaches();
    res.json({ success: true, skill });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to create skill');
  }
});

app.put('/api/skills/:id', requireConstellationSkillEditor, async (req: Request, res: Response) => {
  try {
    const { title, description, cost, nextQuestCost, previewClip, contentYouTube, contentGoogleDrive, layer, position, treePosition, constellationPosition, prerequisites, isActive, isAdvancedLocked, nodeColor, connections, subQuests, minAP, maxAP, constellationMapId, constellationLabel, mainQuestLevel, mapNodeRole, nodePreview } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Validate layer if provided
    if (layer !== undefined && (layer < 0 || layer > 7)) {
      return res.status(400).json({ error: 'Layer must be between 0 (center) and 7' });
    }
    if (treePosition !== undefined &&
      (!Number.isFinite(treePosition?.x) || !Number.isFinite(treePosition?.y))) {
      return res.status(400).json({ error: 'Tree position must contain numeric x and y values' });
    }
    if (constellationPosition !== undefined && constellationPosition !== null &&
      (!Number.isFinite(constellationPosition?.x) || !Number.isFinite(constellationPosition?.y))) {
      return res.status(400).json({ error: 'Constellation position must contain numeric x and y values' });
    }
    if (cost !== undefined && (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0)) {
      return res.status(400).json({ error: 'Cost must be a non-negative number' });
    }
    if (nextQuestCost !== undefined &&
      (typeof nextQuestCost !== 'number' || !Number.isFinite(nextQuestCost) || nextQuestCost < 0)) {
      return res.status(400).json({ error: 'Next quest cost must be a non-negative number' });
    }
    if (mainQuestLevel !== undefined && mainQuestLevel !== null && (!Number.isInteger(mainQuestLevel) || mainQuestLevel < 1)) {
      return res.status(400).json({ error: 'Main Quest level must be a positive integer' });
    }

    // Update fields
    if (title !== undefined) skill.title = title;
    if (description !== undefined) skill.description = description;
    if (cost !== undefined) skill.cost = cost;
    if (nextQuestCost !== undefined) skill.nextQuestCost = nextQuestCost;
    if (previewClip !== undefined) {
      // Ensure it's always an array (even if empty)
      skill.previewClip = Array.isArray(previewClip) ? previewClip : (previewClip ? [previewClip] : []);
    }
    if (contentYouTube !== undefined) {
      // Ensure it's always an array (even if empty) to allow clearing content
      skill.contentYouTube = Array.isArray(contentYouTube) ? contentYouTube : (contentYouTube ? [contentYouTube] : []);
    }
    if (contentGoogleDrive !== undefined) {
      // Ensure it's always an array (even if empty) to allow clearing content
      skill.contentGoogleDrive = Array.isArray(contentGoogleDrive) ? contentGoogleDrive : (contentGoogleDrive ? [contentGoogleDrive] : []);
    }
    if (layer !== undefined) skill.layer = layer;
    if (position !== undefined) skill.position = position;
    if (treePosition !== undefined) skill.treePosition = treePosition;
    if (constellationPosition !== undefined) {
      skill.set('constellationPosition', constellationPosition === null ? undefined : constellationPosition);
    }
    if (constellationMapId !== undefined) {
      skill.set('constellationMapId', constellationMapId || undefined);
    }
    if (constellationLabel !== undefined) {
      skill.set('constellationLabel', constellationLabel?.trim() || undefined);
    }
    if (mainQuestLevel !== undefined) {
      skill.set('mainQuestLevel', mainQuestLevel === null ? undefined : mainQuestLevel);
    }
    if (mapNodeRole !== undefined) skill.mapNodeRole = mapNodeRole;
    if (nodePreview !== undefined) {
      skill.set('nodePreview', nodePreview === null ? undefined : nodePreview);
    }
    if (prerequisites !== undefined) skill.prerequisites = prerequisites;
    if (isActive !== undefined) skill.isActive = isActive;
    if (isAdvancedLocked !== undefined) skill.isAdvancedLocked = isAdvancedLocked === true;
    if (nodeColor !== undefined) skill.nodeColor = nodeColor;
    if (connections !== undefined) skill.connections = connections;
    if (subQuests !== undefined) {
      skill.subQuests = normalizeSubQuests(subQuests, skill.subQuests || []);
    }
    if (minAP !== undefined) skill.minAP = minAP !== null && minAP !== '' ? minAP : undefined;
    if (maxAP !== undefined) skill.maxAP = maxAP !== null && maxAP !== '' ? maxAP : undefined;

    console.log(`📝 Updating skill: ${skill.title}`, { 
      connections: skill.connections, 
      minAP, 
      maxAP,
      contentYouTube: skill.contentYouTube,
      contentGoogleDrive: skill.contentGoogleDrive,
      previewClip: skill.previewClip
    });

    await validateSkillMapAssignment({
      skillId: skill._id.toString(),
      constellationMapId: skill.constellationMapId,
      mapNodeRole: skill.mapNodeRole,
      mainQuestLevel: skill.mainQuestLevel
    });
    await assertPublishedMainQuestReady(skill);
    if (connections !== undefined || constellationMapId !== undefined) {
      await assertValidConnectionTargets(
        skill._id.toString(),
        skill.constellationMapId,
        skill.connections || []
      );
    }
    await skill.save();
    invalidateSkillCaches();
    
    // Reload from database to ensure we return the latest data
    const updatedSkill = await Skill.findById(skill._id);
    console.log(`✅ Skill updated successfully. Content after save:`, {
      contentYouTube: updatedSkill?.contentYouTube,
      contentGoogleDrive: updatedSkill?.contentGoogleDrive,
      previewClip: updatedSkill?.previewClip
    });
    
    res.json({ success: true, skill: updatedSkill });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to update skill');
  }
});

app.patch('/api/constellation-maps/:id/skills/batch', requireConstellationSkillEditor, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid constellation map ID' });
    }
    const skillIds: string[] = Array.isArray(req.body?.skillIds) ? [...new Set<string>(req.body.skillIds.map(String))] : [];
    if (skillIds.length < 1 || skillIds.length > 500 || skillIds.some(id => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: 'skillIds must contain between 1 and 500 valid IDs' });
    }
    const changes = req.body?.changes;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return res.status(400).json({ error: 'changes must be an object' });
    }
    const allowedFields = new Set(['constellationLabel', 'mapNodeRole', 'isActive', 'isAdvancedLocked']);
    const requestedFields = Object.keys(changes);
    if (requestedFields.length !== 1 || !allowedFields.has(requestedFields[0])) {
      return res.status(400).json({ error: 'Batch updates must change exactly one supported field' });
    }

    const map = await ConstellationMap.findById(req.params.id).select('_id scope constellationType').lean();
    if (!map) return res.status(404).json({ error: 'Constellation map not found' });
    const matchingCount = await Skill.countDocuments({
      _id: { $in: skillIds },
      constellationMapId: map._id
    });
    if (matchingCount !== skillIds.length) {
      throw new ConstellationOperationError('Every selected star must belong to this constellation map', 409);
    }

    const field = requestedFields[0];
    let value = changes[field];
    if (field === 'mapNodeRole') {
      if (!['topic-gateway', 'lesson', 'boss', 'capstone'].includes(value)) {
        throw new ConstellationOperationError('Invalid star type');
      }
      assertRoleAllowedForScope(map.scope, value, map.constellationType || 'skill');
    } else if (field === 'constellationLabel') {
      if (typeof value !== 'string' || value.length > 80) {
        throw new ConstellationOperationError('Star label must be at most 80 characters');
      }
      value = value.trim() || undefined;
    } else if (typeof value !== 'boolean') {
      throw new ConstellationOperationError(`${field} must be a boolean`);
    }

    if (map.constellationType === 'main' && field === 'isActive' && value === true) {
      const quests = await Skill.find({ _id: { $in: skillIds }, constellationMapId: map._id })
        .select('title mainQuestLevel isActive subQuests.title')
        .lean();
      const issues = mainQuestReadinessIssues(quests.map(quest => ({ ...quest, isActive: true })));
      if (issues.length > 0) throw new ConstellationOperationError(issues[0], 409);
    }

    const update = value === undefined ? { $unset: { [field]: 1 } } : { $set: { [field]: value } };
    await Skill.updateMany({ _id: { $in: skillIds }, constellationMapId: map._id }, update);
    invalidateSkillCaches();
    const updatedSkills = await Skill.find({ _id: { $in: skillIds } }).lean();
    res.json({ success: true, updatedCount: updatedSkills.length, skills: updatedSkills });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to update selected stars');
  }
});

app.delete('/api/skills/:id', requireConstellationSkillEditor, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    const cascade = req.query.cascade === 'true';
    const dependentTopic = await ConstellationMap.findOne({ gatewaySkillId: skill._id }).select('_id').lean();
    if (dependentTopic && !cascade) await assertSkillCanBeDeleted(req.params.id);

    let deletedMaps = 0;
    const skillIds = [skill._id];
    let dependentMapIds: mongoose.Types.ObjectId[] = [];
    if (dependentTopic) {
      dependentMapIds = await collectConstellationMapIds(dependentTopic._id);
      const ownedSkills = await Skill.find({ constellationMapId: { $in: dependentMapIds } }).select('_id').lean();
      skillIds.push(...ownedSkills.map(candidate => candidate._id));
    }

    const uniqueSkillIds = [...new Map(skillIds.map(id => [id.toString(), id])).values()];
    const deletedSkills = await deleteSkillsWithReferences(uniqueSkillIds);
    if (dependentMapIds.length > 0) {
      const mapResult = await ConstellationMap.deleteMany({ _id: { $in: dependentMapIds } });
      deletedMaps = mapResult.deletedCount;
      invalidateConstellationMapCache();
    }
    res.json({
      success: true,
      message: 'Star and related data deleted successfully',
      deletedSkills,
      deletedMaps
    });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to delete skill');
  }
});

app.post('/api/skills/:id/connections', requireConstellationSkillEditor, async (req: Request, res: Response) => {
  try {
    const { targetSkillId, connectionType, hasArrowhead, breakPoints, curveMode, controlPoints } = req.body;

    if (!targetSkillId || !connectionType) {
      return res.status(400).json({ error: 'Missing targetSkillId or connectionType' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(targetSkillId)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    if (controlPoints !== undefined && !validControlPoints(controlPoints)) {
      return res.status(400).json({ error: 'controlPoints must contain two numeric x/y points' });
    }
    if (curveMode !== undefined && curveMode !== 'auto' && curveMode !== 'bezier') {
      return res.status(400).json({ error: 'curveMode must be auto or bezier' });
    }

    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    await assertValidConnectionTargets(skill.id, skill.constellationMapId, [{ targetSkillId }]);

    // Initialize connections array if undefined
    if (!skill.connections) {
      skill.connections = [];
    }

    // Check if connection already exists
    const existingConnection = skill.connections.find(
      (conn: any) => conn.targetSkillId.toString() === targetSkillId
    );

    if (existingConnection) {
      return res.status(400).json({ error: 'Connection already exists' });
    }

    // Add new connection
    skill.connections.push({ 
      targetSkillId, 
      connectionType,
      hasArrowhead: hasArrowhead !== undefined ? hasArrowhead : true,
      breakPoints: breakPoints || [],
      curveMode: curveMode === 'bezier' ? 'bezier' : 'auto',
      controlPoints: controlPoints || []
    });
    
    console.log(`🔗 Adding connection: ${skill.title} -> ${targetSkillId} (${connectionType}, arrowhead: ${hasArrowhead})`);
    
    await skill.save();
    invalidateSkillCaches();
    res.json({ success: true, skill });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to add connection');
  }
});

app.put('/api/skills/:id/connections/:targetSkillId', requireConstellationSkillEditor, async (req: Request, res: Response) => {
  try {
    const { id, targetSkillId } = req.params;
    const { hasArrowhead, breakPoints, connectionType, curveMode, controlPoints } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(targetSkillId)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    const skill = await Skill.findById(id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    await assertValidConnectionTargets(skill.id, skill.constellationMapId, [{ targetSkillId }]);

    // Initialize connections array if undefined
    if (!skill.connections) {
      skill.connections = [];
    }

    // Find and update connection
    const connection = skill.connections.find(
      (conn: any) => conn.targetSkillId.toString() === targetSkillId
    );

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    if (controlPoints !== undefined && !validControlPoints(controlPoints)) {
      return res.status(400).json({ error: 'controlPoints must contain two numeric x/y points' });
    }
    if (curveMode !== undefined && curveMode !== 'auto' && curveMode !== 'bezier') {
      return res.status(400).json({ error: 'curveMode must be auto or bezier' });
    }

    // Update properties
    if (hasArrowhead !== undefined) connection.hasArrowhead = hasArrowhead;
    if (breakPoints !== undefined) connection.breakPoints = breakPoints;
    if (connectionType !== undefined) connection.connectionType = connectionType;
    if (curveMode !== undefined) connection.curveMode = curveMode;
    if (controlPoints !== undefined) connection.controlPoints = controlPoints;

    console.log(`🔄 Updating connection: ${skill.title} -> ${targetSkillId}`, { hasArrowhead, breakPoints: breakPoints?.length });

    await skill.save();
    invalidateSkillCaches();
    res.json({ success: true, skill });
  } catch (error) {
    sendConstellationError(res, error, 'Failed to update connection');
  }
});

app.delete('/api/skills/:id/connections/:targetSkillId', requireConstellationSkillEditor, async (req: Request, res: Response) => {
  try {
    const { id, targetSkillId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(targetSkillId)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    const skill = await Skill.findById(id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Initialize connections array if undefined
    if (!skill.connections) {
      skill.connections = [];
    }

    // Remove connection
    skill.connections = skill.connections.filter(
      (conn: any) => conn.targetSkillId.toString() !== targetSkillId
    );

    console.log(`🔓 Removing connection: ${skill.title} -> ${targetSkillId}`);

    await skill.save();
    invalidateSkillCaches();
    res.json({ success: true, skill });
  } catch (error) {
    console.error('Error removing connection:', error);
    res.status(500).json({ error: 'Failed to remove connection' });
  }
});

// ==================== SKILL TREE SETTINGS API ====================

// Get skill tree settings (authenticated users can view)
// Migrate existing skills to set nodeType based on nodeColor (super-admin only)
app.post('/api/skills/migrate-node-type', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const colorToTypeMap: { [key: string]: 'adventure' | 'asset' | 'quest' | 'marker' | 'EXTRA' } = {
      'white': 'adventure',
      'blue': 'asset',
      'green': 'quest',
      'yellow': 'marker',
      'purple': 'EXTRA'
    };

    const skills = await Skill.find({});
    let updatedCount = 0;

    for (const skill of skills) {
      if (!skill.nodeType && skill.nodeColor) {
        skill.nodeType = colorToTypeMap[skill.nodeColor] || 'asset';
        await skill.save();
        updatedCount++;
      }
    }

    invalidateSkillCaches();
    res.json({ 
      success: true, 
      message: `Updated ${updatedCount} skills with nodeType based on nodeColor`,
      updatedCount 
    });
  } catch (error) {
    console.error('Error migrating node types:', error);
    res.status(500).json({ error: 'Failed to migrate node types' });
  }
});

app.get('/api/skill-tree-settings', requireAuth, async (req: Request, res: Response) => {
  try {
    let settings = await SkillTreeSettings.findOne();
    if (!settings) {
      const defaultLayerGaps = new Map();
      for (let i = 1; i <= 7; i++) {
        defaultLayerGaps.set(String(i), 120); // Use string keys for Mongoose Map
      }
      settings = new SkillTreeSettings({ 
        layerGap: 120,
        layerGaps: defaultLayerGaps,
        arrowheadGapFromNode: 0,
        arrowheadStartPoint: 0,
        arrowheadSize: 20
      });
      await settings.save();
    }
    // Convert Map to object for JSON response, converting string keys back to numbers
    const settingsObj = settings.toObject();
    if (settingsObj.layerGaps && settingsObj.layerGaps instanceof Map) {
      const gapsObj: { [key: number]: number } = {};
      settingsObj.layerGaps.forEach((value: number, key: string) => {
        gapsObj[Number(key)] = value;
      });
      settingsObj.layerGaps = gapsObj;
    }
    res.json({ success: true, settings: settingsObj });
  } catch (error) {
    console.error('Error fetching skill tree settings:', error);
    res.status(500).json({ error: 'Failed to fetch skill tree settings' });
  }
});

// Update skill tree settings (super-admin only)
app.put('/api/skill-tree-settings', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { layerGap, layerGaps, arrowheadGapFromNode, arrowheadStartPoint, arrowheadSize } = req.body;
    console.log('📥 Received skill tree settings update:', { layerGap, layerGaps, arrowheadGapFromNode, arrowheadStartPoint, arrowheadSize });

    let settings = await SkillTreeSettings.findOne();
    if (!settings) {
      const defaultLayerGaps = new Map();
      for (let i = 1; i <= 7; i++) {
        defaultLayerGaps.set(String(i), layerGap !== undefined ? layerGap : 120); // Use string keys
      }
      settings = new SkillTreeSettings({ 
        layerGap: layerGap !== undefined ? layerGap : 120,
        layerGaps: layerGaps ? new Map(Object.entries(layerGaps).map(([k, v]) => [String(k), v])) : defaultLayerGaps,
        arrowheadGapFromNode: arrowheadGapFromNode !== undefined ? arrowheadGapFromNode : 0,
        arrowheadStartPoint: arrowheadStartPoint !== undefined ? arrowheadStartPoint : 0,
        arrowheadSize: arrowheadSize !== undefined ? arrowheadSize : 20
      });
    } else {
      if (layerGap !== undefined) {
        if (layerGap < 80 || layerGap > 300) {
          return res.status(400).json({ error: 'Layer gap must be between 80 and 300' });
        }
        settings.layerGap = layerGap;
      }
      if (layerGaps !== undefined) {
        console.log('📊 Processing layerGaps:', layerGaps);
        // Validate and update per-layer gaps
        // Mongoose Maps require string keys, so we convert numbers to strings
        const layerGapsMap = new Map();
        for (let layer = 1; layer <= 7; layer++) {
          const gap = layerGaps[layer];
          if (gap !== undefined) {
            if (typeof gap !== 'number' || gap < 80 || gap > 300) {
              console.error(`❌ Invalid gap for layer ${layer}:`, gap);
              return res.status(400).json({ error: `Layer ${layer} gap must be a number between 80 and 300, got: ${gap}` });
            }
            layerGapsMap.set(String(layer), gap); // Convert to string for Mongoose Map
          } else {
            // Use existing value or default
            const existingGaps = settings.layerGaps instanceof Map 
              ? settings.layerGaps 
              : (settings.layerGaps ? new Map(Object.entries(settings.layerGaps).map(([k, v]) => [String(k), v])) : new Map());
            const existing = existingGaps.get(String(layer)) || settings.layerGap || 120;
            layerGapsMap.set(String(layer), existing);
          }
        }
        console.log('✅ Created layerGapsMap:', Array.from(layerGapsMap.entries()));
        settings.layerGaps = layerGapsMap as any;
      }
      if (arrowheadGapFromNode !== undefined) {
        if (arrowheadGapFromNode < 0 || arrowheadGapFromNode > 100) {
          return res.status(400).json({ error: 'Arrowhead gap from node must be between 0 and 100' });
        }
        settings.arrowheadGapFromNode = arrowheadGapFromNode;
      }
      if (arrowheadStartPoint !== undefined) {
        if (arrowheadStartPoint < -50 || arrowheadStartPoint > 50) {
          return res.status(400).json({ error: 'Arrowhead start point must be between -50 and 50' });
        }
        settings.arrowheadStartPoint = arrowheadStartPoint;
      }
      if (arrowheadSize !== undefined) {
        if (arrowheadSize < 10 || arrowheadSize > 50) {
          return res.status(400).json({ error: 'Arrowhead size must be between 10 and 50' });
        }
        settings.arrowheadSize = arrowheadSize;
      }
    }
    await settings.save();
    console.log('✅ Settings saved successfully');
    // Convert Map to object for JSON response, converting string keys back to numbers
    const settingsObj = settings.toObject();
    if (settingsObj.layerGaps && settingsObj.layerGaps instanceof Map) {
      const gapsObj: { [key: number]: number } = {};
      settingsObj.layerGaps.forEach((value: number, key: string) => {
        gapsObj[Number(key)] = value;
      });
      settingsObj.layerGaps = gapsObj;
    }
    res.json({ success: true, settings: settingsObj });
  } catch (error: any) {
    console.error('❌ Error updating skill tree settings:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ error: `Failed to update skill tree settings: ${error.message || 'Unknown error'}` });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'image-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

// Unlock skill endpoint (authenticated users)
app.post('/api/skills/:id/unlock', requireAuth, async (req: Request, res: Response) => {
  try {
    const skillId = req.params.id;
    const userId = req.user!.id;

    if (!mongoose.Types.ObjectId.isValid(skillId)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    // Get user and skill
    const user = await User.findOne({ discordId: userId });
    const skill = await getPlayerEligibleSkill(skillId, user?.level || 1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    if (skill.nodeType === 'quest' || skill.nodeColor === 'green') {
      return res.status(400).json({ error: 'Quest nodes must be completed and approved by an admin' });
    }

    // Check if already unlocked
    const unlockedSkills = user.unlockedSkills || [];
    if (unlockedSkills.includes(skillId)) {
      return res.status(400).json({ error: 'Skill already unlocked' });
    }

    // Check prerequisites from prerequisites array
    if (skill.prerequisites && skill.prerequisites.length > 0) {
      const missingPrerequisites = skill.prerequisites.filter(
        (prereqId: string) => !unlockedSkills.includes(prereqId)
      );
      if (missingPrerequisites.length > 0) {
        return res.status(400).json({ 
          error: 'Prerequisites not met',
          missingPrerequisites 
        });
      }
    }

    // Check prerequisites from connections (if any skill has a connection pointing to this skill, it's a prerequisite)
    const allSkills = await getActiveSkills();
    const prerequisiteSkillsFromConnections = allSkills.filter(
      (s) => s.connections && s.connections.some((conn: any) => conn.targetSkillId?.toString() === skillId)
    );
    
    if (prerequisiteSkillsFromConnections.length > 0) {
      const missingConnectionPrerequisites = prerequisiteSkillsFromConnections
        .filter((prereqSkill) => !unlockedSkills.includes(prereqSkill._id.toString()))
        .map((prereqSkill) => prereqSkill._id.toString());
      
      if (missingConnectionPrerequisites.length > 0) {
        const missingSkillTitles = prerequisiteSkillsFromConnections
          .filter((prereqSkill) => !unlockedSkills.includes(prereqSkill._id.toString()))
          .map((s) => s.title);
        return res.status(400).json({ 
          error: 'Connection prerequisites not met',
          missingPrerequisites: missingConnectionPrerequisites,
          missingSkillTitles
        });
      }
    }

    const isAdventure = skill.nodeType === 'adventure' || skill.nodeColor === 'white';
    const isMarker = skill.nodeType === 'marker' || skill.nodeColor === 'yellow';
    const cost = isAdventure || isMarker ? 0 : skill.cost;
    const updatedUser = await unlockSkillOnce(userId, skillId, cost, isAdventure ? 25 : 0);
    if (!updatedUser) {
      const currentUser = await User.findOne({ discordId: userId }).select('assetPoints unlockedSkills').lean();
      if (currentUser?.unlockedSkills?.includes(skillId)) {
        return res.status(400).json({ error: 'Skill already unlocked' });
      }
      return res.status(400).json({
        error: 'Insufficient asset points',
        required: cost,
        available: currentUser?.assetPoints || 0
      });
    }

    sessionUserCache.delete(userId);
    invalidateProgressionCache();
    res.json({ 
      success: true, 
      message: 'Skill unlocked successfully',
      remainingAssetPoints: updatedUser.assetPoints
    });
  } catch (error: any) {
    console.error('Error unlocking skill:', error);
    res.status(500).json({ error: error.message || 'Failed to unlock skill' });
  }
});

// Get user's unlocked skills (authenticated users)
app.get('/api/user/unlocked-skills', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ discordId: req.user!.id }).select('unlockedSkills');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      success: true, 
      unlockedSkills: user.unlockedSkills || [] 
    });
  } catch (error: any) {
    console.error('Error fetching unlocked skills:', error);
    res.status(500).json({ error: 'Failed to fetch unlocked skills' });
  }
});

const QUEST_STEP_REWARD_AP = 5;

const getMissingQuestPrerequisites = async (skill: any, unlockedSkills: string[]) => {
  const missing = new Set<string>(
    (skill.prerequisites || []).filter((prerequisiteId: string) => !unlockedSkills.includes(prerequisiteId))
  );
  const connectedPrerequisites = await Skill.find({
    'connections.targetSkillId': skill.id
  }).select('_id');
  connectedPrerequisites.forEach(prerequisite => {
    const prerequisiteId = prerequisite._id.toString();
    if (!unlockedSkills.includes(prerequisiteId)) missing.add(prerequisiteId);
  });
  return [...missing];
};

const isMainConstellationQuest = async (skill: any) => {
  if (!skill.constellationMapId) return false;
  const map = await ConstellationMap.findById(skill.constellationMapId)
    .select('constellationType')
    .lean();
  return map?.constellationType === 'main';
};

app.get('/api/user/quest-progress', requireAuth, async (req: Request, res: Response) => {
  try {
    const [user, pendingRequests] = await Promise.all([
      User.findOne({ discordId: req.user!.id }).select('completedQuestSteps completedQuestRewards'),
      ApprovalRequest.find({ userId: req.user!.id, status: 'pending' }).select('skillId')
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      success: true,
      completedSteps: (user.completedQuestSteps || []).map(step => ({ skillId: step.skillId, stepId: step.stepId })),
      completedQuests: user.completedQuestRewards || [],
      pendingApprovalSkillIds: pendingRequests.map(request => request.skillId)
    });
  } catch (error) {
    console.error('Error fetching quest progress:', error);
    res.status(500).json({ error: 'Failed to fetch quest progress' });
  }
});

app.post('/api/skills/:id/steps/:stepId/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    const user = await User.findOne({ discordId: req.user!.id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const skill = await getPlayerEligibleSkill(req.params.id, user.level || 1);
    if (!skill) return res.status(404).json({ error: 'Quest not found' });

    const missingPrerequisites = await getMissingQuestPrerequisites(skill, user.unlockedSkills || []);
    if (missingPrerequisites.length > 0) {
      return res.status(400).json({ error: 'Complete the previous quest first', missingPrerequisites });
    }

    const steps = skill.subQuests || [];
    if (await isMainConstellationQuest(skill)) {
      return res.status(400).json({ error: 'Main quests do not use quest step completion' });
    }
    const stepIndex = steps.findIndex((step, index) => (step.externalId || `step-${index}`) === req.params.stepId);
    if (stepIndex < 0) return res.status(404).json({ error: 'Quest step not found' });

    const stepId = steps[stepIndex].externalId || `step-${stepIndex}`;
    const updatedUser = await completeQuestStepOnce(
      req.user!.id,
      skill.id,
      stepId,
      QUEST_STEP_REWARD_AP
    );
    if (!updatedUser) {
      return res.status(400).json({ error: 'Quest step already completed' });
    }

    const completedSteps = updatedUser.completedQuestSteps || [];
    const completeStepIds = new Set(completedSteps.filter(step => step.skillId === skill.id).map(step => step.stepId));
    const questCompleted = areQuestStepsComplete(steps, completeStepIds);
    sessionUserCache.delete(req.user!.id);
    res.json({
      success: true,
      stepReward: QUEST_STEP_REWARD_AP,
      questReward: 0,
      assetPoints: updatedUser.assetPoints,
      completedSteps: completedSteps.filter(step => step.skillId === skill.id).map(step => step.stepId),
      allStepsCompleted: questCompleted,
      approvalRequired: questCompleted,
      questCompleted: (updatedUser.completedQuestRewards || []).includes(skill.id)
    });
  } catch (error) {
    console.error('Error completing quest step:', error);
    res.status(500).json({ error: 'Failed to complete quest step' });
  }
});

// Send approval request for quest node (authenticated users)
app.post('/api/skills/:id/approval-request', requireAuth, async (req: Request, res: Response) => {
  try {
    const skillId = req.params.id;
    const userId = req.user!.id;
    const { message } = req.body;

    if (!mongoose.Types.ObjectId.isValid(skillId)) {
      return res.status(400).json({ error: 'Invalid quest ID' });
    }
    // Get user and skill
    const user = await User.findOne({ discordId: userId });
    const skill = await getPlayerEligibleSkill(skillId, user?.level || 1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    const isMainQuest = await isMainConstellationQuest(skill);
    // Main Quest stars are reviewable regardless of their legacy node colour.
    const isQuest = isMainQuest || skill.nodeType === 'quest' || skill.nodeColor === 'green';
    if (!isQuest) {
      return res.status(400).json({ error: 'Approval requests are only for quest nodes' });
    }

    const unlockedSkills = user.unlockedSkills || [];
    const missingPrerequisites = isMainQuest
      ? []
      : await getMissingQuestPrerequisites(skill, unlockedSkills);
    if (missingPrerequisites.length > 0) {
      return res.status(400).json({ error: 'Complete the previous quest first', missingPrerequisites });
    }

    const steps = skill.subQuests || [];
    const completedStepIds = new Set(
      (user.completedQuestSteps || [])
        .filter(step => step.skillId === skillId)
        .map(step => step.stepId)
    );
    const allStepsCompleted = isMainQuest || areQuestStepsComplete(steps, completedStepIds);
    if (!allStepsCompleted) {
      return res.status(400).json({
        error: steps.length === 0
          ? 'Add at least one quest step before requesting approval'
          : 'Complete every quest step before requesting approval'
      });
    }
    const nextQuestCost = skill.nextQuestCost ?? 25;
    if (!isMainQuest && (user.assetPoints || 0) < nextQuestCost) {
      return res.status(400).json({
        error: `You need ${nextQuestCost} AP before requesting approval`,
        required: nextQuestCost,
        available: user.assetPoints || 0
      });
    }

    // Check if already unlocked
    if (!isMainQuest && unlockedSkills.includes(skillId)) {
      return res.status(400).json({ error: 'Skill already unlocked' });
    }

    // Check if there's already a pending request for this skill by this user
    const existingPendingRequest = await ApprovalRequest.findOne({
      userId,
      skillId,
      status: 'pending'
    });

    if (existingPendingRequest) {
      return res.status(400).json({ error: 'You already have a pending approval request for this quest' });
    }

    const approvedRequest = await ApprovalRequest.findOne({
      userId,
      skillId,
      status: 'approved'
    });
    if (approvedRequest) {
      return res.status(400).json({ error: 'This quest has already been approved for you' });
    }

    // Create approval request
    const approvalRequest = new ApprovalRequest({
      userId,
      skillId,
      message: message || '',
      status: 'pending'
    });

    await approvalRequest.save();

    invalidateProgressionCache();
    res.json({ 
      success: true, 
      message: 'Approval request sent successfully',
      requestId: approvalRequest._id
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(400).json({ error: 'You already have a pending approval request for this quest' });
    }
    console.error('Error creating approval request:', error);
    res.status(500).json({ error: error.message || 'Failed to create approval request' });
  }
});

// Get all pending approval requests (admin only)
app.get('/api/approval-requests', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { guildId } = req.query; // Optional guild filter
    
    let query: any = { status: 'pending' };
    
    // If guildId filter is provided, only get requests from users in that guild
    if (guildId && guildId !== 'all') {
      const usersInGuild = await User.find({ guildId: guildId }).select('discordId').lean();
      const userIds = usersInGuild.map(u => u.discordId);
      query.userId = { $in: userIds };
    }

    const requests = await ApprovalRequest.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const [usersById, skills] = await Promise.all([
      getUserSummariesByDiscordId(requests.map(request => request.userId)),
      Skill.find({
        _id: {
          $in: requests
            .map(request => request.skillId)
            .filter(skillId => mongoose.Types.ObjectId.isValid(skillId))
        }
      }).select('title description minAP maxAP nextQuestCost mainQuestLevel constellationMapId').lean()
    ]);
    const skillsById = new Map(skills.map(skill => [skill._id.toString(), skill]));
    const approvalMapIds = [...new Set(skills.map(skill => skill.constellationMapId?.toString()).filter(Boolean))];
    const approvalMaps = approvalMapIds.length > 0
      ? await ConstellationMap.find({ _id: { $in: approvalMapIds } }).select('_id constellationType').lean()
      : [];
    const approvalMapTypeById = new Map(approvalMaps.map(map => [map._id.toString(), map.constellationType || 'skill']));
    const guildIds = [...new Set(
      [...usersById.values()]
        .map(user => user.guildId)
        .filter((guildId): guildId is string => Boolean(guildId) && mongoose.Types.ObjectId.isValid(guildId))
    )];
    const guilds = guildIds.length > 0
      ? await Guild.find({ _id: { $in: guildIds } }).select('name').lean()
      : [];
    const guildsById = new Map(guilds.map(guild => [guild._id.toString(), guild]));

    const requestsWithUserInfo = requests.map((request: any) => {
      const user = usersById.get(request.userId);
      const skill = skillsById.get(request.skillId);
      const guild = user?.guildId ? guildsById.get(user.guildId) : null;
      return {
        ...request,
        user: presentUserSummary(user),
        guild: guild ? { _id: guild._id, name: guild.name } : null,
        skill: skill ? {
          _id: skill._id,
          title: skill.title,
          description: skill.description,
          minAP: skill.minAP,
          maxAP: skill.maxAP,
          nextQuestCost: skill.nextQuestCost,
          mainQuestLevel: skill.mainQuestLevel,
          isMainQuest: skill.constellationMapId
            ? approvalMapTypeById.get(skill.constellationMapId.toString()) === 'main'
            : false
        } : null
      };
    });

    res.json({ 
      success: true, 
      requests: requestsWithUserInfo
    });
  } catch (error: any) {
    console.error('Error fetching approval requests:', error);
    res.status(500).json({ error: 'Failed to fetch approval requests' });
  }
});

// Approve an approval request (admin only)
app.post('/api/approval-requests/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  try {
    const requestId = req.params.id;
    const { rewardAP } = req.body;
    const adminId = req.user!.id;

    if (!Number.isFinite(rewardAP) || rewardAP < 0) {
      return res.status(400).json({ error: 'Valid reward AP amount is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ error: 'Invalid approval request ID' });
    }

    const approvalRequest = await ApprovalRequest.findById(requestId).select('userId skillId status').lean();
    if (!approvalRequest) return res.status(404).json({ error: 'Approval request not found' });
    if (approvalRequest.status !== 'pending') {
      return res.status(409).json({ error: 'This request has already been processed' });
    }
    const targetUser = await User.findOne({ discordId: approvalRequest.userId }).select('level').lean();
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    const eligibleSkill = mongoose.Types.ObjectId.isValid(approvalRequest.skillId)
      ? await getPlayerEligibleSkill(approvalRequest.skillId, targetUser.level || 1)
      : null;
    if (!eligibleSkill) {
      return res.status(409).json({ error: 'Quest is no longer active or eligible for this user' });
    }

    let approvalResult;
    try {
      approvalResult = await approveQuestRequest(requestId, adminId, rewardAP);
    } catch (error) {
      if (error instanceof ApprovalOperationError) {
        return res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
      }
      throw error;
    }

    sessionUserCache.delete(approvalResult.userId);
    invalidateProgressionCache();
    res.json({ 
      success: true, 
      message: 'Approval request approved successfully',
      remainingAssetPoints: approvalResult.remainingAssetPoints,
      nextQuestCost: approvalResult.nextQuestCost,
      level: approvalResult.level,
      leveledUp: approvalResult.leveledUp,
      completedLevel: approvalResult.completedLevel
    });
  } catch (error: any) {
    console.error('Error approving request:', error);
    res.status(500).json({ error: error.message || 'Failed to approve request' });
  }
});

// Upload image endpoint (admin only)
app.post('/api/upload/image', requireAdmin, (req: Request, res: Response) => {
  upload.single('image')(req, res, (err: any) => {
    if (err) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
      }
      if (err.message === 'Only image files are allowed!') {
        return res.status(400).json({ error: 'Only image files are allowed!' });
      }
      return res.status(400).json({ error: err.message || 'Failed to upload image' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Please select an image file.' });
      }

      console.log('✅ Image uploaded successfully:', req.file.filename, 'Size:', req.file.size);

      // Return the URL to access the uploaded file
      // The base URL should match where the backend is accessible from the frontend
      // Use BACKEND_URL from env, or construct from request headers (for nginx proxy), or fallback to localhost
      let baseUrl = process.env.BACKEND_URL;
      
      if (!baseUrl) {
        // Try to construct from request headers (when behind nginx proxy)
        const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const pathPrefix = req.headers['x-forwarded-prefix'] || '/gugame-back';
        
        if (host && host !== `localhost:${PORT}` && !host.includes('127.0.0.1')) {
          // We're behind a proxy - construct the full URL
          baseUrl = `${protocol}://${host}${pathPrefix}`;
        } else {
          // Fallback to localhost (development)
          baseUrl = `http://localhost:${PORT}`;
        }
      }
      
      const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;
      
      res.json({ success: true, url: fileUrl, filename: req.file.filename });
    } catch (error: any) {
      console.error('Error processing uploaded image:', error);
      res.status(500).json({ error: error.message || 'Failed to process uploaded image' });
    }
  });
});

// Get all uploaded images (super-admin only)
app.get('/api/admin/images', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    const images = files
      .filter(file => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file))
      .map(file => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        const baseUrl = process.env.BACKEND_URL || (() => {
          const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
          const host = req.headers['x-forwarded-host'] || req.headers.host;
          const pathPrefix = req.headers['x-forwarded-prefix'] || '/gugame-back';
          if (host && host !== `localhost:${PORT}` && !host.includes('127.0.0.1')) {
            return `${protocol}://${host}${pathPrefix}`;
          }
          return `http://localhost:${PORT}`;
        })();
        
        return {
          filename: file,
          url: `${baseUrl}/uploads/${file}`,
          size: stats.size,
          uploadedAt: stats.birthtime,
          modifiedAt: stats.mtime
        };
      })
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    // Check which images are used in skills
    const allSkills = await Skill.find({}).lean();
    const usedImages = new Set<string>();
    
    allSkills.forEach(skill => {
      if (skill.description) {
        // Extract image URLs from markdown syntax ![alt](url)
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        while ((match = imageRegex.exec(skill.description)) !== null) {
          const imageUrl = match[2];
          const filename = path.basename(imageUrl);
          usedImages.add(filename);
        }
      }
    });

    const imagesWithUsage = images.map(img => ({
      ...img,
      isUsed: usedImages.has(img.filename)
    }));

    res.json({ 
      success: true, 
      images: imagesWithUsage,
      total: imagesWithUsage.length,
      used: imagesWithUsage.filter(img => img.isUsed).length,
      unused: imagesWithUsage.filter(img => !img.isUsed).length
    });
  } catch (error: any) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

// Delete an uploaded image (super-admin only)
app.delete('/api/admin/images/:filename', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    
    // Security: only allow deleting files in uploads directory, prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Check if image is used in any skill
    const allSkills = await Skill.find({}).lean();
    const imageUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/uploads/${filename}`;
    
    let isUsed = false;
    for (const skill of allSkills) {
      if (skill.description && skill.description.includes(imageUrl)) {
        isUsed = true;
        break;
      }
      // Also check with just filename in case URL format differs
      if (skill.description && skill.description.includes(filename)) {
        isUsed = true;
        break;
      }
    }

    if (isUsed) {
      return res.status(400).json({ 
        error: 'Image is currently used in a skill description. Please remove it from the skill first.' 
      });
    }

    fs.unlinkSync(filePath);
    
    res.json({ 
      success: true, 
      message: 'Image deleted successfully' 
    });
  } catch (error: any) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: error.message || 'Failed to delete image' });
  }
});

// Inventory and HamsterQuest account linking
app.get('/api/inventory', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const shouldRefresh = req.query.refresh === 'true';
    if (!req.user!.state) {
      return res.status(404).json({ error: 'User not found' });
    }

    let syncWarning: string | null = null;
    if (shouldRefresh && isHamsterQuestConfigured()) {
      try {
        await syncHamsterQuestInventory(userId, true);
      } catch (error) {
        syncWarning = getHamsterQuestErrorMessage(error);
        console.error(`Unable to sync HamsterQuest inventory for ${userId}:`, syncWarning);
      }
    }

    res.json({
      success: true,
      items: await presentUserInventory(userId, shouldRefresh),
      hamsterQuestLinked: req.user!.state.hamsterQuestLinked,
      hamsterQuestConfigured: isHamsterQuestConfigured(),
      syncWarning
    });
  } catch (error: any) {
    console.error('Error loading inventory:', error);
    res.status(500).json({ error: error.message || 'Failed to load inventory' });
  }
});

app.get('/api/inventory/hamsterquest/link-url', requireAuth, (req: Request, res: Response) => {
  const callbackUrl = `${FRONTEND_URL}/hamster-link`;
  res.json({ success: true, url: getHamsterQuestLinkUrl(callbackUrl) });
});

app.post('/api/inventory/hamsterquest/link', requireAuth, async (req: Request, res: Response) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!token) {
      return res.status(400).json({ error: 'HamsterQuest token is required' });
    }

    const profile = await validateHamsterQuestToken(token);
    if (!profile?.discordId || String(profile.discordId) !== req.user!.id) {
      return res.status(403).json({ error: 'The HamsterQuest account does not match your Discord account' });
    }

    await User.updateOne(
      { discordId: req.user!.id },
      { $set: { hamsterQuestAccessToken: token, hamsterQuestLinkedAt: new Date() } }
    );
    sessionUserCache.delete(req.user!.id);
    await syncHamsterQuestInventory(req.user!.id, true);

    res.json({ success: true });
  } catch (error) {
    console.error('Error linking HamsterQuest account:', getHamsterQuestErrorMessage(error));
    res.status(isHamsterQuestUnauthorized(error) ? 401 : 502).json({
      error: isHamsterQuestUnauthorized(error)
        ? 'HamsterQuest login expired. Please try linking again.'
        : getHamsterQuestErrorMessage(error)
    });
  }
});

app.post('/api/inventory/:purchaseId/use', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    if (!mongoose.Types.ObjectId.isValid(req.params.purchaseId)) {
      return res.status(400).json({ error: 'Invalid inventory item ID' });
    }
    const purchase = await Purchase.findOne({
      _id: req.params.purchaseId,
      userId,
      quantity: { $gt: 0 }
    });
    if (!purchase) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const shopItem = await ShopItem.findById(purchase.shopItemId);
    if (!shopItem || shopItem.externalSource !== 'office-catalog' || !shopItem.externalItemId) {
      return res.status(400).json({ error: 'This item cannot be used in GuGame' });
    }

    const catalogItem = await getOfficeCatalogItem(shopItem.externalItemId);
    const externalItemType = catalogItem?.type || shopItem.externalItemType || '';
    if (!HAMSTERQUEST_USABLE_ITEM_TYPES.has(externalItemType)) {
      return res.status(400).json({ error: 'Only Gacha and Discord notification items can be used in GuGame' });
    }

    const user = await User.findOne({ discordId: userId }).select('+hamsterQuestAccessToken');
    if (!user?.hamsterQuestAccessToken) {
      return res.status(428).json({
        error: 'Link HamsterQuest before using this item',
        code: 'HAMSTERQUEST_LINK_REQUIRED',
        linkUrl: getHamsterQuestLinkUrl(`${FRONTEND_URL}/hamster-link`)
      });
    }

    const remoteInventory = await getHamsterQuestInventory(userId);
    const remoteItem = remoteInventory.find(item => item.itemId === shopItem.externalItemId && item.quantity > 0);
    if (!remoteItem) {
      await syncHamsterQuestInventory(userId, true);
      return res.status(409).json({ error: 'This item is no longer in your HamsterQuest inventory' });
    }

    let useResult: any;
    try {
      useResult = await useHamsterQuestItem(user.hamsterQuestAccessToken, remoteItem.inventoryItemId, 1);
    } catch (error) {
      if (isHamsterQuestUnauthorized(error)) {
        user.hamsterQuestAccessToken = undefined;
        user.hamsterQuestLinkedAt = undefined;
        await user.save();
        sessionUserCache.delete(userId);
        return res.status(428).json({
          error: 'HamsterQuest login expired. Link your account again.',
          code: 'HAMSTERQUEST_LINK_REQUIRED',
          linkUrl: getHamsterQuestLinkUrl(`${FRONTEND_URL}/hamster-link`)
        });
      }
      throw error;
    }

    purchase.lastUsedAt = new Date();
    await purchase.save();
    await syncHamsterQuestInventory(userId, true);

    res.json({
      success: true,
      message: useResult?.message || `${shopItem.title} used successfully`,
      itemType: externalItemType,
      result: useResult,
      items: await presentUserInventory(userId)
    });
  } catch (error) {
    console.error('Error using inventory item:', getHamsterQuestErrorMessage(error));
    res.status(502).json({ error: getHamsterQuestErrorMessage(error) });
  }
});

// Shop Item Management Endpoints (admin only)

// Get all shop items (public - active only)
app.get('/api/shop/items', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id; // Discord ID
    const visibilityFilter = req.user!.guildId
      ? { $or: [{ availableToAllGuilds: { $ne: false } }, { guildIds: req.user!.guildId }] }
      : { availableToAllGuilds: { $ne: false } };
    const items = await ShopItem.find({ isActive: true, ...visibilityFilter }).sort({ createdAt: -1 });
    
    // Get user's purchases to check which items are already purchased
    // For fiction items, we need to track both:
    // - hasEverPurchased: if they've bought it at least once (for reading access)
    // - isPurchased: if they have contribution credits available (for writing access)
    const purchases = await Purchase.find({ userId });
    const purchasedItemIds = new Set(); // Items with credits (for writing)
    const everPurchasedItemIds = new Set(); // Any purchase (for reading)
    
    purchases.forEach(purchase => {
      const shopItem = items.find(item => item._id.toString() === purchase.shopItemId.toString());
      
      if (shopItem && shopItem.itemType === 'fiction') {
        // For fiction items, always mark as "ever purchased" for reading access
        everPurchasedItemIds.add(purchase.shopItemId.toString());
        // Mark as "purchased" (can contribute) if they have contribution credits
        if (purchase.contributionCredits && purchase.contributionCredits > 0) {
          purchasedItemIds.add(purchase.shopItemId.toString());
        }
      } else if (purchase.quantity > 0) {
        // Consumable external items remain purchasable but show as owned while quantity is available.
        purchasedItemIds.add(purchase.shopItemId.toString());
        everPurchasedItemIds.add(purchase.shopItemId.toString());
      }
    });
    
    // Add purchased status to each item
    // Check actual purchase status for all users (including admins)
    const itemsWithPurchaseStatus = items.map(item => ({
      ...item.toObject(),
      isPurchased: purchasedItemIds.has(item._id.toString()),
      hasEverPurchased: everPurchasedItemIds.has(item._id.toString())
    }));
    
    res.json({ success: true, items: await presentShopItems(itemsWithPurchaseStatus) });
  } catch (error: any) {
    console.error('Error fetching shop items:', error);
    res.status(500).json({ error: 'Failed to fetch shop items' });
  }
});

// Get all shop items (admin only - includes inactive)
app.get('/api/admin/shop/items', requireAdmin, async (req: Request, res: Response) => {
  try {
    const items = await ShopItem.find({ isInventoryOnly: { $ne: true } }).sort({ createdAt: -1 });
    res.json({ success: true, items: await presentShopItems(items) });
  } catch (error: any) {
    console.error('Error fetching shop items:', error);
    res.status(500).json({ error: 'Failed to fetch shop items' });
  }
});

// Office catalog selection (admin only). Catalog details stay in Office; GuGame stores only the selected ID.
app.get('/api/admin/office-catalog/items', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [items, imports] = await Promise.all([
      getOfficeCatalogItems(),
      ShopItem.find({ externalSource: 'office-catalog', isInventoryOnly: { $ne: true } }).select('externalItemId price isActive').lean()
    ]);
    const importedByExternalId = new Map(imports.map(item => [item.externalItemId, item]));

    res.json({
      success: true,
      items: items.map(item => ({
        ...item,
        imported: importedByExternalId.has(item._id),
        importSettings: importedByExternalId.get(item._id) || null
      }))
    });
  } catch (error: any) {
    console.error('Error loading Office catalog:', error);
    res.status(502).json({ error: 'Unable to load the Office item catalog' });
  }
});

app.post('/api/admin/office-catalog/items/import', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { externalItemId, price, isActive } = req.body;
    if (typeof externalItemId !== 'string' || !externalItemId.trim()) {
      return res.status(400).json({ error: 'externalItemId is required' });
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Price must be a non-negative number' });
    }

    const catalogItem = await getOfficeCatalogItem(externalItemId);
    if (!catalogItem) {
      return res.status(404).json({ error: 'Office catalog item not found' });
    }

    const existingItem = await ShopItem.findOne({
      externalSource: 'office-catalog',
      externalItemId: catalogItem._id
    });
    if (existingItem) {
      if (!existingItem.isInventoryOnly) {
        return res.status(409).json({ error: 'This Office item has already been imported' });
      }
      existingItem.title = catalogItem.name;
      existingItem.description = catalogItem.description || '';
      existingItem.imageUrl = catalogItem.icon || '';
      existingItem.price = price;
      existingItem.isActive = isActive !== false;
      existingItem.isInventoryOnly = false;
      existingItem.externalItemType = catalogItem.type;
      existingItem.externalRarity = catalogItem.rarity;
      await existingItem.save();
      invalidateInventoryItemCache();
      return res.json({ success: true, item: (await presentShopItems([existingItem]))[0] });
    }

    const shopItem = await ShopItem.create({
      title: catalogItem.name,
      description: catalogItem.description || '',
      imageUrl: catalogItem.icon || '',
      price,
      isActive: isActive !== false,
      itemType: 'normal',
      isInventoryOnly: false,
      externalSource: 'office-catalog',
      externalItemId: catalogItem._id,
      externalItemType: catalogItem.type,
      externalRarity: catalogItem.rarity
    });

    invalidateInventoryItemCache();
    res.status(201).json({ success: true, item: (await presentShopItems([shopItem]))[0] });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'This Office item has already been imported' });
    }
    console.error('Error importing Office catalog item:', error);
    res.status(500).json({ error: error.message || 'Failed to import Office catalog item' });
  }
});

// Create shop item (admin only)
app.post('/api/admin/shop/items', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, price, imageUrl, isActive, itemType, productData, availableToAllGuilds, guildIds } = req.body;

    if (!title || price === undefined || !imageUrl) {
      return res.status(400).json({ error: 'Missing required fields: title, price, imageUrl' });
    }

    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Price must be a non-negative number' });
    }

    const guildScope = await getShopGuildScope(availableToAllGuilds, guildIds);
    const shopItem = new ShopItem({
      title,
      description: description || '',
      price,
      imageUrl,
      isActive: isActive !== undefined ? isActive : true,
      itemType: itemType || 'normal',
      productData: productData || '',
      ...guildScope
    });

    await shopItem.save();
    invalidateInventoryItemCache();
    res.json({ success: true, item: shopItem });
  } catch (error: any) {
    console.error('Error creating shop item:', error);
    res.status(500).json({ error: error.message || 'Failed to create shop item' });
  }
});

// Update shop item (admin only)
app.put('/api/admin/shop/items/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, price, imageUrl, isActive, itemType, productData, availableToAllGuilds, guildIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }
    const shopItem = await ShopItem.findById(req.params.id);
    if (!shopItem) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    if (!shopItem.externalItemId) {
      if (title !== undefined) shopItem.title = title;
      if (description !== undefined) shopItem.description = description;
      if (imageUrl !== undefined) shopItem.imageUrl = imageUrl;
      if (itemType !== undefined) shopItem.itemType = itemType;
      if (productData !== undefined) shopItem.productData = productData;
    }
    if (price !== undefined) {
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: 'Price must be a non-negative number' });
      }
      shopItem.price = price;
    }
    if (isActive !== undefined) shopItem.isActive = isActive;
    if (availableToAllGuilds !== undefined || guildIds !== undefined) {
      const guildScope = await getShopGuildScope(availableToAllGuilds, guildIds);
      shopItem.availableToAllGuilds = guildScope.availableToAllGuilds;
      shopItem.guildIds = guildScope.guildIds;
    }

    await shopItem.save();
    invalidateInventoryItemCache();
    res.json({ success: true, item: shopItem });
  } catch (error: any) {
    console.error('Error updating shop item:', error);
    res.status(500).json({ error: error.message || 'Failed to update shop item' });
  }
});

// Retire shop item while preserving purchase and fiction history (admin only)
app.delete('/api/admin/shop/items/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }
    const shopItem = await retireShopItem(req.params.id);
    invalidateInventoryItemCache();
    res.json({ success: true, item: shopItem, message: 'Shop item retired successfully' });
  } catch (error: any) {
    if (error instanceof ShopItemOperationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error deleting shop item:', error);
    res.status(500).json({ error: error.message || 'Failed to delete shop item' });
  }
});

// Get fiction contributions for a shop item
app.get('/api/shop/items/:id/fiction', requireAuth, async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const userId = req.user!.id; // Discord ID

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    // Check if item exists and is a fiction item
    const shopItem = await ShopItem.findById(itemId);
    if (!shopItem) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    // Check if user is admin
    const currentUser = await User.findOne({ discordId: userId });
    if (!currentUser || !isShopItemAvailableToUser(shopItem, currentUser)) {
      return res.status(404).json({ error: 'Shop item not found' });
    }
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'super-admin');
    
    // Check if user has purchased this item
    const purchase = await Purchase.findOne({ userId, shopItemId: itemId });
    
    // Calculate purchase status
    let hasEverPurchased = false;
    let isPurchased = false;
    
    // Admins have full access - skip purchase checks
    if (isAdmin) {
      hasEverPurchased = true;
      isPurchased = true;
    } else if (purchase) {
      hasEverPurchased = true;
      // For fiction items, isPurchased means they have contribution credits available
      if (shopItem.itemType === 'fiction') {
        isPurchased = (purchase.contributionCredits && purchase.contributionCredits > 0) || false;
      } else {
        // For non-fiction items, if purchase exists, they've purchased
        isPurchased = true;
      }
    }
    
    if (!isAdmin && !purchase && shopItem.itemType === 'fiction') {
      return res.status(403).json({ error: 'You must purchase this item before viewing contributions' });
    }

    // Get all contributions for this fiction item, ordered by creation time
    const contributions = await FictionContribution.find({ shopItemId: itemId })
      .sort({ createdAt: 1 })
      .lean();

    const usersById = await getUserSummariesByDiscordId(
      contributions.map(contribution => contribution.userId)
    );
    const contributionsWithUserInfo = contributions.map((contribution: any) => {
      const user = usersById.get(contribution.userId);
      return {
        _id: contribution._id,
        shopItemId: contribution.shopItemId,
        userId: contribution.userId,
        user: presentUserSummary(user),
        content: contribution.content,
        order: contribution.order,
        createdAt: contribution.createdAt,
        updatedAt: contribution.updatedAt
      };
    });

    res.json({ 
      success: true, 
      contributions: contributionsWithUserInfo,
      isPurchased,
      hasEverPurchased
    });
  } catch (error: any) {
    console.error('Error fetching fiction contributions:', error);
    res.status(500).json({ error: 'Failed to fetch fiction contributions' });
  }
});

// Get or acquire writing lock for a fiction item
app.get('/api/shop/items/:id/fiction/writing-lock', requireAuth, async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const userId = req.user!.id; // Discord ID

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    // Check if item exists and is a fiction item
    const shopItem = await ShopItem.findById(itemId);
    if (!shopItem) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    if (shopItem.itemType !== 'fiction') {
      return res.status(400).json({ error: 'This item is not a fiction item' });
    }

    const currentUser = await User.findOne({ discordId: userId });
    if (!currentUser || !isShopItemAvailableToUser(shopItem, currentUser)) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    const now = new Date();
    const lockResult = await acquireFictionWritingLock(itemId, userId);
    const lockOwner = lockResult.acquired
      ? currentUser
      : await User.findOne({ discordId: lockResult.lock.userId });
    return res.json({
      success: true,
      hasLock: lockResult.acquired,
      isLocked: !lockResult.acquired,
      ...(!lockResult.acquired
        ? { lockedBy: lockOwner ? (lockOwner.nickname || lockOwner.username) : 'Another user' }
        : {}),
      expiresAt: lockResult.lock.expiresAt,
      timeRemaining: Math.max(0, lockResult.lock.expiresAt.getTime() - now.getTime())
    });
  } catch (error: any) {
    console.error('Error getting writing lock:', error);
    res.status(500).json({ error: 'Failed to get writing lock' });
  }
});

// Release writing lock (when user finishes writing or closes modal)
app.post('/api/shop/items/:id/fiction/release-lock', requireAuth, async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const userId = req.user!.id; // Discord ID

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    const lock = await FictionWritingLock.findOne({ shopItemId: itemId, userId });
    if (lock) {
      await FictionWritingLock.deleteOne({ _id: lock._id });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error releasing writing lock:', error);
    res.status(500).json({ error: 'Failed to release writing lock' });
  }
});

// Add a contribution to a fiction item
app.post('/api/shop/items/:id/fiction/contribute', requireAuth, async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const userId = req.user!.id; // Discord ID
    const { content } = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check content length (100 character limit)
    const trimmedContent = content.trim();
    if (trimmedContent.length > 100) {
      return res.status(400).json({ error: 'Contribution must be 100 characters or less' });
    }

    // Check if item exists and is a fiction item
    const shopItem = await ShopItem.findById(itemId);
    if (!shopItem) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    if (shopItem.itemType !== 'fiction') {
      return res.status(400).json({ error: 'This item is not a fiction item' });
    }

    // Check if user is admin
    const currentUser = await User.findOne({ discordId: userId });
    if (!currentUser || !isShopItemAvailableToUser(shopItem, currentUser)) {
      return res.status(404).json({ error: 'Shop item not found' });
    }
    const isAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'super-admin');
    
    let contribution;
    try {
      contribution = await contributeToFiction({
        shopItemId: itemId,
        userId,
        content: trimmedContent,
        isAdmin
      });
    } catch (error) {
      if (error instanceof FictionOperationError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      throw error;
    }

    const contributionWithUser = {
      _id: contribution._id,
      shopItemId: contribution.shopItemId,
      userId: contribution.userId,
      user: presentUserSummary(currentUser),
      content: contribution.content,
      order: contribution.order,
      createdAt: contribution.createdAt,
      updatedAt: contribution.updatedAt
    };

    res.json({ success: true, contribution: contributionWithUser });
  } catch (error: any) {
    console.error('Error adding fiction contribution:', error);
    res.status(500).json({ error: 'Failed to add contribution' });
  }
});

// Get all purchases/preorders (admin only)
app.get('/api/admin/shop/purchases', requireAdmin, async (req: Request, res: Response) => {
  try {
    const purchases = await Purchase.find({})
      .populate('shopItemId', 'title price imageUrl')
      .sort({ createdAt: -1 })
      .lean();

    const usersById = await getUserSummariesByDiscordId(purchases.map(purchase => purchase.userId));
    const purchasesWithUserInfo = purchases.map((purchase: any) => {
      const user = usersById.get(purchase.userId);
      return {
        _id: purchase._id,
        userId: purchase.userId,
        user: presentUserSummary(user),
        shopItem: purchase.shopItemId || {
          _id: purchase.shopItemId,
          title: 'Deleted item',
          price: 0,
          imageUrl: ''
        },
        status: purchase.status,
        purchasedAt: purchase.purchasedAt,
        createdAt: purchase.createdAt,
        updatedAt: purchase.updatedAt
      };
    });

    res.json({ success: true, purchases: purchasesWithUserInfo });
  } catch (error: any) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch purchases' });
  }
});

app.get('/api/admin/shop/purchase-operations/pending', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const operations = await ExternalPurchaseOperation.find({ status: 'reserved' })
      .sort({ updatedAt: 1 })
      .limit(200)
      .lean();
    res.json({ success: true, operations });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load pending purchase operations' });
  }
});

app.post('/api/admin/shop/purchase-operations/:operationId/resolve', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const operationId = req.params.operationId.trim();
    const action = req.body?.action;
    if (!operationId || !['complete', 'refund'].includes(action)) {
      return res.status(400).json({ error: 'Provide an operation ID and action complete or refund' });
    }

    if (action === 'complete') {
      const operation = await completeExternalPurchase(operationId);
      if (!operation) return res.status(404).json({ error: 'Purchase operation not found' });
      return res.json({ success: true, operation });
    }

    const operation = await ExternalPurchaseOperation.findOne({ operationId }).lean();
    if (!operation) return res.status(404).json({ error: 'Purchase operation not found' });
    if (operation.status === 'completed') {
      return res.status(409).json({ error: 'A completed purchase cannot be refunded through reconciliation' });
    }
    const refunded = await rollbackExternalPurchase(operationId);
    return res.json({ success: true, refunded });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to resolve purchase operation' });
  }
});

// Get purchases for a specific shop item (admin only)
app.get('/api/admin/shop/items/:id/purchases', requireAdmin, async (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }

    const purchases = await Purchase.find({ shopItemId: itemId })
      .sort({ createdAt: -1 })
      .lean();

    const usersById = await getUserSummariesByDiscordId(purchases.map(purchase => purchase.userId));
    const purchasesWithUserInfo = purchases.map((purchase: any) => {
      const user = usersById.get(purchase.userId);
      return {
        userId: purchase.userId,
        user: presentUserSummary(user),
        purchasedAt: purchase.purchasedAt,
        status: purchase.status
      };
    });

    res.json({ success: true, purchases: purchasesWithUserInfo });
  } catch (error: any) {
    console.error('Error fetching item purchases:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch item purchases' });
  }
});

// Purchase shop item (authenticated users)
app.post('/api/shop/items/:id/purchase', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id; // Discord ID
    const itemId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid item ID' });
    }
    // Find the shop item
    const shopItem = await ShopItem.findById(itemId);
    if (!shopItem) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    if (!shopItem.isActive) {
      return res.status(400).json({ error: 'This item is not available for purchase' });
    }

    let externalItem: OfficeCatalogItem | null = null;
    if (shopItem.externalSource === 'office-catalog' && shopItem.externalItemId) {
      externalItem = await getOfficeCatalogItem(shopItem.externalItemId);
      if (!externalItem) {
        return res.status(409).json({ error: 'This Office catalog item is no longer available' });
      }
    }
    const displayTitle = externalItem?.name || shopItem.title;
    const isExternalInventoryItem = shopItem.externalSource === 'office-catalog' && Boolean(shopItem.externalItemId);

    // Get user with current asset points (find by discordId)
    const user = await User.findOne({ discordId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!isShopItemAvailableToUser(shopItem, user)) {
      return res.status(403).json({ error: 'This item is only available to a different guild', code: 'GUILD_ITEM_UNAVAILABLE' });
    }

    const purchaseInput = {
      userId,
      itemId,
      price: shopItem.price,
      itemType: shopItem.itemType,
      isExternalInventoryItem
    };
    let purchaseResult;
    let externalOperationId: string | null = null;
    try {
      if (isExternalInventoryItem && shopItem.externalItemId) {
        const suppliedOperationId = req.get('idempotency-key')?.trim();
        if (!suppliedOperationId || suppliedOperationId.length > 128) {
          return res.status(400).json({
            error: 'External inventory purchases require a valid Idempotency-Key header',
            code: 'IDEMPOTENCY_KEY_REQUIRED'
          });
        }
        externalOperationId = suppliedOperationId;
        purchaseResult = await reserveExternalPurchase({
          operationId: suppliedOperationId,
          userId,
          itemId,
          externalItemId: shopItem.externalItemId,
          price: shopItem.price
        });
        if (purchaseResult.replayed) {
          if (purchaseResult.status === 'completed') {
            return res.json({
              success: true,
              replayed: true,
              message: `Successfully purchased "${displayTitle}"!`,
              remainingAP: purchaseResult.remainingAP,
              itemType: shopItem.itemType,
              productData: shopItem.itemType === 'normal' ? shopItem.productData || null : null,
              externalItem,
              inventoryQuantity: purchaseResult.quantity
            });
          }
          return res.status(202).json({
            success: false,
            pending: true,
            code: 'PURCHASE_RECONCILIATION_PENDING',
            message: 'This purchase is being reconciled. You have not been charged again.'
          });
        }
      } else {
        purchaseResult = await reserveLocalPurchase(purchaseInput);
      }
    } catch (error) {
      if (error instanceof PurchaseOperationError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      throw error;
    }

    if (isExternalInventoryItem && shopItem.externalItemId) {
      try {
        await grantHamsterQuestItem(userId, shopItem.externalItemId, 1, externalOperationId || undefined);
        await completeExternalPurchase(externalOperationId!);
      } catch (error) {
        const definiteRejection = axios.isAxiosError(error) && Boolean(error.response) &&
          error.response!.status >= 400 && error.response!.status < 500;
        if (definiteRejection) {
          await rollbackExternalPurchase(externalOperationId!);
          return res.status(502).json({
            error: `HamsterQuest rejected this item: ${getHamsterQuestErrorMessage(error)}`,
            code: 'EXTERNAL_GRANT_REJECTED'
          });
        }
        return res.status(202).json({
          success: false,
          pending: true,
          code: 'PURCHASE_RECONCILIATION_PENDING',
          message: 'HamsterQuest did not confirm the grant. The purchase is pending reconciliation and will not be retried automatically.'
        });
      }
      try {
        await syncHamsterQuestInventory(userId, true);
      } catch (error) {
        console.error(`Purchased item was granted but inventory sync failed for ${userId}:`, getHamsterQuestErrorMessage(error));
      }
    }

    // For normal items, return product data if available
    let productData = null;
    if (shopItem.itemType === 'normal' && shopItem.productData) {
      productData = shopItem.productData;
    }

    const responseData = { 
      success: true, 
      message: `Successfully purchased "${displayTitle}"!`,
      remainingAP: purchaseResult.remainingAP,
      itemType: shopItem.itemType,
      productData: productData,
      externalItem,
      inventoryQuantity: purchaseResult.quantity
    };
    
    sessionUserCache.delete(userId);
    userInventoryCache.delete(userId);
    res.json(responseData);
  } catch (error: any) {
    console.error('Error purchasing shop item:', error);
    const isTransientTransactionError = error?.hasErrorLabel?.('TransientTransactionError') ||
      error?.hasErrorLabel?.('UnknownTransactionCommitResult');
    res.status(isTransientTransactionError ? 503 : 500).json({
      error: isTransientTransactionError
        ? 'Purchase is busy. Please try again.'
        : error.message || 'Failed to purchase item'
    });
  }
});

// Reset skill tree progress for users with nickname starting with prefix (super-admin only)
app.post('/api/admin/reset-skills-by-nickname', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { nicknamePrefix } = req.body;
    
    if (!nicknamePrefix) {
      return res.status(400).json({ error: 'nicknamePrefix is required' });
    }

    // Find all users with nickname starting with the prefix
    const users = await User.find({
      nickname: { $regex: `^${nicknamePrefix}`, $options: 'i' }
    });

    if (users.length === 0) {
      return res.json({ 
        success: true, 
        message: `No users found with nickname starting with "${nicknamePrefix}"`,
        resetCount: 0
      });
    }

    // Reset unlockedSkills for all matching users
    const result = await User.updateMany(
      { nickname: { $regex: `^${nicknamePrefix}`, $options: 'i' } },
      { $set: { unlockedSkills: [] } }
    );

    invalidateProgressionCache();
    res.json({ 
      success: true, 
      message: `Reset skill tree progress for ${result.modifiedCount} user(s) with nickname starting with "${nicknamePrefix}"`,
      resetCount: result.modifiedCount,
      affectedUsers: users.map(u => ({
        discordId: u.discordId,
        username: u.username,
        nickname: u.nickname
      }))
    });
  } catch (error: any) {
    console.error('Error resetting skills by nickname:', error);
    res.status(500).json({ error: error.message || 'Failed to reset skills' });
  }
});

// ==================== PROGRESSION LEADERBOARD API ====================

app.get('/api/leaderboard/progression', requireAuth, async (req: Request, res: Response) => {
  try {
    const [currentUser, snapshot] = await Promise.all([
      User.findOne({ discordId: req.user!.id }).select('guildId').lean(),
      getProgressionSnapshot()
    ]);

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    const currentGuildId = currentUser.guildId?.toString();
    res.json({
      success: true,
      ...presentProgressionLeaderboard(snapshot, req.user!.id, currentGuildId)
    });
  } catch (error) {
    console.error('Error fetching progression leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch progression leaderboard' });
  }
});

// Start server
const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Backend URL: http://localhost:${PORT}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 66_000;
