import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import './MainMenu.css';

interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  isAdmin: boolean;
  role: 'user' | 'admin' | 'super-admin';
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
  treePosition?: {
    x: number;
    y: number;
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

interface GuildMemberProgress {
  userId: string;
  name: string;
  avatar: string | null;
  progress: number;
  isCurrentUser: boolean;
  rank: number;
}

interface GuildProgress {
  guildId: string;
  name: string;
  memberCount: number;
  progress: number;
  rank: number;
}

interface ProgressionLeaderboard {
  totalSkills: number;
  currentGuild: { id: string; name: string } | null;
  guildMembers: GuildMemberProgress[];
  guilds: GuildProgress[];
}

interface InventoryItem {
  _id: string;
  shopItemId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  quantity: number;
  externalSource?: 'office-catalog';
  externalItemId?: string;
  externalItemType?: string;
  externalRarity?: string;
  isUsable: boolean;
  purchasedAt: string;
}

interface GachaReward {
  itemId?: {
    _id?: string;
    name?: string;
    icon?: string;
    rarity?: string;
    type?: string;
  };
  amountByInventoryId?: Record<string, number[]>;
}

function MainMenu() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [customPhrase] = useState<string>('"The only way to do great work is to love what you do. If you haven\'t found it yet, keep looking. Don\'t settle."');
  const [showGuildSelection, setShowGuildSelection] = useState(false);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');

  // User stats
  const [assetPoints, setAssetPoints] = useState(0);
  const [assetPointName, setAssetPointName] = useState('Asset Point'); // Custom name from guild
  const [voiceMinutesToday, setVoiceMinutesToday] = useState(0);
  const [totalVoiceMinutes, setTotalVoiceMinutes] = useState(0);

  // Skill Tree states
  const [skills, setSkills] = useState<Skill[]>([]);
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
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [unlockedSkills, setUnlockedSkills] = useState<string[]>([]);
  const [completedQuestSteps, setCompletedQuestSteps] = useState<string[]>([]);
  const [completedQuests, setCompletedQuests] = useState<string[]>([]);
  const [pendingApprovalSkills, setPendingApprovalSkills] = useState<string[]>([]);
  const [expandedQuestSteps, setExpandedQuestSteps] = useState<string[]>([]);
  const [expandedImage, setExpandedImage] = useState<{ src: string; alt: string } | null>(null);
  const [showApprovalRequestModal, setShowApprovalRequestModal] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');
  const [progressionLeaderboard, setProgressionLeaderboard] = useState<ProgressionLeaderboard | null>(null);
  const [loadingProgression, setLoadingProgression] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [usingInventoryItemId, setUsingInventoryItemId] = useState<string | null>(null);
  const [hamsterQuestLinked, setHamsterQuestLinked] = useState(false);
  const [inventorySyncWarning, setInventorySyncWarning] = useState('');
  const [gachaResult, setGachaResult] = useState<{ message: string; rewards: GachaReward[] } | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadMainMenu();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const handleFocus = () => {
        refreshMainMenuStatus();
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
      setAssetPoints(stats.assetPoints || 0);
      setAssetPointName(stats.assetPointName || 'Asset Point');
      setVoiceMinutesToday(stats.voiceMinutesToday || 0);
      setTotalVoiceMinutes(stats.totalVoiceMinutes || 0);
    }
    setUnlockedSkills(data.unlockedSkills || []);
    const questProgress = data.questProgress || {};
    setCompletedQuestSteps((questProgress.completedSteps || []).map(
      (step: { skillId: string; stepId: string }) => `${step.skillId}:${step.stepId}`
    ));
    setCompletedQuests(questProgress.completedQuests || []);
    setPendingApprovalSkills(questProgress.pendingApprovalSkillIds || []);
    setProgressionLeaderboard(data.progressionLeaderboard || null);
  };

  const loadMainMenu = async () => {
    try {
      setLoadingProgression(true);
      setLoadingInventory(true);
      const response = await axios.get('/api/mainmenu/bootstrap');
      if (!response.data.success) return;
      setSkills(response.data.skills || []);
      applyMainMenuStatus(response.data);
      const inventory = response.data.inventory || {};
      setInventoryItems(inventory.items || []);
      setHamsterQuestLinked(Boolean(inventory.hamsterQuestLinked));
      setInventorySyncWarning(inventory.syncWarning || '');
    } catch (error) {
      console.error('Error loading Main Menu:', error);
      setInventorySyncWarning('Inventory is temporarily unavailable.');
    } finally {
      setLoadingProgression(false);
      setLoadingInventory(false);
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

  const loadInventory = async (refresh = false) => {
    try {
      setLoadingInventory(true);
      const response = await axios.get('/api/inventory', { params: refresh ? { refresh: 'true' } : undefined });
      if (response.data.success) {
        setInventoryItems(response.data.items || []);
        setHamsterQuestLinked(Boolean(response.data.hamsterQuestLinked));
        setInventorySyncWarning(response.data.syncWarning || '');
      }
    } catch (error) {
      console.error('Error loading inventory:', error);
      setInventorySyncWarning('Inventory is temporarily unavailable.');
    } finally {
      setLoadingInventory(false);
    }
  };

  const linkHamsterQuest = async (providedUrl?: string) => {
    try {
      const url = providedUrl || (await axios.get('/api/inventory/hamsterquest/link-url')).data.url;
      if (url) window.location.assign(url);
    } catch (error) {
      console.error('Error starting HamsterQuest link:', error);
      alert('Unable to start HamsterQuest login');
    }
  };

  const handleUseInventoryItem = async (item: InventoryItem) => {
    if (!item.isUsable || usingInventoryItemId) return;
    if (!hamsterQuestLinked) {
      await linkHamsterQuest();
      return;
    }

    try {
      setUsingInventoryItemId(item._id);
      const response = await axios.post(`/api/inventory/${item._id}/use`);
      setInventoryItems(response.data.items || []);
      if (response.data.itemType === 'GachaItem') {
        setGachaResult({
          message: response.data.message || 'Gacha opened',
          rewards: response.data.result?.rewards || []
        });
      } else {
        alert(response.data.message || 'Item used successfully');
      }
    } catch (error: any) {
      if (error.response?.data?.code === 'HAMSTERQUEST_LINK_REQUIRED') {
        setHamsterQuestLinked(false);
        await linkHamsterQuest(error.response.data.linkUrl);
        return;
      }
      alert(error.response?.data?.error || 'Unable to use this item');
      await loadInventory();
    } finally {
      setUsingInventoryItemId(null);
    }
  };

  const getGachaRewardQuantity = (reward: GachaReward) =>
    Object.values(reward.amountByInventoryId || {}).flat().reduce((total, amount) => total + Number(amount || 0), 0);

  const handleSkillClick = (skill: Skill) => {
    if (skill.isAdvancedLocked) {
      alert('อันนี้เป็นเนื้อหา Advance สอนแค่ใน Starway/Starlight น้าาา');
      return;
    }
    setSelectedSkill(skill);
    setShowSkillModal(true);
  };

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

  const hasCompletedAllQuestSteps = (skill: Skill): boolean => {
    const steps = skill.subQuests || [];
    return steps.every((step, index) =>
      completedQuestSteps.includes(`${skill._id}:${step.externalId || `step-${index}`}`)
    );
  };

  const canUnlockSkill = (skill: Skill): boolean => {
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
    if (!isAdventure && !isMarker && assetPoints < skill.cost) {
      return false;
    }

    return true;
  };

  const handleUnlockSkill = async () => {
    if (!selectedSkill) return;

    const isQuest = isQuestSkill(selectedSkill);
    
    if (isQuest) {
      if (!hasCompletedAllQuestSteps(selectedSkill)) {
        alert('Complete every quest step before requesting approval.');
        return;
      }
      setShowApprovalRequestModal(true);
      return;
    }

    try {
      const response = await axios.post(`/api/skills/${selectedSkill._id}/unlock`);
      if (response.data.success) {
        await refreshMainMenuStatus();
        // Close modal
        setShowSkillModal(false);
        setSelectedSkill(null);
        // Don't show notification for Adventure and Marker nodes
        const isAdventure = selectedSkill.nodeType === 'adventure' || selectedSkill.nodeColor === 'white';
        const isMarker = selectedSkill.nodeType === 'marker' || selectedSkill.nodeColor === 'yellow';
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
        alert('Approval request sent successfully!');
        setPendingApprovalSkills(current => current.includes(selectedSkill._id) ? current : [...current, selectedSkill._id]);
        setShowApprovalRequestModal(false);
        setApprovalMessage('');
        setShowSkillModal(false);
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

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) {
        if (listItems.length > 0) {
          elements.push(
            <ul key={key++} style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
              {listItems}
            </ul>
          );
          listItems = [];
        }
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
            {parseInlineMarkdown(text, key)}
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
            {parseInlineMarkdown(text, key)}
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
            {parseInlineMarkdown(text, key)}
          </h1>
        );
        return;
      }

      // Bullet points
      if (trimmedLine.startsWith('- ')) {
        const text = trimmedLine.substring(2);
        listItems.push(
          <li key={listKey++} style={{ marginBottom: '4px', fontSize: '1.4rem', lineHeight: '1.6' }}>
            {parseInlineMarkdown(text, key * 1000 + listKey)}
          </li>
        );
        return;
      }

      // Regular paragraph - close list if open
      if (listItems.length > 0) {
        elements.push(
          <ul key={key++} style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
            {listItems}
          </ul>
        );
        listItems = [];
      }

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
          const parsed = parseInlineMarkdown(textBefore, key * 1000 + lineParts.length);
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
        const parsed = parseInlineMarkdown(remainingText, key * 1000 + lineParts.length);
        lineParts.push(...parsed);
      } else if (!hasImages) {
        // No images found, parse entire line
        const parsed = parseInlineMarkdown(trimmedLine, key * 1000);
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

    // Close any open list
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
          {listItems}
        </ul>
      );
    }

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

  // Parse inline markdown (links, bold, italic)
  const parseInlineMarkdown = (text: string, baseKey: number): (string | JSX.Element)[] => {
    const parts: (string | JSX.Element)[] = [];
    let key = baseKey;
    let lastIndex = 0;

    // Match links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;

    while ((match = linkRegex.exec(text)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      // Add the link
      const linkText = match[1];
      const linkUrl = match[2];
      parts.push(
        <a
          key={key++}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#4e98ff',
            textDecoration: 'underline',
            fontWeight: '500'
          }}
        >
          {linkText}
        </a>
      );
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [text];
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

  const getAvatarUrl = (userId = user?.id || '0', avatar: string | null = user?.avatar || null) => {
    if (avatar) {
      return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png`;
    }
    return `https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(userId, 10)) % 5}.png`;
  };

  const getProgressPercent = (progress: number) =>
    progressionLeaderboard?.totalSkills ? Math.min(100, Math.round((progress / progressionLeaderboard.totalSkills) * 100)) : 0;

  const formatGuildProgress = (progress: number) =>
    Number.isInteger(progress) ? String(progress) : progress.toFixed(1);

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
        <h1 className="topbar-title">GuGame 3</h1>
        <p className="topbar-phrase">{customPhrase}</p>
      </div>

      {/* Middle Section */}
      <div className="content-grid">
        {/* User Profile Card */}
        <div className="user-card">
          <div className="user-header">
            <div className="user-avatar">
              <img src={getAvatarUrl()} alt={user?.username || 'User'} />
            </div>
            <div className="user-info">
              <h2 className="user-name">{user?.username || 'Username'}</h2>
              <p className="user-details">
                {user?.email || 'Username@gmail.com'} | User ID : {user?.id || 'asdafgaljhgalghoigio'}
                {user?.role && <span style={{ marginLeft: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  | Role: {user.role === 'super-admin' ? '🔐 SUPER-ADMIN' : user.role === 'admin' ? '⚡ ADMIN' : '👤 USER'}
                </span>}
              </p>
            </div>
          </div>

          <div className="user-stats">
            <div className="stat-item">
              <span className="stat-label">{assetPointName} :</span>
              <span className="stat-value">{assetPoints}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Voice Today :</span>
              <span className="stat-value">{voiceMinutesToday}m</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Voice :</span>
              <span className="stat-value">{totalVoiceMinutes}m</span>
            </div>
          </div>
          
        </div>

        {/* Navigation Cards */}
        <div className="nav-cards">
          {/* Shop Card */}
          <div className="nav-item shop" onClick={() => navigate('/shop')}>
            <div className="nav-icon-wrapper">
              <span className="nav-icon-text">🛒</span>
            </div>
            <span className="nav-text">Shop</span>
          </div>

          {/* Admin Card - Only visible to admin and super-admin */}
          {user && (user.role === 'admin' || user.role === 'super-admin') && (
            <div className="nav-item admin" onClick={() => navigate('/admin')}>
              <div className="nav-icon-wrapper">
                <span className="nav-icon-text">
                  {user.role === 'super-admin' ? '🔐' : '⚡'}
                </span>
              </div>
              <span className="nav-text">Admin Panel</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Panel */}
      <div className="main-panel">
        {/* Header with Logout */}
        <div className="panel-header">
          <h2 className="panel-title">Quest Tree</h2>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {/* Content */}
        <div className="panel-content">
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
        </div>
      </div>

      <section className="progression-leaderboard" aria-labelledby="progression-title">
        <div className="progression-header">
          <div>
            <h2 id="progression-title" className="panel-title">Progression Leaderboard</h2>
            <p className="progression-subtitle">Unlocked quests across the active tree</p>
          </div>
          {progressionLeaderboard && (
            <span className="progression-total">{progressionLeaderboard.totalSkills} quests available</span>
          )}
        </div>

        <div className="progression-grid">
          <div className="progression-column">
            <div className="progression-column-heading">
              <div>
                <h3>Your Guild</h3>
                <p>{progressionLeaderboard?.currentGuild?.name || 'Guild progress'}</p>
              </div>
            </div>

            <div className="progression-list">
              {loadingProgression ? (
                <div className="progression-empty">Loading progression...</div>
              ) : !progressionLeaderboard?.currentGuild ? (
                <div className="progression-empty">Join a guild to see member progression.</div>
              ) : progressionLeaderboard.guildMembers.length === 0 ? (
                <div className="progression-empty">No members found.</div>
              ) : (
                progressionLeaderboard.guildMembers.map((entry) => (
                  <div key={entry.userId} className={`progression-entry ${entry.isCurrentUser ? 'is-current-user' : ''}`}>
                    <span className="progression-rank">{entry.rank}</span>
                    <img
                      className="progression-avatar"
                      src={getAvatarUrl(entry.userId, entry.avatar)}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.src = `https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(entry.userId, 10)) % 5}.png`;
                      }}
                    />
                    <div className="progression-entry-main">
                      <div className="progression-entry-name">
                        <span>{entry.name}</span>
                        {entry.isCurrentUser && <span className="current-user-badge">You</span>}
                      </div>
                      <div className="progression-meter"><span style={{ width: `${getProgressPercent(entry.progress)}%` }} /></div>
                    </div>
                    <strong className="progression-value">{entry.progress}<span>/{progressionLeaderboard.totalSkills}</span></strong>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="progression-column">
            <div className="progression-column-heading">
              <div>
                <h3>Guilds</h3>
                <p>Average quest progress per member</p>
              </div>
            </div>

            <div className="progression-list">
              {loadingProgression ? (
                <div className="progression-empty">Loading progression...</div>
              ) : !progressionLeaderboard?.guilds.length ? (
                <div className="progression-empty">No guild progress yet.</div>
              ) : (
                progressionLeaderboard.guilds.map((entry) => (
                  <div key={entry.guildId} className="progression-entry guild-progression-entry">
                    <span className="progression-rank">{entry.rank}</span>
                    <span className="guild-progress-mark">G</span>
                    <div className="progression-entry-main">
                      <div className="progression-entry-name"><span>{entry.name}</span></div>
                      <span className="guild-member-count">{entry.memberCount} member{entry.memberCount === 1 ? '' : 's'}</span>
                    </div>
                    <strong className="progression-value">{formatGuildProgress(entry.progress)}<span> avg unlocks</span></strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="inventory-section" aria-labelledby="inventory-title">
        <div className="inventory-header">
          <div>
            <h2 id="inventory-title" className="panel-title">Inventory</h2>
            <p>{inventoryItems.reduce((total, item) => total + item.quantity, 0)} items</p>
          </div>
          <button type="button" className="inventory-sync-btn" onClick={() => loadInventory(true)} disabled={loadingInventory}>
            {loadingInventory ? 'Syncing...' : 'Sync'}
          </button>
        </div>

        {inventorySyncWarning && <div className="inventory-warning">{inventorySyncWarning}</div>}

        {loadingInventory ? (
          <div className="inventory-empty">Loading inventory...</div>
        ) : inventoryItems.length === 0 ? (
          <div className="inventory-empty">Your inventory is empty.</div>
        ) : (
          <div className="inventory-grid">
            {inventoryItems.map(item => (
              <article className="inventory-item" key={item._id}>
                <div className="inventory-item-media">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <span aria-hidden="true">?</span>
                  )}
                  <strong>{item.quantity}</strong>
                </div>
                <div className="inventory-item-body">
                  <div className="inventory-item-meta">
                    <span>{item.externalRarity || 'Item'}</span>
                    {item.externalItemType && <span>{item.externalItemType.replace('Item', '')}</span>}
                  </div>
                  <h3>{item.title}</h3>
                  {item.description && <p>{item.description}</p>}
                  {item.isUsable ? (
                    <button
                      type="button"
                      className="inventory-use-btn"
                      disabled={usingInventoryItemId !== null}
                      onClick={() => handleUseInventoryItem(item)}
                    >
                      {usingInventoryItemId === item._id ? 'Using...' : hamsterQuestLinked ? 'Use' : 'Link to use'}
                    </button>
                  ) : (
                    <span className="inventory-stored-label">Stored</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Skill Detail Modal */}
      {showSkillModal && selectedSkill && (
        <div className="guild-selection-modal-overlay" onClick={() => setShowSkillModal(false)}>
          <div className="guild-selection-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="guild-selection-header">
              <h2 className="quest-title">{selectedSkill.title}</h2>
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
                                setShowSkillModal(false);
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
                  onClick={handleUnlockSkill}
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
                onClick={() => {
                  setShowSkillModal(false);
                  setSelectedSkill(null);
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {expandedImage && (
        <div onClick={() => setExpandedImage(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: '24px', background: 'rgba(11, 25, 56, 0.82)', cursor: 'zoom-out' }}>
          <img src={expandedImage.src} alt={expandedImage.alt} onClick={(event) => event.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 18px 60px rgba(0, 0, 0, 0.45)', cursor: 'default' }} />
          <button onClick={() => setExpandedImage(null)} aria-label="Close image" style={{ position: 'fixed', top: '22px', right: '24px', width: '42px', height: '42px', border: 'none', borderRadius: '50%', background: '#fff', color: '#14306d', fontSize: '26px', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {gachaResult && (
        <div className="guild-selection-modal-overlay gacha-result-overlay" onClick={() => setGachaResult(null)}>
          <section className="gacha-result-modal" onClick={(event) => event.stopPropagation()}>
            <div className="gacha-result-header">
              <div>
                <span>Gacha Result</span>
                <h2>{gachaResult.message}</h2>
              </div>
              <button type="button" aria-label="Close gacha result" onClick={() => setGachaResult(null)}>×</button>
            </div>
            <div className="gacha-reward-grid">
              {gachaResult.rewards.length > 0 ? gachaResult.rewards.map((reward, index) => (
                <article className="gacha-reward" key={`${reward.itemId?._id || reward.itemId?.name || 'reward'}-${index}`}>
                  <div className="gacha-reward-media">
                    {reward.itemId?.icon ? <img src={reward.itemId.icon} alt={reward.itemId.name || 'Gacha reward'} /> : <span>?</span>}
                    <strong>{Math.max(1, getGachaRewardQuantity(reward))}</strong>
                  </div>
                  <span>{reward.itemId?.rarity || 'Reward'}</span>
                  <h3>{reward.itemId?.name || 'Mystery reward'}</h3>
                </article>
              )) : <div className="inventory-empty">Reward added to your inventory.</div>}
            </div>
            <button type="button" className="gacha-result-done" onClick={() => setGachaResult(null)}>Done</button>
          </section>
        </div>
      )}

      {/* Approval Request Modal */}
      {showApprovalRequestModal && selectedSkill && (
        <div className="guild-selection-modal-overlay" onClick={() => setShowApprovalRequestModal(false)}>
          <div className="guild-selection-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="guild-selection-header">
              <h2>Send Approval Request</h2>
              <p style={{ fontSize: '1.4rem', color: '#6b7280', marginTop: '8px' }}>
                Request approval for: <strong>{selectedSkill.title}</strong>
              </p>
              <p style={{ fontSize: '1.25rem', color: '#b45309', marginTop: '8px' }}>
                {selectedSkill.nextQuestCost ?? 25} {assetPointName} will be charged after approval to continue to the next quest.
              </p>
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
                📤 Send Request
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
          <div className="guild-selection-modal" onClick={(e) => e.stopPropagation()}>
            <div className="guild-selection-header">
              <h2>Choose Your Guild</h2>
              <p>Please select a guild to join. You can change this later.</p>
            </div>
            
            <div className="guild-selection-content">
              {guilds.length === 0 ? (
                <p className="no-guilds-message">No guilds available. Please contact an administrator.</p>
              ) : (
                <div className="guild-list">
                  {guilds.map((guild) => (
                    <div
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
                    </div>
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
