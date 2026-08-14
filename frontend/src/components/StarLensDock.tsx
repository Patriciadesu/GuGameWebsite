import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, ChevronDown, ChevronUp, GripHorizontal, Minus, Play, X } from 'lucide-react';
import type { ConstellationSkill } from './constellationTypes';
import { renderInlineMarkdown } from './inlineMarkdown';
import './StarLensDock.css';

interface DockPoint { x: number; y: number }

interface StarLensDockProps {
  skill: ConstellationSkill;
  workflow?: 'main' | 'skill';
  userLevel?: number;
  assetPointName: string;
  unlocked: boolean;
  pending: boolean;
  completed: boolean;
  completedStepIds: string[];
  canUnlock: boolean;
  onClose: () => void;
  onPrimaryAction: () => void;
  onCompleteStep: (stepId: string) => void;
}

const defaultPosition = (): DockPoint => ({
  x: Math.max(24, window.innerWidth - 510),
  y: Math.max(92, Math.min(170, window.innerHeight - 280))
});

const clampPosition = (point: DockPoint, width = 470, height = 180): DockPoint => ({
  x: Math.min(Math.max(12, point.x), Math.max(12, window.innerWidth - width - 12)),
  y: Math.min(Math.max(12, point.y), Math.max(12, window.innerHeight - height - 12))
});

const loadPosition = (): DockPoint => {
  try {
    const saved = JSON.parse(localStorage.getItem('gugame-star-lens-position') || 'null');
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) return clampPosition(saved);
  } catch {
    // Ignore stale local preferences.
  }
  return defaultPosition();
};

