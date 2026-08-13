"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.retireShopItem = exports.ShopItemOperationError = void 0;
const ShopItem_1 = __importDefault(require("../models/ShopItem"));
class ShopItemOperationError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'ShopItemOperationError';
    }
}
exports.ShopItemOperationError = ShopItemOperationError;
const retireShopItem = async (itemId) => {
    const item = await ShopItem_1.default.findByIdAndUpdate(itemId, { $set: { isActive: false } }, { new: true, runValidators: true });
    if (!item) {
        throw new ShopItemOperationError('Shop item not found', 404);
    }
    return item;
};
exports.retireShopItem = retireShopItem;
