import mongoose, { Document, Schema } from 'mongoose';

export interface ISkill extends Document {
  title: string;
  description: string;
  cost: number; // Asset points required to unlock
  previewClip?: string[]; // YouTube embed links (array)
  contentYouTube?: string[]; // YouTube content links (array)
  contentGoogleDrive?: string[]; // Google Drive content links (array)
  layer: number; // Layer position (1-7)
  position: number; // Position within the layer (0-based)
  isActive: boolean; // Whether the skill is currently active/visible
  nodeColor: 'yellow' | 'blue' | 'green' | 'white' | 'purple'; // Node color type
  nodeType?: 'adventure' | 'asset' | 'quest' | 'marker' | 'EXTRA'; // Node type based on color
  connections?: Array<{
    targetSkillId: string;
    connectionType: 'normal' | 'special'; // normal = purple, special = red
    hasArrowhead: boolean; // Whether to show arrowhead
    breakPoints?: Array<{ layer: number; position: number }>; // Break points on circles (layer + angle)
  }>;
  prerequisites?: string[]; // Array of skill IDs that must be unlocked first
  createdAt: Date;
  updatedAt: Date;
}

const SkillSchema = new Schema<ISkill>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    cost: { type: Number, required: true, min: 0 },
    previewClip: [{ type: String }],
    contentYouTube: [{ type: String }],
    contentGoogleDrive: [{ type: String }],
    layer: { type: Number, required: true, min: 0, max: 7 },
    position: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    nodeColor: { type: String, enum: ['yellow', 'blue', 'green', 'white', 'purple'], default: 'blue' },
    nodeType: { type: String, enum: ['adventure', 'asset', 'quest', 'marker', 'EXTRA'] },
    connections: [{
      targetSkillId: { type: String, required: true },
      connectionType: { type: String, enum: ['normal', 'special'], default: 'normal' },
      hasArrowhead: { type: Boolean, default: true },
      breakPoints: [{ layer: Number, position: Number }]
    }],
    prerequisites: [{ type: String, default: [] }],
  },
  { timestamps: true }
);

// Auto-set nodeType based on nodeColor if not provided
SkillSchema.pre('save', function(next) {
  if (!this.nodeType && this.nodeColor) {
    const colorToTypeMap: { [key: string]: 'adventure' | 'asset' | 'quest' | 'marker' | 'EXTRA' } = {
      'white': 'adventure',
      'blue': 'asset',
      'green': 'quest',
      'yellow': 'marker',
      'purple': 'EXTRA'
    };
    this.nodeType = colorToTypeMap[this.nodeColor] || 'asset';
  }
  next();
});

// Index for efficient queries
SkillSchema.index({ layer: 1, position: 1 });
SkillSchema.index({ isActive: 1 });

export default mongoose.model<ISkill>('Skill', SkillSchema);
