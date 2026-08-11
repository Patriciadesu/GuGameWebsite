import mongoose, { Document, Schema, Types } from 'mongoose';

export type ConstellationScope = 'discipline' | 'topic';

export interface IConstellationVisualTheme {
  key: string;
  backgroundAssetUrl?: string;
  frameStyle: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  lineColor: string;
  unlockedColor: string;
  availableColor: string;
  lockedColor: string;
  bossColor: string;
  capstoneColor: string;
}

export interface IConstellationViewport {
  width: number;
  height: number;
  minZoom: number;
  maxZoom: number;
}

export interface IConstellationMap extends Document {
  name: string;
  slug: string;
  description: string;
  scope: ConstellationScope;
  parentMapId?: Types.ObjectId;
  gatewaySkillId?: Types.ObjectId;
  displayOrder: number;
  isActive: boolean;
  visualTheme: IConstellationVisualTheme;
  viewport: IConstellationViewport;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const ConstellationVisualThemeSchema = new Schema<IConstellationVisualTheme>({
  key: { type: String, required: true, trim: true, default: 'default' },
  backgroundAssetUrl: { type: String, trim: true },
  frameStyle: { type: String, required: true, trim: true, default: 'luminous-minimal' },
  backgroundColor: { type: String, required: true, default: '#f7f9fc' },
  surfaceColor: { type: String, required: true, default: '#ffffff' },
  textColor: { type: String, required: true, default: '#182033' },
  mutedTextColor: { type: String, required: true, default: '#667085' },
  borderColor: { type: String, required: true, default: '#d9e0ea' },
  lineColor: { type: String, required: true, default: '#8b97aa' },
  unlockedColor: { type: String, required: true, default: '#1677ff' },
  availableColor: { type: String, required: true, default: '#b77900' },
  lockedColor: { type: String, required: true, default: '#a4adbb' },
  bossColor: { type: String, required: true, default: '#d63c45' },
  capstoneColor: { type: String, required: true, default: '#6d4aff' }
}, { _id: false });

const ConstellationViewportSchema = new Schema<IConstellationViewport>({
  width: { type: Number, required: true, default: 1600, min: 320, max: 10000 },
  height: { type: Number, required: true, default: 900, min: 320, max: 10000 },
  minZoom: { type: Number, required: true, default: 0.3, min: 0.1, max: 1 },
  maxZoom: { type: Number, required: true, default: 3, min: 1, max: 10 }
}, { _id: false });

const ConstellationMapSchema = new Schema<IConstellationMap>({
  name: { type: String, required: true, trim: true },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  },
  description: { type: String, default: '' },
  scope: { type: String, enum: ['discipline', 'topic'], required: true },
  parentMapId: { type: Schema.Types.ObjectId, ref: 'ConstellationMap' },
  gatewaySkillId: { type: Schema.Types.ObjectId, ref: 'Skill' },
  displayOrder: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: false },
  visualTheme: { type: ConstellationVisualThemeSchema, default: () => ({}) },
  viewport: { type: ConstellationViewportSchema, default: () => ({}) },
  schemaVersion: { type: Number, default: 1, min: 1 }
}, { timestamps: true });

ConstellationMapSchema.pre('validate', function(next) {
  if (this.scope === 'discipline' && (this.parentMapId || this.gatewaySkillId)) {
    this.invalidate('scope', 'Discipline maps cannot have a parent map or gateway skill');
  }
  if (this.scope === 'topic' && (!this.parentMapId || !this.gatewaySkillId)) {
    this.invalidate('scope', 'Topic maps require both a parent map and gateway skill');
  }
  if (this.parentMapId && this.parentMapId.equals(this._id)) {
    this.invalidate('parentMapId', 'A constellation map cannot be its own parent');
  }
  if (this.viewport && this.viewport.minZoom > this.viewport.maxZoom) {
    this.invalidate('viewport.minZoom', 'Minimum zoom cannot exceed maximum zoom');
  }
  next();
});

ConstellationMapSchema.index({ isActive: 1, displayOrder: 1, _id: 1 });
ConstellationMapSchema.index({ scope: 1, isActive: 1, displayOrder: 1, _id: 1 });
ConstellationMapSchema.index({ parentMapId: 1, isActive: 1, displayOrder: 1, _id: 1 });
ConstellationMapSchema.index({ gatewaySkillId: 1 }, { unique: true, sparse: true });

export default mongoose.model<IConstellationMap>('ConstellationMap', ConstellationMapSchema);
