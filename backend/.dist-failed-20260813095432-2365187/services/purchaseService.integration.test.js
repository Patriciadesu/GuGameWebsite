"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const ApprovalRequest_1 = __importDefault(require("../models/ApprovalRequest"));
const FictionContribution_1 = __importDefault(require("../models/FictionContribution"));
const FictionWritingLock_1 = __importDefault(require("../models/FictionWritingLock"));
const ExternalPurchaseOperation_1 = __importDefault(require("../models/ExternalPurchaseOperation"));
const Purchase_1 = __importDefault(require("../models/Purchase"));
const ShopItem_1 = __importDefault(require("../models/ShopItem"));
const Skill_1 = __importDefault(require("../models/Skill"));
const User_1 = __importDefault(require("../models/User"));
const approvalService_1 = require("./approvalService");
const fictionService_1 = require("./fictionService");
const purchaseService_1 = require("./purchaseService");
const shopItemService_1 = require("./shopItemService");
const progressionService_1 = require("./progressionService");
dotenv_1.default.config();
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === '1';
const testDbName = process.env.INTEGRATION_DB_NAME || 'gugame_integration_test';
(0, node_test_1.describe)('purchaseService transactions', { skip: !runIntegrationTests }, () => {
    (0, node_test_1.before)(async () => {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri)
            throw new Error('MONGODB_URI is required for integration tests');
        await mongoose_1.default.connect(mongoUri, { dbName: testDbName });
        await Promise.all([
            User_1.default.syncIndexes(),
            Purchase_1.default.syncIndexes(),
            ExternalPurchaseOperation_1.default.syncIndexes(),
            ShopItem_1.default.syncIndexes(),
            Skill_1.default.syncIndexes(),
            ApprovalRequest_1.default.syncIndexes(),
            FictionContribution_1.default.syncIndexes(),
            FictionWritingLock_1.default.syncIndexes()
        ]);
    });
    (0, node_test_1.beforeEach)(async () => {
        await Promise.all([
            User_1.default.deleteMany({}),
            Purchase_1.default.deleteMany({}),
            ExternalPurchaseOperation_1.default.deleteMany({}),
            ShopItem_1.default.deleteMany({}),
            Skill_1.default.deleteMany({}),
            ApprovalRequest_1.default.deleteMany({}),
            FictionContribution_1.default.deleteMany({}),
            FictionWritingLock_1.default.deleteMany({})
        ]);
    });
    (0, node_test_1.after)(async () => {
        await mongoose_1.default.connection.dropDatabase();
        await mongoose_1.default.disconnect();
    });
    (0, node_test_1.test)('one-time items charge and grant only once under concurrent requests', async () => {
        await createUser('one-time-user', 100);
        const itemId = new mongoose_1.default.Types.ObjectId().toString();
        const results = await Promise.allSettled(Array.from({ length: 20 }, () => (0, purchaseService_1.reserveLocalPurchase)({
            userId: 'one-time-user',
            itemId,
            price: 10,
            itemType: 'normal',
            isExternalInventoryItem: false
        })));
        strict_1.default.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        strict_1.default.equal(results.filter(result => result.status === 'rejected' &&
            result.reason instanceof purchaseService_1.PurchaseOperationError &&
            result.reason.code === 'ALREADY_PURCHASED').length, 19);
        const [user, purchase] = await Promise.all([
            User_1.default.findOne({ discordId: 'one-time-user' }).lean(),
            Purchase_1.default.findOne({ userId: 'one-time-user', shopItemId: itemId }).lean()
        ]);
        strict_1.default.equal(user?.assetPoints, 90);
        strict_1.default.equal(purchase?.quantity, 1);
    });
    (0, node_test_1.test)('repeatable items never overspend AP under concurrent requests', async () => {
        await createUser('repeat-user', 100);
        const itemId = new mongoose_1.default.Types.ObjectId().toString();
        const results = await Promise.allSettled(Array.from({ length: 20 }, () => (0, purchaseService_1.reserveLocalPurchase)({
            userId: 'repeat-user',
            itemId,
            price: 10,
            itemType: 'normal',
            isExternalInventoryItem: true
        })));
        strict_1.default.equal(results.filter(result => result.status === 'fulfilled').length, 10);
        strict_1.default.equal(results.filter(result => result.status === 'rejected' &&
            result.reason instanceof purchaseService_1.PurchaseOperationError &&
            result.reason.code === 'INSUFFICIENT_AP').length, 10);
        const [user, purchase] = await Promise.all([
            User_1.default.findOne({ discordId: 'repeat-user' }).lean(),
            Purchase_1.default.findOne({ userId: 'repeat-user', shopItemId: itemId }).lean()
        ]);
        strict_1.default.equal(user?.assetPoints, 0);
        strict_1.default.equal(purchase?.quantity, 10);
    });
    (0, node_test_1.test)('external grant rollback restores both AP and quantity', async () => {
        await createUser('rollback-user', 100);
        const itemId = new mongoose_1.default.Types.ObjectId().toString();
        const input = {
            userId: 'rollback-user',
            itemId,
            price: 10,
            itemType: 'normal',
            isExternalInventoryItem: true
        };
        await (0, purchaseService_1.reserveLocalPurchase)(input);
        await (0, purchaseService_1.rollbackLocalPurchase)(input);
        const [user, purchase] = await Promise.all([
            User_1.default.findOne({ discordId: 'rollback-user' }).lean(),
            Purchase_1.default.findOne({ userId: 'rollback-user', shopItemId: itemId }).lean()
        ]);
        strict_1.default.equal(user?.assetPoints, 100);
        strict_1.default.equal(purchase?.quantity, 0);
    });
    (0, node_test_1.test)('an external purchase operation reserves and charges exactly once', async () => {
        await createUser('external-user', 100);
        const itemId = new mongoose_1.default.Types.ObjectId().toString();
        const input = {
            operationId: 'checkout-1',
            userId: 'external-user',
            itemId,
            externalItemId: 'office-item-1',
            price: 10
        };
        const first = await (0, purchaseService_1.reserveExternalPurchase)(input);
        const replay = await (0, purchaseService_1.reserveExternalPurchase)(input);
        const completed = await (0, purchaseService_1.completeExternalPurchase)(input.operationId);
        strict_1.default.equal(first.replayed, false);
        strict_1.default.equal(replay.replayed, true);
        strict_1.default.equal(completed?.status, 'completed');
        const [user, purchase, operations] = await Promise.all([
            User_1.default.findOne({ discordId: input.userId }).lean(),
            Purchase_1.default.findOne({ userId: input.userId, shopItemId: itemId }).lean(),
            ExternalPurchaseOperation_1.default.find({ operationId: input.operationId }).lean()
        ]);
        strict_1.default.equal(user?.assetPoints, 90);
        strict_1.default.equal(purchase?.quantity, 1);
        strict_1.default.equal(operations.length, 1);
    });
    (0, node_test_1.test)('external purchase rollback is durable and refunds only once', async () => {
        await createUser('external-rollback-user', 100);
        const itemId = new mongoose_1.default.Types.ObjectId().toString();
        await (0, purchaseService_1.reserveExternalPurchase)({
            operationId: 'checkout-rollback',
            userId: 'external-rollback-user',
            itemId,
            externalItemId: 'office-item-2',
            price: 10
        });
        strict_1.default.equal(await (0, purchaseService_1.rollbackExternalPurchase)('checkout-rollback'), true);
        strict_1.default.equal(await (0, purchaseService_1.rollbackExternalPurchase)('checkout-rollback'), false);
        const [user, purchase] = await Promise.all([
            User_1.default.findOne({ discordId: 'external-rollback-user' }).lean(),
            Purchase_1.default.findOne({ userId: 'external-rollback-user', shopItemId: itemId }).lean()
        ]);
        strict_1.default.equal(user?.assetPoints, 100);
        strict_1.default.equal(purchase?.quantity, 0);
    });
    (0, node_test_1.test)('retiring a shop item preserves purchase history', async () => {
        const item = await ShopItem_1.default.create({ title: 'Retired item', price: 10 });
        await Purchase_1.default.create({
            userId: 'history-user',
            shopItemId: item._id,
            status: 'completed',
            quantity: 1
        });
        const retired = await (0, shopItemService_1.retireShopItem)(item._id.toString());
        strict_1.default.equal(retired.isActive, false);
        strict_1.default.ok(await ShopItem_1.default.exists({ _id: item._id }));
        strict_1.default.ok(await Purchase_1.default.exists({ shopItemId: item._id }));
    });
    (0, node_test_1.test)('admin purchases deduct AP like every other user', async () => {
        await createUser('admin-user', 100, 'admin');
        const itemId = new mongoose_1.default.Types.ObjectId().toString();
        const result = await (0, purchaseService_1.reserveLocalPurchase)({
            userId: 'admin-user',
            itemId,
            price: 40,
            itemType: 'fiction',
            isExternalInventoryItem: false
        });
        const [user, purchase] = await Promise.all([
            User_1.default.findOne({ discordId: 'admin-user' }).lean(),
            Purchase_1.default.findOne({ userId: 'admin-user', shopItemId: itemId }).lean()
        ]);
        strict_1.default.equal(result.remainingAP, 60);
        strict_1.default.equal(user?.assetPoints, 60);
        strict_1.default.equal(purchase?.contributionCredits, 1);
    });
    (0, node_test_1.test)('a quest step awards AP exactly once under concurrent requests', async () => {
        await createUser('step-user', 0);
        const results = await Promise.all(Array.from({ length: 20 }, () => (0, progressionService_1.completeQuestStepOnce)('step-user', 'quest-1', 'step-1', 5)));
        strict_1.default.equal(results.filter(Boolean).length, 1);
        const user = await User_1.default.findOne({ discordId: 'step-user' }).lean();
        strict_1.default.equal(user?.assetPoints, 5);
        strict_1.default.equal(user?.completedQuestSteps?.length, 1);
    });
    (0, node_test_1.test)('skill unlock charges AP and unlocks exactly once', async () => {
        await createUser('unlock-user', 100);
        const results = await Promise.all(Array.from({ length: 20 }, () => (0, progressionService_1.unlockSkillOnce)('unlock-user', 'asset-1', 25)));
        strict_1.default.equal(results.filter(Boolean).length, 1);
        const user = await User_1.default.findOne({ discordId: 'unlock-user' }).lean();
        strict_1.default.equal(user?.assetPoints, 75);
        strict_1.default.deepEqual(user?.unlockedSkills, ['asset-1']);
    });
    (0, node_test_1.test)('free adventure reward is granted exactly once', async () => {
        await createUser('adventure-user', 0);
        const results = await Promise.all(Array.from({ length: 20 }, () => (0, progressionService_1.unlockSkillOnce)('adventure-user', 'adventure-1', 0, 25)));
        strict_1.default.equal(results.filter(Boolean).length, 1);
        const user = await User_1.default.findOne({ discordId: 'adventure-user' }).lean();
        strict_1.default.equal(user?.assetPoints, 25);
        strict_1.default.deepEqual(user?.unlockedSkills, ['adventure-1']);
    });
    (0, node_test_1.test)('insufficient AP never unlocks or creates negative balance', async () => {
        await createUser('poor-user', 24);
        const result = await (0, progressionService_1.unlockSkillOnce)('poor-user', 'asset-2', 25);
        strict_1.default.equal(result, null);
        const user = await User_1.default.findOne({ discordId: 'poor-user' }).lean();
        strict_1.default.equal(user?.assetPoints, 24);
        strict_1.default.deepEqual(user?.unlockedSkills, []);
    });
    (0, node_test_1.test)('concurrent approval clicks charge and reward exactly once', async () => {
        await createUser('approval-user', 100);
        const skill = await createQuest(25);
        const approval = await ApprovalRequest_1.default.create({
            userId: 'approval-user',
            skillId: skill.id,
            status: 'pending'
        });
        const results = await Promise.allSettled(Array.from({ length: 20 }, () => (0, approvalService_1.approveQuestRequest)(approval.id, 'admin-user', 35)));
        strict_1.default.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        strict_1.default.equal(results.filter(result => result.status === 'rejected' &&
            result.reason instanceof approvalService_1.ApprovalOperationError &&
            result.reason.code === 'ALREADY_PROCESSED').length, 19);
        const [user, storedApproval] = await Promise.all([
            User_1.default.findOne({ discordId: 'approval-user' }).lean(),
            ApprovalRequest_1.default.findById(approval.id).lean()
        ]);
        strict_1.default.equal(user?.assetPoints, 110);
        strict_1.default.deepEqual(user?.unlockedSkills, [skill.id]);
        strict_1.default.deepEqual(user?.completedQuestRewards, [skill.id]);
        strict_1.default.equal(storedApproval?.status, 'approved');
        strict_1.default.equal(storedApproval?.rewardAP, 35);
    });
    (0, node_test_1.test)('custom next quest cost is enforced without changing a pending request', async () => {
        await createUser('approval-poor-user', 39);
        const skill = await createQuest(40);
        const approval = await ApprovalRequest_1.default.create({
            userId: 'approval-poor-user',
            skillId: skill.id,
            status: 'pending'
        });
        await strict_1.default.rejects((0, approvalService_1.approveQuestRequest)(approval.id, 'admin-user', 35), (error) => error instanceof approvalService_1.ApprovalOperationError &&
            error.code === 'INSUFFICIENT_AP' &&
            error.details.required === 40 &&
            error.details.available === 39);
        const [user, storedApproval] = await Promise.all([
            User_1.default.findOne({ discordId: 'approval-poor-user' }).lean(),
            ApprovalRequest_1.default.findById(approval.id).lean()
        ]);
        strict_1.default.equal(user?.assetPoints, 39);
        strict_1.default.deepEqual(user?.unlockedSkills, []);
        strict_1.default.equal(storedApproval?.status, 'pending');
    });
    (0, node_test_1.test)('a writing lock and contribution credit can be consumed only once', async () => {
        await createUser('writer-user', 0);
        const itemId = new mongoose_1.default.Types.ObjectId();
        await Promise.all([
            Purchase_1.default.create({
                userId: 'writer-user',
                shopItemId: itemId,
                status: 'completed',
                quantity: 1,
                contributionCredits: 1
            }),
            FictionWritingLock_1.default.create({
                shopItemId: itemId,
                userId: 'writer-user',
                expiresAt: new Date(Date.now() + 60000)
            })
        ]);
        const results = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => (0, fictionService_1.contributeToFiction)({
            shopItemId: itemId.toString(),
            userId: 'writer-user',
            content: `Contribution ${index}`,
            isAdmin: false
        })));
        strict_1.default.equal(results.filter(result => result.status === 'fulfilled').length, 1);
        strict_1.default.equal(results.filter(result => result.status === 'rejected' &&
            result.reason instanceof fictionService_1.FictionOperationError &&
            result.reason.code === 'LOCK_REQUIRED').length, 19);
        const [purchase, contributions, lock] = await Promise.all([
            Purchase_1.default.findOne({ userId: 'writer-user', shopItemId: itemId }).lean(),
            FictionContribution_1.default.find({ shopItemId: itemId }).lean(),
            FictionWritingLock_1.default.findOne({ shopItemId: itemId }).lean()
        ]);
        strict_1.default.equal(purchase?.contributionCredits, 0);
        strict_1.default.equal(contributions.length, 1);
        strict_1.default.equal(contributions[0].order, 1);
        strict_1.default.equal(lock, null);
    });
});
const createUser = (discordId, assetPoints, role = 'user') => User_1.default.create({
    discordId,
    username: discordId,
    discriminator: '0',
    avatar: null,
    assetPoints,
    role,
    isAdmin: role !== 'user'
});
const createQuest = (nextQuestCost) => Skill_1.default.create({
    title: `Quest ${nextQuestCost}`,
    description: 'Integration test quest',
    cost: 0,
    nextQuestCost,
    nodeColor: 'green',
    nodeType: 'quest',
    isActive: true
});
