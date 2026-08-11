import { expect, Page, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const theme = {
  key: 'default',
  frameStyle: 'luminous-minimal',
  backgroundColor: '#f7f9fc',
  surfaceColor: '#ffffff',
  textColor: '#182033',
  mutedTextColor: '#667085',
  borderColor: '#d9e0ea',
  lineColor: '#8b97aa',
  unlockedColor: '#1677ff',
  availableColor: '#b77900',
  lockedColor: '#667085',
  bossColor: '#d63c45',
  capstoneColor: '#6d4aff'
};

const viewport = { width: 1600, height: 900, minZoom: 0.3, maxZoom: 3 };
const map = (id: string, name: string, slug: string, displayOrder: number) => ({
  _id: id,
  name,
  slug,
  description: `${name} learning paths`,
  scope: 'discipline',
  displayOrder,
  isActive: true,
  visualTheme: theme,
  viewport
});

const programmingMap = map('100000000000000000000001', 'Programming', 'programming', 0);
const unityMap = map('100000000000000000000002', 'Unity Development', 'unity-development', 1);
const gameArtMap = map('100000000000000000000003', 'Game Art', 'game-art', 2);

const skill = (
  id: string,
  title: string,
  constellationMapId: string,
  x: number,
  y: number,
  role: 'topic-gateway' | 'lesson' | 'boss' | 'capstone' = 'lesson',
  targets: string[] = []
) => ({
  _id: id,
  title,
  description: `Learn ${title} through guided game-production quests.`,
  cost: 0,
  layer: 0,
  position: y,
  treePosition: { x: -999, y: -999 },
  constellationPosition: { x, y },
  constellationMapId,
  mapNodeRole: role,
  nodePreview: role === 'topic-gateway' ? {
    summary: `Create production-ready work with ${title}.`,
    outcomes: ['Build game-ready assets', 'Create props and environments', 'Prepare work for Unity'],
    actionLabel: 'View Path'
  } : undefined,
  isActive: true,
  nodeColor: role === 'boss' ? 'green' : role === 'capstone' ? 'purple' : 'blue',
  nodeType: role === 'boss' ? 'quest' : 'asset',
  prerequisites: [],
  connections: targets.map(targetSkillId => ({
    targetSkillId,
    connectionType: role === 'boss' ? 'special' : 'normal',
    hasArrowhead: true
  }))
});

const programmingSkills = [
  skill('200000000000000000000001', 'C# Foundations', programmingMap._id, 800, 170, 'topic-gateway', ['200000000000000000000002']),
  skill('200000000000000000000002', 'Game Logic', programmingMap._id, 520, 430, 'topic-gateway', ['200000000000000000000003']),
  skill('200000000000000000000003', 'Tools', programmingMap._id, 800, 700, 'topic-gateway'),
  skill('200000000000000000000004', 'Algorithms', programmingMap._id, 1080, 430, 'topic-gateway')
];

const unitySkills = [
  skill('300000000000000000000001', 'Unity Basics', unityMap._id, 800, 150, 'topic-gateway', ['300000000000000000000002', '300000000000000000000003']),
  skill('300000000000000000000002', 'Scenes', unityMap._id, 520, 410, 'topic-gateway', ['300000000000000000000004']),
  skill('300000000000000000000003', 'Physics', unityMap._id, 1080, 410, 'topic-gateway', ['300000000000000000000004']),
  skill('300000000000000000000004', 'Optimization', unityMap._id, 800, 700, 'topic-gateway')
];

const gameArtSkills = [
  skill('400000000000000000000001', '2D Art', gameArtMap._id, 800, 120, 'topic-gateway', ['400000000000000000000002', '400000000000000000000003']),
  skill('400000000000000000000002', '3D Modeling', gameArtMap._id, 430, 390, 'topic-gateway', ['400000000000000000000004']),
  skill('400000000000000000000003', 'Materials', gameArtMap._id, 1170, 390, 'topic-gateway', ['400000000000000000000005']),
  skill('400000000000000000000004', 'Animation', gameArtMap._id, 580, 700, 'topic-gateway', ['400000000000000000000005']),
  skill('400000000000000000000005', 'VFX', gameArtMap._id, 1020, 700, 'topic-gateway')
];

const topicMap = {
  ...map('500000000000000000000001', '3D Modeling', 'game-art-3d-modeling', 0),
  scope: 'topic',
  parentMapId: gameArtMap._id,
  gatewaySkillId: '400000000000000000000002'
};

const topicSkills = [
  skill('600000000000000000000001', 'Blender Setup', topicMap._id, 800, 120, 'lesson', ['600000000000000000000002']),
  skill('600000000000000000000002', 'Blender Basic', topicMap._id, 800, 230, 'lesson', ['600000000000000000000003']),
  skill('600000000000000000000003', 'Addons', topicMap._id, 800, 340, 'lesson', ['600000000000000000000004', '600000000000000000000008']),
  skill('600000000000000000000004', 'Painting', topicMap._id, 520, 440, 'lesson', ['600000000000000000000005']),
  skill('600000000000000000000005', 'UV', topicMap._id, 520, 535, 'lesson', ['600000000000000000000006']),
  skill('600000000000000000000006', 'Shader', topicMap._id, 520, 630, 'lesson', ['600000000000000000000007']),
  skill('600000000000000000000007', 'Scenery', topicMap._id, 520, 740, 'boss', ['600000000000000000000011']),
  skill('600000000000000000000008', 'Sculpt', topicMap._id, 1080, 440, 'lesson', ['600000000000000000000009']),
  skill('600000000000000000000009', 'Rigging', topicMap._id, 1080, 535, 'lesson', ['600000000000000000000010']),
  skill('600000000000000000000010', 'Action!', topicMap._id, 1080, 690, 'boss', ['600000000000000000000011']),
  skill('600000000000000000000011', 'Cinematic', topicMap._id, 800, 820, 'capstone')
];

const allMaps = [programmingMap, unityMap, gameArtMap, topicMap];
const allSkills = [...programmingSkills, ...unitySkills, ...gameArtSkills, ...topicSkills];
const mapSkills: Record<string, typeof allSkills> = {
  [programmingMap._id]: programmingSkills,
  [unityMap._id]: unitySkills,
  [gameArtMap._id]: gameArtSkills,
  [topicMap._id]: topicSkills
};

const mainMenuBootstrap = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  skills: allSkills,
  userStats: { assetPoints: 500, assetPointName: 'AP', voiceMinutesToday: 12, totalVoiceMinutes: 300 },
  unlockedSkills: [programmingSkills[0]._id, unitySkills[0]._id, gameArtSkills[0]._id],
  questProgress: { completedSteps: [], completedQuests: [], pendingApprovalSkillIds: [] },
  progressionLeaderboard: { totalSkills: allSkills.length, currentGuild: null, guildMembers: [], guilds: [] },
  inventory: { items: [], hamsterQuestLinked: false, syncWarning: '' },
  ...overrides
});

