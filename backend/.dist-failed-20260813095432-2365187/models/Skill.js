"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const questStepNormalization_1 = require("../services/questStepNormalization");
const SkillSchema = new mongoose_1.Schema({
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
    constellationPosition: {
        x: { type: Number },
        y: { type: Number }
    },
    constellationMapId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ConstellationMap' },
    constellationLabel: { type: String, trim: true, maxlength: 80 },
    mapNodeRole: {
        type: String,
        enum: ['topic-gateway', 'lesson', 'boss', 'capstone'],
        default: 'lesson'
    },
    nodePreview: {
        imageUrl: { type: String, trim: true },
        summary: { type: String, trim: true },
        outcomes: { type: [String], default: [] },
        actionLabel: { type: String, trim: true, default: 'View Path' }
    },
    externalSource: { type: String, enum: ['office-quest', 'hamquest', 'star-master'] },
    externalQuestId: { type: String },
    subQuests: [{
            externalId: { type: String, required: true, immutable: true, trim: true },
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
}, { timestamps: true });
// Auto-set nodeType based on nodeColor if not provided
SkillSchema.pre('save', function (next) {
    if (!this.nodeType && this.nodeColor) {
        const colorToTypeMap = {
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
SkillSchema.pre('validate', function (next) {
    try {
        if (this.subQuests) {
            this.subQuests = (0, questStepNormalization_1.normalizeQuestStepExternalIds)(this.subQuests);
        }
        next();
    }
    catch (error) {
        next(error);
    }
});
// Index for efficient queries
SkillSchema.index({ layer: 1, position: 1 });
SkillSchema.index({ constellationMapId: 1, layer: 1, position: 1 });
SkillSchema.index({ externalSource: 1, externalQuestId: 1 }, { sparse: true });
SkillSchema.index({ isActive: 1 });
SkillSchema.index({ 'connections.targetSkillId': 1 });
exports.default = mongoose_1.default.model('Skill', SkillSchema);
