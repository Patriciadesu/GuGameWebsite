import mongoose from 'mongoose';
import Purchase from '../models/Purchase';
import User from '../models/User';

export class PurchaseOperationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: 'USER_NOT_FOUND' | 'INSUFFICIENT_AP' | 'ALREADY_PURCHASED'
  ) {
    super(message);
  }
}

interface LocalPurchaseInput {
  userId: string;
  itemId: string;
  price: number;
  itemType: 'normal' | 'fiction';
  isExternalInventoryItem: boolean;
}

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
