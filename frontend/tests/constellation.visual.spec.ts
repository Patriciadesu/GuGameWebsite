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
const armSilhouetteGuide = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iaXNvLTg4NTktMSI/Pg0KPCEtLSBVcGxvYWRlZCB0bzogU1ZHIFJlcG8sIHd3dy5zdmdyZXBvLmNvbSwgR2VuZXJhdG9yOiBTVkcgUmVwbyBNaXhlciBUb29scyAtLT4NCjxzdmcgaGVpZ2h0PSI4MDBweCIgd2lkdGg9IjgwMHB4IiB2ZXJzaW9uPSIxLjEiIGlkPSJDYXBhXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3d3LnczLm9yZy8xOTk5L3hsaW5rIiANCgl2aWV3Qm94PSIwIDAgNTAuNDYzIDUwLjQ2MyIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+DQo8Zz4NCgk8Zz4NCgkJPHBhdGggc3R5bGU9ImZpbGw6IzAxMDAwMjsiIGQ9Ik00Ny45MjMsMjkuNjk0YzAuMDIxLTAuNjAxLTAuNTE2LTEuMDYzLTAuOTAxLTEuNTE1Yy0wLjY3Ni0yLjczMy0yLjAxNi01Ljg2NC0zLjk2MS04Ljk3MQ0KCQkJQzM5Ljk0MiwxNC4yMywzMS42ODgsNi4yMDQsMjguNTUzLDQuOTY2Yy0wLjE1OC0wLjA2Mi0wLjI5OS0wLjA5Ny0wLjQyOS0wLjEyNmMtMC4zMTMtMS4wMTMtMC40NzktMS43MDgtMS42OTgtMi41MjENCgkJCWMtMy4zNTQtMi4yMzYtNy4wOTktMi44NjYtOS41NzgtMS44NDNjLTIuNDgxLDEuMDIzLTMuODU5LDYuNjg3LTEuMTksOC42MjVjMi41NDYsMS44NTcsNy41ODMtMS44ODgsOS4xOTUsMC41MDkNCgkJCWMxLjYwOSwyLjM5NiwzLjM4NiwxMC4zNzQsNi4zMzgsMTUuNDczYy0wLjc0Ni0wLjEwMi0xLjUxNC0wLjE1Ni0yLjMwNy0wLjE1NmMtMy40MDYsMC02LjQ2NywwLjk5OC04LjYzLDIuNTkzDQoJCQljLTEuODUtMi44ODctNS4wOC00LjgwNi04Ljc2NC00LjgwNmMtMy44MiwwLTcuMTQxLDIuMDY0LTguOTUsNS4xM3YyMi42MTloNC44NzlsMS4wNDItMS44NDkNCgkJCWMzLjM1NC0xLjI4Nyw3LjMyLTQuNjA3LDEwLjA3Ni04LjE0N0MyOS41NTEsNDQuNzg5LDQ3LjY3NiwzNi43ODksNDcuOTIzLDI5LjY5NHoiLz4NCgk8L2c+DQo8L2c+DQo8L3N2Zz4=';
const map = (id: string, name: string, slug: string, displayOrder: number) => ({
  _id: id,
  name,
  slug,
  description: `${name} learning paths`,
  scope: 'discipline',
  displayOrder,
  isActive: true,
  level: 1,
  visualTheme: theme,
  viewport
});

const programmingMap = map('100000000000000000000001', 'Programming', 'programming', 0);
const unityMap = map('100000000000000000000002', 'Unity Development', 'unity-development', 1);
const gameArtMap = map('100000000000000000000003', 'Game Art', 'game-art', 2);
const mainJourneyMap = {
  ...map('100000000000000000000004', 'Main Journey', 'main-journey', 0),
  constellationType: 'main'
};

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

const mainJourneySkills = [
  skill('410000000000000000000001', 'Arrival', mainJourneyMap._id, 220, 450, 'lesson', ['410000000000000000000002']),
  skill('410000000000000000000002', 'First Trial', mainJourneyMap._id, 600, 450, 'lesson', ['410000000000000000000003']),
  skill('410000000000000000000003', 'Guild Path', mainJourneyMap._id, 980, 450, 'lesson', ['410000000000000000000004']),
  skill('410000000000000000000004', 'Starbound', mainJourneyMap._id, 1360, 450, 'capstone')
].map((quest, index) => ({
  ...quest,
  mainQuestLevel: index + 1,
  subQuests: [{
    externalId: `main-requirement-${index + 1}`,
    title: `Complete Level ${index + 1} evidence`,
    description: 'Prepare your evidence before submitting for review.'
  }]
}));

const mainTrialMap = {
  ...map('510000000000000000000001', 'First Trial Path', 'main-first-trial', 0),
  scope: 'topic',
  constellationType: 'main',
  parentMapId: mainJourneyMap._id,
  gatewaySkillId: mainJourneySkills[1]._id
};

const mainTrialSkills = [
  skill('610000000000000000000001', 'Meet the Guild', mainTrialMap._id, 520, 450),
  skill('610000000000000000000002', 'Choose a Calling', mainTrialMap._id, 980, 450)
];

const topicMap = {
  ...map('500000000000000000000001', '3D Modeling', 'game-art-3d-modeling', 0),
  scope: 'topic',
  parentMapId: gameArtMap._id,
  gatewaySkillId: '400000000000000000000002',
  visualTheme: { ...theme, backgroundAssetUrl: armSilhouetteGuide }
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

const allMaps = [mainJourneyMap, mainTrialMap, programmingMap, unityMap, gameArtMap, topicMap];
const allSkills = [...mainJourneySkills, ...mainTrialSkills, ...programmingSkills, ...unitySkills, ...gameArtSkills, ...topicSkills];
const mapSkills: Record<string, typeof allSkills> = {
  [mainJourneyMap._id]: mainJourneySkills,
  [mainTrialMap._id]: mainTrialSkills,
  [programmingMap._id]: programmingSkills,
  [unityMap._id]: unitySkills,
  [gameArtMap._id]: gameArtSkills,
  [topicMap._id]: topicSkills
};

const mainMenuBootstrap = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  skills: allSkills,
  userStats: { assetPoints: 500, assetPointName: 'AP', voiceMinutesToday: 12, totalVoiceMinutes: 300 },
  unlockedSkills: [mainJourneySkills[0]._id, programmingSkills[0]._id, unitySkills[0]._id, gameArtSkills[0]._id],
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
  authRole: 'admin' | 'super-admin' = 'super-admin',
  onBatchUpdate?: (mapId: string, payload: { skillIds: string[]; changes: Record<string, unknown> }) => void
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
      email: 'tester@example.com', isAdmin: true, role: authRole, level: 1, guildId: 'visual-guild'
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
    const batchUpdateMatch = path.match(/^\/api\/constellation-maps\/([a-f0-9]{24})\/skills\/batch$/);
    if (batchUpdateMatch && route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON() as { skillIds: string[]; changes: Record<string, unknown> };
      onBatchUpdate?.(batchUpdateMatch[1], payload);
      payload.skillIds.forEach(skillId => Object.assign(allSkills.find(candidate => candidate._id === skillId) || {}, payload.changes));
      return json({ success: true, updatedCount: payload.skillIds.length });
    }
    if (path === '/api/constellation-maps') {
      if (route.request().method() === 'POST') {
        const payload = route.request().postDataJSON() as Record<string, unknown>;
        onMapCreate?.(payload);
        return json({ success: true, map: { ...payload, _id: '700000000000000000000002' } });
      }
      const gatewaySkillId = url.searchParams.get('gatewaySkillId');
      if (gatewaySkillId) return json({
        success: true,
        maps: gatewaySkillId === topicMap.gatewaySkillId
          ? [topicMap]
          : gatewaySkillId === mainTrialMap.gatewaySkillId ? [mainTrialMap] : [],
        pagination: { limit: 1, nextCursor: null }
      });
      const scope = url.searchParams.get('scope');
      const constellationType = url.searchParams.get('constellationType');
      const typedMaps = constellationType === 'main'
        ? allMaps.filter(candidate => candidate.constellationType === 'main')
        : constellationType === 'skill'
          ? allMaps.filter(candidate => !candidate.constellationType || candidate.constellationType === 'skill')
          : allMaps;
      const maps = scope === 'discipline' ? typedMaps.filter(candidate => candidate.scope === 'discipline') : typedMaps;
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
      const topicGroups = selectedMap?.scope === 'discipline'
        ? allMaps
          .filter(candidate => candidate.scope === 'topic' && candidate.parentMapId === selectedMap._id && candidate.constellationType !== 'main')
          .map(topic => ({
            map: topic,
            gateway: (mapSkills[selectedMap._id] || []).find(candidate => candidate._id === topic.gatewaySkillId) || null,
            skills: (mapSkills[topic._id] || []).map(candidate => ({ ...candidate, topicLevel: topic.level || 1 }))
          }))
        : [];
      return json({ success: true, map: selectedMap, skills: mapSkills[mapMatch[1]] || [], topicGroups });
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
  const skillOverview = page.locator('.skill-constellation-panel .constellation-overview');
  await expect(skillOverview.locator('.constellation-overview-item')).toHaveCount(3);
  const overviewTopicCounts = await skillOverview.locator('.constellation-overview-item').evaluateAll(items =>
    items.map(item => item.querySelectorAll('.constellation-node').length)
  );
  expect(overviewTopicCounts).toEqual([4, 4, 5]);
  await page.screenshot({ path: '/tmp/constellation-visual/player-overview.png', fullPage: true });

  await page.getByRole('button', { name: /Game Art/ }).click();
  const questBoard = page.getByRole('list', { name: 'Game Art constellation; all topic quests' });
  const modelingCluster = questBoard.getByRole('listitem').filter({ hasText: '3D Modeling' });
  const clusterMap = modelingCluster;
  await expect(modelingCluster).toBeVisible();
  await expect(clusterMap.locator('.discipline-topic-quest-layer .constellation-node')).toHaveCount(11);
  await expect(clusterMap.getByRole('button', { name: /Blender Setup/ })).toBeVisible();
  await expect(clusterMap.getByRole('button', { name: /Cinematic/ })).toBeVisible();
  const svgGuide = clusterMap.locator('.constellation-map-svg-guide');
  await expect(svgGuide).toHaveCount(1);
  await expect(modelingCluster.locator('.discipline-topic-boundary')).toHaveAttribute('d', /^M /);
  await expect(modelingCluster.locator('.discipline-topic-boundary.is-svg-outline')).toHaveCount(1);
  const [playerGuideBox, playerBoundaryBox] = await Promise.all([
    svgGuide.boundingBox(),
    modelingCluster.locator('.discipline-topic-boundary.is-svg-outline').boundingBox()
  ]);
  expect(playerGuideBox).not.toBeNull();
  expect(playerBoundaryBox).not.toBeNull();
  const playerGuideContentSize = Math.min(playerGuideBox!.width, playerGuideBox!.height);
  expect(playerBoundaryBox!.width / playerGuideContentSize).toBeGreaterThan(0.85);
  expect(playerBoundaryBox!.height / playerGuideContentSize).toBeGreaterThan(0.85);
  await expect(page.getByRole('button', { name: 'View Path' })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/constellation-visual/player-discipline-board-without-lens.png', fullPage: true });

  const firstQuest = clusterMap.locator('.constellation-node').filter({ hasText: 'Blender Setup' });
  await firstQuest.locator('.constellation-node-star').click({ force: true });
  await expect(page.getByLabel('Blender Setup quest details')).toBeVisible();
  await page.screenshot({ path: '/tmp/constellation-visual/player-discipline-board.png', fullPage: true });

  await page.locator('.topbar-brand').click({ position: { x: 3, y: 3 } });
  await expect(page.locator('#star-lens-dock')).toHaveCount(0);
  await expect(firstQuest).not.toHaveAttribute('aria-expanded', 'true');

  const connectionPaths = await clusterMap.locator('.constellation-lines path').evaluateAll(paths => (
    paths.map(path => path.getAttribute('d') || '')
  ));
  expect(connectionPaths.length).toBeGreaterThan(0);
  expect(connectionPaths.every(path => /^M [\d.-]+ [\d.-]+(?: L [\d.-]+ [\d.-]+)+$/.test(path))).toBe(true);

  const overflow = await page.locator('.skill-constellation-panel .constellation-shell').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('theme switch persists dark and light preference across reloads', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');

  const switchToDark = page.getByRole('button', { name: 'Switch to dark theme' });
  await expect(switchToDark).toBeVisible();
  await switchToDark.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light theme' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gugame-theme'))).toBe('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gugame-theme'))).toBe('light');
});