const installApiFixtures = async (
  page: Page,
  onLayoutSave?: (payload: { nodes: Array<{ skillId: string; x: number; y: number }> }) => void,
  onStarCreate?: (payload: Record<string, unknown>) => void,
  onStarUpdate?: (skillId: string, payload: Record<string, unknown>) => void,
  onMapCreate?: (payload: Record<string, unknown>) => void,
  onConnectionChange?: (method: string, sourceId: string, targetId: string) => void,
  onStarMasterImport?: (externalQuestId: string, payload: Record<string, unknown>) => void,
  onMapUpdate?: (mapId: string, payload: Record<string, unknown>) => void,
  onSkillDelete?: (skillId: string, cascade: boolean) => void,
  onMapDelete?: (mapId: string, cascade: boolean) => void,
  authRole: 'admin' | 'super-admin' = 'super-admin'
) => {
  await page.route('http://localhost:3099/api/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body)
    });

    if (path === '/api/auth/user') return json({ authenticated: true, user: {
      id: 'visual-test-user', username: 'Constellation Tester', discriminator: '0', avatar: null,
      email: 'tester@example.com', isAdmin: true, role: authRole, guildId: 'visual-guild'
    } });
    if (path === '/api/mainmenu/bootstrap') return json(mainMenuBootstrap());
    if (path === '/api/mainmenu/status') return json({ success: true, unlockedSkills: [], questProgress: {} });
    if (path === '/api/admin/star-master/tags' && route.request().method() === 'GET') {
      return json({ success: true, tags: [
        { id: 'tag-art', name: 'Art', color: '#3b82f6' },
        { id: 'tag-audio', name: 'Audio', color: '#0ea5e9' },
        { id: 'tag-modeling', name: 'Modeling', color: '#f59e0b' },
        { id: 'tag-optional', name: 'Optional', color: '#8b5cf6' }
      ] });
    }
    if (path === '/api/admin/star-master/quests' && route.request().method() === 'GET') {
      const pageNumber = Number(url.searchParams.get('page') || 1);
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const type = url.searchParams.get('type');
      const catalog = [{
        externalId: 'star-master-sound-01',
        title: 'Create a Soundscape',
        description: 'Build an atmospheric game soundscape.',
        type: 'MainQuest',
        imageUrl: 'https://example.com/quest-soundscape.webp',
        subQuestCount: 3,
        imported: false,
        tags: [{ id: 'tag-audio', name: 'Audio', color: '#0ea5e9' }]
      }, {
        externalId: 'star-master-imported-01',
        title: 'Imported Modeling Quest',
        description: 'Already part of a constellation.',
        type: 'MainQuest',
        subQuestCount: 2,
        imported: true,
        tags: [{ id: 'tag-modeling', name: 'Modeling', color: '#f59e0b' }]
      }, {
        externalId: 'star-master-side-01',
        title: 'Side Challenge',
        description: 'A compact optional challenge.',
        type: 'SideQuest',
        subQuestCount: 1,
        imported: false,
        tags: [{ id: 'tag-optional', name: 'Optional', color: '#8b5cf6' }]
      }];
      if (pageNumber === 2 && !search && !type) {
        return json({ success: true, quests: [{
          externalId: 'star-master-lighting-01', title: 'Advanced Lighting', type: 'MainQuest', subQuestCount: 4, imported: false,
          tags: [{ id: 'tag-art', name: 'Art', color: '#3b82f6' }]
        }], pagination: { page: 2, limit: 50, total: 51, totalPages: 2 } });
      }
      const tagIds = (url.searchParams.get('tagIds') || '').split(',').filter(Boolean);
      const filtered = catalog.filter(quest => (!search || quest.title.toLowerCase().includes(search)) &&
        (!type || quest.type === type) &&
        (tagIds.length === 0 || quest.tags.some(tag => tagIds.includes(tag.id))));
      return json({
        success: true,
        quests: filtered,
        pagination: { page: 1, limit: 50, total: search || type || tagIds.length ? filtered.length : 51, totalPages: search || type || tagIds.length ? 1 : 2 }
      });
    }
    if (path === '/api/admin/star-master/quests/import' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as { constellationMapId: string; externalQuestIds: string[] };
      const imported = payload.externalQuestIds.map((externalQuestId, index) => {
        onStarMasterImport?.(externalQuestId, payload);
        const importedSkill = skill(
          index === 0 ? '700000000000000000000009' : `7000000000000000000000${10 + index - 1}`,
          externalQuestId === 'star-master-sound-01' ? 'Create a Soundscape' : 'Side Challenge',
          payload.constellationMapId,
          800 + index * 120,
          500,
          'lesson'
        );
        Object.assign(importedSkill, {
          externalSource: 'star-master',
          externalQuestId,
          nodePreview: {
            imageUrl: externalQuestId === 'star-master-sound-01' ? 'https://example.com/quest-soundscape.webp' : undefined,
            summary: 'Build an atmospheric game soundscape.',
            outcomes: ['Record ambience'],
            actionLabel: 'Open Quest'
          },
          subQuests: [{
            externalId: 'star-master-step-01',
            title: 'Record ambience',
            description: 'Capture a clean ambient loop.',
            descriptionParts: [
              { type: 'Text', content: 'Capture a clean ambient loop.' },
              { type: 'Image', content: 'https://example.com/ambience-reference.webp' }
            ],
            type: 'ImageNote'
          }]
        });
        allSkills.push(importedSkill);
        mapSkills[payload.constellationMapId]?.push(importedSkill);
        return importedSkill;
      });
      return json({ success: true, imported, skipped: [], failed: [] });
    }
    const starMasterImportMatch = path.match(/^\/api\/admin\/star-master\/quests\/([^/]+)\/import$/);
    if (starMasterImportMatch && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      onStarMasterImport?.(starMasterImportMatch[1], payload);
      const importedSkill = skill('700000000000000000000009', 'Create a Soundscape', String(payload.constellationMapId), 800, 500, 'lesson');
      Object.assign(importedSkill, {
        externalSource: 'star-master',
        externalQuestId: starMasterImportMatch[1],
        nodePreview: {
          imageUrl: 'https://example.com/quest-soundscape.webp',
          summary: 'Build an atmospheric game soundscape.',
          outcomes: ['Record ambience'],
          actionLabel: 'Open Quest'
        },
        subQuests: [{
          externalId: 'star-master-step-01',
          title: 'Record ambience',
          description: 'Capture a clean ambient loop.',
          descriptionParts: [
            { type: 'Text', content: 'Capture a clean ambient loop.' },
            { type: 'Image', content: 'https://example.com/ambience-reference.webp' }
          ],
          type: 'ImageNote'
        }]
      });
      allSkills.push(importedSkill);
      mapSkills[String(payload.constellationMapId)]?.push(importedSkill);
      return json({ success: true, skill: importedSkill });
    }
    if (path === '/api/skills' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      onStarCreate?.(payload);
      return json({ success: true, skill: { ...payload, _id: '700000000000000000000001' } });
    }
    const skillUpdateMatch = path.match(/^\/api\/skills\/([a-f0-9]{24})$/);
    if (skillUpdateMatch && route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      onStarUpdate?.(skillUpdateMatch[1], payload);
      return json({ success: true, skill: { ...payload, _id: skillUpdateMatch[1] } });
    }
    if (skillUpdateMatch && route.request().method() === 'DELETE') {
      onSkillDelete?.(skillUpdateMatch[1], url.searchParams.get('cascade') === 'true');
      return json({ success: true, message: 'Skill deleted successfully' });
    }
    const addConnectionMatch = path.match(/^\/api\/skills\/([a-f0-9]{24})\/connections$/);
    if (addConnectionMatch && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as { targetSkillId: string };
      const source = allSkills.find(candidate => candidate._id === addConnectionMatch[1]);
      source?.connections?.push({ targetSkillId: payload.targetSkillId, connectionType: 'normal', hasArrowhead: true });
      onConnectionChange?.('POST', addConnectionMatch[1], payload.targetSkillId);
      return json({ success: true, skill: source });
    }
    const removeConnectionMatch = path.match(/^\/api\/skills\/([a-f0-9]{24})\/connections\/([a-f0-9]{24})$/);
    if (removeConnectionMatch && route.request().method() === 'DELETE') {
      const source = allSkills.find(candidate => candidate._id === removeConnectionMatch[1]);
      if (source) source.connections = source.connections?.filter(connection => connection.targetSkillId !== removeConnectionMatch[2]);
      onConnectionChange?.('DELETE', removeConnectionMatch[1], removeConnectionMatch[2]);
      return json({ success: true, skill: source });
    }
    if (path === '/api/skills') return json({ success: true, skills: allSkills });
    if (path === '/api/constellation-maps') {
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        onMapCreate?.(payload);
        return json({ success: true, map: { ...payload, _id: '700000000000000000000002' } });
      }
      const gatewaySkillId = url.searchParams.get('gatewaySkillId');
      if (gatewaySkillId) return json({ success: true, maps: gatewaySkillId === topicMap.gatewaySkillId ? [topicMap] : [], pagination: { limit: 1, nextCursor: null } });
      const scope = url.searchParams.get('scope');
      const maps = scope === 'discipline' ? allMaps.filter(candidate => candidate.scope === 'discipline') : allMaps;
      return json({ success: true, maps, pagination: { limit: 100, nextCursor: null } });
    }
    const layoutMatch = path.match(/^\/api\/constellation-maps\/([a-f0-9]{24})\/layout$/);
    if (layoutMatch && route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON() as { nodes: Array<{ skillId: string; x: number; y: number }> };
      payload.nodes.forEach(node => {
        const target = allSkills.find(candidate => candidate._id === node.skillId);
        if (target) target.constellationPosition = { x: node.x, y: node.y };
      });
      onLayoutSave?.(payload);
      return json({ success: true, updatedCount: payload.nodes.length });
    }
    const mapMatch = path.match(/^\/api\/constellation-maps\/([a-f0-9]{24})$/);
    if (mapMatch) {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        onMapUpdate?.(mapMatch[1], payload);
        return json({ success: true, map: { ...allMaps.find(candidate => candidate._id === mapMatch[1]), ...payload } });
      }
      if (route.request().method() === 'DELETE') {
        onMapDelete?.(mapMatch[1], url.searchParams.get('cascade') === 'true');
        return json({ success: true, message: 'Constellation map deleted successfully' });
      }
      const selectedMap = allMaps.find(candidate => candidate._id === mapMatch[1]);
      return json({ success: true, map: selectedMap, skills: mapSkills[mapMatch[1]] || [] });
    }
    if (path === '/api/guilds') return json({ success: true, guilds: [] });
    if (path === '/api/users') return json({ success: true, users: [] });
    if (path === '/api/user/guild-info') return json({ success: true, isLeader: false, guild: null });
    return json({ success: true, items: [], requests: [] });
  });
};

const recordAudit = async (
  browserName: string,
  scenario: string,
  observations: Record<string, unknown>
) => {
  const outputDirectory = '/tmp/constellation-audit';
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    `${outputDirectory}/${browserName}-${scenario}.json`,
    JSON.stringify({ browserName, scenario, observations }, null, 2),
    'utf8'
  );
};

