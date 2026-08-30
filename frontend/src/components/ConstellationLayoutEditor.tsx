import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LocateFixed, RotateCcw, Save, Sparkles, ZoomIn, ZoomOut } from 'lucide-react';
import type { ConstellationMap, ConstellationSkill, ConstellationTopicGroup } from './constellationTypes';
import ConstellationNodeGlyph from './ConstellationNodeGlyph';
import {
  pointForConstellationSkill,
  straightConstellationPath
} from './constellationVisuals';
import './ConstellationTree.css';
import { autoStyleConstellation } from './constellationAutoLayout';
import { bakedBoundaryTransform, buildSvgGuideOutline, getSvgGuideImageSize, type BakedSvgGuideBoundary } from './constellationSvgPathfinding';

export interface ConstellationLayoutPosition {
  x: number;
  y: number;
}

interface ConstellationLayoutEditorProps {
  map: ConstellationMap;
  parentMapName?: string;
  skills: ConstellationSkill[];
  topicGroups?: ConstellationTopicGroup[];
  onEmbeddedTopicPositionChange?: (topicMapId: string, skillId: string, position: ConstellationLayoutPosition) => void;
  onEmbeddedTopicVisualChange?: (topicMapId: string, visual: { backgroundAssetUrl: string; bakedBoundary?: BakedSvgGuideBoundary }) => void;
  onVisualChange?: (mapId: string, visual: { backgroundAssetUrl: string; bakedBoundary?: BakedSvgGuideBoundary }) => void;
  embeddedTopicDirtyCount?: number;
  embeddedTopicResetRevision?: number;
  positions: Record<string, ConstellationLayoutPosition>;
  dirtySkillIds: Set<string>;
  selectedSkillId: string;
  disabled?: boolean;
  onSelectSkill: (skillId: string) => void;
  onSelectionChange?: (skillIds: string[]) => void;
  onTapSkill?: (skillId: string) => void;
  onActivateSkill?: (skillId: string) => void;
  onContextMenuSkill?: (skillId: string, clientX: number, clientY: number) => void;
  onPositionChange: (skillId: string, position: ConstellationLayoutPosition) => void;
  onCancel: () => void;
  onSave: () => void;
}

interface EditorGesture {
  type: 'node' | 'pan' | 'select';
  pointerId: number;
  skillId?: string;
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
  startNodeX?: number;
  startNodeY?: number;
  startNodePositions?: Record<string, ConstellationLayoutPosition>;
  startWorldX?: number;
  startWorldY?: number;
  additiveSelection?: boolean;
  initialSelectionIds?: string[];
}

interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const NODE_MARGIN = 46;
const SNAP_SIZE = 20;

interface SvgGuidePoint {
  x: number;
  y: number;
  density: number;
}

interface SvgGuideRouteState {
  point: SvgGuidePoint;
  previous?: string;
  distance: number;
}

