import mongoose, { Document, Schema } from 'mongoose';

export type ExternalPurchaseOperationStatus = 'reserved' | 'completed' | 'rolled-back';

export interface IExternalPurchaseOperation extends Document {
  operationId: string;
  userId: string;
  shopItemId: mongoose.Types.ObjectId;
  externalItemId: string;
  price: number;
  status: ExternalPurchaseOperationStatus;
  remainingAP: number;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

const ExternalPurchaseOperationSchema = new Schema<IExternalPurchaseOperation>({
  operationId: { type: String, required: true, immutable: true, trim: true },
  userId: { type: String, required: true, immutable: true },
  shopItemId: { type: Schema.Types.ObjectId, required: true, immutable: true, ref: 'ShopItem' },
  externalItemId: { type: String, required: true, immutable: true, trim: true },
  price: { type: Number, required: true, immutable: true, min: 0 },
  status: {
    type: String,
    enum: ['reserved', 'completed', 'rolled-back'],
    required: true,
    default: 'reserved'
  },
  remainingAP: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 0 }
}, { timestamps: true });

ExternalPurchaseOperationSchema.index({ operationId: 1 }, { unique: true });
ExternalPurchaseOperationSchema.index({ userId: 1, createdAt: -1 });
ExternalPurchaseOperationSchema.index({ shopItemId: 1, createdAt: -1 });
ExternalPurchaseOperationSchema.index({ status: 1, updatedAt: 1 });

export default mongoose.model<IExternalPurchaseOperation>(
  'ExternalPurchaseOperation',
  ExternalPurchaseOperationSchema
);