test('player constellation states render without overflow', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await expect(page.getByRole('heading', { name: 'Skill Constellations' }).first()).toBeVisible();
  await expect(page.locator('.constellation-overview-item')).toHaveCount(3);
  await page.screenshot({ path: '/tmp/constellation-visual/player-overview.png', fullPage: true });

  await page.getByRole('button', { name: /Game Art/ }).click();
  const modelingNode = page.locator('.constellation-node').filter({ hasText: '3D Modeling' });
  await modelingNode.hover();
  await expect(page.locator('.constellation-info-panel')).toBeVisible();
  await page.screenshot({ path: '/tmp/constellation-visual/player-gateway-preview.png', fullPage: true });

  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.locator('.constellation-focus')).toHaveClass(/is-topic-active/);
  await expect(page.locator('.constellation-topic-layer')).toBeVisible();
  await expect(page.locator('.constellation-anchor')).toHaveCSS('pointer-events', 'none');
  await page.waitForTimeout(650);

  const connectionPaths = await page.locator('.constellation-lines path').evaluateAll(paths => (
    paths.map(path => path.getAttribute('d') || '')
  ));
  expect(connectionPaths.length).toBeGreaterThan(0);
  expect(connectionPaths.every(path => /^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/.test(path))).toBe(true);

  await page.screenshot({ path: '/tmp/constellation-visual/player-topic.png', fullPage: true });

  const overflow = await page.locator('.constellation-shell').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('player topic refreshes imported quests when the window regains focus', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
  await page.getByRole('button', { name: 'View Path' }).click();

  const importedQuest = skill(
    '700000000000000000000010',
    'Newly Imported Quest',
    topicMap._id,
    1020,
    620,
    'lesson'
  );
  Object.assign(importedQuest, {
    externalSource: 'star-master',
    externalQuestId: 'focus-refresh-quest',
    nodeType: 'quest',
    nodeColor: 'green'
  });

  expect(await page.getByText('Newly Imported Quest', { exact: true }).count()).toBe(0);
  topicSkills.push(importedQuest);
  allSkills.push(importedQuest);

  try {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.constellation-topic-layer').getByText('Newly Imported Quest', { exact: true })).toBeVisible();
    await expect(page.locator('.constellation-focus')).toHaveClass(/is-topic-active/);
  } finally {
    topicSkills.splice(topicSkills.findIndex(candidate => candidate._id === importedQuest._id), 1);
    allSkills.splice(allSkills.findIndex(candidate => candidate._id === importedQuest._id), 1);
  }
});

test('mobile constellation uses one-map paging and bottom preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
  await expect(page.locator('.constellation-info-panel')).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/constellation-visual/player-mobile.png', fullPage: true });
});

test('empty topic explains that no quests are available yet', async ({ page }) => {
  const savedSkills = topicSkills.splice(0, topicSkills.length);
  try {
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
    await page.getByRole('button', { name: 'View Path' }).click();

    await expect(page.getByText('No quests here yet')).toBeVisible();
    await expect(page.getByText('This topic is ready for its first quest.')).toBeVisible();
  } finally {
    topicSkills.push(...savedSkills);
  }
});

test('player can explore a constellation with keyboard, camera controls, and browser-style back navigation', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();

  const canvas = page.getByRole('application', { name: 'Game Art constellation map' });
  const camera = canvas.locator('.constellation-camera');
  await expect(camera).toHaveAttribute('transform', 'translate(0 0) scale(1)');

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(camera).toHaveAttribute('transform', 'translate(0 0) scale(1.2)');

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await canvas.evaluate(element => {
    (window as Window & { constellationWheelSeen?: boolean }).constellationWheelSeen = false;
    element.addEventListener('wheel', () => {
      (window as Window & { constellationWheelSeen?: boolean }).constellationWheelSeen = true;
    }, { once: true });
  });
  await canvas.hover({ position: { x: canvasBox!.width / 2, y: canvasBox!.height / 2 } });
  await page.mouse.wheel(0, -420);
  expect(await page.evaluate(() => (window as Window & { constellationWheelSeen?: boolean }).constellationWheelSeen)).toBe(true);
  await expect.poll(() => camera.getAttribute('transform')).not.toBe('translate(0 0) scale(1.2)');

  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + canvasBox!.width / 2 + 90, canvasBox!.y + canvasBox!.height / 2 + 45, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => camera.getAttribute('transform')).not.toMatch(/^translate\\(0 0\\)/);

  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(camera).toHaveAttribute('transform', 'translate(0 0) scale(1)');

  const modelingNode = canvas.getByRole('button', { name: /3D Modeling/ });
  await modelingNode.focus();
  await expect(page.locator('.constellation-info-panel')).toBeVisible();
  await modelingNode.press('Enter');
  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.locator('.constellation-focus')).toHaveClass(/is-topic-active/);
  await expect(page.locator('.constellation-topic-layer')).toHaveCSS('transition-duration', /0\.36s/);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Game Art' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Skill Constellations' }).first()).toBeVisible();

  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Game Art' })).toBeVisible();
  await page.goForward();
  await expect(page.locator('.constellation-focus')).toHaveClass(/is-topic-active/);
  await expect(page.getByRole('heading', { name: '3D Modeling' })).toBeVisible();
});

test('admin constellation workspace exposes map and node ownership', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await expect(page.getByRole('heading', { name: 'Programming' })).toBeVisible();
  await expect(page.getByLabel('Choose discipline').locator('option')).toHaveCount(3);
  await expect(page.locator('.quest-tree-editor')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Legacy Quest Tree' })).toHaveCount(0);
  await expect(page.locator('.constellation-admin-inspector')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/constellation-visual/admin-workspace.png', fullPage: true });
});

test('admin visual editor drags nodes and saves a straight-line layout batch', async ({ page }) => {
  let savedLayout: { nodes: Array<{ skillId: string; x: number; y: number }> } | undefined;
  await installApiFixtures(page, payload => { savedLayout = payload; });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  await expect(editor).toBeVisible();
  await expect(page.locator('.constellation-layout-editor')).toHaveClass(/constellation-focus/);
  await expect(page.locator('.constellation-layout-simple-header').getByRole('heading', { name: 'Game Art' })).toBeVisible();
  const paths = await editor.locator('.constellation-layout-lines path').evaluateAll(elements => (
    elements.map(element => element.getAttribute('d') || '')
  ));
  expect(paths).toHaveLength(gameArtSkills.reduce((total, skill) => total + (skill.connections?.length || 0), 0));
  expect(paths.every(path => /^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/.test(path))).toBe(true);
  expect(await editor.locator('.constellation-node-star').first().getAttribute('d')).toBe(
    'M 0 -24 L 7 -7 L 24 0 L 7 7 L 0 24 L -7 7 L -24 0 L -7 -7 Z'
  );

  const modelingNode = editor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' });
  const box = await modelingNode.locator('.constellation-node-core').boundingBox();
  expect(box).not.toBeNull();
  const transformBeforeDrag = await modelingNode.getAttribute('transform');
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 3, box!.y + box!.height / 2 + 2);
  await page.mouse.up();
  await expect(modelingNode).toHaveAttribute('transform', transformBeforeDrag!);
  await expect(page.locator('.constellation-layout-dirty-count')).toHaveCount(0);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await expect(modelingNode).toHaveAttribute('tabindex', '0');

  await expect.poll(() => modelingNode.getAttribute('transform')).not.toBe(transformBeforeDrag);
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => savedLayout?.nodes.length || 0).toBe(1);
  expect(savedLayout?.nodes[0].skillId).toBe('400000000000000000000002');
  await expect(page.locator('.constellation-layout-dirty-count')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/constellation-visual/admin-layout-editor.png', fullPage: true });
});

test('admin creates a star with inferred map ownership and cancels keyboard movement', async ({ page }) => {
  let createdStar: Record<string, unknown> | undefined;
  await installApiFixtures(page, undefined, payload => { createdStar = payload; });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();

  await page.getByRole('button', { name: 'Create star' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create star' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Star name').fill('Data Structures');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => createdStar?.title).toBe('Data Structures');
  expect(createdStar?.constellationMapId).toBe(programmingMap._id);
  expect(createdStar?.mapNodeRole).toBe('topic-gateway');

  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();
  const editor = page.getByRole('application', { name: '3D Modeling visual layout editor' });
  const firstStar = editor.locator('.constellation-layout-node').first();
  await firstStar.focus();
  await firstStar.press(' ');
  await firstStar.press('Shift+ArrowRight');
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Unsaved', { exact: true })).toHaveCount(0);
});

test('admin edits selected star info in a contextual dialog', async ({ page }) => {
  let updatedSkillId = '';
  let updatedInfo: Record<string, unknown> | undefined;
  await installApiFixtures(page, undefined, undefined, (skillId, payload) => {
    updatedSkillId = skillId;
    updatedInfo = payload;
  });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const disciplineEditor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  await disciplineEditor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();
  const editor = page.getByRole('application', { name: '3D Modeling visual layout editor' });
  await expect(editor).toBeVisible();
  const blenderNode = editor.locator('.constellation-layout-node').filter({ hasText: 'Blender Setup' });
  await blenderNode.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit star' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit star' });
  await dialog.getByLabel('Short label').fill('Blender Start');
  await dialog.getByLabel('Description').fill('Prepare Blender for production work.');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect.poll(() => updatedSkillId).toBe('600000000000000000000001');
  expect(updatedInfo?.constellationLabel).toBe('Blender Start');
  expect(updatedInfo?.description).toBe('Prepare Blender for production work.');
  await expect(blenderNode).toBeFocused();
});