test('main menu keeps Main Quest compact and exposes the Skill Constellation above the fold', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');

  const layout = await page.locator('.main-container').evaluate(container => {
    const topbar = container.querySelector('.topbar');
    const main = container.querySelector('.main-constellation-panel');
    const skill = container.querySelector('.skill-constellation-panel');
    const dock = container.querySelector('.player-dock');
    if (!topbar || !main || !skill || !dock) return null;
    const children = [...container.children];
    return {
      dom: [children.indexOf(topbar), children.indexOf(main), children.indexOf(skill)],
      top: [topbar, main, skill].map(element => element.getBoundingClientRect().top),
      heights: {
        topbar: topbar.getBoundingClientRect().height,
        main: main.getBoundingClientRect().height,
        panelHeader: skill.querySelector('.panel-header')?.getBoundingClientRect().height || 0,
        dock: dock.getBoundingClientRect().height
      },
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      skillBottom: skill.getBoundingClientRect().bottom
    };
  });
  expect(layout).not.toBeNull();
  expect(layout!.dom[0]).toBeLessThan(layout!.dom[1]);
  expect(layout!.dom[1]).toBeLessThan(layout!.dom[2]);
  expect(layout!.top[0]).toBeLessThan(layout!.top[1]);
  expect(layout!.top[1]).toBeLessThan(layout!.top[2]);
  expect(layout!.top[2]).toBeLessThan(240);
  expect(layout!.top[2]).toBeLessThan(layout!.viewportHeight);
  expect(layout!.skillBottom).toBeGreaterThan(layout!.viewportHeight * 0.5);
  expect(layout!.heights.topbar).toBeLessThanOrEqual(56);
  expect(layout!.heights.main).toBeLessThanOrEqual(110);
  expect(layout!.heights.panelHeader).toBeLessThanOrEqual(40);
  expect(layout!.heights.dock).toBeLessThanOrEqual(52);
  expect(layout!.documentOverflow).toBeLessThanOrEqual(1);
  await expect(page.locator('.profile-section')).toHaveCount(0);
  await expect(page.locator('.progression-leaderboard')).toHaveCount(0);
  await expect(page.locator('.topbar-center')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Admin Panel' })).toBeHidden();
  await expect(page.locator('.main-constellation-panel .main-quest-strip')).toHaveCount(1);
  await expect(page.locator('.main-constellation-panel svg.constellation-canvas')).toHaveCount(0);
  const mainConstellationBox = await page.locator('.main-constellation-panel .main-quest-strip').boundingBox();
  expect(mainConstellationBox).not.toBeNull();
  expect(mainConstellationBox!.height).toBeLessThanOrEqual(88);
  await expect(page.locator('.main-quest-strip__step')).toHaveCount(4);
  await expect(page.locator('.main-quest-strip__step-copy strong')).toHaveText(['Level 1', 'Level 2', 'Level 3', 'Level 4']);
  await expect(page.locator('.main-quest-strip__summary').getByText('Arrival', { exact: true })).toHaveCount(1);
  const currentMainQuest = page.locator('.main-constellation-panel [data-skill-id="410000000000000000000001"]');
  await expect(currentMainQuest).toHaveClass(/is-current/);
  await expect(currentMainQuest).toHaveAttribute('aria-expanded', 'false');
  const mainPanelBefore = await page.locator('.main-constellation-panel').boundingBox();
  await currentMainQuest.click();
  const starLens = page.getByLabel('Arrival quest details');
  await expect(starLens).toBeVisible();
  await expect(starLens).toHaveCSS('position', 'fixed');
  await expect(starLens.getByRole('heading', { name: 'Arrival' })).toBeVisible();
  await expect(page.getByRole('application')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Main Journey level-up path' })).toBeVisible();
  await expect(currentMainQuest).toHaveClass(/is-selected/);
  await expect(currentMainQuest).toHaveAttribute('aria-controls', 'star-lens-dock');
  await expect(currentMainQuest).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(220);
  const starLensBox = await starLens.boundingBox();
  expect(starLensBox).not.toBeNull();
  expect(starLensBox!.x).toBeGreaterThan(700);
  await page.screenshot({ path: '/tmp/constellation-visual/main-star-lens.png', fullPage: true });
  const mainPanelAfter = await page.locator('.main-constellation-panel').boundingBox();
  expect(mainPanelAfter!.height).toBeCloseTo(mainPanelBefore!.height, 0);
  const lensZIndex = await starLens.evaluate(element => Number(getComputedStyle(element).zIndex));
  expect(lensZIndex).toBeGreaterThan(900);
  expect(lensZIndex).toBeLessThan(1000);
  await page.getByRole('button', { name: /Switch to .* theme/ }).click();
  await expect(starLens).toBeVisible();
  await currentMainQuest.click();
  await expect(starLens).toBeVisible();
  await starLens.evaluate(element => { element.setAttribute('data-test-shell', 'stable'); });
  await page.locator('.main-constellation-panel [data-skill-id="410000000000000000000002"]').click();
  const replacementLens = page.getByLabel('First Trial quest details');
  await expect(replacementLens).toBeVisible();
  await expect(replacementLens).toHaveAttribute('data-test-shell', 'stable');
  await replacementLens.getByRole('button', { name: 'Minimize quest dock' }).click();
  await expect(replacementLens).toHaveClass(/is-minimized/);
  await replacementLens.getByRole('button', { name: 'Expand quest dock' }).click();
  const thirdMainQuest = page.locator('.main-constellation-panel [data-skill-id="410000000000000000000003"]');
  await thirdMainQuest.click();
  await expect(page.getByLabel('Guild Path quest details')).toBeVisible();
  await page.locator('.topbar-brand').click({ position: { x: 3, y: 3 } });
  await expect(page.locator('#star-lens-dock')).toHaveCount(0);
  await thirdMainQuest.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#star-lens-dock')).toHaveCount(0);
  await expect(thirdMainQuest).not.toHaveClass(/is-selected/);
  await expect(page.locator('.player-dock button span')).toHaveText([
    'Constellations',
    'Inventory',
    'Shop'
  ]);
  await page.screenshot({ path: '/tmp/constellation-visual/main-compact.png', fullPage: true });

  await page.locator('.player-account-menu summary').click();
  await expect(page.getByRole('button', { name: 'Admin Panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Admin Panel' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goBack();

  await page.getByRole('button', { name: 'Constellations' }).click();
  await expect.poll(() => page.evaluate(() => {
    const target = document.getElementById('constellations');
    if (!target) return false;
    const bounds = target.getBoundingClientRect();
    return bounds.top < window.innerHeight && bounds.bottom > 0;
  })).toBe(true);
});

test('mobile Main Quest opens Star Lens as a focus-contained bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiFixtures(page);
  await page.goto('mainmenu');

  const compactStrip = page.locator('.main-quest-strip');
  await expect(compactStrip).toBeVisible();
  const compactStripBounds = await compactStrip.boundingBox();
  const skillPanelBounds = await page.locator('.skill-constellation-panel').boundingBox();
  expect(compactStripBounds!.height).toBeLessThanOrEqual(132);
  expect(skillPanelBounds!.y).toBeLessThan(234);
  const skillMapBounds = await page.locator('.skill-constellation-panel .constellation-overview-grid').boundingBox();
  expect(skillMapBounds).not.toBeNull();
  expect(skillMapBounds!.y).toBeLessThan(340);
  await page.screenshot({ path: '/tmp/constellation-visual/mobile-main-quest-compact.png', fullPage: true });

  const currentQuest = page.locator('.main-constellation-panel [data-skill-id="410000000000000000000001"]');
  await currentQuest.click();
  const sheet = page.getByRole('dialog', { name: 'Arrival quest details' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Close quest dock' })).toBeFocused();

  await expect.poll(async () => {
    const box = await sheet.boundingBox();
    return box ? Math.abs((box.y + box.height) - 844) : 999;
  }).toBeLessThanOrEqual(1);
  const bounds = await sheet.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeCloseTo(390, 0);

  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('#star-lens-dock')))).toBe(true);
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('#star-lens-dock')))).toBe(true);

  await page.locator('.star-lens-scrim').click({ position: { x: 8, y: 8 } });
  await expect(page.locator('#star-lens-dock')).toHaveCount(0);
  await expect(currentQuest).toBeFocused();
});

