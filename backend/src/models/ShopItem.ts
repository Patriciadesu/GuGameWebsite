import mongoose, { Document, Schema } from 'mongoose';

export interface IShopItem extends Document {
  title: string;
  description?: string;
  price: number; // Asset points required to purchase
  imageUrl: string; // URL to the item image
  isActive: boolean; // Whether the item is currently available
  createdAt: Date;
  updatedAt: Date;
}

const ShopItemSchema = new Schema<IShopItem>(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Index for efficient queries
ShopItemSchema.index({ isActive: 1 });
ShopItemSchema.index({ createdAt: -1 });

export default mongoose.model<IShopItem>('ShopItem', ShopItemSchema);
