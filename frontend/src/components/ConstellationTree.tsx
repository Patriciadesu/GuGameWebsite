import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import axios from '../config/axios';
import { ChevronLeft, ChevronRight, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { ConstellationMap, ConstellationSkill } from './constellationTypes';
import ConstellationNodeGlyph from './ConstellationNodeGlyph';
import {
  backgroundStarsFor,
  pointForConstellationSkill as pointForSkill,
  straightConstellationPath as pathBetween
} from './constellationVisuals';
import './ConstellationTree.css';

interface ConstellationTreeProps {
  disciplineMaps: ConstellationMap[];
  refreshRevision?: number;
  unlockedSkillIds: string[];
  pendingSkillIds: string[];
  canUnlockSkill: (skill: ConstellationSkill) => boolean;
  onOpenSkill: (skill: ConstellationSkill) => void;
}

interface MapDetail {
  map: ConstellationMap;
  skills: ConstellationSkill[];
}

interface Camera {
  zoom: number;
  x: number;
  y: number;
}

const fallbackTheme = {
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
  refreshRevision = 0,
  unlockedSkillIds,
  pendingSkillIds,
  canUnlockSkill,
  onOpenSkill
}: ConstellationTreeProps) {
  const labelForSkill = (skill: ConstellationSkill) => skill.constellationLabel || skill.title;
  const [disciplineDetails, setDisciplineDetails] = useState<Record<string, MapDetail>>({});
  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string | null>(null);
  const [previewSkill, setPreviewSkill] = useState<ConstellationSkill | null>(null);
  const [topicGateway, setTopicGateway] = useState<ConstellationSkill | null>(null);
  const [topicDetail, setTopicDetail] = useState<MapDetail | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [error, setError] = useState('');
  const [failedPreviewImages, setFailedPreviewImages] = useState<Set<string>>(new Set());
  const [camera, setCamera] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  const [overviewIndex, setOverviewIndex] = useState(0);
  const [isDirectManipulating, setIsDirectManipulating] = useState(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const previewTimerRef = useRef<number | null>(null);
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
          { map: response.data.map, skills: response.data.skills || [] }
        ])));
      })
      .catch(() => {
        if (!cancelled) setError('Constellation data is temporarily unavailable.');
      });
    return () => { cancelled = true; };
  }, [disciplineMaps]);

  useEffect(() => () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
  }, []);

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
      setPreviewSkill(null);
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
        window.requestAnimationFrame(() => {
          const gatewayId = originGatewayIdRef.current;
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
  const activeTheme = { ...fallbackTheme, ...(activeMap?.visualTheme || {}) };
  activeTheme.lockedColor = readableLockedColor(activeTheme.backgroundColor, activeTheme.lockedColor);
  const unlockedSet = useMemo(() => new Set(unlockedSkillIds), [unlockedSkillIds]);
  const pendingSet = useMemo(() => new Set(pendingSkillIds), [pendingSkillIds]);

  const resetCamera = () => setCamera({ zoom: 1, x: 0, y: 0 });

  const selectDiscipline = (mapId: string) => {
    writeHistory({ view: 'discipline', disciplineId: mapId });
    setSelectedDisciplineId(mapId);
    setPreviewSkill(null);
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
    setPreviewSkill(null);
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
    setPreviewSkill(null);
    setTopicGateway(null);
    setCamera(disciplineCameraRef.current);
    window.requestAnimationFrame(() => {
      const gateway = originGatewayIdRef.current;
      if (gateway) document.querySelector<SVGGElement>(`[data-skill-id="${gateway}"]`)?.focus();
    });
  };

  const showPreview = (skill: ConstellationSkill) => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    setPreviewSkill(skill);
  };

  const schedulePreviewOpen = (skill: ConstellationSkill) => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => setPreviewSkill(skill), 180);
  };

  const schedulePreviewClose = () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => setPreviewSkill(null), 140);
  };

  const moveOverview = (nextIndex: number) => {
    const boundedIndex = Math.max(0, Math.min(disciplineMaps.length - 1, nextIndex));
    const grid = overviewGridRef.current;
    if (!grid) return;
    setOverviewIndex(boundedIndex);
    grid.scrollTo({ left: boundedIndex * grid.clientWidth, behavior: 'smooth' });
  };

  const openTopic = async (gateway: ConstellationSkill) => {
    if (!activeMap) return;
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
      setPreviewSkill(null);
      disciplineCameraRef.current = camera;
      originGatewayIdRef.current = gateway._id;
      writeHistory({
        view: 'topic',
        disciplineId: activeMap._id,
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

  const statusForSkill = (skill: ConstellationSkill) => unlockedSet.has(skill._id)
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

  const renderMapLayer = (
    detail: MapDetail,
    options: {
      className: string;
      offsetX?: number;
      offsetY?: number;
      scale?: number;
      gatewayOnly?: boolean;
      onNodeClick: (skill: ConstellationSkill) => void;
    }
  ) => {
    const skills = options.gatewayOnly
      ? detail.skills.filter(skill => skill.mapNodeRole === 'topic-gateway')
      : detail.skills;
    const points = new Map(skills.map((skill, index) => [
      skill._id,
      pointForSkill(skill, index, skills.length, detail.map)
    ]));
    const skillIds = new Set(skills.map(skill => skill._id));
    const connections = skills.flatMap(source => source.connections?.flatMap(connection => {
      if (!skillIds.has(connection.targetSkillId)) return [];
      const sourcePoint = points.get(source._id);
      const targetPoint = points.get(connection.targetSkillId);
      const targetSkill = skills.find(skill => skill._id === connection.targetSkillId);
      if (!sourcePoint || !targetPoint || !targetSkill) return [];
      return [{ source, targetSkill, connection, sourcePoint, targetPoint }];
    }) || []);

    return (
      <g transform={`translate(${options.offsetX || 0} ${options.offsetY || 0}) scale(${options.scale || 1})`}>
       <g className={options.className}>
        <g className="constellation-lines">
          {connections.map(({ source, targetSkill, connection, sourcePoint, targetPoint }) => {
            const connectionStatus = statusForConnection(source, targetSkill);
            return (
            <path
              key={`${source._id}-${connection.targetSkillId}`}
              className={`is-${connectionStatus} is-${connection.connectionType}`}
              d={pathBetween(sourcePoint, targetPoint)}
              markerEnd={connection.hasArrowhead ? 'url(#constellation-arrow)' : undefined}
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
              className={`constellation-node is-${status} role-${skill.mapNodeRole || 'lesson'}`}
              transform={`translate(${point.x} ${point.y})`}
              role="button"
              tabIndex={0}
              aria-label={`${labelForSkill(skill)}, ${skill.mapNodeRole || 'lesson'}, ${status}`}
              onPointerEnter={event => {
                if (event.pointerType === 'mouse' && skill.mapNodeRole === 'topic-gateway') schedulePreviewOpen(skill);
              }}
              onPointerLeave={() => skill.mapNodeRole === 'topic-gateway' && schedulePreviewClose()}
              onFocus={() => skill.mapNodeRole === 'topic-gateway' && showPreview(skill)}
              onBlur={() => skill.mapNodeRole === 'topic-gateway' && schedulePreviewClose()}
              onClick={(event) => {
                event.stopPropagation();
                options.onNodeClick(skill);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                options.onNodeClick(skill);
              }}
            >
              <ConstellationNodeGlyph
                skill={skill}
                label={labelForSkill(skill)}
                labelOnLeft={labelOnLeft}
                labelY={labelY}
                isStart={index === 0 && detail.map.scope === 'topic'}
              />
            </g>
          );
        })}
       </g>
      </g>
    );
  };

  if (!selectedDiscipline) {
    return (
      <section className="constellation-shell constellation-overview" aria-labelledby="constellation-title">
        <header className="constellation-heading">
          <div>
            <p>Learning paths</p>
            <h2 id="constellation-title">Skill Constellations</h2>
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
            return (
              <button
                type="button"
                className="constellation-overview-item"
                key={map._id}
                data-map-id={map._id}
                onClick={() => selectDiscipline(map._id)}
                disabled={!detail}
              >
                <span className="constellation-overview-copy">
                  <span className="constellation-overview-title">{map.name}</span>
                  <span className="constellation-overview-progress">{unlockedCount} / {total} unlocked</span>
                </span>
                <svg viewBox={`0 0 ${map.viewport.width} ${map.viewport.height}`} aria-hidden="true">
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
                        className: 'constellation-mini-layer',
                        gatewayOnly: true,
                        onNodeClick: () => undefined
                      })}
                    </g>
                  )}
                </svg>
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

  const canvasMap = topicDetail?.map || activeMap;
  const mapWidth = canvasMap?.viewport.width || 1600;
  const mapHeight = canvasMap?.viewport.height || 900;
  const activeGateway = topicGateway || previewSkill;
  const gatewayIndex = activeGateway
    ? selectedDiscipline.skills.findIndex(skill => skill._id === activeGateway._id)
    : -1;
  const gatewayPoint = activeGateway && activeMap
    ? pointForSkill(activeGateway, Math.max(0, gatewayIndex), selectedDiscipline.skills.length, activeMap)
    : null;
  const disciplineContextOffset = gatewayPoint && topicDetail
    ? { x: mapWidth / 2 - gatewayPoint.x, y: mapHeight / 2 - gatewayPoint.y }
    : { x: 0, y: 0 };
  const topicStart = topicDetail?.skills[0]
    ? pointForSkill(topicDetail.skills[0], 0, topicDetail.skills.length, topicDetail.map)
    : null;

  return (
    <section
      className={`constellation-shell constellation-focus ${topicDetail ? 'is-topic-active' : ''} ${previewSkill && !topicDetail ? 'has-preview' : ''}`}
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
        <button
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
        </button>
        <div>
          <p>Constellations / {activeMap?.name}{topicDetail ? ` / ${topicDetail.map.name}` : ''}</p>
          <h2>{topicDetail?.map.name || activeMap?.name}</h2>
        </div>
        <div className="constellation-legend" aria-label="Node status">
          <span><i className="is-unlocked" />Unlocked</span>
          <span><i className="is-available" />Available</span>
          <span><i className="is-pending" />Pending</span>
          <span><i className="is-locked" />Locked</span>
        </div>
      </header>

      {error && <div className="constellation-notice" role="status">{error}</div>}

      <div className="constellation-canvas-wrap">
        <div className="constellation-camera-controls" aria-label="Map view controls">
          <button type="button" disabled={loadingTopic} onClick={() => setCamera(current => ({ ...current, zoom: Math.min((canvasMap?.viewport.maxZoom || 3), current.zoom * 1.2) }))} title="Zoom in" aria-label="Zoom in"><ZoomIn aria-hidden="true" /></button>
          <button type="button" disabled={loadingTopic} onClick={resetCamera} title="Reset view" aria-label="Reset view"><RotateCcw aria-hidden="true" /></button>
          <button type="button" disabled={loadingTopic} onClick={() => setCamera(current => ({ ...current, zoom: Math.max((canvasMap?.viewport.minZoom || 0.3), current.zoom * 0.8) }))} title="Zoom out" aria-label="Zoom out"><ZoomOut aria-hidden="true" /></button>
        </div>

        <svg
          className="constellation-canvas"
          viewBox={`0 0 ${mapWidth} ${mapHeight}`}
          role="application"
          aria-busy={loadingTopic}
          aria-label={`${topicDetail?.map.name || activeMap?.name} constellation map`}
          onWheel={(event) => {
            event.preventDefault();
            if (loadingTopic) return;
            const factor = event.deltaY > 0 ? 0.9 : 1.1;
            const matrix = event.currentTarget.getScreenCTM();
            if (!matrix) return;
            const pointer = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
            setCamera(current => {
              const nextZoom = Math.max(
                canvasMap?.viewport.minZoom || 0.3,
                Math.min(canvasMap?.viewport.maxZoom || 3, current.zoom * factor)
              );
              const worldX = (pointer.x - current.x) / current.zoom;
              const worldY = (pointer.y - current.y) / current.zoom;
              return {
                zoom: nextZoom,
                x: pointer.x - worldX * nextZoom,
                y: pointer.y - worldY * nextZoom
              };
            });
          }}
          onPointerDown={(event) => {
            if (loadingTopic || (event.target as Element).closest('.constellation-node')) return;
            dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            setIsDirectManipulating(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!(event.target as Element).closest('.constellation-node') && previewSkill) {
              schedulePreviewClose();
            }
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
            <pattern id="constellation-grid" width="54" height="54" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.6" fill="var(--constellation-border)" opacity="0.52" />
            </pattern>
            <filter id="constellation-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <marker id="constellation-arrow" className="constellation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 Z" />
            </marker>
          </defs>
          <rect width={mapWidth} height={mapHeight} fill="var(--constellation-bg)" pointerEvents="none" />
          <rect width={mapWidth} height={mapHeight} fill="url(#constellation-grid)" pointerEvents="none" />
          <g
            className={`constellation-camera ${isDirectManipulating ? 'is-direct-manipulation' : ''}`}
            transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}
          >
            {renderMapLayer(selectedDiscipline, {
              className: 'constellation-discipline-layer',
              offsetX: disciplineContextOffset.x,
              offsetY: disciplineContextOffset.y,
              gatewayOnly: true,
              onNodeClick: skill => showPreview(skill)
            })}
            {topicDetail && renderMapLayer(topicDetail, {
              className: 'constellation-topic-layer',
              onNodeClick: onOpenSkill
            })}
            {topicDetail && topicStart && (
              <g className="constellation-anchor" transform={`translate(${topicStart.x} ${topicStart.y})`} aria-hidden="true">
                <circle r="42" />
                <path d="M 0 -27 L 8 -8 L 27 0 L 8 8 L 0 27 L -8 8 L -27 0 L -8 -8 Z" />
              </g>
            )}
          </g>
        </svg>

        {topicDetail && topicDetail.skills.length === 0 && (
          <div className="constellation-empty-state" role="status">
            <strong>No quests here yet</strong>
            <span>This topic is ready for its first quest.</span>
          </div>
        )}

        {previewSkill && !topicDetail && (
          <aside
            className="constellation-info-panel"
            onPointerEnter={() => showPreview(previewSkill)}
            onPointerLeave={schedulePreviewClose}
            aria-label={`${previewSkill.title} path preview`}
          >
            <button type="button" className="constellation-info-close" onClick={() => setPreviewSkill(null)} aria-label="Close preview"><X aria-hidden="true" /></button>
            <div className="constellation-info-heading">
              <span>Topic path</span>
              <h3>{labelForSkill(previewSkill)}</h3>
            </div>
            <p>{previewSkill.nodePreview?.summary || previewSkill.description}</p>
            <div className="constellation-preview-media">
              {previewSkill.nodePreview?.imageUrl && !failedPreviewImages.has(previewSkill.nodePreview.imageUrl) ? (
                <img
                  src={previewSkill.nodePreview.imageUrl}
                  alt={`${labelForSkill(previewSkill)} learning outcome`}
                  onError={() => setFailedPreviewImages(current => new Set(current).add(previewSkill.nodePreview!.imageUrl!))}
                />
              ) : (
                <span role="img" aria-label={`${labelForSkill(previewSkill)} preview unavailable`}>
                  {labelForSkill(previewSkill)} preview
                </span>
              )}
            </div>
            {(previewSkill.nodePreview?.outcomes?.length || 0) > 0 && (
              <div className="constellation-outcomes">
                <strong>You'll be able to</strong>
                <ul>{previewSkill.nodePreview!.outcomes.slice(0, 4).map(outcome => <li key={outcome}>{outcome}</li>)}</ul>
              </div>
            )}
            <div className="constellation-info-action">
              <span>{statusForSkill(previewSkill)}</span>
              {statusForSkill(previewSkill) === 'locked' && (
                <p className="constellation-requirement">
                  {previewSkill.prerequisites?.length
                    ? `Complete ${previewSkill.prerequisites.map(id => selectedDiscipline.skills.find(skill => skill._id === id)?.title || 'the required skill').join(', ')} first.`
                    : 'Complete the required skills first.'}
                </p>
              )}
              {statusForSkill(previewSkill) === 'pending' && (
                <p className="constellation-requirement">Approval is pending.</p>
              )}
              <button
                type="button"
                onClick={() => openTopic(previewSkill)}
                disabled={loadingTopic || ['locked', 'pending'].includes(statusForSkill(previewSkill))}
              >
                {loadingTopic
                  ? 'Opening...'
                  : statusForSkill(previewSkill) === 'locked'
                    ? 'Prerequisites required'
                    : statusForSkill(previewSkill) === 'pending'
                      ? 'Approval pending'
                      : previewSkill.nodePreview?.actionLabel || 'View Path'}
              </button>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}

export default ConstellationTree;