test('desktop Skill Constellation fits dense discipline graphs without overflow', async ({ page }) => {
  const denseGateways = [
    skill('720000000000000000000001', 'Advanced Particle Systems', gameArtMap._id, 90, 250, 'topic-gateway'),
    skill('720000000000000000000002', 'Animation Blend Trees', gameArtMap._id, 300, 520, 'topic-gateway'),
    skill('720000000000000000000003', 'Audio Mixer and Spatial Sound', gameArtMap._id, 560, 330, 'topic-gateway'),
    skill('720000000000000000000004', 'Timeline Production', gameArtMap._id, 740, 760, 'topic-gateway'),
    skill('720000000000000000000005', 'Shader Graph Foundations', gameArtMap._id, 930, 260, 'topic-gateway'),
    skill('720000000000000000000006', 'Character Rigging Pipeline', gameArtMap._id, 1160, 520, 'topic-gateway'),
    skill('720000000000000000000007', 'Visual Effects Optimization', gameArtMap._id, 1510, 240, 'topic-gateway')
  ];
  gameArtSkills.push(...denseGateways);
  allSkills.push(...denseGateways);

  try {
    await page.setViewportSize({ width: 2048, height: 1152 });
    await installApiFixtures(page);
    await page.goto('mainmenu');
    const skillPanel = page.locator('.skill-constellation-panel');
    const shell = skillPanel.locator('.constellation-shell');
    const card = skillPanel.locator(`.constellation-overview-item[data-map-id="${gameArtMap._id}"]`);
    await expect(card.locator('.constellation-node')).toHaveCount(gameArtSkills.length);

    const fit = await card.evaluate(element => {
      const cardBounds = element.getBoundingClientRect();
      const stars = [...element.querySelectorAll('.constellation-node-star')].map(star => {
        const bounds = star.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      });
      return {
        card: { left: cardBounds.left, right: cardBounds.right, top: cardBounds.top, bottom: cardBounds.bottom },
        stars,
        viewBox: element.querySelector('svg')?.getAttribute('viewBox'),
        dense: element.querySelector('.constellation-mini-layer')?.classList.contains('is-dense'),
        visibleLabels: [...element.querySelectorAll('.constellation-node-label')]
          .filter(label => getComputedStyle(label).display !== 'none').length
      };
    });
    const [shellBounds, panelBounds] = await Promise.all([shell.boundingBox(), skillPanel.boundingBox()]);
    expect(shellBounds).not.toBeNull();
    expect(panelBounds).not.toBeNull();
    expect(shellBounds!.width).toBeGreaterThanOrEqual(panelBounds!.width - 4);
    expect(fit.viewBox).not.toBe(`0 0 ${gameArtMap.viewport.width} ${gameArtMap.viewport.height}`);
    expect(fit.dense).toBe(true);
    expect(fit.visibleLabels).toBe(0);
    expect(fit.stars.every(star =>
      star.left >= fit.card.left + 2 && star.right <= fit.card.right - 2 &&
      star.top >= fit.card.top + 70 && star.bottom <= fit.card.bottom - 2
    )).toBe(true);
    await page.screenshot({ path: '/tmp/constellation-visual/dense-overview-fit.png', fullPage: true });
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page.screenshot({ path: '/tmp/constellation-visual/dense-overview-fit-dark.png', fullPage: true });
  } finally {
    gameArtSkills.splice(gameArtSkills.length - denseGateways.length, denseGateways.length);
    allSkills.splice(allSkills.length - denseGateways.length, denseGateways.length);
  }
});

test('login dark theme preserves gateway contrast', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gugame-theme', 'dark'));
  await page.goto('login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: /Continue with Discord/ })).toBeVisible();
  await page.screenshot({ path: '/tmp/constellation-visual/dark-login.png', fullPage: true });
});

test('dark theme keeps player and editor surfaces consistently dark', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gugame-theme', 'dark'));
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: '/tmp/constellation-visual/dark-player-overview.png', fullPage: true });

  await page.locator('.main-constellation-panel [data-skill-id="410000000000000000000001"]').click();
  await expect(page.getByLabel('Arrival quest details')).toBeVisible();
  await page.waitForTimeout(220);
  await expect(page.getByLabel('Arrival quest details')).toHaveCSS('opacity', '1');
  await expect(page.getByLabel('Arrival quest details').locator('.star-lens-dock__body')).toHaveCSS('opacity', '1');
  await page.getByLabel('Arrival quest details').screenshot({ path: '/tmp/constellation-visual/dark-main-quest-star-lens-crop.png' });
  await page.screenshot({ path: '/tmp/constellation-visual/dark-main-quest-star-lens.png', fullPage: true });

  await page.getByRole('button', { name: /Game Art/ }).click();
  const darkQuest = page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' });
  await darkQuest.locator('.constellation-node-star').click({ force: true });
  await expect(page.getByLabel('Blender Setup quest details')).toBeVisible();
  await page.screenshot({ path: '/tmp/constellation-visual/dark-player-discipline-board.png', fullPage: true });

  await page.goto('admin');
  await page.getByRole('button', { name: 'Main Quest' }).click();
  await expect(page.getByLabel('Main Quest Path editor')).toBeVisible();
  await page.screenshot({ path: '/tmp/constellation-visual/dark-main-quest-editor.png', fullPage: true });
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.screenshot({ path: '/tmp/constellation-visual/dark-admin-workspace.png', fullPage: true });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).press('Enter');
  await page.getByRole('button', { name: 'Import quest' }).click();
  await expect(page.getByRole('dialog', { name: 'Import quest from StarMaster' })).toBeVisible();
  await page.screenshot({ path: '/tmp/constellation-visual/dark-admin-import.png', fullPage: true });
});

test('player topic refreshes imported quests when the window regains focus', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  const skillConstellations = page.getByLabel('Skill Constellations');
  await expect(skillConstellations).toBeVisible();
  await skillConstellations.scrollIntoViewIfNeeded();
  await skillConstellations.getByRole('button', { name: /Game Art/ }).click();
  const modelingCluster = page.getByRole('listitem').filter({ hasText: '3D Modeling' });

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
    await expect(modelingCluster.getByRole('button', { name: 'Newly Imported Quest, lesson, available' })).toBeVisible();
    await expect(page.locator('.skill-constellation-panel .constellation-focus')).toHaveClass(/is-discipline-board/);
  } finally {
    topicSkills.splice(topicSkills.findIndex(candidate => candidate._id === importedQuest._id), 1);
    allSkills.splice(allSkills.findIndex(candidate => candidate._id === importedQuest._id), 1);
  }
});

test('player sees next-level topics but cannot enter them early', async ({ page }) => {
  const originalLevel = topicMap.level;
  topicMap.level = 2;
  try {
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    const cluster = page.getByRole('listitem').filter({ hasText: '3D Modeling' });
    const gatedQuest = cluster.locator('[data-skill-id="600000000000000000000001"]');
    await expect(cluster).toHaveClass(/is-level-locked/);
    await expect(gatedQuest).toHaveClass(/is-level-gated/);
    await expect(gatedQuest.locator('.constellation-level-fog')).toHaveCount(0);
    await expect(cluster.getByRole('button', { name: 'Blender Setup, lesson, locked' })).toBeVisible();
    await page.screenshot({ path: '/tmp/constellation-visual/level-gated-without-fog.png', fullPage: true });
    await gatedQuest.press('Enter');
    const questLens = page.getByLabel('Blender Setup quest details');
    await expect(questLens).toContainText('Reach Level 2 to start this Quest.');
    await expect(questLens.getByRole('button', { name: 'Unlocks at Level 2' })).toBeDisabled();
  } finally {
    topicMap.level = originalLevel;
  }
});

test('player sees every Quest in a Topic boundary without a gateway window', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  const cluster = page.getByRole('listitem').filter({ hasText: '3D Modeling' });
  await expect(cluster.locator('.constellation-node')).toHaveCount(topicSkills.length);
  await expect(cluster.locator('.discipline-topic-boundary')).toBeVisible();
  await expect(page.getByLabel('3D Modeling topic path info')).toHaveCount(0);
});

test('mobile constellation uses one-map paging and Star Lens sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  const quest = page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' });
  await quest.press('Enter');
  const questLens = page.getByRole('dialog', { name: 'Blender Setup quest details' });
  await expect(questLens).toBeVisible();
  await expect(questLens.getByRole('button', { name: 'Start journey' })).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/constellation-visual/player-mobile.png', fullPage: true });
});

test('empty topic explains that no quests are available yet', async ({ page }) => {
  const savedSkills = topicSkills.splice(0, topicSkills.length);
  try {
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await expect(page.getByText('No quests published in this Discipline yet')).toBeVisible();
    await expect(page.getByText('Quest groups will appear here automatically when their Topic is published.')).toBeVisible();
  } finally {
    topicSkills.push(...savedSkills);
  }
});

test.skip('v1.0.0 topic camera navigation is retired in v1.0.1', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  const skillFrame = page.locator('.skill-constellation-panel .constellation-shell');
  const skillPanel = page.locator('.skill-constellation-panel');
  await expect(skillFrame).toBeVisible();
  const overviewFrame = await skillFrame.boundingBox();
  const skillPanelFrame = await skillPanel.boundingBox();
  const desktopViewport = page.viewportSize();
  expect(overviewFrame).not.toBeNull();
  expect(skillPanelFrame).not.toBeNull();
  expect(desktopViewport).not.toBeNull();
  expect(overviewFrame!.width).toBeGreaterThanOrEqual(skillPanelFrame!.width - 4);
  expect(overviewFrame!.y + overviewFrame!.height).toBeLessThanOrEqual(desktopViewport!.height);
  expect(overviewFrame!.height).toBeLessThanOrEqual(desktopViewport!.height - 280);
  await page.getByRole('button', { name: /Game Art/ }).click();

  const disciplineFrame = await skillFrame.boundingBox();
  expect(disciplineFrame).not.toBeNull();
  expect(Math.abs(disciplineFrame!.height - overviewFrame!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(disciplineFrame!.width - overviewFrame!.width)).toBeLessThanOrEqual(1);

  const canvas = page.getByRole('group', { name: 'Game Art constellation map' });
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
  await expect(page.getByLabel('3D Modeling topic path info')).toHaveCount(0);
  await modelingNode.press('Enter');
  await expect(page.getByLabel('3D Modeling topic path info')).toBeVisible();
  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.locator('.skill-constellation-panel .constellation-focus')).toHaveClass(/is-topic-active/);
  await expect(page.locator('.constellation-topic-layer')).toHaveCSS('transition-duration', /0\.36s/);
  const topicFrame = await skillFrame.boundingBox();
  expect(topicFrame).not.toBeNull();
  expect(Math.abs(topicFrame!.height - overviewFrame!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(topicFrame!.width - overviewFrame!.width)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: '/tmp/constellation-visual/desktop-skill-topic-16x9.png', fullPage: true });

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Game Art' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Skill Constellations' }).first()).toBeVisible();

  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Game Art' })).toBeVisible();
  await page.goForward();
  await expect(page.locator('.skill-constellation-panel .constellation-focus')).toHaveClass(/is-topic-active/);
  await expect(page.getByRole('heading', { name: '3D Modeling' })).toBeVisible();
});

