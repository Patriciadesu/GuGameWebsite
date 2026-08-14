import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Check, Clock3, LockKeyhole, Target } from 'lucide-react';
import axios from '../config/axios';
import type { ConstellationMap, ConstellationSkill } from './constellationTypes';
import { resolveMainQuestStatus, type MainQuestStatus } from './mainQuestStatus';
import './MainQuestStrip.css';

interface MainQuestStripProps {
  map: ConstellationMap;
  refreshRevision?: number;
  pendingSkillIds: string[];
  selectedSkillId?: string | null;
  userLevel: number;
  onOpenSkill: (skill: ConstellationSkill, interaction: 'pointer' | 'keyboard', trigger: HTMLButtonElement) => void;
}

const statusCopy: Record<MainQuestStatus, string> = {
  completed: 'Completed',
  current: 'Current',
  pending: 'Pending review',
  future: 'Future'
};

const StatusIcon = ({ status }: { status: MainQuestStatus }) => {
  if (status === 'completed') return <Check aria-hidden="true" />;
  if (status === 'pending') return <Clock3 aria-hidden="true" />;
  if (status === 'future') return <LockKeyhole aria-hidden="true" />;
  return <Target aria-hidden="true" />;
};

export default function MainQuestStrip({
  map,
  refreshRevision = 0,
  pendingSkillIds,
  selectedSkillId = null,
  userLevel,
  onOpenSkill
}: MainQuestStripProps) {
  const [quests, setQuests] = useState<ConstellationSkill[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const currentStepRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    axios.get(`/api/constellation-maps/${map._id}`)
      .then(response => {
        if (cancelled) return;
        setQuests((response.data.skills || [])
          .filter((skill: ConstellationSkill) => skill.isActive)
          .sort((left: ConstellationSkill, right: ConstellationSkill) => (left.mainQuestLevel || 1) - (right.mainQuestLevel || 1)));
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [map._id, refreshRevision]);

  const questStates = useMemo(() => quests.map(quest => ({
    quest,
    status: resolveMainQuestStatus({
      questLevel: quest.mainQuestLevel || 1,
      userLevel,
      pending: pendingSkillIds.includes(quest._id)
    })
  })), [pendingSkillIds, quests, userLevel]);

  const currentEntry = questStates.find(entry => entry.quest.mainQuestLevel === userLevel)
    || questStates.find(entry => (entry.quest.mainQuestLevel || 1) > userLevel)
    || questStates[questStates.length - 1];

  useEffect(() => {
    if (!currentEntry) return;
    const frame = window.requestAnimationFrame(() => currentStepRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center'
    }));
    return () => window.cancelAnimationFrame(frame);
  }, [currentEntry?.quest._id]);

  const openQuest = (event: MouseEvent<HTMLButtonElement>, quest: ConstellationSkill) => {
    onOpenSkill(quest, event.detail === 0 ? 'keyboard' : 'pointer', event.currentTarget);
  };

  if (loadState === 'loading') return <div className="main-quest-strip-state" role="status">Loading Main Quest…</div>;
  if (loadState === 'error') return <div className="main-quest-strip-state is-error" role="alert">Main Quest is temporarily unavailable.</div>;
  if (!currentEntry) return <div className="main-quest-strip-state" role="status">No published Main Quest yet.</div>;

  const currentLevel = currentEntry.quest.mainQuestLevel || userLevel;

  return (
    <div className="main-quest-strip">
      <header className="main-quest-strip__summary">
        <div className="main-quest-strip__copy">
          <span className="main-quest-strip__eyebrow">Main Quest</span>
          <div className="main-quest-strip__title-row">
            <h2>{currentEntry.quest.title}</h2>
            <span className={`main-quest-strip__status is-${currentEntry.status}`}>{statusCopy[currentEntry.status]}</span>
          </div>
          <p><strong>Next · Level {currentLevel + 1}</strong><span>Open to read requirements and submit.</span></p>
        </div>
        <button
          type="button"
          className="main-quest-strip__open"
          aria-controls={selectedSkillId === currentEntry.quest._id ? 'star-lens-dock' : undefined}
          aria-expanded={selectedSkillId === currentEntry.quest._id}
          onClick={event => openQuest(event, currentEntry.quest)}
        >
          View quest
        </button>
      </header>

      <div className="main-quest-strip__track" role="list" aria-label={`${map.name} level-up path`}>
        {questStates.map(entry => {
          const level = entry.quest.mainQuestLevel || 1;
          const selected = selectedSkillId === entry.quest._id;
          const isCurrentLevel = level === currentLevel;
          return (
            <div className="main-quest-strip__step" role="listitem" key={entry.quest._id}>
              <button
                ref={isCurrentLevel ? currentStepRef : undefined}
                type="button"
                className={`main-quest-strip__step-button is-${entry.status}${selected ? ' is-selected' : ''}`}
                data-skill-id={entry.quest._id}
                aria-label={`${entry.quest.title}, Level ${level}, ${statusCopy[entry.status]}`}
                aria-controls={selected ? 'star-lens-dock' : undefined}
                aria-expanded={selected}
                onClick={event => openQuest(event, entry.quest)}
              >
                <span className="main-quest-strip__marker"><StatusIcon status={entry.status} /><b>{level}</b></span>
                <span className="main-quest-strip__step-copy"><strong>Level {level}</strong><small>{statusCopy[entry.status]}</small></span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
