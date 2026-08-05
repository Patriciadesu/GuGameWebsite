import mongoose, { Document, Schema } from 'mongoose';

export interface IPurchase extends Document {
  userId: string; // Discord ID
  shopItemId: mongoose.Types.ObjectId; // ShopItem MongoDB _id
  purchasedAt: Date;
  status: 'preorder' | 'completed';
  contributionCredits?: number; // For fiction items: number of contribution credits remaining
  quantity: number; // Current inventory quantity for non-fiction items
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseSchema = new Schema<IPurchase>(
  {
    userId: { type: String, required: true },
    shopItemId: { type: Schema.Types.ObjectId, required: true, ref: 'ShopItem' },
    status: { type: String, enum: ['preorder', 'completed'], default: 'preorder' },
    purchasedAt: { type: Date, default: Date.now },
    contributionCredits: { type: Number, default: 0, min: 0 }, // Credits for fiction contributions
    quantity: { type: Number, default: 1, min: 0 },
    lastUsedAt: { type: Date, default: undefined }
  },
  { timestamps: true }
);

PurchaseSchema.index({ userId: 1, shopItemId: 1 }, { unique: true });
PurchaseSchema.index({ shopItemId: 1, createdAt: -1 });
PurchaseSchema.index({ createdAt: -1 });

export default mongoose.model<IPurchase>('Purchase', PurchaseSchema);