test('player can explore Discipline Quest groups with keyboard and browser-style back navigation', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  const questNode = page.getByRole('listitem', { name: /3D Modeling, Level 1, 11 quests/ })
    .getByRole('button', { name: /Blender Setup/ });
  await questNode.focus();
  await questNode.press('Enter');
  await expect(page.getByLabel('Blender Setup quest details')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Blender Setup quest details')).toHaveCount(0);
  await expect(questNode).toBeFocused();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Skill Constellations' }).first()).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Game Art' })).toBeVisible();
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
  const editorGeometry = await page.locator('.constellation-editor-workspace').evaluate(workspace => {
    const canvas = workspace.querySelector('.constellation-layout-editor')!.getBoundingClientRect();
    const inspector = workspace.querySelector('.constellation-floating-inspector')!.getBoundingClientRect();
    const bounds = workspace.getBoundingClientRect();
    const adminContent = workspace.closest('.admin-content')!;
    return {
      canvasRightGap: Math.abs(bounds.right - canvas.right),
      inspectorOverCanvas: inspector.left < canvas.right && inspector.right <= canvas.right,
      contentPaddingLeft: Number.parseFloat(getComputedStyle(adminContent).paddingLeft)
    };
  });
  expect(editorGeometry.canvasRightGap).toBeLessThanOrEqual(2);
  expect(editorGeometry.inspectorOverCanvas).toBe(true);
  expect(editorGeometry.contentPaddingLeft).toBe(0);
  await page.screenshot({ path: '/tmp/constellation-visual/admin-workspace.png', fullPage: true });
});

test('desktop admin dialogs trap focus, inert the background, and restore their opener', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('admin');

  await page.getByRole('button', { name: 'Shop', exact: true }).click();
  const opener = page.getByRole('button', { name: /Create Shop Item/ });
  await opener.click();

  const dialog = page.getByRole('dialog', { name: 'Create Shop Item' });
  const firstControl = dialog.getByPlaceholder('Item title');
  const lastControl = dialog.getByRole('button', { name: 'Create Item' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(firstControl).toBeFocused();
  await expect(page.locator('.theme-toggle')).toHaveCSS('z-index', '900');
  expect(await page.locator('.theme-toggle').evaluate(element => element.inert || Boolean(element.closest('[inert]')))).toBe(true);
  expect(await page.locator('.admin-topbar').evaluate(element => element.inert || Boolean(element.closest('[inert]')))).toBe(true);

  await page.keyboard.press('Shift+Tab');
  await expect(lastControl).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(firstControl).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await page.locator('.theme-toggle').evaluate(element => element.inert || Boolean(element.closest('[inert]')))).toBe(false);
});

test('desktop star context menu supports roving keys and returns focus on Escape', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const node = editor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' });
  await node.focus();
  await page.keyboard.press('Shift+F10');

  const edit = page.getByRole('menuitem', { name: 'Edit star' });
  const connect = page.getByRole('menuitem', { name: 'Connect from here' });
  const remove = page.getByRole('menuitem', { name: 'Delete star' });
  await expect(edit).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(connect).toBeFocused();
  await page.keyboard.press('End');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Home');
  await expect(edit).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: /3D Modeling actions/ })).toBeHidden();
  await expect(node).toBeFocused();
});

test('desktop editor releases wheel scrolling at its zoom bounds', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  for (let index = 0; index < 12; index += 1) await zoomIn.click();
  await expect(page.locator('.constellation-layout-zoom-value')).toHaveText('300%');
  expect(await editor.evaluate(element => element.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true })))).toBe(true);
  expect(await editor.evaluate(element => element.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })))).toBe(false);

  for (let index = 0; index < 20; index += 1) await zoomOut.click();
  await expect(page.locator('.constellation-layout-zoom-value')).toHaveText('30%');
  expect(await editor.evaluate(element => element.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })))).toBe(true);
});

test('desktop dark Inspector keeps readable contrast and utility type at 11px or larger', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('gugame-theme', 'dark'));
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).click();

  const inspector = page.getByLabel('Star Inspector');
  const contrast = await inspector.locator('.constellation-inspector-content label').first().evaluate(element => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (rgb: number[]) => rgb.map(value => value / 255).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
      .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(parse(getComputedStyle(element).color));
    const background = luminance(parse(getComputedStyle(element.closest('.constellation-floating-inspector')!).backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);

  const utilitySizes = await page.locator('.constellation-inspector-selection span, .constellation-inspector-content legend, .constellation-inspector-content label, .constellation-inspector-note').evaluateAll(elements => (
    elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize))
  ));
  expect(Math.min(...utilitySizes)).toBeGreaterThanOrEqual(11);
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
  const arrowheads = await editor.locator('.constellation-layout-lines path').evaluateAll(elements => (
    elements.map(element => element.getAttribute('marker-end') || '')
  ));
  expect(paths).toHaveLength(gameArtSkills.reduce((total, skill) => total + (skill.connections?.length || 0), 0));
  expect(paths.every(path => /^M [\d.-]+ [\d.-]+ L [\d.-]+ [\d.-]+$/.test(path))).toBe(true);
  expect(arrowheads.every(marker => marker.includes('constellation-editor-arrow'))).toBe(true);
  expect(await editor.locator('.constellation-node-star').first().getAttribute('d')).toBe(
    'M 0 -24 L 7 -7 L 24 0 L 7 7 L 0 24 L -7 7 L -24 0 L -7 -7 Z'
  );

  const modelingNode = editor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' });
  const box = await modelingNode.locator('.constellation-node-core').boundingBox();
  expect(box).not.toBeNull();
  const transformBeforeDrag = await modelingNode.getAttribute('transform');
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await expect(modelingNode).toHaveAttribute('tabindex', '0');

  await expect.poll(() => modelingNode.getAttribute('transform')).not.toBe(transformBeforeDrag);
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect.poll(() => savedLayout?.nodes.length || 0).toBe(1);
  expect(savedLayout?.nodes[0].skillId).toBe('400000000000000000000002');
  await expect(page.locator('.constellation-layout-dirty-count')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/constellation-visual/admin-layout-editor.png', fullPage: true });
});

test('admin marquee-selects stars and moves only the selected group', async ({ page }) => {
  let savedLayout: { nodes: Array<{ skillId: string; x: number; y: number }> } | undefined;
  const originalPositions = new Map(gameArtSkills.map(skillItem => [
    skillItem._id,
    { ...skillItem.constellationPosition }
  ]));
  await installApiFixtures(page, payload => { savedLayout = payload; });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const editorBox = await editor.boundingBox();
  expect(editorBox).not.toBeNull();
  const screenPoint = (x: number, y: number) => ({
    x: editorBox!.x + (x / viewport.width) * editorBox!.width,
    y: editorBox!.y + (y / viewport.height) * editorBox!.height
  });

  const selectionStart = screenPoint(350, 320);
  const selectionEnd = screenPoint(650, 760);
  await page.mouse.move(selectionStart.x, selectionStart.y);
  await page.mouse.down();
  await page.mouse.move(selectionEnd.x, selectionEnd.y, { steps: 5 });
  await expect(editor.locator('.constellation-layout-marquee')).toBeVisible();
  await page.mouse.up();

  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await expect(editor.locator('.constellation-layout-node.is-selected')).toHaveCount(2);
  const modelingNode = editor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' });
  const animationNode = editor.locator('.constellation-layout-node').filter({ hasText: 'Animation' });
  const materialsNode = editor.locator('.constellation-layout-node').filter({ hasText: 'Materials' });
  const modelingBefore = await modelingNode.getAttribute('transform');
  const animationBefore = await animationNode.getAttribute('transform');
  const materialsBefore = await materialsNode.getAttribute('transform');
  const modelingBox = await modelingNode.locator('.constellation-node-core').boundingBox();
  expect(modelingBox).not.toBeNull();

  await page.mouse.move(modelingBox!.x + modelingBox!.width / 2, modelingBox!.y + modelingBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    modelingBox!.x + modelingBox!.width / 2 + (120 / viewport.width) * editorBox!.width,
    modelingBox!.y + modelingBox!.height / 2 + (60 / viewport.height) * editorBox!.height,
    { steps: 5 }
  );
  await page.mouse.up();

  await expect.poll(() => modelingNode.getAttribute('transform')).not.toBe(modelingBefore);
  await expect.poll(() => animationNode.getAttribute('transform')).not.toBe(animationBefore);
  await expect(materialsNode).toHaveAttribute('transform', materialsBefore!);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => savedLayout?.nodes.length || 0).toBe(2);
  expect(savedLayout?.nodes.map(node => node.skillId).sort()).toEqual([
    '400000000000000000000002',
    '400000000000000000000004'
  ]);
  gameArtSkills.forEach(skillItem => {
    const originalPosition = originalPositions.get(skillItem._id);
    if (originalPosition) skillItem.constellationPosition = originalPosition;
  });
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
    .locator('.constellation-layout-embedded-topic').filter({ hasText: '3D Modeling' })
    .dispatchEvent('pointerdown', { detail: 2, button: 0, pointerId: 1, clientX: 400, clientY: 400 });
  const editor = page.getByRole('application', { name: '3D Modeling visual layout editor' });
  await expect(editor.locator('.constellation-layout-map-background')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/constellation-visual/admin-blender-svg-guide.png', fullPage: true });
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
  await page.keyboard.press('Control+s');

  await expect.poll(() => updatedSkillId).toBe('600000000000000000000001');
  expect(updatedInfo?.constellationLabel).toBe('Blender Start');
  expect(updatedInfo?.description).toBe('Prepare Blender for production work.');
  await expect(blenderNode).toBeFocused();
});

test('admin creates and edits boss tiers inside a topic constellation', async ({ page }) => {
  let createdStar: Record<string, unknown> | undefined;
  let updatedInfo: Record<string, unknown> | undefined;
  await installApiFixtures(
    page,
    undefined,
    payload => { createdStar = payload; },
    (_skillId, payload) => { updatedInfo = payload; }
  );
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();

  await page.getByRole('button', { name: 'Create star' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Create star' });
  await createDialog.getByLabel('Star name').fill('Environment Trial');
  await createDialog.getByText('Boss', { exact: true }).click();
  await createDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => createdStar?.mapNodeRole).toBe('boss');
  expect(createdStar?.constellationMapId).toBe(topicMap._id);

  const editor = page.getByRole('application', { name: '3D Modeling visual layout editor' });
  const blenderNode = editor.locator('.constellation-layout-node').filter({ hasText: 'Blender Setup' });
  await blenderNode.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit star' }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit star' });
  await editDialog.getByText('Super Boss', { exact: true }).click();
  await editDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => updatedInfo?.mapNodeRole).toBe('capstone');
});

