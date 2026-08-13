import mongoose from 'mongoose';
import ExternalPurchaseOperation, {
  ExternalPurchaseOperationStatus,
  IExternalPurchaseOperation
} from '../models/ExternalPurchaseOperation';
import Purchase from '../models/Purchase';
import User from '../models/User';

export class PurchaseOperationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'USER_NOT_FOUND' | 'INSUFFICIENT_AP' | 'ALREADY_PURCHASED' |
      'IDEMPOTENCY_CONFLICT' | 'PURCHASE_ROLLED_BACK'
  ) {
    super(message);
  }
}

export interface LocalPurchaseInput {
  userId: string;
  itemId: string;
  price: number;
  itemType: 'normal' | 'fiction';
  isExternalInventoryItem: boolean;
}

export interface ExternalPurchaseInput {
  operationId: string;
  userId: string;
  itemId: string;
  externalItemId: string;
  price: number;
}

export interface ExternalPurchaseResult extends LocalPurchaseResult {
  operationId: string;
  status: ExternalPurchaseOperationStatus;
  replayed: boolean;
}

const assertOperationMatches = (
  operation: IExternalPurchaseOperation,
  input: ExternalPurchaseInput
): void => {
  if (
    operation.userId !== input.userId ||
    operation.shopItemId.toString() !== input.itemId ||
    operation.externalItemId !== input.externalItemId ||
    operation.price !== input.price
  ) {
    throw new PurchaseOperationError(
      'This purchase operation ID was already used for different purchase details',
      409,
      'IDEMPOTENCY_CONFLICT'
    );
  }
  if (operation.status === 'rolled-back') {
    throw new PurchaseOperationError(
      'This purchase operation was rolled back and cannot be reused',
      409,
      'PURCHASE_ROLLED_BACK'
    );
  }
};

const presentExternalOperation = (
  operation: IExternalPurchaseOperation,
  replayed: boolean
): ExternalPurchaseResult => ({
  operationId: operation.operationId,
  remainingAP: operation.remainingAP,
  quantity: operation.quantity,
  status: operation.status,
  replayed
});

