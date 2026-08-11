import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { WheelEvent as ReactWheelEvent } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import type { ConstellationMap, ConstellationSkill } from './constellationTypes';
import ConstellationNodeGlyph from './ConstellationNodeGlyph';
import {
  pointForConstellationSkill,
  straightConstellationPath
} from './constellationVisuals';
import './ConstellationTree.css';

export interface ConstellationLayoutPosition {
  x: number;
  y: number;
}

interface ConstellationLayoutEditorProps {
  map: ConstellationMap;
  parentMapName?: string;
  skills: ConstellationSkill[];
  positions: Record<string, ConstellationLayoutPosition>;
  dirtySkillIds: Set<string>;
  selectedSkillId: string;
  disabled?: boolean;
  onSelectSkill: (skillId: string) => void;
  onTapSkill?: (skillId: string) => void;
  onActivateSkill?: (skillId: string) => void;
  onContextMenuSkill?: (skillId: string, clientX: number, clientY: number) => void;
  onPositionChange: (skillId: string, position: ConstellationLayoutPosition) => void;
  onCancel: () => void;
  onSave: () => void;
}

interface EditorGesture {
  type: 'node' | 'pan';
  pointerId: number;
  skillId?: string;
  startClientX: number;
  startClientY: number;
  startPanX: number;
  startPanY: number;
  startNodeX?: number;
  startNodeY?: number;
}

const NODE_MARGIN = 46;
const SNAP_SIZE = 20;

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
  positions,
  dirtySkillIds,
  selectedSkillId,
  disabled,
  onSelectSkill,
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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastTapRef = useRef<{ skillId: string; timestamp: number } | null>(null);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 820px)').matches;
    setZoom(mobile ? Math.min(1.5, map.viewport.maxZoom || 3) : 1);
    setPan({ x: 0, y: 0 });
  }, [map._id, map.viewport.maxZoom]);

  const skillIds = useMemo(() => new Set(skills.map(skill => skill._id)), [skills]);
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
    setZoom(Math.max(1, Math.min(map.viewport.maxZoom || 3, nextZoom)));
  };

  const moveNode = (skillId: string, rawPosition: ConstellationLayoutPosition) => {
    const round = (value: number) => Math.round(value / SNAP_SIZE) * SNAP_SIZE;
    onPositionChange(skillId, {
      x: Math.max(NODE_MARGIN, Math.min(map.viewport.width - NODE_MARGIN, round(rawPosition.x))),
      y: Math.max(NODE_MARGIN, Math.min(map.viewport.height - NODE_MARGIN, round(rawPosition.y)))
    });
  };

  const beginGesture = (nextGesture: EditorGesture, onTap?: () => void) => {
    let moved = false;
    setGesture(nextGesture);
    const handleMove = (event: PointerEvent) => {
      if (nextGesture.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - nextGesture.startClientX, event.clientY - nextGesture.startClientY);
      if (distance > 5) moved = true;
      if (nextGesture.type === 'node' && nextGesture.skillId) {
        if (!moved) return;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect || nextGesture.startNodeX === undefined || nextGesture.startNodeY === undefined) return;
        moveNode(nextGesture.skillId, {
          x: nextGesture.startNodeX + ((event.clientX - nextGesture.startClientX) / rect.width) * viewWidth,
          y: nextGesture.startNodeY + ((event.clientY - nextGesture.startClientY) / rect.height) * viewHeight
        });
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
      if (event.type === 'pointerup' && !moved) onTap?.();
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

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    updateZoom(zoom * (event.deltaY < 0 ? 1.12 : 0.9));
  };

  const handleKeyboard = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!selectedSkillId || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const current = positions[selectedSkillId];
    if (!current) return;
    event.preventDefault();
    const distance = event.shiftKey ? SNAP_SIZE : 1;
    moveNode(selectedSkillId, {
      x: current.x + (event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0),
      y: current.y + (event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0)
    });
  };

  const theme = map.visualTheme;
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

  return (
    <div className="constellation-layout-editor constellation-shell constellation-focus" style={themeStyle}>
      <header className="constellation-layout-simple-header">
        <div>
          <p>{parentMapName || (map.scope === 'discipline' ? 'Discipline' : 'Topic')}</p>
          <h2>{map.name}</h2>
        </div>
        <div className="constellation-layout-simple-actions">
          {dirtySkillIds.size > 0 && <span className="constellation-layout-dirty-count is-dirty">Unsaved</span>}
          <button type="button" className="constellation-admin-secondary" disabled={disabled || dirtySkillIds.size === 0} onClick={onCancel}><RotateCcw size={15} aria-hidden="true" /> Cancel</button>
          <button type="button" className="constellation-admin-primary" disabled={disabled || dirtySkillIds.size === 0} onClick={onSave}><Save size={15} aria-hidden="true" /> Save</button>
        </div>
      </header>

      <div className={`constellation-canvas-wrap constellation-layout-canvas-wrap ${gesture?.type === 'pan' ? 'is-panning' : ''}`}>
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
            onWheel={handleWheel}
            onKeyDown={handleKeyboard}
            onPointerDown={event => {
              if ((event.target as Element).closest('.constellation-layout-node')) return;
              onSelectSkill('');
              event.currentTarget.setPointerCapture(event.pointerId);
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
            </defs>
            <rect width={map.viewport.width} height={map.viewport.height} fill="var(--constellation-bg)" pointerEvents="none" />
            <rect width={map.viewport.width} height={map.viewport.height} fill={`url(#constellation-admin-grid-${map._id})`} pointerEvents="none" />
            <g className="constellation-lines constellation-layout-lines" aria-hidden="true">
              {visualEdges.map(edge => (
                <path key={`${edge.sourceId}-${edge.targetId}`} className={edge.special ? 'is-special' : ''} d={straightConstellationPath(edge.source, edge.target)} vectorEffect="non-scaling-stroke" />
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
                    className={`constellation-node is-available constellation-layout-node role-${role} ${selectedSkillId === skill._id ? 'is-selected' : ''} ${dirtySkillIds.has(skill._id) ? 'is-dirty' : ''}`}
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
                        onSelectSkill(skill._id);
                        return;
                      }
                      event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                      onSelectSkill(skill._id);
                      beginGesture({
                        type: 'node',
                        pointerId: event.pointerId,
                        skillId: skill._id,
                        startClientX: event.clientX,
                        startClientY: event.clientY,
                        startPanX: panX,
                        startPanY: panY,
                        startNodeX: position.x,
                        startNodeY: position.y
                      }, () => handleNodeTap(skill._id));
                    }}
                    onContextMenu={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      onSelectSkill(skill._id);
                      onContextMenuSkill?.(skill._id, event.clientX, event.clientY);
                    }}
                  >
                    {selectedSkillId === skill._id && <circle className="constellation-layout-selection-ring" r={role === 'capstone' ? 58 : 46} />}
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