test('admin enters or auto-creates topic constellations from discipline stars', async ({ page }) => {
  let createdTopic: Record<string, unknown> | undefined;
  await installApiFixtures(page, undefined, undefined, undefined, payload => { createdTopic = payload; });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const disciplineEditor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  // The gateway Star is the deliberate affordance for entering a topic.
  // (The cluster itself is still draggable, and its Stars stay editable.)
  await disciplineEditor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();
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

test('admin can inspect and edit embedded topic stars from the discipline editor', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const embeddedStar = editor.locator('.constellation-layout-embedded-topic')
    .filter({ hasText: '3D Modeling' })
    .locator('[data-skill-id="600000000000000000000001"]');
  await embeddedStar.click();
  const inspector = page.getByLabel('Star Inspector');
  await expect(inspector).toContainText('Blender Setup');
  await inspector.getByText('Edit full details').click();
  await expect(page.getByRole('dialog', { name: /Edit (star|quest)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Close editor' }).click();

  await embeddedStar.locator('.constellation-node-hit-target').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /Blender Setup actions/ });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /Edit (star|quest)/ }).click();
  await expect(page.getByRole('dialog', { name: /Edit (star|quest)/ })).toBeVisible();
});

test('admin saves an individually moved embedded topic star to its topic map', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const embeddedStar = editor.locator('[data-skill-id="600000000000000000000001"]');
  // First click selects the Star; the next drag is the child-level operation.
  await embeddedStar.click();
  const box = await embeddedStar.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 40);
  await page.mouse.up();

  const saveRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return request.method() === 'PATCH' && url.pathname === `/api/constellation-maps/${topicMap._id}/layout`;
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const payload = (await saveRequest).postDataJSON() as { nodes: Array<{ skillId: string }> };
  expect(payload.nodes).toContainEqual(expect.objectContaining({ skillId: '600000000000000000000001' }));
});

test('admin deletes multiple selected Stars in one confirmed action', async ({ page }) => {
  const deletedIds: string[] = [];
  await installApiFixtures(page, undefined, undefined, undefined, undefined, undefined, undefined, undefined, (skillId) => deletedIds.push(skillId));
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();

  const editor = page.getByRole('application', { name: '3D Modeling visual layout editor' });
  await editor.locator('[data-skill-id="600000000000000000000001"]').click();
  await editor.locator('[data-skill-id="600000000000000000000002"]').click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: 'Delete 2 stars' })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete 2 stars' }).click();
  await expect.poll(() => deletedIds).toEqual(expect.arrayContaining([
    '600000000000000000000001',
    '600000000000000000000002'
  ]));
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

test('admin creates Main Quest data in its separate editor', async ({ page }) => {
  let createdMap: Record<string, unknown> | undefined;
  const mainConstellationType = mainJourneyMap.constellationType;
  const mainTrialConstellationType = mainTrialMap.constellationType;
  delete (mainJourneyMap as Partial<typeof mainJourneyMap>).constellationType;
  delete (mainTrialMap as Partial<typeof mainTrialMap>).constellationType;
  try {
  await installApiFixtures(
    page,
    undefined,
    undefined,
    undefined,
    payload => { createdMap = payload; }
  );
  await page.goto('admin');
  await page.getByRole('button', { name: 'Main Quest' }).click();

  await expect(page.getByLabel('Main Quest Path editor')).toBeVisible();
  await expect(page.getByText('No main quest paths yet')).toBeVisible();
  await page.getByRole('button', { name: 'Create first main quest path' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create main quest path' });
  await dialog.getByLabel('Main Quest Path name').fill('Core Journey');
  await dialog.getByRole('button', { name: 'Create main quest path' }).click();

  await expect.poll(() => createdMap?.name).toBe('Core Journey');
  expect(createdMap?.constellationType).toBe('main');
  expect(createdMap?.scope).toBe('discipline');
  expect(createdMap?.isActive).toBe(false);
  } finally {
    mainJourneyMap.constellationType = mainConstellationType;
    mainTrialMap.constellationType = mainTrialConstellationType;
  }
});

test('admin creates a Main Quest draft and can add its first Requirement immediately', async ({ page }) => {
  let createdQuest: Record<string, unknown> | undefined;
  let updatedQuest: Record<string, any> | undefined;
  await installApiFixtures(
    page,
    undefined,
    payload => { createdQuest = payload; },
    (_skillId, payload) => { updatedQuest = payload; }
  );
  await page.goto('admin');
  await page.getByRole('button', { name: 'Main Quest' }).click();
  await page.getByRole('button', { name: 'Create Level Quest' }).click();

  const createDialog = page.getByRole('dialog', { name: 'Create Main Quest' });
  await createDialog.getByLabel('Main Quest name').fill('Level Five Trial');
  await createDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => createdQuest?.title).toBe('Level Five Trial');
  expect(createdQuest?.mainQuestLevel).toBe(5);
  expect(createdQuest?.isActive).toBe(false);

  const editDialog = page.getByRole('dialog', { name: 'Edit quest' });
  await expect(editDialog.getByRole('tab', { name: /Quest steps/ })).toHaveAttribute('aria-selected', 'true');
  await editDialog.getByRole('button', { name: 'Add step' }).click();
  await editDialog.getByLabel('Step 1 title').fill('Submit Level Five evidence');
  await editDialog.getByLabel('Step 1 content 1 text').fill('Attach the work for admin review.');
  await expect(editDialog.getByText('Unsaved changes')).toBeVisible();
  await editDialog.getByRole('button', { name: 'Save Quest' }).click();

  await expect.poll(() => updatedQuest?.subQuests?.length).toBe(1);
  expect(updatedQuest?.subQuests[0].title).toBe('Submit Level Five evidence');
});

test('admin renames a discipline without changing its structure', async ({ page }) => {
  let updatedMap: { id: string; payload: Record<string, unknown> } | undefined;
  await installApiFixtures(
    page,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    (id, payload) => { updatedMap = { id, payload }; }
  );
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('button', { name: 'More constellation actions' }).click();
  await page.getByRole('button', { name: 'Rename discipline' }).click();

  const dialog = page.getByRole('dialog', { name: 'Rename discipline' });
  await expect(dialog.getByLabel('Discipline name')).toHaveValue('Game Art');
  await dialog.getByLabel('Discipline name').fill('Creative Arts');
  await page.keyboard.press('Control+s');

  await expect.poll(() => updatedMap?.id).toBe(gameArtMap._id);
  expect(updatedMap?.payload).toEqual({ name: 'Creative Arts' });
  await expect(page.getByRole('application', { name: 'Creative Arts visual layout editor' })).toBeVisible();
});

test('admin assigns a level to a topic constellation', async ({ page }) => {
  let updatedMap: { id: string; payload: Record<string, unknown> } | undefined;
  await installApiFixtures(page, undefined, undefined, undefined, undefined, undefined, undefined,
    (id, payload) => { updatedMap = { id, payload }; });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' }).dblclick();

  const levelInput = page.getByLabel('Topic level');
  await expect(levelInput).toHaveValue('1');
  await levelInput.fill('2');
  await levelInput.press('Enter');
  await expect.poll(() => updatedMap?.payload.level).toBe(2);
  expect(updatedMap?.id).toBe(topicMap._id);
});

test('admin assigns topic level from its gateway star without entering the topic', async ({ page }) => {
  let updatedMap: { id: string; payload: Record<string, unknown> } | undefined;
  await installApiFixtures(page, undefined, undefined, undefined, undefined, undefined, undefined,
    (id, payload) => { updatedMap = { id, payload }; });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const topicGateway = page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-node').filter({ hasText: '3D Modeling' });
  await topicGateway.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit star' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit star' });
  await expect(dialog.getByLabel('Topic level')).toHaveValue('1');
  await dialog.getByLabel('Topic level').fill('3');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect.poll(() => updatedMap?.payload.level).toBe(3);
  expect(updatedMap?.id).toBe(topicMap._id);
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

test('floating Inspector shows mixed values and applies one field to every selected star', async ({ page }) => {
  const batchUpdates: Array<{ mapId: string; payload: { skillIds: string[]; changes: Record<string, unknown> } }> = [];
  const originalMaterialsLabel = gameArtSkills[2].constellationLabel;
  gameArtSkills[2].constellationLabel = 'Material Studies';
  try {
  await installApiFixtures(
    page,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    'super-admin',
    (mapId, payload) => batchUpdates.push({ mapId, payload })
  );
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });

  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const modeling = editor.locator('.constellation-layout-node').filter({ hasText: '3D Modeling' });
  const materials = editor.locator('[data-skill-id="400000000000000000000003"]');
  await materials.click();
  await modeling.click({ modifiers: ['Control'] });

  const inspector = page.getByLabel('Star Inspector');
  await expect(inspector).toContainText('2 stars selected');
  await expect(inspector.getByPlaceholder('-').first()).toBeVisible();
  await inspector.getByLabel('X').fill('720');
  await inspector.getByLabel('X').press('Enter');
  await expect(page.getByText('Unsaved')).toBeVisible();
  await inspector.getByText('Visible to players').click();
  await expect.poll(() => batchUpdates.length).toBe(1);
  expect(batchUpdates[0]).toEqual({
    mapId: gameArtMap._id,
    payload: {
      skillIds: ['400000000000000000000002', '400000000000000000000003'],
      changes: { isActive: false }
    }
  });
  await expect(inspector.getByText('Edit full details')).toHaveCount(0);
  } finally {
    gameArtSkills[2].constellationLabel = originalMaterialsLabel;
  }
});

test('auto style arranges only the selected constellation group as a saveable draft', async ({ page }) => {
  let savedNodes: Array<{ skillId: string; x: number; y: number }> = [];
  await installApiFixtures(page);
  await page.route(`**/api/constellation-maps/${gameArtMap._id}/layout`, async route => {
    savedNodes = route.request().postDataJSON().nodes;
    await route.fulfill({ json: { success: true } });
  });
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  await editor.locator('[data-skill-id="400000000000000000000003"]').click();
  await editor.locator('[data-skill-id="400000000000000000000001"]').click({ modifiers: ['Control'] });
  await editor.locator('[data-skill-id="400000000000000000000002"]').click({ modifiers: ['Control'] });
  await page.getByRole('button', { name: 'Auto Style' }).click();
  await expect(page.getByText('Unsaved')).toBeVisible();
  await page.getByRole('button', { name: /Save/ }).click();
  await expect.poll(() => savedNodes.length).toBe(3);
  expect(savedNodes.map(node => node.skillId).sort()).toEqual([
    '400000000000000000000001',
    '400000000000000000000002',
    '400000000000000000000003'
  ]);
});

