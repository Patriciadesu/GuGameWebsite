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
const OfficeQuestTagSchema = new mongoose_1.Schema({
    externalId: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String }
}, { _id: false });
const OfficeSubQuestSchema = new mongoose_1.Schema({
    externalId: { type: String },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    descriptionParts: [{ type: { type: String, required: true }, content: { type: String, required: true } }],
    type: { type: String }
}, { _id: false });
const OfficeQuestCacheSchema = new mongoose_1.Schema({
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
exports.default = mongoose_1.default.model('OfficeQuestCache', OfficeQuestCacheSchema);
