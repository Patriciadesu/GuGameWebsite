import type { ConstellationMap, ConstellationSkill } from './constellationTypes';

export interface ConstellationPoint {
  x: number;
  y: number;
}

export const pointForConstellationSkill = (
  skill: ConstellationSkill,
  index: number,
  count: number,
  map: ConstellationMap
): ConstellationPoint => {
  if (skill.constellationPosition &&
    Number.isFinite(skill.constellationPosition.x) &&
    Number.isFinite(skill.constellationPosition.y)) {
    return skill.constellationPosition;
  }
  const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, count);
  const radius = Math.min(map.viewport.width, map.viewport.height) * 0.3;
  return {
    x: map.viewport.width / 2 + Math.cos(angle) * radius,
    y: map.viewport.height / 2 + Math.sin(angle) * radius
  };
};

export const straightConstellationPath = (source: ConstellationPoint, target: ConstellationPoint) => (
  `M ${source.x} ${source.y} L ${target.x} ${target.y}`
);

export const constellationBranches = (points: Map<string, ConstellationPoint>) => {
  const entries = [...points.entries()];
  if (entries.length < 2) return [];

  const connected = [entries[0]];
  const remaining = entries.slice(1);
  const branches: Array<{
    sourceId: string;
    targetId: string;
    source: ConstellationPoint;
    target: ConstellationPoint;
  }> = [];

  while (remaining.length > 0) {
    let nearest = { connectedIndex: 0, remainingIndex: 0, distance: Number.POSITIVE_INFINITY };
    connected.forEach(([, source], connectedIndex) => {
      remaining.forEach(([, target], remainingIndex) => {
        const distance = Math.hypot(source.x - target.x, source.y - target.y);
        if (distance < nearest.distance) nearest = { connectedIndex, remainingIndex, distance };
      });
    });

    const [sourceId, source] = connected[nearest.connectedIndex];
    const [targetId, target] = remaining.splice(nearest.remainingIndex, 1)[0];
    branches.push({ sourceId, targetId, source, target });
    connected.push([targetId, target]);
  }

  return branches;
};

export const backgroundStarsFor = (map: ConstellationMap, count = 84) => {
  let seed = [...map.slug].reduce((value, character) => (
    (value * 31 + character.charCodeAt(0)) >>> 0
  ), 2166136261);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  return Array.from({ length: count }, (_, index) => ({
    x: random() * map.viewport.width,
    y: random() * map.viewport.height,
    radius: index % 13 === 0 ? 4.2 : index % 5 === 0 ? 2.6 : 1.4,
    opacity: 0.25 + random() * 0.6,
    tone: index % 11 === 0 ? 'gold' : index % 7 === 0 ? 'cyan' : 'white'
  }));
};