const encodeSvgDataUrl = (svgText: string) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`;

const loadSvgImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Unable to render SVG guide.'));
  image.src = source;
});

const chooseGuidePoints = (candidates: SvgGuidePoint[], count: number) => {
  if (candidates.length === 0 || count <= 0) return [];
  const center = candidates.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= candidates.length;
  center.y /= candidates.length;
  const selected = [candidates.reduce((nearest, point) => (
    Math.hypot(point.x - center.x, point.y - center.y) < Math.hypot(nearest.x - center.x, nearest.y - center.y) ? point : nearest
  ), candidates[0])];
  while (selected.length < Math.min(count, candidates.length)) {
    let best: SvgGuidePoint | null = null;
    let bestScore = -1;
    candidates.forEach(candidate => {
      const nearestDistance = Math.min(...selected.map(point => Math.hypot(candidate.x - point.x, candidate.y - point.y)));
      const score = nearestDistance * (0.45 + candidate.density);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    if (!best) break;
    selected.push(best);
  }
  const ordered: SvgGuidePoint[] = [];
  const remaining = [...selected];
  const start = remaining.reduce((top, point) => point.y < top.y || (point.y === top.y && point.x < top.x) ? point : top, remaining[0]);
  ordered.push(start);
  remaining.splice(remaining.indexOf(start), 1);
  while (remaining.length > 0) {
    const previous = ordered[ordered.length - 1];
    const next = remaining.reduce((nearest, point) => (
      Math.hypot(point.x - previous.x, point.y - previous.y) < Math.hypot(nearest.x - previous.x, nearest.y - previous.y) ? point : nearest
    ), remaining[0]);
    ordered.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return ordered;
};

const guidePointKey = (point: SvgGuidePoint) => `${point.x}:${point.y}`;

const segmentStaysOnGuide = (
  source: SvgGuidePoint,
  target: SvgGuidePoint,
  opacityAt: (x: number, y: number) => number
) => {
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  const samples = Math.max(2, Math.ceil(distance / 3));
  for (let index = 1; index < samples; index += 1) {
    const progress = index / samples;
    const x = Math.round(source.x + (target.x - source.x) * progress);
    const y = Math.round(source.y + (target.y - source.y) * progress);
    if (opacityAt(x, y) < 40) return false;
  }
  return true;
};

// Trace a route through the opaque pixels instead of scattering nodes by
// distance. The resulting node sequence follows the guide's shape and every
// straight connection is checked against the guide before it is accepted.
const chooseGuidePathPoints = (
  candidates: SvgGuidePoint[],
  count: number,
  opacityAt: (x: number, y: number) => number
) => {
  if (candidates.length === 0 || count <= 0) return [];
  const byKey = new Map(candidates.map(point => [guidePointKey(point), point]));
  const start = candidates.reduce((top, point) => (
    point.y < top.y || (point.y === top.y && point.x < top.x) ? point : top
  ), candidates[0]);
  const queue = [start];
  const visited = new Map<string, SvgGuideRouteState>([
    [guidePointKey(start), { point: start, distance: 0 }]
  ]);
  let cursor = 0;
  let end = start;
  while (cursor < queue.length) {
    const current = queue[cursor++];
    const currentState = visited.get(guidePointKey(current))!;
    if (currentState.distance > visited.get(guidePointKey(end))!.distance) end = current;
    for (const offsetX of [-5, 0, 5]) {
      for (const offsetY of [-5, 0, 5]) {
        if (offsetX === 0 && offsetY === 0) continue;
        const next = byKey.get(`${current.x + offsetX}:${current.y + offsetY}`);
        if (!next || visited.has(guidePointKey(next))) continue;
        visited.set(guidePointKey(next), {
          point: next,
          previous: guidePointKey(current),
          distance: currentState.distance + 1
        });
        queue.push(next);
      }
    }
  }

  const route: SvgGuidePoint[] = [];
  let routeKey: string | undefined = guidePointKey(end);
  while (routeKey) {
    const state: SvgGuideRouteState = visited.get(routeKey)!;
    route.push(state.point);
    routeKey = state.previous;
  }
  route.reverse();
  if (route.length < count) return chooseGuidePoints(candidates, count);

  const selected = [route[0]];
  let previousIndex = 0;
  for (let slot = 1; slot < count; slot += 1) {
    const idealIndex = Math.round((route.length - 1) * slot / (count - 1));
    const remainingSlots = count - slot - 1;
    const possible = route
      .map((point, index) => ({ point, index }))
      .filter(({ index }) => index > previousIndex && route.length - 1 - index >= remainingSlots)
      .filter(({ point }) => segmentStaysOnGuide(selected[selected.length - 1], point, opacityAt))
      .sort((left, right) => Math.abs(left.index - idealIndex) - Math.abs(right.index - idealIndex));
    const next = possible[0];
    if (!next) return chooseGuidePoints(candidates, count);
    selected.push(next.point);
    previousIndex = next.index;
  }
  return selected;
};

const questOrderForGuide = (skills: ConstellationSkill[]) => {
  // A guide is a visual reading order, so explicit Main numbers take priority
  // over the connection graph. This keeps Main 1, Main 2, Main 3... aligned
  // with the spatial path instead of letting branch insertion reorder them.
  const numbered = skills.map((skill, index) => {
    const label = skill.constellationLabel || skill.title;
    const match = label.match(/\bmain\s*([0-9]+)\b/i);
    return { skill, index, number: match ? Number(match[1]) : null };
  });
  const numberedCount = numbered.filter(item => item.number !== null).length;
  if (numberedCount >= 2) {
    return [...numbered]
      .sort((left, right) => {
        if (left.number === null) return 1;
        if (right.number === null) return -1;
        return left.number - right.number || left.index - right.index;
      })
      .map(item => item.skill);
  }

  const skillIds = new Set(skills.map(skill => skill._id));
  const incoming = new Map(skills.map(skill => [skill._id, 0]));
  skills.forEach(skill => skill.connections?.forEach(connection => {
    if (skillIds.has(connection.targetSkillId)) incoming.set(connection.targetSkillId, (incoming.get(connection.targetSkillId) || 0) + 1);
  }));
  const queue = skills.filter(skill => incoming.get(skill._id) === 0);
  const ordered: ConstellationSkill[] = [];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current._id)) continue;
    visited.add(current._id);
    ordered.push(current);
    current.connections?.forEach(connection => {
      if (!skillIds.has(connection.targetSkillId)) return;
      incoming.set(connection.targetSkillId, (incoming.get(connection.targetSkillId) || 1) - 1);
      if (incoming.get(connection.targetSkillId) === 0) {
        const next = skills.find(skill => skill._id === connection.targetSkillId);
        if (next) queue.push(next);
      }
    });
  }
  return [...ordered, ...skills.filter(skill => !visited.has(skill._id))];
};

const coloredSvgGuidePoints = async (svgDataUrl: string, viewBox: [number, number, number, number], count: number) => {
  const [, , viewBoxWidth, viewBoxHeight] = viewBox;
  const width = 640;
  const height = Math.max(120, Math.round(width * viewBoxHeight / Math.max(1, viewBoxWidth)));
  const image = await loadSvgImage(svgDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const opacityAt = (x: number, y: number) => pixels[(y * width + x) * 4 + 3];
  const candidates: SvgGuidePoint[] = [];
  for (let y = 10; y < height - 10; y += 5) {
    for (let x = 10; x < width - 10; x += 5) {
      if (opacityAt(x, y) < 40) continue;
      let covered = 0;
      for (let sampleY = -8; sampleY <= 8; sampleY += 8) {
        for (let sampleX = -8; sampleX <= 8; sampleX += 8) {
          if (opacityAt(x + sampleX, y + sampleY) >= 40) covered += 1;
        }
      }
      // Keep stars away from transparent/edge pixels. A node placed on the
      // silhouette edge makes its connection line appear to escape the guide.
      if (covered < 7) continue;
      candidates.push({ x, y, density: covered / 9 });
    }
  }
  return chooseGuidePathPoints(candidates, count, opacityAt).map(point => ({
    x: viewBox[0] + point.x / width * viewBoxWidth,
    y: viewBox[1] + point.y / height * viewBoxHeight
  }));
};

const convexHull = (points: Array<{ x: number; y: number }>) => {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const cross = (origin: { x: number; y: number }, left: { x: number; y: number }, right: { x: number; y: number }) =>
    (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const half = (values: Array<{ x: number; y: number }>) => {
    const result: Array<{ x: number; y: number }> = [];
    values.forEach(point => {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
      result.push(point);
    });
    return result;
  };
  return [...half(sorted).slice(0, -1), ...half([...sorted].reverse()).slice(0, -1)];
};

const boundaryPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) return '';
  const padding = 70;
  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x - 110} ${point.y} Q ${point.x - 110} ${point.y - 76} ${point.x} ${point.y - 76} Q ${point.x + 110} ${point.y - 76} ${point.x + 110} ${point.y} Q ${point.x + 110} ${point.y + 76} ${point.x} ${point.y + 76} Q ${point.x - 110} ${point.y + 76} ${point.x - 110} ${point.y} Z`;
  }
  const hull = convexHull(points);
  const center = hull.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= hull.length;
  center.y /= hull.length;
  const expanded = hull.map(point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    return { x: point.x + dx / distance * padding, y: point.y + dy / distance * padding };
  });
  return `${expanded.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`;
};

const guideBoundaryPath = (bounds: { x: number; y: number; width: number; height: number }) => {
  const radius = Math.min(24, bounds.width / 5, bounds.height / 5);
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return `M ${bounds.x + radius} ${bounds.y} H ${right - radius} Q ${right} ${bounds.y} ${right} ${bounds.y + radius} V ${bottom - radius} Q ${right} ${bottom} ${right - radius} ${bottom} H ${bounds.x + radius} Q ${bounds.x} ${bottom} ${bounds.x} ${bottom - radius} V ${bounds.y + radius} Q ${bounds.x} ${bounds.y} ${bounds.x + radius} ${bounds.y} Z`;
};

const editorConnectionPath = (source: ConstellationLayoutPosition, target: ConstellationLayoutPosition) => {
  const distance = Math.hypot(target.x - source.x, target.y - source.y);
  if (distance === 0) return straightConstellationPath(source, target);
  const unitX = (target.x - source.x) / distance;
  const unitY = (target.y - source.y) / distance;
  const sourceInset = Math.min(34, distance * 0.22);
  const targetInset = Math.min(54, distance * 0.3);
  return straightConstellationPath(
    { x: source.x + unitX * sourceInset, y: source.y + unitY * sourceInset },
    { x: target.x - unitX * targetInset, y: target.y - unitY * targetInset }
  );
};

