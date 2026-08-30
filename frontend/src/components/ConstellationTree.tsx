import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import axios from '../config/axios';
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { ConstellationMap, ConstellationSkill, ConstellationTopicGroup } from './constellationTypes';
import ConstellationNodeGlyph from './ConstellationNodeGlyph';
import { mainQuestVisualStatus, resolveMainQuestStatus } from './mainQuestStatus';
import {
  backgroundStarsFor,
  pointForConstellationSkill as pointForSkill,
  straightConstellationPath as pathBetween
} from './constellationVisuals';
import { bakedBoundaryTransform, buildSvgGuideOutline, buildSvgGuideRoutes, getSvgGuideImageSize, type BakedSvgGuideBoundary } from './constellationSvgPathfinding';
import './ConstellationTree.css';

interface ConstellationTreeProps {
  disciplineMaps: ConstellationMap[];
  heading?: string;
  idPrefix?: string;
  refreshRevision?: number;
  unlockedSkillIds: string[];
  pendingSkillIds: string[];
  canUnlockSkill: (skill: ConstellationSkill) => boolean;
  onOpenSkill: (skill: ConstellationSkill, interaction?: 'pointer' | 'keyboard', trigger?: HTMLElement | SVGElement) => void;
  onOpenTopicInfo?: (
    skill: ConstellationSkill,
    openPath: () => void,
    interaction?: 'pointer' | 'keyboard',
    trigger?: HTMLElement | SVGElement
  ) => void;
  userLevel?: number;
  compactOverview?: boolean;
  selectedSkillId?: string | null;
  directMap?: boolean;
}

interface MapDetail {
  map: ConstellationMap;
  skills: ConstellationSkill[];
  topicGroups?: ConstellationTopicGroup[];
  svgGuideBounds?: { x: number; y: number; width: number; height: number };
  svgGuideSourceBounds?: { x: number; y: number; width: number; height: number };
}

