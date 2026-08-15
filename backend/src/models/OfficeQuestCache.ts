import mongoose, { Document, Schema } from 'mongoose';

export interface IOfficeQuestTag {
  externalId: string;
  name: string;
  color?: string;
}

export interface IOfficeQuestCache extends Document {
  externalId: string;
  title: string;
  type?: string;
  description: string;
  imageUrl?: string;
  tags: IOfficeQuestTag[];
  subQuestCount: number;
  subQuests: Array<{ externalId?: string; title: string; description: string; descriptionParts?: Array<{ type: string; content: string }>; type?: string }>;
  sourceCreatedAt?: Date;
  sourceUpdatedAt?: Date;
  detailHash: string;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OfficeQuestTagSchema = new Schema<IOfficeQuestTag>({
  externalId: { type: String, required: true },
  name: { type: String, required: true },
  color: { type: String }
}, { _id: false });

const OfficeSubQuestSchema = new Schema({
  externalId: { type: String },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, trim: true },
  descriptionParts: [{ type: { type: String, required: true }, content: { type: String, required: true } }],
  type: { type: String }
}, { _id: false });

const OfficeQuestCacheSchema = new Schema<IOfficeQuestCache>({
  externalId: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, trim: true },
  type: { type: String, trim: true },
  description: { type: String, default: '' },
  tags: { type: [OfficeQuestTagSchema], default: [] },
  subQuestCount: { type: Number, default: 0 },
  subQuests: { type: [OfficeSubQuestSchema], default: [] },
  sourceCreatedAt: { type: Date },
  sourceUpdatedAt: { type: Date },
  detailHash: { type: String, required: true, index: true },
  syncedAt: { type: Date, required: true }
}, { timestamps: true, collection: 'office_quest_catalog' });

OfficeQuestCacheSchema.index({ 'tags.name': 1, title: 1 });

export default mongoose.model<IOfficeQuestCache>('OfficeQuestCache', OfficeQuestCacheSchema);