test('SVG auto layout samples the colored silhouette and keeps stars on the guide', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  await page.getByRole('application', { name: 'Game Art visual layout editor' })
    .locator('.constellation-layout-embedded-topic').filter({ hasText: '3D Modeling' })
    .dispatchEvent('pointerdown', { detail: 2, button: 0, pointerId: 1, clientX: 400, clientY: 400 });
  const editor = page.getByRole('application', { name: '3D Modeling visual layout editor' });
  await expect(page.getByRole('button', { name: 'Auto Layout' })).toBeEnabled();
  await page.locator('.constellation-layout-editor input[type="file"]').setInputFiles({
    name: 'arm-muscles-silhouette.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(armSilhouetteGuide.split(',')[1], 'base64')
  });
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  await expect(editor.locator('.constellation-layout-map-background')).toHaveCount(1);
  await page.screenshot({ path: '/tmp/constellation-visual/admin-blender-svg-auto-layout.png', fullPage: true });
});

test('embedded SVG auto layout immediately moves Topic stars in the Discipline editor', async ({ page }) => {
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const topic = editor.locator('.constellation-layout-embedded-topic').filter({ hasText: '3D Modeling' });
  const firstStar = topic.locator('[data-skill-id="600000000000000000000001"]');
  const before = await firstStar.getAttribute('transform');
  await topic.dispatchEvent('pointerdown', { detail: 1, button: 0, pointerId: 1, clientX: 400, clientY: 400 });
  await page.locator('.constellation-layout-editor input[type="file"]').setInputFiles({
    name: 'arm-muscles-silhouette.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(armSilhouetteGuide.split(',')[1], 'base64')
  });
  await expect(page.getByText('Unsaved', { exact: true })).toBeVisible();
  await expect.poll(() => firstStar.getAttribute('transform')).not.toBe(before);
  await expect(topic.locator('.constellation-layout-topic-boundary.is-svg-outline')).toHaveCount(1);
  const [backgroundBox, boundaryBox] = await Promise.all([
    topic.locator('.constellation-layout-topic-background').boundingBox(),
    topic.locator('.constellation-layout-topic-boundary.is-svg-outline').boundingBox()
  ]);
  expect(backgroundBox).not.toBeNull();
  expect(boundaryBox).not.toBeNull();
  expect(boundaryBox!.width / backgroundBox!.width).toBeGreaterThan(0.85);
  expect(boundaryBox!.height / backgroundBox!.height).toBeGreaterThan(0.85);
  await page.screenshot({ path: '/tmp/constellation-visual/admin-discipline-embedded-svg-outline.png', fullPage: true });
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
  await expect(page.getByLabel('Star Inspector')).toHaveClass(/is-collapsed/);
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
  const questLayer = page.locator('.discipline-topic-quest-layer');
  await expect(questLayer).toBeVisible();

  const nodeSemantics = await questLayer.locator('.constellation-node').evaluateAll(nodes => (
    nodes.map(node => ({
      label: node.getAttribute('aria-label'),
      className: node.getAttribute('class'),
      color: getComputedStyle(node).color,
      starPath: node.querySelector('.constellation-node-star')?.getAttribute('d') || ''
    }))
  ));
  const connections = await questLayer.locator('.constellation-lines path').evaluateAll(paths => (
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

test('@audit mobile Discipline Quest Star Lens preserves touch controls', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();

  const backBox = await page.getByRole('button', { name: 'Back' }).boundingBox();
  const skillPanel = page.locator('.skill-constellation-panel');
  const modelingNode = page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' });
  await modelingNode.press('Enter');
  const questLens = page.getByRole('dialog', { name: 'Blender Setup quest details' });
  await expect(questLens).toBeVisible();
  await page.waitForTimeout(220);

  const nodeBox = await modelingNode.boundingBox();
  const hitTargetBox = await modelingNode.locator('.constellation-node-hit-target').boundingBox();
  const panelBox = await questLens.boundingBox();
  const labelBoxes = await page.locator('.discipline-topic-quest-layer .constellation-node-label').evaluateAll(labels => (
    labels.map(label => {
      const bounds = label.getBoundingClientRect();
      return { text: label.textContent, width: bounds.width, height: bounds.height };
    })
  ));
  const cameraControlCount = await skillPanel.locator('.constellation-camera-controls').count();
  const panelButtons = await questLens.getByRole('button').evaluateAll(buttons => buttons.map(button => ({
    text: button.textContent?.trim() || '',
    ariaLabel: button.getAttribute('aria-label') || ''
  })));
  const primaryActionBox = await questLens.getByRole('button', { name: 'Start journey' }).boundingBox();

  await recordAudit(browserName, 'mobile-spatial-context', {
    viewport: { width: 390, height: 844 },
    selectedNodeBox: nodeBox,
    hitTargetBox,
    previewPanelBox: panelBox,
    labelBoxes,
    backTarget: backBox,
    allPrimaryTargetsAtLeast44: Boolean(backBox && backBox.width >= 44 && backBox.height >= 44),
    cameraControlCount,
    panelButtons,
    hasExplicitCloseControl: panelButtons.some(button => /close|dismiss/i.test(`${button.text} ${button.ariaLabel}`))
  });
  expect(panelBox?.width).toBe(390);
  expect(Boolean(hitTargetBox && hitTargetBox.width >= 44 && hitTargetBox.height >= 44)).toBe(true);
  expect(Boolean(primaryActionBox && primaryActionBox.y >= 0 && primaryActionBox.y + primaryActionBox.height <= 844)).toBe(true);
  expect(Boolean(backBox && backBox.width >= 44 && backBox.height >= 44)).toBe(true);
  expect(cameraControlCount).toBe(1);
  expect(panelButtons.some(button => /close|dismiss/i.test(`${button.text} ${button.ariaLabel}`))).toBe(true);
  await page.screenshot({ path: `/tmp/constellation-audit/${browserName}-mobile-spatial-context.png`, fullPage: true });
});

test('@audit locked visuals remain readable and 200 percent zoom keeps navigation discoverable', async ({ page }) => {
  await installApiFixtures(page);
  await page.setViewportSize({ width: 640, height: 700 });
  await page.goto('mainmenu');
  await page.evaluate(() => { document.body.style.zoom = '2'; });

  const constellation = page.locator('.skill-constellation-panel .constellation-overview');
  await constellation.scrollIntoViewIfNeeded();
  await expect(constellation.locator('.constellation-overview-item').first()).toBeVisible();
  await expect(constellation.locator('.constellation-overview-pager')).toBeVisible();

  await page.evaluate(() => { document.body.style.zoom = '1'; });
  await page.getByRole('button', { name: /Game Art/ }).click();
  const contrast = await page.locator('.skill-constellation-panel .constellation-focus').evaluate(shell => {
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

test.skip('v1.0.0 topic camera manipulation is retired in v1.0.1', async ({ page, browserName }) => {
  await installApiFixtures(page);
  await page.goto('mainmenu');
  const skillConstellations = page.getByLabel('Skill Constellations');
  await expect(skillConstellations).toBeVisible();
  await skillConstellations.scrollIntoViewIfNeeded();
  await skillConstellations.getByRole('button', { name: /Game Art/ }).click();

  const canvas = page.getByRole('group', { name: 'Game Art constellation map' });
  const camera = canvas.locator('.constellation-camera');
  const modelingNode = canvas.locator('.constellation-node').filter({ hasText: '3D Modeling' });
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
  await modelingNode.press('Enter');
  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.locator('.skill-constellation-panel .constellation-focus')).toHaveClass(/is-topic-active/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Game Art' })).toBeVisible();
  const disciplineCameraAfterBack = await camera.getAttribute('transform');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await modelingNode.focus();
  await modelingNode.press('Enter');
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

test('@audit Discipline constellation keeps boundary geometry stable and respects reduced motion', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installApiFixtures(page);
  await page.goto('mainmenu');
  await page.getByRole('button', { name: /Game Art/ }).click();
  const board = page.getByRole('list', { name: 'Game Art constellation; all topic quests' });
  const boundary = board.locator('.discipline-topic-boundary');
  const before = await boundary.getAttribute('d');
  await board.hover();
  await page.mouse.wheel(0, 400);
  const after = await boundary.getAttribute('d');
  const cameraControlCount = await page.locator('.skill-constellation-panel .constellation-camera-controls').count();
  const transitionDuration = await board.locator('.constellation-node-star').first().evaluate(element => getComputedStyle(element).transitionDuration);
  await recordAudit(browserName, 'discipline-board-motion', { before, after, cameraControlCount, transitionDuration });
  expect(after).toBe(before);
  expect(cameraControlCount).toBe(1);
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.001);
});

test('@perf embedded SVG boundary drag benchmark', async ({ page }) => {
  await page.addInitScript(() => {
    const metrics = { getImageDataCalls: 0, longTaskCount: 0, longTaskMs: 0 };
    Object.defineProperty(window, '__constellationPerf', { value: metrics, configurable: true });
    const original = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      metrics.getImageDataCalls += 1;
      return original.apply(this, args as unknown as [number, number, number, number]);
    };
    try {
      new PerformanceObserver(list => list.getEntries().forEach(entry => {
        metrics.longTaskCount += 1;
        metrics.longTaskMs += entry.duration;
      })).observe({ entryTypes: ['longtask'] });
    } catch {
      // Long-task entries are unavailable in a few browser builds.
    }
  });
  await installApiFixtures(page);
  await page.goto('admin');
  await page.getByRole('button', { name: /Constellation Editor/ }).click();
  await page.getByLabel('Choose discipline').selectOption({ label: 'Game Art' });
  const editor = page.getByRole('application', { name: 'Game Art visual layout editor' });
  const star = editor.locator('[data-skill-id="600000000000000000000001"]');
  await expect(editor.locator('.constellation-layout-topic-boundary.is-svg-outline')).toHaveCount(1);
  await star.click();
  let box = await star.boundingBox();
  expect(box).not.toBeNull();
  // Warm browser JIT and the pointer gesture path before measuring the steady-state interaction budget.
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 2, box!.y + box!.height / 2 + 2);
  await page.mouse.up();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  box = await star.boundingBox();
  expect(box).not.toBeNull();
  await page.evaluate(() => {
    const metrics = (window as unknown as { __constellationPerf: { getImageDataCalls: number; longTaskCount: number; longTaskMs: number } }).__constellationPerf;
    metrics.getImageDataCalls = 0;
    metrics.longTaskCount = 0;
    metrics.longTaskMs = 0;
    performance.mark('constellation-drag-start');
  });
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 240, startY + 100, { steps: 30 });
  await page.mouse.up();
  const interactionMs = await page.evaluate(() => {
    performance.mark('constellation-drag-end');
    performance.measure('constellation-drag', 'constellation-drag-start', 'constellation-drag-end');
    return performance.getEntriesByName('constellation-drag').at(-1)?.duration || 0;
  });
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    return (window as unknown as { __constellationPerf: Record<string, number> }).__constellationPerf;
  });
  const result = { ...metrics, interactionMs };
  console.log(`CONSTELLATION_PERF ${JSON.stringify(result)}`);
  expect(result.getImageDataCalls).toBe(0);
  expect(result.longTaskCount).toBe(0);
  expect(result.interactionMs).toBeLessThan(1000);
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
  const modelingNode = page.getByRole('listitem', { name: /3D Modeling, Level 1, 11 quests/ }).getByRole('button', { name: /Blender Setup/ });
  const nodeAccessibleName = await modelingNode.getAttribute('aria-label');
  await modelingNode.focus();
  await modelingNode.press('Enter');
  await expect(page.getByLabel('Blender Setup quest details')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Blender Setup quest details')).toHaveCount(0);
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
    nodeNameIncludesRole: /lesson|boss|capstone/i.test(nodeAccessibleName || ''),
    focusAfterBack,
    focusReturnedToQuest: /Blender Setup/i.test(`${focusAfterBack.ariaLabel || ''} ${focusAfterBack.text || ''}`)
  });
  expect(mainDestinations.every(item => ['BUTTON', 'A'].includes(item.tagName) || (item.role === 'button' && item.tabIndex >= 0))).toBe(true);
  expect(duplicateConstellationHeadings).toBe(1);
  expect(/lesson/i.test(nodeAccessibleName || '')).toBe(true);
  expect(/Blender Setup/i.test(`${focusAfterBack.ariaLabel || ''} ${focusAfterBack.text || ''}`)).toBe(true);
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
      unlockedSkills: [programmingSkills[0]._id, unitySkills[0]._id, gameArtSkills[0]._id, gameArtSkills[1]._id],
      questProgress: {
        completedSteps: [],
        completedQuests: [],
        pendingApprovalSkillIds: [topicSkills[1]._id]
      }
    }))
  }));
  const lockedQuest = topicSkills[3];
  const priorPrerequisites = lockedQuest.prerequisites;
  lockedQuest.prerequisites = ['ffffffffffffffffffffffff'];

  try {
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    const lockedNode = page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Painting' });
    await lockedNode.press('Enter');
    const lockedPanel = page.getByLabel('Painting quest details');
    await expect(lockedPanel).toBeVisible();
    const lockedPanelText = await lockedPanel.innerText();
    const lockedActions = await lockedPanel.getByRole('button').allTextContents();
    const lockedActionDisabled = await lockedPanel.locator('.star-lens-dock__action').isDisabled();

    await lockedPanel.getByRole('button', { name: 'Close quest dock' }).click();
    const pendingNode = page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Basic' });
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
    lockedQuest.prerequisites = priorPrerequisites;
  }
});

