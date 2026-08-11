import { expect, Page, test } from '@playwright/test';

const fictionItem = {
  _id: 'fiction-1',
  title: 'Shared Story',
  description: 'A collaborative story.',
  price: 10,
  imageUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  isActive: true,
  itemType: 'fiction',
  isPurchased: false,
  hasEverPurchased: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
};

async function mockShop(page: Page, onRelease: () => void) {
  await page.route('http://localhost:3099/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/auth/user') {
      return route.fulfill({
        json: {
          authenticated: true,
          user: { id: 'user-1', username: 'Tester', discriminator: '0001', avatar: null, isAdmin: false, role: 'user' }
        }
      });
    }
    if (path === '/api/shop/items') {
      return route.fulfill({ json: { success: true, items: [fictionItem] } });
    }
    if (path === '/api/users/user-1') {
      return route.fulfill({ json: { success: true, user: { assetPoints: 100, assetPointName: 'AP' } } });
    }
    if (path === '/api/shop/items/fiction-1/fiction' && request.method() === 'GET') {
      return route.fulfill({
        json: { success: true, contributions: [], isPurchased: false, hasEverPurchased: true }
      });
    }
    if (path === '/api/shop/items/fiction-1/fiction/release-lock' && request.method() === 'POST') {
      onRelease();
      return route.fulfill({ json: { success: true } });
    }

    return route.fulfill({ status: 404, json: { error: `Unhandled test request: ${path}` } });
  });
}

test('fiction dialog traps focus and Escape closes safely', async ({ page }) => {
  let releaseCount = 0;
  await mockShop(page, () => { releaseCount += 1; });
  await page.goto('shop');

  const opener = page.getByRole('button', { name: 'Read' });
  await opener.click();

  const dialog = page.getByRole('dialog', { name: /Shared Story/ });
  const closeButton = page.getByRole('button', { name: 'Close fiction' });
  const repurchaseButton = page.getByRole('button', { name: /Repurchase \(10 AP\)/ });

  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(repurchaseButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(releaseCount).toBe(1);
});