export const reserveExternalPurchase = async (
  input: ExternalPurchaseInput
): Promise<ExternalPurchaseResult> => {
  const operationId = input.operationId.trim();
  const externalItemId = input.externalItemId.trim();
  if (!operationId || !externalItemId) {
    throw new PurchaseOperationError(
      'External purchases require an operation ID and external item ID',
      400,
      'IDEMPOTENCY_CONFLICT'
    );
  }
  const normalizedInput = { ...input, operationId, externalItemId };
  const session = await mongoose.startSession();
  let result: ExternalPurchaseResult | null = null;

  try {
    await session.withTransaction(async () => {
      const existing = await ExternalPurchaseOperation.findOne({ operationId }).session(session);
      if (existing) {
        assertOperationMatches(existing, normalizedInput);
        result = presentExternalOperation(existing, true);
        return;
      }

      const user = await User.findOne({ discordId: input.userId }).session(session);
      if (!user) {
        throw new PurchaseOperationError('User not found', 404, 'USER_NOT_FOUND');
      }
      const updatedUser = await User.findOneAndUpdate(
        { discordId: input.userId, assetPoints: { $gte: input.price } },
        { $inc: { assetPoints: -input.price } },
        { new: true, session }
      );
      if (!updatedUser) {
        throw new PurchaseOperationError(
          `Insufficient Asset Points. You need ${input.price} AP but only have ${user.assetPoints || 0} AP.`,
          400,
          'INSUFFICIENT_AP'
        );
      }

      const purchase = await Purchase.findOneAndUpdate(
        { userId: input.userId, shopItemId: input.itemId },
        {
          $inc: { quantity: 1 },
          $set: { purchasedAt: new Date(), status: 'completed' },
          $setOnInsert: { contributionCredits: 0 }
        },
        { upsert: true, new: true, session, setDefaultsOnInsert: true }
      );
      const [operation] = await ExternalPurchaseOperation.create([{
        ...normalizedInput,
        shopItemId: input.itemId,
        status: 'reserved',
        remainingAP: updatedUser.assetPoints,
        quantity: purchase.quantity || 0
      }], { session });
      result = presentExternalOperation(operation, false);
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const existing = await ExternalPurchaseOperation.findOne({ operationId });
      if (existing) {
        assertOperationMatches(existing, normalizedInput);
        return presentExternalOperation(existing, true);
      }
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (!result) throw new Error('External purchase transaction did not complete');
  return result;
};

export const completeExternalPurchase = async (
  operationId: string
): Promise<ExternalPurchaseResult | null> => {
  const operation = await ExternalPurchaseOperation.findOneAndUpdate(
    { operationId: operationId.trim(), status: 'reserved' },
    { $set: { status: 'completed' } },
    { new: true }
  ) || await ExternalPurchaseOperation.findOne({ operationId: operationId.trim() });
  return operation ? presentExternalOperation(operation, true) : null;
};

export const rollbackExternalPurchase = async (operationId: string): Promise<boolean> => {
  const session = await mongoose.startSession();
  let rolledBack = false;
  try {
    await session.withTransaction(async () => {
      const operation = await ExternalPurchaseOperation.findOneAndUpdate(
        { operationId: operationId.trim(), status: 'reserved' },
        { $set: { status: 'rolled-back' } },
        { new: true, session }
      );
      if (!operation) return;

      await User.updateOne(
        { discordId: operation.userId },
        { $inc: { assetPoints: operation.price } },
        { session }
      );
      await Purchase.updateOne(
        { userId: operation.userId, shopItemId: operation.shopItemId, quantity: { $gt: 0 } },
        { $inc: { quantity: -1 } },
        { session }
      );
      rolledBack = true;
    });
  } finally {
    await session.endSession();
  }
  return rolledBack;
};

export interface LocalPurchaseResult {
  remainingAP: number;
  quantity: number;
}

export const reserveLocalPurchase = async ({
  userId,
  itemId,
  price,
  itemType,
  isExternalInventoryItem
}: LocalPurchaseInput): Promise<LocalPurchaseResult> => {
  const session = await mongoose.startSession();
  let result: LocalPurchaseResult | null = null;

  try {
    await session.withTransaction(async () => {
      const user = await User.findOne({ discordId: userId }).session(session);
      if (!user) {
        throw new PurchaseOperationError('User not found', 404, 'USER_NOT_FOUND');
      }

      const existingPurchase = await Purchase.findOne({ userId, shopItemId: itemId }).session(session);
      if (itemType === 'normal' && !isExternalInventoryItem && (existingPurchase?.quantity || 0) > 0) {
        throw new PurchaseOperationError('You have already purchased this item!', 400, 'ALREADY_PURCHASED');
      }

      let remainingAP = user.assetPoints || 0;
      const updatedUser = await User.findOneAndUpdate(
        { discordId: userId, assetPoints: { $gte: price } },
        { $inc: { assetPoints: -price } },
        { new: true, session }
      );
      if (!updatedUser) {
        throw new PurchaseOperationError(
          `Insufficient Asset Points. You need ${price} AP but only have ${remainingAP} AP.`,
          400,
          'INSUFFICIENT_AP'
        );
      }
      remainingAP = updatedUser.assetPoints;

      const now = new Date();
      let purchase;
      if (itemType === 'fiction') {
        purchase = await Purchase.findOneAndUpdate(
          { userId, shopItemId: itemId },
          {
            $inc: { contributionCredits: 1 },
            $set: { purchasedAt: now, status: 'preorder' },
            $setOnInsert: { quantity: 0 }
          },
          { upsert: true, new: true, session, setDefaultsOnInsert: true }
        );
      } else if (isExternalInventoryItem) {
        purchase = await Purchase.findOneAndUpdate(
          { userId, shopItemId: itemId },
          {
            $inc: { quantity: 1 },
            $set: { purchasedAt: now, status: 'completed' },
            $setOnInsert: { contributionCredits: 0 }
          },
          { upsert: true, new: true, session, setDefaultsOnInsert: true }
        );
      } else {
        purchase = await Purchase.findOneAndUpdate(
          { userId, shopItemId: itemId },
          {
            $set: { quantity: 1, purchasedAt: now },
            $setOnInsert: { contributionCredits: 0, status: 'preorder' }
          },
          { upsert: true, new: true, session, setDefaultsOnInsert: true }
        );
      }

      result = {
        remainingAP,
        quantity: purchase.quantity || 0
      };
    });
  } finally {
    await session.endSession();
  }

  if (!result) {
    throw new Error('Purchase transaction did not complete');
  }
  return result;
};

export const rollbackLocalPurchase = async ({
  userId,
  itemId,
  price,
  itemType,
  isExternalInventoryItem
}: LocalPurchaseInput): Promise<void> => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findOne({ discordId: userId }).session(session);
      if (!user) return;
      await User.updateOne({ discordId: userId }, { $inc: { assetPoints: price } }, { session });

      const decrementField = itemType === 'fiction' ? 'contributionCredits' : 'quantity';
      await Purchase.updateOne(
        { userId, shopItemId: itemId, [decrementField]: { $gt: 0 } },
        { $inc: { [decrementField]: -1 } },
        { session }
      );
      if (!isExternalInventoryItem && itemType === 'normal') {
        await Purchase.updateOne(
          { userId, shopItemId: itemId },
          { $set: { quantity: 0 } },
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }
};
