"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contributeToFiction = exports.acquireFictionWritingLock = exports.FictionOperationError = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const FictionContribution_1 = __importDefault(require("../models/FictionContribution"));
const FictionWritingLock_1 = __importDefault(require("../models/FictionWritingLock"));
const Purchase_1 = __importDefault(require("../models/Purchase"));
class FictionOperationError extends Error {
    constructor(code, message, status = 403) {
        super(message);
        this.code = code;
        this.status = status;
        this.name = 'FictionOperationError';
    }
}
exports.FictionOperationError = FictionOperationError;
const acquireFictionWritingLock = async (shopItemId, userId, ttlMs = 5 * 60 * 1000) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ttlMs);
        try {
            const lock = await FictionWritingLock_1.default.findOneAndUpdate({
                shopItemId,
                $or: [{ userId }, { expiresAt: { $lte: now } }]
            }, { $set: { userId, expiresAt } }, { new: true, upsert: true, setDefaultsOnInsert: true });
            return { acquired: true, lock };
        }
        catch (error) {
            if (error?.code !== 11000)
                throw error;
            const existingLock = await FictionWritingLock_1.default.findOne({ shopItemId });
            if (existingLock) {
                return {
                    acquired: existingLock.userId === userId,
                    lock: existingLock
                };
            }
        }
    }
    throw new Error('Unable to acquire fiction writing lock');
};
exports.acquireFictionWritingLock = acquireFictionWritingLock;
const contributeToFiction = async (input) => {
    const session = await mongoose_1.default.startSession();
    let createdContribution = null;
    try {
        await session.withTransaction(async () => {
            const lock = await FictionWritingLock_1.default.findOneAndDelete({
                shopItemId: input.shopItemId,
                userId: input.userId,
                expiresAt: { $gt: new Date() }
            }, { session });
            if (!lock) {
                throw new FictionOperationError('LOCK_REQUIRED', 'Your writing lock is missing or expired. Please acquire it again.');
            }
            if (!input.isAdmin) {
                const purchase = await Purchase_1.default.findOneAndUpdate({
                    userId: input.userId,
                    shopItemId: input.shopItemId,
                    contributionCredits: { $gt: 0 }
                }, { $inc: { contributionCredits: -1 } }, { new: true, session });
                if (!purchase) {
                    throw new FictionOperationError('NO_CREDITS', 'You have no contribution credits remaining. Please repurchase to get more credits.');
                }
            }
            const lastContribution = await FictionContribution_1.default.findOne({
                shopItemId: input.shopItemId
            }).sort({ order: -1 }).session(session);
            const [contribution] = await FictionContribution_1.default.create([{
                    shopItemId: input.shopItemId,
                    userId: input.userId,
                    content: input.content,
                    order: lastContribution ? lastContribution.order + 1 : 1
                }], { session });
            createdContribution = contribution;
        });
    }
    finally {
        await session.endSession();
    }
    if (!createdContribution) {
        throw new Error('Fiction transaction completed without a contribution');
    }
    return createdContribution;
};
exports.contributeToFiction = contributeToFiction;
