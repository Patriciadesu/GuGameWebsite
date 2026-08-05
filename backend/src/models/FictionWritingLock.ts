import mongoose, { Document, Schema } from 'mongoose';

export interface IFictionWritingLock extends Document {
  shopItemId: mongoose.Types.ObjectId; // Reference to Fiction ShopItem
  userId: string; // Discord ID of the user currently writing
  expiresAt: Date; // When the lock expires (5 minutes from acquisition)
  createdAt: Date;
}

const FictionWritingLockSchema = new Schema<IFictionWritingLock>(
  {
    shopItemId: { type: Schema.Types.ObjectId, required: true, ref: 'ShopItem', index: true, unique: true },
    userId: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } } // Auto-delete expired locks
  },
  { timestamps: true }
);

// Index for efficient queries and auto-cleanup
export default mongoose.model<IFictionWritingLock>('FictionWritingLock', FictionWritingLockSchema);
