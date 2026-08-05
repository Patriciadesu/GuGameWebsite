import mongoose, { Document, Schema } from 'mongoose';

export interface IFictionContribution extends Document {
  shopItemId: mongoose.Types.ObjectId; // Reference to Fiction ShopItem
  userId: string; // Discord ID of the contributor
  content: string; // The text contribution
  order: number; // Order of this contribution in the fiction
  createdAt: Date;
  updatedAt: Date;
}

const FictionContributionSchema = new Schema<IFictionContribution>(
  {
    shopItemId: { type: Schema.Types.ObjectId, required: true, ref: 'ShopItem', index: true },
    userId: { type: String, required: true, index: true },
    content: { type: String, required: true },
    order: { type: Number, required: true, default: 0 } // Order in the fiction sequence
  },
  { timestamps: true }
);

// Index for efficient queries
FictionContributionSchema.index(
  { shopItemId: 1, order: 1 },
  { unique: true, name: 'unique_fiction_order_per_item' }
);
FictionContributionSchema.index({ shopItemId: 1, userId: 1 });

export default mongoose.model<IFictionContribution>('FictionContribution', FictionContributionSchema);