test.skip('v1.0.0 focused Topic viewport is retired in v1.0.1', async ({ page, browserName }) => {
  const priorViewport = topicMap.viewport;
  topicMap.viewport = { width: 900, height: 1400, minZoom: 0.6, maxZoom: 1.4 };
  try {
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.constellation-node').filter({ hasText: '3D Modeling' }).click();
    await page.getByRole('button', { name: 'View Path' }).click();
    await expect(page.locator('.constellation-topic-layer')).toBeVisible();

    const skillPanel = page.locator('.skill-constellation-panel');
    const canvas = skillPanel.locator('.constellation-canvas');
    const topicTransform = await skillPanel.locator('.constellation-topic-layer').evaluate(node => node.parentElement?.getAttribute('transform'));
    const viewBox = await canvas.getAttribute('viewBox');
    const cameraBeforeZoomOut = await skillPanel.locator('.constellation-camera').getAttribute('transform');
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    const cameraAfterZoomOut = await skillPanel.locator('.constellation-camera').getAttribute('transform');

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

test('@audit topic quest Star Lens exposes steps and restores keyboard focus', async ({ page, browserName }) => {
  const targetSkill = topicSkills[0];
  const originalSteps = targetSkill.subQuests;
  const questImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="960" height="420"%3E%3Crect width="960" height="420" fill="%2308789b"/%3E%3Ccircle cx="480" cy="210" r="100" fill="%23f3b33d"/%3E%3C/svg%3E';
  targetSkill.subQuests = [
    {
      externalId: 'setup-01',
      title: 'Install Blender',
      description: 'Install the approved Blender version.',
      descriptionParts: [
        { type: 'Text', content: 'Install the **approved** Blender version.' },
        { type: 'Image', content: questImage }
      ]
    },
    { externalId: 'setup-02', title: 'Configure workspace', description: 'Prepare the modeling workspace.' }
  ];
  try {
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    const origin = page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' });
    await origin.focus();
    await origin.press('Enter');

    const starLens = page.getByLabel('Blender Setup quest details');
    await expect(starLens).toBeVisible();
    await expect(origin).toHaveAttribute('aria-controls', 'star-lens-dock');
    await expect(origin).toHaveAttribute('aria-expanded', 'true');
    await expect(starLens.locator('.star-lens-dock__art img')).toHaveAttribute('src', questImage);
    await expect(starLens.getByRole('button', { name: 'Quest steps' })).toHaveAttribute('aria-expanded', 'true');
    await expect(starLens.locator('.star-lens-dock__step-list article')).toHaveCount(2);
    await expect(starLens.locator('.star-lens-dock__step-media img')).toHaveAttribute('src', questImage);
    await expect(starLens.locator('.star-lens-dock__step-details strong')).toHaveText('approved');
    const coverBox = await starLens.locator('.star-lens-dock__art').boundingBox();
    expect(coverBox?.width).toBeGreaterThan(400);
    await starLens.getByRole('button', { name: 'View Blender Setup image' }).click();
    await expect(page.getByRole('dialog', { name: 'Image preview: Blender Setup' })).toBeVisible();
    await page.getByRole('button', { name: 'Close image' }).click();
    await page.waitForTimeout(220);
    await page.screenshot({ path: '/tmp/constellation-visual/topic-quest-star-lens-steps.png', fullPage: true });
    const initial = await starLens.evaluate(node => ({
      role: node.getAttribute('role'),
      containsFocus: node.contains(document.activeElement),
      transitionDuration: getComputedStyle(node).transitionDuration,
      animationName: getComputedStyle(node).animationName
    }));
    await page.keyboard.press('Escape');
    await expect(starLens).toHaveCount(0);
    const focusAfterClose = await page.evaluate(() => ({
      ariaLabel: document.activeElement?.getAttribute('aria-label'),
      text: document.activeElement?.textContent?.trim().slice(0, 80)
    }));

    await recordAudit(browserName, 'topic-quest-star-lens', {
      initial,
      focusAfterClose,
      focusReturnedToOrigin: /Blender Setup/i.test(`${focusAfterClose.ariaLabel || ''} ${focusAfterClose.text || ''}`),
      hasEntryMotion: initial.transitionDuration !== '0s' || initial.animationName !== 'none'
    });
    expect(initial.role).toBe('complementary');
    expect(initial.containsFocus).toBe(true);
    expect(/Blender Setup/i.test(`${focusAfterClose.ariaLabel || ''} ${focusAfterClose.text || ''}`)).toBe(true);
  } finally {
    if (originalSteps) targetSkill.subQuests = originalSteps;
    else delete targetSkill.subQuests;
  }
});

test('topic quest Star Lens renders manually entered bold markdown', async ({ page }) => {
  const targetSkill = topicSkills[0];
  const originalDescription = targetSkill.description;
  targetSkill.description = 'Learn **Blender Setup** through a guided production quest.';

  try {
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' }).press('Enter');

    const starLens = page.getByLabel('Blender Setup quest details');
    await expect(starLens.locator('.star-lens-dock__summary strong')).toHaveText('Blender Setup');
    await expect(page.locator('.guild-selection-modal')).toHaveCount(0);
  } finally {
    targetSkill.description = originalDescription;
  }
});

test('mobile topic quest Star Lens keeps cover and step cards readable', async ({ page }) => {
  const targetSkill = topicSkills[0];
  const originalSteps = targetSkill.subQuests;
  const questImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="960" height="420"%3E%3Crect width="960" height="420" fill="%2308789b"/%3E%3Ccircle cx="480" cy="210" r="100" fill="%23f3b33d"/%3E%3C/svg%3E';
  targetSkill.subQuests = [{
    externalId: 'mobile-step',
    title: 'Create the first model',
    description: 'Follow the reference and submit the finished model.',
    descriptionParts: [
      { type: 'Text', content: 'Follow the reference and submit the finished model.' },
      { type: 'Image', content: questImage }
    ]
  }];
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiFixtures(page);
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' }).press('Enter');

    const starLens = page.getByRole('dialog', { name: 'Blender Setup quest details' });
    await expect(starLens.locator('.star-lens-dock__art img')).toBeVisible();
    await expect(starLens.locator('.star-lens-dock__step-media img')).toBeVisible();
    await expect(starLens.getByRole('button', { name: 'Complete' })).toBeVisible();
    const layout = await starLens.evaluate(element => ({
      width: element.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }));
    expect(layout.width).toBeCloseTo(390, 0);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    await page.waitForTimeout(240);
    await page.screenshot({ path: '/tmp/constellation-visual/mobile-topic-quest-star-lens-steps.png', fullPage: true });
  } finally {
    if (originalSteps) targetSkill.subQuests = originalSteps;
    else delete targetSkill.subQuests;
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
      await expect(page.locator('.skill-constellation-panel .constellation-overview-item')).toHaveCount(6);
      const skillConstellations = page.locator('.skill-constellation-panel .constellation-shell');
      await expect(skillConstellations).toBeVisible();
      await skillConstellations.evaluate(element => element.scrollIntoView({ block: 'start' }));
      const grid = skillConstellations.locator('.constellation-overview-grid');
      const overflow = await grid.evaluate(element => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }));
      const titles = await skillConstellations.locator('.constellation-overview-title').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { text: node.textContent, width: box.width, height: box.height, scrollWidth: (node as HTMLElement).scrollWidth, scrollHeight: (node as HTMLElement).scrollHeight };
      }));
      const visibleCards = await skillConstellations.locator('.constellation-overview-item').evaluateAll(nodes => nodes.filter(node => {
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
  const target = topicSkills[0];
  const priorPreview = target.nodePreview;
  target.nodePreview = { summary: target.description, outcomes: [], actionLabel: 'Open Quest', imageUrl: 'http://localhost:3099/audit-broken-preview.png' };
  try {
    await installApiFixtures(page);
    await page.route('http://localhost:3099/audit-broken-preview.png', route => route.fulfill({ status: 404, body: '' }));
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' }).press('Enter');
    const media = page.getByLabel('Blender Setup preview');
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
    target.nodePreview = priorPreview;
  }
});

test.skip('v1.0.0 Topic loading camera lock is retired in v1.0.1', async ({ page, browserName }) => {
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
  const skillPanel = page.locator('.skill-constellation-panel');
  const camera = skillPanel.locator('.constellation-camera');
  const before = await camera.getAttribute('transform');
  await page.getByRole('button', { name: 'View Path' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Opening topic path...' })).toBeVisible();
  const controlsVisible = await skillPanel.locator('.constellation-camera-controls').isVisible();
  const controlsDisabled = await skillPanel.locator('.constellation-camera-controls button').evaluateAll(buttons => (
    buttons.every(button => (button as HTMLButtonElement).disabled)
  ));
  await skillPanel.locator('.constellation-canvas').dispatchEvent('wheel', { deltaY: -360, clientX: 500, clientY: 500 });
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

test('@audit HamsterQuest Step flow exposes hints, validates proof, and restores focus', async ({ page }) => {
  const target = topicSkills[0] as typeof topicSkills[0] & {
    externalSource?: string;
    externalQuestId?: string;
    subQuests?: Array<Record<string, unknown>>;
  };
  const previous = {
    externalSource: target.externalSource,
    externalQuestId: target.externalQuestId,
    subQuests: target.subQuests
  };
  Object.assign(target, {
    externalSource: 'star-master',
    externalQuestId: 'hamsterquest-quest-01',
    subQuests: [{
      externalId: 'hamsterquest-step-01',
      title: 'Create a production model',
      description: 'Submit a screenshot of the finished model.',
      descriptionParts: [{ type: 'Text', content: 'Use the approved naming convention.' }],
      hintParts: [
        { type: 'Text', content: 'Start from the silhouette before adding details.' },
        { type: 'Image', content: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180"%3E%3Crect width="320" height="180" fill="%2308789b"/%3E%3C/svg%3E' }
      ],
      hasHint: true,
      type: 'ImageNote'
    }]
  });

  let workflow = {
    connected: true,
    externalUserQuestId: 'user-quest-01',
    questStatus: 'Active',
    lifecycleStatus: 'active',
    steps: [{ stepId: 'hamsterquest-step-01', status: 'available' }],
    allStepsApproved: false,
    questCompleted: false
  };
  let submittedBody = '';

  try {
    await installApiFixtures(page);
    await page.route(`http://localhost:3099/api/skills/${target._id}/hamsterquest-workflow`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, workflow })
    }));
    await page.route(`http://localhost:3099/api/skills/${target._id}/hamsterquest-submissions`, async route => {
      submittedBody = route.request().postDataBuffer()?.toString('utf8') || '';
      workflow = {
        ...workflow,
        questStatus: 'Active',
        steps: [{ stepId: 'hamsterquest-step-01', status: 'pending' }]
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, workflow })
      });
    });

    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' }).press('Enter');

    const starLens = page.getByLabel('Blender Setup quest details');
    const submitButton = starLens.getByRole('button', { name: 'Submit', exact: true });
    await expect(submitButton).toBeEnabled();
    await starLens.getByRole('button', { name: 'Show hint' }).click();
    await expect(starLens).toContainText('Start from the silhouette before adding details.');
    await expect(starLens.locator('.star-lens-dock__hint-content img')).toBeVisible();

    await submitButton.click();
    const dialog = page.getByRole('dialog', { name: 'Create a production model' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Message' })).toBeFocused();
    expect(await starLens.evaluate(element => (element as HTMLElement).inert)).toBe(true);
    await page.waitForTimeout(220);
    await expect(starLens).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(submitButton).toBeFocused();

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await submitButton.click();
    const imageInput = dialog.locator('input[type="file"]');
    await imageInput.setInputFiles({
      name: 'too-large.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1)
    });
    await expect(dialog.getByRole('alert')).toHaveText('Image must be 10 MB or smaller.');
    await dialog.getByRole('textbox', { name: 'Message' }).fill('Finished model with clean topology.');
    await expect(dialog).toContainText('35 / 5,000');
    await imageInput.setInputFiles({
      name: 'model-proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8WQAAAABJRU5ErkJggg==', 'base64')
    });
    await expect(dialog.getByAltText('Submission preview')).toBeVisible();
    await page.waitForTimeout(220);
    await expect(starLens).toBeVisible();
    await page.screenshot({ path: '/tmp/constellation-audit/hamsterquest-submission-dialog-dark.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Submit for review' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(starLens.getByRole('button', { name: 'Pending' })).toBeDisabled();
    await expect(starLens).toContainText('Step submitted. HamsterQuest review is now pending.');
    expect(submittedBody).toContain('Finished model with clean topology.');
    expect(submittedBody).toContain('model-proof.png');
    await page.screenshot({ path: '/tmp/constellation-audit/hamsterquest-submission-pending.png', fullPage: true });
  } finally {
    if (previous.externalSource) target.externalSource = previous.externalSource;
    else delete target.externalSource;
    if (previous.externalQuestId) target.externalQuestId = previous.externalQuestId;
    else delete target.externalQuestId;
    if (previous.subQuests) target.subQuests = previous.subQuests;
    else delete target.subQuests;
  }
});

test('@audit mobile HamsterQuest dialog traps focus and only closes its own layer', async ({ page }) => {
  const target = topicSkills[0] as typeof topicSkills[0] & {
    externalSource?: string;
    externalQuestId?: string;
    subQuests?: Array<Record<string, unknown>>;
  };
  const previous = {
    externalSource: target.externalSource,
    externalQuestId: target.externalQuestId,
    subQuests: target.subQuests
  };
  Object.assign(target, {
    externalSource: 'star-master',
    externalQuestId: 'hamsterquest-mobile-quest',
    subQuests: [{ externalId: 'mobile-hq-step', title: 'Mobile proof', description: 'Submit evidence.', type: 'ImageNote' }]
  });

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await installApiFixtures(page);
    await page.route(`http://localhost:3099/api/skills/${target._id}/hamsterquest-workflow`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        workflow: {
          connected: true,
          steps: [{ stepId: 'mobile-hq-step', status: 'available' }],
          allStepsApproved: false,
          questCompleted: false
        }
      })
    }));
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' }).press('Enter');

    const starLens = page.getByRole('dialog', { name: 'Blender Setup quest details' });
    const submitButton = starLens.getByRole('button', { name: 'Submit', exact: true });
    await submitButton.click();
    const submission = page.getByRole('dialog', { name: 'Mobile proof' });
    await expect(submission).toBeVisible();
    await page.waitForTimeout(220);
    await expect(starLens).toBeVisible();
    const first = submission.getByRole('button', { name: 'Close submission' });
    const last = submission.getByRole('button', { name: 'Cancel' });
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    const geometry = await submission.locator('.star-lens-submit__panel').evaluate(element => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewport: innerWidth,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
    await page.keyboard.press('Escape');
    await expect(submission).toHaveCount(0);
    await expect(starLens).toBeVisible();
    await expect(submitButton).toBeFocused();
  } finally {
    if (previous.externalSource) target.externalSource = previous.externalSource;
    else delete target.externalSource;
    if (previous.externalQuestId) target.externalQuestId = previous.externalQuestId;
    else delete target.externalQuestId;
    if (previous.subQuests) target.subQuests = previous.subQuests;
    else delete target.subQuests;
  }
});

