import mongoose, { Document, Schema } from 'mongoose';

export interface ISkill extends Document {
  title: string;
  description: string;
  cost: number; // Asset points required to unlock
  nextQuestCost: number; // Asset points charged when an approved quest unlocks the next quest
  previewClip?: string[]; // YouTube embed links (array)
  contentYouTube?: string[]; // YouTube content links (array)
  contentGoogleDrive?: string[]; // Google Drive content links (array)
  layer: number; // Layer position (1-7)
  position: number; // Position within the layer (0-based)
  treePosition?: {
    x: number;
    y: number;
  }; // Freeform editor coordinates
  externalSource?: 'office-quest';
  externalQuestId?: string;
  subQuests?: Array<{
    externalId?: string;
    title: string;
    description: string;
    descriptionParts?: Array<{ type: string; content: string }>;
    type?: string;
  }>;
  isActive: boolean; // Whether the skill is currently active/visible
  isAdvancedLocked?: boolean; // Restricts this quest to the Starway/Starlight curriculum
  nodeColor: 'yellow' | 'blue' | 'green' | 'white' | 'purple'; // Node color type
  nodeType?: 'adventure' | 'asset' | 'quest' | 'marker' | 'EXTRA'; // Node type based on color
  connections?: Array<{
    targetSkillId: string;
    connectionType: 'normal' | 'special'; // normal = purple, special = red
    hasArrowhead: boolean; // Whether to show arrowhead
    breakPoints?: Array<{ layer: number; position: number }>; // Break points on circles (layer + angle)
    curveMode?: 'auto' | 'bezier';
    controlPoints?: Array<{ x: number; y: number }>;
  }>;
  prerequisites?: string[]; // Array of skill IDs that must be unlocked first
  minAP?: number; // Minimum recommended AP reward for quest nodes
  maxAP?: number; // Maximum recommended AP reward for quest nodes
  createdAt: Date;
  updatedAt: Date;
}

const SkillSchema = new Schema<ISkill>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    cost: { type: Number, required: true, min: 0 },
    nextQuestCost: { type: Number, default: 25, min: 0 },
    previewClip: [{ type: String }],
    contentYouTube: [{ type: String }],
    contentGoogleDrive: [{ type: String }],
    layer: { type: Number, default: 0, min: 0, max: 7 },
    position: { type: Number, default: 0, min: 0 },
    treePosition: {
      x: { type: Number },
      y: { type: Number }
    },
    externalSource: { type: String, enum: ['office-quest'] },
    externalQuestId: { type: String },
    subQuests: [{
      externalId: { type: String },
      title: { type: String, required: true },
      description: { type: String, default: '' },
      descriptionParts: [{ type: { type: String, required: true }, content: { type: String, required: true } }],
      type: { type: String }
    }],
    isActive: { type: Boolean, default: true },
    isAdvancedLocked: { type: Boolean, default: false },
    nodeColor: { type: String, enum: ['yellow', 'blue', 'green', 'white', 'purple'], default: 'blue' },
    nodeType: { type: String, enum: ['adventure', 'asset', 'quest', 'marker', 'EXTRA'] },
    connections: [{
      targetSkillId: { type: String, required: true },
      connectionType: { type: String, enum: ['normal', 'special'], default: 'normal' },
      hasArrowhead: { type: Boolean, default: true },
      breakPoints: [{ layer: Number, position: Number }],
      curveMode: { type: String, enum: ['auto', 'bezier'], default: 'auto' },
      controlPoints: [{ x: Number, y: Number }]
    }],
    prerequisites: [{ type: String, default: [] }],
    minAP: { type: Number, default: undefined, min: 0 },
    maxAP: { type: Number, default: undefined, min: 0 },
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
SkillSchema.index({ externalSource: 1, externalQuestId: 1 }, { unique: true, sparse: true });
SkillSchema.index({ isActive: 1 });
SkillSchema.index({ 'connections.targetSkillId': 1 });

export default mongoose.model<ISkill>('Skill', SkillSchema);
