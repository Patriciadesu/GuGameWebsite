import { expect, Page, test } from '@playwright/test';

const inventoryItem = {
  _id: 'inventory-1',
  title: 'Signal Cache',
  description: 'A stored reward from a completed quest.',
  imageUrl: '',
  quantity: 2,
  externalItemType: 'GachaItem',
  externalRarity: 'Rare',
  isUsable: true
};

async function mockInventory(page: Page, onUse?: () => void) {
  await page.route('http://localhost:3099/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/user') return route.fulfill({ json: { authenticated: true, user: { id: 'user-1', username: 'Explorer', discriminator: '0', avatar: null, isAdmin: false, role: 'user', guildId: 'guild-1' } } });
    if (path === '/api/inventory' && request.method() === 'GET') return route.fulfill({ json: { success: true, items: [inventoryItem], hamsterQuestLinked: true, syncWarning: '' } });
    if (path === '/api/inventory/inventory-1/use' && request.method() === 'POST') {
      onUse?.();
      return route.fulfill({ json: { success: true, items: [], itemType: 'normal', message: 'Item used' } });
    }
    if (path === '/api/mainmenu/bootstrap') return route.fulfill({ json: { success: true, skills: [], userStats: {}, unlockedSkills: [], questProgress: {}, progressionLeaderboard: { totalSkills: 0, currentGuild: null, guildMembers: [], guilds: [] } } });
    if (path === '/api/constellation-maps') return route.fulfill({ json: { success: true, maps: [] } });
    return route.fulfill({ json: { success: true, items: [], guilds: [], users: [], requests: [] } });
  });
}

test('inventory lives on its own route and remains usable', async ({ page }) => {
  let useCount = 0;
  await mockInventory(page, () => { useCount += 1; });
  await page.goto('mainmenu');
  await expect(page.locator('.inventory-section')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Player navigation' }).getByRole('button', { name: 'Inventory' }).click();
  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  await expect(page.getByText('Signal Cache')).toBeVisible();
  await page.getByRole('button', { name: 'Use item' }).click();
  await expect.poll(() => useCount).toBe(1);
});

test('inventory page fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInventory(page);
  await page.goto('inventory');
  const overflow = await page.locator('.inventory-page').evaluate(element => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('inventory dark theme keeps storage surfaces readable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gugame-theme', 'dark'));
  await mockInventory(page);
  await page.goto('inventory');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByText('Signal Cache')).toBeVisible();
  await page.screenshot({ path: '/tmp/constellation-visual/dark-inventory.png', fullPage: true });
});
