import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Backpack, ChevronDown, CircleUserRound, ShieldCheck, ShoppingCart, Sparkles } from 'lucide-react';
import axios from '../config/axios';
import ConstellationTree from '../components/ConstellationTree';
import MainQuestStrip from '../components/MainQuestStrip';
import StarLensDock from '../components/StarLensDock';
import type { ConstellationMap, ConstellationSkill } from '../components/constellationTypes';
import { renderInlineMarkdown } from '../components/inlineMarkdown';
import './MainMenu.css';

interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  isAdmin: boolean;
  role: 'user' | 'admin' | 'super-admin';
  level: number;
  guildId?: string;
}

interface Guild {
  _id: string;
  name: string;
  guildLeaderIds?: string[];
  adminIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface Skill {
  _id: string;
  title: string;
  description: string;
  cost: number;
  nextQuestCost?: number;
  previewClip?: string[];
  contentYouTube?: string[];
  contentGoogleDrive?: string[];
  layer: number;
  position: number;
  constellationMapId?: string;
  treePosition?: {
    x: number;
    y: number;
  };
  constellationLabel?: string;
  mainQuestLevel?: number;
  mapNodeRole?: 'topic-gateway' | 'lesson' | 'boss' | 'capstone';
  topicLevel?: number;
  nodePreview?: {
    imageUrl?: string;
    summary?: string;
    outcomes: string[];
    actionLabel: string;
  };
  subQuests?: Array<{ externalId?: string; title: string; description: string; descriptionParts?: Array<{ type: string; content: string }>; type?: string }>;
  isActive: boolean;
  isAdvancedLocked?: boolean;
  nodeColor: 'yellow' | 'blue' | 'green' | 'white' | 'purple';
  nodeType?: 'adventure' | 'asset' | 'quest' | 'marker' | 'EXTRA';
  connections?: Array<{
    targetSkillId: string;
    connectionType: 'normal' | 'special';
    hasArrowhead: boolean;
    breakPoints?: Array<{ layer: number; position: number }>;
    curveMode?: 'auto' | 'bezier';
    controlPoints?: Array<{ x: number; y: number }>;
  }>;
  prerequisites?: string[];
  createdAt: string;
  updatedAt: string;
}

interface QuestTreePoint {
  x: number;
  y: number;
  radius: number;
}

interface QuestTreeEdge {
  source: Skill;
  target: Skill;
  connectionType: 'normal' | 'special';
  hasArrowhead: boolean;
}

const useAccessibleDialog = (isOpen: boolean, onClose?: () => void) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []);
    window.requestAnimationFrame(() => (focusable()[0] || dialog)?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault();
        closeRef.current();
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
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.requestAnimationFrame(() => openerRef.current?.focus());
    };
  }, [isOpen]);

  return dialogRef;
};

