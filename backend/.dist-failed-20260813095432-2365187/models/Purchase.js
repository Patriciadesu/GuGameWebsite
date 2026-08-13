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
const PurchaseSchema = new mongoose_1.Schema({
    userId: { type: String, required: true },
    shopItemId: { type: mongoose_1.Schema.Types.ObjectId, required: true, ref: 'ShopItem' },
    status: { type: String, enum: ['preorder', 'completed'], default: 'preorder' },
    purchasedAt: { type: Date, default: Date.now },
    contributionCredits: { type: Number, default: 0, min: 0 }, // Credits for fiction contributions
    quantity: { type: Number, default: 1, min: 0 },
    lastUsedAt: { type: Date, default: undefined }
}, { timestamps: true });
PurchaseSchema.index({ userId: 1, shopItemId: 1 }, { unique: true });
PurchaseSchema.index({ shopItemId: 1, createdAt: -1 });
PurchaseSchema.index({ createdAt: -1 });
exports.default = mongoose_1.default.model('Purchase', PurchaseSchema);
