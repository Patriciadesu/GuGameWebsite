import mongoose from 'mongoose';
import FictionContribution from '../models/FictionContribution';
import FictionWritingLock from '../models/FictionWritingLock';
import Purchase from '../models/Purchase';

type FictionErrorCode = 'LOCK_REQUIRED' | 'NO_CREDITS';

export class FictionOperationError extends Error {
  constructor(
    public readonly code: FictionErrorCode,
    message: string,
    public readonly status = 403
  ) {
    super(message);
    this.name = 'FictionOperationError';
  }
}

export const acquireFictionWritingLock = async (
  shopItemId: string,
  userId: string,
  ttlMs = 5 * 60 * 1_000
) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);
    try {
      const lock = await FictionWritingLock.findOneAndUpdate(
        {
          shopItemId,
          $or: [{ userId }, { expiresAt: { $lte: now } }]
        },
        { $set: { userId, expiresAt } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return { acquired: true, lock };
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const existingLock = await FictionWritingLock.findOne({ shopItemId });
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

export const contributeToFiction = async (input: {
  shopItemId: string;
  userId: string;
  content: string;
  isAdmin: boolean;
}) => {
  const session = await mongoose.startSession();
  let createdContribution: any = null;

  try {
    await session.withTransaction(async () => {
      const lock = await FictionWritingLock.findOneAndDelete({
        shopItemId: input.shopItemId,
        userId: input.userId,
        expiresAt: { $gt: new Date() }
      }, { session });
      if (!lock) {
        throw new FictionOperationError(
          'LOCK_REQUIRED',
          'Your writing lock is missing or expired. Please acquire it again.'
        );
      }

      if (!input.isAdmin) {
        const purchase = await Purchase.findOneAndUpdate(
          {
            userId: input.userId,
            shopItemId: input.shopItemId,
            contributionCredits: { $gt: 0 }
          },
          { $inc: { contributionCredits: -1 } },
          { new: true, session }
        );
        if (!purchase) {
          throw new FictionOperationError(
            'NO_CREDITS',
            'You have no contribution credits remaining. Please repurchase to get more credits.'
          );
        }
      }

      const lastContribution = await FictionContribution.findOne({
        shopItemId: input.shopItemId
      }).sort({ order: -1 }).session(session);
      const [contribution] = await FictionContribution.create([{
        shopItemId: input.shopItemId,
        userId: input.userId,
        content: input.content,
        order: lastContribution ? lastContribution.order + 1 : 1
      }], { session });
      createdContribution = contribution;
    });
  } finally {
    await session.endSession();
  }

  if (!createdContribution) {
    throw new Error('Fiction transaction completed without a contribution');
  }
  return createdContribution;
};