interface Camera {
  zoom: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

const convexHull = (points: Point[]): Point[] => {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const cross = (origin: Point, left: Point, right: Point) =>
    (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const half = (values: Point[]) => {
    const result: Point[] = [];
    values.forEach(point => {
      while (result.length >= 2 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
      result.push(point);
    });
    return result;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

const boundaryPathFor = (points: Point[], paddingOverride?: number): string => {
  if (points.length === 0) return '';
  const padding = paddingOverride ?? 82;
  if (points.length === 1) {
    const [{ x, y }] = points;
    return `M ${x - 132} ${y} Q ${x - 132} ${y - 92} ${x} ${y - 92} Q ${x + 132} ${y - 92} ${x + 132} ${y} Q ${x + 132} ${y + 92} ${x} ${y + 92} Q ${x - 132} ${y + 92} ${x - 132} ${y} Z`;
  }
  if (points.length === 2) {
    const [start, end] = points;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const normal = { x: -dy / length * padding, y: dx / length * padding };
    return `M ${start.x + normal.x} ${start.y + normal.y} L ${end.x + normal.x} ${end.y + normal.y} A ${padding} ${padding} 0 0 1 ${end.x - normal.x} ${end.y - normal.y} L ${start.x - normal.x} ${start.y - normal.y} A ${padding} ${padding} 0 0 1 ${start.x + normal.x} ${start.y + normal.y} Z`;
  }
  const hull = convexHull(points);
  const center = hull.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= hull.length;
  center.y /= hull.length;
  const expanded = hull.map(point => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    return { x: point.x + dx / length * padding, y: point.y + dy / length * padding };
  });
  return `${expanded.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`;
};

const guideBoundaryPath = (bounds: NonNullable<MapDetail['svgGuideBounds']>) => {
  const radius = Math.min(28, bounds.width / 5, bounds.height / 5);
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  return `M ${bounds.x + radius} ${bounds.y} H ${right - radius} Q ${right} ${bounds.y} ${right} ${bounds.y + radius} V ${bottom - radius} Q ${right} ${bottom} ${right - radius} ${bottom} H ${bounds.x + radius} Q ${bounds.x} ${bottom} ${bounds.x} ${bottom - radius} V ${bounds.y + radius} Q ${bounds.x} ${bounds.y} ${bounds.x + radius} ${bounds.y} Z`;
};

const placeTopicGroupInDiscipline = (
  group: ConstellationTopicGroup,
  discipline: ConstellationMap,
  anchor: Point,
  options: { maxArtworkWidth?: number; maxArtworkHeight?: number; maxScale?: number } = {}
): MapDetail => {
  const sourcePoints = group.skills.map((skill, index) =>
    pointForSkill(skill, index, group.skills.length, group.map)
  );
  // Transform the SVG and its stars from the same source viewport. Scaling
  // only the star bounds distorts the guide and makes valid connections look
  // as if they leave the silhouette on the Discipline board.
  const sourceWidth = Math.max(1, group.map.viewport.width);
  const sourceHeight = Math.max(1, group.map.viewport.height);
  const scale = sourcePoints.length === 1
    ? Math.min(options.maxScale ?? 1, (options.maxArtworkWidth || sourceWidth) / sourceWidth, (options.maxArtworkHeight || sourceHeight) / sourceHeight)
    : Math.min(options.maxScale ?? 0.46, (options.maxArtworkWidth || 560) / sourceWidth, (options.maxArtworkHeight || 400) / sourceHeight);
  const center = { x: sourceWidth / 2, y: sourceHeight / 2 };
  const rawPoints = sourcePoints.map(point => ({
    x: anchor.x + (point.x - center.x) * scale,
    y: anchor.y + (point.y - center.y) * scale
  }));
  const guideBounds = {
    minX: anchor.x - sourceWidth * scale / 2,
    maxX: anchor.x + sourceWidth * scale / 2,
    minY: anchor.y - sourceHeight * scale / 2,
    maxY: anchor.y + sourceHeight * scale / 2
  };
  const padding = 78;
  const shiftX = guideBounds.minX < padding
    ? padding - guideBounds.minX
    : guideBounds.maxX > discipline.viewport.width - padding
      ? discipline.viewport.width - padding - guideBounds.maxX
      : 0;
  const shiftY = guideBounds.minY < padding
    ? padding - guideBounds.minY
    : guideBounds.maxY > discipline.viewport.height - padding
      ? discipline.viewport.height - padding - guideBounds.maxY
      : 0;
  return {
    map: {
      ...discipline,
      visualTheme: {
        ...discipline.visualTheme,
        backgroundAssetUrl: group.map.visualTheme?.backgroundAssetUrl,
        bakedBoundary: group.map.visualTheme?.bakedBoundary
      }
    },
    svgGuideBounds: {
      x: guideBounds.minX + shiftX,
      y: guideBounds.minY + shiftY,
      width: sourceWidth * scale,
      height: sourceHeight * scale
    },
    svgGuideSourceBounds: { x: 0, y: 0, width: sourceWidth, height: sourceHeight },
    skills: group.skills.map((skill, index) => ({
      ...skill,
      constellationPosition: {
        x: rawPoints[index].x + shiftX,
        y: rawPoints[index].y + shiftY
      }
    }))
  };
};

const fallbackTheme = {
  backgroundColor: '#edf3f8',
  surfaceColor: '#ffffff',
  textColor: '#14263a',
  mutedTextColor: '#52677b',
  borderColor: '#bdcbd7',
  lineColor: '#8298aa',
  unlockedColor: '#087f9b',
  availableColor: '#9a6500',
  lockedColor: '#687b8c',
  bossColor: '#b42335',
  capstoneColor: '#6941c6'
};

const astralFantasyTheme = {
  backgroundColor: '#080b1d',
  surfaceColor: '#111936',
  textColor: '#f7f0df',
  mutedTextColor: '#b3c0db',
  borderColor: '#3d5078',
  lineColor: '#8da2c8',
  unlockedColor: '#53d9ff',
  availableColor: '#ffc65b',
  lockedColor: '#7d8aa5',
  bossColor: '#ff6b86',
  capstoneColor: '#b89cff'
};

// GuGame's curated guide files include the approved visual route spine.  Their
// geometry is already baked and does not need a fresh bitmap/BFS pass every
// time a dense Discipline board opens.  Legacy/uploads continue to use the
// route solver below.
const hasBakedGuideSpine = (assetUrl?: string) => Boolean(assetUrl?.match(/^\/gugame\/constellation-guides\/(game-art|system)-/));

type ConstellationHistoryState =
  | { view: 'overview' }
  | { view: 'discipline'; disciplineId: string }
  | { view: 'topic'; disciplineId: string; gatewayId: string; topicMapId: string };

const readableLockedColor = (backgroundColor: string, lockedColor: string) => {
  const parseHex = (value: string) => {
    const match = /^#([\da-f]{6})$/i.exec(value);
    return match ? [1, 3, 5].map(index => Number.parseInt(match[1].slice(index - 1, index + 1), 16)) : null;
  };
  const luminance = (rgb: number[]) => rgb
    .map(channel => channel / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const background = parseHex(backgroundColor);
  const locked = parseHex(lockedColor);
  if (!background || !locked) return fallbackTheme.lockedColor;
  const [lighter, darker] = [luminance(background), luminance(locked)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05) >= 3 ? lockedColor : fallbackTheme.lockedColor;
};

function ConstellationTree({
  disciplineMaps,
  heading = 'Skill Constellations',
  idPrefix = 'skill-constellation',
  refreshRevision = 0,
  unlockedSkillIds,
  pendingSkillIds,
  canUnlockSkill,
  onOpenSkill,
  onOpenTopicInfo,
  userLevel = 1,
  compactOverview = false,
  selectedSkillId = null,
  directMap = false
}: ConstellationTreeProps) {
  const labelForSkill = (skill: ConstellationSkill) => skill.constellationLabel || skill.title;
  const [disciplineDetails, setDisciplineDetails] = useState<Record<string, MapDetail>>({});
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string | null>(null);
  const [topicGateway, setTopicGateway] = useState<ConstellationSkill | null>(null);
  const [topicDetail, setTopicDetail] = useState<MapDetail | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const [overviewIndex, setOverviewIndex] = useState(0);
  const [isDirectManipulating, setIsDirectManipulating] = useState(false);
  const [svgGuideRoutes, setSvgGuideRoutes] = useState<Record<string, string>>({});
  const [svgGuideOutlines, setSvgGuideOutlines] = useState<Record<string, BakedSvgGuideBoundary>>({});
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const canvasRef = useRef<SVGSVGElement | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const overviewGridRef = useRef<HTMLDivElement | null>(null);
  const disciplineCameraRef = useRef<Camera>({ zoom: 1, x: 0, y: 0 });
  const originGatewayIdRef = useRef<string | null>(null);
  const originDisciplineIdRef = useRef<string | null>(null);
  const topicRefreshRevisionRef = useRef(refreshRevision);

  const writeHistory = (state: ConstellationHistoryState, mode: 'push' | 'replace' = 'push') => {
    const nextState = { ...window.history.state, constellationView: state };
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](nextState, '', window.location.href);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all(disciplineMaps.map(map => axios.get(`/api/constellation-maps/${map._id}`)))
      .then(responses => {
        if (cancelled) return;
        setDisciplineDetails(Object.fromEntries(responses.map(response => [
          response.data.map._id,
          {
            map: response.data.map,
            skills: response.data.skills || [],
            topicGroups: response.data.topicGroups || []
          }
        ])));
        if (directMap && responses[0]?.data?.map?._id) {
          setSelectedDisciplineId(responses[0].data.map._id);
          originDisciplineIdRef.current = responses[0].data.map._id;
        }
      })
      .catch(() => {
        if (!cancelled) setError('Constellation data is temporarily unavailable.');
      });
    return () => { cancelled = true; };
  }, [disciplineMaps, refreshRevision]);

  useEffect(() => {
    const topicMapId = topicDetail?.map._id;
    if (!topicMapId) {
      topicRefreshRevisionRef.current = refreshRevision;
      return;
    }
    if (topicRefreshRevisionRef.current === refreshRevision) return;
    topicRefreshRevisionRef.current = refreshRevision;

    let cancelled = false;
    axios.get(`/api/constellation-maps/${topicMapId}`)
      .then(response => {
        if (!cancelled) {
          setTopicDetail({ map: response.data.map, skills: response.data.skills || [] });
        }
      })
      .catch(() => {
        if (!cancelled) setError('Unable to refresh this topic path.');
      });
    return () => { cancelled = true; };
  }, [refreshRevision, topicDetail?.map._id]);

  useEffect(() => {
    if (!window.history.state?.constellationView) writeHistory({ view: 'overview' }, 'replace');

    const restoreHistory = async (event: PopStateEvent) => {
      const state = event.state?.constellationView as ConstellationHistoryState | undefined;
      setError('');
      if (!state || state.view === 'overview') {
        setSelectedDisciplineId(null);
        setTopicGateway(null);
        setTopicDetail(null);
        resetCamera();
        return;
      }

      setSelectedDisciplineId(state.disciplineId);
      originDisciplineIdRef.current = state.disciplineId;
      if (state.view === 'discipline') {
        setTopicGateway(null);
        setTopicDetail(null);
        setCamera(disciplineCameraRef.current);
        const gatewayId = originGatewayIdRef.current;
        if (gatewayId) {
          document.querySelector<SVGGElement>(`[data-skill-id="${gatewayId}"]`)?.focus();
        }
        window.requestAnimationFrame(() => {
          if (gatewayId) {
            document.querySelector<SVGGElement>(`[data-skill-id="${gatewayId}"]`)?.focus();
          }
        });
        return;
      }

      const discipline = disciplineDetails[state.disciplineId];
      const gateway = discipline?.skills.find(skill => skill._id === state.gatewayId) || null;
      try {
        setLoadingTopic(true);
        const response = await axios.get(`/api/constellation-maps/${state.topicMapId}`);
        setTopicGateway(gateway);
        setTopicDetail({ map: response.data.map, skills: response.data.skills || [] });
        originGatewayIdRef.current = state.gatewayId;
        setCamera({ zoom: 1, x: 0, y: 0 });
      } catch {
        setTopicGateway(null);
        setTopicDetail(null);
        setError('Unable to restore this topic path.');
      } finally {
        setLoadingTopic(false);
      }
    };
    window.addEventListener('popstate', restoreHistory);
    return () => window.removeEventListener('popstate', restoreHistory);
  }, [disciplineDetails]);

  const selectedDiscipline = selectedDisciplineId
    ? disciplineDetails[selectedDisciplineId]
    : null;
  const activeMap = selectedDiscipline?.map;
  const isFantasyConstellation = Boolean(
    selectedDiscipline && ['Game Art', 'System'].includes(selectedDiscipline.map.name)
  );
  const activeTheme = {
    ...fallbackTheme,
    ...(isFantasyConstellation ? astralFantasyTheme : (topicDetail?.map.visualTheme || activeMap?.visualTheme || {}))
  };
  activeTheme.lockedColor = readableLockedColor(activeTheme.backgroundColor, activeTheme.lockedColor);
  const unlockedSet = useMemo(() => new Set(unlockedSkillIds), [unlockedSkillIds]);
  const pendingSet = useMemo(() => new Set(pendingSkillIds), [pendingSkillIds]);
  const visibleTopicGroups = (selectedDiscipline?.topicGroups || [])
    .filter(group => group.skills.length > 0)
    .sort((left, right) => left.map.displayOrder - right.map.displayOrder || left.map.name.localeCompare(right.map.name));
  // A dense discipline cannot preserve every old gateway coordinate: eleven
  // full-sized silhouettes were being stacked on top of one another in System.
  // Give dense skies a deliberate course-board grid while retaining the
  // gateway-driven freeform placement for spacious skies such as Game Art.
  const usePackedTopicBoard = Boolean(
    selectedDiscipline &&
    visibleTopicGroups.length >= 8 &&
    selectedDiscipline.map.viewport.width <= 1800
  );
  const topicClusters = visibleTopicGroups
    .map((group, groupIndex) => {
      const gatewayIndex = selectedDiscipline!.skills.findIndex(skill => skill._id === group.gateway?._id);
      const inheritedAnchor = group.gateway
        ? pointForSkill(group.gateway, Math.max(0, gatewayIndex), selectedDiscipline!.skills.length, selectedDiscipline!.map)
        : { x: selectedDiscipline!.map.viewport.width / 2, y: selectedDiscipline!.map.viewport.height / 2 };
      const columns = 3;
      const rows = Math.ceil(visibleTopicGroups.length / columns);
      const column = groupIndex % columns;
      const row = Math.floor(groupIndex / columns);
      const anchor = usePackedTopicBoard
        ? {
          x: (selectedDiscipline!.map.viewport.width / columns) * (column + 0.5),
          y: 160 + row * ((selectedDiscipline!.map.viewport.height - 270) / Math.max(1, rows - 1 || 1))
        }
        : inheritedAnchor;
      return {
        group,
        detail: placeTopicGroupInDiscipline(group, selectedDiscipline!.map, anchor, usePackedTopicBoard
          ? { maxArtworkWidth: 350, maxArtworkHeight: 180, maxScale: 0.24 }
          : undefined)
      };
    });
  const svgRouteKey = [...topicClusters.map(cluster => cluster.detail), ...(topicDetail ? [topicDetail] : [])]
    .map(detail => `${detail.map._id}:${detail.skills.map(skill => `${skill._id}:${skill.constellationPosition?.x || 0}:${skill.constellationPosition?.y || 0}:${(skill.connections || []).map(connection => connection.targetSkillId).join(',')}`).join(';')}`)
    .join('|');
  useEffect(() => {
    let cancelled = false;
    const details = [...topicClusters.map(cluster => cluster.detail), ...(topicDetail ? [topicDetail] : [])]
      .filter(detail => detail.map.visualTheme?.backgroundAssetUrl && !hasBakedGuideSpine(detail.map.visualTheme.backgroundAssetUrl));
    if (details.length === 0) {
      setSvgGuideRoutes({});
      return () => { cancelled = true; };
    }
    void Promise.all(details.map(async detail => {
      const bounds = detail.svgGuideBounds || { x: 0, y: 0, width: detail.map.viewport.width, height: detail.map.viewport.height };
      const nodes = detail.skills.map((skill, index) => {
        const point = pointForSkill(skill, index, detail.skills.length, detail.map);
        return { id: skill._id, x: point.x, y: point.y };
      });
      const skillIds = new Set(detail.skills.map(skill => skill._id));
      const edges = detail.skills.flatMap(skill => (skill.connections || [])
        .filter(connection => skillIds.has(connection.targetSkillId))
        .map(connection => ({ sourceId: skill._id, targetId: connection.targetSkillId })));
      const routes = await buildSvgGuideRoutes(detail.map.visualTheme.backgroundAssetUrl!, bounds, nodes, edges);
      return Object.fromEntries(Object.entries(routes).map(([key, path]) => [`${detail.map._id}:${key}`, path]));
    })).then(results => {
      if (!cancelled) setSvgGuideRoutes(Object.assign({}, ...results));
    }).catch(() => {
      if (!cancelled) setSvgGuideRoutes({});
    });
    return () => { cancelled = true; };
  }, [svgRouteKey]);
  const legacyOutlineKey = [...topicClusters.map(cluster => cluster.detail), ...(topicDetail ? [topicDetail] : [])]
    .filter(detail => detail.map.visualTheme?.backgroundAssetUrl &&
      (detail.map.visualTheme.bakedBoundary?.assetUrl !== detail.map.visualTheme.backgroundAssetUrl || !detail.map.visualTheme.bakedBoundary?.path))
    .map(detail => `${detail.map._id}:${detail.map.visualTheme.backgroundAssetUrl}`)
    .join('|');
  useEffect(() => {
    let cancelled = false;
    const details = [...topicClusters.map(cluster => cluster.detail), ...(topicDetail ? [topicDetail] : [])]
      .filter(detail => detail.map.visualTheme?.backgroundAssetUrl &&
        (detail.map.visualTheme.bakedBoundary?.assetUrl !== detail.map.visualTheme.backgroundAssetUrl || !detail.map.visualTheme.bakedBoundary?.path));
    void Promise.all(details.map(async detail => {
      const bounds = detail.svgGuideSourceBounds || { x: 0, y: 0, width: detail.map.viewport.width, height: detail.map.viewport.height };
      const path = await buildSvgGuideOutline(detail.map.visualTheme.backgroundAssetUrl!, bounds);
      return [detail.map._id, { path, assetUrl: detail.map.visualTheme.backgroundAssetUrl!, bounds, imageSize: await getSvgGuideImageSize(detail.map.visualTheme.backgroundAssetUrl!) }] as const;
    })).then(entries => {
      if (!cancelled) setSvgGuideOutlines(Object.fromEntries(entries));
    }).catch(() => {
      if (!cancelled) setSvgGuideOutlines({});
    });
    return () => { cancelled = true; };
  }, [legacyOutlineKey]);

  useEffect(() => {
    if (!directMap || !selectedDiscipline) return;
    const ordered = [...selectedDiscipline.skills].sort((left, right) =>
      (left.mainQuestLevel || Number.MAX_SAFE_INTEGER) - (right.mainQuestLevel || Number.MAX_SAFE_INTEGER)
    );
    const currentIndex = ordered.findIndex(skill => (skill.mainQuestLevel || 1) === userLevel);
    const wrap = canvasWrapRef.current;
    if (!wrap || currentIndex < 0) return;
    const frame = window.requestAnimationFrame(() => {
      const maxScroll = Math.max(0, wrap.scrollWidth - wrap.clientWidth);
      const ratio = ordered.length <= 1 ? 0 : currentIndex / (ordered.length - 1);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      wrap.scrollTo({ left: maxScroll * ratio, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [directMap, selectedDiscipline, userLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || directMap) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (loadingTopic) return;
      const matrix = canvas.getScreenCTM();
      if (!matrix) return;
      const viewport = topicDetail?.map.viewport || activeMap?.viewport;
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      const pointer = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      setCamera(current => {
        const nextZoom = Math.max(
          viewport?.minZoom || 0.3,
          Math.min(viewport?.maxZoom || 3, current.zoom * factor)
        );
        const worldX = (pointer.x - current.x) / current.zoom;
        const worldY = (pointer.y - current.y) / current.zoom;
        return {
          zoom: nextZoom,
          x: pointer.x - worldX * nextZoom,
          y: pointer.y - worldY * nextZoom
        };
      });
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [activeMap?.viewport.maxZoom, activeMap?.viewport.minZoom, directMap, loadingTopic, topicDetail?.map.viewport.maxZoom, topicDetail?.map.viewport.minZoom]);

  const resetCamera = () => setCamera({ zoom: 1, x: 0, y: 0 });

  const selectDiscipline = (mapId: string) => {
    writeHistory({ view: 'discipline', disciplineId: mapId });
    setSelectedDisciplineId(mapId);
    setTopicGateway(null);
    setTopicDetail(null);
    setError('');
    originDisciplineIdRef.current = mapId;
    disciplineCameraRef.current = { zoom: 1, x: 0, y: 0 };
    resetCamera();
  };

  const returnToOverview = () => {
    const disciplineId = selectedDisciplineId || originDisciplineIdRef.current;
    setSelectedDisciplineId(null);
    setTopicGateway(null);
    setTopicDetail(null);
    setError('');
    resetCamera();
    window.requestAnimationFrame(() => {
      if (disciplineId) document.querySelector<HTMLButtonElement>(`[data-map-id="${disciplineId}"]`)?.focus();
    });
  };

  const returnToDiscipline = () => {
    setTopicDetail(null);
    setTopicGateway(null);
    setCamera(disciplineCameraRef.current);
    const gateway = originGatewayIdRef.current;
    if (gateway) document.querySelector<SVGGElement>(`[data-skill-id="${gateway}"]`)?.focus();
    window.requestAnimationFrame(() => {
      if (gateway) document.querySelector<SVGGElement>(`[data-skill-id="${gateway}"]`)?.focus();
    });
  };

  const moveOverview = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(disciplineMaps.length - 1, nextIndex));
    const grid = overviewGridRef.current;
    if (!grid) return;
    setOverviewIndex(boundedIndex);
    grid.scrollTo({
      left: boundedIndex * grid.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  };

  const openTopic = async (gateway: ConstellationSkill, sourceDetail: MapDetail | null = selectedDiscipline) => {
    if (!sourceDetail) return;
    if (['locked', 'pending'].includes(statusForSkill(gateway))) {
      setError((gateway.topicLevel || userLevel) > userLevel
        ? `Reach Level ${gateway.topicLevel} to enter ${labelForSkill(gateway)}.`
        : `${labelForSkill(gateway)} is not available yet.`);
      return;
    }
    try {
      setLoadingTopic(true);
      setError('');
      const lookup = await axios.get('/api/constellation-maps', {
        params: { gatewaySkillId: gateway._id, limit: 1 }
      });
      const topicMap = lookup.data.maps?.[0] as ConstellationMap | undefined;
      if (!topicMap) {
        setError('This topic path has not been published yet.');
        return;
      }
      const response = await axios.get(`/api/constellation-maps/${topicMap._id}`);
      setTopicGateway(gateway);
      setTopicDetail({ map: response.data.map, skills: response.data.skills || [] });
      setSelectedDisciplineId(sourceDetail.map._id);
      disciplineCameraRef.current = camera;
      originGatewayIdRef.current = gateway._id;
      writeHistory({
        view: 'topic',
        disciplineId: sourceDetail.map._id,
        gatewayId: gateway._id,
        topicMapId: topicMap._id
      });
      setCamera({ zoom: 1, x: 0, y: 0 });
    } catch {
      setError('Unable to open this topic path.');
    } finally {
      setLoadingTopic(false);
    }
  };

  const statusForSkill = (skill: ConstellationSkill) => directMap
    ? mainQuestVisualStatus(resolveMainQuestStatus({
      questLevel: skill.mainQuestLevel,
      userLevel,
      pending: pendingSet.has(skill._id)
    }))
    : (skill.topicLevel || userLevel) > userLevel
      ? 'locked'
      : unlockedSet.has(skill._id)
    ? 'unlocked'
    : pendingSet.has(skill._id)
      ? 'pending'
      : canUnlockSkill(skill) ? 'available' : 'locked';

  const statusForConnection = (source: ConstellationSkill, target: ConstellationSkill) => {
    const sourceStatus = statusForSkill(source);
    const targetStatus = statusForSkill(target);
    if (sourceStatus === 'unlocked' && targetStatus === 'unlocked') return 'unlocked';
    if (sourceStatus === 'unlocked' && ['available', 'pending'].includes(targetStatus)) return 'available';
    return 'locked';
  };

  const topicWindowFor = (detail: MapDetail, focusedGatewayId?: string) => {
    const gateways = detail.skills.filter(skill => skill.mapNodeRole === 'topic-gateway');
    if (gateways.length <= 3) return gateways;
    const gatewayById = new Map(gateways.map(gateway => [gateway._id, gateway]));
    const incomingIds = new Set(gateways.flatMap(gateway =>
      (gateway.connections || []).map(connection => connection.targetSkillId).filter(targetId => gatewayById.has(targetId))
    ));
    const roots = gateways.filter(gateway => !incomingIds.has(gateway._id));
    const visibleById = new Map<string, ConstellationSkill>();

    const reachableFrom = (start: ConstellationSkill) => {
      const reachableIds = new Set<string>();
      const queue = [start];
      while (queue.length > 0) {
        const gateway = queue.shift()!;
        if (reachableIds.has(gateway._id)) continue;
        reachableIds.add(gateway._id);
        (gateway.connections || []).forEach(connection => {
          const target = gatewayById.get(connection.targetSkillId);
          if (target && !reachableIds.has(target._id)) queue.push(target);
        });
      }
      return reachableIds;
    };

    const addWindow = (current: ConstellationSkill) => {
      const visitedIds = new Set<string>();
      const queue: Array<{ gateway: ConstellationSkill; depth: number }> = [{ gateway: current, depth: 0 }];
      while (queue.length > 0) {
        const { gateway, depth } = queue.shift()!;
        if (visitedIds.has(gateway._id) || depth > 2) continue;
        visitedIds.add(gateway._id);
        visibleById.set(gateway._id, gateway);
        if (depth === 2) continue;
        (gateway.connections || []).forEach(connection => {
          const target = gatewayById.get(connection.targetSkillId);
          if (target && !visitedIds.has(target._id)) queue.push({ gateway: target, depth: depth + 1 });
        });
      }
    };

    const focusedGateway = focusedGatewayId ? gatewayById.get(focusedGatewayId) : undefined;
    if (focusedGateway) {
      addWindow(focusedGateway);
      return gateways.filter(gateway => visibleById.has(gateway._id));
    }

    const coveredIds = new Set<string>();
    const addComponentWindow = (root: ConstellationSkill) => {
      const reachableIds = reachableFrom(root);
      reachableIds.forEach(skillId => coveredIds.add(skillId));
      const latestUnlockedId = [...unlockedSkillIds].reverse().find(skillId => reachableIds.has(skillId));
      if (latestUnlockedId) addWindow(gatewayById.get(latestUnlockedId) || root);
      else addWindow(root);
    };

    roots.forEach(addComponentWindow);
    // Cyclic or malformed components may have no root; keep one usable window for each.
    gateways.forEach(gateway => {
      if (!coveredIds.has(gateway._id)) addComponentWindow(gateway);
    });
    return gateways.filter(gateway => visibleById.has(gateway._id));
  };

  const overviewViewBoxFor = (detail: MapDetail) => {
    const skills = topicWindowFor(detail);
    if (skills.length === 0) return `0 0 ${detail.map.viewport.width} ${detail.map.viewport.height}`;
    const isDense = skills.length > 8;

    const bounds = skills.reduce((current, skill, index) => {
      const point = pointForSkill(skill, index, skills.length, detail.map);
      const labelWidth = isDense ? 0 : Math.min(520, Math.max(150, labelForSkill(skill).length * 22));
      const labelOnLeft = point.x > detail.map.viewport.width * 0.74;
      return {
        left: Math.min(current.left, point.x - (labelOnLeft ? labelWidth + 54 : 70)),
        right: Math.max(current.right, point.x + (labelOnLeft ? 70 : labelWidth + 54)),
        top: Math.min(current.top, point.y - (isDense ? 76 : 100)),
        bottom: Math.max(current.bottom, point.y + (isDense ? 76 : 120))
      };
    }, { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });

    const left = bounds.left - 44;
    const top = bounds.top - 190;
    const width = Math.max(620, bounds.right - bounds.left + 88);
    const height = Math.max(520, bounds.bottom - bounds.top + 330);
    return `${Math.round(left)} ${Math.round(top)} ${Math.round(width)} ${Math.round(height)}`;
  };

  const renderMapLayer = (
    detail: MapDetail,
    options: {
      className: string;
      offsetX?: number;
      offsetY?: number;
      scale?: number;
      gatewayOnly?: boolean;
      straightLineFit?: boolean;
      focusedGatewayId?: string;
      markerId?: string;
      onNodeClick: (skill: ConstellationSkill, interaction: 'pointer' | 'keyboard', trigger: SVGGElement) => void;
    }
  ) => {
    const skills = options.gatewayOnly
      ? topicWindowFor(detail, options.focusedGatewayId)
      : detail.skills;
    const points = new Map(skills.map((skill, index) => [
      skill._id,
      options.straightLineFit ? {
        x: skills.length <= 1
          ? detail.map.viewport.width / 2
          : 120 + index * ((detail.map.viewport.width - 240) / (skills.length - 1)),
        y: detail.map.viewport.height / 2
      } : pointForSkill(skill, index, skills.length, detail.map)
    ]));
    const skillIds = new Set(skills.map(skill => skill._id));
    const connections = options.straightLineFit
      ? skills.slice(0, -1).flatMap((source, index) => {
        const targetSkill = skills[index + 1];
        const sourcePoint = points.get(source._id);
        const targetPoint = points.get(targetSkill._id);
        if (!sourcePoint || !targetPoint) return [];
        return [{
          source,
          targetSkill,
          connection: {
            targetSkillId: targetSkill._id,
            connectionType: 'normal' as const,
            hasArrowhead: true
          },
          sourcePoint,
          targetPoint
        }];
      })
      : skills.flatMap(source => source.connections?.flatMap(connection => {
        if (!skillIds.has(connection.targetSkillId)) return [];
        const sourcePoint = points.get(source._id);
        const targetPoint = points.get(connection.targetSkillId);
        const targetSkill = skills.find(skill => skill._id === connection.targetSkillId);
        if (!sourcePoint || !targetPoint || !targetSkill) return [];
        return [{ source, targetSkill, connection, sourcePoint, targetPoint }];
      }) || []);

    return (
      <g transform={`translate(${options.offsetX || 0} ${options.offsetY || 0}) scale(${options.scale || 1})`}>
      <g className={`${options.className} ${detail.map.visualTheme?.backgroundAssetUrl ? 'is-svg-guide' : ''}`}>
        {detail.map.visualTheme?.backgroundAssetUrl && <image
          className="constellation-map-svg-guide"
          href={detail.map.visualTheme.backgroundAssetUrl}
          x={detail.svgGuideBounds?.x || 0}
          y={detail.svgGuideBounds?.y || 0}
          width={detail.svgGuideBounds?.width || detail.map.viewport.width}
          height={detail.svgGuideBounds?.height || detail.map.viewport.height}
          preserveAspectRatio="xMidYMid meet"
          opacity="0.56"
          pointerEvents="none"
        />}
        <g className="constellation-lines">
          {connections.map(({ source, targetSkill, connection, sourcePoint, targetPoint }) => {
            const connectionStatus = statusForConnection(source, targetSkill);
            const route = svgGuideRoutes[`${detail.map._id}:${source._id}:${connection.targetSkillId}`];
            // A guide is a hard visual boundary. Never fall back to a straight
            // line that cuts across empty space when its SVG islands are not
            // connected; the order badge remains visible on every star.
            if (detail.map.visualTheme?.backgroundAssetUrl && !route) return null;
            return (
            <path
              key={`${source._id}-${connection.targetSkillId}`}
              className={`is-${connectionStatus} is-${connection.connectionType}`}
              d={route || pathBetween(sourcePoint, targetPoint)}
              markerEnd={connection.hasArrowhead ? `url(#${options.markerId || `${idPrefix}-arrow`})` : undefined}
              vectorEffect="non-scaling-stroke"
            />
            );
          })}
        </g>
        {options.gatewayOnly && connections.map(({ source, connection, sourcePoint, targetPoint }) => (
          <circle
            className="constellation-link-star"
            key={`marker-${source._id}-${connection.targetSkillId}`}
            cx={(sourcePoint.x + targetPoint.x) / 2}
            cy={(sourcePoint.y + targetPoint.y) / 2}
            r="5"
          />
        ))}
        {skills.map((skill, index) => {
          const point = points.get(skill._id)!;
          const status = statusForSkill(skill);
          const isLevelGated = directMap
            ? (skill.mainQuestLevel || 1) > userLevel
            : (skill.topicLevel || userLevel) > userLevel;
          const labelOnLeft = point.x > detail.map.viewport.width * 0.74;
          const hasCloseHorizontalNeighbor = skills.some(candidate => {
            if (candidate._id === skill._id) return false;
            const candidatePoint = points.get(candidate._id);
            return Boolean(candidatePoint &&
              Math.abs(candidatePoint.y - point.y) < 80 &&
              Math.abs(candidatePoint.x - point.x) < 360);
          });
          const labelY = options.className === 'constellation-mini-layer' && skills.length > 2
            ? (index % 2 === 0 ? -42 : 54)
            : hasCloseHorizontalNeighbor
              ? (index % 2 === 0 ? -30 : 38)
              : 6;
          return (
            <g
              key={skill._id}
              data-skill-id={skill._id}
              className={`constellation-node is-${status} role-${skill.mapNodeRole || 'lesson'} ${isLevelGated ? 'is-level-gated' : ''} ${selectedSkillId === skill._id ? 'is-star-lens-selected' : ''}`}
              transform={`translate(${point.x} ${point.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${labelForSkill(skill)}, ${skill.mapNodeRole || 'lesson'}, ${status}`}
              aria-controls={selectedSkillId === skill._id ? 'star-lens-dock' : undefined}
              aria-expanded={selectedSkillId === skill._id ? true : undefined}
              onClick={(event) => {
                event.stopPropagation();
                options.onNodeClick(skill, 'pointer', event.currentTarget);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                options.onNodeClick(skill, 'keyboard', event.currentTarget);
              }}
            >
              <ConstellationNodeGlyph
                skill={skill}
                label={labelForSkill(skill)}
                labelOnLeft={labelOnLeft}
                labelY={labelY}
                isStart={index === 0 && detail.map.scope === 'topic'}
              />
              {detail.map.visualTheme?.backgroundAssetUrl && detail.map.scope === 'topic' && <text className="constellation-svg-sequence" y="5" textAnchor="middle">{index + 1}</text>}
            </g>
          );
        })}
       </g>
      </g>
    );
  };

  if (!selectedDiscipline && !directMap) {
    return (
      <section className={`constellation-shell constellation-overview ${compactOverview ? 'is-compact-overview' : ''}`} aria-labelledby={`${idPrefix}-title`}>
        <header className="constellation-heading">
          <div>
            <p>Learning paths</p>
            <h2 id={`${idPrefix}-title`}>{heading}</h2>
          </div>
          <div className="constellation-legend" aria-label="Node status">
            <span><i className="is-unlocked" />Unlocked</span>
            <span><i className="is-available" />Available</span>
            <span><i className="is-pending" />Pending</span>
            <span><i className="is-locked" />Locked</span>
          </div>
        </header>
        {error && <div className="constellation-notice" role="status">{error}</div>}
        <div
          ref={overviewGridRef}
          className="constellation-overview-grid"
          data-map-count={disciplineMaps.length}
          onScroll={event => {
            const width = event.currentTarget.clientWidth;
            if (width > 0) setOverviewIndex(Math.round(event.currentTarget.scrollLeft / width));
          }}
        >
          {disciplineMaps.map(map => {
            const detail = disciplineDetails[map._id];
            const unlockedCount = detail?.skills.filter(skill => unlockedSet.has(skill._id)).length || 0;
            const total = detail?.skills.length || 0;
            const overviewContent = <>
                <span className="constellation-overview-copy">
                  <span className="constellation-overview-title">{map.name}</span>
                  <span className="constellation-overview-progress">{unlockedCount} / {total} unlocked</span>
                </span>
                <svg
                  viewBox={compactOverview
                    ? `100 ${Math.max(0, map.viewport.height / 2 - 90)} ${Math.max(400, map.viewport.width - 200)} 210`
                    : detail ? overviewViewBoxFor(detail) : `0 0 ${map.viewport.width} ${map.viewport.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  aria-hidden={compactOverview ? undefined : true}
                  aria-label={compactOverview ? `${map.name} topics` : undefined}
                >
                  <g className="constellation-star-field">
                    {backgroundStarsFor(map).map((star, index) => (
                      <circle
                        className={`is-${star.tone}`}
                        key={index}
                        cx={star.x}
                        cy={star.y}
                        r={star.radius}
                        opacity={star.opacity}
                      />
                    ))}
                  </g>
                  {detail && (
                    <g transform="translate(0 34)">
                      {renderMapLayer(detail, {
                        className: `constellation-mini-layer ${topicWindowFor(detail).length > 8 ? 'is-dense' : ''}`,
                        gatewayOnly: true,
                        straightLineFit: compactOverview,
                        onNodeClick: skill => {
                          if (compactOverview) onOpenSkill(skill);
                        }
                      })}
                    </g>
                  )}
                </svg>
              </>;
            return compactOverview ? (
              <div className="constellation-overview-item is-direct-topic-line" key={map._id} data-map-id={map._id}>
                {overviewContent}
              </div>
            ) : (
              <button type="button" className="constellation-overview-item" key={map._id} data-map-id={map._id} onClick={() => selectDiscipline(map._id)} disabled={!detail}>
                {overviewContent}
              </button>
            );
          })}
        </div>
        {disciplineMaps.length > 1 && (
          <nav className="constellation-overview-pager" aria-label="Discipline pages">
            <button type="button" onClick={() => moveOverview(overviewIndex - 1)} disabled={overviewIndex === 0} aria-label="Previous discipline"><ChevronLeft aria-hidden="true" /></button>
            <output aria-live="polite">{overviewIndex + 1} / {disciplineMaps.length}</output>
            <button type="button" onClick={() => moveOverview(overviewIndex + 1)} disabled={overviewIndex >= disciplineMaps.length - 1} aria-label="Next discipline"><ChevronRight aria-hidden="true" /></button>
          </nav>
        )}
      </section>
    );
  }

  if (!selectedDiscipline) {
    return <section className="constellation-shell constellation-focus" aria-label={heading}>
      <div className="constellation-load-state" role="status">Loading {heading.toLowerCase()}...</div>
    </section>;
  }

  const mainQuestDetail = directMap ? {
    map: {
      ...selectedDiscipline.map,
      viewport: {
        ...selectedDiscipline.map.viewport,
        width: Math.max(760, selectedDiscipline.skills.length * 220 + 120),
        height: 180
      }
    },
    skills: [...selectedDiscipline.skills].sort((left, right) =>
      (left.mainQuestLevel || Number.MAX_SAFE_INTEGER) - (right.mainQuestLevel || Number.MAX_SAFE_INTEGER)
    )
  } : null;
  const canvasMap = mainQuestDetail?.map || topicDetail?.map || activeMap;
  const mapWidth = canvasMap?.viewport.width || 1600;
  const mapHeight = canvasMap?.viewport.height || 900;

  return (
    <section
      className={`constellation-shell constellation-focus ${directMap ? 'is-main-quest-rail' : 'is-discipline-board'} ${usePackedTopicBoard ? 'is-packed-topic-board' : ''} ${isFantasyConstellation ? 'is-astral-fantasy' : ''}`}
      style={{
        '--constellation-bg': activeTheme.backgroundColor,
        '--constellation-surface': activeTheme.surfaceColor,
        '--constellation-text': activeTheme.textColor,
        '--constellation-muted': activeTheme.mutedTextColor,
        '--constellation-border': activeTheme.borderColor,
        '--constellation-line': activeTheme.lineColor,
        '--constellation-unlocked': activeTheme.unlockedColor,
        '--constellation-available': activeTheme.availableColor,
        '--constellation-locked': activeTheme.lockedColor,
        '--constellation-boss': activeTheme.bossColor,
        '--constellation-capstone': activeTheme.capstoneColor
      } as CSSProperties}
    >
      <header className="constellation-focus-header">
        {!directMap && <button
          type="button"
          className="constellation-back"
          onClick={() => {
            if (window.history.state?.constellationView?.view !== 'overview') window.history.back();
            else if (topicDetail) returnToDiscipline();
            else returnToOverview();
          }}
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft aria-hidden="true" />
        </button>}
        <div>
          <p>{directMap ? `Your level-up path · Current Level ${userLevel}` : topicDetail ? `Topic · Level ${topicDetail.map.level || 1}` : 'Discipline · All quests'}</p>
          <h2>{topicDetail?.map.name || activeMap?.name}</h2>
        </div>
        {directMap && <div className="main-quest-level-progress" aria-label={`Current Level ${userLevel}; next Level ${userLevel + 1}`}>
          <span>CURRENT</span>
          <strong>Level {userLevel}</strong>
          <small>Next · Level {userLevel + 1}</small>
        </div>}
        <div className="constellation-legend" aria-label="Quest status">
          <span><i className="is-unlocked" />{directMap ? 'Completed' : 'Unlocked'}</span>
          <span><i className="is-available" />{directMap ? 'Current quest' : 'Available'}</span>
          <span><i className="is-pending" />Pending review</span>
          <span><i className="is-locked" />{directMap ? 'Future level' : 'Locked'}</span>
        </div>
      </header>

      {error && <div className="constellation-notice" role="status">{error}</div>}
      {directMap && <p className="main-quest-swipe-hint">Swipe horizontally to explore levels · Current Quest is centered automatically</p>}
      {directMap ? <div className="constellation-canvas-wrap" ref={canvasWrapRef}>
        <div className="constellation-camera-controls" aria-label="Map view controls">
          <button type="button" disabled={loadingTopic} onClick={() => setCamera(current => ({ ...current, zoom: Math.min((canvasMap?.viewport.maxZoom || 3), current.zoom * 1.2) }))} title="Zoom in" aria-label="Zoom in"><ZoomIn aria-hidden="true" /></button>
          <button type="button" disabled={loadingTopic} onClick={resetCamera} title="Reset view" aria-label="Reset view"><RotateCcw aria-hidden="true" /></button>
          <button type="button" disabled={loadingTopic} onClick={() => setCamera(current => ({ ...current, zoom: Math.max((canvasMap?.viewport.minZoom || 0.3), current.zoom * 0.8) }))} title="Zoom out" aria-label="Zoom out"><ZoomOut aria-hidden="true" /></button>
        </div>

        <svg
          ref={canvasRef}
          className="constellation-canvas"
          style={directMap ? { minWidth: `${Math.max(760, mapWidth * 0.8)}px` } : undefined}
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          role="group"
          aria-busy={loadingTopic}
          aria-label={directMap ? `${activeMap?.name} level-up quest path` : `${topicDetail?.map.name || activeMap?.name} constellation map`}
          onPointerDown={(event) => {
            if (directMap || loadingTopic || (event.target as Element).closest('.constellation-node')) return;
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            setIsDirectManipulating(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (directMap) return;
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const unitX = mapWidth / Math.max(1, bounds.width);
            const unitY = mapHeight / Math.max(1, bounds.height);
            setCamera(current => ({
              ...current,
              x: current.x + (event.clientX - drag.x) * unitX,
              y: current.y + (event.clientY - drag.y) * unitY
            }));
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          }}
          onPointerUp={() => { dragRef.current = null; setIsDirectManipulating(false); }}
          onPointerCancel={() => { dragRef.current = null; setIsDirectManipulating(false); }}
        >
          <defs>
            <pattern id={`${idPrefix}-grid`} width="54" height="54" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.6" fill="var(--constellation-border)" opacity="0.52" />
            </pattern>
            <filter id={`${idPrefix}-glow`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <marker id={`${idPrefix}-arrow`} className="constellation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 Z" />
            </marker>
          </defs>
          <rect width={mapWidth} height={mapHeight} fill="var(--constellation-bg)" pointerEvents="none" />
          <rect width={mapWidth} height={mapHeight} fill={`url(#${idPrefix}-grid)`} pointerEvents="none" />
          <g
            className={`constellation-camera ${isDirectManipulating ? 'is-direct-manipulation' : ''}`}
            transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
          >
            {selectedDiscipline && !topicDetail && renderMapLayer(mainQuestDetail || selectedDiscipline, {
              className: 'constellation-discipline-layer',
              gatewayOnly: !directMap,
              straightLineFit: directMap,
              focusedGatewayId: topicGateway?._id,
              onNodeClick: (skill, interaction, trigger) => {
                if (directMap) {
                  onOpenSkill(skill, interaction, trigger);
                  return;
                }
                const openPath = () => { void openTopic(skill); };
                if (onOpenTopicInfo) onOpenTopicInfo(skill, openPath, interaction, trigger);
                else openPath();
              }
            })}
            {topicDetail && renderMapLayer(topicDetail, {
              className: 'constellation-topic-layer',
              onNodeClick: (skill, interaction, trigger) => onOpenSkill(skill, interaction, trigger)
            })}
          </g>
        </svg>

        {((topicDetail && topicDetail.skills.length === 0) || (directMap && selectedDiscipline?.skills.length === 0)) && (
          <div className="constellation-empty-state" role="status">
            <strong>No quests here yet</strong>
            <span>{directMap ? 'Add the first level-up quest in Main Quest Editor.' : 'This topic is ready for its first quest.'}</span>
          </div>
        )}
      </div> : <div className="constellation-canvas-wrap discipline-quest-board" ref={canvasWrapRef}>
        <div className="constellation-camera-controls" aria-label="Map view controls">
          <button type="button" onClick={() => setCamera(current => ({ ...current, zoom: Math.min((activeMap?.viewport.maxZoom || 3), current.zoom * 1.2) }))} title="Zoom in" aria-label="Zoom in"><ZoomIn aria-hidden="true" /></button>
          <button type="button" onClick={resetCamera} title="Reset view" aria-label="Reset view"><RotateCcw aria-hidden="true" /></button>
          <button type="button" onClick={() => setCamera(current => ({ ...current, zoom: Math.max((activeMap?.viewport.minZoom || 0.3), current.zoom * 0.8) }))} title="Zoom out" aria-label="Zoom out"><ZoomOut aria-hidden="true" /></button>
        </div>
        <svg
          ref={canvasRef}
          className="constellation-canvas discipline-constellation-canvas"
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          role="list"
          aria-label={`${activeMap?.name} constellation; all topic quests`}
          onPointerDown={(event) => {
            if ((event.target as Element).closest('.constellation-node')) return;
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            setIsDirectManipulating(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const unitX = mapWidth / Math.max(1, bounds.width);
            const unitY = mapHeight / Math.max(1, bounds.height);
            setCamera(current => ({
              ...current,
              x: current.x + (event.clientX - drag.x) * unitX,
              y: current.y + (event.clientY - drag.y) * unitY
            }));
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          }}
          onPointerUp={() => { dragRef.current = null; setIsDirectManipulating(false); }}
          onPointerCancel={() => { dragRef.current = null; setIsDirectManipulating(false); }}
        >
          <defs>
            <pattern id={`${idPrefix}-discipline-grid`} width="54" height="54" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.6" fill="var(--constellation-border)" opacity="0.52" />
            </pattern>
            <marker id={`${idPrefix}-discipline-arrow`} className="constellation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 Z" />
            </marker>
          </defs>
          <rect width={mapWidth} height={mapHeight} fill="var(--constellation-bg)" pointerEvents="none" />
          <rect width={mapWidth} height={mapHeight} fill={`url(#${idPrefix}-discipline-grid)`} pointerEvents="none" />
          <g
            className={`constellation-camera ${isDirectManipulating ? 'is-direct-manipulation' : ''}`}
            transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
          >
          {topicClusters.map(({ group, detail }) => {
          const points = detail.skills.map((skill, index) =>
            pointForSkill(skill, index, detail.skills.length, detail.map)
          );
          const bakedBoundary = detail.map.visualTheme.bakedBoundary?.assetUrl === detail.map.visualTheme.backgroundAssetUrl
            ? detail.map.visualTheme.bakedBoundary
            : svgGuideOutlines[detail.map._id];
          const boundaryPath = detail.svgGuideBounds
            ? (bakedBoundary?.path || guideBoundaryPath(detail.svgGuideBounds))
            : boundaryPathFor(points);
          const levelLocked = (group.map.level || 1) > userLevel;
          const labelPoint = detail.svgGuideBounds
            ? {
              x: detail.svgGuideBounds.x + 12,
              y: detail.svgGuideBounds.y - 22
            }
            : {
              x: Math.min(...points.map(point => point.x)) + 16,
              y: Math.min(...points.map(point => point.y)) - 104
            };
          return <g
            className={`discipline-topic-cluster ${levelLocked ? 'is-level-locked' : ''}`}
            key={group.map._id}
            role="listitem"
            aria-label={`${group.map.name}, Level ${group.map.level || 1}, ${detail.skills.length} ${detail.skills.length === 1 ? 'quest' : 'quests'}`}
          >
            <path
              className={`discipline-topic-boundary ${bakedBoundary ? 'is-svg-outline' : ''}`}
              d={boundaryPath}
              transform={bakedBoundary && detail.svgGuideBounds ? bakedBoundaryTransform(bakedBoundary, detail.svgGuideBounds) : undefined}
              vectorEffect="non-scaling-stroke"
            />
            <text className="discipline-topic-boundary__eyebrow" x={labelPoint.x} y={labelPoint.y}>TOPIC · LEVEL {group.map.level || 1}</text>
            <text className="discipline-topic-boundary__title" x={labelPoint.x} y={labelPoint.y + 31}>{group.map.name}</text>
            {renderMapLayer(detail, {
              className: 'discipline-topic-quest-layer',
              markerId: `${idPrefix}-discipline-arrow`,
              onNodeClick: (skill, interaction, trigger) => onOpenSkill(skill, interaction, trigger)
            })}
          </g>;
        })}
          </g>
        </svg>
        {topicClusters.length === 0 && <div className="discipline-board-empty" role="status">
          <strong>No quests published in this Discipline yet</strong>
          <span>Quest groups will appear here automatically when their Topic is published.</span>
        </div>}
      </div>}
    </section>
  );
}

export default ConstellationTree;
