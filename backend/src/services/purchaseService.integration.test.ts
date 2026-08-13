import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ApprovalRequest from '../models/ApprovalRequest';
import FictionContribution from '../models/FictionContribution';
import FictionWritingLock from '../models/FictionWritingLock';
import ExternalPurchaseOperation from '../models/ExternalPurchaseOperation';
import Purchase from '../models/Purchase';
import ShopItem from '../models/ShopItem';
import Skill from '../models/Skill';
import User from '../models/User';
import {
  ApprovalOperationError,
  approveQuestRequest
} from './approvalService';
import {
  contributeToFiction,
  FictionOperationError
} from './fictionService';
import {
  PurchaseOperationError,
  completeExternalPurchase,
  reserveExternalPurchase,
  rollbackExternalPurchase,
  reserveLocalPurchase,
  rollbackLocalPurchase
} from './purchaseService';
import { retireShopItem } from './shopItemService';
import { completeQuestStepOnce, unlockSkillOnce } from './progressionService';

dotenv.config();

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
const testDbName = process.env.INTEGRATION_DB_NAME || 'gugame_integration_test';

describe('purchaseService transactions', { skip: !runIntegrationTests }, () => {
  before(async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI is required for integration tests');
    await mongoose.connect(mongoUri, { dbName: testDbName });
    await Promise.all([
      User.syncIndexes(),
      Purchase.syncIndexes(),
      ExternalPurchaseOperation.syncIndexes(),
      ShopItem.syncIndexes(),
      Skill.syncIndexes(),
      ApprovalRequest.syncIndexes(),
      FictionContribution.syncIndexes(),
      FictionWritingLock.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Purchase.deleteMany({}),
      ExternalPurchaseOperation.deleteMany({}),
      ShopItem.deleteMany({}),
      Skill.deleteMany({}),
      ApprovalRequest.deleteMany({}),
      FictionContribution.deleteMany({}),
      FictionWritingLock.deleteMany({})
    ]);
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test('one-time items charge and grant only once under concurrent requests', async () => {
    await createUser('one-time-user', 100);
    const itemId = new mongoose.Types.ObjectId().toString();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () =>
      reserveLocalPurchase({
        userId: 'one-time-user',
        itemId,
        price: 10,
        itemType: 'normal',
        isExternalInventoryItem: false
      })
    ));

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result =>
      result.status === 'rejected' &&
      result.reason instanceof PurchaseOperationError &&
      result.reason.code === 'ALREADY_PURCHASED'
    ).length, 19);
    const [user, purchase] = await Promise.all([
      User.findOne({ discordId: 'one-time-user' }).lean(),
      Purchase.findOne({ userId: 'one-time-user', shopItemId: itemId }).lean()
    ]);
    assert.equal(user?.assetPoints, 90);
    assert.equal(purchase?.quantity, 1);
  });

  test('repeatable items never overspend AP under concurrent requests', async () => {
    await createUser('repeat-user', 100);
    const itemId = new mongoose.Types.ObjectId().toString();
    const results = await Promise.allSettled(Array.from({ length: 20 }, () =>
      reserveLocalPurchase({
        userId: 'repeat-user',
        itemId,
        price: 10,
        itemType: 'normal',
        isExternalInventoryItem: true
      })
    ));

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 10);
    assert.equal(results.filter(result =>
      result.status === 'rejected' &&
      result.reason instanceof PurchaseOperationError &&
      result.reason.code === 'INSUFFICIENT_AP'
    ).length, 10);
    const [user, purchase] = await Promise.all([
      User.findOne({ discordId: 'repeat-user' }).lean(),
      Purchase.findOne({ userId: 'repeat-user', shopItemId: itemId }).lean()
    ]);
    assert.equal(user?.assetPoints, 0);
    assert.equal(purchase?.quantity, 10);
  });

  test('external grant rollback restores both AP and quantity', async () => {
    await createUser('rollback-user', 100);
    const itemId = new mongoose.Types.ObjectId().toString();
    const input = {
      userId: 'rollback-user',
      itemId,
      price: 10,
      itemType: 'normal' as const,
      isExternalInventoryItem: true
    };
    await reserveLocalPurchase(input);
    await rollbackLocalPurchase(input);

    const [user, purchase] = await Promise.all([
      User.findOne({ discordId: 'rollback-user' }).lean(),
      Purchase.findOne({ userId: 'rollback-user', shopItemId: itemId }).lean()
    ]);
    assert.equal(user?.assetPoints, 100);
    assert.equal(purchase?.quantity, 0);
  });

  test('an external purchase operation reserves and charges exactly once', async () => {
    await createUser('external-user', 100);
    const itemId = new mongoose.Types.ObjectId().toString();
    const input = {
      operationId: 'checkout-1',
      userId: 'external-user',
      itemId,
      externalItemId: 'office-item-1',
      price: 10
    };

    const first = await reserveExternalPurchase(input);
    const replay = await reserveExternalPurchase(input);
    const completed = await completeExternalPurchase(input.operationId);

    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(completed?.status, 'completed');
    const [user, purchase, operations] = await Promise.all([
      User.findOne({ discordId: input.userId }).lean(),
      Purchase.findOne({ userId: input.userId, shopItemId: itemId }).lean(),
      ExternalPurchaseOperation.find({ operationId: input.operationId }).lean()
    ]);
    assert.equal(user?.assetPoints, 90);
    assert.equal(purchase?.quantity, 1);
    assert.equal(operations.length, 1);
  });

  test('external purchase rollback is durable and refunds only once', async () => {
    await createUser('external-rollback-user', 100);
    const itemId = new mongoose.Types.ObjectId().toString();
    await reserveExternalPurchase({
      operationId: 'checkout-rollback',
      userId: 'external-rollback-user',
      itemId,
      externalItemId: 'office-item-2',
      price: 10
    });

    assert.equal(await rollbackExternalPurchase('checkout-rollback'), true);
    assert.equal(await rollbackExternalPurchase('checkout-rollback'), false);

    const [user, purchase] = await Promise.all([
      User.findOne({ discordId: 'external-rollback-user' }).lean(),
      Purchase.findOne({ userId: 'external-rollback-user', shopItemId: itemId }).lean()
    ]);
    assert.equal(user?.assetPoints, 100);
    assert.equal(purchase?.quantity, 0);
  });

  test('retiring a shop item preserves purchase history', async () => {
    const item = await ShopItem.create({ title: 'Retired item', price: 10 });
    await Purchase.create({
      userId: 'history-user',
      shopItemId: item._id,
      status: 'completed',
      quantity: 1
    });

    const retired = await retireShopItem(item._id.toString());

    assert.equal(retired.isActive, false);
    assert.ok(await ShopItem.exists({ _id: item._id }));
    assert.ok(await Purchase.exists({ shopItemId: item._id }));
  });

  test('admin purchases deduct AP like every other user', async () => {
    await createUser('admin-user', 100, 'admin');
    const itemId = new mongoose.Types.ObjectId().toString();
    const result = await reserveLocalPurchase({
      userId: 'admin-user',
      itemId,
      price: 40,
      itemType: 'fiction',
      isExternalInventoryItem: false
    });

    const [user, purchase] = await Promise.all([
      User.findOne({ discordId: 'admin-user' }).lean(),
      Purchase.findOne({ userId: 'admin-user', shopItemId: itemId }).lean()
    ]);
    assert.equal(result.remainingAP, 60);
    assert.equal(user?.assetPoints, 60);
    assert.equal(purchase?.contributionCredits, 1);
  });

  test('a quest step awards AP exactly once under concurrent requests', async () => {
    await createUser('step-user', 0);
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      completeQuestStepOnce('step-user', 'quest-1', 'step-1', 5)
    ));
    assert.equal(results.filter(Boolean).length, 1);

    const user = await User.findOne({ discordId: 'step-user' }).lean();
    assert.equal(user?.assetPoints, 5);
    assert.equal(user?.completedQuestSteps?.length, 1);
  });

  test('skill unlock charges AP and unlocks exactly once', async () => {
    await createUser('unlock-user', 100);
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      unlockSkillOnce('unlock-user', 'asset-1', 25)
    ));
    assert.equal(results.filter(Boolean).length, 1);

    const user = await User.findOne({ discordId: 'unlock-user' }).lean();
    assert.equal(user?.assetPoints, 75);
    assert.deepEqual(user?.unlockedSkills, ['asset-1']);
  });

  test('free adventure reward is granted exactly once', async () => {
    await createUser('adventure-user', 0);
    const results = await Promise.all(Array.from({ length: 20 }, () =>
      unlockSkillOnce('adventure-user', 'adventure-1', 0, 25)
    ));
    assert.equal(results.filter(Boolean).length, 1);

    const user = await User.findOne({ discordId: 'adventure-user' }).lean();
    assert.equal(user?.assetPoints, 25);
    assert.deepEqual(user?.unlockedSkills, ['adventure-1']);
  });

  test('insufficient AP never unlocks or creates negative balance', async () => {
    await createUser('poor-user', 24);
    const result = await unlockSkillOnce('poor-user', 'asset-2', 25);
    assert.equal(result, null);

    const user = await User.findOne({ discordId: 'poor-user' }).lean();
    assert.equal(user?.assetPoints, 24);
    assert.deepEqual(user?.unlockedSkills, []);
  });

  test('concurrent approval clicks charge and reward exactly once', async () => {
    await createUser('approval-user', 100);
    const skill = await createQuest(25);
    const approval = await ApprovalRequest.create({
      userId: 'approval-user',
      skillId: skill.id,
      status: 'pending'
    });

    const results = await Promise.allSettled(Array.from({ length: 20 }, () =>
      approveQuestRequest(approval.id, 'admin-user', 35)
    ));

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result =>
      result.status === 'rejected' &&
      result.reason instanceof ApprovalOperationError &&
      result.reason.code === 'ALREADY_PROCESSED'
    ).length, 19);

    const [user, storedApproval] = await Promise.all([
      User.findOne({ discordId: 'approval-user' }).lean(),
      ApprovalRequest.findById(approval.id).lean()
    ]);
    assert.equal(user?.assetPoints, 110);
    assert.deepEqual(user?.unlockedSkills, [skill.id]);
    assert.deepEqual(user?.completedQuestRewards, [skill.id]);
    assert.equal(storedApproval?.status, 'approved');
    assert.equal(storedApproval?.rewardAP, 35);
  });

  test('custom next quest cost is enforced without changing a pending request', async () => {
    await createUser('approval-poor-user', 39);
    const skill = await createQuest(40);
    const approval = await ApprovalRequest.create({
      userId: 'approval-poor-user',
      skillId: skill.id,
      status: 'pending'
    });

    await assert.rejects(
      approveQuestRequest(approval.id, 'admin-user', 35),
      (error: unknown) =>
        error instanceof ApprovalOperationError &&
        error.code === 'INSUFFICIENT_AP' &&
        error.details.required === 40 &&
        error.details.available === 39
    );

    const [user, storedApproval] = await Promise.all([
      User.findOne({ discordId: 'approval-poor-user' }).lean(),
      ApprovalRequest.findById(approval.id).lean()
    ]);
    assert.equal(user?.assetPoints, 39);
    assert.deepEqual(user?.unlockedSkills, []);
    assert.equal(storedApproval?.status, 'pending');
  });

  test('a writing lock and contribution credit can be consumed only once', async () => {
    await createUser('writer-user', 0);
    const itemId = new mongoose.Types.ObjectId();
    await Promise.all([
      Purchase.create({
        userId: 'writer-user',
        shopItemId: itemId,
        status: 'completed',
        quantity: 1,
        contributionCredits: 1
      }),
      FictionWritingLock.create({
        shopItemId: itemId,
        userId: 'writer-user',
        expiresAt: new Date(Date.now() + 60_000)
      })
    ]);

    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) =>
      contributeToFiction({
        shopItemId: itemId.toString(),
        userId: 'writer-user',
        content: `Contribution ${index}`,
        isAdmin: false
      })
    ));

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result =>
      result.status === 'rejected' &&
      result.reason instanceof FictionOperationError &&
      result.reason.code === 'LOCK_REQUIRED'
    ).length, 19);

    const [purchase, contributions, lock] = await Promise.all([
      Purchase.findOne({ userId: 'writer-user', shopItemId: itemId }).lean(),
      FictionContribution.find({ shopItemId: itemId }).lean(),
      FictionWritingLock.findOne({ shopItemId: itemId }).lean()
    ]);
    assert.equal(purchase?.contributionCredits, 0);
    assert.equal(contributions.length, 1);
    assert.equal(contributions[0].order, 1);
    assert.equal(lock, null);
  });
});

const createUser = (
  discordId: string,
  assetPoints: number,
  role: 'user' | 'admin' | 'super-admin' = 'user'
) => User.create({
  discordId,
  username: discordId,
  discriminator: '0',
  avatar: null,
  assetPoints,
  role,
  isAdmin: role !== 'user'
});

const createQuest = (nextQuestCost: number) => Skill.create({
  title: `Quest ${nextQuestCost}`,
  description: 'Integration test quest',
  cost: 0,
  nextQuestCost,
  nodeColor: 'green',
  nodeType: 'quest',
  isActive: true
});
