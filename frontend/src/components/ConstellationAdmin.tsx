import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Download, ExternalLink, FileText, ImagePlus, Link2, MoreHorizontal, Pencil, Plus, Search, Sparkles, Tags, Trash2, X } from 'lucide-react';
import axios from '../config/axios';
import type { ConstellationMap, ConstellationScope, ConstellationSkill } from './constellationTypes';
import ConstellationLayoutEditor, { ConstellationLayoutPosition } from './ConstellationLayoutEditor';
import { applyMarkdownBold, applyMarkdownIndent } from './richTextEditing';
import './ConstellationAdmin.css';

interface ConstellationAdminProps {
  skills: ConstellationSkill[];
  onSkillsChanged: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

interface MapFormState {
  name: string;
  slug: string;
  scope: ConstellationScope;
  parentMapId: string;
  gatewaySkillId: string;
}

interface StarMasterCatalogQuest {
  externalId: string;
  title: string;
  description: string;
  type?: string;
  imageUrl?: string;
  subQuestCount: number;
  imported: boolean;
  importedMapId?: string;
  tags?: StarMasterTag[];
}

interface StarMasterTag {
  id: string;
  name: string;
  color?: string;
}

const STAR_MASTER_QUEST_TYPES = [
  'MainQuest',
  'SpecialQuest',
  'BossQuest',
  'MiniBossQuest',
  'DailyQuest',
  'WeeklyQuest',
  'MonthlyQuest'
];

interface EditableQuestStep {
  externalId?: string;
  title: string;
  description: string;
  descriptionParts: Array<{ type: string; content: string }>;
  type: string;
}

interface StarContextMenuState {
  skillId: string;
  x: number;
  y: number;
}

const blankMapForm = (): MapFormState => ({
  name: '',
  slug: '',
  scope: 'discipline',
  parentMapId: '',
  gatewaySkillId: ''
});

const loadEveryMap = async (): Promise<ConstellationMap[]> => {
  const maps: ConstellationMap[] = [];
  let cursor: string | undefined;
  do {
    const response = await axios.get('/api/constellation-maps', {
      params: { includeInactive: true, limit: 100, ...(cursor ? { cursor } : {}) }
    });
    maps.push(...(response.data.maps || []));
    cursor = response.data.pagination?.nextCursor || undefined;
  } while (cursor);
  return maps;
};

function ConstellationAdmin({ skills, onSkillsChanged, onDirtyChange }: ConstellationAdminProps) {
  const [maps, setMaps] = useState<ConstellationMap[]>([]);
  const [selectedMapId, setSelectedMapId] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [connectionSourceId, setConnectionSourceId] = useState('');
  const [draftPositions, setDraftPositions] = useState<Record<string, ConstellationLayoutPosition>>({});
  const [showMapForm, setShowMapForm] = useState(false);
  const [showStarForm, setShowStarForm] = useState(false);
  const [showInfoForm, setShowInfoForm] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [mapForm, setMapForm] = useState<MapFormState>(blankMapForm());
  const [starTitle, setStarTitle] = useState('');
  const [infoTitle, setInfoTitle] = useState('');
  const [infoDescription, setInfoDescription] = useState('');
  const [infoLabel, setInfoLabel] = useState('');
  const [infoSummary, setInfoSummary] = useState('');
  const [infoOutcomes, setInfoOutcomes] = useState('');
  const [infoImageUrl, setInfoImageUrl] = useState('');
  const [infoSteps, setInfoSteps] = useState<EditableQuestStep[]>([]);
  const [starMasterItems, setStarMasterItems] = useState<StarMasterCatalogQuest[]>([]);
  const [starMasterLoading, setStarMasterLoading] = useState(false);
  const [starMasterSearch, setStarMasterSearch] = useState('');
  const [starMasterType, setStarMasterType] = useState('all');
  const [starMasterStatus, setStarMasterStatus] = useState<'all' | 'new' | 'imported'>('all');
  const [starMasterTypes, setStarMasterTypes] = useState<string[]>(STAR_MASTER_QUEST_TYPES);
  const [starMasterTags, setStarMasterTags] = useState<StarMasterTag[]>([]);
  const [starMasterTagsLoading, setStarMasterTagsLoading] = useState(false);
  const [starMasterSelectedTagIds, setStarMasterSelectedTagIds] = useState<string[]>([]);
  const [starMasterTagSearch, setStarMasterTagSearch] = useState('');
  const [starMasterIncludeNoTags, setStarMasterIncludeNoTags] = useState(false);
  const [showStarMasterTagMenu, setShowStarMasterTagMenu] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [showMapMenu, setShowMapMenu] = useState(false);
  const [starContextMenu, setStarContextMenu] = useState<StarContextMenuState | null>(null);
  const [infoTab, setInfoTab] = useState<'details' | 'steps'>('details');
  const [selectedInfoStepIndex, setSelectedInfoStepIndex] = useState(0);
  const [starMasterPage, setStarMasterPage] = useState(1);
  const [starMasterTotalPages, setStarMasterTotalPages] = useState(1);
  const [starMasterTotal, setStarMasterTotal] = useState(0);
  const [starMasterError, setStarMasterError] = useState('');
  const [importQuestIds, setImportQuestIds] = useState<string[]>([]);
  const [importDisciplineId, setImportDisciplineId] = useState('');
  const [importTopicMapId, setImportTopicMapId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const layoutMapId = useRef('');
  const starMasterRequestId = useRef(0);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const modalOpenerRef = useRef<HTMLElement | SVGElement | null>(null);
  const starMasterTagMenuRef = useRef<HTMLDivElement | null>(null);
  const mapMenuRef = useRef<HTMLDivElement | null>(null);
  const starContextMenuRef = useRef<HTMLDivElement | null>(null);

  const requestErrorMessage = (requestError: any, fallback: string) => {
    const data = requestError?.response?.data;
    return data?.error || data?.message || fallback;
  };

  const refreshMaps = async () => {
    try {
      const loaded = await loadEveryMap();
      setMaps(loaded);
      setSelectedMapId(current => current && loaded.some(map => map._id === current)
        ? current
        : loaded[0]?._id || '');
    } catch {
      setError('Unable to load constellations.');
    }
  };

  useEffect(() => { refreshMaps(); }, []);

  const selectedMap = maps.find(map => map._id === selectedMapId);
  const disciplineMaps = maps.filter(map => map.scope === 'discipline');
  const mapSkills = useMemo(() => skills
    .filter(skill => skill.constellationMapId === selectedMapId)
    .sort((a, b) => a.position - b.position), [skills, selectedMapId]);
  const selectedSkill = mapSkills.find(skill => skill._id === selectedSkillId);

  useEffect(() => {
    const mapChanged = layoutMapId.current !== selectedMapId;
    setDraftPositions(current => Object.fromEntries(mapSkills.map((skill, index) => [
      skill._id,
      !mapChanged && current[skill._id]
        ? current[skill._id]
        : skill.constellationPosition || {
          x: 260 + (index % 4) * 300,
          y: 220 + Math.floor(index / 4) * 210
        }
    ])));
    layoutMapId.current = selectedMapId;
  }, [mapSkills, selectedMapId]);

  const dirtySkillIds = useMemo(() => new Set(mapSkills
    .filter(skill => {
      const draft = draftPositions[skill._id];
      const saved = skill.constellationPosition;
      return Boolean(draft && (!saved || draft.x !== saved.x || draft.y !== saved.y));
    })
    .map(skill => skill._id)), [draftPositions, mapSkills]);

  useEffect(() => {
    const dirty = dirtySkillIds.size > 0;
    onDirtyChange?.(dirty);
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtySkillIds, onDirtyChange]);

  const closeModal = () => {
    setShowMapForm(false);
    setShowStarForm(false);
    setShowInfoForm(false);
    setShowImportForm(false);
    window.requestAnimationFrame(() => modalOpenerRef.current?.focus());
  };

  const closeFloatingMenus = () => {
    setShowMapMenu(false);
    setStarContextMenu(null);
  };

  useEffect(() => {
    if (!showMapForm && !showStarForm && !showInfoForm && !showImportForm) return;
    const focusable = () => Array.from(modalRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) || []);
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (showStarMasterTagMenu) {
          event.stopImmediatePropagation();
          setShowStarMasterTagMenu(false);
          return;
        }
        closeModal();
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
  }, [showImportForm, showInfoForm, showMapForm, showStarForm, showStarMasterTagMenu]);

  const loadStarMasterItems = async (page = 1, append = false) => {
    const requestId = ++starMasterRequestId.current;
    setStarMasterLoading(true);
    setStarMasterError('');
    if (!append) {
      setStarMasterItems([]);
      setStarMasterTotal(0);
    }
    try {
      const response = await axios.get('/api/admin/star-master/quests', {
        params: {
          page,
          limit: 50,
          ...(starMasterSearch.trim() ? { search: starMasterSearch.trim() } : {}),
          ...(starMasterType !== 'all' ? { type: starMasterType } : {}),
          ...(starMasterSelectedTagIds.length > 0 ? { tagIds: starMasterSelectedTagIds.join(',') } : {}),
          ...(starMasterIncludeNoTags ? { includeNoTags: '1' } : {})
        }
      });
      if (requestId !== starMasterRequestId.current) return;
      const incoming: StarMasterCatalogQuest[] = response.data.quests || [];
      setStarMasterItems(current => append
        ? [...current, ...incoming.filter(item => !current.some(candidate => candidate.externalId === item.externalId))]
        : incoming);
      setStarMasterTypes(current => [...new Set([...current, ...incoming.map(item => item.type).filter(Boolean) as string[]])].sort());
      setStarMasterPage(response.data.pagination?.page || page);
      setStarMasterTotalPages(response.data.pagination?.totalPages || 1);
      setStarMasterTotal(response.data.pagination?.total || incoming.length);
    } catch (requestError: any) {
      if (requestId !== starMasterRequestId.current) return;
      setStarMasterError(requestError.response?.data?.error || 'Unable to load StarMaster quests.');
    } finally {
      if (requestId === starMasterRequestId.current) setStarMasterLoading(false);
    }
  };

  const loadStarMasterTags = async () => {
    if (starMasterTags.length > 0 || starMasterTagsLoading) return;
    setStarMasterTagsLoading(true);
    try {
      const response = await axios.get('/api/admin/star-master/tags');
      setStarMasterTags(response.data.tags || []);
    } catch (requestError: any) {
      setStarMasterError(requestError.response?.data?.error || 'Unable to load StarMaster tags.');
    } finally {
      setStarMasterTagsLoading(false);
    }
  };

  useEffect(() => {
    starMasterRequestId.current += 1;
    if (!showImportForm) {
      setStarMasterLoading(false);
      return;
    }
    void loadStarMasterTags();
    const timer = window.setTimeout(() => { void loadStarMasterItems(1, false); }, 250);
    return () => window.clearTimeout(timer);
  }, [showImportForm, starMasterSearch, starMasterType, starMasterSelectedTagIds.join(','), starMasterIncludeNoTags]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!starMasterTagMenuRef.current?.contains(event.target as Node)) setShowStarMasterTagMenu(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!mapMenuRef.current?.contains(target)) setShowMapMenu(false);
      if (!starContextMenuRef.current?.contains(target)) setStarContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowMapMenu(false);
      setStarContextMenu(null);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const openSkillInfo = (skill: ConstellationSkill, opener?: HTMLElement | SVGElement | null) => {
    modalOpenerRef.current = opener ?? document.activeElement as HTMLElement | SVGElement | null;
    setError('');
    setSelectedSkillId(skill._id);
    setInfoTitle(skill.title);
    setInfoDescription(skill.description || '');
    setInfoLabel(skill.constellationLabel || '');
    setInfoSummary(skill.nodePreview?.summary || '');
    setInfoOutcomes((skill.nodePreview?.outcomes || []).join('\n'));
    setInfoImageUrl(skill.nodePreview?.imageUrl || '');
    const steps = (skill.subQuests || []).map(step => {
      const descriptionParts = (step.descriptionParts || []).map(part => ({ ...part }));
      return {
        externalId: step.externalId,
        title: step.title,
        description: step.description || '',
        descriptionParts: descriptionParts.length > 0
          ? descriptionParts
          : step.description ? [{ type: 'Text', content: step.description }] : [],
        type: step.type || 'ImageNote'
      };
    });
    setInfoSteps(steps);
    setInfoTab(steps.length > 0 ? 'steps' : 'details');
    setSelectedInfoStepIndex(0);
    setShowInfoForm(true);
  };

  const openModal = (type: 'map' | 'star' | 'info' | 'import') => {
    modalOpenerRef.current = document.activeElement as HTMLElement | null;
    setError('');
    if (type === 'map') {
      setMapForm(blankMapForm());
      setShowMapForm(true);
    } else if (type === 'star') {
      setStarTitle('');
      setShowStarForm(true);
    } else if (type === 'import' && selectedMap?.scope === 'topic') {
      setStarMasterItems([]);
      setStarMasterTypes(STAR_MASTER_QUEST_TYPES);
      setStarMasterError('');
      setStarMasterSearch('');
      setStarMasterType('all');
      setStarMasterStatus('all');
      setStarMasterSelectedTagIds([]);
      setStarMasterTagSearch('');
      setStarMasterIncludeNoTags(false);
      setShowStarMasterTagMenu(false);
      setImportQuestIds([]);
      setImportDisciplineId(selectedMap.parentMapId || '');
      setImportTopicMapId(selectedMap._id);
      setShowImportForm(true);
    } else if (selectedSkill) openSkillInfo(selectedSkill);
  };

  const importTopics = maps.filter(map => map.scope === 'topic' && map.parentMapId === importDisciplineId);
  const filteredStarMasterItems = starMasterItems.filter(quest =>
    starMasterStatus === 'all' || (starMasterStatus === 'imported' ? quest.imported : !quest.imported)
  );
  const selectableVisibleQuestIds = filteredStarMasterItems.map(quest => quest.externalId);
  const allVisibleQuestsSelected = selectableVisibleQuestIds.length > 0 && selectableVisibleQuestIds.every(externalQuestId => importQuestIds.includes(externalQuestId));
  const toggleImportQuest = (externalQuestId: string, selected: boolean) => {
    setStarMasterError('');
    setImportQuestIds(current => {
      if (!selected) return current.filter(candidateId => candidateId !== externalQuestId);
      if (current.includes(externalQuestId)) return current;
      if (current.length >= 50) {
        setStarMasterError('Import up to 50 quests at a time.');
        return current;
      }
      return [...current, externalQuestId];
    });
  };
  const toggleVisibleImportQuests = () => {
    setStarMasterError('');
    setImportQuestIds(current => {
      if (allVisibleQuestsSelected) return current.filter(externalQuestId => !selectableVisibleQuestIds.includes(externalQuestId));
      const remainingIds = selectableVisibleQuestIds.filter(externalQuestId => !current.includes(externalQuestId));
      const next = [...current, ...remainingIds].slice(0, 50);
      if (current.length + remainingIds.length > 50) setStarMasterError('Selected the first 50 quests. Import this batch before selecting more.');
      return next;
    });
  };
  const filteredStarMasterTags = starMasterTags.filter(tag =>
    tag.name.toLowerCase().includes(starMasterTagSearch.trim().toLowerCase())
  );
  const selectedStarMasterTags = starMasterSelectedTagIds
    .map(tagId => starMasterTags.find(tag => tag.id === tagId))
    .filter((tag): tag is StarMasterTag => Boolean(tag));

  const switchMap = (mapId: string) => {
    if (mapId === selectedMapId) return;
    if (dirtySkillIds.size > 0 && !confirm('Discard unsaved star positions?')) return;
    setSelectedMapId(mapId);
    setSelectedSkillId('');
    setConnectionSourceId('');
    closeFloatingMenus();
  };

  const updateMapVisibility = async () => {
    if (!selectedMap) return;
    try {
      setBusy(true);
      setError('');
      await axios.patch(`/api/constellation-maps/${selectedMap._id}`, { isActive: !selectedMap.isActive });
      await refreshMaps();
    } catch (requestError: any) {
      setError(requestErrorMessage(requestError, `Unable to ${selectedMap.isActive ? 'unpublish' : 'publish'} this constellation.`));
    } finally {
      setBusy(false);
    }
  };

  const deleteStar = async (skill: ConstellationSkill) => {
    const starName = skill.constellationLabel || skill.title;
    if (!confirm(`Delete star "${starName}"? Its connections, dependent topic constellation, child stars, and user progress will also be removed. This cannot be undone.`)) return;
    try {
      setBusy(true);
      setError('');
      await axios.delete(`/api/skills/${skill._id}`, { params: { cascade: true } });
      setSelectedSkillId('');
      setConnectionSourceId('');
      await onSkillsChanged();
    } catch (requestError: any) {
      setError(requestErrorMessage(requestError, `Unable to delete "${starName}".`));
    } finally {
      setBusy(false);
    }
  };

  const deleteSelectedMap = async () => {
    if (!selectedMap) return;
    const parentMapId = selectedMap.parentMapId;
    if (!confirm(`Delete ${selectedMap.scope} constellation "${selectedMap.name}"? All dependent topic maps, stars, connections, and user progress will also be removed. This cannot be undone.`)) return;
    try {
      setBusy(true);
      setError('');
      await axios.delete(`/api/constellation-maps/${selectedMap._id}`, { params: { cascade: true } });
      setSelectedSkillId('');
      setConnectionSourceId('');
      await refreshMaps();
      if (parentMapId) setSelectedMapId(parentMapId);
    } catch (requestError: any) {
      setError(requestErrorMessage(requestError, `Unable to delete "${selectedMap.name}". Remove its stars first.`));
    } finally {
      setBusy(false);
    }
  };

  const toggleConnection = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const source = mapSkills.find(skill => skill._id === sourceId);
    if (!source) return;
    const exists = source.connections?.some(connection => connection.targetSkillId === targetId);
    try {
      setBusy(true);
      setError('');
      if (exists) {
        await axios.delete(`/api/skills/${sourceId}/connections/${targetId}`);
      } else {
        await axios.post(`/api/skills/${sourceId}/connections`, {
          targetSkillId: targetId,
          connectionType: 'normal',
          hasArrowhead: true
        });
      }
      await onSkillsChanged();
      setSelectedSkillId(sourceId);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Unable to update this connection.');
    } finally {
      setBusy(false);
    }
  };