test('admin enters or auto-creates topic constellations from discipline stars', async ({ page }) => {
  let createdTopic: Record<string, unknown> | undefined;
  await installApiFixtures(page, undefined, undefined, undefined, payload => { createdTopic = payload; });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const disciplineEditor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const modelingGateway = disciplineEditor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' });
  await modelingGateway.click({ button: 'right' });
  await expect(disciplineEditor).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Edit star' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open topic', exact: true })).toBeVisible();
  await expect(page.getByRole('application', { name: '3D Modeling visual layout editor' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Open topic', exact: true }).click();
  await expect(page.getByRole('application', { name: '3D Modeling visual layout editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to discipline' }).click();
  await expect(page.getByRole('application', { name: 'Game Art visual layout editor' })).toBeVisible();

  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: 'Materials' }).dblclick();
  await expect.poll(() => createdTopic?.scope).toBe('topic');
  expect(createdTopic?.parentMapId).toBe(gameArtMap._id);
  expect(createdTopic?.gatewaySkillId).toBe('400000000000000000000003');
  expect(createdTopic?.isActive).toBe(false);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('admin keeps new maps draft and exposes publish and delete actions', async ({ page }) => {
  let createdMap: Record<string, unknown> | undefined;
  let updatedMap: { id: string; payload: Record<string, unknown> } | undefined;
  let deletedSkillId = '';
  let deletedMapId = '';
  let skillDeleteCascades = false;
  let mapDeleteCascades = false;
  await installApiFixtures(
    page,
    undefined,
    undefined,
    undefined,
    payload => { createdMap = payload; },
    undefined,
    undefined,
    (id, payload) => { updatedMap = { id, payload }; },
    (id, cascade) => { deletedSkillId = id; skillDeleteCascades = cascade; },
    (id, cascade) => { deletedMapId = id; mapDeleteCascades = cascade; }
  );
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();

  await page.getByRole('button', { name: 'Create discipline' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Create discipline' });
  await expect(createDialog).toContainText('top-level constellation');
  await createDialog.getByLabel('Discipline name').fill('Draft Discipline');
  await createDialog.getByRole('button', { name: 'Create discipline' }).click();
  await expect.poll(() => createdMap?.name).toBe('Draft Discipline');
  expect(createdMap?.isActive).toBe(false);

  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('button', { name: 'Unpublish' }).click();
  await expect.poll(() => updatedMap?.id).toBe(gameArtMap._id);
  expect(updatedMap?.payload).toEqual({ isActive: false });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  await editor.locator('.constellation-layout-node').filter({ hasText: 'Materials' }).click();
  await editor.locator('.constellation-layout-node').filter({ hasText: 'VFX' }).click({ button: 'right' });
  page.once('dialog', dialog => {
    expect(dialog.message()).toContain('Delete star "VFX"');
    void dialog.accept();
  });
  await page.getByRole('menuitem', { name: 'Delete star' }).click();
  await expect.poll(() => deletedSkillId).toBe('400000000000000000000005');
  expect(skillDeleteCascades).toBe(true);
  await page.getByRole('button', { name: 'More constellation actions' }).click();
  await expect(page.getByRole('button', { name: 'Delete constellation' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete constellation' }).click();
  await expect.poll(() => deletedMapId).toBe(gameArtMap._id);
  expect(mapDeleteCascades).toBe(true);
});

test('mobile admin uses compact discoverable navigation and actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByLabel('Admin section', { exact: true }).selectOption('skilltree');
  await expect(page.getByRole('navigation', { name: 'Admin sections' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Create discipline' })).toBeVisible();
  const actions = page.locator('.constellation-admin-actions');
  await actions.getByRole('button', { name: 'Actions' }).click();
  await expect(actions.getByRole('button', { name: 'Create star' })).toBeVisible();
});

test('admin role can open and use the Constellation Editor', async ({ page }) => {
  let createdStar: Record<string, unknown> | undefined;
  await installApiFixtures(
    page,
    undefined,
    payload => { createdStar = payload; },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    'admin'
  );
  await page.goto('admin');
  await expect(page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Quest Import' })).toHaveCount(0);
  await expect(page.getByLabel('Admin section', { exact: true }).locator('option', { hasText: 'Quest Import' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Constellation Editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Constellation Editor' }).click();
  await expect(page.getByRole('application', { name: 'Programming visual layout editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Create star' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create star' });
  await dialog.getByLabel('Star name').fill('Admin-created topic');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => createdStar?.title).toBe('Admin-created topic');
  expect(createdStar?.constellationMapId).toBe(programmingMap._id);
});

test('admin creates and removes branching star connections', async ({ page }) => {
  const changes: Array<{ method: string; sourceId: string; targetId: string }> = [];
  await installApiFixtures(page, undefined, undefined, undefined, undefined, (method, sourceId, targetId) => {
    changes.push({ method, sourceId, targetId });
  });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();

  const editor = page.getByRole('application', { name: '3D Modeling visual layout editor' });
  await editor.locator('.constellation-layout-node').filter({ hasText: 'Blender Setup' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Connect from here' }).click();
  await expect(page.getByRole('status')).toContainText('Connect from Blender Setup');
  await editor.locator('.constellation-layout-node').filter({ hasText: 'Painting' }).click();
  await editor.locator('.constellation-layout-node').filter({ hasText: 'Sculpt' }).click();
  await expect.poll(() => changes.filter(change => change.method === 'POST').length).toBe(2);
  expect(changes.filter(change => change.method === 'POST').map(change => change.targetId)).toEqual([
    '600000000000000000000004',
    '600000000000000000000008'
  ]);

  await editor.locator('.constellation-layout-node').filter({ hasText: 'Painting' }).click();
  await expect.poll(() => changes.some(change => change.method === 'DELETE' && change.targetId === '600000000000000000000004')).toBe(true);
  await editor.locator('.constellation-layout-node').filter({ hasText: 'Sculpt' }).click();
  await page.getByRole('status').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(/Connect from Blender Setup/)).toHaveCount(0);
});

test('admin creates branching connections between topic gateways in a discipline', async ({ page }) => {
  const changes: Array<{ method: string; sourceId: string; targetId: string }> = [];
  await installApiFixtures(page, undefined, undefined, undefined, undefined, (method, sourceId, targetId) => {
    changes.push({ method, sourceId, targetId });
  });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  await editor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Connect from here' }).click();
  await expect(page.getByRole('status')).toContainText('Connect from 3D Modeling');
  await editor.locator('.constellation-layout-node').filter({ hasText: 'Materials' }).click();
  await editor.locator('.constellation-layout-node').filter({ hasText: 'VFX' }).click();

  await expect.poll(() => changes.filter(change => change.method === 'POST').length).toBe(2);
  expect(changes.filter(change => change.method === 'POST').map(change => change.targetId)).toEqual([
    '400000000000000000000003',
    '400000000000000000000005'
  ]);
  await expect(page.getByRole('application', { name: 'Game Art visual layout editor' })).toBeVisible();
  await expect(editor.locator('.constellation-layout-lines path')).toHaveCount(
    gameArtSkills.reduce((total, skill) => total + (skill.connections?.length || 0), 0)
  );

  await editor.locator('.constellation-layout-node').filter({ hasText: 'Materials' }).click();
  await editor.locator('.constellation-layout-node').filter({ hasText: 'VFX' }).click();
  await expect.poll(() => changes.filter(change => change.method === 'DELETE').length).toBe(2);
  await page.getByRole('status').getByRole('button', { name: 'Done' }).click();
});

test('admin filters and imports a StarMaster quest into the open topic', async ({ page }) => {
  const importedExternalIds: string[] = [];
  let importedPayload: Record<string, unknown> | undefined;
  let updatedSkillId = '';
  let updatedPayload: Record<string, any> | undefined;
  await installApiFixtures(page, undefined, undefined, (skillId, payload) => {
    updatedSkillId = skillId;
    updatedPayload = payload;
  }, undefined, undefined, (externalQuestId, payload) => {
    importedExternalIds.push(externalQuestId);
    importedPayload = payload;
  });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();

  await page.getByRole('button', { name: 'Import quest' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import quest from StarMaster' });
  await expect(dialog.getByLabel('Discipline')).toHaveValue(gameArtMap._id);
  await expect(dialog.getByLabel('Topic')).toHaveValue(topicMap._id);
  await expect(dialog.getByRole('checkbox', { name: 'Select Create a Soundscape' })).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Select visible' }).check();
  await expect(dialog.locator('.constellation-import-selection-bar')).toContainText('3 selected');
  await dialog.getByRole('button', { name: 'Clear selection' }).click();
  await expect(dialog.locator('.constellation-import-selection-bar')).toContainText('0 selected');
  await page.screenshot({ path: '/tmp/constellation-visual/admin-starmaster-import.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Load more quests' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Select Advanced Lighting' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Filter by tags, 0 selected' }).click();
  await dialog.getByLabel('Search tags').fill('Audio');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Search tags')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Filter by tags, 0 selected' }).click();
  await dialog.getByLabel('Search tags').fill('Audio');
  await dialog.getByLabel('Audio', { exact: true }).check();
  await dialog.getByRole('heading', { name: 'Import quest from StarMaster' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Select Create a Soundscape' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Select Side Challenge' })).toHaveCount(0);
  await expect(dialog.locator('.constellation-import-count')).toHaveText('Showing 1 of 1 quests');
  await dialog.locator('.constellation-import-selected-tags').getByRole('button', { name: /Audio/ }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Select Side Challenge' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Select Imported Modeling Quest' })).toBeVisible();
  await expect(dialog.locator('.constellation-import-item').filter({ hasText: 'Imported Modeling Quest' })).toContainText('Can import again');
  await dialog.getByRole('button', { name: 'Imported before' }).click();
  const repeatableQuest = dialog.getByRole('checkbox', { name: 'Select Imported Modeling Quest' });
  await expect(repeatableQuest).toBeEnabled();
  await repeatableQuest.check();
  await expect(dialog.locator('.constellation-import-selection-bar')).toContainText('1 selected');
  await repeatableQuest.uncheck();
  await dialog.getByRole('button', { name: 'New' }).click();
  await dialog.getByLabel('Filter by quest type').selectOption('SideQuest');
  await expect(dialog.getByRole('checkbox', { name: 'Select Side Challenge' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Select Create a Soundscape' })).toHaveCount(0);
  await dialog.getByLabel('Filter by quest type').selectOption('all');
  await dialog.getByPlaceholder('Search quests').fill('Soundscape');
  await expect(dialog.getByRole('checkbox', { name: 'Select Create a Soundscape' })).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Select Create a Soundscape' }).check();
  await dialog.getByPlaceholder('Search quests').fill('');
  await dialog.getByRole('checkbox', { name: 'Select Side Challenge' }).check();
  await expect(dialog.locator('.constellation-import-selection-bar')).toContainText('2 selected');
  await dialog.getByRole('button', { name: 'Import 2 quests' }).click();

  await expect.poll(() => importedExternalIds).toEqual(['star-master-sound-01', 'star-master-side-01']);
  expect(importedPayload?.constellationMapId).toBe(topicMap._id);
  expect(importedPayload?.externalQuestIds).toEqual(['star-master-sound-01', 'star-master-side-01']);
  const importedNode = page.getByRole('application', { name: '3D Modeling visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: 'Create a Soundscape' });
  await expect(importedNode).toBeVisible();
  await expect(importedNode.locator('.constellation-node-quest-image')).toHaveAttribute('href', 'https://example.com/quest-soundscape.webp');
  await importedNode.locator('.constellation-node-hit-target').dblclick();
  const infoDialog = page.getByRole('dialog', { name: 'Edit quest' });
  await infoDialog.getByRole('tab', { name: 'Details' }).click();
  await expect(infoDialog.getByLabel('Star image URL')).toHaveValue('https://example.com/quest-soundscape.webp');
  await infoDialog.getByLabel('Preview summary').fill('Edited soundscape preview.');
  await infoDialog.getByRole('tab', { name: /Quest steps/ }).click();
  await expect(infoDialog.getByLabel('Step 1 title')).toHaveValue('Record ambience');
  await infoDialog.getByLabel('Step 1 title').fill('Record forest ambience');
  const firstTextBlock = infoDialog.getByLabel('Step 1 content 1 text');
  await firstTextBlock.fill('Capture a clean seamless forest loop.');
  await firstTextBlock.evaluate((textarea: HTMLTextAreaElement) => {
    const start = textarea.value.indexOf('clean');
    textarea.focus();
    textarea.setSelectionRange(start, start + 'clean'.length);
  });
  await firstTextBlock.press('Control+b');
  await expect(firstTextBlock).toHaveValue('Capture a **clean** seamless forest loop.');
  await firstTextBlock.press('Control+z');
  await expect(firstTextBlock).toHaveValue('Capture a clean seamless forest loop.');
  await firstTextBlock.fill('first line\nsecond line');
  await firstTextBlock.evaluate((textarea: HTMLTextAreaElement) => {
    textarea.focus();
    textarea.setSelectionRange(0, textarea.value.length);
  });
  await firstTextBlock.press('Tab');
  await expect(firstTextBlock).toHaveValue('\tfirst line\n\tsecond line');
  await firstTextBlock.press('Control+z');
  await expect(firstTextBlock).toHaveValue('first line\nsecond line');
  await firstTextBlock.evaluate((textarea: HTMLTextAreaElement) => textarea.setSelectionRange(0, textarea.value.length));
  await firstTextBlock.press('Tab');
  await firstTextBlock.press('Shift+Tab');
  await expect(firstTextBlock).toHaveValue('first line\nsecond line');
  await firstTextBlock.fill('Capture a **clean** seamless forest loop.');
  await expect(infoDialog.getByLabel('Step 1 content 2 image')).toHaveValue('https://example.com/ambience-reference.webp');
  const firstStep = infoDialog.locator('.constellation-step-item').first();
  await firstStep.getByRole('button', { name: 'Add text' }).click();
  await infoDialog.getByLabel('Step 1 content 3 text').fill('Balance the ambience beneath dialogue.');
  await firstStep.getByRole('button', { name: 'Add image' }).click();
  await infoDialog.getByLabel('Step 1 content 4 image').fill('https://example.com/mix-reference.webp');
  await page.screenshot({ path: '/tmp/constellation-visual/admin-step-content-blocks.png', fullPage: true });
  await infoDialog.getByRole('button', { name: 'Add step' }).click();
  await infoDialog.getByLabel('Step 2 title').fill('Mix the scene');
  await infoDialog.getByLabel('Step 2 content 1 text').fill('Balance the final soundscape.');
  await infoDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => updatedSkillId).toBe('700000000000000000000009');
  expect(updatedPayload?.nodePreview.imageUrl).toBe('https://example.com/quest-soundscape.webp');
  expect(updatedPayload?.nodePreview.summary).toBe('Edited soundscape preview.');
  expect(updatedPayload?.subQuests).toHaveLength(2);
  expect(updatedPayload?.subQuests[0].title).toBe('Record forest ambience');
  expect(updatedPayload?.subQuests[0].descriptionParts).toEqual([
    { type: 'Text', content: 'Capture a **clean** seamless forest loop.' },
    { type: 'Image', content: 'https://example.com/ambience-reference.webp' },
    { type: 'Text', content: 'Balance the ambience beneath dialogue.' },
    { type: 'Image', content: 'https://example.com/mix-reference.webp' }
  ]);
  expect(updatedPayload?.subQuests[0].description).toBe('Capture a **clean** seamless forest loop.\nBalance the ambience beneath dialogue.');

  const importedIndex = allSkills.findIndex(candidate => candidate._id === '700000000000000000000009');
  if (importedIndex >= 0) allSkills.splice(importedIndex, 1);
  const topicIndex = topicSkills.findIndex(candidate => candidate._id === '700000000000000000000009');
  if (topicIndex >= 0) topicSkills.splice(topicIndex, 1);
  const secondImportedIndex = allSkills.findIndex(candidate => candidate._id === '700000000000000000000010');
  if (secondImportedIndex >= 0) allSkills.splice(secondImportedIndex, 1);
  const secondTopicIndex = topicSkills.findIndex(candidate => candidate._id === '700000000000000000000010');
  if (secondTopicIndex >= 0) topicSkills.splice(secondTopicIndex, 1);
});

test('admin constellation editor remains usable without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByLabel('Admin section', { exact: true }).selectOption('skilltree');
  await expect(page.getByRole('application', { name: 'Programming visual layout editor' })).toBeVisible();

  const overflow = await page.locator('.constellation-layout-editor').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await expect(page.locator('.constellation-admin-inspector')).toHaveCount(0);
  await page.getByRole('button', { name: 'Actions' }).click();
  await expect(page.getByRole('button', { name: 'Create star' })).toBeVisible();
  const canvasHeight = await page.locator('.constellation-layout-canvas-wrap').evaluate(element => element.getBoundingClientRect().height);
  expect(canvasHeight).toBeGreaterThanOrEqual(500);
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();
  await page.getByRole('button', { name: 'Import quest' }).click();
  const importDialog = page.getByRole('dialog', { name: 'Import quest from StarMaster' });
  await expect(importDialog.getByRole('checkbox', { name: 'Select Create a Soundscape' })).toBeVisible();
  const dialogBounds = await importDialog.evaluate(element => element.getBoundingClientRect());
  expect(dialogBounds.width).toBeLessThanOrEqual(390);
  await expect(importDialog.getByLabel('Search quests')).toBeVisible();
  await expect(importDialog.getByLabel('Filter by quest type')).toBeVisible();
  await page.screenshot({ path: '/tmp/constellation-visual/admin-layout-mobile.png', fullPage: true });
});

test('@audit progression roles and path semantics remain independently readable', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).hover();
  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.locator('.constellation-topic-layer')).toBeVisible();
  await page.waitForTimeout(650);

  const nodeSemantics = await page.locator('.constellation-topic-layer .constellation-node').evaluateAll(nodes => (
    nodes.map(node => ({
      label: node.getAttribute('aria-label'),
      className: node.getAttribute('class'),
      color: getComputedStyle(node).color,
      starPath: node.querySelector('.constellation-node-star')?.getAttribute('d') || ''
    }))
  ));
  const connections = await page.locator('.constellation-topic-layer .constellation-lines path').evaluateAll(paths => (
    paths.map(path => ({
      markerEnd: path.getAttribute('marker-end'),
      className: path.getAttribute('class'),
      stroke: getComputedStyle(path).stroke
    }))
  ));
  const boss = nodeSemantics.find(node => node.className?.includes('role-boss'));
  const capstone = nodeSemantics.find(node => node.className?.includes('role-capstone'));
  const lesson = nodeSemantics.find(node => node.className?.includes('role-lesson'));

  await recordAudit(browserName, 'role-and-path-semantics', {
    nodeSemantics,
    connections,
    bossUsesUniqueGeometry: Boolean(boss && lesson && boss.starPath !== lesson.starPath),
    capstoneUsesUniqueGeometry: Boolean(capstone && lesson && capstone.starPath !== lesson.starPath),
    roleIncludedInAccessibleName: nodeSemantics.every(node => /lesson|boss|capstone/i.test(node.label || '')),
    requestedArrowheadsRendered: connections.length > 0 && connections.every(connection => Boolean(connection.markerEnd)),
    pathProgressionClassesRendered: connections.some(connection => /unlocked|available|locked|complete/.test(connection.className || ''))
  });
  expect(Boolean(boss && lesson && boss.starPath !== lesson.starPath)).toBe(true);
  expect(Boolean(capstone && lesson && capstone.starPath !== lesson.starPath)).toBe(true);
  expect(nodeSemantics.every(node => /lesson|boss|capstone/i.test(node.label || ''))).toBe(true);
  expect(connections.every(connection => Boolean(connection.markerEnd))).toBe(true);
  expect(connections.some(connection => /unlocked|available|locked|complete/.test(connection.className || ''))).toBe(true);
  await page.screenshot({ path: `/tmp/constellation-audit/${browserName}-role-and-path-semantics.png`, fullPage: true });
});

test('@audit mobile preview preserves spatial context and touch controls', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();

  const backBox = await page.getByRole('button', { name: 'Back' }).boundingBox();
  const zoomBoxes = await page.locator('.constellation-camera-controls button').evaluateAll(buttons => (
    buttons.map(button => {
      const bounds = button.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    })
  ));
  const modelingNode = page.locator('.constellation-node').filter({ hasText: '3D Modeling' });
  await modelingNode.click();
  await expect(page.locator('.constellation-info-panel')).toBeVisible();
  await page.waitForTimeout(220);

  const nodeBox = await modelingNode.boundingBox();
  const hitTargetBox = await modelingNode.locator('.constellation-node-hit-target').boundingBox();
  const panelBox = await page.locator('.constellation-info-panel').boundingBox();
  const labelBoxes = await page.locator('.constellation-discipline-layer .constellation-node-label').evaluateAll(labels => (
    labels.map(label => {
      const bounds = label.getBoundingClientRect();
      return { text: label.textContent, width: bounds.width, height: bounds.height };
    })
  ));
  const overlap = nodeBox && panelBox
    ? Math.max(0, Math.min(nodeBox.x + nodeBox.width, panelBox.x + panelBox.width) - Math.max(nodeBox.x, panelBox.x))
      * Math.max(0, Math.min(nodeBox.y + nodeBox.height, panelBox.y + panelBox.height) - Math.max(nodeBox.y, panelBox.y))
    : 0;
  const nodeArea = nodeBox ? nodeBox.width * nodeBox.height : 0;
  const cameraControlsDisplay = await page.locator('.constellation-camera-controls').evaluate(element => getComputedStyle(element).display);
  const panelButtons = await page.locator('.constellation-info-panel button').evaluateAll(buttons => buttons.map(button => ({
    text: button.textContent?.trim() || '',
    ariaLabel: button.getAttribute('aria-label') || ''
  })));
  const viewPathBox = await page.getByRole('button', { name: 'View Path' }).boundingBox();

  await recordAudit(browserName, 'mobile-spatial-context', {
    viewport: { width: 390, height: 844 },
    selectedNodeBox: nodeBox,
    hitTargetBox,
    previewPanelBox: panelBox,
    selectedNodeOverlapRatio: nodeArea ? overlap / nodeArea : null,
    labelBoxes,
    backTarget: backBox,
    zoomTargets: zoomBoxes,
    allPrimaryTargetsAtLeast44: Boolean(backBox && backBox.width >= 44 && backBox.height >= 44 && zoomBoxes.every(box => box.width >= 44 && box.height >= 44)),
    cameraControlsDisplay,
    panelButtons,
    hasExplicitCloseControl: panelButtons.some(button => /close|dismiss/i.test(`${button.text} ${button.ariaLabel}`))
  });
  expect(nodeArea ? overlap / nodeArea : 1).toBeLessThanOrEqual(0.1);
  expect(Boolean(hitTargetBox && hitTargetBox.width >= 44 && hitTargetBox.height >= 44)).toBe(true);
  expect(Boolean(viewPathBox && viewPathBox.y >= 0 && viewPathBox.y + viewPathBox.height <= await page.evaluate(() => document.documentElement.scrollHeight))).toBe(true);
  expect(Boolean(backBox && backBox.width >= 44 && backBox.height >= 44 && zoomBoxes.every(box => box.width >= 44 && box.height >= 44))).toBe(true);
  expect(panelButtons.some(button => /close|dismiss/i.test(`${button.text} ${button.ariaLabel}`))).toBe(true);
  await page.screenshot({ path: `/tmp/constellation-audit/${browserName}-mobile-spatial-context.png`, fullPage: true });
});

test('@audit locked visuals remain readable and 200 percent zoom keeps navigation discoverable', async ({ page }) => {
  await installApiFixtures(page);
  await page.setViewportSize({ width: 640, height: 700 });
  await page.goto('mainmenu');
  await page.evaluate(() => { document.body.style.zoom = '2'; });

  const constellation = page.locator('.constellation-overview');
  await constellation.scrollIntoViewIfNeeded();
  await expect(constellation.locator('.constellation-overview-item').first()).toBeVisible();
  await expect(constellation.locator('.constellation-overview-pager')).toBeVisible();

  await page.evaluate(() => { document.body.style.zoom = '1'; });
  await page.getByRole('button', { name: /Game Art/ }).click();
  const contrast = await page.locator('.constellation-focus').evaluate(shell => {
    const parse = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (rgb: number[]) => rgb
      .map(channel => channel / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const background = luminance(parse(getComputedStyle(shell).getPropertyValue('--constellation-bg')));
    const locked = luminance(parse(getComputedStyle(shell).getPropertyValue('--constellation-locked')));
    return (Math.max(background, locked) + 0.05) / (Math.min(background, locked) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
});

test('@audit camera manipulation, restoration, and reduced motion', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();

  const canvas = page.getByRole('application', { name: 'Game Art constellation map' });
  const camera = canvas.locator('.constellation-camera');
  const modelingNode = canvas.getByRole('button', { name: /3D Modeling/ });
  const beforeZoom = await modelingNode.boundingBox();
  expect(beforeZoom).not.toBeNull();
  await modelingNode.hover();
  await page.mouse.wheel(0, -360);
  await page.waitForTimeout(450);
  const afterZoom = await modelingNode.boundingBox();
  const pointerDrift = beforeZoom && afterZoom ? Math.hypot(
    (beforeZoom.x + beforeZoom.width / 2) - (afterZoom.x + afterZoom.width / 2),
    (beforeZoom.y + beforeZoom.height / 2) - (afterZoom.y + afterZoom.height / 2)
  ) : null;

  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  await page.mouse.move(canvasBox!.x + canvasBox!.width * 0.72, canvasBox!.y + canvasBox!.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(canvasBox!.x + canvasBox!.width * 0.72 + 70, canvasBox!.y + canvasBox!.height * 0.25 + 35, { steps: 4 });
  const transitionDuringDrag = await camera.evaluate(element => ({
    duration: getComputedStyle(element).transitionDuration,
    timing: getComputedStyle(element).transitionTimingFunction
  }));
  await page.mouse.up();
  const disciplineCameraBeforeTopic = await camera.getAttribute('transform');

  await modelingNode.focus();
  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.locator('.constellation-focus')).toHaveClass(/is-topic-active/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Game Art' })).toBeVisible();
  const disciplineCameraAfterBack = await camera.getAttribute('transform');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await modelingNode.focus();
  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.locator('.constellation-topic-layer')).toBeVisible();
  const reducedMotion = await page.locator('.constellation-topic-layer').evaluate(element => ({
    duration: getComputedStyle(element).transitionDuration,
    delay: getComputedStyle(element).transitionDelay,
    property: getComputedStyle(element).transitionProperty
  }));

  await recordAudit(browserName, 'camera-and-motion', {
    pointerDriftPixels: pointerDrift,
    pointerAnchorPreserved: pointerDrift !== null && pointerDrift <= 1,
    transitionDuringDrag,
    directManipulationHasNoEasing: transitionDuringDrag.duration === '0s',
    disciplineCameraBeforeTopic,
    disciplineCameraAfterBack,
    cameraRestoredAfterBack: disciplineCameraBeforeTopic === disciplineCameraAfterBack,
    reducedMotion,
    reducedMotionHasNoDelay: reducedMotion.delay.split(',').every(value => value.trim() === '0s')
  });
  expect(pointerDrift).not.toBeNull();
  expect(pointerDrift!).toBeLessThanOrEqual(1);
  expect(transitionDuringDrag.duration).toBe('0s');
  expect(disciplineCameraAfterBack).toBe(disciplineCameraBeforeTopic);
  expect(reducedMotion.delay.split(',').every(value => value.trim() === '0s')).toBe(true);
});

test('@audit keyboard semantics, focus restoration, and main navigation', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');

  const mainDestinations = await page.locator('.nav-item').evaluateAll(items => items.map(item => ({
    text: item.textContent?.trim(),
    tagName: item.tagName,
    role: item.getAttribute('role'),
    tabIndex: (item as HTMLElement).tabIndex
  })));
  const duplicateConstellationHeadings = await page.getByRole('heading', { name: 'Skill Constellations' }).count();
  await page.getByRole('button', { name: /Game Art/ }).click();
  const modelingNode = page.getByRole('application', { name: 'Game Art constellation map' }).getByRole('button', { name: /3D Modeling/ });
  const nodeAccessibleName = await modelingNode.getAttribute('aria-label');
  await modelingNode.focus();
  await modelingNode.press('Enter');
  await page.getByRole('button', { name: 'View Path' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Game Art' })).toBeVisible();
  const focusAfterBack = await page.evaluate(() => ({
    tagName: document.activeElement?.tagName,
    ariaLabel: document.activeElement?.getAttribute('aria-label'),
    text: document.activeElement?.textContent?.trim().slice(0, 80)
  }));

  await recordAudit(browserName, 'keyboard-and-semantics', {
    mainDestinations,
    mainDestinationsKeyboardOperable: mainDestinations.every(item => ['BUTTON', 'A'].includes(item.tagName) || (item.role === 'button' && item.tabIndex >= 0)),
    duplicateConstellationHeadings,
    nodeAccessibleName,
    nodeNameIncludesRole: /lesson|boss|capstone|topic/i.test(nodeAccessibleName || ''),
    focusAfterBack,
    focusReturnedToGateway: /3D Modeling/i.test(`${focusAfterBack.ariaLabel || ''} ${focusAfterBack.text || ''}`)
  });
  expect(mainDestinations.every(item => ['BUTTON', 'A'].includes(item.tagName) || (item.role === 'button' && item.tabIndex >= 0))).toBe(true);
  expect(duplicateConstellationHeadings).toBe(1);
  expect(/topic/i.test(nodeAccessibleName || '')).toBe(true);
  expect(/3D Modeling/i.test(`${focusAfterBack.ariaLabel || ''} ${focusAfterBack.text || ''}`)).toBe(true);
});

test('@audit admin dirty-exit and modal keyboard protection', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();

  await page.getByRole('button', { name: 'Create discipline' }).click();
  const modal = page.locator('.constellation-admin-modal');
  await expect(modal).toBeVisible();
  const modalInitial = await modal.evaluate(element => ({
    role: element.getAttribute('role'),
    ariaModal: element.getAttribute('aria-modal'),
    containsFocus: element.contains(document.activeElement)
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  const modalClosedByEscape = !(await modal.isVisible());
  if (!modalClosedByEscape) await modal.getByRole('button', { name: /Cancel/ }).click();

  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const modelingNode = editor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' });
  const modelingBox = await modelingNode.locator('.constellation-node-core').boundingBox();
  expect(modelingBox).not.toBeNull();
  await page.mouse.move(modelingBox!.x + modelingBox!.width / 2, modelingBox!.y + modelingBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(modelingBox!.x + modelingBox!.width / 2 + 20, modelingBox!.y + modelingBox!.height / 2, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();

  let dialogShown = false;
  page.once('dialog', async dialog => {
    dialogShown = true;
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: /Dashboard/ }).click();
  await page.waitForTimeout(100);
  const legacyVisible = await page.locator('.quest-tree-editor').isVisible();
  const dirtyStatusAfterReturn = await page.locator('.constellation-layout-dirty-count').textContent();

  await recordAudit(browserName, 'admin-work-protection', {
    modalInitial,
    modalClosedByEscape,
    modalKeyboardManaged: modalInitial.role === 'dialog' && modalInitial.ariaModal === 'true' && modalInitial.containsFocus && modalClosedByEscape,
    dirtyExitDialogShown: dialogShown,
    legacyVisible,
    dirtyStatusAfterReturn,
    dirtyDraftPreserved: /unsaved/i.test(dirtyStatusAfterReturn || '')
  });
  expect(modalInitial.role).toBe('dialog');
  expect(modalInitial.ariaModal).toBe('true');
  expect(modalInitial.containsFocus).toBe(true);
  expect(modalClosedByEscape).toBe(true);
  expect(dialogShown).toBe(true);
  expect(legacyVisible).toBe(false);
  expect(dirtyStatusAfterReturn).toMatch(/unsaved/i);
});

test('@audit constellation API failure remains explicit and recoverable', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.route(/\/api\/constellation-maps\?.*scope=discipline/, route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ success: false, error: 'Audit fixture outage' })
  }));
  await page.goto('mainmenu');
  await page.waitForTimeout(250);

  const constellationShellCount = await page.locator('.constellation-shell').count();
  const legacyTreeVisible = await page.locator('.quest-tree-container').isVisible();
  const retryButtonCount = await page.getByRole('button', { name: /retry/i }).count();
  const visibleErrors = await page.locator('[role="alert"], [role="status"]').allTextContents();

  await recordAudit(browserName, 'failure-recovery', {
    constellationShellCount,
    legacyTreeVisible,
    retryButtonCount,
    visibleErrors,
    failureExplicit: visibleErrors.some(text => /constellation|unavailable|error|retry/i.test(text)),
    retryAvailable: retryButtonCount > 0,
    silentlyFallsBackToLegacy: constellationShellCount === 0 && legacyTreeVisible
  });
  expect(legacyTreeVisible).toBe(false);
  expect(retryButtonCount).toBeGreaterThan(0);
  expect(visibleErrors.some(text => /constellation|unavailable|error|retry/i.test(text))).toBe(true);
  await page.screenshot({ path: `/tmp/constellation-audit/${browserName}-failure-recovery.png`, fullPage: true });
});

test('@audit pending and locked progression states remain explainable', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.route('http://localhost:3099/api/mainmenu/bootstrap', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mainMenuBootstrap({
      questProgress: {
        completedSteps: [],
        completedQuests: [],
        pendingApprovalSkillIds: [topicSkills[1]._id]
      }
    }))
  }));
  const priorPrerequisites = gameArtSkills[3].prerequisites;
  gameArtSkills[3].prerequisites = ['ffffffffffffffffffffffff'];

  try {
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    const lockedGateway = page.locator('.constellation-node').filter({ hasText: 'Animation' });
    await lockedGateway.click();
    const lockedPanel = page.locator('.constellation-info-panel');
    await expect(lockedPanel).toBeVisible();
    const lockedPanelText = await lockedPanel.innerText();
    const lockedActions = await lockedPanel.getByRole('button').allTextContents();
    const lockedActionDisabled = await lockedPanel.getByRole('button', { name: 'Prerequisites required' }).isDisabled();

    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
    await page.getByRole('button', { name: 'View Path' }).click();
    await expect(page.locator('.constellation-topic-layer')).toBeVisible();
    const pendingNode = page.locator('.constellation-topic-layer .constellation-node').filter({ hasText: 'Blender Basic' });
    const pendingSemantics = await pendingNode.evaluate(node => ({
      className: node.getAttribute('class'),
      ariaLabel: node.getAttribute('aria-label'),
      text: node.textContent
    }));

    await recordAudit(browserName, 'progression-explainability', {
      lockedPanelText,
      lockedActions,
      lockedExplainsPrerequisite: /prerequisite|requires|unlock .*first/i.test(lockedPanelText),
      lockedActionDisabled,
      pendingSemantics,
      pendingStateRendered: /pending/i.test(`${pendingSemantics.className} ${pendingSemantics.ariaLabel} ${pendingSemantics.text}`)
    });
    expect(/prerequisite|requires|complete .*first/i.test(lockedPanelText)).toBe(true);
    expect(lockedActionDisabled).toBe(true);
    expect(/pending/i.test(`${pendingSemantics.className} ${pendingSemantics.ariaLabel} ${pendingSemantics.text}`)).toBe(true);
  } finally {
    gameArtSkills[3].prerequisites = priorPrerequisites;
  }
});

test('@audit topic viewport owns its focused map geometry', async ({ page, browserName }) => {
  const priorViewport = topicMap.viewport;
  topicMap.viewport = { width: 900, height: 1400, minZoom: 0.6, maxZoom: 1.4 };
  try {
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
    await page.getByRole('button', { name: 'View Path' }).click();
    await expect(page.locator('.constellation-topic-layer')).toBeVisible();

    const canvas = page.locator('.constellation-canvas');
    const topicTransform = await page.locator('.constellation-topic-layer').evaluate(node => node.parentElement?.getAttribute('transform'));
    const viewBox = await canvas.getAttribute('viewBox');
    const cameraBeforeZoomOut = await page.locator('.constellation-camera').getAttribute('transform');
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    const cameraAfterZoomOut = await page.locator('.constellation-camera').getAttribute('transform');

    await recordAudit(browserName, 'topic-viewport-ownership', {
      disciplineViewport: gameArtMap.viewport,
      topicViewport: topicMap.viewport,
      canvasViewBox: viewBox,
      topicTransform,
      cameraBeforeZoomOut,
      cameraAfterZoomOut,
      usesTopicViewBox: viewBox === `0 0 ${topicMap.viewport.width} ${topicMap.viewport.height}`,
      avoidsHardcodedTopicScale: !/scale\(0\.72\)/.test(topicTransform || '')
    });
    expect(viewBox).toBe(`0 0 ${topicMap.viewport.width} ${topicMap.viewport.height}`);
    expect(topicTransform).not.toMatch(/scale\(0\.72\)/);
    await page.screenshot({ path: `/tmp/constellation-audit/${browserName}-topic-viewport-ownership.png`, fullPage: true });
  } finally {
    topicMap.viewport = priorViewport;
  }
});

test('@audit quest detail modal provides keyboard dialog behavior', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
  await page.getByRole('button', { name: 'View Path' }).click();
  const origin = page.locator('.constellation-topic-layer .constellation-node').filter({ hasText: 'Blender Setup' });
  await origin.focus();
  await origin.press('Enter');

  const modal = page.locator('.guild-selection-modal').first();
  await expect(modal).toBeVisible();
  const initial = await modal.evaluate(node => ({
    role: node.getAttribute('role'),
    ariaModal: node.getAttribute('aria-modal'),
    ariaLabelledby: node.getAttribute('aria-labelledby'),
    containsFocus: node.contains(document.activeElement),
    transitionDuration: getComputedStyle(node).transitionDuration,
    animationName: getComputedStyle(node).animationName
  }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const closedByEscape = !(await modal.isVisible());
  if (!closedByEscape) {
    const closeButton = modal.getByRole('button', { name: /close|cancel/i }).last();
    if (await closeButton.count()) await closeButton.click();
    else await page.locator('.guild-selection-modal-overlay').first().click({ position: { x: 4, y: 4 } });
  }
  const focusAfterClose = await page.evaluate(() => ({
    ariaLabel: document.activeElement?.getAttribute('aria-label'),
    text: document.activeElement?.textContent?.trim().slice(0, 80)
  }));

  await recordAudit(browserName, 'quest-modal-accessibility', {
    initial,
    closedByEscape,
    focusAfterClose,
    focusReturnedToOrigin: /Blender Setup/i.test(`${focusAfterClose.ariaLabel || ''} ${focusAfterClose.text || ''}`),
    hasDialogSemantics: initial.role === 'dialog' && initial.ariaModal === 'true' && Boolean(initial.ariaLabelledby),
    hasEntryMotion: initial.transitionDuration !== '0s' || initial.animationName !== 'none'
  });
  expect(initial.role).toBe('dialog');
  expect(initial.ariaModal).toBe('true');
  expect(initial.ariaLabelledby).toBeTruthy();
  expect(initial.containsFocus).toBe(true);
  expect(closedByEscape).toBe(true);
  expect(/Blender Setup/i.test(`${focusAfterClose.ariaLabel || ''} ${focusAfterClose.text || ''}`)).toBe(true);
});

test('player quest details render manually entered bold markdown and Discord-style code blocks', async ({ page }) => {
  const targetSkill = topicSkills[0];
  const originalDescription = targetSkill.description;
  targetSkill.description = [
    'Learn **Blender Setup** through a guided production quest.',
    '```js',
    'const label = "**keep markers**";',
    '  console.log(label);',
    '```'
  ].join('\n');

  try {
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
    await page.getByRole('button', { name: 'View Path' }).click();
    await page.locator('.constellation-topic-layer .constellation-node').filter({ hasText: 'Blender Setup' }).click();

    const modal = page.getByRole('dialog', { name: 'Blender Setup' });
    await expect(modal.locator('.quest-detail strong')).toHaveText('Blender Setup');
    const codeBlock = modal.locator('.quest-code-block');
    await expect(codeBlock.locator('.quest-code-language')).toHaveText('js');
    await expect(codeBlock.locator('code')).toHaveText('const label = "**keep markers**";\n  console.log(label);');
    await expect(codeBlock.locator('strong')).toHaveCount(0);
  } finally {
    targetSkill.description = originalDescription;
  }
});

test('@audit overview scales from four to six disciplines across viewports', async ({ page, browserName }) => {
  const extras = [
    map('100000000000000000000004', 'Narrative Design and Interactive Storytelling', 'narrative-design', 3),
    map('100000000000000000000005', 'Production', 'production', 4),
    map('100000000000000000000006', 'Quality Assurance', 'quality-assurance', 5)
  ];
  const extraSkills = extras.flatMap((extraMap, index) => [
    skill(`70000000000000000000000${index + 1}`, `${extraMap.name} Foundations`, extraMap._id, 800, 280, 'topic-gateway')
  ]);
  allMaps.push(...extras);
  allSkills.push(...extraSkills);
  extras.forEach((extraMap, index) => { mapSkills[extraMap._id] = [extraSkills[index]]; });

  try {
    await installApiFixtures(page);
    const results: Array<Record<string, unknown>> = [];
    for (const viewportSize of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewportSize);
      await page.goto('mainmenu');
      await expect(page.locator('.constellation-overview-item')).toHaveCount(6);
      const grid = page.locator('.constellation-overview-grid');
      const overflow = await grid.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }));
      const titles = await page.locator('.constellation-overview-title').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { text: node.textContent, width: box.width, height: box.height, scrollWidth: (node as HTMLElement).scrollWidth, scrollHeight: (node as HTMLElement).scrollHeight };
      }));
      const visibleCards = await page.locator('.constellation-overview-item').evaluateAll(nodes => nodes.filter(node => {
        const box = node.getBoundingClientRect();
        return box.right > 0 && box.left < innerWidth && box.bottom > 0 && box.top < innerHeight;
      }).length);
      const positionIndicators = await page.locator('[aria-label*="position" i], [aria-label*="page" i], .constellation-pagination, .constellation-pager').count();
      results.push({ viewport: viewportSize, overflow, titles, visibleCards, positionIndicators });
      await page.screenshot({ path: `/tmp/constellation-audit/${browserName}-six-disciplines-${viewportSize.width}x${viewportSize.height}.png`, fullPage: true });
    }
    await recordAudit(browserName, 'discipline-scale', { disciplineCount: 6, results });
    expect(results.filter(result => (result.viewport as { width: number }).width <= 768).every(result => Number(result.positionIndicators) > 0)).toBe(true);
    expect(results.find(result => (result.viewport as { width: number }).width === 320)?.visibleCards).toBeGreaterThan(0);
  } finally {
    allMaps.splice(allMaps.length - extras.length, extras.length);
    allSkills.splice(allSkills.length - extraSkills.length, extraSkills.length);
    extras.forEach(extraMap => { delete mapSkills[extraMap._id]; });
  }
});

test('@audit preview media failure has a meaningful fallback', async ({ page, browserName }) => {
  const preview = gameArtSkills[1].nodePreview as typeof gameArtSkills[1]['nodePreview'] & { imageUrl?: string };
  const priorImageUrl = preview.imageUrl;
  preview.imageUrl = 'http://localhost:3099/audit-broken-preview.png';
  try {
    await installApiFixtures(page);
    await page.route('http://localhost:3099/audit-broken-preview.png', route => route.fulfill({ status: 404, body: '' }));
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
    const media = page.locator('.constellation-preview-media');
    await expect(media).toBeVisible();
    const mediaState = await media.evaluate(element => {
      const image = element.querySelector('img');
      return {
        imagePresent: Boolean(image),
        imageComplete: image?.complete,
        naturalWidth: image?.naturalWidth,
        text: element.textContent?.trim(),
        ariaLabel: element.getAttribute('aria-label')
      };
    });
    await recordAudit(browserName, 'preview-media-failure', {
      mediaState,
      meaningfulFallbackVisible: Boolean(mediaState.text || mediaState.ariaLabel || (mediaState.naturalWidth || 0) > 0)
    });
    expect(Boolean(mediaState.text || mediaState.ariaLabel || (mediaState.naturalWidth || 0) > 0)).toBe(true);
    await page.screenshot({ path: `/tmp/constellation-audit/${browserName}-preview-media-failure.png`, fullPage: true });
  } finally {
    if (priorImageUrl) preview.imageUrl = priorImageUrl;
    else delete preview.imageUrl;
  }
});

test('@audit topic loading blocks conflicting map manipulation', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.route(/\/api\/constellation-maps\?.*gatewaySkillId=/, async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, maps: [topicMap], pagination: { limit: 1, nextCursor: null } })
    });
  });
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
  const camera = page.locator('.constellation-camera');
  const before = await camera.getAttribute('transform');
  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.getByRole('button', { name: 'Opening...' })).toBeVisible();
  const controlsVisible = await page.locator('.constellation-camera-controls').isVisible();
  const controlsDisabled = await page.locator('.constellation-camera-controls button').evaluateAll(buttons => (
    buttons.every(button => (button as HTMLButtonElement).disabled)
  ));
  await page.locator('.constellation-canvas').dispatchEvent('wheel', { deltaY: -360, clientX: 500, clientY: 500 });
  const during = await camera.getAttribute('transform');
  await expect(page.locator('.constellation-topic-layer')).toBeVisible();

  await recordAudit(browserName, 'loading-input-safety', {
    cameraBeforeLoading: before,
    cameraDuringLoading: during,
    controlsVisibleDuringLoading: controlsVisible,
    controlsDisabledDuringLoading: controlsDisabled,
    conflictingInputAccepted: before !== during
  });
  expect(controlsDisabled).toBe(true);
  expect(during).toBe(before);
});
