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
const ShopItemSchema = new mongoose_1.Schema({
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    imageUrl: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    availableToAllGuilds: { type: Boolean, default: true },
    guildIds: { type: [String], default: [] },
    itemType: { type: String, enum: ['normal', 'fiction'], default: 'normal' },
    productData: { type: String, default: '' }, // For normal items: product link/file/text
    externalSource: { type: String, enum: ['office-catalog'] },
    externalItemId: { type: String, trim: true },
    externalItemType: { type: String, trim: true },
    externalRarity: { type: String, trim: true },
    isInventoryOnly: { type: Boolean, default: false }
}, { timestamps: true });
// Index for efficient queries
ShopItemSchema.index({ isActive: 1 });
ShopItemSchema.index({ isActive: 1, availableToAllGuilds: 1, guildIds: 1 });
ShopItemSchema.index({ createdAt: -1 });
ShopItemSchema.index({ externalSource: 1, externalItemId: 1 }, { unique: true, sparse: true });
exports.default = mongoose_1.default.model('ShopItem', ShopItemSchema);
