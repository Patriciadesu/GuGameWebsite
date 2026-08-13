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
const ConstellationThemeSchema = new mongoose_1.Schema({
    key: { type: String, required: true, trim: true, default: 'default' },
    backgroundAssetUrl: { type: String, trim: true },
    frameStyle: { type: String, required: true, trim: true, default: 'nordic' },
    backgroundColor: { type: String, required: true, default: '#050b14' },
    lineColor: { type: String, required: true, default: '#c7d2e3' },
    unlockedColor: { type: String, required: true, default: '#6ee7ff' },
    availableColor: { type: String, required: true, default: '#f6c453' },
    lockedColor: { type: String, required: true, default: '#64748b' },
    bossColor: { type: String, required: true, default: '#ef4444' },
    finalBossColor: { type: String, required: true, default: '#7dd3fc' }
}, { _id: false });
const ConstellationLayoutSchema = new mongoose_1.Schema({
    width: { type: Number, required: true, default: 1600, min: 320, max: 10000 },
    height: { type: Number, required: true, default: 900, min: 320, max: 10000 },
    minZoom: { type: Number, required: true, default: 0.3, min: 0.1, max: 1 },
    maxZoom: { type: Number, required: true, default: 3, min: 1, max: 10 }
}, { _id: false });
const ConstellationSchema = new mongoose_1.Schema({
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
    kind: { type: String, enum: ['root', 'child'], required: true },
    parentConstellationId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Constellation' },
    entrySkillId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Skill' },
    sortOrder: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    theme: { type: ConstellationThemeSchema, default: () => ({}) },
    layout: { type: ConstellationLayoutSchema, default: () => ({}) },
    schemaVersion: { type: Number, default: 1, min: 1 }
}, { timestamps: true });
ConstellationSchema.pre('validate', function (next) {
    if (this.kind === 'root' && this.parentConstellationId) {
        this.invalidate('parentConstellationId', 'Root constellations cannot have a parent');
    }
    if (this.kind === 'child' && !this.parentConstellationId) {
        this.invalidate('parentConstellationId', 'Child constellations require a parent');
    }
    if (this.parentConstellationId && this.parentConstellationId.equals(this._id)) {
        this.invalidate('parentConstellationId', 'A constellation cannot be its own parent');
    }
    if (this.layout && this.layout.minZoom > this.layout.maxZoom) {
        this.invalidate('layout.minZoom', 'Minimum zoom cannot exceed maximum zoom');
    }
    next();
});
ConstellationSchema.index({ kind: 1, isActive: 1, sortOrder: 1 });
ConstellationSchema.index({ parentConstellationId: 1, isActive: 1, sortOrder: 1 });
exports.default = mongoose_1.default.model('Constellation', ConstellationSchema);
