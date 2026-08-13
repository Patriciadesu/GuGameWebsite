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
const ConstellationVisualThemeSchema = new mongoose_1.Schema({
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
const ConstellationViewportSchema = new mongoose_1.Schema({
    width: { type: Number, required: true, default: 2400, min: 320, max: 10000 },
    height: { type: Number, required: true, default: 1400, min: 320, max: 10000 },
    minZoom: { type: Number, required: true, default: 0.3, min: 0.1, max: 1 },
    maxZoom: { type: Number, required: true, default: 3, min: 1, max: 10 }
}, { _id: false });
const ConstellationMapSchema = new mongoose_1.Schema({
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
    parentMapId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'ConstellationMap' },
    gatewaySkillId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Skill' },
    displayOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: false },
    level: { type: Number, default: 1, min: 1, validate: Number.isInteger },
    visualTheme: { type: ConstellationVisualThemeSchema, default: () => ({}) },
    viewport: { type: ConstellationViewportSchema, default: () => ({}) },
    schemaVersion: { type: Number, default: 1, min: 1 }
}, { timestamps: true });
ConstellationMapSchema.pre('validate', function (next) {
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
exports.default = mongoose_1.default.model('ConstellationMap', ConstellationMapSchema);