const fallbackPosition = (index: number, map: ConstellationMap): ConstellationLayoutPosition => {
  const columns = Math.max(1, Math.ceil(Math.sqrt(index + 1)));
  return {
    x: Math.min(map.viewport.width - NODE_MARGIN, 180 + (index % columns) * 220),
    y: Math.min(map.viewport.height - NODE_MARGIN, 160 + Math.floor(index / columns) * 180)
  };
};

function ConstellationLayoutEditor({
  map,
  parentMapName,
  skills,
  topicGroups,
  onEmbeddedTopicPositionChange,
  onEmbeddedTopicVisualChange,
  onVisualChange,
  embeddedTopicDirtyCount = 0,
  embeddedTopicResetRevision = 0,
  positions,
  dirtySkillIds,
  selectedSkillId,
  disabled,
  onSelectSkill,
  onSelectionChange,
  onTapSkill,
  onActivateSkill,
  onContextMenuSkill,
  onPositionChange,
  onCancel,
  onSave
}: ConstellationLayoutEditorProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [gesture, setGesture] = useState<EditorGesture | null>(null);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [embeddedSelection, setEmbeddedSelection] = useState<{ topicMapId: string; skillId?: string } | null>(null);
  const [embeddedPositions, setEmbeddedPositions] = useState<Record<string, ConstellationLayoutPosition>>({});
  const [embeddedGuideOutlines, setEmbeddedGuideOutlines] = useState<Record<string, BakedSvgGuideBoundary>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastTapRef = useRef<{ skillId: string; timestamp: number } | null>(null);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 820px)').matches;
    setZoom(mobile ? Math.min(1.5, map.viewport.maxZoom || 3) : 1);
    setPan({ x: 0, y: 0 });
    setSelectedSkillIds(new Set());
    setEmbeddedSelection(null);
    setEmbeddedPositions({});
    setSelectionBox(null);
  }, [embeddedTopicResetRevision, map._id, map.viewport.maxZoom]);

  useEffect(() => {
    if (!selectedSkillId) return;
    setSelectedSkillIds(current => current.has(selectedSkillId) ? current : new Set([selectedSkillId]));
  }, [selectedSkillId]);

  useEffect(() => {
    onSelectionChange?.([...selectedSkillIds]);
  }, [onSelectionChange, selectedSkillIds]);

  const skillIds = useMemo(() => new Set(skills.map(skill => skill._id)), [skills]);
  const embeddedTopicGroups = useMemo(() => {
    if (map.scope !== 'discipline' || !topicGroups?.length) return [];
    return topicGroups.filter(group => group.skills.length > 0).map(group => {
      const gateway = group.gateway;
      const gatewayIndex = gateway ? skills.findIndex(skill => skill._id === gateway._id) : -1;
      const anchor = gateway
        ? positions[gateway._id] || pointForConstellationSkill(gateway, Math.max(0, gatewayIndex), skills.length, map)
        : { x: map.viewport.width / 2, y: map.viewport.height / 2 };
      const sourcePoints = group.skills.map((skill, index) => pointForConstellationSkill(skill, index, group.skills.length, group.map));
      const minX = Math.min(...sourcePoints.map(point => point.x));
      const maxX = Math.max(...sourcePoints.map(point => point.x));
      const minY = Math.min(...sourcePoints.map(point => point.y));
      const maxY = Math.max(...sourcePoints.map(point => point.y));
      const scale = sourcePoints.length <= 1 ? 1 : Math.min(0.46, 560 / Math.max(1, maxX - minX), 400 / Math.max(1, maxY - minY));
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const childSkills = group.skills.map((skill, index) => ({
        ...skill,
        constellationPosition: {
          x: anchor.x + (sourcePoints[index].x - center.x) * scale,
          y: anchor.y + (sourcePoints[index].y - center.y) * scale
        }
      }));
      const points = childSkills.map(skill => skill.constellationPosition!);
      const guideBounds = group.map.visualTheme?.backgroundAssetUrl ? {
        x: Math.min(...points.map(point => point.x)) - 60,
        y: Math.min(...points.map(point => point.y)) - 60,
        width: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) + 120,
        height: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) + 120
      } : undefined;
      return { group, skills: childSkills, points, guideBounds, boundary: guideBounds ? guideBoundaryPath(guideBounds) : boundaryPath(points) };
    });
  }, [map, positions, skills, topicGroups]);
  const isEmbeddedDiscipline = embeddedTopicGroups.length > 0;
  const hasUnsavedChanges = dirtySkillIds.size > 0 || embeddedTopicDirtyCount > 0;
  useEffect(() => {
    if (!isEmbeddedDiscipline) return;
    setEmbeddedPositions(current => {
      const next = { ...current };
      embeddedTopicGroups.forEach(group => group.skills.forEach(skill => {
        if (!next[skill._id]) next[skill._id] = skill.constellationPosition!;
      }));
      return next;
    });
  }, [embeddedTopicGroups, isEmbeddedDiscipline]);
  const visibleEmbeddedTopicGroups = useMemo(() => embeddedTopicGroups.map(group => {
    const nextSkills = group.skills.map(skill => ({
      ...skill,
      constellationPosition: embeddedPositions[skill._id] || skill.constellationPosition
    }));
    const points = nextSkills.map(skill => skill.constellationPosition!);
    const guideBounds = group.guideBounds ? {
      x: Math.min(...points.map(point => point.x)) - 60,
      y: Math.min(...points.map(point => point.y)) - 60,
      width: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) + 120,
      height: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) + 120
    } : undefined;
    return { ...group, skills: nextSkills, points, guideBounds, boundary: guideBounds ? guideBoundaryPath(guideBounds) : boundaryPath(points) };
  }), [embeddedPositions, embeddedTopicGroups]);
  const legacyGuideKey = visibleEmbeddedTopicGroups
    .filter(group => group.guideBounds && group.group.map.visualTheme?.backgroundAssetUrl &&
      (group.group.map.visualTheme.bakedBoundary?.assetUrl !== group.group.map.visualTheme.backgroundAssetUrl || !group.group.map.visualTheme.bakedBoundary?.path))
    .map(group => `${group.group.map._id}:${group.group.map.visualTheme.backgroundAssetUrl}`)
    .join('|');
  useEffect(() => {
    let cancelled = false;
    const guideGroups = visibleEmbeddedTopicGroups.filter(group => group.guideBounds && group.group.map.visualTheme?.backgroundAssetUrl &&
      (group.group.map.visualTheme.bakedBoundary?.assetUrl !== group.group.map.visualTheme.backgroundAssetUrl || !group.group.map.visualTheme.bakedBoundary?.path));
    void Promise.all(guideGroups.map(async group => [
      group.group.map._id,
      {
        path: await buildSvgGuideOutline(group.group.map.visualTheme!.backgroundAssetUrl!, {
          x: 0,
          y: 0,
          width: group.group.map.viewport.width,
          height: group.group.map.viewport.height
        }),
        assetUrl: group.group.map.visualTheme!.backgroundAssetUrl!,
        bounds: { x: 0, y: 0, width: group.group.map.viewport.width, height: group.group.map.viewport.height },
        imageSize: await getSvgGuideImageSize(group.group.map.visualTheme!.backgroundAssetUrl!)
      }
    ] as const)).then(entries => {
      if (!cancelled) setEmbeddedGuideOutlines(Object.fromEntries(entries));
    }).catch(() => {
      if (!cancelled) setEmbeddedGuideOutlines({});
    });
    return () => { cancelled = true; };
  // The expensive raster trace is keyed only by the SVG asset. Dragging Stars
  // changes destination geometry, which is handled by a cheap SVG transform.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyGuideKey]);
  const connectionEdges = useMemo(() => {
    const result: Array<{ sourceId: string; targetId: string; special: boolean }> = [];
    const seen = new Set<string>();
    const addEdge = (sourceId: string, targetId: string, special = false) => {
      if (!skillIds.has(sourceId) || !skillIds.has(targetId) || sourceId === targetId) return;
      const key = `${sourceId}:${targetId}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ sourceId, targetId, special });
    };

    skills.forEach(skill => {
      skill.connections?.forEach(connection => addEdge(
        skill._id,
        connection.targetSkillId,
        connection.connectionType === 'special'
      ));
    });
    return result;
  }, [skillIds, skills]);

  const viewWidth = map.viewport.width / zoom;
  const viewHeight = map.viewport.height / zoom;
  const maxPanX = Math.max(0, (map.viewport.width - viewWidth) / 2);
  const maxPanY = Math.max(0, (map.viewport.height - viewHeight) / 2);
  const panX = Math.max(-maxPanX, Math.min(maxPanX, pan.x));
  const panY = Math.max(-maxPanY, Math.min(maxPanY, pan.y));
  const viewX = (map.viewport.width - viewWidth) / 2 + panX;
  const viewY = (map.viewport.height - viewHeight) / 2 + panY;

  const positionFor = (skill: ConstellationSkill, index: number) => (
    positions[skill._id] || pointForConstellationSkill(skill, index, skills.length, map) || fallbackPosition(index, map)
  );

  const points = useMemo(() => new Map(skills.map((skill, index) => [
    skill._id,
    positions[skill._id] || pointForConstellationSkill(skill, index, skills.length, map)
  ])), [map, positions, skills]);

  const visualEdges = useMemo(() => {
    return connectionEdges.flatMap(edge => {
      const source = points.get(edge.sourceId);
      const target = points.get(edge.targetId);
      return source && target ? [{ ...edge, source, target }] : [];
    });
  }, [connectionEdges, points]);

  const updateZoom = (nextZoom: number) => {
    setZoom(Math.max(map.viewport.minZoom || 0.5, Math.min(map.viewport.maxZoom || 3, nextZoom)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const clientToWorld = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: viewX + ((clientX - rect.left) / rect.width) * viewWidth,
      y: viewY + ((clientY - rect.top) / rect.height) * viewHeight
    };
  };

  const moveNodeGroup = (
    startPositions: Record<string, ConstellationLayoutPosition>,
    anchorSkillId: string,
    rawDeltaX: number,
    rawDeltaY: number
  ) => {
    const entries = Object.entries(startPositions);
    const anchor = startPositions[anchorSkillId];
    if (!anchor || entries.length === 0) return;
    const snappedDeltaX = Math.round((anchor.x + rawDeltaX) / SNAP_SIZE) * SNAP_SIZE - anchor.x;
    const snappedDeltaY = Math.round((anchor.y + rawDeltaY) / SNAP_SIZE) * SNAP_SIZE - anchor.y;
    const minDeltaX = Math.max(...entries.map(([, position]) => NODE_MARGIN - position.x));
    const maxDeltaX = Math.min(...entries.map(([, position]) => map.viewport.width - NODE_MARGIN - position.x));
    const minDeltaY = Math.max(...entries.map(([, position]) => NODE_MARGIN - position.y));
    const maxDeltaY = Math.min(...entries.map(([, position]) => map.viewport.height - NODE_MARGIN - position.y));
    const deltaX = Math.max(minDeltaX, Math.min(maxDeltaX, snappedDeltaX));
    const deltaY = Math.max(minDeltaY, Math.min(maxDeltaY, snappedDeltaY));
    entries.forEach(([skillId, position]) => onPositionChange(skillId, {
      x: position.x + deltaX,
      y: position.y + deltaY
    }));
  };

  const beginGesture = (nextGesture: EditorGesture, onTap?: () => void) => {
    let moved = false;
    let finalSelection = new Set(nextGesture.initialSelectionIds || []);
    setGesture(nextGesture);
    const handleMove = (event: PointerEvent) => {
      if (nextGesture.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - nextGesture.startClientX, event.clientY - nextGesture.startClientY);
      if (distance > 5) moved = true;
      if (nextGesture.type === 'node' && nextGesture.skillId) {
        if (!moved) return;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || !nextGesture.startNodePositions) return;
        moveNodeGroup(
          nextGesture.startNodePositions,
          nextGesture.skillId,
          ((event.clientX - nextGesture.startClientX) / rect.width) * viewWidth,
          ((event.clientY - nextGesture.startClientY) / rect.height) * viewHeight
        );
        return;
      }
      if (nextGesture.type === 'select') {
        const world = clientToWorld(event.clientX, event.clientY);
        if (!world || nextGesture.startWorldX === undefined || nextGesture.startWorldY === undefined) return;
        const box = {
          startX: nextGesture.startWorldX,
          startY: nextGesture.startWorldY,
          currentX: world.x,
          currentY: world.y
        };
        setSelectionBox(box);
        if (!moved) return;
        const left = Math.min(box.startX, box.currentX);
        const right = Math.max(box.startX, box.currentX);
        const top = Math.min(box.startY, box.currentY);
        const bottom = Math.max(box.startY, box.currentY);
        const selected = new Set(nextGesture.additiveSelection ? (nextGesture.initialSelectionIds || []) : []);
        skills.forEach((skill, index) => {
          const point = positionFor(skill, index);
          if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) selected.add(skill._id);
        });
        finalSelection = selected;
        setSelectedSkillIds(selected);
        return;
      }
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPan({
        x: nextGesture.startPanX - ((event.clientX - nextGesture.startClientX) / rect.width) * viewWidth,
        y: nextGesture.startPanY - ((event.clientY - nextGesture.startClientY) / rect.height) * viewHeight
      });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
    const handleEnd = (event: PointerEvent) => {
      if (nextGesture.pointerId !== event.pointerId) return;
      cleanup();
      setGesture(null);
      if (nextGesture.type === 'select') {
        setSelectionBox(null);
        if (!moved) {
          setSelectedSkillIds(new Set());
          onSelectSkill('');
        } else {
          setSelectedSkillIds(finalSelection);
          onSelectSkill(finalSelection.values().next().value || '');
        }
      } else if (event.type === 'pointerup' && !moved) onTap?.();
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  };

  const handleNodeTap = (skillId: string) => {
    if (onTapSkill) {
      onTapSkill(skillId);
      return;
    }
    const timestamp = window.performance.now();
    const previousTap = lastTapRef.current;
    if (previousTap?.skillId === skillId && timestamp - previousTap.timestamp <= 450) {
      lastTapRef.current = null;
      onActivateSkill?.(skillId);
      return;
    }
    lastTapRef.current = { skillId, timestamp };
  };

  const handleWheel = (event: WheelEvent) => {
    const minZoom = map.viewport.minZoom || 0.5;
    const maxZoom = map.viewport.maxZoom || 3;
    const zoomingIn = event.deltaY < 0;
    if ((zoomingIn && zoom >= maxZoom) || (!zoomingIn && zoom <= minZoom)) return;
    event.preventDefault();
    updateZoom(zoom * (zoomingIn ? 1.12 : 0.9));
  };

  useEffect(() => {
    const canvas = svgRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [map.viewport.maxZoom, map.viewport.minZoom, zoom]);

  const handleKeyboard = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!selectedSkillId || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const movingIds = selectedSkillIds.has(selectedSkillId) ? [...selectedSkillIds] : [selectedSkillId];
    const startPositions = Object.fromEntries(movingIds.flatMap(skillId => {
      const index = skills.findIndex(candidate => candidate._id === skillId);
      return index < 0 ? [] : [[skillId, positionFor(skills[index], index)]];
    }));
    if (!startPositions[selectedSkillId]) return;
    event.preventDefault();
    const distance = event.shiftKey ? SNAP_SIZE : 1;
    moveNodeGroup(
      startPositions,
      selectedSkillId,
      event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0,
      event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0
    );
  };

  const theme = map.visualTheme;
  const selectedTopicGroup = embeddedSelection?.topicMapId
    ? topicGroups?.find(group => group.map._id === embeddedSelection.topicMapId)
    : undefined;
  const arrangeFromSvg = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg')) return;
    const topic = selectedTopicGroup;
    const targetSkills = questOrderForGuide(topic?.skills || (map.scope === 'topic' ? skills : skills.filter(skill => selectedSkillIds.has(skill._id))));
    const targetMap = topic?.map || map;
    if (targetSkills.length < 2) return;
    const svgText = await file.text();
    const document = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (document.querySelector('parsererror')) return;
    const root = document.documentElement;
    const viewBox = (root.getAttribute('viewBox') || `0 0 ${targetMap.viewport.width} ${targetMap.viewport.height}`).trim().split(/[ ,]+/).map(Number);
    const [vx, vy, vw, vh] = viewBox.length === 4 && viewBox.every(Number.isFinite) ? viewBox : [0, 0, targetMap.viewport.width, targetMap.viewport.height];
    const svgDataUrl = encodeSvgDataUrl(svgText);
    const markerPoints = [...document.querySelectorAll<SVGGraphicsElement>('[data-star], circle, ellipse, rect')].map(element => {
      const x = Number(element.getAttribute('cx') ?? element.getAttribute('x') ?? 0) + Number(element.getAttribute('width') || 0) / 2;
      const y = Number(element.getAttribute('cy') ?? element.getAttribute('y') ?? 0) + Number(element.getAttribute('height') || 0) / 2;
      return { x, y };
    }).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    let points = markerPoints;
    try {
      const coloredPoints = await coloredSvgGuidePoints(svgDataUrl, [vx, vy, vw, vh], targetSkills.length);
      if (coloredPoints.length >= Math.min(2, targetSkills.length)) points = coloredPoints;
    } catch {
      // Fall back to explicit guide markers and finally to a safe spread when rendering fails.
    }
    while (points.length < targetSkills.length) {
      const index = points.length;
      points.push({ x: vx + vw * (0.18 + 0.64 * (index / Math.max(1, targetSkills.length - 1))), y: vy + vh * (0.5 + ((index % 3) - 1) * 0.18) });
    }
    const imageScale = Math.min(targetMap.viewport.width / vw, targetMap.viewport.height / vh);
    const imageOffsetX = (targetMap.viewport.width - vw * imageScale) / 2;
    const imageOffsetY = (targetMap.viewport.height - vh * imageScale) / 2;
    const next = points.slice(0, targetSkills.length).map(point => ({
      x: Math.round(Math.max(NODE_MARGIN, Math.min(targetMap.viewport.width - NODE_MARGIN, imageOffsetX + (point.x - vx) * imageScale)) / SNAP_SIZE) * SNAP_SIZE,
      y: Math.round(Math.max(NODE_MARGIN, Math.min(targetMap.viewport.height - NODE_MARGIN, imageOffsetY + (point.y - vy) * imageScale)) / SNAP_SIZE) * SNAP_SIZE
    }));
    if (topic) {
      // The embedded canvas keeps a transformed (Discipline-space) cache.
      // Clear affected entries so it immediately re-renders from the freshly
      // updated Topic-space draft positions below.
      setEmbeddedPositions(current => {
        const updated = { ...current };
        targetSkills.forEach(skill => delete updated[skill._id]);
        return updated;
      });
    }
    targetSkills.forEach((skill, index) => {
      if (topic) onEmbeddedTopicPositionChange?.(topic.map._id, skill._id, next[index]);
      else onPositionChange(skill._id, next[index]);
    });
    const backgroundAssetUrl = svgDataUrl;
    const bakedBounds = { x: 0, y: 0, width: targetMap.viewport.width, height: targetMap.viewport.height };
    let bakedBoundary: BakedSvgGuideBoundary | undefined;
    try {
      const path = await buildSvgGuideOutline(backgroundAssetUrl, bakedBounds);
      if (path) bakedBoundary = { path, assetUrl: backgroundAssetUrl, bounds: bakedBounds, imageSize: await getSvgGuideImageSize(backgroundAssetUrl), generatedAt: new Date().toISOString() };
    } catch {
      // The stable one-time fallback will trace the guide on the next load.
    }
    const visual = { backgroundAssetUrl, ...(bakedBoundary ? { bakedBoundary } : {}) };
    if (topic) onEmbeddedTopicVisualChange?.(topic.map._id, visual);
    else onVisualChange?.(map._id, visual);
  };
  const autoStyleSelection = () => {
    const nextPositions = autoStyleConstellation(skills, [...selectedSkillIds], positions, map);
    Object.entries(nextPositions).forEach(([skillId, position]) => onPositionChange(skillId, position));
  };
  const themeStyle = {
    '--constellation-bg': theme?.backgroundColor || '#f7f9fc',
    '--constellation-surface': theme?.surfaceColor || '#ffffff',
    '--constellation-text': theme?.textColor || '#182033',
    '--constellation-muted': theme?.mutedTextColor || '#667085',
    '--constellation-border': theme?.borderColor || '#d9e0ea',
    '--constellation-line': theme?.lineColor || '#8b97aa',
    '--constellation-unlocked': theme?.unlockedColor || '#1677ff',
    '--constellation-available': theme?.availableColor || '#b77900',
    '--constellation-locked': theme?.lockedColor || '#a4adbb',
    '--constellation-boss': theme?.bossColor || '#d63c45',
    '--constellation-capstone': theme?.capstoneColor || '#6d4aff'
  } as CSSProperties;

  const startEmbeddedDrag = (
    event: React.PointerEvent<SVGGElement>,
    topicMapId: string,
    groupSkills: ConstellationSkill[],
    gateway: ConstellationSkill | null | undefined,
    childSkillId?: string
  ) => {
    if (disabled) return;
    // A cluster's artwork can sit underneath a Star. Treat a double click on
    // either surface as opening that cluster, rather than starting a drag on
    // the Star that happened to be under the pointer.
    if (event.detail === 2 && gateway) {
      event.stopPropagation();
      event.preventDefault();
      onActivateSkill?.(gateway._id);
      return;
    }
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    const moveChild = Boolean(childSkillId && embeddedSelection?.topicMapId === topicMapId && embeddedSelection.skillId === childSkillId);
    // First click selects a Star while retaining the convenient "move the
    // whole cluster" drag. A subsequent drag on that selected Star moves it
    // individually, matching the hierarchy behaviour in the Editor.
    setEmbeddedSelection({ topicMapId, skillId: childSkillId });
    const startPositions = Object.fromEntries(groupSkills.map(skill => [skill._id, skill.constellationPosition!])) as Record<string, ConstellationLayoutPosition>;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    let moved = false;
    let pendingTopicPositions: Record<string, ConstellationLayoutPosition> = {};
    let pendingGatewayPosition: ConstellationLayoutPosition | undefined;
    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      const delta = {
        x: ((moveEvent.clientX - event.clientX) / rect.width) * viewWidth,
        y: ((moveEvent.clientY - event.clientY) / rect.height) * viewHeight
      };
      if (Math.hypot(delta.x, delta.y) <= 4) return;
      moved = true;
      if (moveChild && childSkillId) {
        const position = startPositions[childSkillId];
        if (!position) return;
        const next = { x: position.x + delta.x, y: position.y + delta.y };
        pendingTopicPositions = { [childSkillId]: next };
        setEmbeddedPositions(current => ({ ...current, [childSkillId]: next }));
        return;
      }
      const nextPositions = Object.fromEntries(Object.entries(startPositions).map(([skillId, position]) => [skillId, {
        x: position.x + delta.x,
        y: position.y + delta.y
      }])) as Record<string, ConstellationLayoutPosition>;
      pendingTopicPositions = nextPositions;
      setEmbeddedPositions(current => ({ ...current, ...nextPositions }));
      if (gateway) {
        const gatewayPosition = positions[gateway._id] || positionFor(gateway, skills.findIndex(skill => skill._id === gateway._id));
        pendingGatewayPosition = { x: gatewayPosition.x + delta.x, y: gatewayPosition.y + delta.y };
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
    const handleEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId !== event.pointerId) return;
      cleanup();
      if (moved) {
        // Keep pointer-move rendering local. Committing once on pointer-up
        // avoids a second full Admin render for every drag frame.
        Object.entries(pendingTopicPositions).forEach(([skillId, position]) => {
          onEmbeddedTopicPositionChange?.(topicMapId, skillId, position);
        });
        if (gateway && pendingGatewayPosition) onPositionChange(gateway._id, pendingGatewayPosition);
      }
      if (!moved) setEmbeddedSelection({ topicMapId, skillId: childSkillId });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
  };

  return (
    <div className={`constellation-layout-editor constellation-shell constellation-focus ${isEmbeddedDiscipline ? 'is-embedded-discipline' : ''}`} style={themeStyle}>
      <header className="constellation-layout-simple-header">
        <div>
          <p>{parentMapName || (map.scope === 'discipline' ? 'Sky' : 'Star Cluster')}</p>
          <h2>{map.name}</h2>
        </div>
        <div className="constellation-layout-simple-actions">
          {selectedSkillIds.size > 1 && <span className="constellation-layout-selection-count">{selectedSkillIds.size} selected</span>}
          <button type="button" className="constellation-admin-secondary" disabled={disabled || (selectedSkillIds.size < 2 && !selectedTopicGroup && map.scope !== 'topic')} onClick={() => (selectedTopicGroup || map.scope === 'topic') ? fileInputRef.current?.click() : autoStyleSelection()} title={(selectedTopicGroup || map.scope === 'topic') ? 'Arrange this star cluster from an SVG constellation guide' : 'Arrange selected stars from their connections'}><Sparkles size={15} aria-hidden="true" /> Auto Layout</button>
          <input ref={fileInputRef} type="file" accept=".svg,image/svg+xml" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void arrangeFromSvg(file); event.currentTarget.value = ''; }} />
          {hasUnsavedChanges && <span className="constellation-layout-dirty-count is-dirty">Unsaved</span>}
          <button type="button" className="constellation-admin-secondary" disabled={disabled || !hasUnsavedChanges} onClick={onCancel}><RotateCcw size={15} aria-hidden="true" /> Cancel</button>
          <button type="button" className="constellation-admin-primary" disabled={disabled || !hasUnsavedChanges} onClick={onSave} title="Save (Ctrl+S)"><Save size={15} aria-hidden="true" /> Save</button>
        </div>
      </header>

      <div className={`constellation-canvas-wrap constellation-layout-canvas-wrap ${gesture?.type === 'pan' ? 'is-panning' : ''}`}>
        {skills.length > 0 && (
          <div className="constellation-layout-view-controls" aria-label="Layout view controls">
            <button type="button" onClick={() => updateZoom(zoom * 1.2)} disabled={disabled} title="Zoom in" aria-label="Zoom in"><ZoomIn aria-hidden="true" /></button>
            <button type="button" onClick={resetView} disabled={disabled} title="Center constellation" aria-label="Center constellation"><LocateFixed aria-hidden="true" /></button>
            <button type="button" onClick={() => updateZoom(zoom * 0.8)} disabled={disabled} title="Zoom out" aria-label="Zoom out"><ZoomOut aria-hidden="true" /></button>
            <span className="constellation-layout-zoom-value" aria-label={`Zoom ${Math.round(zoom * 100)} percent`}>{Math.round(zoom * 100)}%</span>
          </div>
        )}
        {skills.length === 0 ? (
          <div className="constellation-layout-empty">Assign a quest to this map to begin arranging its constellation.</div>
        ) : (
          <svg
            ref={svgRef}
            className="constellation-canvas constellation-layout-canvas"
            viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
            role="application"
            aria-label={`${map.name} visual layout editor`}
            tabIndex={0}
            onKeyDown={handleKeyboard}
            onPointerDown={event => {
              if ((event.target as Element).closest('.constellation-layout-node')) return;
              const shouldPan = event.pointerType !== 'mouse' || event.button === 1 || event.altKey;
              if (!shouldPan && event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const world = clientToWorld(event.clientX, event.clientY);
              if (!shouldPan && world) {
                beginGesture({
                  type: 'select',
                  pointerId: event.pointerId,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startPanX: panX,
                  startPanY: panY,
                  startWorldX: world.x,
                  startWorldY: world.y,
                  additiveSelection: event.shiftKey || event.metaKey || event.ctrlKey,
                  initialSelectionIds: [...selectedSkillIds]
                });
                setSelectionBox({ startX: world.x, startY: world.y, currentX: world.x, currentY: world.y });
                return;
              }
              beginGesture({
                type: 'pan',
                pointerId: event.pointerId,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startPanX: panX,
                startPanY: panY
              });
            }}
          >
            <defs>
              <pattern id={`constellation-admin-grid-${map._id}`} width="54" height="54" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.6" fill="var(--constellation-border)" opacity="0.52" />
              </pattern>
              <filter id="constellation-glow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <marker id={`constellation-editor-arrow-${map._id}`} className="constellation-layout-arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto" markerUnits="strokeWidth">
                <path d="M 1 1 L 11 6 L 1 11 Z" />
              </marker>
              <marker id={`constellation-editor-special-arrow-${map._id}`} className="constellation-layout-arrow is-special" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto" markerUnits="strokeWidth">
                <path d="M 1 1 L 11 6 L 1 11 Z" />
              </marker>
            </defs>
            <rect width={map.viewport.width} height={map.viewport.height} fill="var(--constellation-bg)" pointerEvents="none" />
            <rect width={map.viewport.width} height={map.viewport.height} fill={`url(#constellation-admin-grid-${map._id})`} pointerEvents="none" />
            {map.scope === 'topic' && map.visualTheme?.backgroundAssetUrl && <image
              className="constellation-layout-map-background"
              href={map.visualTheme.backgroundAssetUrl}
              x="0"
              y="0"
              width={map.viewport.width}
              height={map.viewport.height}
              preserveAspectRatio="xMidYMid meet"
              pointerEvents="none"
            />}
            <g className="constellation-lines constellation-layout-lines" aria-hidden="true">
              {visualEdges.map(edge => (
                <path
                  key={`${edge.sourceId}-${edge.targetId}`}
                  className={edge.special ? 'is-special' : ''}
                  d={editorConnectionPath(edge.source, edge.target)}
                  markerEnd={`url(#constellation-editor-${edge.special ? 'special-arrow' : 'arrow'}-${map._id})`}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            {map.scope === 'discipline' && visualEdges.map(edge => (
              <circle
                className="constellation-link-star"
                key={`marker-${edge.sourceId}-${edge.targetId}`}
                cx={(edge.source.x + edge.target.x) / 2}
                cy={(edge.source.y + edge.target.y) / 2}
                r="5"
              />
            ))}
            {isEmbeddedDiscipline && <g className="constellation-layout-embedded-topics">
              {visibleEmbeddedTopicGroups.map(({ group, skills: topicSkills, points, guideBounds, boundary }) => {
                const bakedBoundary = group.map.visualTheme?.bakedBoundary?.assetUrl === group.map.visualTheme?.backgroundAssetUrl
                  ? group.map.visualTheme.bakedBoundary
                  : embeddedGuideOutlines[group.map._id];
                return (
                <g
                  key={group.map._id}
                  className={`constellation-layout-embedded-topic ${group.map.visualTheme?.backgroundAssetUrl ? 'is-svg-guide' : ''}`}
                  role="group"
                  aria-label={`${group.map.name} topic, ${topicSkills.length} quests`}
                  onPointerDown={event => {
                    if (event.button === 2) return;
                    if (event.detail === 2 && group.gateway) {
                      event.stopPropagation();
                      onActivateSkill?.(group.gateway._id);
                      return;
                    }
                    startEmbeddedDrag(event, group.map._id, topicSkills, group.gateway);
                  }}
                  onDoubleClick={() => group.gateway && onActivateSkill?.(group.gateway._id)}
                  onContextMenu={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (group.gateway) {
                      onSelectSkill(group.gateway._id);
                      onSelectionChange?.([group.gateway._id]);
                      onContextMenuSkill?.(group.gateway._id, event.clientX, event.clientY);
                    }
                  }}
                >
                  {group.map.visualTheme?.backgroundAssetUrl && <image
                    className="constellation-layout-topic-background"
                    href={group.map.visualTheme.backgroundAssetUrl}
                    x={Math.min(...points.map(point => point.x)) - 60}
                    y={Math.min(...points.map(point => point.y)) - 60}
                    width={Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) + 120}
                    height={Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) + 120}
                    preserveAspectRatio="xMidYMid meet"
                    pointerEvents="none"
                  />}
                  <path
                    className={`constellation-layout-topic-boundary ${bakedBoundary ? 'is-svg-outline' : ''}`}
                    d={bakedBoundary?.path || boundary}
                    transform={bakedBoundary && guideBounds ? bakedBoundaryTransform(bakedBoundary, guideBounds) : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text className="constellation-layout-topic-eyebrow" x={Math.min(...points.map(point => point.x)) + 12} y={Math.min(...points.map(point => point.y)) - 94}>TOPIC · LEVEL {group.map.level || 1}</text>
                  <text className="constellation-layout-topic-title" x={Math.min(...points.map(point => point.x)) + 12} y={Math.min(...points.map(point => point.y)) - 66}>{group.map.name}</text>
                  <g className="constellation-lines constellation-layout-topic-lines" aria-hidden="true">
                    {topicSkills.flatMap(source => (source.connections || []).flatMap(connection => {
                      const target = topicSkills.find(skill => skill._id === connection.targetSkillId);
                      if (!target || !source.constellationPosition || !target.constellationPosition) return [];
                      return <path key={`${source._id}-${target._id}`} d={editorConnectionPath(source.constellationPosition, target.constellationPosition)} markerEnd={`url(#constellation-editor-${connection.connectionType === 'special' ? 'special-arrow' : 'arrow'}-${map._id})`} vectorEffect="non-scaling-stroke" />;
                    }))}
                  </g>
                  {topicSkills.map(skill => {
                    const point = skill.constellationPosition!;
                    return <g
                      key={skill._id}
                      data-skill-id={skill._id}
                      className={`constellation-node constellation-layout-embedded-node role-${skill.mapNodeRole || 'lesson'}`}
                      transform={`translate(${point.x} ${point.y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${skill.constellationLabel || skill.title}, ${skill.mapNodeRole || 'lesson'}, in ${group.map.name}`}
                      onPointerDown={event => {
                        onSelectSkill(skill._id);
                        onSelectionChange?.([skill._id]);
                        if (event.button === 2) return;
                        startEmbeddedDrag(event, group.map._id, topicSkills, group.gateway, skill._id);
                      }}
                      onDoubleClick={event => {
                        event.stopPropagation();
                        onActivateSkill?.(group.gateway?._id || skill._id);
                      }}
                      onContextMenu={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectSkill(skill._id);
                        onSelectionChange?.([skill._id]);
                        onContextMenuSkill?.(skill._id, event.clientX, event.clientY);
                      }}
                      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivateSkill?.(skill._id); } }}
                    >
                      <ConstellationNodeGlyph skill={skill} label={skill.constellationLabel || skill.title} labelOnLeft={point.x > map.viewport.width * 0.74} labelY={6} />
                    </g>;
                  })}
                </g>
                );
              })}
            </g>}
            {selectionBox && (
              <rect
                className="constellation-layout-marquee"
                x={Math.min(selectionBox.startX, selectionBox.currentX)}
                y={Math.min(selectionBox.startY, selectionBox.currentY)}
                width={Math.abs(selectionBox.currentX - selectionBox.startX)}
                height={Math.abs(selectionBox.currentY - selectionBox.startY)}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            <g className="constellation-layout-nodes">
              {skills.map((skill, index) => {
                const position = positionFor(skill, index);
                const role = skill.mapNodeRole || 'lesson';
                const labelOnLeft = position.x > map.viewport.width * 0.74;
                const hasCloseHorizontalNeighbor = skills.some((candidate, candidateIndex) => {
                  if (candidate._id === skill._id) return false;
                  const candidatePoint = positionFor(candidate, candidateIndex);
                  return Math.abs(candidatePoint.y - position.y) < 80 && Math.abs(candidatePoint.x - position.x) < 360;
                });
                const labelY = hasCloseHorizontalNeighbor ? (index % 2 === 0 ? -30 : 38) : 6;
                return (
                  <g
                    key={skill._id}
                    data-skill-id={skill._id}
                    className={`constellation-node is-available constellation-layout-node role-${role} ${selectedSkillIds.has(skill._id) ? 'is-selected' : ''} ${dirtySkillIds.has(skill._id) ? 'is-dirty' : ''}`}
                    transform={`translate(${position.x} ${position.y})`}
                    role="button"
                    tabIndex={selectedSkillId === skill._id || (!selectedSkillId && index === 0) ? 0 : -1}
                    aria-label={`${skill.constellationLabel || skill.title}, ${role}${map.scope === 'discipline' ? ', double click to open topic' : ''}`}
                    onKeyDown={event => {
                      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        onSelectSkill(skill._id);
                        onContextMenuSkill?.(skill._id, bounds.right, bounds.top);
                        return;
                      }
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onSelectSkill(skill._id);
                      if (event.key === 'Enter') onActivateSkill?.(skill._id);
                      else onTapSkill?.(skill._id);
                    }}
                    onPointerDown={event => {
                      if (disabled) return;
                      event.stopPropagation();
                      if (event.button !== 0) {
                        setSelectedSkillIds(new Set([skill._id]));
                        onSelectSkill(skill._id);
                        return;
                      }
                      event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                      let movingSelection = selectedSkillIds;
                      if (event.shiftKey || event.metaKey || event.ctrlKey) {
                        movingSelection = new Set(selectedSkillIds);
                        if (movingSelection.has(skill._id)) movingSelection.delete(skill._id);
                        else movingSelection.add(skill._id);
                        setSelectedSkillIds(movingSelection);
                        onSelectSkill(movingSelection.has(skill._id) ? skill._id : movingSelection.values().next().value || '');
                        if (!movingSelection.has(skill._id)) return;
                      } else if (!selectedSkillIds.has(skill._id)) {
                        movingSelection = new Set([skill._id]);
                        setSelectedSkillIds(movingSelection);
                        onSelectSkill(skill._id);
                      } else {
                        onSelectSkill(skill._id);
                      }
                      const startNodePositions = Object.fromEntries([...movingSelection].flatMap(selectedId => {
                        const selectedIndex = skills.findIndex(candidate => candidate._id === selectedId);
                        return selectedIndex < 0 ? [] : [[selectedId, positionFor(skills[selectedIndex], selectedIndex)]];
                      }));
                      beginGesture({
                        type: 'node',
                        pointerId: event.pointerId,
                        skillId: skill._id,
                        startClientX: event.clientX,
                        startClientY: event.clientY,
                        startPanX: panX,
                        startPanY: panY,
                        startNodeX: position.x,
                        startNodeY: position.y,
                        startNodePositions
                      }, () => handleNodeTap(skill._id));
                    }}
                    onContextMenu={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedSkillIds(new Set([skill._id]));
                      onSelectSkill(skill._id);
                      onContextMenuSkill?.(skill._id, event.clientX, event.clientY);
                    }}
                  >
                    {selectedSkillIds.has(skill._id) && <circle className="constellation-layout-selection-ring" r={role === 'capstone' ? 58 : 46} />}
                    <ConstellationNodeGlyph
                      skill={skill}
                      label={skill.constellationLabel || skill.title}
                      labelOnLeft={labelOnLeft}
                      labelY={labelY}
                      isStart={index === 0 && map.scope === 'topic'}
                    />
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}

export default ConstellationLayoutEditor;