  const openStarContextMenu = (skillId: string, clientX: number, clientY: number) => {
    const menuWidth = 220;
    const menuHeight = selectedMap?.scope === 'discipline' ? 196 : 152;
    setSelectedSkillId(skillId);
    setShowMapMenu(false);
    setStarContextMenu({
      skillId,
      x: Math.max(8, Math.min(clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - menuHeight - 8))
    });
  };

  const beginConnectingFrom = (skillId: string) => {
    setSelectedSkillId(skillId);
    setConnectionSourceId(skillId);
    setStarContextMenu(null);
  };

  const activateStar = async (skillId: string) => {
    setSelectedSkillId(skillId);
    if (!selectedMap) return;
    if (selectedMap.scope === 'topic') {
      const skill = mapSkills.find(candidate => candidate._id === skillId);
      if (skill) openSkillInfo(skill);
      return;
    }
    const topicMap = maps.find(map => map.scope === 'topic' && map.gatewaySkillId === skillId);
    if (topicMap) {
      switchMap(topicMap._id);
      return;
    }
    if (dirtySkillIds.size > 0 && !confirm('Discard unsaved star positions?')) return;
    const gateway = mapSkills.find(skill => skill._id === skillId);
    if (!gateway) return;
    try {
      setBusy(true);
      setError('');
      const name = gateway.constellationLabel || gateway.title;
      const response = await axios.post('/api/constellation-maps', {
        name,
        slug: `${selectedMap.slug}-${gateway.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        scope: 'topic',
        displayOrder: maps.filter(map => map.parentMapId === selectedMap._id).length,
        isActive: false,
        parentMapId: selectedMap._id,
        gatewaySkillId: gateway._id
      });
      await refreshMaps();
      if (response.data.map?._id) setSelectedMapId(response.data.map._id);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Unable to create this topic.');
    } finally {
      setBusy(false);
    }
  };

  const resetLayout = () => {
    setDraftPositions(Object.fromEntries(mapSkills.map((skill, index) => [
      skill._id,
      skill.constellationPosition || {
        x: 260 + (index % 4) * 300,
        y: 220 + Math.floor(index / 4) * 210
      }
    ])));
  };

  const saveLayout = async () => {
    if (!selectedMap || dirtySkillIds.size === 0) return;
    try {
      setBusy(true);
      setError('');
      await axios.patch(`/api/constellation-maps/${selectedMap._id}/layout`, {
        nodes: Array.from(dirtySkillIds).map(skillId => ({ skillId, ...draftPositions[skillId] }))
      });
      await onSkillsChanged();
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Unable to save star positions. Your changes are still here.');
    } finally {
      setBusy(false);
    }
  };

  const saveMap = async () => {
    if (!mapForm.name.trim()) return;
    try {
      setBusy(true);
      const response = await axios.post('/api/constellation-maps', {
        name: mapForm.name.trim(),
        slug: mapForm.slug.trim() || mapForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        scope: mapForm.scope,
        displayOrder: maps.length,
        isActive: false,
        parentMapId: mapForm.scope === 'topic' ? mapForm.parentMapId : null,
        gatewaySkillId: mapForm.scope === 'topic' ? mapForm.gatewaySkillId : null
      });
      closeModal();
      await refreshMaps();
      if (response.data.map?._id) setSelectedMapId(response.data.map._id);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Unable to create constellation.');
    } finally {
      setBusy(false);
    }
  };

  const createStar = async () => {
    if (!selectedMap || !starTitle.trim()) return;
    const index = mapSkills.length;
    const position = {
      x: Math.round(selectedMap.viewport.width / 2 + ((index % 3) - 1) * 220),
      y: Math.round(selectedMap.viewport.height / 2 + Math.floor(index / 3) * 160)
    };
    try {
      setBusy(true);
      setError('');
      const response = await axios.post('/api/skills', {
        title: starTitle.trim(),
        description: starTitle.trim(),
        cost: 0,
        constellationMapId: selectedMap._id,
        constellationPosition: position,
        mapNodeRole: selectedMap.scope === 'discipline' ? 'topic-gateway' : 'lesson'
      });
      closeModal();
      await onSkillsChanged();
      if (response.data.skill?._id) setSelectedSkillId(response.data.skill._id);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Unable to create star.');
    } finally {
      setBusy(false);
    }
  };

  const importStarMasterQuests = async () => {
    if (importQuestIds.length === 0 || !importTopicMapId) return;
    try {
      setBusy(true);
      setError('');
      setStarMasterError('');
      const response = await axios.post('/api/admin/star-master/quests/import', {
        constellationMapId: importTopicMapId,
        externalQuestIds: importQuestIds
      });
      const importedSkills: ConstellationSkill[] = response.data.imported || [];
      const skippedIds = (response.data.skipped || []).map((item: { externalQuestId: string }) => item.externalQuestId);
      const completedIds = new Set([...importedSkills.map(skill => skill.externalQuestId).filter(Boolean), ...skippedIds]);
      setStarMasterItems(current => current.map(item => completedIds.has(item.externalId) ? { ...item, imported: true, importedMapId: importTopicMapId } : item));
      setImportQuestIds(current => current.filter(externalQuestId => !completedIds.has(externalQuestId)));
      if (importedSkills.length > 0) await onSkillsChanged();
      setSelectedMapId(importTopicMapId);
      if (importedSkills.length > 0) setSelectedSkillId(importedSkills[importedSkills.length - 1]._id);
      const failed = response.data.failed || [];
      if (failed.length > 0) {
        setStarMasterError(`${importedSkills.length} imported. ${failed.length} failed and remain selected.`);
      } else {
        closeModal();
      }
    } catch (requestError: any) {
      setStarMasterError(requestError.response?.data?.error || 'Unable to import the selected StarMaster quests.');
    } finally {
      setBusy(false);
    }
  };

  const updateInfoStep = (index: number, patch: Partial<EditableQuestStep>) => {
    setInfoSteps(current => current.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step));
  };

  const addInfoStep = () => {
    setInfoSteps(current => {
      setSelectedInfoStepIndex(current.length);
      return [...current, {
        title: '',
        description: '',
        descriptionParts: [{ type: 'Text', content: '' }],
        type: 'ImageNote'
      }];
    });
    setInfoTab('steps');
  };

  const removeInfoStep = (index: number) => {
    setInfoSteps(current => current.filter((_, stepIndex) => stepIndex !== index));
    setSelectedInfoStepIndex(current => Math.max(0, Math.min(current, infoSteps.length - 2)));
  };

  const updateStepPart = (stepIndex: number, partIndex: number, content: string) => {
    setInfoSteps(current => current.map((step, candidateStepIndex) => candidateStepIndex === stepIndex
      ? {
          ...step,
          descriptionParts: step.descriptionParts.map((part, candidatePartIndex) => candidatePartIndex === partIndex
            ? { ...part, content }
            : part)
        }
      : step));
  };

  const handleRichTextKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      applyMarkdownBold(event.currentTarget);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      applyMarkdownIndent(event.currentTarget, event.shiftKey);
    }
  };

  const moveStepPart = (stepIndex: number, partIndex: number, direction: -1 | 1) => {
    setInfoSteps(current => current.map((step, candidateStepIndex) => {
      if (candidateStepIndex !== stepIndex) return step;
      const targetIndex = partIndex + direction;
      if (targetIndex < 0 || targetIndex >= step.descriptionParts.length) return step;
      const descriptionParts = [...step.descriptionParts];
      [descriptionParts[partIndex], descriptionParts[targetIndex]] = [descriptionParts[targetIndex], descriptionParts[partIndex]];
      return { ...step, descriptionParts };
    }));
  };

  const descriptionPartsForStep = (step: EditableQuestStep) => {
    return step.descriptionParts
      .map(part => ({ type: part.type, content: part.content.trim() }))
      .filter(part => part.content);
  };

  const saveStarInfo = async () => {
    if (!selectedSkill || !infoTitle.trim()) return;
    try {
      setBusy(true);
      setError('');
      await axios.put(`/api/skills/${selectedSkill._id}`, {
        title: infoTitle.trim(),
        description: infoDescription.trim() || infoTitle.trim(),
        constellationLabel: infoLabel.trim() || null,
        nodePreview: {
          imageUrl: infoImageUrl.trim() || undefined,
          summary: infoSummary.trim() || undefined,
          outcomes: infoOutcomes.split('\n').map(value => value.trim()).filter(Boolean),
          actionLabel: selectedSkill.nodePreview?.actionLabel || (selectedSkill.mapNodeRole === 'topic-gateway' ? 'View Path' : 'Open Quest')
        },
        subQuests: infoSteps.filter(step => step.title.trim()).map(step => ({
          externalId: step.externalId,
          title: step.title.trim(),
          description: descriptionPartsForStep(step)
            .filter(part => part.type === 'Text')
            .map(part => part.content)
            .join('\n'),
          descriptionParts: descriptionPartsForStep(step),
          type: step.type.trim() || 'ImageNote'
        }))
      });
      closeModal();
      await onSkillsChanged();
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Unable to update star info.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="constellation-admin constellation-admin-simple" aria-label="Constellation editor">
      <header className="constellation-admin-simple-bar">
        <div className="constellation-admin-simple-navigation">
          {selectedMap?.scope === 'topic' && selectedMap.parentMapId && <button type="button" className="constellation-admin-icon" onClick={() => switchMap(selectedMap.parentMapId!)} title="Back to discipline" aria-label="Back to discipline"><ArrowLeft size={18} aria-hidden="true" /></button>}
          <label>
            <span>Discipline</span>
            <select value={selectedMap?.scope === 'topic' ? selectedMap.parentMapId || '' : selectedMapId} onChange={event => switchMap(event.target.value)} aria-label="Choose discipline">
              {disciplineMaps.map(map => <option value={map._id} key={map._id}>{map.name}</option>)}
              {disciplineMaps.length === 0 && <option value="">No disciplines</option>}
            </select>
          </label>
          <button type="button" className="constellation-admin-create-discipline" onClick={() => openModal('map')} aria-label="Create discipline" title="Create discipline">
            <Plus size={17} aria-hidden="true" />
            <span>Create discipline</span>
          </button>
        </div>
        {selectedMap && <div className="constellation-admin-map-state" aria-label="Publication status">
          <span className={selectedMap.isActive ? 'is-published' : 'is-draft'}>{selectedMap.isActive ? 'Published' : 'Draft'}</span>
          <button type="button" className="constellation-admin-state-action" disabled={busy} onClick={() => void updateMapVisibility()}>{selectedMap.isActive ? 'Unpublish' : 'Publish'}</button>
        </div>}
        <div className={`constellation-admin-actions ${showMobileActions ? 'is-open' : ''}`}>
          <button type="button" className="constellation-admin-actions-toggle" aria-expanded={showMobileActions} onClick={() => setShowMobileActions(current => !current)}>Actions <ChevronDown size={16} aria-hidden="true" /></button>
          <div className="constellation-admin-actions-menu">
            <button type="button" className="constellation-admin-primary" disabled={!selectedMap} onClick={() => openModal('star')}><Sparkles size={17} aria-hidden="true" /> Create star</button>
            {selectedMap?.scope === 'topic' && <button type="button" className="constellation-admin-secondary" onClick={() => openModal('import')}><Download size={16} aria-hidden="true" /> Import quest</button>}
            {selectedMap && <div className="constellation-admin-map-menu" ref={mapMenuRef}>
              <button type="button" className="constellation-admin-icon" aria-label="More constellation actions" title="More constellation actions" aria-expanded={showMapMenu} onClick={() => setShowMapMenu(current => !current)}><MoreHorizontal size={18} aria-hidden="true" /></button>
              {showMapMenu && <div className="constellation-admin-dropdown-menu">
                <button type="button" className="is-danger" disabled={busy} onClick={() => { setShowMapMenu(false); void deleteSelectedMap(); }}><Trash2 size={16} aria-hidden="true" /> Delete constellation</button>
              </div>}
            </div>}
          </div>
        </div>
      </header>

      {error && <div className="constellation-admin-error" role="alert">{error}</div>}
      {connectionSourceId && <div className="constellation-admin-connect-status" role="status">
        <span><Link2 size={15} aria-hidden="true" /> Connect from <strong>{mapSkills.find(skill => skill._id === connectionSourceId)?.constellationLabel || mapSkills.find(skill => skill._id === connectionSourceId)?.title}</strong></span>
        <button type="button" onClick={() => setConnectionSourceId('')}>Done</button>
      </div>}

      {selectedMap ? (
        <ConstellationLayoutEditor
          map={selectedMap}
          parentMapName={selectedMap.parentMapId ? maps.find(map => map._id === selectedMap.parentMapId)?.name : undefined}
          skills={mapSkills}
          positions={draftPositions}
          dirtySkillIds={dirtySkillIds}
          selectedSkillId={selectedSkillId}
          disabled={busy}
          onSelectSkill={setSelectedSkillId}
          onTapSkill={connectionSourceId ? skillId => { void toggleConnection(connectionSourceId, skillId); } : undefined}
          onActivateSkill={activateStar}
          onContextMenuSkill={openStarContextMenu}
          onPositionChange={(skillId, position) => setDraftPositions(current => ({ ...current, [skillId]: position }))}
          onCancel={resetLayout}
          onSave={saveLayout}
        />
      ) : <div className="constellation-admin-simple-empty"><div><strong>No disciplines yet</strong><span>Create the first top-level constellation to begin.</span><button type="button" className="constellation-admin-primary" onClick={() => openModal('map')}><Plus size={17} aria-hidden="true" /> Create first discipline</button></div></div>}

      {starContextMenu && (() => {
        const skill = mapSkills.find(candidate => candidate._id === starContextMenu.skillId);
        if (!skill) return null;
        return <div ref={starContextMenuRef} className="constellation-star-context-menu" role="menu" aria-label={`${skill.constellationLabel || skill.title} actions`} style={{ left: starContextMenu.x, top: starContextMenu.y }}>
          <div className="constellation-star-context-heading"><strong>{skill.constellationLabel || skill.title}</strong><span>{skill.mapNodeRole || 'lesson'}</span></div>
          <button type="button" role="menuitem" onClick={() => { const opener = document.querySelector<SVGGElement>(`[data-skill-id="${skill._id}"]`); setStarContextMenu(null); openSkillInfo(skill, opener); }}><Pencil size={16} aria-hidden="true" /> {skill.nodeType === 'quest' || skill.externalQuestId || (skill.subQuests?.length || 0) > 0 ? 'Edit quest' : 'Edit star'}</button>
          <button type="button" role="menuitem" onClick={() => beginConnectingFrom(skill._id)}><Link2 size={16} aria-hidden="true" /> Connect from here</button>
          {selectedMap?.scope === 'discipline' && <button type="button" role="menuitem" onClick={() => { setStarContextMenu(null); void activateStar(skill._id); }}><ExternalLink size={16} aria-hidden="true" /> Open topic</button>}
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setStarContextMenu(null); void deleteStar(skill); }}><Trash2 size={16} aria-hidden="true" /> Delete star</button>
        </div>;
      })()}

      {(showMapForm || showStarForm || showInfoForm || showImportForm) && (
        <div className="constellation-admin-modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <div ref={modalRef} className={`constellation-admin-modal constellation-admin-simple-modal ${showImportForm ? 'is-import' : ''} ${showInfoForm && (selectedSkill?.nodeType === 'quest' || selectedSkill?.externalQuestId || infoSteps.length > 0) ? 'has-steps' : ''}`} role="dialog" aria-modal="true" aria-labelledby="simple-modal-title" onMouseDown={event => event.stopPropagation()}>
            <header>
              <h3 id="simple-modal-title">{showImportForm ? 'Import quest from StarMaster' : showInfoForm ? selectedSkill?.nodeType === 'quest' || selectedSkill?.externalQuestId || infoSteps.length > 0 ? 'Edit quest' : 'Edit star' : showStarForm ? 'Create star' : mapForm.scope === 'topic' ? `Create ${mapForm.name} topic` : 'Create discipline'}</h3>
              <button type="button" className="constellation-admin-modal-close" aria-label="Close editor" onClick={closeModal}><X size={18} aria-hidden="true" /></button>
            </header>
            {showImportForm ? (
              <div className="constellation-import-quest">
                <div className="constellation-import-destination">
                  <label>Discipline
                    <select value={importDisciplineId} onChange={event => {
                      const disciplineId = event.target.value;
                      setImportDisciplineId(disciplineId);
                      setImportTopicMapId(maps.find(map => map.scope === 'topic' && map.parentMapId === disciplineId)?._id || '');
                    }}>
                      {disciplineMaps.map(map => <option key={map._id} value={map._id}>{map.name}</option>)}
                    </select>
                  </label>
                  <label>Topic
                    <select value={importTopicMapId} onChange={event => setImportTopicMapId(event.target.value)}>
                      {importTopics.map(map => <option key={map._id} value={map._id}>{map.name}</option>)}
                      {importTopics.length === 0 && <option value="">No topics in this discipline</option>}
                    </select>
                  </label>
                </div>
                <div className="constellation-import-filters">
                  <label className="constellation-import-search">
                    <Search size={16} aria-hidden="true" />
                    <input aria-label="Search quests" value={starMasterSearch} onChange={event => setStarMasterSearch(event.target.value)} placeholder="Search quests" />
                  </label>
                  <label className="constellation-import-type">
                    <select aria-label="Filter by quest type" value={starMasterType} onChange={event => setStarMasterType(event.target.value)}>
                      <option value="all">All types</option>
                      {starMasterTypes.map(type => <option value={type} key={type}>{type}</option>)}
                    </select>
                  </label>
                  <div className="constellation-import-tag-filter" ref={starMasterTagMenuRef}>
                    <button
                      type="button"
                      className={starMasterSelectedTagIds.length > 0 || starMasterIncludeNoTags ? 'has-selection' : ''}
                      aria-label={`Filter by tags, ${starMasterSelectedTagIds.length + (starMasterIncludeNoTags ? 1 : 0)} selected`}
                      aria-expanded={showStarMasterTagMenu}
                      onClick={() => setShowStarMasterTagMenu(current => !current)}
                    >
                      <Tags size={15} aria-hidden="true" />
                      <span>{starMasterSelectedTagIds.length > 0 || starMasterIncludeNoTags ? `${starMasterSelectedTagIds.length + (starMasterIncludeNoTags ? 1 : 0)} tags` : 'All tags'}</span>
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                    {showStarMasterTagMenu && (
                      <div className="constellation-import-tag-menu">
                        <label className="constellation-import-tag-search">
                          <Search size={14} aria-hidden="true" />
                          <input aria-label="Search tags" value={starMasterTagSearch} onChange={event => setStarMasterTagSearch(event.target.value)} placeholder="Search tags" autoFocus />
                        </label>
                        <div className="constellation-import-tag-options">
                          <label>
                            <input type="checkbox" checked={starMasterIncludeNoTags} onChange={event => setStarMasterIncludeNoTags(event.target.checked)} />
                            <span className="constellation-import-tag-swatch is-empty" />
                            <span>Untagged</span>
                          </label>
                          {starMasterTagsLoading && <div className="constellation-import-tag-empty">Loading tags...</div>}
                          {!starMasterTagsLoading && filteredStarMasterTags.map(tag => (
                            <label key={tag.id}>
                              <input type="checkbox" checked={starMasterSelectedTagIds.includes(tag.id)} onChange={event => setStarMasterSelectedTagIds(current => event.target.checked
                                ? [...current, tag.id]
                                : current.filter(tagId => tagId !== tag.id))} />
                              <span className="constellation-import-tag-swatch" style={{ backgroundColor: tag.color || '#98a2b3' }} />
                              <span>{tag.name}</span>
                            </label>
                          ))}
                          {!starMasterTagsLoading && filteredStarMasterTags.length === 0 && <div className="constellation-import-tag-empty">No tags found.</div>}
                        </div>
                        {(starMasterSelectedTagIds.length > 0 || starMasterIncludeNoTags) && <button type="button" className="constellation-import-tag-clear" onClick={() => { setStarMasterSelectedTagIds([]); setStarMasterIncludeNoTags(false); }}>Clear tags</button>}
                      </div>
                    )}
                  </div>
                </div>
                {(selectedStarMasterTags.length > 0 || starMasterIncludeNoTags) && (
                  <div className="constellation-import-selected-tags" aria-label="Selected tag filters">
                    {selectedStarMasterTags.map(tag => (
                      <button type="button" key={tag.id} onClick={() => setStarMasterSelectedTagIds(current => current.filter(tagId => tagId !== tag.id))}>
                        <span className="constellation-import-tag-swatch" style={{ backgroundColor: tag.color || '#98a2b3' }} />
                        {tag.name}
                        <X size={12} aria-hidden="true" />
                      </button>
                    ))}
                    {starMasterIncludeNoTags && <button type="button" onClick={() => setStarMasterIncludeNoTags(false)}><span className="constellation-import-tag-swatch is-empty" />Untagged<X size={12} aria-hidden="true" /></button>}
                  </div>
                )}
                <div className="constellation-import-filter-row">
                  <div className="constellation-import-segments" aria-label="Import status filter">
                    {(['all', 'new', 'imported'] as const).map(status => (
                      <button
                        type="button"
                        key={status}
                        aria-pressed={starMasterStatus === status}
                        onClick={() => setStarMasterStatus(status)}
                      >
                        {status === 'all' ? 'All' : status === 'new' ? 'New' : 'Imported before'}
                      </button>
                    ))}
                  </div>
                  <span className="constellation-import-count">Showing {filteredStarMasterItems.length} of {starMasterTotal} quests</span>
                </div>
                <div className="constellation-import-selection-bar">
                  <label>
                    <input type="checkbox" checked={allVisibleQuestsSelected} disabled={selectableVisibleQuestIds.length === 0} onChange={toggleVisibleImportQuests} />
                    <span>{allVisibleQuestsSelected ? 'Clear visible' : 'Select visible'}</span>
                  </label>
                  <strong>{importQuestIds.length} selected</strong>
                  {importQuestIds.length > 0 && <button type="button" onClick={() => setImportQuestIds([])}>Clear selection</button>}
                </div>
                {starMasterError && <div className="constellation-import-error" role="alert">{starMasterError}</div>}
                <div className="constellation-import-list" role="group" aria-label="Choose StarMaster quests" aria-busy={starMasterLoading}>
                  {starMasterLoading && starMasterItems.length === 0 && <div className="constellation-import-empty">Loading quests...</div>}
                  {!starMasterLoading && filteredStarMasterItems.length === 0 && <div className="constellation-import-empty">No quests match these filters.</div>}
                  {filteredStarMasterItems.map(quest => (
                    <label
                      className={`constellation-import-item ${importQuestIds.includes(quest.externalId) ? 'is-selected' : ''}`}
                      key={quest.externalId}
                    >
                      <input type="checkbox" checked={importQuestIds.includes(quest.externalId)} onChange={event => toggleImportQuest(quest.externalId, event.target.checked)} aria-label={`Select ${quest.title}`} />
                      <span className="constellation-import-image">
                        {quest.imageUrl ? <img src={quest.imageUrl} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} /> : <Sparkles size={20} aria-hidden="true" />}
                      </span>
                      <span className="constellation-import-copy">
                        <strong>{quest.title}</strong>
                        {quest.description && <span className="constellation-import-description">{quest.description}</span>}
                        <span>{[quest.type, quest.subQuestCount ? `${quest.subQuestCount} steps` : '', quest.imported ? 'Imported before · Can import again' : ''].filter(Boolean).join(' · ')}</span>
                        {quest.tags && quest.tags.length > 0 && <span className="constellation-import-item-tags">{quest.tags.slice(0, 4).map(tag => <span key={tag.id}><i style={{ backgroundColor: tag.color || '#98a2b3' }} />{tag.name}</span>)}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                {starMasterPage < starMasterTotalPages && (
                  <button type="button" className="constellation-import-load" disabled={starMasterLoading} onClick={() => void loadStarMasterItems(starMasterPage + 1, true)}>
                    {starMasterLoading ? 'Loading...' : 'Load more quests'}
                  </button>
                )}
              </div>
            ) : showInfoForm ? (
              <div className="constellation-info-editor">
                <div className="constellation-info-tabs" role="tablist" aria-label="Quest editor sections">
                  <button type="button" role="tab" aria-selected={infoTab === 'details'} onClick={() => setInfoTab('details')}>Details</button>
                  {(selectedSkill?.nodeType === 'quest' || selectedSkill?.externalQuestId || infoSteps.length > 0) && <button type="button" role="tab" aria-selected={infoTab === 'steps'} onClick={() => setInfoTab('steps')}>Quest steps <span>{infoSteps.length}</span></button>}
                </div>
                {infoTab === 'details' ? (
                  <div className="constellation-info-details" role="tabpanel">
                    <section>
                      <header><div><h4>Identity</h4><p>How this star is named in the editor and constellation.</p></div></header>
                      <div className="constellation-info-field-grid">
                        <label>Name<input value={infoTitle} onChange={event => setInfoTitle(event.target.value)} /></label>
                        <label>Short label <input value={infoLabel} onChange={event => setInfoLabel(event.target.value)} placeholder="Optional" /></label>
                        <label className="is-full">Description<textarea rows={3} value={infoDescription} onChange={event => setInfoDescription(event.target.value)} onKeyDown={handleRichTextKeyDown} /></label>
                      </div>
                    </section>
                    <section>
                      <header><div><h4>Player preview</h4><p>What learners see before opening this quest.</p></div></header>
                      <div className="constellation-info-preview-layout">
                        <span className="constellation-info-image-preview">
                          {infoImageUrl ? <img src={infoImageUrl} alt="Star preview" /> : <ImagePlus size={24} aria-hidden="true" />}
                        </span>
                        <div className="constellation-info-field-grid">
                          <label className="is-full">Star image URL<input value={infoImageUrl} onChange={event => setInfoImageUrl(event.target.value)} /></label>
                          <label className="is-full">Preview summary<textarea rows={2} value={infoSummary} onChange={event => setInfoSummary(event.target.value)} /></label>
                          <label className="is-full">Outcomes<textarea rows={3} value={infoOutcomes} onChange={event => setInfoOutcomes(event.target.value)} placeholder="One outcome per line" /></label>
                        </div>
                      </div>
                    </section>
                  </div>
                ) : (
                  <section className="constellation-step-workspace" role="tabpanel" aria-labelledby="quest-steps-heading">
                    <aside className="constellation-step-navigator">
                      <header><div><h4 id="quest-steps-heading">Quest steps</h4><span>{infoSteps.length}</span></div></header>
                      <div className="constellation-step-nav-list">
                        {infoSteps.map((step, index) => (
                          <div className={`constellation-step-nav-item ${selectedInfoStepIndex === index ? 'is-active' : ''}`} key={step.externalId || `new-step-${index}`}>
                            <button type="button" onClick={() => setSelectedInfoStepIndex(index)}><span>{index + 1}</span><strong>{step.title || 'Untitled step'}</strong><small>{step.descriptionParts.length} blocks</small></button>
                            <button type="button" className="constellation-step-nav-delete" aria-label={`Delete step ${index + 1}`} title={`Delete step ${index + 1}`} onClick={() => removeInfoStep(index)}><Trash2 size={14} aria-hidden="true" /></button>
                          </div>
                        ))}
                        {infoSteps.length === 0 && <div className="constellation-step-empty">No steps yet.</div>}
                      </div>
                      <button type="button" className="constellation-step-add-wide" onClick={addInfoStep}><Plus size={15} aria-hidden="true" /> Add step</button>
                    </aside>
                    <div className="constellation-step-stage">
                      {infoSteps[selectedInfoStepIndex] ? (() => {
                        const step = infoSteps[selectedInfoStepIndex];
                        const index = selectedInfoStepIndex;
                        return <article className="constellation-step-item" key={step.externalId || `active-step-${index}`}>
                          <div className="constellation-step-stage-heading"><div><span>Step {index + 1}</span><h4>{step.title || 'Untitled step'}</h4></div></div>
                          <label>Title<input aria-label={`Step ${index + 1} title`} value={step.title} onChange={event => updateInfoStep(index, { title: event.target.value })} /></label>
                          <details className="constellation-step-advanced"><summary>Advanced</summary><label>Step type<input aria-label={`Step ${index + 1} type`} value={step.type} onChange={event => updateInfoStep(index, { type: event.target.value })} /></label></details>
                          <div className="constellation-step-content">
                            <div className="constellation-step-content-heading"><strong>Content</strong><span>{step.descriptionParts.length} blocks</span></div>
                            {step.descriptionParts.length === 0 && <div className="constellation-step-content-empty">Add text or an image to this step.</div>}
                            {step.descriptionParts.map((part, partIndex) => (
                              <div className={`constellation-step-content-row is-${part.type.toLowerCase()}`} key={`${part.type}-${partIndex}`}>
                                <div className="constellation-step-content-label">{part.type === 'Image' ? <ImagePlus size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}<span>{part.type === 'Image' ? 'Image' : 'Text'}</span></div>
                                {part.type === 'Image' ? <div className="constellation-step-image-field"><span className="constellation-step-image-preview">{part.content ? <img src={part.content} alt="" /> : <ImagePlus size={17} aria-hidden="true" />}</span><input aria-label={`Step ${index + 1} content ${partIndex + 1} image`} value={part.content} onChange={event => updateStepPart(index, partIndex, event.target.value)} placeholder="Image URL" /></div> : <textarea aria-label={`Step ${index + 1} content ${partIndex + 1} text`} rows={4} value={part.content} onChange={event => updateStepPart(index, partIndex, event.target.value)} onKeyDown={handleRichTextKeyDown} placeholder="Write this part of the step" />}
                                <div className="constellation-step-content-actions">
                                  <button type="button" className="constellation-admin-icon" title="Move block up" aria-label={`Move step ${index + 1} content ${partIndex + 1} up`} disabled={partIndex === 0} onClick={() => moveStepPart(index, partIndex, -1)}><ArrowUp size={14} aria-hidden="true" /></button>
                                  <button type="button" className="constellation-admin-icon" title="Move block down" aria-label={`Move step ${index + 1} content ${partIndex + 1} down`} disabled={partIndex === step.descriptionParts.length - 1} onClick={() => moveStepPart(index, partIndex, 1)}><ArrowDown size={14} aria-hidden="true" /></button>
                                  <button type="button" className="constellation-admin-icon is-danger" title="Remove block" aria-label={`Remove step ${index + 1} content ${partIndex + 1}`} onClick={() => updateInfoStep(index, { descriptionParts: step.descriptionParts.filter((_, candidateIndex) => candidateIndex !== partIndex) })}><Trash2 size={14} aria-hidden="true" /></button>
                                </div>
                              </div>
                            ))}
                            <div className="constellation-step-content-add"><button type="button" onClick={() => updateInfoStep(index, { descriptionParts: [...step.descriptionParts, { type: 'Text', content: '' }] })}><FileText size={15} aria-hidden="true" /> Add text</button><button type="button" onClick={() => updateInfoStep(index, { descriptionParts: [...step.descriptionParts, { type: 'Image', content: '' }] })}><ImagePlus size={15} aria-hidden="true" /> Add image</button></div>
                          </div>
                        </article>;
                      })() : <div className="constellation-step-stage-empty"><FileText size={24} aria-hidden="true" /><strong>No step selected</strong><button type="button" onClick={addInfoStep}>Create first step</button></div>}
                    </div>
                  </section>
                )}
              </div>
            ) : showStarForm ? (
              <div className="constellation-admin-form-grid is-single">
                <label>Star name<input value={starTitle} onChange={event => setStarTitle(event.target.value)} autoComplete="off" /></label>
              </div>
            ) : (
              <div className="constellation-create-discipline-form">
                <p>A discipline is a top-level constellation, such as Programming, Unity Development, or Game Art.</p>
                <label>Discipline name<input value={mapForm.name} onChange={event => setMapForm(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Game Design" autoComplete="off" /></label>
              </div>
            )}
            <footer>
              <button type="button" onClick={closeModal}>Cancel</button>
              <button type="button" className="constellation-admin-primary" disabled={busy || (showImportForm ? importQuestIds.length === 0 || !importTopicMapId : showInfoForm ? !infoTitle.trim() : showStarForm ? !starTitle.trim() : !mapForm.name.trim())} onClick={showImportForm ? importStarMasterQuests : showInfoForm ? saveStarInfo : showStarForm ? createStar : saveMap}>{showImportForm ? busy ? `Importing ${importQuestIds.length}...` : `Import ${importQuestIds.length} ${importQuestIds.length === 1 ? 'quest' : 'quests'}` : showInfoForm ? 'Save' : showStarForm ? 'Create' : busy ? 'Creating...' : 'Create discipline'}</button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

export default ConstellationAdmin;
