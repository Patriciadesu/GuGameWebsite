import type { ConstellationMap, ConstellationSkill } from './constellationTypes';
import type { ConstellationLayoutPosition } from './ConstellationLayoutEditor';

const MARGIN = 90;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const autoStyleConstellation = (
  skills: ConstellationSkill[],
  selectedSkillIds: string[],
  currentPositions: Record<string, ConstellationLayoutPosition>,
  map: ConstellationMap
): Record<string, ConstellationLayoutPosition> => {
  const selectedSet = new Set(selectedSkillIds);
  const selected = skills.filter(skill => selectedSet.has(skill._id));
  if (selected.length < 2) return {};

  const order = new Map(selected.map((skill, index) => [skill._id, index]));
  const outgoing = new Map(selected.map(skill => [skill._id, [] as string[]]));
  const incoming = new Map(selected.map(skill => [skill._id, 0]));
  selected.forEach(skill => skill.connections?.forEach(connection => {
    if (!selectedSet.has(connection.targetSkillId) || connection.targetSkillId === skill._id) return;
    outgoing.get(skill._id)!.push(connection.targetSkillId);
    incoming.set(connection.targetSkillId, (incoming.get(connection.targetSkillId) || 0) + 1);
  }));

  const connectionCount = [...outgoing.values()].reduce((total, targets) => total + targets.length, 0);
  if (connectionCount === 0) {
    const current = selected.map((skill, index) => currentPositions[skill._id] || skill.constellationPosition || {
      x: map.viewport.width / 2 + index * 20,
      y: map.viewport.height / 2
    });
    const layoutWidth = Math.min(map.viewport.width - MARGIN * 2, Math.max(280, (selected.length - 1) * 220));
    const centerX = clamp(
      current.reduce((sum, point) => sum + point.x, 0) / current.length,
      MARGIN + layoutWidth / 2,
      map.viewport.width - MARGIN - layoutWidth / 2
    );
    const centerY = clamp(
      current.reduce((sum, point) => sum + point.y, 0) / current.length,
      MARGIN + 90,
      map.viewport.height - MARGIN - 90
    );
    const left = centerX - layoutWidth / 2;
    return Object.fromEntries(selected.map((skill, index) => {
      const x = selected.length === 1 ? centerX : left + index * (layoutWidth / (selected.length - 1));
      const y = centerY + [0, -80, 55, -35][index % 4];
      return [skill._id, {
        x: Math.round(clamp(x, MARGIN, map.viewport.width - MARGIN) / 20) * 20,
        y: Math.round(clamp(y, MARGIN, map.viewport.height - MARGIN) / 20) * 20
      }];
    }));
  }

  const levels = new Map<string, number>();
  const queue = selected.filter(skill => incoming.get(skill._id) === 0).map(skill => skill._id);
  if (queue.length === 0) queue.push(selected[0]._id);
  queue.forEach(id => levels.set(id, 0));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const sourceId = queue[cursor];
    const nextLevel = (levels.get(sourceId) || 0) + 1;
    outgoing.get(sourceId)?.forEach(targetId => {
      if ((levels.get(targetId) ?? -1) < nextLevel) levels.set(targetId, nextLevel);
      incoming.set(targetId, (incoming.get(targetId) || 1) - 1);
      if (incoming.get(targetId) === 0) queue.push(targetId);
    });
  }
  selected.forEach(skill => {
    if (!levels.has(skill._id)) levels.set(skill._id, Math.max(0, ...levels.values()) + 1);
  });

  const columns = new Map<number, ConstellationSkill[]>();
  selected.forEach(skill => {
    const level = levels.get(skill._id) || 0;
    columns.set(level, [...(columns.get(level) || []), skill]);
  });
  const orderedLevels = [...columns.keys()].sort((a, b) => a - b);
  const maxRows = Math.max(...[...columns.values()].map(column => column.length));
  const layoutWidth = Math.min(map.viewport.width - MARGIN * 2, Math.max(280, (orderedLevels.length - 1) * 260));
  const layoutHeight = Math.min(map.viewport.height - MARGIN * 2, Math.max(180, (maxRows - 1) * 190 + 120));
  const current = selected.map((skill, index) => currentPositions[skill._id] || skill.constellationPosition || {
    x: map.viewport.width / 2 + index * 20,
    y: map.viewport.height / 2
  });
  const centerX = clamp(current.reduce((sum, point) => sum + point.x, 0) / current.length, MARGIN + layoutWidth / 2, map.viewport.width - MARGIN - layoutWidth / 2);
  const centerY = clamp(current.reduce((sum, point) => sum + point.y, 0) / current.length, MARGIN + layoutHeight / 2, map.viewport.height - MARGIN - layoutHeight / 2);
  const left = centerX - layoutWidth / 2;
  const top = centerY - layoutHeight / 2;
  const result: Record<string, ConstellationLayoutPosition> = {};

  orderedLevels.forEach((level, columnIndex) => {
    const column = columns.get(level)!.sort((a, b) => (order.get(a._id) || 0) - (order.get(b._id) || 0));
    const x = orderedLevels.length === 1 ? centerX : left + columnIndex * (layoutWidth / (orderedLevels.length - 1));
    column.forEach((skill, rowIndex) => {
      const rowProgress = column.length === 1 ? 0.5 : rowIndex / (column.length - 1);
      const branchY = top + rowProgress * layoutHeight;
      const constellationWobble = column.length === 1 ? ((columnIndex % 3) - 1) * 55 : (columnIndex % 2 === 0 ? -28 : 28);
      result[skill._id] = {
        x: Math.round(clamp(x, MARGIN, map.viewport.width - MARGIN) / 20) * 20,
        y: Math.round(clamp(branchY + constellationWobble, MARGIN, map.viewport.height - MARGIN) / 20) * 20
      };
    });
  });
  return result;
};
