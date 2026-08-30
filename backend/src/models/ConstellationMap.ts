import mongoose, { Document, Schema, Types } from 'mongoose';

export type ConstellationScope = 'discipline' | 'topic';
export type ConstellationType = 'main' | 'skill';

export interface IConstellationVisualTheme {
  key: string;
  backgroundAssetUrl?: string;
  bakedBoundary?: {
    path: string;
    assetUrl: string;
    bounds: { x: number; y: number; width: number; height: number };
    generatedAt?: Date;
  };
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
  constellationType: ConstellationType;
  scope: ConstellationScope;
  parentMapId?: Types.ObjectId;
  gatewaySkillId?: Types.ObjectId;
  externalHouseId?: string;
  externalTagId?: string;
  displayOrder: number;
  isActive: boolean;
  level: number;
  visualTheme: IConstellationVisualTheme;
  viewport: IConstellationViewport;
  schemaVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const ConstellationVisualThemeSchema = new Schema<IConstellationVisualTheme>({
  key: { type: String, required: true, trim: true, default: 'default' },
  backgroundAssetUrl: { type: String, trim: true },
  bakedBoundary: {
    path: { type: String, trim: true },
    assetUrl: { type: String, trim: true },
    bounds: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number, min: 1 },
      height: { type: Number, min: 1 }
    },
    generatedAt: { type: Date }
  },
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
  width: { type: Number, required: true, default: 2400, min: 320, max: 10000 },
  height: { type: Number, required: true, default: 1400, min: 320, max: 10000 },
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
  constellationType: { type: String, enum: ['main', 'skill'], required: true, default: 'skill' },
  scope: { type: String, enum: ['discipline', 'topic'], required: true },
  parentMapId: { type: Schema.Types.ObjectId, ref: 'ConstellationMap' },
  gatewaySkillId: { type: Schema.Types.ObjectId, ref: 'Skill' },
  externalHouseId: { type: String, trim: true, match: /^[a-f0-9]{24}$/i },
  externalTagId: { type: String, trim: true, match: /^[a-f0-9]{24}$/i },
  displayOrder: { type: Number, default: 0, min: 0 },
  isActive: { type: Boolean, default: false },
  level: { type: Number, default: 1, min: 1, validate: Number.isInteger },
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
ConstellationMapSchema.index({ constellationType: 1, scope: 1, isActive: 1, displayOrder: 1, _id: 1 });
ConstellationMapSchema.index({ scope: 1, isActive: 1, displayOrder: 1, _id: 1 });
ConstellationMapSchema.index({ parentMapId: 1, isActive: 1, displayOrder: 1, _id: 1 });
ConstellationMapSchema.index({ scope: 1, level: 1, isActive: 1, displayOrder: 1, _id: 1 });
ConstellationMapSchema.index({ gatewaySkillId: 1 }, { unique: true, sparse: true });
ConstellationMapSchema.index({ externalHouseId: 1 }, { sparse: true });
ConstellationMapSchema.index({ externalTagId: 1 }, { sparse: true });

export default mongoose.model<IConstellationMap>('ConstellationMap', ConstellationMapSchema);
