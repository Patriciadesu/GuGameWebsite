import mongoose, { Document, Schema } from 'mongoose';

export interface IShopItem extends Document {
  title: string;
  description?: string;
  price: number; // Asset points required to purchase
  imageUrl: string; // URL to the item image
  isActive: boolean; // Whether the item is currently available
  availableToAllGuilds: boolean;
  guildIds: string[];
  itemType: 'normal' | 'fiction'; // Type of item: normal (returns product) or fiction (multi-writer)
  productData?: string; // For normal items: product link/file/text
  externalSource?: 'office-catalog';
  externalItemId?: string;
  externalItemType?: string;
  externalRarity?: string;
  isInventoryOnly?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ShopItemSchema = new Schema<IShopItem>(
  {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    availableToAllGuilds: { type: Boolean, default: true },
    guildIds: { type: [String], default: [] },
    itemType: { type: String, enum: ['normal', 'fiction'], default: 'normal' },
    productData: { type: String, default: '' }, // For normal items: product link/file/text
    externalSource: { type: String, enum: ['office-catalog'] },
    externalItemId: { type: String, trim: true },
    externalItemType: { type: String, trim: true },
    externalRarity: { type: String, trim: true },
    isInventoryOnly: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Index for efficient queries
ShopItemSchema.index({ isActive: 1 });
ShopItemSchema.index({ isActive: 1, availableToAllGuilds: 1, guildIds: 1 });
ShopItemSchema.index({ createdAt: -1 });
ShopItemSchema.index({ externalSource: 1, externalItemId: 1 }, { unique: true, sparse: true });

export default mongoose.model<IShopItem>('ShopItem', ShopItemSchema);
