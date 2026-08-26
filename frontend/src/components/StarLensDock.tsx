import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import axios from '../config/axios';
import { Check, ChevronDown, ChevronUp, GripHorizontal, HelpCircle, ImagePlus, LoaderCircle, Minus, Play, RefreshCw, Send, Trash2, X } from 'lucide-react';
import type { ConstellationSkill } from './constellationTypes';
import { renderInlineMarkdown } from './inlineMarkdown';
import { resolveMainQuestStatus } from './mainQuestStatus';
import './StarLensDock.css';

interface DockPoint { x: number; y: number }

interface StarLensDockProps {
  skill: ConstellationSkill;
  workflow?: 'main' | 'skill' | 'topic';
  userLevel?: number;
  assetPointName: string;
  unlocked: boolean;
  pending: boolean;
  completed: boolean;
  completedStepIds: string[];
  canUnlock: boolean;
  closing?: boolean;
  focusOnOpen?: boolean;
  onClose: () => void;
  onPrimaryAction: () => void;
  onCompleteStep: (stepId: string) => void;
  onProgressSynced?: () => void | Promise<void>;
  onOpenImage?: (src: string, alt: string) => void;
}

type RemoteStepStatus = 'available' | 'pending' | 'approved' | 'rejected';

interface HamsterQuestWorkflow {
  connected: boolean;
  setupIssue?: 'user-not-found' | 'house-required';
  setupMessage?: string;
  externalUserQuestId?: string;
  questStatus?: 'Active' | 'Pending' | 'Completed';
  lifecycleStatus?: 'active' | 'completed';
  steps: Array<{ stepId: string; status: RemoteStepStatus; submissionId?: string }>;
  allStepsApproved: boolean;
  questCompleted: boolean;
  syncWarning?: string;
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
  closing = false,
  focusOnOpen = false,
  onClose,
  onPrimaryAction,
  onCompleteStep,
  onProgressSynced,
  onOpenImage
}: StarLensDockProps) {
  const dockRef = useRef<HTMLElement | null>(null);
  const submissionDialogRef = useRef<HTMLDivElement | null>(null);
  const submissionMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const submissionOpenerRef = useRef<HTMLElement | null>(null);
  const submittingRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [position, setPosition] = useState<DockPoint>(loadPosition);
  const [minimized, setMinimized] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [failedStepImages, setFailedStepImages] = useState<Set<string>>(new Set());
  const [workflowData, setWorkflowData] = useState<HamsterQuestWorkflow | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const [workflowNotice, setWorkflowNotice] = useState('');
  const [revealedHints, setRevealedHints] = useState<Set<string>>(new Set());
  const [submissionStepId, setSubmissionStepId] = useState<string | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [submissionImage, setSubmissionImage] = useState<File | null>(null);
  const [submissionPreview, setSubmissionPreview] = useState('');
  const [submissionError, setSubmissionError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const progressSignatureRef = useRef('');
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  const steps = skill.subQuests || [];
  const usesHamsterQuestWorkflow = workflow === 'skill' && skill.externalSource === 'star-master' && Boolean(skill.externalQuestId);
  const remoteStatusByStep = useMemo(() => new Map((workflowData?.steps || []).map(step => [step.stepId, step.status])), [workflowData]);
  const completedSteps = useMemo(() => steps.filter((step, index) => {
    const stepId = step.externalId || `step-${index}`;
    return usesHamsterQuestWorkflow ? remoteStatusByStep.get(stepId) === 'approved' : completedStepIds.includes(stepId);
  }).length, [completedStepIds, remoteStatusByStep, steps, usesHamsterQuestWorkflow]);
  const pendingSteps = usesHamsterQuestWorkflow
    ? steps.filter((step, index) => remoteStatusByStep.get(step.externalId || `step-${index}`) === 'pending').length
    : 0;
  const allStepsCompleted = steps.length > 0 && completedSteps === steps.length;
  const requiresReview = skill.nodeType === 'quest' || skill.nodeColor === 'green';
  const progress = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : (unlocked || completed ? 100 : 0);
  const firstStepImage = steps.flatMap(step => step.descriptionParts || [])
    .find(part => part.type.toLowerCase() === 'image' && part.content.trim())?.content.trim();
  const descriptionImage = /!\[[^\]]*\]\((https?:\/\/[^)]+)\)/i.exec(skill.description)?.[1];
  const imageUrl = skill.nodePreview?.imageUrl || firstStepImage || descriptionImage;
  const summary = skill.nodePreview?.summary || skill.description;
  const outcomes = skill.nodePreview?.outcomes || [];
  const isMainQuest = workflow === 'main';
  const isTopicPath = workflow === 'topic';
  const topicLevelLocked = !isMainQuest && (skill.topicLevel || userLevel) > userLevel;
  const questLevel = skill.mainQuestLevel || 1;
  const mainQuestStatus = resolveMainQuestStatus({ questLevel, userLevel, pending });

  const loadWorkflow = async (showLoading = false) => {
    if (!usesHamsterQuestWorkflow) return;
    if (showLoading) setWorkflowLoading(true);
    try {
      const response = await axios.get(`/api/skills/${skill._id}/hamsterquest-workflow`);
      const next = response.data.workflow as HamsterQuestWorkflow;
      setWorkflowData(next);
      setWorkflowError('');
      const signature = JSON.stringify({ steps: next.steps, completed: next.questCompleted });
      if (progressSignatureRef.current !== signature) await onProgressSynced?.();
      progressSignatureRef.current = signature;
    } catch (error: any) {
      setWorkflowError(error.response?.data?.error || 'Unable to sync HamsterQuest review status.');
    } finally {
      if (showLoading) setWorkflowLoading(false);
    }
  };

  useEffect(() => {
    setShowSteps(workflow === 'skill' && steps.length > 0);
    setImageFailed(false);
    setFailedStepImages(new Set());
    setWorkflowData(null);
    setWorkflowError('');
    setWorkflowNotice('');
    setRevealedHints(new Set());
    setSubmissionStepId(null);
    progressSignatureRef.current = '';
  }, [skill._id, steps.length, workflow]);

  useEffect(() => {
    if (!usesHamsterQuestWorkflow) return;
    void loadWorkflow(true);
    const timer = window.setInterval(() => { void loadWorkflow(false); }, 12_000);
    return () => window.clearInterval(timer);
  }, [skill._id, usesHamsterQuestWorkflow]);

  useEffect(() => {
    if (!submissionImage) {
      setSubmissionPreview('');
      return;
    }
    const preview = URL.createObjectURL(submissionImage);
    setSubmissionPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [submissionImage]);

  const closeSubmission = () => {
    if (submittingRef.current) return;
    setSubmissionStepId(null);
    setSubmissionMessage('');
    setSubmissionImage(null);
    setSubmissionError('');
  };

  const openSubmission = (stepId: string, opener: HTMLElement) => {
    submissionOpenerRef.current = opener;
    setSubmissionError('');
    setSubmissionStepId(stepId);
  };

  const chooseSubmissionImage = (file: File | null) => {
    if (!file) {
      setSubmissionImage(null);
      return;
    }
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      setSubmissionImage(null);
      setSubmissionError('Choose a PNG, JPEG, GIF, or WebP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setSubmissionImage(null);
      setSubmissionError('Image must be 10 MB or smaller.');
      return;
    }
    setSubmissionError('');
    setSubmissionImage(file);
  };

  const submitStep = async () => {
    if (!submissionStepId || (!submissionMessage.trim() && !submissionImage)) {
      setSubmissionError('Add a message or image before submitting.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError('');
    try {
      const formData = new FormData();
      formData.append('stepId', submissionStepId);
      formData.append('message', submissionMessage.trim());
      if (submissionImage) formData.append('image', submissionImage);
      const response = await axios.post(`/api/skills/${skill._id}/hamsterquest-submissions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setWorkflowData(response.data.workflow);
      progressSignatureRef.current = JSON.stringify({ steps: response.data.workflow.steps, completed: response.data.workflow.questCompleted });
      setSubmissionStepId(null);
      setSubmissionMessage('');
      setSubmissionImage(null);
      setSubmissionError('');
      setWorkflowNotice('Step submitted. HamsterQuest review is now pending.');
      await onProgressSynced?.();
    } catch (error: any) {
      setSubmissionError(error.response?.data?.error || 'Unable to submit this Step.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!workflowNotice) return;
    const timer = window.setTimeout(() => setWorkflowNotice(''), 6_000);
    return () => window.clearTimeout(timer);
  }, [workflowNotice]);

  useEffect(() => {
    if (!submissionStepId) return;
    const dialog = submissionDialogRef.current;
    const dock = dockRef.current;
    const priorDockInert = dock?.inert || false;
    const priorOverflow = document.body.style.overflow;
    if (dock) dock.inert = true;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => submissionMessageRef.current?.focus());

    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []).filter(element => element.offsetParent !== null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeSubmission();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (dock) dock.inert = priorDockInert;
      document.body.style.overflow = priorOverflow;
      window.requestAnimationFrame(() => submissionOpenerRef.current?.focus());
    };
  }, [submissionStepId]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 720px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!focusOnOpen && !isMobile) return;
    const frame = window.requestAnimationFrame(() => {
      dockRef.current?.querySelector<HTMLElement>('.star-lens-dock__close')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusOnOpen, isMobile, skill._id]);

  useEffect(() => {
    if (!isMobile || !dockRef.current) return;
    const dock = dockRef.current;
    const parent = dock.parentElement;
    const backgroundElements = [
      ...Array.from(parent?.children || []).filter(element => element !== dock && !element.classList.contains('star-lens-scrim')),
      ...Array.from(document.querySelectorAll('.theme-toggle'))
    ] as HTMLElement[];
    const priorInert = backgroundElements.map(element => ({ element, inert: element.inert }));
    const priorOverflow = document.body.style.overflow;
    backgroundElements.forEach(element => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    return () => {
      priorInert.forEach(({ element, inert }) => { element.inert = inert; });
      document.body.style.overflow = priorOverflow;
    };
  }, [isMobile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (submissionStepId) return;
      if (event.key === 'Escape') {
        const topModal = document.querySelector<HTMLElement>('[aria-modal="true"]');
        if (topModal && topModal !== dockRef.current) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (!isMobile || event.key !== 'Tab') return;
      const focusable = Array.from(dockRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) || []).filter(element => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleResize = () => setPosition(current => clampPosition(current, dockRef.current?.offsetWidth, dockRef.current?.offsetHeight));
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [isMobile, onClose, submissionStepId]);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isMobile) return;
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

  const status = isMainQuest
    ? mainQuestStatus === 'completed' ? 'Completed'
      : mainQuestStatus === 'pending' ? 'Pending review'
        : mainQuestStatus === 'current' ? 'Current quest' : 'Future level'
    : isTopicPath
      ? pending ? 'Pending review' : topicLevelLocked ? 'Locked' : unlocked ? 'Unlocked' : canUnlock ? 'Available' : 'Locked'
    : topicLevelLocked ? 'Locked'
    : usesHamsterQuestWorkflow
      ? workflowLoading || !workflowData ? 'Syncing'
        : workflowData?.questCompleted ? 'Completed'
        : workflowData?.steps.some(step => step.status === 'pending') || workflowData?.allStepsApproved ? 'Pending review'
          : unlocked ? 'In progress' : canUnlock ? 'Available' : 'Locked'
      : completed ? 'Completed' : pending ? 'Pending review' : unlocked ? 'In progress' : canUnlock ? 'Available' : 'Locked';
  const actionLabel = isMainQuest
    ? mainQuestStatus === 'completed' ? `Level ${questLevel} completed`
      : mainQuestStatus === 'pending' ? 'Pending level-up review'
        : mainQuestStatus === 'future' ? `Unlocks at Level ${questLevel}`
          : canUnlock ? `Submit for Level ${questLevel + 1}` : 'Submission unavailable'
    : isTopicPath
      ? pending ? 'Approval pending'
        : topicLevelLocked
          ? `Unlocks at Level ${skill.topicLevel}`
          : !unlocked && !canUnlock
            ? 'Prerequisites required'
          : skill.nodePreview?.actionLabel || 'View Path'
    : topicLevelLocked
      ? `Unlocks at Level ${skill.topicLevel}`
    : usesHamsterQuestWorkflow
      ? workflowLoading ? 'Syncing review status'
        : workflowError ? 'Sync unavailable'
          : workflowData?.setupIssue ? 'Setup required'
            : workflowData?.questCompleted ? 'Completed in HamsterQuest'
              : showSteps ? 'Hide steps' : 'View steps'
    : completed ? 'Completed'
      : pending ? 'Pending review'
        : steps.length > 0 && !allStepsCompleted ? (showSteps ? 'Hide steps' : 'View steps')
          : allStepsCompleted && requiresReview ? 'Request approval'
            : unlocked ? 'Journey active'
              : canUnlock ? (skill.nodePreview?.actionLabel || 'Start journey') : 'Requirements locked';
  const actionDisabled = isMainQuest
    ? mainQuestStatus !== 'current' || !canUnlock
    : isTopicPath
      ? pending || topicLevelLocked || (!unlocked && !canUnlock)
    : topicLevelLocked ? true
    : usesHamsterQuestWorkflow
      ? workflowLoading || !workflowData || Boolean(workflowError) || Boolean(workflowData.setupIssue) || Boolean(workflowData.questCompleted) || (!unlocked && !canUnlock)
      : completed || pending || (!unlocked && !canUnlock) || (unlocked && steps.length === 0);
  const topicRequirement = !isMainQuest && topicLevelLocked
    ? `Reach Level ${skill.topicLevel} to start this Quest.`
    : isTopicPath
    ? pending
      ? 'Approval is pending.'
      : topicLevelLocked
        ? `Reach Level ${skill.topicLevel} to enter this topic.`
        : !unlocked && !canUnlock
          ? 'Complete the required topics first.'
          : ''
    : !isMainQuest && !unlocked && !canUnlock
      ? 'Complete the prerequisite Quests first.'
    : '';
  const handleAction = () => {
    if (isTopicPath) {
      onPrimaryAction();
      return;
    }
    if (!isMainQuest && steps.length > 0 && !allStepsCompleted) {
      setShowSteps(value => !value);
      return;
    }
    if (usesHamsterQuestWorkflow) {
      setShowSteps(value => !value);
      return;
    }
    onPrimaryAction();
  };

  const renderStepPart = (part: { type: string; content: string }, key: string, alt: string) => {
    const type = part.type.toLowerCase();
    if (type === 'image') {
      return <div className="star-lens-dock__step-media" key={key}>
        {failedStepImages.has(part.content) ? <span>Image unavailable</span> : <button type="button" onClick={() => onOpenImage?.(part.content, alt)} disabled={!onOpenImage} aria-label={`View ${alt}`}>
          <img src={part.content} alt="" loading="lazy" onError={() => setFailedStepImages(current => new Set(current).add(part.content))} />
        </button>}
      </div>;
    }
    if (type === 'youtube' || type === 'googledrive') {
      return <a className="star-lens-dock__resource-link" key={key} href={part.content} target="_blank" rel="noreferrer">Open {type === 'youtube' ? 'video' : 'resource'}</a>;
    }
    return <p key={key}>{renderInlineMarkdown(part.content, key)}</p>;
  };

  return <>
    <button type="button" className="star-lens-scrim" aria-label={isTopicPath ? 'Close topic path info' : 'Close quest details'} onClick={onClose} />
    <aside
      id="star-lens-dock"
      ref={dockRef}
      className={`star-lens-dock is-${workflow}-workflow ${minimized ? 'is-minimized' : ''} ${closing ? 'is-closing' : ''}`}
      style={{ '--dock-x': `${position.x}px`, '--dock-y': `${position.y}px` } as CSSProperties}
      aria-label={isTopicPath ? `${skill.title} topic path info` : `${skill.title} quest details`}
      role={isMobile ? 'dialog' : 'complementary'}
      aria-modal={isMobile ? true : undefined}
    >
      <div className="star-lens-dock__bar" onPointerDown={beginDrag} onPointerMove={drag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        <span className="star-lens-dock__drag"><GripHorizontal aria-hidden="true" /><span>Star Lens</span></span>
        <span className={`star-lens-dock__status is-${status.toLowerCase().replace(/\s/g, '-')}`}>{status}</span>
        <div className="star-lens-dock__tools">
          <button type="button" onClick={() => setMinimized(value => !value)} aria-label={minimized ? 'Expand quest dock' : 'Minimize quest dock'} title={minimized ? 'Expand' : 'Minimize'}><Minus aria-hidden="true" /></button>
          <button type="button" className="star-lens-dock__close" onClick={onClose} aria-label="Close quest dock" title="Close"><X aria-hidden="true" /></button>
        </div>
      </div>

      {!minimized && <div className="star-lens-dock__body" key={skill._id}>
        <div className="star-lens-dock__content">
          {imageUrl && <div className="star-lens-dock__art" aria-label={`${skill.constellationLabel || skill.title} preview`}>
            {imageFailed
              ? <span>Preview unavailable</span>
              : <button type="button" onClick={() => onOpenImage?.(imageUrl, skill.constellationLabel || skill.title)} disabled={!onOpenImage} aria-label={`View ${skill.constellationLabel || skill.title} image`}>
                  <img src={imageUrl} alt="" onError={() => setImageFailed(true)} />
                </button>}
          </div>}
          <div className="star-lens-dock__summary">
            <div className="star-lens-dock__eyebrow">{isMainQuest
              ? `Main Quest · Level ${questLevel} → ${questLevel + 1}`
              : isTopicPath
                ? `Topic Path${skill.topicLevel ? ` · Level ${skill.topicLevel}` : ''}`
                : `Skill Quest${skill.topicLevel ? ` · Level ${skill.topicLevel}` : ''}`}</div>
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
        ) : !isTopicPath && <div className="star-lens-dock__progress">
          <span>{steps.length > 0
            ? usesHamsterQuestWorkflow && pendingSteps > 0
              ? `${completedSteps} approved · ${pendingSteps} pending`
              : `${completedSteps} of ${steps.length} steps`
            : status}</span>
          <span>{progress}%</span>
          <i><b style={{ width: `${progress}%` }} /></i>
        </div>}

        {usesHamsterQuestWorkflow && (workflowError || workflowData?.setupMessage || workflowData?.syncWarning) && <div className={`star-lens-dock__workflow-note ${workflowError || workflowData?.setupIssue ? 'is-error' : ''}`} role="status">
          {workflowError || workflowData?.setupMessage || workflowData?.syncWarning}
          {workflowError && <button type="button" onClick={() => void loadWorkflow(true)}>Try again</button>}
        </div>}

        {usesHamsterQuestWorkflow && workflowNotice && <div className="star-lens-dock__workflow-note is-success" role="status">{workflowNotice}</div>}

        {!isMainQuest && !isTopicPath && steps.length > 0 && <section className="star-lens-dock__steps">
          <button type="button" className="star-lens-dock__steps-toggle" onClick={() => setShowSteps(value => !value)} aria-expanded={showSteps}>
            <span>Quest steps</span>{showSteps ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
          {showSteps && <div className="star-lens-dock__step-list">
            {steps.map((step, index) => {
              const stepId = step.externalId || `step-${index}`;
              const remoteStatus = remoteStatusByStep.get(stepId) || 'available';
              const isDone = usesHamsterQuestWorkflow ? remoteStatus === 'approved' : completedStepIds.includes(stepId);
              const isPendingStep = usesHamsterQuestWorkflow && remoteStatus === 'pending';
              const isRejectedStep = usesHamsterQuestWorkflow && remoteStatus === 'rejected';
              const parts = (step.descriptionParts || []).filter(part => part.content.trim());
              const hintParts = (step.hintParts || []).filter(part => part.content.trim());
              const hintRevealed = revealedHints.has(stepId);
              const stepActionLabel = isDone ? 'Approved' : isPendingStep ? 'Pending' : isRejectedStep ? 'Resubmit' : usesHamsterQuestWorkflow ? 'Submit' : 'Complete';
              return <article key={stepId} className={`${isDone ? 'is-complete' : ''} ${isPendingStep ? 'is-pending' : ''} ${isRejectedStep ? 'is-rejected' : ''}`}>
                <div className="star-lens-dock__step-heading">
                  <span>{isDone ? <Check aria-hidden="true" /> : index + 1}</span>
                  <div><small>{isDone ? 'Approved' : isPendingStep ? 'Waiting for review' : isRejectedStep ? 'Needs revision' : `Step ${index + 1}`}</small><strong>{step.title}</strong></div>
                  <button
                    type="button"
                    onClick={event => usesHamsterQuestWorkflow ? openSubmission(stepId, event.currentTarget) : onCompleteStep(stepId)}
                    disabled={topicLevelLocked || isDone || isPendingStep || (usesHamsterQuestWorkflow && (workflowLoading || !workflowData || Boolean(workflowError) || Boolean(workflowData.setupIssue))) || (!unlocked && !canUnlock) || (!usesHamsterQuestWorkflow && pending)}
                  >{stepActionLabel}</button>
                </div>
                <div className="star-lens-dock__step-details">
                  {parts.length > 0 ? parts.map((part, partIndex) => renderStepPart(part, `star-lens-step-${stepId}-${partIndex}`, `${step.title} image`))
                    : step.description && <p>{renderInlineMarkdown(step.description, `star-lens-step-${stepId}`)}</p>}
                  {hintParts.length > 0 && <div className="star-lens-dock__hint">
                    <button type="button" onClick={() => setRevealedHints(current => {
                      const next = new Set(current);
                      if (next.has(stepId)) next.delete(stepId); else next.add(stepId);
                      return next;
                    })} aria-expanded={hintRevealed}><HelpCircle aria-hidden="true" />{hintRevealed ? 'Hide hint' : 'Show hint'}</button>
                    {hintRevealed && <div className="star-lens-dock__hint-content">
                      {hintParts.map((part, partIndex) => renderStepPart(part, `star-lens-hint-${stepId}-${partIndex}`, `${step.title} hint`))}
                    </div>}
                  </div>}
                </div>
              </article>;
            })}
          </div>}
        </section>}

        {topicRequirement && <p className="star-lens-dock__requirement">{topicRequirement}</p>}

        <footer className="star-lens-dock__footer">
          <span>{isMainQuest
            ? 'Admin review required after submission'
            : isTopicPath
              ? 'Skill constellation path'
              : usesHamsterQuestWorkflow ? 'Synced with HamsterQuest'
                : skill.cost > 0 ? `${skill.cost} ${assetPointName}` : 'Skill quest'}</span>
          <button type="button" className="star-lens-dock__action" onClick={handleAction} disabled={actionDisabled}>
            {workflowLoading ? <LoaderCircle className="is-spinning" aria-hidden="true" />
              : !isMainQuest && !isTopicPath && steps.length > 0 && !allStepsCompleted && showSteps
              ? <ChevronUp aria-hidden="true" />
              : (!isTopicPath && (isMainQuest ? mainQuestStatus === 'completed' : completed)) ? <Check aria-hidden="true" /> : <Play aria-hidden="true" />}{actionLabel}
          </button>
          {usesHamsterQuestWorkflow && <button type="button" className="star-lens-dock__refresh" onClick={() => void loadWorkflow(true)} disabled={workflowLoading} aria-label="Refresh HamsterQuest review status" title="Refresh review status"><RefreshCw className={workflowLoading ? 'is-spinning' : ''} aria-hidden="true" /></button>}
        </footer>
      </div>}
      <span className="star-lens-dock__announcement" role="status" aria-live="polite">{skill.title}: {status}</span>
    </aside>
    {submissionStepId && <div ref={submissionDialogRef} className="star-lens-submit" role="dialog" aria-modal="true" aria-labelledby="star-lens-submit-title" onClick={closeSubmission} tabIndex={-1}>
      <div className="star-lens-submit__panel" onClick={event => event.stopPropagation()}>
        <header><div><small>HamsterQuest submission</small><h3 id="star-lens-submit-title">{steps.find((step, index) => (step.externalId || `step-${index}`) === submissionStepId)?.title}</h3></div><button type="button" onClick={closeSubmission} disabled={submitting} aria-label="Close submission"><X aria-hidden="true" /></button></header>
        <label>Message<textarea ref={submissionMessageRef} value={submissionMessage} onChange={event => setSubmissionMessage(event.target.value)} maxLength={5000} rows={4} placeholder="Explain what you completed or leave context for the reviewer…" /><small className="star-lens-submit__count">{submissionMessage.length.toLocaleString()} / 5,000</small></label>
        <div className="star-lens-submit__image">
          {submissionPreview ? <div className="star-lens-submit__preview"><img src={submissionPreview} alt="Submission preview" /><button type="button" onClick={() => setSubmissionImage(null)} disabled={submitting}><Trash2 aria-hidden="true" />Remove</button></div>
            : <label><ImagePlus aria-hidden="true" /><span>Add proof image<small>PNG, JPEG, GIF or WebP · up to 10 MB</small></span><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { chooseSubmissionImage(event.target.files?.[0] || null); event.target.value = ''; }} /></label>}
        </div>
        {submissionError && <p className="star-lens-submit__error" role="alert">{submissionError}</p>}
        <footer><button type="button" onClick={closeSubmission} disabled={submitting}>Cancel</button><button type="button" className="is-primary" onClick={() => void submitStep()} disabled={submitting || (!submissionMessage.trim() && !submissionImage)}>{submitting ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Send aria-hidden="true" />}{submitting ? 'Submitting…' : 'Submit for review'}</button></footer>
      </div>
    </div>}
  </>;
}
