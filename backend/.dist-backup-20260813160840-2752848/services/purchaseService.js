"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollbackLocalPurchase = exports.reserveLocalPurchase = exports.rollbackExternalPurchase = exports.completeExternalPurchase = exports.reserveExternalPurchase = exports.PurchaseOperationError = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ExternalPurchaseOperation_1 = __importDefault(require("../models/ExternalPurchaseOperation"));
const Purchase_1 = __importDefault(require("../models/Purchase"));
const User_1 = __importDefault(require("../models/User"));
class PurchaseOperationError extends Error {
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
exports.PurchaseOperationError = PurchaseOperationError;
const assertOperationMatches = (operation, input) => {
    if (operation.userId !== input.userId ||
        operation.shopItemId.toString() !== input.itemId ||
        operation.externalItemId !== input.externalItemId ||
        operation.price !== input.price) {
        throw new PurchaseOperationError('This purchase operation ID was already used for different purchase details', 409, 'IDEMPOTENCY_CONFLICT');
    }
    if (operation.status === 'rolled-back') {
        throw new PurchaseOperationError('This purchase operation was rolled back and cannot be reused', 409, 'PURCHASE_ROLLED_BACK');
    }
};
const presentExternalOperation = (operation, replayed) => ({
    operationId: operation.operationId,
    remainingAP: operation.remainingAP,
    quantity: operation.quantity,
    status: operation.status,
    replayed
});
const reserveExternalPurchase = async (input) => {
    const operationId = input.operationId.trim();
    const externalItemId = input.externalItemId.trim();
    if (!operationId || !externalItemId) {
        throw new PurchaseOperationError('External purchases require an operation ID and external item ID', 400, 'IDEMPOTENCY_CONFLICT');
    }
    const normalizedInput = { ...input, operationId, externalItemId };
    const session = await mongoose_1.default.startSession();
    let result = null;
    try {
        await session.withTransaction(async () => {
            const existing = await ExternalPurchaseOperation_1.default.findOne({ operationId }).session(session);
            if (existing) {
                assertOperationMatches(existing, normalizedInput);
                result = presentExternalOperation(existing, true);
                return;
            }
            const user = await User_1.default.findOne({ discordId: input.userId }).session(session);
            if (!user) {
                throw new PurchaseOperationError('User not found', 404, 'USER_NOT_FOUND');
            }
            const updatedUser = await User_1.default.findOneAndUpdate({ discordId: input.userId, assetPoints: { $gte: input.price } }, { $inc: { assetPoints: -input.price } }, { new: true, session });
            if (!updatedUser) {
                throw new PurchaseOperationError(`Insufficient Asset Points. You need ${input.price} AP but only have ${user.assetPoints || 0} AP.`, 400, 'INSUFFICIENT_AP');
            }
            const purchase = await Purchase_1.default.findOneAndUpdate({ userId: input.userId, shopItemId: input.itemId }, {
                $inc: { quantity: 1 },
                $set: { purchasedAt: new Date(), status: 'completed' },
                $setOnInsert: { contributionCredits: 0 }
            }, { upsert: true, new: true, session, setDefaultsOnInsert: true });
            const [operation] = await ExternalPurchaseOperation_1.default.create([{
                    ...normalizedInput,
                    shopItemId: input.itemId,
                    status: 'reserved',
                    remainingAP: updatedUser.assetPoints,
                    quantity: purchase.quantity || 0
                }], { session });
            result = presentExternalOperation(operation, false);
        });
    }
    catch (error) {
        if (error?.code === 11000) {
            const existing = await ExternalPurchaseOperation_1.default.findOne({ operationId });
            if (existing) {
                assertOperationMatches(existing, normalizedInput);
                return presentExternalOperation(existing, true);
            }
        }
        throw error;
    }
    finally {
        await session.endSession();
    }
    if (!result)
        throw new Error('External purchase transaction did not complete');
    return result;
};
exports.reserveExternalPurchase = reserveExternalPurchase;
const completeExternalPurchase = async (operationId) => {
    const operation = await ExternalPurchaseOperation_1.default.findOneAndUpdate({ operationId: operationId.trim(), status: 'reserved' }, { $set: { status: 'completed' } }, { new: true }) || await ExternalPurchaseOperation_1.default.findOne({ operationId: operationId.trim() });
    return operation ? presentExternalOperation(operation, true) : null;
};
exports.completeExternalPurchase = completeExternalPurchase;
const rollbackExternalPurchase = async (operationId) => {
    const session = await mongoose_1.default.startSession();
    let rolledBack = false;
    try {
        await session.withTransaction(async () => {
            const operation = await ExternalPurchaseOperation_1.default.findOneAndUpdate({ operationId: operationId.trim(), status: 'reserved' }, { $set: { status: 'rolled-back' } }, { new: true, session });
            if (!operation)
                return;
            await User_1.default.updateOne({ discordId: operation.userId }, { $inc: { assetPoints: operation.price } }, { session });
            await Purchase_1.default.updateOne({ userId: operation.userId, shopItemId: operation.shopItemId, quantity: { $gt: 0 } }, { $inc: { quantity: -1 } }, { session });
            rolledBack = true;
        });
    }
    finally {
        await session.endSession();
    }
    return rolledBack;
};
exports.rollbackExternalPurchase = rollbackExternalPurchase;
const reserveLocalPurchase = async ({ userId, itemId, price, itemType, isExternalInventoryItem }) => {
    const session = await mongoose_1.default.startSession();
    let result = null;
    try {
        await session.withTransaction(async () => {
            const user = await User_1.default.findOne({ discordId: userId }).session(session);
            if (!user) {
                throw new PurchaseOperationError('User not found', 404, 'USER_NOT_FOUND');
            }
            const existingPurchase = await Purchase_1.default.findOne({ userId, shopItemId: itemId }).session(session);
            if (itemType === 'normal' && !isExternalInventoryItem && (existingPurchase?.quantity || 0) > 0) {
                throw new PurchaseOperationError('You have already purchased this item!', 400, 'ALREADY_PURCHASED');
            }
            let remainingAP = user.assetPoints || 0;
            const updatedUser = await User_1.default.findOneAndUpdate({ discordId: userId, assetPoints: { $gte: price } }, { $inc: { assetPoints: -price } }, { new: true, session });
            if (!updatedUser) {
                throw new PurchaseOperationError(`Insufficient Asset Points. You need ${price} AP but only have ${remainingAP} AP.`, 400, 'INSUFFICIENT_AP');
            }
            remainingAP = updatedUser.assetPoints;
            const now = new Date();
            let purchase;
            if (itemType === 'fiction') {
                purchase = await Purchase_1.default.findOneAndUpdate({ userId, shopItemId: itemId }, {
                    $inc: { contributionCredits: 1 },
                    $set: { purchasedAt: now, status: 'preorder' },
                    $setOnInsert: { quantity: 0 }
                }, { upsert: true, new: true, session, setDefaultsOnInsert: true });
            }
            else if (isExternalInventoryItem) {
                purchase = await Purchase_1.default.findOneAndUpdate({ userId, shopItemId: itemId }, {
                    $inc: { quantity: 1 },
                    $set: { purchasedAt: now, status: 'completed' },
                    $setOnInsert: { contributionCredits: 0 }
                }, { upsert: true, new: true, session, setDefaultsOnInsert: true });
            }
            else {
                purchase = await Purchase_1.default.findOneAndUpdate({ userId, shopItemId: itemId }, {
                    $set: { quantity: 1, purchasedAt: now },
                    $setOnInsert: { contributionCredits: 0, status: 'preorder' }
                }, { upsert: true, new: true, session, setDefaultsOnInsert: true });
            }
            result = {
                remainingAP,
                quantity: purchase.quantity || 0
            };
        });
    }
    finally {
        await session.endSession();
    }
    if (!result) {
        throw new Error('Purchase transaction did not complete');
    }
    return result;
};
exports.reserveLocalPurchase = reserveLocalPurchase;
const rollbackLocalPurchase = async ({ userId, itemId, price, itemType, isExternalInventoryItem }) => {
    const session = await mongoose_1.default.startSession();
    try {
        await session.withTransaction(async () => {
            const user = await User_1.default.findOne({ discordId: userId }).session(session);
            if (!user)
                return;
            await User_1.default.updateOne({ discordId: userId }, { $inc: { assetPoints: price } }, { session });
            const decrementField = itemType === 'fiction' ? 'contributionCredits' : 'quantity';
            await Purchase_1.default.updateOne({ userId, shopItemId: itemId, [decrementField]: { $gt: 0 } }, { $inc: { [decrementField]: -1 } }, { session });
            if (!isExternalInventoryItem && itemType === 'normal') {
                await Purchase_1.default.updateOne({ userId, shopItemId: itemId }, { $set: { quantity: 0 } }, { session });
            }
        });
    }
    finally {
        await session.endSession();
    }
};
exports.rollbackLocalPurchase = rollbackLocalPurchase;