test('@audit HamsterQuest setup and rejection states explain the next action', async ({ page }) => {
  const target = topicSkills[0] as typeof topicSkills[0] & {
    externalSource?: string;
    externalQuestId?: string;
    subQuests?: Array<Record<string, unknown>>;
  };
  const previous = {
    externalSource: target.externalSource,
    externalQuestId: target.externalQuestId,
    subQuests: target.subQuests
  };
  Object.assign(target, {
    externalSource: 'star-master',
    externalQuestId: 'hamsterquest-setup-quest',
    subQuests: [{ externalId: 'setup-hq-step', title: 'Connect evidence', description: 'Submit evidence.', type: 'ImageNote' }]
  });
  let workflow: Record<string, unknown> = {
    connected: false,
    setupIssue: 'house-required',
    setupMessage: 'Join at least one active HamsterQuest House before submitting.',
    steps: [{ stepId: 'setup-hq-step', status: 'available' }],
    allStepsApproved: false,
    questCompleted: false
  };

  try {
    await installApiFixtures(page);
    await page.route(`http://localhost:3099/api/skills/${target._id}/hamsterquest-workflow`, route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, workflow })
    }));
    await page.goto('mainmenu');
    await page.getByRole('button', { name: /Game Art/ }).click();
    await page.locator('.discipline-topic-quest-layer .constellation-node').filter({ hasText: 'Blender Setup' }).press('Enter');

    const starLens = page.getByLabel('Blender Setup quest details');
    await expect(starLens).toContainText('Join at least one active HamsterQuest House before submitting.');
    await expect(starLens.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
    await expect(starLens.getByRole('button', { name: 'Setup required' })).toBeDisabled();

    workflow = {
      connected: true,
      questStatus: 'Active',
      lifecycleStatus: 'active',
      steps: [{ stepId: 'setup-hq-step', status: 'rejected' }],
      allStepsApproved: false,
      questCompleted: false
    };
    await starLens.getByRole('button', { name: 'Refresh HamsterQuest review status' }).click();
    await expect(starLens.getByRole('button', { name: 'Resubmit' })).toBeEnabled();
    await expect(starLens).toContainText('Needs revision');
    await expect(starLens).not.toContainText('Join at least one active HamsterQuest House');
  } finally {
    if (previous.externalSource) target.externalSource = previous.externalSource;
    else delete target.externalSource;
    if (previous.externalQuestId) target.externalQuestId = previous.externalQuestId;
    else delete target.externalQuestId;
    if (previous.subQuests) target.subQuests = previous.subQuests;
    else delete target.subQuests;
  }
});