export default function StarLensDock({
  skill,
  workflow = 'skill',
  userLevel = 1,
  assetPointName,
  unlocked,
  pending,
  completed,
  completedStepIds,
  canUnlock,
  onClose,
  onPrimaryAction,
  onCompleteStep
}: StarLensDockProps) {
  const dockRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [position, setPosition] = useState<DockPoint>(loadPosition);
  const [minimized, setMinimized] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const steps = skill.subQuests || [];
  const completedSteps = useMemo(() => steps.filter((step, index) => completedStepIds.includes(step.externalId || `step-${index}`)).length, [completedStepIds, steps]);
  const progress = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : (unlocked || completed ? 100 : 0);
  const imageUrl = skill.nodePreview?.imageUrl;
  const summary = skill.nodePreview?.summary || skill.description;
  const outcomes = skill.nodePreview?.outcomes || [];
  const isMainQuest = workflow === 'main';
  const questLevel = skill.mainQuestLevel || 1;

  useEffect(() => {
    setShowSteps(false);
  }, [skill._id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    const handleResize = () => setPosition(current => clampPosition(current, dockRef.current?.offsetWidth, dockRef.current?.offsetHeight));
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - position.x, offsetY: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setPosition(clampPosition({ x: event.clientX - current.offsetX, y: event.clientY - current.offsetY }, dockRef.current?.offsetWidth, dockRef.current?.offsetHeight));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    localStorage.setItem('gugame-star-lens-position', JSON.stringify(position));
  };

  const status = completed ? 'Completed' : pending ? 'Pending review' : unlocked ? 'In progress' : canUnlock ? 'Available' : 'Locked';
  const actionLabel = isMainQuest
    ? completed ? `Level ${questLevel} completed`
      : pending ? 'Pending level-up review'
        : canUnlock ? `Submit to reach Level ${questLevel + 1}`
          : questLevel > userLevel ? `Unlocks at Level ${questLevel}` : 'Quest unavailable'
    : completed ? 'Completed' : pending ? 'Pending review' : unlocked ? 'Continue journey' : canUnlock ? (skill.nodePreview?.actionLabel || 'Start journey') : 'Requirements locked';
  const actionDisabled = completed || pending || (!unlocked && !canUnlock) || (!isMainQuest && unlocked && steps.length === 0);
  const handleAction = () => {
    if (!isMainQuest && steps.length > 0 && (unlocked || completedSteps < steps.length)) {
      setShowSteps(true);
      return;
    }
    onPrimaryAction();
  };

  return (
    <aside
      ref={dockRef}
      className={`star-lens-dock ${minimized ? 'is-minimized' : ''}`}
      style={{ '--dock-x': `${position.x}px`, '--dock-y': `${position.y}px` } as CSSProperties}
      aria-label={`${skill.title} quest details`}
      aria-live="polite"
    >
      <div className="star-lens-dock__bar" onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <span className="star-lens-dock__drag"><GripHorizontal aria-hidden="true" /><span>Star Lens</span></span>
        <span className={`star-lens-dock__status is-${status.toLowerCase().replace(/\s/g, '-')}`}>{status}</span>
        <div className="star-lens-dock__tools">
          <button type="button" onClick={() => setMinimized(value => !value)} aria-label={minimized ? 'Expand quest dock' : 'Minimize quest dock'} title={minimized ? 'Expand' : 'Minimize'}><Minus aria-hidden="true" /></button>
          <button type="button" onClick={onClose} aria-label="Close quest dock" title="Close"><X aria-hidden="true" /></button>
        </div>
      </div>

      {!minimized && <>
        <div className="star-lens-dock__content">
          {imageUrl && <div className="star-lens-dock__art"><img src={imageUrl} alt="" onError={event => { event.currentTarget.parentElement!.hidden = true; }} /></div>}
          <div className="star-lens-dock__summary">
            <div className="star-lens-dock__eyebrow">{isMainQuest ? `Main Quest · Level ${questLevel} → ${questLevel + 1}` : `Main quest topic${skill.topicLevel ? ` · Level ${skill.topicLevel}` : ''}`}</div>
            <h2>{skill.constellationLabel || skill.title}</h2>
            <p>{renderInlineMarkdown(summary, `star-lens-${skill._id}`)}</p>
            {outcomes.length > 0 && <div className="star-lens-dock__outcomes" aria-label="Quest outcomes">
              {outcomes.slice(0, 3).map(outcome => <span key={outcome}><Check aria-hidden="true" />{outcome}</span>)}
            </div>}
          </div>
        </div>

        {isMainQuest ? (
          steps.length > 0 && <section className="star-lens-dock__steps is-requirements">
            <div className="star-lens-dock__steps-toggle"><span>Requirements</span></div>
            <div className="star-lens-dock__step-list">
              {steps.map((step, index) => <article key={step.externalId || `step-${index}`}>
                <span>{index + 1}</span>
                <div><strong>{step.title}</strong><p>{renderInlineMarkdown(step.description || '', `star-lens-requirement-${step.externalId || index}`)}</p></div>
              </article>)}
            </div>
          </section>
        ) : <div className="star-lens-dock__progress">
          <span>{steps.length > 0 ? `${completedSteps} of ${steps.length} steps` : status}</span>
          <span>{progress}%</span>
          <i><b style={{ width: `${progress}%` }} /></i>
        </div>}

        {!isMainQuest && steps.length > 0 && <section className="star-lens-dock__steps">
          <button type="button" className="star-lens-dock__steps-toggle" onClick={() => setShowSteps(value => !value)} aria-expanded={showSteps}>
            <span>Quest steps</span>{showSteps ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
          {showSteps && <div className="star-lens-dock__step-list">
            {steps.map((step, index) => {
              const stepId = step.externalId || `step-${index}`;
              const isDone = completedStepIds.includes(stepId);
              return <article key={stepId} className={isDone ? 'is-complete' : ''}>
                <span>{isDone ? <Check aria-hidden="true" /> : index + 1}</span>
                <div><strong>{step.title}</strong><p>{renderInlineMarkdown(step.description || '', `star-lens-step-${stepId}`)}</p></div>
                <button type="button" onClick={() => onCompleteStep(stepId)} disabled={isDone || pending || (!unlocked && !canUnlock)}>{isDone ? 'Done' : 'Complete'}</button>
              </article>;
            })}
          </div>}
        </section>}

        <footer className="star-lens-dock__footer">
          <span>{isMainQuest ? `Level-up quest for Level ${questLevel}` : skill.cost > 0 ? `${skill.cost} ${assetPointName}` : 'Main journey'}</span>
          <button type="button" className="star-lens-dock__action" onClick={handleAction} disabled={actionDisabled}>
            {completed ? <Check aria-hidden="true" /> : <Play aria-hidden="true" />}{actionLabel}
          </button>
        </footer>
      </>}
    </aside>
  );
}
