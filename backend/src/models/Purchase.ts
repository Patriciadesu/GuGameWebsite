import mongoose, { Document, Schema } from 'mongoose';

export interface IPurchase extends Document {
  userId: string; // Discord ID
  shopItemId: mongoose.Types.ObjectId; // ShopItem MongoDB _id
  purchasedAt: Date;
  status: 'preorder' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseSchema = new Schema<IPurchase>(
  {
    userId: { type: String, required: true, index: true },
    shopItemId: { type: Schema.Types.ObjectId, required: true, ref: 'ShopItem', index: true },
    status: { type: String, enum: ['preorder', 'completed'], default: 'preorder' },
    purchasedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Compound index to prevent duplicate purchases
PurchaseSchema.index({ userId: 1, shopItemId: 1 }, { unique: true });

export default mongoose.model<IPurchase>('Purchase', PurchaseSchema);