function MainMenu() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showGuildSelection, setShowGuildSelection] = useState(false);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');

  // User stats
  const [assetPoints, setAssetPoints] = useState(0);
  const [assetPointName, setAssetPointName] = useState('Asset Point'); // Custom name from guild
  const [voiceMinutesToday, setVoiceMinutesToday] = useState(0);

  // Skill Tree states
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mainConstellationMaps, setMainConstellationMaps] = useState<ConstellationMap[]>([]);
  const [constellationMaps, setConstellationMaps] = useState<ConstellationMap[]>([]);
  const [constellationRevision, setConstellationRevision] = useState(0);
  const [constellationLoadState, setConstellationLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const isCompactQuestTree = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  const defaultQuestTreeZoom = 2;
  const [zoom, setZoom] = useState(defaultQuestTreeZoom);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartY, setPanStartY] = useState(0);
  const [highlightedSkillId, setHighlightedSkillId] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [starLensSkill, setStarLensSkill] = useState<Skill | null>(null);
  const [starLensWorkflow, setStarLensWorkflow] = useState<'main' | 'skill' | 'topic'>('skill');
  const [starLensClosing, setStarLensClosing] = useState(false);
  const [starLensFocusOnOpen, setStarLensFocusOnOpen] = useState(false);
  const starLensCloseTimerRef = useRef<number | null>(null);
  const starLensOpenerRef = useRef<HTMLElement | SVGElement | null>(null);
  const topicPathActionRef = useRef<(() => void) | null>(null);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const skillModalRef = useRef<HTMLDivElement | null>(null);
  const skillModalOpenerRef = useRef<HTMLElement | null>(null);
  const [unlockedSkills, setUnlockedSkills] = useState<string[]>([]);
  const [completedQuestSteps, setCompletedQuestSteps] = useState<string[]>([]);
  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [pendingApprovalSkills, setPendingApprovalSkills] = useState<string[]>([]);
  const [mainQuestFeedback, setMainQuestFeedback] = useState('');
  const lastKnownLevelRef = useRef<number | null>(null);
  const [expandedQuestSteps, setExpandedQuestSteps] = useState<string[]>([]);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [showApprovalRequestModal, setShowApprovalRequestModal] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const imageDialogRef = useAccessibleDialog(Boolean(expandedImage), () => setExpandedImage(null));
  const approvalDialogRef = useAccessibleDialog(showApprovalRequestModal, () => {
    setShowApprovalRequestModal(false);
    setApprovalMessage('');
  });
  const guildDialogRef = useAccessibleDialog(showGuildSelection);

  const closeStarLens = (immediate = false, restoreFocus = true) => {
    if (starLensCloseTimerRef.current !== null) window.clearTimeout(starLensCloseTimerRef.current);
    if (!starLensSkill) return;
    const shouldRestoreFocus = restoreFocus && starLensFocusOnOpen;
    const finish = () => {
      setStarLensSkill(null);
      setStarLensClosing(false);
      topicPathActionRef.current = null;
      starLensCloseTimerRef.current = null;
      if (shouldRestoreFocus) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => starLensOpenerRef.current?.focus());
        });
      }
    };
    if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    setStarLensClosing(true);
    starLensCloseTimerRef.current = window.setTimeout(finish, 150);
  };

  useEffect(() => () => {
    if (starLensCloseTimerRef.current !== null) window.clearTimeout(starLensCloseTimerRef.current);
  }, []);

  useEffect(() => {
    if (!starLensSkill) return;
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest('.star-lens-dock, .star-lens-scrim, .quest-image-preview, .main-quest-strip button, .skill-constellation-panel .constellation-node, .theme-toggle')) return;
      closeStarLens();
    };
    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [starLensSkill, starLensClosing, starLensFocusOnOpen]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadMainMenu();
      loadConstellationMaps();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const previousLevel = lastKnownLevelRef.current;
    lastKnownLevelRef.current = user.level;
    if (previousLevel !== null && user.level > previousLevel) {
      setMainQuestFeedback(`Level ${user.level} unlocked · Your next Main Quest is ready.`);
    }
  }, [user?.level]);

  useEffect(() => {
    if (!mainQuestFeedback) return;
    const timeout = window.setTimeout(() => setMainQuestFeedback(''), 4200);
    return () => window.clearTimeout(timeout);
  }, [mainQuestFeedback]);

  useEffect(() => {
    if (user) {
      const handleFocus = () => {
        refreshMainMenuStatus();
        loadConstellationMaps({ silent: true });
      };

      window.addEventListener('focus', handleFocus);
      const interval = setInterval(() => {
        refreshMainMenuStatus();
      }, 45_000 + Math.floor(Math.random() * 15_000));

      return () => {
        window.removeEventListener('focus', handleFocus);
        clearInterval(interval);
      };
    }
  }, [user]);

  const applyMainMenuStatus = (data: any) => {
    const stats = data.userStats;
    if (stats) {
      setUser(current => current && current.level !== (stats.level || 1)
        ? { ...current, level: stats.level || 1 }
        : current);
      setAssetPoints(stats.assetPoints || 0);
      setAssetPointName(stats.assetPointName || 'Asset Point');
      setVoiceMinutesToday(stats.voiceMinutesToday || 0);
    }
    setUnlockedSkills(data.unlockedSkills || []);
    const questProgress = data.questProgress || {};
    setCompletedQuestSteps((questProgress.completedSteps || []).map(
      (step: { skillId: string; stepId: string }) => `${step.skillId}:${step.stepId}`
    ));
    setCompletedQuests(questProgress.completedQuests || []);
    setPendingApprovalSkills(questProgress.pendingApprovalSkillIds || []);
  };

  const loadMainMenu = async () => {
    try {
      const response = await axios.get('/api/mainmenu/bootstrap');
      if (!response.data.success) return;
      setSkills(response.data.skills || []);
      applyMainMenuStatus(response.data);
    } catch (error) {
      console.error('Error loading Main Menu:', error);
    }
  };

  const loadConstellationMaps = async (options: { silent?: boolean } = {}) => {
    try {
      if (!options.silent) setConstellationLoadState('loading');
      const [mainResponse, skillResponse] = await Promise.all([
        axios.get('/api/constellation-maps', {
          params: { constellationType: 'main', scope: 'discipline', limit: 100 }
        }),
        axios.get('/api/constellation-maps', {
          params: { constellationType: 'skill', scope: 'discipline', limit: 100 }
        })
      ]);
      setMainConstellationMaps(mainResponse.data.maps || []);
      setConstellationMaps(skillResponse.data.maps || []);
      setConstellationRevision(current => current + 1);
      setConstellationLoadState('ready');
    } catch (error) {
      console.error('Error loading constellation maps:', error);
      setConstellationLoadState('error');
    }
  };

  const refreshMainMenuStatus = async () => {
    try {
      const response = await axios.get('/api/mainmenu/status');
      if (response.data.success) applyMainMenuStatus(response.data);
    } catch (error) {
      console.error('Error refreshing Main Menu:', error);
    }
  };

  const handleSkillClick = (skill: Skill) => {
    if (skill.isAdvancedLocked) {
      alert('อันนี้เป็นเนื้อหา Advance สอนแค่ใน Starway/Starlight น้าาา');
      return;
    }
    closeStarLens(true, false);
    setStarLensWorkflow('skill');
    skillModalOpenerRef.current = document.activeElement as HTMLElement | null;
    setSelectedSkill(skill);
    setShowSkillModal(true);
  };

  const handleMainTopicClick = (skill: Skill, interaction: 'pointer' | 'keyboard' = 'pointer', trigger?: HTMLElement | SVGElement) => {
    if (starLensCloseTimerRef.current !== null) window.clearTimeout(starLensCloseTimerRef.current);
    starLensCloseTimerRef.current = null;
    setStarLensClosing(false);
    topicPathActionRef.current = null;
    setStarLensWorkflow('main');
    if (starLensWorkflow === 'main' && starLensSkill?._id === skill._id) return;
    starLensOpenerRef.current = trigger || document.activeElement as HTMLElement | SVGElement | null;
    const shouldFocus = interaction === 'keyboard' || window.matchMedia('(max-width: 720px)').matches;
    setStarLensFocusOnOpen(shouldFocus);
    setStarLensSkill(skill);
  };

  const handleTopicSkillClick = (skill: Skill, interaction: 'pointer' | 'keyboard' = 'pointer', trigger?: HTMLElement | SVGElement) => {
    if (skill.isAdvancedLocked) {
      alert('อันนี้เป็นเนื้อหา Advance สอนแค่ใน Starway/Starlight น้าาา');
      return;
    }
    if (starLensCloseTimerRef.current !== null) window.clearTimeout(starLensCloseTimerRef.current);
    starLensCloseTimerRef.current = null;
    setStarLensClosing(false);
    topicPathActionRef.current = null;
    setStarLensWorkflow('skill');
    starLensOpenerRef.current = trigger || document.activeElement as HTMLElement | SVGElement | null;
    setStarLensFocusOnOpen(interaction === 'keyboard' || window.matchMedia('(max-width: 720px)').matches);
    setStarLensSkill(skill);
  };

  const handleTopicPathInfo = (
    skill: Skill,
    openPath: () => void,
    interaction: 'pointer' | 'keyboard' = 'pointer',
    trigger?: HTMLElement | SVGElement
  ) => {
    if (starLensCloseTimerRef.current !== null) window.clearTimeout(starLensCloseTimerRef.current);
    starLensCloseTimerRef.current = null;
    setStarLensClosing(false);
    topicPathActionRef.current = openPath;
    setStarLensWorkflow('topic');
    starLensOpenerRef.current = trigger || document.activeElement as HTMLElement | SVGElement | null;
    setStarLensFocusOnOpen(interaction === 'keyboard' || window.matchMedia('(max-width: 720px)').matches);
    setStarLensSkill(skill);
  };

  const closeSkillModal = () => {
    skillModalOpenerRef.current?.focus();
    setShowSkillModal(false);
    setSelectedSkill(null);
    window.requestAnimationFrame(() => skillModalOpenerRef.current?.focus());
  };

  useEffect(() => {
    if (!showSkillModal) return;
    const modal = skillModalRef.current;
    const focusable = () => Array.from(modal?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []);
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSkillModal();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
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
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSkillModal]);

  const handleCompleteQuestStep = async (skill: Skill, stepId: string) => {
    try {
      const response = await axios.post(`/api/skills/${skill._id}/steps/${encodeURIComponent(stepId)}/complete`);
      if (!response.data.success) return;
      setCompletedQuestSteps(current => [
        ...current.filter(key => !key.startsWith(`${skill._id}:`)),
        ...(response.data.completedSteps || []).map((id: string) => `${skill._id}:${id}`)
      ]);
      setAssetPoints(response.data.assetPoints);
      if (response.data.allStepsCompleted) {
        alert('Step completed! +5 AP. All steps are complete - request approval to continue.');
      } else {
        alert('Step completed! +5 AP');
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to complete quest step');
    }
  };

  const isQuestSkill = (skill: Skill): boolean =>
    skill.nodeType === 'quest' || skill.nodeColor === 'green';

  const isMainConstellationSkill = (skill: Skill): boolean =>
    Boolean(skill.constellationMapId && mainConstellationMaps.some(map => map._id === skill.constellationMapId));

  const hasCompletedAllQuestSteps = (skill: Skill): boolean => {
    const steps = skill.subQuests || [];
    return steps.length > 0 && steps.every((step, index) =>
      completedQuestSteps.includes(`${skill._id}:${step.externalId || `step-${index}`}`)
    );
  };

  const canUnlockSkill = (skill: Skill): boolean => {
    if (isMainConstellationSkill(skill)) {
      return Boolean(skill.mainQuestLevel && skill.mainQuestLevel === (user?.level || 1) && !pendingApprovalSkills.includes(skill._id));
    }
    // Check if already unlocked
    if (unlockedSkills.includes(skill._id)) {
      return false;
    }

    // Check prerequisites from prerequisites array
    if (skill.prerequisites && skill.prerequisites.length > 0) {
      const allPrerequisitesMet = skill.prerequisites.every(
        (prereqId: string) => unlockedSkills.includes(prereqId)
      );
      if (!allPrerequisitesMet) {
        return false;
      }
    }

    // Check prerequisites from connections (if any skill has a connection pointing to this skill, it's a prerequisite)
    const prerequisiteSkillsFromConnections = skills.filter(
      (s) => s.connections && s.connections.some((conn) => conn.targetSkillId === skill._id)
    );
    
    if (prerequisiteSkillsFromConnections.length > 0) {
      const allConnectionPrerequisitesMet = prerequisiteSkillsFromConnections.every(
        (prereqSkill) => unlockedSkills.includes(prereqSkill._id)
      );
      if (!allConnectionPrerequisitesMet) {
        return false;
      }
    }

    // Check asset points (skip for Adventure and Marker nodes)
    const isAdventure = skill.nodeType === 'adventure' || skill.nodeColor === 'white';
    const isMarker = skill.nodeType === 'marker' || skill.nodeColor === 'yellow';
    if (!isMainConstellationSkill(skill) && !isAdventure && !isMarker && assetPoints < skill.cost) {
      return false;
    }

    return true;
  };

  const handleUnlockSkill = async (targetSkill: Skill | null = selectedSkill) => {
    if (!targetSkill) return;

    const isQuest = starLensWorkflow === 'main' || isQuestSkill(targetSkill);
    
    if (isQuest) {
      if (starLensWorkflow !== 'main' && !hasCompletedAllQuestSteps(targetSkill)) {
        alert('Complete every quest step before requesting approval.');
        return;
      }
      setSelectedSkill(targetSkill);
      closeStarLens(true, false);
      setShowApprovalRequestModal(true);
      return;
    }

    try {
      const response = await axios.post(`/api/skills/${targetSkill._id}/unlock`);
      if (response.data.success) {
        await refreshMainMenuStatus();
        // Close modal
        closeSkillModal();
        setSelectedSkill(null);
        // Don't show notification for Adventure and Marker nodes
        setStarLensSkill(current => current?._id === targetSkill._id ? { ...current, isActive: true } : current);
        const isAdventure = targetSkill.nodeType === 'adventure' || targetSkill.nodeColor === 'white';
        const isMarker = targetSkill.nodeType === 'marker' || targetSkill.nodeColor === 'yellow';
        if (!isAdventure && !isMarker) {
          alert('Quest unlocked successfully!');
        }
      }
    } catch (error: any) {
      console.error('Error unlocking skill:', error);
      alert(error.response?.data?.error || 'Failed to unlock quest');
    }
  };

  const handleSendApprovalRequest = async () => {
    if (!selectedSkill) return;

    try {
      const response = await axios.post(`/api/skills/${selectedSkill._id}/approval-request`, {
        message: approvalMessage.trim() || ''
      });
      if (response.data.success) {
        if (starLensWorkflow === 'main') setMainQuestFeedback('Main Quest submitted · Pending admin review.');
        else alert('Approval request sent successfully!');
        setPendingApprovalSkills(current => current.includes(selectedSkill._id) ? current : [...current, selectedSkill._id]);
        setShowApprovalRequestModal(false);
        setApprovalMessage('');
        closeSkillModal();
        setSelectedSkill(null);
      }
    } catch (error: any) {
      console.error('Error sending approval request:', error);
      alert(error.response?.data?.error || 'Failed to send approval request');
    }
  };

  // Parse description and render Discord Rich Text / Markdown format
  const renderDescriptionWithImages = (description: string) => {
    if (!description) return null;

    // Split by lines to handle headers and lists
    const lines = description.split('\n');
    const elements: JSX.Element[] = [];
    let key = 0;
    let listItems: JSX.Element[] = [];
    let listKey = 0;
    let codeLines: string[] = [];
    let codeLanguage = '';
    let inCodeBlock = false;

    const flushList = () => {
      if (listItems.length === 0) return;
      elements.push(
        <ul key={key++} style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
          {listItems}
        </ul>
      );
      listItems = [];
    };

    const flushCodeBlock = () => {
      elements.push(
        <div className="quest-code-block" key={`code-${key++}`}>
          {codeLanguage && <div className="quest-code-language">{codeLanguage}</div>}
          <pre><code>{codeLines.join('\n')}</code></pre>
        </div>
      );
      codeLines = [];
      codeLanguage = '';
    };

    lines.forEach((line) => {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('```')) {
        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          flushList();
          codeLanguage = trimmedLine.slice(3).trim();
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return;
      }
      
      // Skip empty lines
      if (!trimmedLine) {
        flushList();
        return;
      }

      // Headers
      if (trimmedLine.startsWith('### ')) {
        if (listItems.length > 0) {
          elements.push(
            <ul key={key++} style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
              {listItems}
            </ul>
          );
          listItems = [];
        }
        const text = trimmedLine.substring(4);
        elements.push(
          <h3 key={key++} style={{ fontSize: '1.6rem', fontWeight: '700', color: '#14306d', marginTop: '16px', marginBottom: '8px' }}>
            {renderInlineMarkdown(text, key)}
          </h3>
        );
        return;
      }
      
      if (trimmedLine.startsWith('## ')) {
        if (listItems.length > 0) {
          elements.push(
            <ul key={key++} style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
              {listItems}
            </ul>
          );
          listItems = [];
        }
        const text = trimmedLine.substring(3);
        elements.push(
          <h2 key={key++} style={{ fontSize: '1.8rem', fontWeight: '700', color: '#14306d', marginTop: '20px', marginBottom: '12px' }}>
            {renderInlineMarkdown(text, key)}
          </h2>
        );
        return;
      }
      
      if (trimmedLine.startsWith('# ')) {
        if (listItems.length > 0) {
          elements.push(
            <ul key={key++} style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
              {listItems}
            </ul>
          );
          listItems = [];
        }
        const text = trimmedLine.substring(2);
        elements.push(
          <h1 key={key++} style={{ fontSize: '2rem', fontWeight: '700', color: '#14306d', marginTop: '24px', marginBottom: '16px' }}>
            {renderInlineMarkdown(text, key)}
          </h1>
        );
        return;
      }

      // Bullet points
      if (trimmedLine.startsWith('- ')) {
        const text = trimmedLine.substring(2);
        listItems.push(
          <li key={listKey++} style={{ marginBottom: '4px', fontSize: '1.4rem', lineHeight: '1.6' }}>
            {renderInlineMarkdown(text, key * 1000 + listKey)}
          </li>
        );
        return;
      }

      // Regular paragraph - close list if open
      flushList();

      // Check for images in the line
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)|(https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]*)?)/gi;
      let imageMatch;
      let lastIndex = 0;
      const lineParts: (string | JSX.Element)[] = [];
      let hasImages = false;

      while ((imageMatch = imageRegex.exec(trimmedLine)) !== null) {
        hasImages = true;
        // Add text before the image
        if (imageMatch.index > lastIndex) {
          const textBefore = trimmedLine.substring(lastIndex, imageMatch.index);
          const parsed = renderInlineMarkdown(textBefore, key * 1000 + lineParts.length);
          lineParts.push(...parsed);
        }
        // Add the image
        const altText = imageMatch[1] || 'Quest image';
        const imageUrl = imageMatch[2] || imageMatch[3];
        lineParts.push(
          <img
            key={`img-${key}-${lineParts.length}`}
            src={imageUrl}
            alt={altText || 'Quest image'}
            style={{
              maxWidth: '100%',
              height: 'auto',
              margin: '10px 0',
              borderRadius: '8px',
              display: 'block',
              cursor: 'zoom-in'
            }}
            onClick={() => setExpandedImage({ src: imageUrl, alt: altText || 'Quest image' })}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        );
        lastIndex = imageMatch.index + imageMatch[0].length;
      }

      // Add remaining text
      if (lastIndex < trimmedLine.length) {
        const remainingText = trimmedLine.substring(lastIndex);
        const parsed = renderInlineMarkdown(remainingText, key * 1000 + lineParts.length);
        lineParts.push(...parsed);
      } else if (!hasImages) {
        // No images found, parse entire line
        const parsed = renderInlineMarkdown(trimmedLine, key * 1000);
        lineParts.push(...parsed);
      }

      if (lineParts.length > 0) {
        elements.push(
          <p key={`p-${key++}`} style={{ marginBottom: '8px', fontSize: '1.4rem', lineHeight: '1.6' }}>
            {lineParts}
          </p>
        );
      }
    });

    flushList();
    if (inCodeBlock) flushCodeBlock();

    return <div style={{ whiteSpace: 'pre-wrap' }}>{elements}</div>;
  };

  const getImageUrls = (description: string) => {
    const imageRegex = /!\[[^\]]*\]\(([^)]+)\)|(https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]*)?)/gi;
    const imageUrls: string[] = [];
    let match;

    while ((match = imageRegex.exec(description)) !== null) {
      imageUrls.push(match[1] || match[2]);
    }

    return [...new Set(imageUrls)];
  };

  // Convert YouTube URL to embed URL
  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';
    const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([\w-]{11})/);
    return videoIdMatch ? `https://www.youtube.com/embed/${videoIdMatch[1]}` : url;
  };

  const getQuestTreeEdges = (): QuestTreeEdge[] => {
    const skillById = new Map(skills.map((skill) => [skill._id, skill]));
    const edges: QuestTreeEdge[] = [];
    const seenEdges = new Set<string>();

    skills.forEach((source) => {
      source.connections?.forEach((connection) => {
        const target = skillById.get(connection.targetSkillId);
        if (!target) return;

        const edgeKey = `${source._id}-${target._id}`;
        seenEdges.add(edgeKey);
        edges.push({
          source,
          target,
          connectionType: connection.connectionType,
          hasArrowhead: connection.hasArrowhead !== false
        });
      });
    });

    skills.forEach((target) => {
      target.prerequisites?.forEach((prerequisiteId) => {
        const source = skillById.get(prerequisiteId);
        const edgeKey = `${prerequisiteId}-${target._id}`;
        if (!source || seenEdges.has(edgeKey)) return;

        seenEdges.add(edgeKey);
        edges.push({
          source,
          target,
          connectionType: 'normal',
          hasArrowhead: true
        });
      });
    });

    return edges;
  };

  const getQuestTreeLayout = (edges: QuestTreeEdge[]): Map<string, QuestTreePoint> => {
    const layout = new Map<string, QuestTreePoint>();
    const startY = 620;
    const layerStep = 180;
    const maximumBranchWidth = 360;
    const minimumNodeGap = 175;

    for (let layer = 0; layer <= 7; layer++) {
      const layerSkills = skills
        .filter((skill) => skill.layer === layer)
        .sort((a, b) => a.position - b.position);

      if (layerSkills.length === 0) continue;

      const desiredPositions = layerSkills.map((skill, index) => {
        if (layer <= 2) {
          const trunkSpread = layerSkills.length > 1
            ? Math.min(150, (layerSkills.length - 1) * 72)
            : 0;
          const x = layerSkills.length === 1
            ? 0
            : -trunkSpread + (index * trunkSpread * 2) / (layerSkills.length - 1);
          return { skill, x };
        }

        const predecessors = edges
          .filter((edge) => edge.target._id === skill._id && edge.source.layer < skill.layer)
          .map((edge) => edge.source)
          .sort((a, b) => b.layer - a.layer);
        const primaryParent = predecessors[0];
        const parentPoint = primaryParent ? layout.get(primaryParent._id) : undefined;

        if (parentPoint && primaryParent) {
          const siblings = layerSkills.filter((candidate) =>
            edges.some((edge) =>
              edge.source._id === primaryParent._id &&
              edge.target._id === candidate._id
            )
          );
          const siblingIndex = siblings.findIndex((candidate) => candidate._id === skill._id);
          const siblingSpread = Math.min(210, Math.max(0, (siblings.length - 1) * 90));
          const offset = siblings.length > 1
            ? -siblingSpread + (siblingIndex * siblingSpread * 2) / (siblings.length - 1)
            : 0;
          return { skill, x: parentPoint.x + offset };
        }

        const fallbackSpread = Math.min(
          maximumBranchWidth,
          180 + (layer - 3) * 45
        );
        const x = layerSkills.length === 1
          ? 0
          : -fallbackSpread + (index * fallbackSpread * 2) / (layerSkills.length - 1);
        return { skill, x };
      });

      desiredPositions.sort((a, b) => a.x - b.x);
      for (let index = 1; index < desiredPositions.length; index++) {
        if (desiredPositions[index].x - desiredPositions[index - 1].x < minimumNodeGap) {
          desiredPositions[index].x = desiredPositions[index - 1].x + minimumNodeGap;
        }
      }

      if (desiredPositions.length > 0) {
        const leftOverflow = Math.min(0, desiredPositions[0].x + maximumBranchWidth);
        const rightOverflow = Math.max(0, desiredPositions[desiredPositions.length - 1].x - maximumBranchWidth);
        const correction = rightOverflow > 0 ? -rightOverflow : -leftOverflow;
        desiredPositions.forEach(({ skill, x }) => {
          const isExtraNode = skill.nodeType === 'EXTRA' || skill.nodeColor === 'purple';
          layout.set(skill._id, {
            x: x + correction,
            y: startY - layer * layerStep,
            radius: isExtraNode ? 88 : 72
          });
        });
      }
    }

    skills.forEach((skill) => {
      const savedPosition = skill.treePosition;
      if (!savedPosition || !Number.isFinite(savedPosition.x) || !Number.isFinite(savedPosition.y)) return;

      const isExtraNode = skill.nodeType === 'EXTRA' || skill.nodeColor === 'purple';
      layout.set(skill._id, {
        x: savedPosition.x,
        y: savedPosition.y,
        radius: isExtraNode ? 88 : 72
      });
    });

    return layout;
  };

  const getQuestConnectionPath = (
    source: QuestTreePoint,
    target: QuestTreePoint,
    controlPoints?: Array<{ x: number; y: number }>
  ): string => {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const unitX = dx / distance;
    const unitY = dy / distance;
    const startX = source.x + unitX * source.radius;
    const startY = source.y + unitY * source.radius;
    const endX = target.x - unitX * (target.radius + 12);
    const endY = target.y - unitY * (target.radius + 12);
    const isAxisAligned = Math.abs(dx) <= 8 || Math.abs(dy) <= 8;
    const isMostlyHorizontal = Math.abs(dx) >= Math.abs(dy);
    const controls = controlPoints && controlPoints.length === 2 ? controlPoints : isAxisAligned
      ? [
          { x: startX + (endX - startX) / 3, y: startY + (endY - startY) / 3 },
          { x: startX + (endX - startX) * 2 / 3, y: startY + (endY - startY) * 2 / 3 }
        ]
      : [
          ...(isMostlyHorizontal
            ? [
                { x: (startX + endX) / 2, y: startY },
                { x: (startX + endX) / 2, y: endY }
              ]
            : [
                { x: startX, y: (startY + endY) / 2 },
                { x: endX, y: (startY + endY) / 2 }
              ])
        ];

    return `M ${startX} ${startY} C ${controls[0].x} ${controls[0].y}, ${controls[1].x} ${controls[1].y}, ${endX} ${endY}`;
  };

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/auth/user');
      if (response.data.authenticated && response.data.user) {
        setUser(response.data.user);
        // Check if user has a guild
        if (!response.data.user.guildId) {
          // Load guilds and show selection modal
          await loadGuilds();
          setShowGuildSelection(true);
        }
      } else {
        navigate('/login');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const loadGuilds = async () => {
    try {
      const response = await axios.get('/api/guilds');
      if (response.data.success) {
        setGuilds(response.data.guilds);
      }
    } catch (error) {
      console.error('Error loading guilds:', error);
    }
  };

  const handleJoinGuild = async () => {
    if (!selectedGuildId || !user) {
      alert('Please select a guild');
      return;
    }

    try {
      const response = await axios.post(`/api/users/${user.id}/guild`, {
        guildId: selectedGuildId
      });
      
      if (response.data.success) {
        // Update user state with new guildId
        setUser({ ...user, guildId: selectedGuildId });
        setShowGuildSelection(false);
        alert('Successfully joined the guild!');
      }
    } catch (error: any) {
      console.error('Error joining guild:', error);
      alert(error.response?.data?.error || 'Failed to join guild');
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const scrollToMainSection = (sectionId: string) => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(sectionId)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  // Skill Tree helper functions
  const getNodeColor = (color: string): string => {
    const colors: { [key: string]: string } = {
      yellow: '#FFF6B6',
      blue: '#C6DCFF',
      green: '#ADF0C7',
      white: '#FFFFFF',
      purple: '#DEDAFF'
    };
    return colors[color] || colors.blue;
  };

  const getNodeStrokeColor = (color: string): string => {
    const colors: { [key: string]: string } = {
      yellow: '#ca8a04',
      blue: '#1d4ed8',
      green: '#16a34a',
      white: '#d1d5db',
      purple: '#7c3aed'
    };
    return colors[color] || colors.blue;
  };

  // Wrap text to fit within circle
  const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
    // Approximate character width (fontSize * 0.6 is a rough estimate for most fonts)
    const charWidth = fontSize * 0.6;
    const maxCharsPerLine = Math.floor(maxWidth / charWidth);
    
    if (text.length <= maxCharsPerLine) {
      return [text];
    }
    
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        // If word itself is longer than maxCharsPerLine, split it
        if (word.length > maxCharsPerLine) {
          let remainingWord = word;
          while (remainingWord.length > maxCharsPerLine) {
            lines.push(remainingWord.substring(0, maxCharsPerLine));
            remainingWord = remainingWord.substring(maxCharsPerLine);
          }
          currentLine = remainingWord;
        } else {
          currentLine = word;
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  };

  // Zoom handlers
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.3, Math.min(3, prev * delta)));
  };

  const zoomIn = () => setZoom(prev => Math.min(prev * 1.2, 3));
  const zoomOut = () => setZoom(prev => Math.max(prev * 0.8, 0.3));
  const resetView = () => {
    setZoom(defaultQuestTreeZoom);
    setPanX(0);
    setPanY(0);
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if ((e.button === 0 || e.button === 1) && !target.closest('.quest-node')) {
      e.preventDefault();
      setIsPanning(true);
      setPanStartX(e.clientX);
      setPanStartY(e.clientY);
    }
  };

  const getQuestTreePoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const screenMatrix = svg.getScreenCTM();
    if (!screenMatrix) return null;

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(screenMatrix.inverse());
  };

  const panQuestTree = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const start = getQuestTreePoint(svg, panStartX, panStartY);
    const current = getQuestTreePoint(svg, clientX, clientY);
    if (!start || !current) return;

    // Store pan in tree coordinates, then scale it once when rendering.
    setPanX(previous => previous + (current.x - start.x) / zoom);
    setPanY(previous => previous + (current.y - start.y) / zoom);
    setPanStartX(clientX);
    setPanStartY(clientY);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      e.preventDefault();
      panQuestTree(e.currentTarget, e.clientX, e.clientY);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const questTreeEdges = getQuestTreeEdges();
  const questTreeLayout = getQuestTreeLayout(questTreeEdges);
  const questTreeBounds = Array.from(questTreeLayout.values()).reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x - point.radius),
      right: Math.max(bounds.right, point.x + point.radius),
      top: Math.min(bounds.top, point.y - point.radius),
      bottom: Math.max(bounds.bottom, point.y + point.radius)
    }),
    { left: 0, right: 0, top: 0, bottom: 0 }
  );
  const questTreePadding = 140;
  const questTreeLeft = skills.length === 0 ? -380 : questTreeBounds.left - questTreePadding;
  const questTreeTop = skills.length === 0 ? -220 : questTreeBounds.top - questTreePadding;
  const questTreeWidth = skills.length === 0
    ? 760
    : Math.max(700, questTreeBounds.right - questTreeBounds.left + questTreePadding * 2);
  const questTreeHeight = skills.length === 0
    ? 940
    : Math.max(700, questTreeBounds.bottom - questTreeBounds.top + questTreePadding * 2);
  const questTreeViewBox = `${questTreeLeft} ${questTreeTop} ${questTreeWidth} ${questTreeHeight}`;

  if (loading) {
    return (
      <div className="main-container">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="main-container">
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-brand">
          <span className="topbar-sigil" aria-hidden="true" />
          <div>
            <h1 className="topbar-title">GuGame</h1>
            <span className="topbar-kicker">Starbound Learning Guild</span>
          </div>
        </div>
        <div className="topbar-hud" aria-label="Player status">
          <span><strong>Lv. {user?.level || 1}</strong></span>
          <span><strong>{assetPoints}</strong> {assetPointName}</span>
          <span><strong>{voiceMinutesToday}m</strong> today</span>
          <details className="player-account-menu">
            <summary>
              <CircleUserRound className="player-account-menu__icon" aria-hidden="true" />
              <span>{user?.username || 'Player'}</span>
              <ChevronDown className="player-account-menu__chevron" aria-hidden="true" />
            </summary>
            <div className="player-account-menu__menu">
              {(user?.isAdmin || user?.role === 'admin' || user?.role === 'super-admin') && (
                <button type="button" onClick={() => navigate('/admin')}>
                  <ShieldCheck aria-hidden="true" />
                  Admin Panel
                </button>
              )}
              <button type="button" onClick={handleLogout}>Logout</button>
            </div>
          </details>
        </div>
      </div>

      <section className="main-panel main-constellation-panel" id="main-constellation" aria-label="Main Quest level-up path">
        {mainQuestFeedback && <div className="main-quest-feedback" role="status" aria-live="polite">{mainQuestFeedback}</div>}
        <div className="panel-content">
          {constellationLoadState === 'loading' ? (
            <div className="constellation-load-state" role="status">Loading Main Quest path...</div>
          ) : constellationLoadState === 'error' ? (
            <div className="constellation-load-state is-error" role="alert">
              <strong>Main Quest path is temporarily unavailable.</strong>
              <span>Your progress is safe.</span>
              <button type="button" onClick={() => { void loadConstellationMaps(); }}>Retry</button>
            </div>
          ) : mainConstellationMaps.length > 0 ? (
            <MainQuestStrip
              map={mainConstellationMaps[0]}
              refreshRevision={constellationRevision}
              pendingSkillIds={pendingApprovalSkills}
              userLevel={user?.level || 1}
              onOpenSkill={(skill: ConstellationSkill, interaction, trigger) => handleMainTopicClick(skill as Skill, interaction, trigger)}
              selectedSkillId={starLensWorkflow === 'main' ? starLensSkill?._id : null}
            />
          ) : (
            <div className="constellation-load-state" role="status">
              <strong>No Main Quest path published yet.</strong>
              <span>Your level-up quests will appear here when they are ready.</span>
            </div>
          )}
        </div>
      </section>

      {/* Main Content Panel */}
      <div className="main-panel skill-constellation-panel" id="constellations">
        <div className="panel-header">
          <h2 className="panel-title">Constellation Deck</h2>
        </div>

        {/* Content */}
        <div className="panel-content">
          {constellationLoadState === 'loading' ? (
            <div className="constellation-load-state" role="status">Loading constellations...</div>
          ) : constellationLoadState === 'error' ? (
            <div className="constellation-load-state is-error" role="alert">
              <strong>Constellations are temporarily unavailable.</strong>
              <span>Your current page and progress are safe.</span>
              <button type="button" onClick={() => { void loadConstellationMaps(); }}>Retry</button>
            </div>
          ) : constellationMaps.length > 0 ? (
            <ConstellationTree
              disciplineMaps={constellationMaps}
              heading="Skill Constellations"
              idPrefix="skill-constellation"
              refreshRevision={constellationRevision}
              unlockedSkillIds={unlockedSkills}
              pendingSkillIds={pendingApprovalSkills}
              userLevel={user?.level || 1}
              canUnlockSkill={(skill: ConstellationSkill) => canUnlockSkill(skill as Skill)}
              onOpenSkill={(skill, interaction, trigger) => handleTopicSkillClick(skill as Skill, interaction, trigger)}
              onOpenTopicInfo={(skill, openPath, interaction, trigger) => handleTopicPathInfo(skill as Skill, openPath, interaction, trigger)}
              selectedSkillId={['topic', 'skill'].includes(starLensWorkflow) ? starLensSkill?._id : null}
            />
          ) : (
            <div className="constellation-load-state" role="status">
              <strong>No constellations published yet.</strong>
              <span>Learning paths will appear here when they are ready.</span>
            </div>
          )}
          {false && (
          <div className="skill-tree-view">
            <div className="skill-tree-container quest-tree-container">
              {skills.length > 0 && (
                <div className="quest-tree-legend" aria-label="Quest status">
                  <span><i className="quest-status-dot unlocked" />Unlocked</span>
                  <span><i className="quest-status-dot available" />Available</span>
                  <span><i className="quest-status-dot locked" />Locked</span>
                </div>
              )}

              <div className="zoom-controls" aria-label="Quest tree view controls">
                <button className="zoom-btn" onClick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
                <button className="zoom-btn" onClick={resetView} title="Reset view" aria-label="Reset view">⌂</button>
                <button className="zoom-btn" onClick={zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
              </div>

              {skills.length === 0 && (
                <div className="quest-tree-empty-banner">
                  <strong>No quests published yet</strong>
                  <span>The first quest will begin at the bottom of this path.</span>
                </div>
              )}

              <svg
                className="skill-tree-svg quest-tree-svg"
                viewBox={questTreeViewBox}
                preserveAspectRatio={isCompactQuestTree ? 'xMidYMid slice' : 'xMidYMid meet'}
                style={{ cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={(e) => {
                  if (e.touches.length !== 1) return;
                  const touch = e.touches[0];
                  setIsPanning(true);
                  setPanStartX(touch.clientX);
                  setPanStartY(touch.clientY);
                }}
                onTouchMove={(e) => {
                  if (e.touches.length !== 1 || !isPanning) return;
                  e.preventDefault();
                  const touch = e.touches[0];
                  panQuestTree(e.currentTarget, touch.clientX, touch.clientY);
                }}
                onTouchEnd={handleMouseUp}
              >
                <defs>
                  <pattern id="quest-tree-grid" width="42" height="42" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="2" fill="#dbe7f8" />
                  </pattern>
                  <filter id="quest-node-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#3b67b5" floodOpacity="0.2" />
                  </filter>
                  <marker id="quest-arrow-normal" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 0 1 L 12 7 L 0 13 Z" fill="#9aabc4" />
                  </marker>
                  <marker id="quest-arrow-complete" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 0 1 L 12 7 L 0 13 Z" fill="#4e98ff" />
                  </marker>
                  <marker id="quest-arrow-special" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 0 1 L 12 7 L 0 13 Z" fill="#7c3aed" />
                  </marker>
                </defs>

                <rect x={questTreeLeft} y={questTreeTop} width={questTreeWidth} height={questTreeHeight} rx="24" fill="#f8fbff" />
                <rect x={questTreeLeft} y={questTreeTop} width={questTreeWidth} height={questTreeHeight} rx="24" fill="url(#quest-tree-grid)" opacity="0.65" />

                <g transform={`translate(${panX * zoom}, ${panY * zoom}) scale(${zoom})`}>
                  {skills.length === 0 ? (
                    <g className="quest-tree-placeholder" aria-hidden="true">
                      {[
                        { source: { x: 0, y: 570 }, target: { x: 0, y: 380 } },
                        { source: { x: 0, y: 380 }, target: { x: 0, y: 190 } },
                        { source: { x: 0, y: 190 }, target: { x: -285, y: -40 } },
                        { source: { x: 0, y: 190 }, target: { x: 0, y: -105 } },
                        { source: { x: 0, y: 190 }, target: { x: 285, y: -40 } }
                      ].map((edge, index) => {
                        const controlY = (edge.source.y + edge.target.y) / 2;
                        return (
                          <path
                            key={index}
                            d={`M ${edge.source.x} ${edge.source.y} C ${edge.source.x} ${controlY}, ${edge.target.x} ${controlY}, ${edge.target.x} ${edge.target.y}`}
                          />
                        );
                      })}
                      {[
                        { x: 0, y: 570, label: 'START' },
                        { x: 0, y: 380, label: '' },
                        { x: 0, y: 190, label: '' },
                        { x: -285, y: -40, label: '' },
                        { x: 0, y: -105, label: '' },
                        { x: 285, y: -40, label: '' }
                      ].map((node, index) => (
                        <g key={index} transform={`translate(${node.x} ${node.y})`}>
                          <circle r="52" />
                          <circle r="12" className="quest-placeholder-core" />
                          {node.label && <text y="92" textAnchor="middle">{node.label}</text>}
                        </g>
                      ))}
                    </g>
                  ) : (
                    <>
                      {questTreeEdges.map((edge) => {
                        const source = questTreeLayout.get(edge.source._id);
                        const target = questTreeLayout.get(edge.target._id);
                        if (!source || !target) return null;

                        const connectionComplete = unlockedSkills.includes(edge.source._id) &&
                          unlockedSkills.includes(edge.target._id);
                        const stroke = connectionComplete
                          ? '#4e98ff'
                          : edge.connectionType === 'special' ? '#7c3aed' : '#9aabc4';
                        const marker = connectionComplete
                          ? 'url(#quest-arrow-complete)'
                          : edge.connectionType === 'special'
                            ? 'url(#quest-arrow-special)'
                            : 'url(#quest-arrow-normal)';
                        const connection = edge.source.connections?.find(candidate => candidate.targetSkillId === edge.target._id);

                        return (
                          <path
                            key={`${edge.source._id}-${edge.target._id}`}
                            className={`quest-tree-connection ${connectionComplete ? 'complete' : ''}`}
                            d={getQuestConnectionPath(source, target, connection?.curveMode === 'bezier' ? connection.controlPoints : undefined)}
                            stroke={stroke}
                            markerEnd={edge.hasArrowhead ? marker : undefined}
                            vectorEffect="non-scaling-stroke"
                          />
                        );
                      })}

                      {skills.map((skill) => {
                        const point = questTreeLayout.get(skill._id);
                        if (!point) return null;

                        const isUnlocked = unlockedSkills.includes(skill._id);
                        const isAvailable = canUnlockSkill(skill);
                        const statusClass = isUnlocked
                          ? 'unlocked'
                          : isAvailable ? 'available' : 'locked';
                        const textLines = wrapText(skill.title, point.radius * 2.2, 26).slice(0, 3);
                        const firstLineY = textLines.length === 1
                          ? 8
                          : -((textLines.length - 1) * 28) / 2 + 7;

                        return (
                          <g
                            key={skill._id}
                            className={`quest-node quest-node-${statusClass}`}
                            transform={`translate(${point.x} ${point.y})`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${skill.title}, ${statusClass}`}
                            onClick={() => handleSkillClick(skill)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleSkillClick(skill);
                              }
                            }}
                          >
                            <circle
                              className={`quest-node-halo ${highlightedSkillId === skill._id ? 'skill-node-highlight' : ''}`}
                              r={point.radius + 8}
                            />
                            <circle
                              className="quest-node-shell"
                              r={point.radius}
                              fill={getNodeColor(skill.nodeColor)}
                              stroke={getNodeStrokeColor(skill.nodeColor)}
                              filter="url(#quest-node-shadow)"
                            />
                            <text className="quest-node-title" textAnchor="middle">
                              {textLines.map((line, index) => (
                                <tspan
                                  key={index}
                                  x="0"
                                  y={index === 0 ? firstLineY : undefined}
                                  dy={index === 0 ? undefined : 28}
                                >
                                  {line}
                                </tspan>
                              ))}
                            </text>
                            {isUnlocked && (
                              <g className="quest-node-check" transform={`translate(${point.radius * 0.7} ${-point.radius * 0.7})`}>
                                <circle r="15" />
                                <text y="6" textAnchor="middle">✓</text>
                              </g>
                            )}
                            {skill.isAdvancedLocked && (
                              <g className="quest-node-advanced-lock" transform={`translate(${-point.radius * 0.7} ${-point.radius * 0.7})`} aria-hidden="true">
                                <circle r="17" />
                                <text y="8" textAnchor="middle">LOCK</text>
                              </g>
                            )}
                            {skill.layer === 0 && (
                              <text className="quest-start-label" y={point.radius + 42} textAnchor="middle">START</text>
                            )}
                          </g>
                        );
                      })}
                    </>
                  )}
                </g>
              </svg>
            </div>

          </div>
          )}
        </div>
      </div>

      <nav className="player-dock" aria-label="Player navigation">
        <button type="button" className="is-active" onClick={() => scrollToMainSection('constellations')}>
          <Sparkles aria-hidden="true" />
          <span>Constellations</span>
        </button>
        <button type="button" onClick={() => { closeStarLens(true, false); navigate('/inventory'); }}>
          <Backpack aria-hidden="true" />
          <span>Inventory</span>
        </button>
        <button type="button" onClick={() => { closeStarLens(true, false); navigate('/shop'); }}>
          <ShoppingCart aria-hidden="true" />
          <span>Shop</span>
        </button>
      </nav>

      {starLensSkill && <StarLensDock
        skill={starLensSkill as ConstellationSkill}
        workflow={starLensWorkflow}
        userLevel={user?.level || 1}
        assetPointName={assetPointName}
        unlocked={unlockedSkills.includes(starLensSkill._id)}
        pending={pendingApprovalSkills.includes(starLensSkill._id)}
        completed={completedQuests.includes(starLensSkill._id)}
        completedStepIds={completedQuestSteps
          .filter(key => key.startsWith(`${starLensSkill._id}:`))
          .map(key => key.slice(starLensSkill._id.length + 1))}
        canUnlock={canUnlockSkill(starLensSkill)}
        closing={starLensClosing}
        focusOnOpen={starLensFocusOnOpen}
        onClose={() => closeStarLens()}
        onPrimaryAction={() => {
          if (starLensWorkflow === 'topic') {
            const openPath = topicPathActionRef.current;
            closeStarLens(true, false);
            openPath?.();
            return;
          }
          void handleUnlockSkill(starLensSkill);
        }}
        onCompleteStep={stepId => { void handleCompleteQuestStep(starLensSkill, stepId); }}
        onProgressSynced={() => refreshMainMenuStatus()}
        onOpenImage={(src, alt) => setExpandedImage({ src, alt })}
      />}

      {/* Skill Detail Modal */}
      {showSkillModal && selectedSkill && (
        <div className="guild-selection-modal-overlay" onClick={closeSkillModal}>
          <div
            ref={skillModalRef}
            className="guild-selection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quest-detail-title"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '700px' }}
          >
            <div className="guild-selection-header">
              <button type="button" className="quest-modal-close" onClick={closeSkillModal} aria-label="Close quest details">&times;</button>
              <h2 id="quest-detail-title" className="quest-title">{selectedSkill.title}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                <span style={{ fontSize: '1.4rem', color: '#6b7280' }}>
                  {(() => {
                    const isAdventure = selectedSkill.nodeType === 'adventure' || selectedSkill.nodeColor === 'white';
                    const isMarker = selectedSkill.nodeType === 'marker' || selectedSkill.nodeColor === 'yellow';
                    if (isAdventure) {
                      return <strong style={{ color: '#4e98ff' }}>Free Adventure</strong>;
                    } else if (isMarker) {
                      return <strong style={{ color: '#4e98ff' }}>Free Marker</strong>;
                    } else if (isQuestSkill(selectedSkill)) {
                      return <>Next quest: <strong style={{ color: '#4e98ff' }}>{selectedSkill.nextQuestCost ?? 25} {assetPointName}</strong></>;
                    } else {
                      return <>Cost: <strong style={{ color: '#4e98ff' }}>{selectedSkill.cost} {assetPointName}</strong></>;
                    }
                  })()}
                </span>
                {unlockedSkills.includes(selectedSkill._id) && (
                  <span style={{ fontSize: '1.4rem', color: '#22c55e', fontWeight: 'bold' }}>✓ Unlocked</span>
                )}
              </div>
            </div>
            
            <div className="guild-selection-content">
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#14306d', marginBottom: '12px' }}>Description</h4>
                <div className="quest-detail" style={{ fontSize: '1.4rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#374151' }}>
                  {renderDescriptionWithImages(selectedSkill.description)}
                </div>
              </div>

              {selectedSkill.subQuests && selectedSkill.subQuests.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 className="quest-section-title" style={{ fontSize: '1.8rem', fontWeight: '700', color: '#14306d', marginBottom: '12px' }}>Quest Steps ({selectedSkill.subQuests.length})</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedSkill.subQuests.map((subQuest, index) => {
                      const stepId = subQuest.externalId || `step-${index}`;
                      const stepKey = `${selectedSkill._id}:${stepId}`;
                      const isExpanded = expandedQuestSteps.includes(stepKey);
                      const isCompleted = completedQuestSteps.includes(stepKey);
                      const importedImageUrls = (subQuest.descriptionParts || []).filter(part => part.type === 'Image').map(part => part.content);
                      const linkedImageUrls = getImageUrls(subQuest.description).filter(url => !importedImageUrls.includes(url));
                      return <div key={stepId} style={{ border: '2px solid #cfe0f5', borderRadius: '8px', background: isCompleted ? '#effcf5' : '#f7fbff', overflow: 'hidden' }}>
                        <button onClick={() => setExpandedQuestSteps(current => current.includes(stepKey) ? current.filter(key => key !== stepKey) : [...current, stepKey])} style={{ width: '100%', padding: '10px 12px', border: 'none', background: 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                          <span className="quest-step-title" style={{ fontSize: '1.35rem', fontWeight: 700, color: '#214a87' }}>{isCompleted ? '✓ ' : ''}{index + 1}. {subQuest.title}</span>
                          <span style={{ color: '#4e98ff', fontSize: '1.2rem' }}>{isCompleted ? '+5 AP' : isExpanded ? 'Hide' : 'Open'}</span>
                        </button>
                        {isExpanded && <div style={{ padding: '0 12px 12px' }}>
                          {subQuest.type && <div style={{ fontSize: '1.05rem', color: '#4e98ff', marginBottom: '6px' }}>{subQuest.type}</div>}
                          {subQuest.descriptionParts?.length ? <div className="quest-step-detail" style={{ display: 'grid', gap: '8px' }}>{subQuest.descriptionParts.map((part, partIndex) => part.type === 'Image' ? <img key={partIndex} src={part.content} alt={subQuest.title} onClick={() => setExpandedImage({ src: part.content, alt: subQuest.title })} style={{ display: 'block', maxWidth: '100%', maxHeight: '360px', objectFit: 'contain', borderRadius: '6px', cursor: 'zoom-in' }} /> : <div key={partIndex} style={{ fontSize: '1.2rem', lineHeight: 1.45, color: '#4b5563', whiteSpace: 'pre-wrap' }}>{renderDescriptionWithImages(part.content)}</div>)}</div> : subQuest.description && <div className="quest-step-detail" style={{ fontSize: '1.2rem', lineHeight: 1.45, color: '#4b5563', whiteSpace: 'pre-wrap' }}>{renderDescriptionWithImages(subQuest.description)}</div>}
                          {subQuest.descriptionParts?.length && linkedImageUrls.map((imageUrl, imageIndex) => <img key={`linked-${imageIndex}`} src={imageUrl} alt={subQuest.title} onClick={() => setExpandedImage({ src: imageUrl, alt: subQuest.title })} onError={(event) => { event.currentTarget.style.display = 'none'; }} style={{ display: 'block', maxWidth: '100%', maxHeight: '360px', marginTop: '8px', objectFit: 'contain', borderRadius: '6px', cursor: 'zoom-in' }} />)}
                          <button
                            onClick={() => handleCompleteQuestStep(selectedSkill, stepId)}
                            disabled={isCompleted || pendingApprovalSkills.includes(selectedSkill._id) || (!unlockedSkills.includes(selectedSkill._id) && !canUnlockSkill(selectedSkill))}
                            style={{ marginTop: '12px', padding: '8px 14px', border: 'none', borderRadius: '6px', background: isCompleted ? '#86cfa5' : '#22c55e', color: '#fff', cursor: isCompleted ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: '1.2rem', fontWeight: 700 }}
                          >
                            {isCompleted ? 'Completed' : 'Complete +5 AP'}
                          </button>
                        </div>}
                      </div>;
                    })}
                  </div>
                  {pendingApprovalSkills.includes(selectedSkill._id) && <div style={{ marginTop: '12px', color: '#b45309', fontSize: '1.35rem', fontWeight: 700 }}>Approval pending</div>}
                  {completedQuests.includes(selectedSkill._id) && <div style={{ marginTop: '12px', color: '#16a34a', fontSize: '1.35rem', fontWeight: 700 }}>Quest approved and completed</div>}
                </div>
              )}

              {selectedSkill.prerequisites && selectedSkill.prerequisites.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#14306d', marginBottom: '12px' }}>Prerequisites</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedSkill.prerequisites.map((prereqId) => {
                      const prereqSkill = skills.find(s => s._id === prereqId);
                      const isUnlocked = unlockedSkills.includes(prereqId);
                      return (
                        <div key={prereqId} style={{ 
                          fontSize: '1.4rem', 
                          padding: '8px 12px',
                          background: isUnlocked ? '#22c55e1a' : '#ef44441a',
                          border: `2px solid ${isUnlocked ? '#22c55e' : '#ef4444'}`,
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isUnlocked ? '✓' : '✗'} {prereqSkill?.title || 'Unknown Quest'}
                          </div>
                          {!isUnlocked && prereqSkill && (
                            <button
                              onClick={() => {
                                closeSkillModal();
                                setHighlightedSkillId(prereqSkill._id);
                                setTimeout(() => {
                                  setHighlightedSkillId(null);
                                }, 3000);
                              }}
                              style={{
                                padding: '6px 12px',
                                background: '#4e98ff',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '1.2rem',
                                fontWeight: '500',
                                fontFamily: 'Dongle, sans-serif'
                              }}
                            >
                              Highlight Prerequisite
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {(() => {
                const previewClips = Array.isArray(selectedSkill.previewClip) 
                  ? selectedSkill.previewClip 
                  : (selectedSkill.previewClip ? [selectedSkill.previewClip] : []);
                
                return previewClips.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#14306d', marginBottom: '12px' }}>
                      Preview {previewClips.length > 1 ? 'Clips' : 'Clip'}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {previewClips.map((clip, index) => (
                        <div key={index} style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '12px', background: '#000' }}>
                          <iframe
                            src={getYouTubeEmbedUrl(clip)}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={`Preview Clip ${index + 1}`}
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: '12px' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {((selectedSkill.contentYouTube && selectedSkill.contentYouTube.length > 0) || 
                (selectedSkill.contentGoogleDrive && selectedSkill.contentGoogleDrive.length > 0)) &&
                selectedSkill.nodeType !== 'adventure' && selectedSkill.nodeColor !== 'white' &&
                // For asset nodes, only show content links if unlocked
                (!(selectedSkill.nodeType === 'asset' || selectedSkill.nodeColor === 'blue') ||
                 ((selectedSkill.nodeType === 'asset' || selectedSkill.nodeColor === 'blue') && unlockedSkills.includes(selectedSkill._id))) && (
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '1.8rem', fontWeight: '700', color: '#14306d', marginBottom: '12px' }}>Content Links</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedSkill.contentYouTube && selectedSkill.contentYouTube.map((link, index) => (
                      <a 
                        key={`youtube-${index}`}
                        href={link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ 
                          fontSize: '1.4rem', 
                          color: '#4e98ff', 
                          textDecoration: 'none',
                          padding: '8px 12px',
                          background: '#4e98ff1a',
                          borderRadius: '8px',
                          border: '2px solid #4e98ff33'
                        }}
                      >
                        📺 YouTube Content {selectedSkill.contentYouTube && selectedSkill.contentYouTube.length > 1 ? `${index + 1}` : ''}
                      </a>
                    ))}
                    {selectedSkill.contentGoogleDrive && selectedSkill.contentGoogleDrive.map((link, index) => (
                      <a 
                        key={`gdrive-${index}`}
                        href={link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ 
                          fontSize: '1.4rem', 
                          color: '#4e98ff', 
                          textDecoration: 'none',
                          padding: '8px 12px',
                          background: '#4e98ff1a',
                          borderRadius: '8px',
                          border: '2px solid #4e98ff33'
                        }}
                      >
                        📂 Google Drive Content {selectedSkill.contentGoogleDrive && selectedSkill.contentGoogleDrive.length > 1 ? `${index + 1}` : ''}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="guild-selection-actions">
              {!unlockedSkills.includes(selectedSkill._id) ? (
                <button
                  className="join-guild-btn"
                  onClick={() => { void handleUnlockSkill(); }}
                  disabled={isQuestSkill(selectedSkill)
                    ? pendingApprovalSkills.includes(selectedSkill._id) ||
                      !hasCompletedAllQuestSteps(selectedSkill) ||
                      !canUnlockSkill(selectedSkill) ||
                      assetPoints < (selectedSkill.nextQuestCost ?? 25)
                    : !canUnlockSkill(selectedSkill)}
                  style={{
                    background: (isQuestSkill(selectedSkill)
                      ? !pendingApprovalSkills.includes(selectedSkill._id) &&
                        hasCompletedAllQuestSteps(selectedSkill) &&
                        canUnlockSkill(selectedSkill) &&
                        assetPoints >= (selectedSkill.nextQuestCost ?? 25)
                      : canUnlockSkill(selectedSkill))
                      ? 'linear-gradient(135deg, #22c55e, #16a34a)' 
                      : '#6b7280',
                    boxShadow: (isQuestSkill(selectedSkill)
                      ? !pendingApprovalSkills.includes(selectedSkill._id) &&
                        hasCompletedAllQuestSteps(selectedSkill) &&
                        canUnlockSkill(selectedSkill) &&
                        assetPoints >= (selectedSkill.nextQuestCost ?? 25)
                      : canUnlockSkill(selectedSkill))
                      ? '0 4px 20px rgba(34, 197, 94, 0.6), 0 0 20px rgba(34, 197, 94, 0.4)'
                      : 'none',
                    animation: (isQuestSkill(selectedSkill) && !pendingApprovalSkills.includes(selectedSkill._id) && hasCompletedAllQuestSteps(selectedSkill) && canUnlockSkill(selectedSkill) && assetPoints >= (selectedSkill.nextQuestCost ?? 25)) || (!isQuestSkill(selectedSkill) && canUnlockSkill(selectedSkill)) ? 'glow 2s ease-in-out infinite' : 'none',
                    opacity: (isQuestSkill(selectedSkill) && !pendingApprovalSkills.includes(selectedSkill._id) && hasCompletedAllQuestSteps(selectedSkill) && canUnlockSkill(selectedSkill) && assetPoints >= (selectedSkill.nextQuestCost ?? 25)) || (!isQuestSkill(selectedSkill) && canUnlockSkill(selectedSkill)) ? 1 : 0.6,
                    cursor: (isQuestSkill(selectedSkill) && !pendingApprovalSkills.includes(selectedSkill._id) && hasCompletedAllQuestSteps(selectedSkill) && canUnlockSkill(selectedSkill) && assetPoints >= (selectedSkill.nextQuestCost ?? 25)) || (!isQuestSkill(selectedSkill) && canUnlockSkill(selectedSkill)) ? 'pointer' : 'not-allowed'
                  }}
                >
                  {(() => {
                    const isAdventure = selectedSkill.nodeType === 'adventure' || selectedSkill.nodeColor === 'white';
                    const isMarker = selectedSkill.nodeType === 'marker' || selectedSkill.nodeColor === 'yellow';
                    const isQuest = selectedSkill.nodeType === 'quest' || selectedSkill.nodeColor === 'green';
                    if (isAdventure) {
                      return '✅ Complete Adventure';
                    } else if (isMarker) {
                      return '✅ OK';
                    } else if (isQuest) {
                      if (pendingApprovalSkills.includes(selectedSkill._id)) return 'Approval Pending';
                      if (!hasCompletedAllQuestSteps(selectedSkill)) return 'Complete All Steps First';
                      if (assetPoints < (selectedSkill.nextQuestCost ?? 25)) return `Need ${selectedSkill.nextQuestCost ?? 25} AP to Continue`;
                      return `Send Approval Request (${selectedSkill.nextQuestCost ?? 25} AP on approval)`;
                    } else {
                      return `🔓 Unlock Quest (${selectedSkill.cost} AP)`;
                    }
                  })()}
                </button>
              ) : (
                <button
                  className="join-guild-btn"
                  disabled
                  style={{
                    background: '#22c55e',
                    opacity: 0.7,
                    cursor: 'not-allowed'
                  }}
                >
                  {(() => {
                    const isAdventure = selectedSkill.nodeType === 'adventure' || selectedSkill.nodeColor === 'white';
                    const isMarker = selectedSkill.nodeType === 'marker' || selectedSkill.nodeColor === 'yellow';
                    if (isAdventure) {
                      return '✓ Adventure Completed';
                    } else if (isMarker) {
                      return '✓ OK';
                    } else {
                      return '✓ Already Unlocked';
                    }
                  })()}
                </button>
              )}
              <button
                className="cancel-btn"
                onClick={closeSkillModal}
                style={{
                  padding: '12px 24px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50px',
                  fontSize: '1.4rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginLeft: '12px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {expandedImage && (
        <div ref={imageDialogRef as React.RefObject<HTMLDivElement>} className="quest-image-preview" role="dialog" aria-modal="true" aria-label={`Image preview: ${expandedImage.alt}`} tabIndex={-1} onClick={() => setExpandedImage(null)} style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center', padding: '24px', background: 'rgba(11, 25, 56, 0.82)', cursor: 'zoom-out' }}>
          <img src={expandedImage.src} alt={expandedImage.alt} onClick={(event) => event.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 18px 60px rgba(0, 0, 0, 0.45)', cursor: 'default' }} />
          <button onClick={() => setExpandedImage(null)} aria-label="Close image" style={{ position: 'fixed', top: '22px', right: '24px', width: '42px', height: '42px', border: 'none', borderRadius: '50%', background: '#fff', color: '#14306d', fontSize: '26px', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Approval Request Modal */}
      {showApprovalRequestModal && selectedSkill && (
        <div className="guild-selection-modal-overlay" onClick={() => setShowApprovalRequestModal(false)}>
          <div ref={approvalDialogRef as React.RefObject<HTMLDivElement>} className="guild-selection-modal" role="dialog" aria-modal="true" aria-labelledby="approval-dialog-title" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="guild-selection-header">
              <h2 id="approval-dialog-title">{starLensWorkflow === 'main' ? 'Submit Main Quest for Level Up' : 'Send Approval Request'}</h2>
              <p style={{ fontSize: '1.4rem', color: '#6b7280', marginTop: '8px' }}>
                {starLensWorkflow === 'main' ? `Complete Level ${selectedSkill.mainQuestLevel || user?.level || 1} Main Quest: ` : 'Request approval for: '}<strong>{selectedSkill.title}</strong>
              </p>
              {starLensWorkflow === 'main' ? <p style={{ fontSize: '1.25rem', color: '#047857', marginTop: '8px' }}>
                เมื่อ Admin อนุมัติ Level ของคุณจะเพิ่มเป็น {(selectedSkill.mainQuestLevel || user?.level || 1) + 1} โดยไม่เสีย {assetPointName}
              </p> : <p style={{ fontSize: '1.25rem', color: '#b45309', marginTop: '8px' }}>
                {selectedSkill.nextQuestCost ?? 25} {assetPointName} will be charged after approval to continue to the next quest.
              </p>}
            </div>
            
            <div className="guild-selection-content">
              <div style={{ marginBottom: '20px' }}>
                <label style={{ 
                  display: 'block', 
                  fontSize: '1.4rem', 
                  fontWeight: '600', 
                  marginBottom: '8px',
                  color: '#14306d'
                }}>
                  Message to Admin (Optional)
                </label>
                <textarea
                  value={approvalMessage}
                  onChange={(e) => setApprovalMessage(e.target.value)}
                  placeholder="Enter any message you'd like to send to the admin..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '12px',
                    fontSize: '1.4rem',
                    fontFamily: 'Dongle, sans-serif',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div className="guild-selection-actions">
              <button
                className="join-guild-btn"
                onClick={handleSendApprovalRequest}
                style={{
                  padding: '12px 24px',
                  background: 'linear-gradient(135deg, #4e98ff, #3b82f6)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50px',
                  fontSize: '1.4rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {starLensWorkflow === 'main' ? '📤 Submit for Level Up' : '📤 Send Request'}
              </button>
              <button
                className="cancel-btn"
                onClick={() => {
                  setShowApprovalRequestModal(false);
                  setApprovalMessage('');
                }}
                style={{
                  padding: '12px 24px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50px',
                  fontSize: '1.4rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginLeft: '12px'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guild Selection Modal */}
      {showGuildSelection && (
        <div className="guild-selection-modal-overlay" onClick={() => {}}>
          <div ref={guildDialogRef as React.RefObject<HTMLDivElement>} className="guild-selection-modal" role="dialog" aria-modal="true" aria-labelledby="guild-dialog-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="guild-selection-header">
              <h2 id="guild-dialog-title">Choose Your Guild</h2>
              <p>Please select a guild to join. You can change this later.</p>
            </div>
            
            <div className="guild-selection-content">
              {guilds.length === 0 ? (
                <p className="no-guilds-message">No guilds available. Please contact an administrator.</p>
              ) : (
                <div className="guild-list">
                  {guilds.map((guild) => (
                    <button
                      type="button"
                      key={guild._id}
                      className={`guild-option ${selectedGuildId === guild._id ? 'selected' : ''}`}
                      onClick={() => setSelectedGuildId(guild._id)}
                    >
                      <div className="guild-option-name">{guild.name}</div>
                      {guild.guildLeaderIds && guild.guildLeaderIds.length > 0 && (
                        <div className="guild-option-leader">
                          👑 Leaders: {guild.guildLeaderIds.length}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="guild-selection-actions">
              <button
                className="join-guild-btn"
                onClick={handleJoinGuild}
                disabled={!selectedGuildId || guilds.length === 0}
              >
                Join Guild
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainMenu;
