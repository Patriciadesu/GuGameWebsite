import ShopItem from '../models/ShopItem';

export class ShopItemOperationError extends Error {
  constructor(message: string, readonly statusCode: 404 | 409) {
    super(message);
    this.name = 'ShopItemOperationError';
  }
}

export const retireShopItem = async (itemId: string) => {
  const item = await ShopItem.findByIdAndUpdate(
    itemId,
    { $set: { isActive: false } },
    { new: true, runValidators: true }
  );
  if (!item) {
    throw new ShopItemOperationError('Shop item not found', 404);
  }
  return item;
};
