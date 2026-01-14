import mongoose, { Document, Schema } from 'mongoose';

export interface ISkillTreeSettings extends Document {
  layerGap: number; // Legacy: kept for backward compatibility, will use layerGaps if available
  layerGaps: { [key: number]: number }; // Gap for each layer (1-6)
  arrowheadGapFromNode: number; // Gap from target node edge
  arrowheadStartPoint: number; // Distance from path end where arrowhead starts
  arrowheadSize: number; // Size of the arrowhead
  createdAt: Date;
  updatedAt: Date;
}

const SkillTreeSettingsSchema = new Schema<ISkillTreeSettings>(
  {
    layerGap: { type: Number, required: false, default: 120, min: 80, max: 300 },
    layerGaps: { 
      type: Map, 
      of: Number,
      default: () => {
        const map = new Map();
        for (let i = 1; i <= 6; i++) {
          map.set(String(i), 120); // Mongoose Maps require string keys
        }
        return map;
      }
    },
    arrowheadGapFromNode: { type: Number, required: true, default: 0, min: 0, max: 100 },
    arrowheadStartPoint: { type: Number, required: true, default: 0, min: -50, max: 50 },
    arrowheadSize: { type: Number, required: true, default: 20, min: 10, max: 50 },
  },
  { timestamps: true }
);

export default mongoose.model<ISkillTreeSettings>('SkillTreeSettings', SkillTreeSettingsSchema);
