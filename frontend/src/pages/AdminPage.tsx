import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import './AdminPage.css';

interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  isAdmin: boolean;
  role: 'user' | 'admin' | 'super-admin';
}

interface GuildMember {
  discordId: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  role: 'user' | 'admin' | 'super-admin';
  guildId?: string;
  assetPoints: number;
  techTokens: number;
  voiceMinutesToday: number;
  unlockedSkills?: string[]; // Array of skill IDs the user has unlocked
}

interface Guild {
  _id: string;
  name: string;
  guildLeaderIds?: string[];
  adminIds: string[];
  assetPointName?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface GuildInfo {
  _id: string;
  name: string;
  totalMembers: number;
  totalAssetPoints: number;
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
  minAP?: number;
  maxAP?: number;
  createdAt: string;
  updatedAt: string;
}

interface QuestEditorPoint {
  x: number;
  y: number;
  radius: number;
}

interface QuestEditorEdge {
  source: Skill;
  target: Skill;
  connectionType: 'normal' | 'special';
  hasArrowhead: boolean;
  editable: boolean;
}

interface ApprovalRequest {
  _id: string;
  userId: string;
  skillId: string;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  rewardAP?: number;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    username: string;
    nickname?: string;
    discriminator: string;
    avatar: string | null;
    guildId?: string;
  };
  guild?: {
    _id: string;
    name: string;
  };
  skill?: {
    _id: string;
    title: string;
    description?: string;
    minAP?: number;
    maxAP?: number;
    nextQuestCost?: number;
  };
}

type AdminSection = 'dashboard' | 'guilds' | 'users' | 'skilltree' | 'approvals' | 'images' | 'shop' | 'selection' | 'questselection' | 'preorders' | 'settings';

interface OfficeCatalogItem {
  _id: string;
  name: string;
  description?: string;
  icon?: string;
  type?: string;
  rarity?: string;
  imported: boolean;
  importSettings?: {
    price: number;
    isActive: boolean;
  } | null;
}

interface OfficeQuestCatalogItem {
  _id: string;
  externalId: string;
  title: string;
  description: string;
  type?: string;
  tags: Array<{ externalId: string; name: string; color?: string }>;
  subQuestCount: number;
  imported: boolean;
}

function AdminPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [guildMembers, setGuildMembers] = useState<GuildMember[]>([]);
  const [allUsers, setAllUsers] = useState<GuildMember[]>([]);
  const [showCreateGuild, setShowCreateGuild] = useState(false);
  const [showMemberManagement, setShowMemberManagement] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GuildMember | null>(null);
  const [showSkillProgressModal, setShowSkillProgressModal] = useState(false);
  const [selectedUserForProgress, setSelectedUserForProgress] = useState<GuildMember | null>(null);
  const [userGuildInfo, setUserGuildInfo] = useState<GuildInfo | null>(null);
  const [isGuildLeader, setIsGuildLeader] = useState(false);

  // User section filters
  const [filterGuild, setFilterGuild] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterName, setFilterName] = useState('');

  // Form states
  const [newGuildName, setNewGuildName] = useState('');
  const [newGuildLeaderIds, setNewGuildLeaderIds] = useState<string[]>([]);
  const [newGuildLeaderIdInput, setNewGuildLeaderIdInput] = useState('');
  const [newGuildAssetPointName, setNewGuildAssetPointName] = useState('Asset Point');
  const [assetPointsAmount, setAssetPointsAmount] = useState(0);

  // Skill Tree states
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [showSkillDetail, setShowSkillDetail] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState(false);
  const [skillNodeTypeFilter, setSkillNodeTypeFilter] = useState<string>('all'); // Filter by node type
  const [draggingSkill, setDraggingSkill] = useState<string | null>(null);
  const [tempTreePositions, setTempTreePositions] = useState<{ [key: string]: { x: number; y: number } }>({});
  const [wasDragged, setWasDragged] = useState<{ [key: string]: boolean }>({});
  const [showQuestJsonModal, setShowQuestJsonModal] = useState(false);
  const [questJson, setQuestJson] = useState('');
  const [isImportingQuestJson, setIsImportingQuestJson] = useState(false);
  
  // Zoom and Pan states
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [gridSnap, setGridSnap] = useState(true);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartY, setPanStartY] = useState(0);
  
  // Skill form states
  const [skillTitle, setSkillTitle] = useState('');
  const [skillDescription, setSkillDescription] = useState('');
  const [skillCost, setSkillCost] = useState(0);
  const [skillNextQuestCost, setSkillNextQuestCost] = useState(25);
  const [skillPreviewClip, setSkillPreviewClip] = useState('');
  const [skillContentYouTube, setSkillContentYouTube] = useState('');
  const [skillContentGoogleDrive, setSkillContentGoogleDrive] = useState('');
  const [skillNodeColor, setSkillNodeColor] = useState<'yellow' | 'blue' | 'green' | 'white' | 'purple'>('blue');
  const [skillPrerequisites, setSkillPrerequisites] = useState<string[]>([]);
  const [skillSubQuests, setSkillSubQuests] = useState<Array<{ externalId?: string; title: string; description: string; descriptionParts?: Array<{ type: string; content: string }>; type?: string }>>([]);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [previewOpenStep, setPreviewOpenStep] = useState<number | null>(null);
  const [skillMinAP, setSkillMinAP] = useState<number | undefined>(undefined);
  const [skillMaxAP, setSkillMaxAP] = useState<number | undefined>(undefined);
  const [showPrerequisiteModal, setShowPrerequisiteModal] = useState(false);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [connectionSource, setConnectionSource] = useState<Skill | null>(null);
  const [connectionHasArrowhead, setConnectionHasArrowhead] = useState(true);
  const [editingConnection, setEditingConnection] = useState<{ skillId: string; targetSkillId: string } | null>(null);
  const [drawingConnection, setDrawingConnection] = useState<{ sourceId: string; pointer: { x: number; y: number } } | null>(null);
  const [tempConnectionControls, setTempConnectionControls] = useState<Record<string, Array<{ x: number; y: number }>>>({});
  const editorNodeClickTimeout = useRef<number | null>(null);

  // Approval Request states
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [selectedApprovalRequest, setSelectedApprovalRequest] = useState<ApprovalRequest | null>(null);
  const [approveAPAmount, setApproveAPAmount] = useState(0);
  const [approvalGuildFilter, setApprovalGuildFilter] = useState<string>('all');

  // Image Management states
  const [uploadedImages, setUploadedImages] = useState<Array<{
    filename: string;
    url: string;
    size: number;
    uploadedAt: string;
    modifiedAt: string;
    isUsed: boolean;
  }>>([]);

  // Shop Item Management states
  const [shopItems, setShopItems] = useState<Array<{
    _id: string;
    title: string;
    description?: string;
    price: number;
    imageUrl: string;
    isActive: boolean;
    availableToAllGuilds?: boolean;
    guildIds?: string[];
    externalSource?: 'office-catalog';
    externalItemId?: string;
    externalItemUnavailable?: boolean;
    createdAt: string;
    updatedAt: string;
  }>>([]);
  const [showCreateShopItem, setShowCreateShopItem] = useState(false);
  const [showEditShopItem, setShowEditShopItem] = useState(false);
  const [selectedShopItem, setSelectedShopItem] = useState<{
    _id: string;
    title: string;
    description?: string;
    price: number;
    imageUrl: string;
    isActive: boolean;
    availableToAllGuilds?: boolean;
    guildIds?: string[];
  } | null>(null);
  const [shopItemTitle, setShopItemTitle] = useState('');
  const [shopItemDescription, setShopItemDescription] = useState('');
  const [shopItemPrice, setShopItemPrice] = useState(0);
  const [shopItemImageUrl, setShopItemImageUrl] = useState('');
  const [shopItemIsActive, setShopItemIsActive] = useState(true);
  const [shopItemType, setShopItemType] = useState<'normal' | 'fiction'>('normal');
  const [shopItemProductData, setShopItemProductData] = useState('');
  const [shopItemAvailableToAllGuilds, setShopItemAvailableToAllGuilds] = useState(true);
  const [shopItemGuildIds, setShopItemGuildIds] = useState<string[]>([]);
  const [savingShopGuildScopeId, setSavingShopGuildScopeId] = useState<string | null>(null);
  const [showShopItemAnalytics, setShowShopItemAnalytics] = useState(false);
  const [officeCatalogItems, setOfficeCatalogItems] = useState<OfficeCatalogItem[]>([]);
  const [officeCatalogLoading, setOfficeCatalogLoading] = useState(false);
  const [officeCatalogError, setOfficeCatalogError] = useState('');
  const [officeCatalogSearch, setOfficeCatalogSearch] = useState('');
  const [officeCatalogCategory, setOfficeCatalogCategory] = useState('all');
  const [officeItemPrices, setOfficeItemPrices] = useState<Record<string, number>>({});
  const [importingOfficeItemId, setImportingOfficeItemId] = useState<string | null>(null);
  const [officeQuestItems, setOfficeQuestItems] = useState<OfficeQuestCatalogItem[]>([]);
  const [officeQuestLoading, setOfficeQuestLoading] = useState(false);
  const [officeQuestSyncing, setOfficeQuestSyncing] = useState(false);
  const [officeQuestError, setOfficeQuestError] = useState('');
  const [officeQuestSearch, setOfficeQuestSearch] = useState('');
  const [officeQuestTag, setOfficeQuestTag] = useState('all');
  const [officeQuestSyncedAt, setOfficeQuestSyncedAt] = useState<string | null>(null);
  const [importingOfficeQuestId, setImportingOfficeQuestId] = useState<string | null>(null);
  const [selectedShopItemAnalytics, setSelectedShopItemAnalytics] = useState<{
    itemId: string;
    itemTitle: string;
    purchases: Array<{
      userId: string;
      user: {
        username: string;
        nickname?: string;
        discriminator: string;
        avatar: string | null;
      } | null;
      purchasedAt: string;
      status: string;
    }>;
  } | null>(null);

  // Preorders states
  const [preorders, setPreorders] = useState<Array<{
    _id: string;
    userId: string;
    user: {
      username: string;
      nickname?: string;
      discriminator: string;
      avatar: string | null;
    } | null;
    shopItem: {
      _id: string;
      title: string;
      price: number;
      imageUrl: string;
    };
    status: 'preorder' | 'completed';
    purchasedAt: string;
    createdAt: string;
    updatedAt: string;
  }>>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadGuilds();
      loadAllUsers();
      loadUserGuildInfo();
      // Load skills for admins and super-admins (needed for skill progress display in user management)
      if (user.role === 'admin' || user.role === 'super-admin') {
        loadSkills();
      }
    }
  }, [user]);

  useEffect(() => {
    if (selectedGuild) {
      loadGuildMembers(selectedGuild._id);
    }
  }, [selectedGuild]);

  useEffect(() => {
    if (activeSection === 'approvals' && user) {
      loadApprovalRequests();
    }
    if (activeSection === 'images' && user?.role === 'super-admin') {
      loadUploadedImages();
    }
    if (activeSection === 'shop' && user) {
      loadShopItems();
    }
    if (activeSection === 'selection' && user) {
      loadOfficeCatalog();
    }
    if (activeSection === 'questselection' && user) {
      loadOfficeQuestCatalog();
    }
    if (activeSection === 'preorders' && user) {
      loadPreorders();
    }
  }, [activeSection, user, approvalGuildFilter]);

  // Prevent page scroll when mouse is over skill tree
  useEffect(() => {
    const container = document.querySelector('.skill-tree-container');
    if (!container) return;

    const preventScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    container.addEventListener('wheel', preventScroll, { passive: false });

    return () => {
      container.removeEventListener('wheel', preventScroll);
    };
  }, []);

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/auth/user');
      if (response.data.authenticated && response.data.user) {
        const userData = response.data.user;
        if (userData.role === 'admin' || userData.role === 'super-admin') {
          setUser(userData);
        } else {
          navigate('/mainmenu');
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
      setGuilds(response.data.guilds);
    } catch (error) {
      console.error('Error loading guilds:', error);
    }
  };

  const loadGuildMembers = async (guildId: string) => {
    try {
      const response = await axios.get(`/api/guilds/${guildId}/members`);
      setGuildMembers(response.data.members);
    } catch (error) {
      console.error('Error loading guild members:', error);
    }
  };

  const loadAllUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      setAllUsers(response.data.users);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadUserGuildInfo = async () => {
    try {
      const response = await axios.get('/api/user/guild-info');
      if (response.data.isLeader) {
        setIsGuildLeader(true);
        setUserGuildInfo(response.data.guild);
      }
    } catch (error) {
      console.error('Error loading guild info:', error);
    }
  };

  // ==================== SKILL MANAGEMENT FUNCTIONS ====================

  const loadSkills = async () => {
    try {
      const response = await axios.get('/api/skills');
      setSkills(response.data.skills);
    } catch (error) {
      console.error('Error loading skills:', error);
    }
  };

  const handleExportQuestJson = async () => {
    try {
      const response = await axios.get('/api/admin/quest-tree/json');
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'quest-tree.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting quest tree:', error);
      alert('Failed to export quest tree');
    }
  };

  const handleImportQuestJson = async () => {
    try {
      const parsed = JSON.parse(questJson);
      setIsImportingQuestJson(true);
      const response = await axios.post('/api/admin/quest-tree/import', parsed);
      alert(`${response.data.createdCount} quests imported successfully!`);
      setQuestJson('');
      setShowQuestJsonModal(false);
      await loadSkills();
    } catch (error) {
      console.error('Error importing quest tree:', error);
      alert(error instanceof SyntaxError ? 'The JSON is not valid.' : 'Failed to import quest tree');
    } finally {
      setIsImportingQuestJson(false);
    }
  };

  const handleCreateSkill = async () => {
    if (!skillTitle.trim() || !skillDescription.trim()) {
      alert('Please fill in title and description');
      return;
    }

    try {
      // Process content arrays - always send arrays (even if empty)
      const processedContentYouTube = skillContentYouTube 
        ? skillContentYouTube.split('\n').filter(url => url.trim())
        : [];
      const processedContentGoogleDrive = skillContentGoogleDrive 
        ? skillContentGoogleDrive.split('\n').filter(url => url.trim())
        : [];
      const processedPreviewClip = skillPreviewClip 
        ? skillPreviewClip.split('\n').filter(url => url.trim())
        : [];

      await axios.post('/api/skills', {
        title: skillTitle,
        description: skillDescription,
        cost: skillCost,
        nextQuestCost: skillNodeColor === 'green' ? skillNextQuestCost : undefined,
        previewClip: processedPreviewClip,
        contentYouTube: processedContentYouTube,
        contentGoogleDrive: processedContentGoogleDrive,
        nodeColor: skillNodeColor,
        prerequisites: skillPrerequisites,
        subQuests: skillSubQuests,
        minAP: skillNodeColor === 'green' ? skillMinAP : undefined,
        maxAP: skillNodeColor === 'green' ? skillMaxAP : undefined
      });

      alert('Quest created successfully!');
      resetSkillForm();
      setShowCreateSkill(false);
      loadSkills();
    } catch (error) {
      console.error('Error creating skill:', error);
      alert('Failed to create quest');
    }
  };

  const handleUpdateSkill = async () => {
    if (!selectedSkill || !skillTitle.trim() || !skillDescription.trim()) {
      alert('Please fill in title and description');
      return;
    }

    try {
      // Process content arrays - always send arrays (even if empty) to allow clearing content
      const processedContentYouTube = skillContentYouTube 
        ? skillContentYouTube.split('\n').filter(url => url.trim())
        : [];
      const processedContentGoogleDrive = skillContentGoogleDrive 
        ? skillContentGoogleDrive.split('\n').filter(url => url.trim())
        : [];
      const processedPreviewClip = skillPreviewClip 
        ? skillPreviewClip.split('\n').filter(url => url.trim())
        : [];

      console.log('Updating skill with content:', {
        skillId: selectedSkill._id,
        contentYouTube: processedContentYouTube,
        contentGoogleDrive: processedContentGoogleDrive,
        previewClip: processedPreviewClip
      });

      const response = await axios.put(`/api/skills/${selectedSkill._id}`, {
        title: skillTitle,
        description: skillDescription,
        cost: skillCost,
        nextQuestCost: skillNodeColor === 'green' ? skillNextQuestCost : undefined,
        previewClip: processedPreviewClip,
        contentYouTube: processedContentYouTube,
        contentGoogleDrive: processedContentGoogleDrive,
        nodeColor: skillNodeColor,
        prerequisites: skillPrerequisites,
        subQuests: skillSubQuests,
        minAP: skillNodeColor === 'green' ? skillMinAP : undefined,
        maxAP: skillNodeColor === 'green' ? skillMaxAP : undefined
      });

      console.log('Skill update response:', {
        success: response.data.success,
        skill: response.data.skill,
        contentYouTube: response.data.skill?.contentYouTube,
        contentGoogleDrive: response.data.skill?.contentGoogleDrive
      });

      alert('Quest updated successfully!');
      resetSkillForm();
      setEditingSkill(false);
      setShowSkillDetail(false);
      
      // Reload skills and wait for it to complete
      await loadSkills();
      
      // Also reload the selected skill if it's still selected
      if (selectedSkill) {
        try {
          const skillResponse = await axios.get(`/api/skills/${selectedSkill._id}`);
          console.log('Reloaded skill after update:', {
            contentYouTube: skillResponse.data.skill?.contentYouTube,
            contentGoogleDrive: skillResponse.data.skill?.contentGoogleDrive
          });
        } catch (error) {
          console.error('Error reloading skill:', error);
        }
      }
    } catch (error) {
      console.error('Error updating skill:', error);
      alert('Failed to update quest');
    }
  };

  // Handle adding connection between skills
  const handleAddConnection = async (targetSkill: Skill, connectionType: 'normal' | 'special') => {
    if (!connectionSource) return;

    try {
      console.log('Adding connection:', {
        source: connectionSource.title,
        target: targetSkill.title,
        type: connectionType,
        hasArrowhead: connectionHasArrowhead
      });

      await axios.post(`/api/skills/${connectionSource._id}/connections`, {
        targetSkillId: targetSkill._id,
        connectionType,
        hasArrowhead: connectionHasArrowhead,
        breakPoints: []
      });

      alert('Connection added successfully!');
      setShowConnectionModal(false);
      setConnectionSource(null);
      setConnectionHasArrowhead(true); // Reset to default
      
      // Force reload skills to get updated connections
      await loadSkills();
      console.log('Skills reloaded after adding connection');
    } catch (error) {
      console.error('Error adding connection:', error);
      alert('Failed to add connection');
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!confirm('Are you sure you want to delete this quest?')) {
      return;
    }

    try {
      await axios.delete(`/api/skills/${skillId}`);
      alert('Quest deleted successfully!');
      setShowSkillDetail(false);
      loadSkills();
    } catch (error) {
      console.error('Error deleting skill:', error);
      alert('Failed to delete quest');
    }
  };

  const handleDuplicateSkill = async (skill: Skill) => {
    try {
      const response = await axios.post('/api/skills', {
        title: `Copy of ${skill.title}`,
        description: skill.description,
        cost: skill.cost,
        nextQuestCost: skill.nextQuestCost ?? 25,
        previewClip: skill.previewClip || [],
        contentYouTube: skill.contentYouTube || [],
        contentGoogleDrive: skill.contentGoogleDrive || [],
        layer: skill.layer,
        position: skill.position + 1,
        treePosition: skill.treePosition ? {
          x: skill.treePosition.x + 64,
          y: skill.treePosition.y + 64
        } : undefined,
        nodeColor: skill.nodeColor,
        isAdvancedLocked: skill.isAdvancedLocked === true,
        prerequisites: skill.prerequisites || [],
        subQuests: (skill.subQuests || []).map(subQuest => ({
          ...subQuest,
          descriptionParts: subQuest.descriptionParts?.map(part => ({ ...part }))
        })),
        minAP: skill.minAP,
        maxAP: skill.maxAP
      });

      await loadSkills();
      startEditingSkill(response.data.skill);
    } catch (error) {
      console.error('Error duplicating skill:', error);
      alert('Failed to duplicate quest');
    }
  };

  const openSkillDetail = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSkillDetail(true);
    setEditingSkill(false);
  };

  const startEditingSkill = (skill: Skill) => {
    setSelectedSkill(skill);
    setSkillTitle(skill.title);
    setSkillDescription(skill.description);
    setSkillCost(skill.cost);
    setSkillNextQuestCost(skill.nextQuestCost ?? 25);
    setSkillPreviewClip(Array.isArray(skill.previewClip) ? skill.previewClip.join('\n') : (skill.previewClip || ''));
    setSkillContentYouTube(Array.isArray(skill.contentYouTube) ? skill.contentYouTube.join('\n') : (skill.contentYouTube || ''));
    setSkillContentGoogleDrive(Array.isArray(skill.contentGoogleDrive) ? skill.contentGoogleDrive.join('\n') : (skill.contentGoogleDrive || ''));
    setSkillNodeColor(skill.nodeColor);
    setSkillPrerequisites(skill.prerequisites || []);
    setSkillSubQuests((skill.subQuests || []).map(subQuest => ({
      externalId: subQuest.externalId,
      title: subQuest.title,
      description: subQuest.description,
      descriptionParts: subQuest.descriptionParts?.map(part => ({ ...part })),
      type: subQuest.type
    })));
    setSkillMinAP(skill.minAP);
    setSkillMaxAP(skill.maxAP);
    const firstStepIndex = (skill.subQuests || []).length > 0 ? 0 : null;
    setEditingStepIndex(firstStepIndex);
    setPreviewOpenStep(firstStepIndex);
    setEditingSkill(true);
    setShowSkillDetail(true);
  };

  const resetSkillForm = () => {
    setSkillTitle('');
    setSkillDescription('');
    setSkillCost(0);
    setSkillNextQuestCost(25);
    setSkillPreviewClip('');
    setSkillContentYouTube('');
    setSkillContentGoogleDrive('');
    setSkillNodeColor('blue');
    setSkillPrerequisites([]);
    setSkillSubQuests([]);
    setEditingStepIndex(null);
    setPreviewOpenStep(null);
    setSkillMinAP(undefined);
    setSkillMaxAP(undefined);
    setSelectedSkill(null);
    setEditingSkill(false);
  };

  // Convert YouTube URL to embed URL
  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';
    const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([\w-]{11})/);
    return videoIdMatch ? `https://www.youtube.com/embed/${videoIdMatch[1]}` : url;
  };

  // Get node color
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

  // Render imported image blocks and older bare image links consistently with the player view.
  const renderDescriptionWithImages = (description: string) => {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)|(https?:\/\/[^\s)]+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]*)?)/gi;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = imageRegex.exec(description)) !== null) {
      // Add text before the image
      if (match.index > lastIndex) {
        parts.push(description.substring(lastIndex, match.index));
      }
      // Add the image
      const altText = match[1] || 'Quest image';
      const imageUrl = match[2] || match[3];
      parts.push(
        <img
          key={key++}
          src={imageUrl}
          alt={altText || 'Quest image'}
          style={{
            maxWidth: '100%',
            height: 'auto',
            margin: '10px 0',
            borderRadius: '8px',
            display: 'block'
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < description.length) {
      parts.push(description.substring(lastIndex));
    }

    // If no images found, return the description as-is
    if (parts.length === 0) {
      return <span>{description}</span>;
    }

    return <div>{parts}</div>;
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

  const renderLinkedImagePreviews = (description: string, existingImageUrls: string[] = []) => {
    const existingUrls = new Set(existingImageUrls);
    const imageUrls = getImageUrls(description).filter(url => !existingUrls.has(url));
    if (imageUrls.length === 0) return null;

    return <div className="node-linked-image-previews">
      {imageUrls.map((url, index) => (
        <img key={`${url}-${index}`} src={url} alt="Attached image" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
      ))}
    </div>;
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

  const getQuestEditorEdges = (): QuestEditorEdge[] => {
    const skillById = new Map(skills.map((skill) => [skill._id, skill]));
    const edges: QuestEditorEdge[] = [];
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
          hasArrowhead: connection.hasArrowhead !== false,
          editable: true
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
          hasArrowhead: true,
          editable: false
        });
      });
    });

    return edges;
  };

  const getQuestEditorLayout = (edges: QuestEditorEdge[]): Map<string, QuestEditorPoint> => {
    const layout = new Map<string, QuestEditorPoint>();
    const startY = 620;
    const stageStep = 180;
    const maximumBranchWidth = 360;
    const minimumNodeGap = 135;
    const getPosition = (skill: Skill) => skill.position;

    for (let stage = 0; stage <= 7; stage++) {
      const stageSkills = skills
        .filter((skill) => skill.layer === stage)
        .sort((a, b) => getPosition(a) - getPosition(b));

      if (stageSkills.length === 0) continue;

      const desiredPositions = stageSkills.map((skill, index) => {
        if (stage <= 2) {
          const trunkSpread = stageSkills.length > 1
            ? Math.min(150, (stageSkills.length - 1) * 72)
            : 0;
          const x = stageSkills.length === 1
            ? 0
            : -trunkSpread + (index * trunkSpread * 2) / (stageSkills.length - 1);
          return { skill, x };
        }

        const predecessors = edges
          .filter((edge) => edge.target._id === skill._id && edge.source.layer < skill.layer)
          .map((edge) => edge.source)
          .sort((a, b) => b.layer - a.layer);
        const primaryParent = predecessors[0];
        const parentPoint = primaryParent ? layout.get(primaryParent._id) : undefined;

        if (parentPoint && primaryParent) {
          const siblings = stageSkills.filter((candidate) =>
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
          180 + (stage - 3) * 45
        );
        const x = stageSkills.length === 1
          ? 0
          : -fallbackSpread + (index * fallbackSpread * 2) / (stageSkills.length - 1);
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
            y: startY - stage * stageStep,
            radius: isExtraNode ? 72 : 58
          });
        });
      }
    }

    skills.forEach((skill) => {
      const savedPosition = tempTreePositions[skill._id] ?? skill.treePosition;
      if (!savedPosition || !Number.isFinite(savedPosition.x) || !Number.isFinite(savedPosition.y)) return;

      const isExtraNode = skill.nodeType === 'EXTRA' || skill.nodeColor === 'purple';
      layout.set(skill._id, {
        x: savedPosition.x,
        y: savedPosition.y,
        radius: isExtraNode ? 72 : 58
      });
    });

    return layout;
  };

  const getConnectionKey = (sourceId: string, targetId: string) => `${sourceId}-${targetId}`;

  const getQuestEditorConnectionGeometry = (
    source: QuestEditorPoint,
    target: QuestEditorPoint,
    controlPoints?: Array<{ x: number; y: number }>
  ) => {
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
    const defaultControls = isAxisAligned
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
    const controls = controlPoints && controlPoints.length === 2 ? controlPoints : defaultControls;

    return { startX, startY, endX, endY, controls };
  };

  const getQuestEditorConnectionPath = (
    source: QuestEditorPoint,
    target: QuestEditorPoint,
    controlPoints?: Array<{ x: number; y: number }>
  ): string => {
    const geometry = getQuestEditorConnectionGeometry(source, target, controlPoints);
    return `M ${geometry.startX} ${geometry.startY} C ${geometry.controls[0].x} ${geometry.controls[0].y}, ${geometry.controls[1].x} ${geometry.controls[1].y}, ${geometry.endX} ${geometry.endY}`;
  };

  const questEditorEdges = getQuestEditorEdges();
  const questEditorLayout = getQuestEditorLayout(questEditorEdges);
  const questEditorBounds = Array.from(questEditorLayout.values()).reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x - point.radius),
      right: Math.max(bounds.right, point.x + point.radius),
      top: Math.min(bounds.top, point.y - point.radius),
      bottom: Math.max(bounds.bottom, point.y + point.radius)
    }),
    { left: 0, right: 0, top: 0, bottom: 0 }
  );
  const questEditorPadding = 150;
  const questEditorLeft = skills.length === 0 ? -380 : questEditorBounds.left - questEditorPadding;
  const questEditorTop = skills.length === 0 ? -220 : questEditorBounds.top - questEditorPadding;
  const questEditorWidth = skills.length === 0
    ? 760
    : Math.max(760, questEditorBounds.right - questEditorBounds.left + questEditorPadding * 2);
  const questEditorHeight = skills.length === 0
    ? 940
    : Math.max(760, questEditorBounds.bottom - questEditorBounds.top + questEditorPadding * 2);
  const questEditorViewBox = `${questEditorLeft} ${questEditorTop} ${questEditorWidth} ${questEditorHeight}`;

  // Zoom and Pan handlers
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.3), 3));
  };

  const handlePanStart = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if ((e.button === 0 || e.button === 1) && !target.closest('.quest-editor-node, .quest-editor-connection')) {
      e.preventDefault();
      setIsPanning(true);
      setPanStartX(e.clientX - panX);
      setPanStartY(e.clientY - panY);
    }
  };

  const handlePanMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPanX(e.clientX - panStartX);
      setPanY(e.clientY - panStartY);
    }
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

  const resetView = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  const zoomIn = () => setZoom(prev => Math.min(prev * 1.2, 3));
  const zoomOut = () => setZoom(prev => Math.max(prev * 0.8, 0.3));

  // Dragging uses canvas coordinates so quest placement is entirely freeform.
  const handleNodeDrag = (e: React.MouseEvent<SVGElement>, skill: Skill) => {
    if (isPanning) return;
    e.stopPropagation();

    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const getPointer = (event: MouseEvent | React.MouseEvent<SVGElement>) => {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
      return {
        x: (svgPoint.x - panX / zoom) / zoom,
        y: (svgPoint.y - panY / zoom) / zoom
      };
    };

    const initialPointer = getPointer(e);
    const initialPosition = questEditorLayout.get(skill._id);
    if (!initialPosition) return;
    let hasMoved = false;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const pointer = getPointer(moveEvent);
      const dx = pointer.x - initialPointer.x;
      const dy = pointer.y - initialPointer.y;
      if (Math.sqrt(dx * dx + dy * dy) < 4) return;

      hasMoved = true;
      const snap = (value: number) => gridSnap ? Math.round(value / 32) * 32 : value;
      setTempTreePositions((current) => ({
        ...current,
        [skill._id]: { x: snap(initialPosition.x + dx), y: snap(initialPosition.y + dy) }
      }));
    };

    const handleMouseUp = () => {
      setDraggingSkill(null);
      if (hasMoved) {
        setWasDragged(prev => ({ ...prev, [skill._id]: true }));
        setTimeout(() => {
          setWasDragged(prev => {
            const updated = { ...prev };
            delete updated[skill._id];
            return updated;
          });
        }, 100);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    setDraggingSkill(skill._id);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleEditorNodeClick = (skill: Skill) => {
    if (editorNodeClickTimeout.current !== null) {
      window.clearTimeout(editorNodeClickTimeout.current);
      editorNodeClickTimeout.current = null;
      return;
    }

    editorNodeClickTimeout.current = window.setTimeout(() => {
      editorNodeClickTimeout.current = null;
      if (!wasDragged[skill._id]) openSkillDetail(skill);
    }, 300);
  };

  const handleToggleAdvancedLock = async (event: React.MouseEvent<SVGGElement>, skill: Skill) => {
    event.preventDefault();
    event.stopPropagation();
    if (editorNodeClickTimeout.current !== null) {
      window.clearTimeout(editorNodeClickTimeout.current);
      editorNodeClickTimeout.current = null;
    }

    try {
      const response = await axios.put(`/api/skills/${skill._id}`, {
        isAdvancedLocked: !skill.isAdvancedLocked
      });
      const updatedSkill = response.data.skill as Skill;
      setSkills(current => current.map(candidate => candidate._id === skill._id ? updatedSkill : candidate));
      setSelectedSkill(current => current?._id === skill._id ? updatedSkill : current);
    } catch (error) {
      console.error('Error changing advanced quest lock:', error);
      alert('Failed to update the quest lock');
    }
  };

  const getEditorPointer = (svg: SVGSVGElement, event: MouseEvent | React.MouseEvent<SVGElement>) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: (svgPoint.x - panX / zoom) / zoom, y: (svgPoint.y - panY / zoom) / zoom };
  };

  const handleConnectionPortStart = (event: React.MouseEvent<SVGElement>, skill: Skill) => {
    event.preventDefault();
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    const sourcePoint = questEditorLayout.get(skill._id);
    if (!svg || !sourcePoint) return;

    setDrawingConnection({ sourceId: skill._id, pointer: getEditorPointer(svg, event) });
    const handleMouseMove = (moveEvent: MouseEvent) => {
      setDrawingConnection(current => current?.sourceId === skill._id
        ? { ...current, pointer: getEditorPointer(svg, moveEvent) }
        : current);
    };
    const handleMouseUp = () => {
      setDrawingConnection(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleConnectionDrop = async (event: React.MouseEvent<SVGGElement>, targetSkill: Skill) => {
    if (!drawingConnection || drawingConnection.sourceId === targetSkill._id) return;
    event.preventDefault();
    event.stopPropagation();
    const sourceSkill = skills.find(skill => skill._id === drawingConnection.sourceId);
    const sourcePoint = sourceSkill ? questEditorLayout.get(sourceSkill._id) : undefined;
    const targetPoint = questEditorLayout.get(targetSkill._id);
    if (!sourceSkill || !sourcePoint || !targetPoint) return;

    setDrawingConnection(null);
    setWasDragged(current => ({ ...current, [sourceSkill._id]: true, [targetSkill._id]: true }));
    setTimeout(() => {
      setWasDragged(current => {
        const updated = { ...current };
        delete updated[sourceSkill._id];
        delete updated[targetSkill._id];
        return updated;
      });
    }, 120);
    try {
      await axios.post(`/api/skills/${sourceSkill._id}/connections`, {
        targetSkillId: targetSkill._id,
        connectionType: 'normal',
        hasArrowhead: true,
        curveMode: 'auto'
      });
      await loadSkills();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to connect quests');
    }
  };

  const handleBezierHandleDrag = (
    event: React.MouseEvent<SVGCircleElement>,
    edge: QuestEditorEdge,
    handleIndex: number,
    source: QuestEditorPoint,
    target: QuestEditorPoint
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const key = getConnectionKey(edge.source._id, edge.target._id);
    let latestControls = tempConnectionControls[key] || edge.source.connections?.find(connection => connection.targetSkillId === edge.target._id)?.controlPoints || getQuestEditorConnectionGeometry(source, target).controls;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const pointer = getEditorPointer(svg, moveEvent);
      latestControls = latestControls.map((control, index) => index === handleIndex ? pointer : control);
      setTempConnectionControls(current => ({ ...current, [key]: latestControls }));
    };
    const handleMouseUp = async () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      try {
        await axios.put(`/api/skills/${edge.source._id}/connections/${edge.target._id}`, { controlPoints: latestControls });
        setTempConnectionControls(current => {
          const updated = { ...current };
          delete updated[key];
          return updated;
        });
        await loadSkills();
      } catch (error) {
        console.error('Error saving Bezier controls:', error);
        alert('Failed to save curve adjustment');
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Save all position changes
  const handleSavePositions = async () => {
    try {
      const updates = Object.entries(tempTreePositions).map(([skillId, treePosition]) =>
        axios.put(`/api/skills/${skillId}`, { treePosition })
      );
      
      await Promise.all(updates);
      alert('All positions saved successfully!');
      setTempTreePositions({});
      await loadSkills(); // Ensure skills are reloaded
    } catch (error) {
      console.error('Error saving positions:', error);
      alert('Failed to save some positions');
    }
  };

  // Reset all unsaved changes
  const handleResetPositions = () => {
    if (confirm('Discard all unsaved position changes?')) {
      setTempTreePositions({});
    }
  };

  const handleCreateGuild = async () => {
    if (!newGuildName.trim()) {
      alert('Please enter a guild name');
      return;
    }

    try {
      await axios.post('/api/guilds', {
        name: newGuildName,
        guildLeaderIds: newGuildLeaderIds,
        assetPointName: newGuildAssetPointName || 'Asset Point'
      });
      setNewGuildName('');
      setNewGuildLeaderIds([]);
      setNewGuildLeaderIdInput('');
      setNewGuildAssetPointName('Asset Point');
      setShowCreateGuild(false);
      loadGuilds();
      alert('Guild created successfully!');
    } catch (error: any) {
      console.error('Error creating guild:', error);
      alert(error.response?.data?.error || 'Failed to create guild');
    }
  };

  const handleDeleteGuild = async (guildId: string) => {
    if (!confirm('Are you sure you want to delete this guild? All members will be removed.')) {
      return;
    }

    try {
      await axios.delete(`/api/guilds/${guildId}`);
      loadGuilds();
      setSelectedGuild(null);
      alert('Guild deleted successfully!');
    } catch (error) {
      console.error('Error deleting guild:', error);
      alert('Failed to delete guild');
    }
  };

  const handleAssignUserToGuild = async (userId: string, guildId: string) => {
    try {
      await axios.post(`/api/users/${userId}/guild`, { guildId });
      loadGuildMembers(guildId);
      loadAllUsers();
      alert('User assigned successfully!');
    } catch (error) {
      console.error('Error assigning user:', error);
      alert('Failed to assign user');
    }
  };

  const loadApprovalRequests = async () => {
    try {
      const params = approvalGuildFilter !== 'all' ? { guildId: approvalGuildFilter } : {};
      const response = await axios.get('/api/approval-requests', { params });
      if (response.data.success) {
        setApprovalRequests(response.data.requests);
      }
    } catch (error) {
      console.error('Error loading approval requests:', error);
      alert('Failed to load approval requests');
    }
  };

  const handleApproveRequest = async (request: ApprovalRequest) => {
    const skill = skills.find(s => s._id === request.skillId);
    setSelectedApprovalRequest(request);
    setApproveAPAmount(skill?.minAP ?? 35);
    setShowApproveModal(true);
  };

  const loadUploadedImages = async () => {
    try {
      const response = await axios.get('/api/admin/images');
      if (response.data.success) {
        setUploadedImages(response.data.images);
      }
    } catch (error) {
      console.error('Error loading uploaded images:', error);
      alert('Failed to load uploaded images');
    }
  };

  const loadShopItems = async () => {
    try {
      const response = await axios.get('/api/admin/shop/items');
      if (response.data.success) {
        setShopItems(response.data.items);
      }
    } catch (error) {
      console.error('Error loading shop items:', error);
      alert('Failed to load shop items');
    }
  };

  const loadOfficeCatalog = async () => {
    setOfficeCatalogLoading(true);
    setOfficeCatalogError('');
    try {
      const response = await axios.get('/api/admin/office-catalog/items');
      if (response.data.success) {
        setOfficeCatalogItems(response.data.items);
        setOfficeCatalogCategory(current => current !== 'all' && !response.data.items.some((item: OfficeCatalogItem) => (item.type || 'Other') === current) ? 'all' : current);
        setOfficeItemPrices(Object.fromEntries(
          response.data.items.map((item: OfficeCatalogItem) => [item._id, item.importSettings?.price ?? 0])
        ));
      }
    } catch (error: any) {
      console.error('Error loading Office catalog:', error);
      setOfficeCatalogError(error.response?.data?.error || 'Unable to load the Office item catalog');
    } finally {
      setOfficeCatalogLoading(false);
    }
  };

  const handleImportOfficeItem = async (item: OfficeCatalogItem) => {
    const price = officeItemPrices[item._id] ?? 0;
    if (!Number.isFinite(price) || price < 0) {
      alert('Price must be a non-negative number');
      return;
    }

    setImportingOfficeItemId(item._id);
    try {
      await axios.post('/api/admin/office-catalog/items/import', {
        externalItemId: item._id,
        price,
        isActive: true
      });
      await Promise.all([loadOfficeCatalog(), loadShopItems()]);
    } catch (error: any) {
      console.error('Error importing Office item:', error);
      alert(error.response?.data?.error || 'Failed to import Office item');
    } finally {
      setImportingOfficeItemId(null);
    }
  };

  const loadOfficeQuestCatalog = async () => {
    setOfficeQuestLoading(true);
    setOfficeQuestError('');
    try {
      const response = await axios.get('/api/admin/office-quest-catalog');
      if (response.data.success) {
        setOfficeQuestItems(response.data.items);
        setOfficeQuestSyncedAt(response.data.syncedAt);
        setOfficeQuestTag(current => current !== 'all' && !response.data.items.some((item: OfficeQuestCatalogItem) => item.tags.some(tag => tag.name === current)) ? 'all' : current);
      }
    } catch (error: any) {
      setOfficeQuestError(error.response?.data?.error || 'Unable to load the cached Office quest catalog');
    } finally {
      setOfficeQuestLoading(false);
    }
  };

  const handleSyncOfficeQuests = async () => {
    setOfficeQuestSyncing(true);
    setOfficeQuestError('');
    try {
      const response = await axios.post('/api/admin/office-quest-catalog/sync');
      alert(`${response.data.uniqueCount} unique Office quests synced.`);
      await loadOfficeQuestCatalog();
    } catch (error: any) {
      setOfficeQuestError(error.response?.data?.error || 'Unable to sync the Office quest catalog');
    } finally {
      setOfficeQuestSyncing(false);
    }
  };

  const handleImportOfficeQuest = async (quest: OfficeQuestCatalogItem) => {
    setImportingOfficeQuestId(quest.externalId);
    try {
      await axios.post(`/api/admin/office-quest-catalog/${quest.externalId}/import`);
      await Promise.all([loadOfficeQuestCatalog(), loadSkills()]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to import Office quest');
    } finally {
      setImportingOfficeQuestId(null);
    }
  };

  const handleReimportOfficeQuest = async (quest: OfficeQuestCatalogItem) => {
    if (!confirm(`Re-import ${quest.title}? This replaces its title, description, and steps with the currently synced Office data.`)) {
      return;
    }

    setImportingOfficeQuestId(quest.externalId);
    try {
      await axios.post(`/api/admin/office-quest-catalog/${quest.externalId}/reimport`);
      await Promise.all([loadOfficeQuestCatalog(), loadSkills()]);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to re-import Office quest');
    } finally {
      setImportingOfficeQuestId(null);
    }
  };

  const loadPreorders = async () => {
    try {
      const response = await axios.get('/api/admin/shop/purchases');
      if (response.data.success) {
        setPreorders(response.data.purchases);
      }
    } catch (error) {
      console.error('Error loading preorders:', error);
      alert('Failed to load preorders');
    }
  };

  const handleViewShopItemAnalytics = async (itemId: string, itemTitle: string) => {
    try {
      const response = await axios.get(`/api/admin/shop/items/${itemId}/purchases`);
      if (response.data.success) {
        setSelectedShopItemAnalytics({
          itemId,
          itemTitle,
          purchases: response.data.purchases
        });
        setShowShopItemAnalytics(true);
      }
    } catch (error: any) {
      console.error('Error loading shop item analytics:', error);
      alert(error.response?.data?.error || 'Failed to load analytics');
    }
  };

  const handleCreateShopItem = async () => {
    if (!shopItemTitle.trim() || !shopItemImageUrl.trim() || shopItemPrice < 0) {
      alert('Please fill in title, image URL, and valid price');
      return;
    }

    try {
      await axios.post('/api/admin/shop/items', {
        title: shopItemTitle,
        description: shopItemDescription.trim() || '',
        price: shopItemPrice,
        imageUrl: shopItemImageUrl.trim(),
        isActive: shopItemIsActive,
        itemType: shopItemType,
        productData: shopItemType === 'normal' ? shopItemProductData.trim() : '',
        availableToAllGuilds: shopItemAvailableToAllGuilds,
        guildIds: shopItemAvailableToAllGuilds ? [] : shopItemGuildIds
      });
      alert('Shop item created successfully!');
      resetShopItemForm();
      setShowCreateShopItem(false);
      loadShopItems();
    } catch (error: any) {
      console.error('Error creating shop item:', error);
      alert(error.response?.data?.error || 'Failed to create shop item');
    }
  };

  const handleUpdateShopItem = async () => {
    if (!selectedShopItem || !shopItemTitle.trim() || !shopItemImageUrl.trim() || shopItemPrice < 0) {
      alert('Please fill in title, image URL, and valid price');
      return;
    }

    try {
      await axios.put(`/api/admin/shop/items/${selectedShopItem._id}`, {
        title: shopItemTitle,
        description: shopItemDescription.trim() || '',
        price: shopItemPrice,
        imageUrl: shopItemImageUrl.trim(),
        isActive: shopItemIsActive,
        itemType: shopItemType,
        productData: shopItemType === 'normal' ? shopItemProductData.trim() : '',
        availableToAllGuilds: shopItemAvailableToAllGuilds,
        guildIds: shopItemAvailableToAllGuilds ? [] : shopItemGuildIds
      });
      alert('Shop item updated successfully!');
      resetShopItemForm();
      setShowEditShopItem(false);
      setSelectedShopItem(null);
      loadShopItems();
    } catch (error: any) {
      console.error('Error updating shop item:', error);
      alert(error.response?.data?.error || 'Failed to update shop item');
    }
  };

  const handleDeleteShopItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this shop item?')) {
      return;
    }

    try {
      await axios.delete(`/api/admin/shop/items/${itemId}`);
      alert('Shop item deleted successfully!');
      loadShopItems();
    } catch (error: any) {
      console.error('Error deleting shop item:', error);
      alert(error.response?.data?.error || 'Failed to delete shop item');
    }
  };

  const startEditingShopItem = (item: typeof shopItems[0]) => {
    setSelectedShopItem(item);
    setShopItemTitle(item.title);
    setShopItemDescription(item.description || '');
    setShopItemPrice(item.price);
    setShopItemImageUrl(item.imageUrl);
    setShopItemIsActive(item.isActive);
    setShopItemType((item as any).itemType || 'normal');
    setShopItemProductData((item as any).productData || '');
    setShopItemAvailableToAllGuilds(item.availableToAllGuilds !== false);
    setShopItemGuildIds(item.guildIds || []);
    setShowEditShopItem(true);
  };

  const resetShopItemForm = () => {
    setShopItemTitle('');
    setShopItemDescription('');
    setShopItemPrice(0);
    setShopItemImageUrl('');
    setShopItemIsActive(true);
    setShopItemType('normal');
    setShopItemProductData('');
    setShopItemAvailableToAllGuilds(true);
    setShopItemGuildIds([]);
    setSelectedShopItem(null);
  };

  const renderShopGuildAccess = (formId: string) => (
    <fieldset className="shop-guild-access">
      <legend>Available to</legend>
      <label className="shop-guild-option shop-guild-option-all">
        <input
          type="checkbox"
          id={`${formId}-all-guilds`}
          checked={shopItemAvailableToAllGuilds}
          onChange={(event) => {
            setShopItemAvailableToAllGuilds(event.target.checked);
            if (event.target.checked) setShopItemGuildIds([]);
          }}
        />
        <span>All Guilds</span>
      </label>
      <div className="shop-guild-options" aria-disabled={shopItemAvailableToAllGuilds}>
        {guilds.map((guild) => (
          <label key={guild._id} className="shop-guild-option">
            <input
              type="checkbox"
              checked={shopItemGuildIds.includes(guild._id)}
              disabled={shopItemAvailableToAllGuilds}
              onChange={(event) => {
                setShopItemGuildIds((current) => event.target.checked
                  ? [...current, guild._id]
                  : current.filter((guildId) => guildId !== guild._id));
              }}
            />
            <span>{guild.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  const updateShopItemGuildScope = async (item: typeof shopItems[0], availableToAllGuilds: boolean, guildIds: string[]) => {
    setSavingShopGuildScopeId(item._id);
    try {
      await axios.put(`/api/admin/shop/items/${item._id}`, { availableToAllGuilds, guildIds });
      setShopItems((current) => current.map((currentItem) => currentItem._id === item._id
        ? { ...currentItem, availableToAllGuilds, guildIds }
        : currentItem));
    } catch (error: any) {
      console.error('Error updating shop item guild access:', error);
      alert(error.response?.data?.error || 'Failed to update item guild access');
    } finally {
      setSavingShopGuildScopeId(null);
    }
  };

  const renderInlineShopGuildAccess = (item: typeof shopItems[0]) => {
    const availableToAllGuilds = item.availableToAllGuilds !== false;
    const selectedGuildIds = item.guildIds || [];
    const isSaving = savingShopGuildScopeId === item._id;

    return (
      <fieldset className="shop-guild-access shop-item-guild-access" disabled={isSaving}>
        <legend>Guild access</legend>
        <label className="shop-guild-option shop-guild-option-all" title={availableToAllGuilds ? 'Select a guild below to limit access' : 'Make this item available to every guild'}>
          <input
            type="checkbox"
            checked={availableToAllGuilds}
            onChange={() => updateShopItemGuildScope(item, true, [])}
          />
          <span>All Guilds</span>
        </label>
        <div className="shop-guild-options">
          {guilds.map((guild) => {
            const isSelected = !availableToAllGuilds && selectedGuildIds.includes(guild._id);
            return (
              <label key={guild._id} className="shop-guild-option">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(event) => {
                    const nextGuildIds = event.target.checked
                      ? [...new Set([...selectedGuildIds, guild._id])]
                      : selectedGuildIds.filter((guildId) => guildId !== guild._id);
                    updateShopItemGuildScope(item, nextGuildIds.length === 0, nextGuildIds);
                  }}
                />
                <span>{guild.name}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  };

  const handleDeleteImage = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
      return;
    }

    try {
      const response = await axios.delete(`/api/admin/images/${filename}`);
      if (response.data.success) {
        alert('Image deleted successfully!');
        loadUploadedImages();
      }
    } catch (error: any) {
      console.error('Error deleting image:', error);
      alert(error.response?.data?.error || 'Failed to delete image');
    }
  };

  const handleConfirmApprove = async () => {
    if (!selectedApprovalRequest) return;
    if (approveAPAmount < 0) {
      alert('AP amount must be non-negative');
      return;
    }

    try {
      const response = await axios.post(`/api/approval-requests/${selectedApprovalRequest._id}/approve`, {
        rewardAP: approveAPAmount
      });
      if (response.data.success) {
        alert('Request approved successfully!');
        setShowApproveModal(false);
        setSelectedApprovalRequest(null);
        setApproveAPAmount(0);
        loadApprovalRequests();
      }
    } catch (error: any) {
      console.error('Error approving request:', error);
      alert(error.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleUpdateGuildLeaders = async (guildId: string, newLeaderIds: string[]) => {
    try {
      const response = await axios.put(`/api/guilds/${guildId}`, {
        guildLeaderIds: newLeaderIds,
        assetPointName: selectedGuild?.assetPointName || 'Asset Point'
      });
      
      // Update the guilds list
      await loadGuilds();
      
      // Update the selected guild if it's the one we just updated
      if (selectedGuild && selectedGuild._id === guildId) {
        setSelectedGuild(response.data.guild);
      }
      
      alert('Guild leaders updated successfully!');
    } catch (error: any) {
      console.error('Error updating guild leaders:', error);
      alert(error.response?.data?.error || 'Failed to update guild leaders');
    }
  };

  const handleUpdateAssetPointName = async (guildId: string, assetPointName: string) => {
    try {
      const response = await axios.put(`/api/guilds/${guildId}`, {
        assetPointName: assetPointName || 'Asset Point',
        guildLeaderIds: selectedGuild?.guildLeaderIds || [],
        adminIds: selectedGuild?.adminIds || []
      });
      
      // Update the guilds list
      await loadGuilds();
      
      // Update the selected guild if it's the one we just updated
      if (selectedGuild && selectedGuild._id === guildId) {
        setSelectedGuild(response.data.guild);
      }
      
      alert('Asset Point name updated successfully!');
    } catch (error: any) {
      console.error('Error updating asset point name:', error);
      alert(error.response?.data?.error || 'Failed to update asset point name');
    }
  };

  const handleRemoveUserFromGuild = async (userId: string) => {
    if (!confirm('Remove this user from the guild?')) {
      return;
    }

    try {
      await axios.post(`/api/users/${userId}/guild`, { guildId: null });
      if (selectedGuild) {
        loadGuildMembers(selectedGuild._id);
      }
      loadAllUsers();
      alert('User removed from guild!');
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Failed to remove user');
    }
  };

  const handleUpdateAssetPoints = async (operation: 'add' | 'subtract') => {
    if (!selectedMember || assetPointsAmount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      await axios.post(`/api/users/${selectedMember.discordId}/asset-points`, {
        amount: assetPointsAmount,
        operation
      });
      
      if (selectedGuild) {
        loadGuildMembers(selectedGuild._id);
      }
      setShowMemberManagement(false);
      setSelectedMember(null);
      setAssetPointsAmount(0);
      alert('Asset points updated successfully!');
    } catch (error) {
      console.error('Error updating asset points:', error);
      alert('Failed to update asset points');
    }
  };

  const handleBackToMenu = () => {
    navigate('/mainmenu');
  };

  // Filter users based on selected filters
  const getFilteredUsers = () => {
    let filtered = [...allUsers];

    // Filter by guild
    if (filterGuild === 'my-guild' && userGuildInfo) {
      filtered = filtered.filter(u => u.guildId === userGuildInfo._id);
    } else if (filterGuild === 'no-guild') {
      // Show users without a guild
      filtered = filtered.filter(u => !u.guildId);
    } else if (filterGuild !== 'all') {
      // Show users in specific guild
      filtered = filtered.filter(u => u.guildId === filterGuild);
    }

    // Filter by role
    if (filterRole !== 'all') {
      filtered = filtered.filter(u => u.role === filterRole);
    }

    // Filter by name (searches in username which now contains nickname)
    if (filterName.trim()) {
      const searchTerm = filterName.toLowerCase();
      filtered = filtered.filter(u => 
        u.username?.toLowerCase().includes(searchTerm) ||
        u.email?.toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  };

  const officeCatalogCategories = Array.from(new Set(
    officeCatalogItems.map(item => item.type || 'Other')
  )).sort();
  const filteredOfficeCatalogItems = officeCatalogItems.filter(item => {
    const search = officeCatalogSearch.trim().toLowerCase();
    const matchesSearch = !search || item.name.toLowerCase().includes(search) || item.description?.toLowerCase().includes(search);
    const matchesCategory = officeCatalogCategory === 'all' || (item.type || 'Other') === officeCatalogCategory;
    return matchesSearch && matchesCategory;
  });
  const officeQuestTags = Array.from(new Set(officeQuestItems.flatMap(item => item.tags.map(tag => tag.name)))).sort();
  const filteredOfficeQuestItems = officeQuestItems.filter(item => {
    const search = officeQuestSearch.trim().toLowerCase();
    const matchesSearch = !search || item.title.toLowerCase().includes(search) || item.description.toLowerCase().includes(search) || item.type?.toLowerCase().includes(search);
    return matchesSearch && (officeQuestTag === 'all' || item.tags.some(tag => tag.name === officeQuestTag));
  });

  const updateSubQuest = (index: number, update: Partial<(typeof skillSubQuests)[number]>) => {
    setSkillSubQuests(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  };

  const updateSubQuestDescription = (index: number, description: string) => {
    setSkillSubQuests(current => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (!item.descriptionParts?.length) return { ...item, description };

      // Imported quests render descriptionParts in the player view. Keep that
      // representation in sync with the editor field while retaining images.
      const firstTextPartIndex = item.descriptionParts.findIndex(part => part.type !== 'Image');
      const descriptionParts = firstTextPartIndex === -1
        ? (description.trim() ? [{ type: 'Text', content: description }, ...item.descriptionParts] : item.descriptionParts)
        : item.descriptionParts.flatMap((part, partIndex) => {
          if (part.type === 'Image') return [part];
          if (partIndex === firstTextPartIndex && description.trim()) {
            return [{ ...part, content: description }];
          }
          return [];
        });

      return { ...item, description, descriptionParts };
    }));
  };

  const renderSubQuestEditor = () => (
    <div className="node-step-editor">
      <div className="node-step-editor-header">
        <label>Quest Steps <span>{skillSubQuests.length}</span></label>
        <button type="button" className="node-step-add" onClick={() => {
          setSkillSubQuests(current => [...current, { title: '', description: '', type: 'ImageNote' }]);
          setEditingStepIndex(skillSubQuests.length);
          setPreviewOpenStep(skillSubQuests.length);
        }}>+ Add step</button>
      </div>
      {skillSubQuests.map((subQuest, index) => (
        <section className={`node-step-card ${editingStepIndex === index ? 'is-open' : ''}`} key={index}>
          <button type="button" className="node-step-card-trigger" onClick={() => {
            const nextOpenStep = editingStepIndex === index ? null : index;
            setEditingStepIndex(nextOpenStep);
            setPreviewOpenStep(nextOpenStep);
          }} aria-expanded={editingStepIndex === index}>
            <span className="node-step-card-title"><b>{index + 1}</b>{subQuest.title.trim() || `Untitled step ${index + 1}`}</span>
            <span className="node-step-card-meta">{subQuest.descriptionParts?.some(part => part.type === 'Image') ? 'Image content' : subQuest.type || 'Step'}</span>
            <span className="node-step-card-chevron">{editingStepIndex === index ? '⌃' : '⌄'}</span>
          </button>
          {editingStepIndex === index && (
            <div className="node-step-card-body">
              <div className="node-step-fields-row">
                <label>
                  <span>Step name</span>
                  <input value={subQuest.title} onChange={(event) => updateSubQuest(index, { title: event.target.value })} placeholder={`Step ${index + 1} title`} className="skill-input" />
                </label>
                <label>
                  <span>Type</span>
                  <select value={subQuest.type || 'ImageNote'} onChange={(event) => updateSubQuest(index, { type: event.target.value })} className="skill-input">
                    <option value="ImageNote">Image Note</option>
                    <option value="Choice">Choice</option>
                    <option value="System">System</option>
                  </select>
                </label>
              </div>
              <label className="node-step-description-field">
                <span>Step details</span>
                <textarea value={subQuest.description} onChange={(event) => updateSubQuestDescription(index, event.target.value)} placeholder="Add instructions, text, or an image URL" className="skill-textarea" rows={4} />
              </label>
              {renderLinkedImagePreviews(subQuest.description, (subQuest.descriptionParts || []).filter(part => part.type === 'Image').map(part => part.content))}
              {subQuest.descriptionParts && subQuest.descriptionParts.length > 0 && (
                <div className="node-step-imported-content">
                  <div>Imported content <span>{subQuest.descriptionParts.length}</span></div>
                  <div className="node-step-imported-items">
                    {subQuest.descriptionParts.map((part, partIndex) => part.type === 'Image' ? (
                      <div className="node-step-imported-media" key={partIndex} title={part.content}>
                        <img src={part.content} alt={subQuest.title || `Step ${index + 1}`} onError={(event) => event.currentTarget.parentElement?.classList.add('is-unavailable')} />
                        <span>Image unavailable</span>
                      </div>
                    ) : <p key={partIndex}>{part.content}</p>)}
                  </div>
                </div>
              )}
              <button type="button" className="node-step-remove" onClick={() => {
                setSkillSubQuests(current => current.filter((_, itemIndex) => itemIndex !== index));
                setEditingStepIndex(current => current === index ? null : current !== null && current > index ? current - 1 : current);
                setPreviewOpenStep(current => current === index ? null : current !== null && current > index ? current - 1 : current);
              }}>Remove step</button>
            </div>
          )}
        </section>
      ))}
    </div>
  );

  const renderNodeEditPreview = () => (
    <aside className="node-edit-preview" aria-label="Player quest preview">
      <div className="node-preview-label">Player preview</div>
      <div className="node-preview-shell">
        <div className="node-preview-hero" style={{ background: getNodeColor(skillNodeColor) }}>
          <div>
            <span className="node-preview-kicker">Quest</span>
            <h4>{skillTitle.trim() || 'Untitled Quest'}</h4>
          </div>
          {(skillNodeColor === 'green' ? skillNextQuestCost : skillCost) > 0 && (
            <span className="node-preview-cost">
              {skillNodeColor === 'green' ? `${skillNextQuestCost} AP next` : `${skillCost} AP`}
            </span>
          )}
        </div>

        {skillDescription.trim() && (
          <section className="node-preview-description">
            {renderDescriptionWithImages(skillDescription)}
          </section>
        )}

        <section className="node-preview-steps">
          <div className="node-preview-section-heading">
            <span>Quest Steps</span>
            <span>{skillSubQuests.length}</span>
          </div>
          {skillSubQuests.length === 0 ? (
            <div className="node-preview-empty">No steps yet</div>
          ) : skillSubQuests.map((subQuest, index) => {
            const isOpen = previewOpenStep === index;
            const hasParts = Boolean(subQuest.descriptionParts?.length);
            const importedImageUrls = (subQuest.descriptionParts || []).filter(part => part.type === 'Image').map(part => part.content);
            return (
              <div className={`node-preview-step ${isOpen ? 'is-open' : ''}`} key={`${subQuest.title}-${index}`}>
                <button
                  type="button"
                  className="node-preview-step-trigger"
                  onClick={() => setPreviewOpenStep(current => current === index ? null : index)}
                  aria-expanded={isOpen}
                >
                  <span><b>{index + 1}</b>{subQuest.title.trim() || `Step ${index + 1}`}</span>
                  <span className="node-preview-chevron">{isOpen ? '⌃' : '⌄'}</span>
                </button>
                {isOpen && (
                  <div className="node-preview-step-content">
                    {hasParts ? subQuest.descriptionParts!.map((part, partIndex) => part.type === 'Image' ? (
                      <img key={partIndex} src={part.content} alt={subQuest.title || `Step ${index + 1}`} />
                    ) : (
                      <div key={partIndex} className="node-preview-copy">{renderDescriptionWithImages(part.content)}</div>
                    )) : subQuest.description.trim() && (
                      <div className="node-preview-copy">{renderDescriptionWithImages(subQuest.description)}</div>
                    )}
                    {hasParts && renderLinkedImagePreviews(subQuest.description, importedImageUrls)}
                    <button type="button" className="node-preview-complete" disabled>Complete +5 AP</button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
        {skillSubQuests.length > 0 && <div className="node-preview-reward">Quest complete +35 AP</div>}
      </div>
    </aside>
  );

  if (loading) {
    return (
      <div className="admin-container">
        <div className="loading">Loading admin panel...</div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div className="admin-topbar">
        <h1 className="admin-title">
          {user?.role === 'super-admin' ? '🔐 Super Admin Panel' : '⚡ Admin Panel'}
        </h1>
        <button className="back-to-menu-btn" onClick={handleBackToMenu}>
          ← Back to Menu
        </button>
      </div>

      {/* Navigation Bar */}
      <div className="admin-navbar">
        <button 
          className={`nav-tab ${activeSection === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveSection('dashboard')}
        >
          📊 Dashboard
        </button>
        <button 
          className={`nav-tab ${activeSection === 'guilds' ? 'active' : ''}`}
          onClick={() => setActiveSection('guilds')}
        >
          🏰 Guilds
        </button>
        <button 
          className={`nav-tab ${activeSection === 'users' ? 'active' : ''}`}
          onClick={() => setActiveSection('users')}
        >
          👥 Users
        </button>
        {/* Skill Tree - Only visible to super-admin */}
        {user?.role === 'super-admin' && (
          <button 
            className={`nav-tab ${activeSection === 'skilltree' ? 'active' : ''}`}
            onClick={() => setActiveSection('skilltree')}
          >
            🌳 Quest Tree
          </button>
        )}
        <button 
          className={`nav-tab ${activeSection === 'approvals' ? 'active' : ''}`}
          onClick={() => setActiveSection('approvals')}
        >
          ✅ Approvals
        </button>
        {/* Image Management - Only visible to super-admin */}
        {user?.role === 'super-admin' && (
          <button 
            className={`nav-tab ${activeSection === 'images' ? 'active' : ''}`}
            onClick={() => setActiveSection('images')}
          >
            🖼️ Images
          </button>
        )}
        <button 
          className={`nav-tab ${activeSection === 'shop' ? 'active' : ''}`}
          onClick={() => setActiveSection('shop')}
        >
          🛒 Shop
        </button>
        <button 
          className={`nav-tab ${activeSection === 'selection' ? 'active' : ''}`}
          onClick={() => setActiveSection('selection')}
        >
          📦 Item Import
        </button>
        <button 
          className={`nav-tab ${activeSection === 'questselection' ? 'active' : ''}`}
          onClick={() => setActiveSection('questselection')}
        >
          🗺️ Quest Import
        </button>
        <button 
          className={`nav-tab ${activeSection === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveSection('settings')}
        >
          ⚙️ Settings
        </button>
      </div>

      <div className="admin-content">
        {/* Dashboard Section */}
        {activeSection === 'dashboard' && (
          <div className="dashboard-section">
            <h2 className="section-title">Dashboard</h2>
            <div className="dashboard-stats">
              <div className="stat-card">
                <span className="stat-icon">🏰</span>
                <div className="stat-info">
                  <span className="stat-number">{guilds.length}</span>
                  <span className="stat-label">Total Guilds</span>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">👥</span>
                <div className="stat-info">
                  <span className="stat-number">{allUsers.length}</span>
                  <span className="stat-label">Total Users</span>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">{user?.role === 'super-admin' ? '🔐' : '⚡'}</span>
                <div className="stat-info">
                  <span className="stat-number">{user?.role?.toUpperCase()}</span>
                  <span className="stat-label">Your Role</span>
                </div>
              </div>
            </div>

            {/* Guild Leader Stats */}
            {isGuildLeader && userGuildInfo && (
              <div className="guild-leader-section">
                <h3 className="guild-leader-title">👑 Your Guild: {userGuildInfo.name}</h3>
                <div className="guild-leader-stats">
                  <div className="guild-stat-card">
                    <span className="guild-stat-icon">👥</span>
                    <div className="guild-stat-info">
                      <span className="guild-stat-number">{userGuildInfo.totalMembers}</span>
                      <span className="guild-stat-label">Members</span>
                    </div>
                  </div>
                  <div className="guild-stat-card">
                    <span className="guild-stat-icon">💎</span>
                    <div className="guild-stat-info">
                      <span className="guild-stat-number">{userGuildInfo.totalAssetPoints}</span>
                      <span className="guild-stat-label">Total Asset Points</span>
                    </div>
                  </div>
                </div>
                <button 
                  className="view-guild-btn"
                  onClick={() => {
                    setActiveSection('guilds');
                    const guild = guilds.find(g => g._id === userGuildInfo._id);
                    if (guild) setSelectedGuild(guild);
                  }}
                >
                  Manage Guild →
                </button>
              </div>
            )}

            <div className="welcome-message">
              <h3>Welcome, {user?.username}!</h3>
              <p>Select a section from the navigation bar above to get started.</p>
            </div>
          </div>
        )}

        {/* Guilds Section */}
        {activeSection === 'guilds' && (
          <div className="guilds-section">
            <h2 className="section-title">Guild Management</h2>
        
        {/* Create Guild Button (Super Admin Only) */}
        {user?.role === 'super-admin' && (
          <div className="create-guild-section">
            <button 
              className="create-guild-btn"
              onClick={() => setShowCreateGuild(!showCreateGuild)}
            >
              {showCreateGuild ? '✕ Cancel' : '➕ Create New Guild'}
            </button>

            {showCreateGuild && (
              <div className="create-guild-form">
                <input
                  type="text"
                  placeholder="Guild Name"
                  value={newGuildName}
                  onChange={(e) => setNewGuildName(e.target.value)}
                  className="guild-input"
                />
                <input
                  type="text"
                  placeholder="Asset Point Name (e.g., Gold, Coins, Credits)"
                  value={newGuildAssetPointName}
                  onChange={(e) => setNewGuildAssetPointName(e.target.value)}
                  className="guild-input"
                  style={{ marginBottom: '12px' }}
                />
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <select
                    value={newGuildLeaderIdInput}
                    onChange={(e) => setNewGuildLeaderIdInput(e.target.value)}
                    className="guild-select"
                  >
                    <option value="">Select Guild Leader</option>
                    {allUsers
                      .filter(u => (u.role === 'admin' || u.role === 'super-admin') && !newGuildLeaderIds.includes(u.discordId))
                      .map(user => (
                        <option key={user.discordId} value={user.discordId}>
                          {user.username} ({user.role})
                        </option>
                      ))
                    }
                  </select>
                  <button 
                    type="button"
                    onClick={() => {
                      if (newGuildLeaderIdInput && !newGuildLeaderIds.includes(newGuildLeaderIdInput)) {
                        setNewGuildLeaderIds([...newGuildLeaderIds, newGuildLeaderIdInput]);
                        setNewGuildLeaderIdInput('');
                      }
                    }}
                    style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    Add
                  </button>
                </div>
                {newGuildLeaderIds.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Selected Leaders:</strong>
                    {newGuildLeaderIds.map((leaderId, idx) => {
                      const leader = allUsers.find(u => u.discordId === leaderId);
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <span>👑 {leader?.username || leaderId}</span>
                          <button
                            type="button"
                            onClick={() => setNewGuildLeaderIds(newGuildLeaderIds.filter(id => id !== leaderId))}
                            style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button className="submit-btn" onClick={handleCreateGuild}>
                  Create Guild
                </button>
              </div>
            )}
          </div>
        )}

        <div className="guilds-layout">
          {/* Guilds List */}
          <div className="guilds-list">
            <h3>All Guilds ({guilds.length})</h3>
            {guilds.map(guild => (
              <div 
                key={guild._id}
                className={`guild-card ${selectedGuild?._id === guild._id ? 'selected' : ''}`}
                onClick={() => setSelectedGuild(guild)}
              >
                <div className="guild-card-header">
                  <span className="guild-name">{guild.name}</span>
                  {user?.role === 'super-admin' && (
                    <button 
                      className="delete-guild-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGuild(guild._id);
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
                {guild.guildLeaderIds && guild.guildLeaderIds.length > 0 && (
                  <p className="guild-leader-name">
                    👑 {guild.guildLeaderIds.map(id => allUsers.find(u => u.discordId === id)?.username || 'Leader').join(', ')}
                  </p>
                )}
              </div>
            ))}
            {guilds.length === 0 && (
              <p className="empty-message">No guilds created yet</p>
            )}
          </div>

          {/* Guild Details */}
          {selectedGuild && (
            <div className="guild-details">
              <h3>Guild: {selectedGuild.name}</h3>
              
              {/* Guild Leader Info & Management */}
              <div className="guild-leader-section">
                {selectedGuild.guildLeaderIds && selectedGuild.guildLeaderIds.length > 0 && (
                  <div>
                    <label className="change-leader-label">Guild Leaders:</label>
                    {selectedGuild.guildLeaderIds.map((leaderId, idx) => {
                      const leader = allUsers.find(u => u.discordId === leaderId);
                      return (
                        <div key={idx} className="guild-leader-badge" style={{ marginBottom: '8px' }}>
                          <span className="leader-icon">👑</span>
                          <span className="leader-text">
                            {leader?.username || 'Unknown'} ({leader?.role || 'Unknown'})
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Change Asset Point Name (Super Admin Only) */}
                {user?.role === 'super-admin' && (
                  <div className="change-leader-section" style={{ marginBottom: '20px' }}>
                    <label className="change-leader-label">Asset Point Name:</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Asset Point Name (e.g., Gold, Coins, Credits)"
                        value={selectedGuild?.assetPointName || 'Asset Point'}
                        onChange={(e) => {
                          if (selectedGuild) {
                            setSelectedGuild({ ...selectedGuild, assetPointName: e.target.value });
                          }
                        }}
                        className="guild-input"
                        style={{ flex: 1 }}
                      />
                      <button
                        onClick={() => {
                          if (selectedGuild) {
                            handleUpdateAssetPointName(selectedGuild._id, selectedGuild.assetPointName || 'Asset Point');
                          }
                        }}
                        style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                      >
                        Update
                      </button>
                    </div>
                  </div>
                )}

                {/* Change Guild Leaders (Super Admin Only) */}
                {user?.role === 'super-admin' && (
                  <div className="change-leader-section">
                    <label className="change-leader-label">Manage Guild Leaders:</label>
                    <select
                      value={newGuildLeaderIdInput}
                      onChange={(e) => setNewGuildLeaderIdInput(e.target.value)}
                      className="guild-select"
                      style={{ marginBottom: '8px' }}
                    >
                      <option value="">Select a Leader to Add</option>
                      {allUsers
                        .filter(u => (u.role === 'admin' || u.role === 'super-admin') && 
                                 (!selectedGuild.guildLeaderIds || !selectedGuild.guildLeaderIds.includes(u.discordId)))
                        .map(user => (
                          <option key={user.discordId} value={user.discordId}>
                            {user.username} ({user.role})
                          </option>
                        ))
                      }
                    </select>
                    <button
                      onClick={() => {
                        if (newGuildLeaderIdInput) {
                          const updatedLeaders = [...(selectedGuild.guildLeaderIds || []), newGuildLeaderIdInput];
                          handleUpdateGuildLeaders(selectedGuild._id, updatedLeaders);
                          setNewGuildLeaderIdInput('');
                        }
                      }}
                      style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginRight: '8px' }}
                    >
                      Add Leader
                    </button>
                    {selectedGuild.guildLeaderIds && selectedGuild.guildLeaderIds.length > 0 && (
                      <button
                        onClick={() => {
                          if (confirm('Remove all leaders?')) {
                            handleUpdateGuildLeaders(selectedGuild._id, []);
                          }
                        }}
                        style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                      >
                        Clear All
                      </button>
                    )}
                    {selectedGuild.guildLeaderIds && selectedGuild.guildLeaderIds.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        {selectedGuild.guildLeaderIds.map((leaderId, idx) => {
                          const leader = allUsers.find(u => u.discordId === leaderId);
                          return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span>👑 {leader?.username || leaderId}</span>
                              <button
                                onClick={() => {
                                  const updatedLeaders = selectedGuild.guildLeaderIds!.filter(id => id !== leaderId);
                                  handleUpdateGuildLeaders(selectedGuild._id, updatedLeaders);
                                }}
                                style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                              >
                                Remove
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Members List */}
              <div className="members-section">
                <h4>Members ({guildMembers.length})</h4>
                
                {/* Assign User to Guild */}
                <div className="assign-user-section">
                  <select 
                    className="user-select"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAssignUserToGuild(e.target.value, selectedGuild._id);
                        e.target.value = '';
                      }
                    }}
                  >
                    <option value="">+ Add member to guild</option>
                    {allUsers
                      .filter(u => !u.guildId || u.guildId !== selectedGuild._id)
                      .map(user => (
                        <option key={user.discordId} value={user.discordId}>
                          {user.username} ({user.role})
                        </option>
                      ))
                    }
                  </select>
                </div>

                {/* Members Table */}
                <div className="members-table">
                  {guildMembers.map(member => (
                    <div key={member.discordId} className="member-row">
                      <div className="member-info">
                        <span className="member-name">{member.username}</span>
                        <span className="member-role">{member.role}</span>
                      </div>
                      <div className="member-stats">
                        <span className="stat-badge">💎 {member.assetPoints}</span>
                        <span className="stat-badge">🎫 {member.techTokens}</span>
                        <span className="stat-badge">🎤 {member.voiceMinutesToday}m</span>
                      </div>
                      <div className="member-actions">
                        <button 
                          className="manage-btn"
                          onClick={() => {
                            setSelectedMember(member);
                            setShowMemberManagement(true);
                          }}
                        >
                          Manage
                        </button>
                        <button 
                          className="remove-btn"
                          onClick={() => handleRemoveUserFromGuild(member.discordId)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {guildMembers.length === 0 && (
                    <p className="empty-message">No members in this guild</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!selectedGuild && (
            <div className="guild-details empty-state">
              <p>Select a guild to view details and manage members</p>
            </div>
          )}
        </div>
          </div>
        )}

        {/* Users Section */}
        {activeSection === 'users' && (
          <div className="users-section">
            <h2 className="section-title">User Management</h2>
            
            {/* Filter Controls */}
            <div className="filter-controls">
              <div className="filter-group">
                <label className="filter-label">Filter by Guild:</label>
                <select 
                  className="filter-select"
                  value={filterGuild}
                  onChange={(e) => setFilterGuild(e.target.value)}
                >
                  <option value="all">All Guilds</option>
                  {isGuildLeader && userGuildInfo && (
                    <option value="my-guild">My Guild ({userGuildInfo.name})</option>
                  )}
                  {guilds.map(guild => (
                    <option key={guild._id} value={guild._id}>
                      {guild.name}
                    </option>
                  ))}
                  <option value="no-guild">No Guild</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Filter by Role:</label>
                <select 
                  className="filter-select"
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                >
                  <option value="all">All Roles</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="super-admin">Super Admin</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Search by Name:</label>
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Type username or email..."
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                />
              </div>

              <button 
                className="clear-filters-btn"
                onClick={() => {
                  setFilterGuild('all');
                  setFilterRole('all');
                  setFilterName('');
                }}
              >
                Clear Filters
              </button>
            </div>

            {/* Users Table */}
            <div className="users-table-container">
              <div className="users-count">
                Showing {getFilteredUsers().length} of {allUsers.length} users
              </div>
              
              <div className="users-table">
                <div className="users-table-header">
                  <div className="table-col col-user">User</div>
                  <div className="table-col col-role">Role</div>
                  <div className="table-col col-guild">Guild</div>
                  <div className="table-col col-stats">Asset Points</div>
                  <div className="table-col col-stats">Tech Tokens</div>
                  <div className="table-col col-stats">Voice Today</div>
                  <div className="table-col col-actions">Actions</div>
                </div>

                <div className="users-table-body">
                  {getFilteredUsers().map(user => (
                    <div key={user.discordId} className="user-table-row">
                      <div className="table-col col-user">
                        <div className="user-info-cell">
                          <span className="user-name-cell">{user.username}</span>
                          <span className="user-email-cell">{user.email || 'No email'}</span>
                        </div>
                      </div>
                      <div className="table-col col-role">
                        <span className={`role-badge ${user.role}`}>
                          {user.role === 'super-admin' ? '🔐' : user.role === 'admin' ? '⚡' : '👤'}
                          {user.role.toUpperCase()}
                        </span>
                      </div>
                      <div className="table-col col-guild">
                        {user.guildId ? (
                          <span className="guild-badge">
                            🏰 {guilds.find(g => g._id === user.guildId)?.name || 'Unknown'}
                          </span>
                        ) : (
                          <span className="no-guild-badge">No Guild</span>
                        )}
                      </div>
                      <div className="table-col col-stats">
                        <span className="stat-value-cell">💎 {user.assetPoints}</span>
                      </div>
                      <div className="table-col col-stats">
                        <span className="stat-value-cell">🎫 {user.techTokens}</span>
                      </div>
                      <div className="table-col col-stats">
                        <span className="stat-value-cell">🎤 {user.voiceMinutesToday}m</span>
                      </div>
                      <div className="table-col col-stats">
                        <button
                          className="view-progress-btn"
                          onClick={() => {
                            setSelectedUserForProgress(user);
                            setShowSkillProgressModal(true);
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid #667eea',
                            backgroundColor: '#667eea',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#5568d3';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#667eea';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                        >
                          🌳 View Progress
                        </button>
                      </div>
                      <div className="table-col col-actions">
                        <button 
                          className="view-user-btn"
                          onClick={() => {
                            setSelectedMember(user);
                            setShowMemberManagement(true);
                          }}
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  ))}

                  {getFilteredUsers().length === 0 && (
                    <div className="empty-users-message">
                      <p>No users found matching the selected filters</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Skill Tree Section - Super Admin Only */}
        {activeSection === 'skilltree' && user?.role === 'super-admin' && (
          <div className="skilltree-section">
            <div className="skilltree-header">
              <h2 className="section-title">Quest Tree Management</h2>
              <div className="quest-tree-actions">
                <button className="create-skill-btn secondary" onClick={handleExportQuestJson}>
                  Export JSON
                </button>
                <button className="create-skill-btn secondary" onClick={() => setShowQuestJsonModal(true)}>
                  Import JSON
                </button>
                <button className="create-skill-btn" onClick={() => {
                  resetSkillForm();
                  setShowCreateSkill(true);
                }}>
                  ➕ Create New Quest
                </button>
              </div>
            </div>

            <div
              className="skill-tree-container quest-tree-editor"
              onWheel={(event) => event.preventDefault()}
            >
              {skills.length > 0 && <div className="save-controls">
                {Object.keys(tempTreePositions).length > 0 ? (
                  <div className="unsaved-badge">
                    {Object.keys(tempTreePositions).length} unsaved
                  </div>
                ) : (
                  <div className="saved-badge">All saved</div>
                )}
                <button
                  className="save-btn"
                  onClick={handleSavePositions}
                  disabled={Object.keys(tempTreePositions).length === 0}
                  title="Save quest positions"
                >
                  Save layout
                </button>
                <button
                  className="reset-btn"
                  onClick={handleResetPositions}
                  disabled={Object.keys(tempTreePositions).length === 0}
                  title="Discard layout changes"
                >
                  Discard
                </button>
              </div>}

              <div className="zoom-controls" aria-label="Quest tree editor view controls">
                <button className="zoom-btn" onClick={zoomIn} title="Zoom in" aria-label="Zoom in">+</button>
                <button className="zoom-btn" onClick={resetView} title="Reset view" aria-label="Reset view">⌂</button>
                <button className="zoom-btn" onClick={zoomOut} title="Zoom out" aria-label="Zoom out">−</button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
                <label className="grid-snap-toggle" title="Snap dragged quests to the grid">
                  <input type="checkbox" checked={gridSnap} onChange={(event) => setGridSnap(event.target.checked)} />
                  <span>Snap</span>
                </label>
              </div>

              {editingConnection && (() => {
                const source = skills.find((skill) => skill._id === editingConnection.skillId);
                const connection = source?.connections?.find(
                  (candidate) => candidate.targetSkillId === editingConnection.targetSkillId
                );
                const target = skills.find((skill) => skill._id === editingConnection.targetSkillId);
                const sourcePoint = source ? questEditorLayout.get(source._id) : undefined;
                const targetPoint = target ? questEditorLayout.get(target._id) : undefined;

                return source && connection && target ? (
                  <div className="connection-edit-controls">
                    <div className="connection-edit-header">
                      <span>{source.title} → {target.title}</span>
                      <button
                        className="close-edit-btn"
                        onClick={() => setEditingConnection(null)}
                        title="Close connection editor"
                        aria-label="Close connection editor"
                      >
                        ×
                      </button>
                    </div>
                    <label className="connection-edit-option">
                      <input
                        type="checkbox"
                        checked={connection.hasArrowhead !== false}
                        onChange={(event) => {
                          axios.put(`/api/skills/${source._id}/connections/${connection.targetSkillId}`, {
                            hasArrowhead: event.target.checked
                          }).then(() => loadSkills());
                        }}
                      />
                      <span>Show direction</span>
                    </label>
                    <label className="connection-edit-option">
                      <span>Curve</span>
                      <select
                        value={connection.curveMode === 'bezier' ? 'bezier' : 'auto'}
                        onChange={(event) => {
                          const curveMode = event.target.value as 'auto' | 'bezier';
                          const controlPoints = curveMode === 'bezier' && sourcePoint && targetPoint
                            ? getQuestEditorConnectionGeometry(sourcePoint, targetPoint).controls
                            : undefined;
                          axios.put(`/api/skills/${source._id}/connections/${connection.targetSkillId}`, {
                            curveMode,
                            ...(controlPoints ? { controlPoints } : {})
                          }).then(() => loadSkills());
                        }}
                      >
                        <option value="auto">Auto curve</option>
                        <option value="bezier">Bezier</option>
                      </select>
                    </label>
                    {connection.curveMode === 'bezier' && <span className="connection-edit-hint">Drag the two handles on the line to shape it.</span>}
                    <button
                      className="delete-connection-btn"
                      onClick={() => {
                        if (confirm('Delete this connection?')) {
                          axios.delete(`/api/skills/${source._id}/connections/${connection.targetSkillId}`)
                            .then(() => {
                              setEditingConnection(null);
                              loadSkills();
                            });
                        }
                      }}
                    >
                      Delete connection
                    </button>
                  </div>
                ) : null;
              })()}

              {skills.length === 0 && (
                <div className="quest-editor-empty-banner">
                  <strong>No quests published yet</strong>
                  <span>Create the starting quest to begin the tree.</span>
                </div>
              )}

              <svg
                className="skill-tree-svg quest-tree-editor-svg"
                viewBox={questEditorViewBox}
                preserveAspectRatio="xMidYMid meet"
                style={{ cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
                onWheel={handleWheel}
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
              >
                <defs>
                  <pattern id="quest-editor-grid" width="42" height="42" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="2" fill="#dbe7f8" />
                  </pattern>
                  <filter id="quest-editor-node-shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="7" stdDeviation="8" floodColor="#3b67b5" floodOpacity="0.2" />
                  </filter>
                  <marker id="quest-editor-arrow-normal" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 0 1 L 12 7 L 0 13 Z" fill="#8497b5" />
                  </marker>
                  <marker id="quest-editor-arrow-special" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M 0 1 L 12 7 L 0 13 Z" fill="#7c3aed" />
                  </marker>
                </defs>

                <rect
                  x={questEditorLeft}
                  y={questEditorTop}
                  width={questEditorWidth}
                  height={questEditorHeight}
                  rx="24"
                  fill="#f8fbff"
                />
                <rect
                  x={questEditorLeft}
                  y={questEditorTop}
                  width={questEditorWidth}
                  height={questEditorHeight}
                  rx="24"
                  fill="url(#quest-editor-grid)"
                  opacity="0.65"
                />

                <g transform={`translate(${panX / zoom}, ${panY / zoom}) scale(${zoom})`}>
                  {skills.length === 0 ? (
                    <g className="quest-editor-placeholder" aria-hidden="true">
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
                          <circle r="12" className="quest-editor-placeholder-core" />
                          {node.label && <text y="92" textAnchor="middle">{node.label}</text>}
                        </g>
                      ))}
                    </g>
                  ) : (
                    <>

                      {questEditorEdges.map((edge) => {
                        const source = questEditorLayout.get(edge.source._id);
                        const target = questEditorLayout.get(edge.target._id);
                        if (!source || !target) return null;

                        const isSpecial = edge.connectionType === 'special';
                        const isEditing = editingConnection?.skillId === edge.source._id &&
                          editingConnection?.targetSkillId === edge.target._id;
                        const marker = isSpecial
                          ? 'url(#quest-editor-arrow-special)'
                          : 'url(#quest-editor-arrow-normal)';
                        const connection = edge.source.connections?.find(candidate => candidate.targetSkillId === edge.target._id);
                        const connectionKey = getConnectionKey(edge.source._id, edge.target._id);
                        const controls = connection?.curveMode === 'bezier'
                          ? tempConnectionControls[connectionKey] || connection.controlPoints
                          : undefined;
                        const geometry = getQuestEditorConnectionGeometry(source, target, controls);

                        return (
                          <g key={connectionKey}>
                            <path
                              className={`quest-editor-connection ${edge.editable ? 'editable' : 'prerequisite'} ${isEditing ? 'selected' : ''}`}
                              d={getQuestEditorConnectionPath(source, target, controls)}
                              stroke={isSpecial ? '#7c3aed' : '#8497b5'}
                              markerEnd={edge.hasArrowhead ? marker : undefined}
                              vectorEffect="non-scaling-stroke"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!edge.editable) return;
                                setEditingConnection(isEditing ? null : { skillId: edge.source._id, targetSkillId: edge.target._id });
                              }}
                            >
                              <title>{edge.editable ? 'Click to edit curve' : 'Prerequisite connection'}</title>
                            </path>
                            {isEditing && edge.editable && connection?.curveMode === 'bezier' && geometry.controls.map((control, index) => (
                              <g key={index} className="quest-editor-bezier-guide">
                                <line x1={index === 0 ? geometry.startX : geometry.endX} y1={index === 0 ? geometry.startY : geometry.endY} x2={control.x} y2={control.y} />
                                <circle className="quest-editor-bezier-handle" cx={control.x} cy={control.y} r="11" onMouseDown={(event) => handleBezierHandleDrag(event, edge, index, source, target)}>
                                  <title>Drag to adjust curve</title>
                                </circle>
                              </g>
                            ))}
                          </g>
                        );
                      })}

                      {drawingConnection && (() => {
                        const source = questEditorLayout.get(drawingConnection.sourceId);
                        if (!source) return null;
                        const pointerPoint: QuestEditorPoint = { ...drawingConnection.pointer, radius: 0 };
                        return <path className="quest-editor-connection drawing" d={getQuestEditorConnectionPath(source, pointerPoint)} stroke="#4e98ff" vectorEffect="non-scaling-stroke" />;
                      })()}

                      {skills.map((skill) => {
                        const point = questEditorLayout.get(skill._id);
                        if (!point) return null;

                        const isDragging = draggingSkill === skill._id;
                        const textLines = wrapText(skill.title, point.radius * 2.25, 24).slice(0, 3);
                        const firstLineY = textLines.length === 1
                          ? 7
                          : -((textLines.length - 1) * 23) / 2 + 6;

                        return (
                          <g
                            key={skill._id}
                            className={`quest-editor-node ${isDragging ? 'dragging' : ''} ${skill.isAdvancedLocked ? 'advanced-locked' : ''}`}
                            transform={`translate(${point.x} ${point.y})`}
                            onClick={() => {
                              if (!isDragging && !wasDragged[skill._id]) handleEditorNodeClick(skill);
                            }}
                            onDoubleClick={(event) => handleToggleAdvancedLock(event, skill)}
                            onMouseUp={(event) => handleConnectionDrop(event, skill)}
                          >
                            <circle className="quest-editor-node-halo" r={point.radius + 8} />
                            <circle
                              className="quest-editor-node-shell"
                              r={point.radius}
                              fill={isDragging ? '#dbeafe' : getNodeColor(skill.nodeColor)}
                              stroke={getNodeStrokeColor(skill.nodeColor)}
                              filter="url(#quest-editor-node-shadow)"
                              onMouseDown={(event) => handleNodeDrag(event, skill)}
                            />
                            <text className="quest-editor-node-title" textAnchor="middle">
                              {textLines.map((line, index) => (
                                <tspan
                                  key={index}
                                  x="0"
                                  y={index === 0 ? firstLineY : undefined}
                                  dy={index === 0 ? undefined : 23}
                                >
                                  {line}
                                </tspan>
                              ))}
                            </text>
                            {skill.isAdvancedLocked && (
                              <g className="quest-editor-advanced-lock" transform={`translate(${-point.radius * 0.7} ${-point.radius * 0.7})`} aria-label="Advanced quest locked">
                                <circle r="17" />
                                <text y="8" textAnchor="middle">LOCK</text>
                                <title>Advanced lock enabled. Double-click to unlock.</title>
                              </g>
                            )}
                            <g
                              className="quest-editor-connect"
                              transform={`translate(${point.radius * 0.72} ${-point.radius * 0.72})`}
                              role="button"
                              tabIndex={0}
                              aria-label={`Drag a connection from ${skill.title}`}
                              onMouseDown={(event) => handleConnectionPortStart(event, skill)}
                              onDoubleClick={(event) => event.stopPropagation()}
                            >
                              <circle r="15" />
                              <path d="M -5 0 H 5 M 1 -4 L 5 0 L 1 4" fill="none" />
                              <title>Drag from here to connect</title>
                            </g>
                            {skill.layer === 0 && (
                              <text className="quest-editor-start-label" y={point.radius + 42} textAnchor="middle">START</text>
                            )}
                          </g>
                        );
                      })}
                    </>
                  )}
                </g>
              </svg>
            </div>

            {/* Skill List */}
            <div className="skill-list-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 className="subsection-title">
                  All Quests ({skillNodeTypeFilter === 'all' ? skills.length : skills.filter(skill => {
                    const nodeType = skill.nodeType || (skill.nodeColor === 'white' ? 'adventure' : skill.nodeColor === 'blue' ? 'asset' : skill.nodeColor === 'green' ? 'quest' : skill.nodeColor === 'yellow' ? 'marker' : 'EXTRA');
                    return nodeType === skillNodeTypeFilter;
                  }).length})
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label htmlFor="node-type-filter" style={{ fontWeight: 'bold', fontSize: '14px' }}>Filter by Node Type:</label>
                  <select
                    id="node-type-filter"
                    value={skillNodeTypeFilter}
                    onChange={(e) => setSkillNodeTypeFilter(e.target.value)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #ddd',
                      fontSize: '14px',
                      backgroundColor: '#fff',
                      cursor: 'pointer',
                      minWidth: '150px'
                    }}
                  >
                    <option value="all">All Types</option>
                    <option value="adventure">Adventure (White)</option>
                    <option value="asset">Asset (Blue)</option>
                    <option value="quest">Quest (Green)</option>
                    <option value="marker">Marker (Yellow)</option>
                    <option value="EXTRA">EXTRA (Purple)</option>
                  </select>
                </div>
              </div>
              <div className="skill-cards-grid">
                {skills.length === 0 ? (
                  <div className="empty-skills-message">
                    <p>No quests created yet. Click "Create New Quest" to get started!</p>
                  </div>
                ) : (() => {
                  // Filter skills by node type
                  const filteredSkills = skills.filter(skill => {
                    if (skillNodeTypeFilter === 'all') return true;
                    const nodeType = skill.nodeType || (skill.nodeColor === 'white' ? 'adventure' : skill.nodeColor === 'blue' ? 'asset' : skill.nodeColor === 'green' ? 'quest' : skill.nodeColor === 'yellow' ? 'marker' : 'EXTRA');
                    return nodeType === skillNodeTypeFilter;
                  });
                  
                  if (filteredSkills.length === 0) {
                    return (
                      <div className="empty-skills-message">
                    <p>No quests found with the selected node type filter.</p>
                      </div>
                    );
                  }
                  
                  return filteredSkills.map(skill => (
                    <div key={skill._id} className="skill-card" onClick={() => openSkillDetail(skill)}>
                      <div className="skill-card-header">
                        <h4 className="skill-card-title">{skill.title}</h4>
                        <span className="skill-card-cost">{skill.cost} AP</span>
                      </div>
                      <p className="skill-card-description">
                        {skill.description.length > 100 
                          ? `${skill.description.substring(0, 100)}...` 
                          : skill.description}
                      </p>
                      <div className="skill-card-meta">
                        <span className="skill-layer-badge">Stage {skill.layer}</span>
                        {(Array.isArray(skill.previewClip) ? skill.previewClip.length > 0 : skill.previewClip) && <span className="skill-has-preview">🎬</span>}
                        {((Array.isArray(skill.contentYouTube) ? skill.contentYouTube.length > 0 : skill.contentYouTube) || 
                          (Array.isArray(skill.contentGoogleDrive) ? skill.contentGoogleDrive.length > 0 : skill.contentGoogleDrive)) && <span className="skill-has-content">📚</span>}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Approvals Section */}
        {activeSection === 'approvals' && (
          <div className="approvals-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 className="section-title">Approval Requests</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                  Filter by Guild:
                </label>
                <select
                  value={approvalGuildFilter}
                  onChange={(e) => {
                    setApprovalGuildFilter(e.target.value);
                  }}
                  style={{
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    background: 'white',
                    minWidth: '200px'
                  }}
                >
                  <option value="all">All Guilds</option>
                  {guilds.map(guild => (
                    <option key={guild._id} value={guild._id}>{guild.name}</option>
                  ))}
                </select>
                <button
                  onClick={loadApprovalRequests}
                  style={{
                    padding: '8px 16px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}
                >
                  🔄 Refresh
                </button>
              </div>
            </div>
            {approvalRequests.length === 0 ? (
              <p className="placeholder-text">No pending approval requests{approvalGuildFilter !== 'all' ? ` for selected guild` : ''}.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {approvalRequests.map((request) => {
                  const skill = request.skill || skills.find(s => s._id === request.skillId);
                  const displayName = request.user?.nickname || request.user?.username || 'Unknown User';
                  return (
                    <div 
                      key={request._id} 
                      style={{
                        padding: '20px',
                        background: 'white',
                        border: '2px solid #e5e7eb',
                        borderRadius: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ fontSize: '18px', fontWeight: '600' }}>
                            {displayName}
                            {request.user?.discriminator && <span style={{ color: '#6b7280' }}>#{request.user.discriminator}</span>}
                          </div>
                          {request.guild && (
                            <div style={{
                              padding: '6px 12px',
                              background: '#eff6ff',
                              border: '2px solid #3b82f6',
                              borderRadius: '6px',
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#1e40af'
                            }}>
                              🏰 {request.guild.name}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                          <div style={{ 
                            fontSize: '20px', 
                            fontWeight: '700', 
                            color: '#14306d', 
                            padding: '8px 12px',
                            background: '#eff6ff',
                            borderRadius: '8px',
                            border: '2px solid #3b82f6',
                            flex: 1
                          }}>
                            📋 Quest: {skill?.title || 'Unknown Skill'}
                          </div>
                          <button
                            onClick={() => handleApproveRequest(request)}
                            style={{
                              padding: '10px 20px',
                              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              fontSize: '14px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              boxShadow: '0 2px 8px rgba(34, 197, 94, 0.3)'
                            }}
                          >
                            ✅ Approve
                          </button>
                        </div>
                        {request.message && (
                          <div style={{ 
                            padding: '12px', 
                            background: '#f3f4f6', 
                            borderRadius: '8px',
                            fontSize: '14px',
                            color: '#374151',
                            marginTop: '8px'
                          }}>
                            {request.message}
                          </div>
                        )}
                        {skill && (skill.minAP !== undefined || skill.maxAP !== undefined) && (
                          <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
                            Recommended AP: {skill.minAP ?? 0} - {skill.maxAP ?? 'N/A'}
                          </div>
                        )}
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
                          Requested: {new Date(request.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Image Management Section */}
        {activeSection === 'images' && user?.role === 'super-admin' && (
          <div className="images-section">
            <h2 className="section-title">Image Management</h2>
            <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '14px', color: '#6b7280' }}>
                Total: {uploadedImages.length} | Used: {uploadedImages.filter(img => img.isUsed).length} | Unused: {uploadedImages.filter(img => !img.isUsed).length}
              </p>
              <button
                onClick={loadUploadedImages}
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                🔄 Refresh
              </button>
            </div>
            {uploadedImages.length === 0 ? (
              <p className="placeholder-text">No uploaded images found.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {uploadedImages.map((image) => (
                  <div
                    key={image.filename}
                    style={{
                      padding: '16px',
                      background: 'white',
                      border: `2px solid ${image.isUsed ? '#22c55e' : '#e5e7eb'}`,
                      borderRadius: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
                      <img
                        src={image.url}
                        alt={image.filename}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#374151', wordBreak: 'break-all' }}>
                        {image.filename}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        Size: {(image.size / 1024).toFixed(2)} KB
                      </div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        Uploaded: {new Date(image.uploadedAt).toLocaleString()}
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        width: 'fit-content',
                        background: image.isUsed ? '#d1fae5' : '#fee2e2',
                        color: image.isUsed ? '#065f46' : '#991b1b'
                      }}>
                        {image.isUsed ? '✓ In Use' : '✗ Unused'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a
                        href={image.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          textAlign: 'center',
                          textDecoration: 'none'
                        }}
                      >
                        🔗 View
                      </a>
                      <button
                        onClick={() => handleDeleteImage(image.filename)}
                        disabled={image.isUsed}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: image.isUsed ? '#9ca3af' : '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: image.isUsed ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          opacity: image.isUsed ? 0.6 : 1
                        }}
                        title={image.isUsed ? 'Cannot delete: Image is in use' : 'Delete image'}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Shop Item Management Section */}
        {activeSection === 'shop' && (
          <div className="shop-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 className="section-title">Shop Item Management</h2>
              <button
                onClick={() => {
                  resetShopItemForm();
                  setShowCreateShopItem(true);
                }}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                + Create Shop Item
              </button>
            </div>

            {shopItems.length === 0 ? (
              <p className="placeholder-text">No shop items found. Create your first item!</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                {shopItems.map((item) => (
                  <div
                    key={item._id}
                    style={{
                      padding: '16px',
                      background: 'white',
                      border: `2px solid ${item.isActive ? '#22c55e' : '#e5e7eb'}`,
                      borderRadius: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ position: 'relative', width: '100%', paddingBottom: '75%', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23f3f4f6"/><text x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af">No Image</text></svg>';
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: '700', color: '#4e98ff' }}>
                        {item.price} AP
                      </div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '600',
                        width: 'fit-content',
                        background: item.isActive ? '#d1fae5' : '#fee2e2',
                        color: item.isActive ? '#065f46' : '#991b1b'
                      }}>
                        {item.isActive ? '✓ Active' : '✗ Inactive'}
                      </div>
                    </div>
                    {renderInlineShopGuildAccess(item)}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        onClick={() => handleViewShopItemAnalytics(item._id, item.title)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'linear-gradient(135deg, #667eea, #764ba2)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        📊 View Analytics
                      </button>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => startEditingShopItem(item)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteShopItem(item._id)}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === 'selection' && (
          <div className="shop-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div>
                <h2 className="section-title">Office Item Selection</h2>
                <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>Choose items from Office and set their GuGame AP price.</p>
              </div>
              <button
                onClick={loadOfficeCatalog}
                disabled={officeCatalogLoading}
                style={{ padding: '9px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: officeCatalogLoading ? 'wait' : 'pointer', opacity: officeCatalogLoading ? 0.7 : 1 }}
              >
                {officeCatalogLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <input
              value={officeCatalogSearch}
              onChange={(event) => setOfficeCatalogSearch(event.target.value)}
              placeholder="Search Office items"
              style={{ width: '100%', maxWidth: '420px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
              <button
                onClick={() => setOfficeCatalogCategory('all')}
                aria-pressed={officeCatalogCategory === 'all'}
                style={{ padding: '7px 12px', border: '1px solid #2563eb', borderRadius: '6px', background: officeCatalogCategory === 'all' ? '#2563eb' : 'white', color: officeCatalogCategory === 'all' ? 'white' : '#1d4ed8', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
              >
                All ({officeCatalogItems.length})
              </button>
              {officeCatalogCategories.map(category => {
                const count = officeCatalogItems.filter(item => (item.type || 'Other') === category).length;
                const active = officeCatalogCategory === category;
                return (
                  <button
                    key={category}
                    onClick={() => setOfficeCatalogCategory(category)}
                    aria-pressed={active}
                    style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: '6px', background: active ? '#e0e7ff' : 'white', color: active ? '#3730a3' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                  >
                    {category} ({count})
                  </button>
                );
              })}
            </div>

            {officeCatalogError && (
              <div style={{ padding: '12px', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '6px', marginBottom: '16px' }}>
                {officeCatalogError}
              </div>
            )}

            {!officeCatalogLoading && !officeCatalogError && filteredOfficeCatalogItems.length === 0 && (
              <p className="placeholder-text">No Office items match this search.</p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
              {filteredOfficeCatalogItems.map(item => (
                <div key={item._id} style={{ border: '1px solid #d1d5db', borderRadius: '8px', background: 'white', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ height: '120px', background: '#f3f4f6', display: 'grid', placeItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
                    {item.icon ? (
                      <img src={item.icon} alt={item.name} style={{ width: '112px', height: '112px', objectFit: 'contain', padding: '8px' }} />
                    ) : (
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>No image</span>
                    )}
                  </div>
                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1f2937' }}>{item.name}</div>
                      {(item.type || item.rarity) && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>{[item.type, item.rarity].filter(Boolean).join(' · ')}</div>}
                    </div>
                    {item.description && <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.45, margin: 0 }}>{item.description}</p>}
                    {item.imported ? (
                      <div style={{ color: '#047857', fontWeight: 600, fontSize: '13px', marginTop: 'auto' }}>
                        Imported{item.importSettings ? ` · ${item.importSettings.price} AP` : ''}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: 'auto' }}>
                        <input
                          type="number"
                          min="0"
                          value={officeItemPrices[item._id] ?? 0}
                          onChange={(event) => setOfficeItemPrices(current => ({ ...current, [item._id]: Math.max(0, Number(event.target.value) || 0) }))}
                          aria-label={`${item.name} price in asset points`}
                          style={{ width: '100px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                        />
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>AP</span>
                        <button
                          onClick={() => handleImportOfficeItem(item)}
                          disabled={importingOfficeItemId === item._id}
                          style={{ marginLeft: 'auto', padding: '8px 12px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: importingOfficeItemId === item._id ? 'wait' : 'pointer', opacity: importingOfficeItemId === item._id ? 0.7 : 1 }}
                        >
                          {importingOfficeItemId === item._id ? 'Importing...' : 'Import'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {activeSection === 'questselection' && (
          <div className="shop-section">
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div>
                  <h2 className="section-title">Office Quest Selection</h2>
                  <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>
                    {officeQuestSyncedAt ? `Cached ${new Date(officeQuestSyncedAt).toLocaleString()}` : 'No cached quests yet. Sync to load them.'}
                  </p>
                </div>
                <button
                  onClick={handleSyncOfficeQuests}
                  disabled={officeQuestSyncing}
                  style={{ padding: '9px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: officeQuestSyncing ? 'wait' : 'pointer', opacity: officeQuestSyncing ? 0.7 : 1 }}
                >
                  {officeQuestSyncing ? 'Syncing...' : 'Sync quests'}
                </button>
              </div>

              <input
                value={officeQuestSearch}
                onChange={(event) => setOfficeQuestSearch(event.target.value)}
                placeholder="Search cached Office quests"
                style={{ width: '100%', maxWidth: '420px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}
              />

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                <button
                  onClick={() => setOfficeQuestTag('all')}
                  aria-pressed={officeQuestTag === 'all'}
                  style={{ padding: '7px 12px', border: '1px solid #2563eb', borderRadius: '6px', background: officeQuestTag === 'all' ? '#2563eb' : 'white', color: officeQuestTag === 'all' ? 'white' : '#1d4ed8', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  All ({officeQuestItems.length})
                </button>
                {officeQuestTags.map(tag => {
                  const active = officeQuestTag === tag;
                  const count = officeQuestItems.filter(item => item.tags.some(itemTag => itemTag.name === tag)).length;
                  return <button key={tag} onClick={() => setOfficeQuestTag(tag)} aria-pressed={active} style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: '6px', background: active ? '#e0e7ff' : 'white', color: active ? '#3730a3' : '#374151', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>{tag} ({count})</button>;
                })}
              </div>

              {officeQuestError && <div style={{ padding: '12px', border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '6px', marginBottom: '16px' }}>{officeQuestError}</div>}
              {!officeQuestLoading && !officeQuestError && filteredOfficeQuestItems.length === 0 && <p className="placeholder-text">No cached Office quests match this filter.</p>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
                {filteredOfficeQuestItems.map(quest => (
                  <div key={quest.externalId} style={{ border: '1px solid #d1d5db', borderRadius: '8px', background: 'white', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1f2937' }}>{quest.title}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '3px' }}>{[quest.type, quest.subQuestCount ? `${quest.subQuestCount} subquests` : ''].filter(Boolean).join(' · ')}</div>
                    </div>
                    {quest.description && <p style={{ fontSize: '13px', color: '#4b5563', lineHeight: 1.45, margin: 0, whiteSpace: 'pre-line' }}>{quest.description}</p>}
                    {quest.tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>{quest.tags.map(tag => <span key={tag.externalId} style={{ padding: '3px 7px', borderRadius: '999px', background: tag.color || '#e0e7ff', color: '#1f2937', fontSize: '11px', fontWeight: 600 }}>{tag.name}</span>)}</div>}
                    {quest.imported ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: 'auto' }}>
                        <span style={{ color: '#047857', fontWeight: 600, fontSize: '13px' }}>Imported to Quest Tree</span>
                        <button onClick={() => handleReimportOfficeQuest(quest)} disabled={importingOfficeQuestId === quest.externalId} style={{ padding: '8px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: importingOfficeQuestId === quest.externalId ? 'wait' : 'pointer', opacity: importingOfficeQuestId === quest.externalId ? 0.7 : 1 }}>
                          {importingOfficeQuestId === quest.externalId ? 'Re-importing...' : 'Re-import'}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleImportOfficeQuest(quest)} disabled={importingOfficeQuestId === quest.externalId} style={{ marginTop: 'auto', padding: '8px 12px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: importingOfficeQuestId === quest.externalId ? 'wait' : 'pointer', opacity: importingOfficeQuestId === quest.externalId ? 0.7 : 1 }}>
                        {importingOfficeQuestId === quest.externalId ? 'Importing...' : 'Import to Quest Tree'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Preorders Section */}
        {activeSection === 'preorders' && (
          <div className="preorders-section">
            <h2 className="section-title">Preordered Users</h2>
            {preorders.length === 0 ? (
              <p className="placeholder-text">No preorders found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {preorders.map((preorder) => (
                  <div
                    key={preorder._id}
                    style={{
                      padding: '20px',
                      background: 'white',
                      border: '2px solid #e5e7eb',
                      borderRadius: '12px',
                      display: 'flex',
                      gap: '20px',
                      alignItems: 'flex-start'
                    }}
                  >
                    {/* Item Image */}
                    <div style={{
                      width: '120px',
                      height: '120px',
                      background: '#f3f4f6',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}>
                      <img
                        src={preorder.shopItem.imageUrl}
                        alt={preorder.shopItem.title}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23f3f4f6"/><text x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af">No Image</text></svg>';
                        }}
                      />
                    </div>

                    {/* Preorder Info */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#14306d' }}>
                        {preorder.shopItem.title}
                      </div>
                      <div style={{ fontSize: '16px', color: '#4e98ff', fontWeight: '600' }}>
                        {preorder.shopItem.price} AP
                      </div>
                      
                      {/* User Info */}
                      <div style={{ marginTop: '12px', padding: '12px', background: '#f3f4f6', borderRadius: '8px' }}>
                        {preorder.user ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {preorder.user.avatar && (
                              <img
                                src={`https://cdn.discordapp.com/avatars/${preorder.userId}/${preorder.user.avatar}.png`}
                                alt={preorder.user.username}
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '50%'
                                }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(preorder.userId, 10)) % 5}.png`;
                                }}
                              />
                            )}
                            {!preorder.user.avatar && (
                              <img
                                src={`https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(preorder.userId, 10)) % 5}.png`}
                                alt={preorder.user.username}
                                style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '50%'
                                }}
                              />
                            )}
                            <div>
                              <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                                {preorder.user.nickname || preorder.user.username}
                                {preorder.user.discriminator && (
                                  <span style={{ color: '#6b7280' }}>#{preorder.user.discriminator}</span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                Discord ID: {preorder.userId}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '14px', color: '#6b7280' }}>
                            User not found (Discord ID: {preorder.userId})
                          </div>
                        )}
                      </div>

                      {/* Status and Date */}
                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '14px', color: '#6b7280' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          background: preorder.status === 'preorder' ? '#fef3c7' : '#d1fae5',
                          color: preorder.status === 'preorder' ? '#92400e' : '#065f46'
                        }}>
                          {preorder.status === 'preorder' ? '📋 Preorder' : '✅ Completed'}
                        </div>
                        <div>
                          Purchased: {new Date(preorder.purchasedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Shop Item Analytics Modal */}
        {showShopItemAnalytics && selectedShopItemAnalytics && (
          <div className="modal-overlay" onClick={() => { setShowShopItemAnalytics(false); setSelectedShopItemAnalytics(null); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ marginBottom: '20px', fontSize: '24px', fontWeight: '700', color: '#14306d' }}>
                📊 Analytics: {selectedShopItemAnalytics.itemTitle}
              </h3>
              
              <div style={{ marginBottom: '16px', padding: '12px', background: '#f3f4f6', borderRadius: '8px' }}>
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                  Total Preorders: <span style={{ color: '#667eea', fontSize: '20px' }}>{selectedShopItemAnalytics.purchases.length}</span>
                </div>
              </div>

              {selectedShopItemAnalytics.purchases.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '16px' }}>
                  No preorders for this item yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedShopItemAnalytics.purchases.map((purchase, index) => (
                    <div
                      key={index}
                      style={{
                        padding: '16px',
                        background: 'white',
                        border: '2px solid #e5e7eb',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '16px'
                      }}
                    >
                      {purchase.user ? (
                        <>
                          {purchase.user.avatar && (
                            <img
                              src={`https://cdn.discordapp.com/avatars/${purchase.userId}/${purchase.user.avatar}.png`}
                              alt={purchase.user.username}
                              style={{
                                width: '50px',
                                height: '50px',
                                borderRadius: '50%',
                                border: '2px solid #e5e7eb'
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(purchase.userId, 10)) % 5}.png`;
                              }}
                            />
                          )}
                          {!purchase.user.avatar && (
                            <img
                              src={`https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(purchase.userId, 10)) % 5}.png`}
                              alt={purchase.user.username}
                              style={{
                                width: '50px',
                                height: '50px',
                                borderRadius: '50%',
                                border: '2px solid #e5e7eb'
                              }}
                            />
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                              {purchase.user.nickname || purchase.user.username}
                              {purchase.user.discriminator && (
                                <span style={{ color: '#6b7280' }}>#{purchase.user.discriminator}</span>
                              )}
                            </div>
                            <div style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                              Discord ID: {purchase.userId}
                            </div>
                            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                              Purchased: {new Date(purchase.purchasedAt).toLocaleString()}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>
                            User Not Found
                          </div>
                          <div style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                            Discord ID: {purchase.userId}
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                            Purchased: {new Date(purchase.purchasedAt).toLocaleString()}
                          </div>
                        </div>
                      )}
                      <div style={{
                        padding: '6px 12px',
                        background: purchase.status === 'preorder' ? '#fef3c7' : '#d1fae5',
                        color: purchase.status === 'preorder' ? '#92400e' : '#065f46',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {purchase.status === 'preorder' ? '📋 Preorder' : '✅ Completed'}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setShowShopItemAnalytics(false);
                    setSelectedShopItemAnalytics(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skill Progress Modal */}
        {showSkillProgressModal && selectedUserForProgress && (
          <div className="modal-overlay" onClick={() => { setShowSkillProgressModal(false); setSelectedUserForProgress(null); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ 
              maxWidth: '1000px', 
              maxHeight: '90vh', 
              overflowY: 'auto',
              padding: '32px',
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}>
              {/* Header */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '32px',
                paddingBottom: '20px',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <div>
                  <h3 style={{ 
                    fontSize: '28px', 
                    fontWeight: '700', 
                    color: '#1f2937', 
                    margin: '0 0 8px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '32px' }}>🌳</span>
                    Quest Tree Progress
                  </h3>
                  <p style={{ 
                    fontSize: '16px', 
                    color: '#6b7280', 
                    margin: 0,
                    fontWeight: '500'
                  }}>
                    {selectedUserForProgress.username}
                  </p>
                </div>
                <button
                  onClick={() => { setShowSkillProgressModal(false); setSelectedUserForProgress(null); }}
                  style={{
                    background: '#f3f4f6',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: '#6b7280',
                    padding: '8px',
                    width: '40px',
                    height: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '8px',
                    transition: 'all 0.2s',
                    fontWeight: '600'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e5e7eb';
                    e.currentTarget.style.color = '#374151';
                    e.currentTarget.style.transform = 'rotate(90deg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                    e.currentTarget.style.color = '#6b7280';
                    e.currentTarget.style.transform = 'rotate(0deg)';
                  }}
                >
                  ×
                </button>
              </div>

              {(() => {
                const unlockedSkills = selectedUserForProgress.unlockedSkills || [];
                const activeSkills = skills.filter(s => s.isActive);
                const totalSkills = activeSkills.length;
                const unlockedCount = unlockedSkills.length;
                const percentage = totalSkills > 0 ? Math.round((unlockedCount / totalSkills) * 100) : 0;
                
                // Group skills by node type
                const skillsByType: { [key: string]: { unlocked: Skill[], locked: Skill[] } } = {
                  adventure: { unlocked: [], locked: [] },
                  asset: { unlocked: [], locked: [] },
                  quest: { unlocked: [], locked: [] },
                  marker: { unlocked: [], locked: [] },
                  EXTRA: { unlocked: [], locked: [] }
                };

                activeSkills.forEach(skill => {
                  const nodeType = skill.nodeType || (skill.nodeColor === 'white' ? 'adventure' : skill.nodeColor === 'blue' ? 'asset' : skill.nodeColor === 'green' ? 'quest' : skill.nodeColor === 'yellow' ? 'marker' : 'EXTRA');
                  const isUnlocked = unlockedSkills.includes(skill._id);
                  
                  if (skillsByType[nodeType]) {
                    if (isUnlocked) {
                      skillsByType[nodeType].unlocked.push(skill);
                    } else {
                      skillsByType[nodeType].locked.push(skill);
                    }
                  }
                });

                const getNodeTypeLabel = (type: string) => {
                  const labels: { [key: string]: string } = {
                    adventure: 'Adventure (White)',
                    asset: 'Asset (Blue)',
                    quest: 'Quest (Green)',
                    marker: 'Marker (Yellow)',
                    EXTRA: 'EXTRA (Purple)'
                  };
                  return labels[type] || type;
                };

                const getNodeTypeColor = (type: string) => {
                  const colors: { [key: string]: string } = {
                    adventure: '#ffffff',
                    asset: '#3b82f6',
                    quest: '#10b981',
                    marker: '#fbbf24',
                    EXTRA: '#a855f7'
                  };
                  return colors[type] || '#6b7280';
                };

                return (
                  <>
                    {/* Overall Progress */}
                    <div style={{ 
                      padding: '28px', 
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      borderRadius: '16px',
                      marginBottom: '32px',
                      color: 'white',
                      boxShadow: '0 10px 15px -3px rgba(102, 126, 234, 0.3), 0 4px 6px -2px rgba(102, 126, 234, 0.2)'
                    }}>
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: '600', 
                        marginBottom: '16px', 
                        opacity: 0.95,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        📊 Overall Progress
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '20px' }}>
                        <div style={{ 
                          fontSize: '64px', 
                          fontWeight: '800',
                          lineHeight: '1',
                          textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                        }}>
                          {percentage}%
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ 
                            fontSize: '22px', 
                            fontWeight: '700', 
                            marginBottom: '12px',
                            textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                          }}>
                            {unlockedCount} / {totalSkills} Quests Unlocked
                          </div>
                          <div style={{ 
                            width: '100%', 
                            height: '16px', 
                            background: 'rgba(255, 255, 255, 0.25)', 
                            borderRadius: '10px',
                            overflow: 'hidden',
                            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)'
                          }}>
                            <div style={{
                              width: `${percentage}%`,
                              height: '100%',
                              background: 'linear-gradient(90deg, #ffffff 0%, #f0f0f0 100%)',
                              transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                              borderRadius: '10px',
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                              position: 'relative',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)',
                                animation: 'shimmer 2s infinite'
                              }} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        gap: '24px', 
                        marginTop: '20px',
                        paddingTop: '20px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.2)'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Unlocked</div>
                          <div style={{ fontSize: '20px', fontWeight: '700' }}>{unlockedCount}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Locked</div>
                          <div style={{ fontSize: '20px', fontWeight: '700' }}>{totalSkills - unlockedCount}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '12px', opacity: 0.9, marginBottom: '4px' }}>Total</div>
                          <div style={{ fontSize: '20px', fontWeight: '700' }}>{totalSkills}</div>
                        </div>
                      </div>
                    </div>

                    {/* Breakdown by Node Type */}
                    <div style={{ marginBottom: '32px' }}>
                      <h4 style={{ 
                        fontSize: '20px', 
                        fontWeight: '700', 
                        color: '#1f2937', 
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}>
                        <span>📈</span>
                        Progress by Node Type
                      </h4>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
                        gap: '20px' 
                      }}>
                        {Object.entries(skillsByType).map(([type, { unlocked, locked }]) => {
                          const typeTotal = unlocked.length + locked.length;
                          const typePercentage = typeTotal > 0 ? Math.round((unlocked.length / typeTotal) * 100) : 0;
                          
                          return (
                            <div key={type} style={{
                              padding: '20px',
                              background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
                              border: `2px solid ${getNodeTypeColor(type)}`,
                              borderRadius: '14px',
                              borderLeftWidth: '8px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                              transition: 'all 0.3s ease',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-4px)';
                              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                            }}
                            >
                              <div style={{ 
                                fontSize: '13px', 
                                fontWeight: '700', 
                                color: '#374151',
                                marginBottom: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                              }}>
                                <span style={{
                                  width: '16px',
                                  height: '16px',
                                  borderRadius: '50%',
                                  background: getNodeTypeColor(type),
                                  display: 'inline-block',
                                  boxShadow: `0 0 0 3px ${getNodeTypeColor(type)}33`
                                }} />
                                {getNodeTypeLabel(type)}
                              </div>
                              <div style={{ 
                                fontSize: '36px', 
                                fontWeight: '800', 
                                color: getNodeTypeColor(type), 
                                marginBottom: '8px',
                                lineHeight: '1'
                              }}>
                                {typePercentage}%
                              </div>
                              <div style={{ 
                                fontSize: '14px', 
                                color: '#6b7280',
                                marginBottom: '12px',
                                fontWeight: '500'
                              }}>
                                {unlocked.length} / {typeTotal} unlocked
                              </div>
                              <div style={{ 
                                width: '100%', 
                                height: '8px', 
                                background: '#e5e7eb', 
                                borderRadius: '4px',
                                overflow: 'hidden'
                              }}>
                                <div style={{
                                  width: `${typePercentage}%`,
                                  height: '100%',
                                  background: getNodeTypeColor(type),
                                  transition: 'width 0.5s ease',
                                  borderRadius: '4px'
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Unlocked Skills List */}
                    <div style={{ marginBottom: '32px' }}>
                      <h4 style={{ 
                        fontSize: '20px', 
                        fontWeight: '700', 
                        color: '#1f2937', 
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}>
                        <span>✅</span>
                        Unlocked Quests 
                        <span style={{ 
                          fontSize: '16px', 
                          fontWeight: '600', 
                          color: '#10b981',
                          background: '#d1fae5',
                          padding: '4px 12px',
                          borderRadius: '12px'
                        }}>
                          {unlockedCount}
                        </span>
                      </h4>
                      {unlockedCount === 0 ? (
                        <div style={{ 
                          padding: '40px', 
                          textAlign: 'center', 
                          color: '#9ca3af', 
                          background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)', 
                          borderRadius: '12px',
                          border: '2px dashed #e5e7eb'
                        }}>
                          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
                          <div style={{ fontSize: '16px', fontWeight: '600' }}>No quests unlocked yet</div>
                          <div style={{ fontSize: '14px', marginTop: '4px' }}>This user hasn't unlocked any quests in the quest tree</div>
                        </div>
                      ) : (
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                          gap: '16px',
                          maxHeight: '400px',
                          overflowY: 'auto',
                          padding: '8px',
                          marginRight: '-8px'
                        }}>
                          {activeSkills
                            .filter(skill => unlockedSkills.includes(skill._id))
                            .map(skill => {
                              const nodeType = skill.nodeType || (skill.nodeColor === 'white' ? 'adventure' : skill.nodeColor === 'blue' ? 'asset' : skill.nodeColor === 'green' ? 'quest' : skill.nodeColor === 'yellow' ? 'marker' : 'EXTRA');
                              return (
                                <div key={skill._id} style={{
                                  padding: '16px',
                                  background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
                                  border: `2px solid ${getNodeTypeColor(nodeType)}`,
                                  borderRadius: '12px',
                                  borderLeftWidth: '6px',
                                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                                  transition: 'all 0.2s ease',
                                  cursor: 'pointer'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                                  e.currentTarget.style.borderColor = getNodeTypeColor(nodeType);
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                                }}
                                >
                                  <div style={{ 
                                    fontSize: '15px', 
                                    fontWeight: '700', 
                                    color: '#1f2937', 
                                    marginBottom: '8px',
                                    lineHeight: '1.3'
                                  }}>
                                    {skill.title}
                                  </div>
                                  <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px',
                                    fontSize: '12px', 
                                    color: '#6b7280',
                                    fontWeight: '500'
                                  }}>
                                    <span style={{
                                      background: '#e5e7eb',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: '600'
                                    }}>
                                      Stage {skill.layer}
                                    </span>
                                    <span style={{
                                      background: `${getNodeTypeColor(nodeType)}20`,
                                      color: getNodeTypeColor(nodeType),
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: '600'
                                    }}>
                                      {getNodeTypeLabel(nodeType).split(' ')[0]}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* Locked Skills Summary */}
                    {totalSkills - unlockedCount > 0 && (
                      <div>
                        <h4 style={{ 
                          fontSize: '20px', 
                          fontWeight: '700', 
                          color: '#1f2937', 
                          marginBottom: '20px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          <span>🔒</span>
                          Locked Skills
                          <span style={{ 
                            fontSize: '16px', 
                            fontWeight: '600', 
                            color: '#ef4444',
                            background: '#fee2e2',
                            padding: '4px 12px',
                            borderRadius: '12px'
                          }}>
                            {totalSkills - unlockedCount}
                          </span>
                        </h4>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                          gap: '16px',
                          maxHeight: '400px',
                          overflowY: 'auto',
                          padding: '8px',
                          marginRight: '-8px'
                        }}>
                          {activeSkills
                            .filter(skill => !unlockedSkills.includes(skill._id))
                            .map(skill => {
                              const nodeType = skill.nodeType || (skill.nodeColor === 'white' ? 'adventure' : skill.nodeColor === 'blue' ? 'asset' : skill.nodeColor === 'green' ? 'quest' : skill.nodeColor === 'yellow' ? 'marker' : 'EXTRA');
                              return (
                                <div key={skill._id} style={{
                                  padding: '16px',
                                  background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
                                  border: '2px solid #e5e7eb',
                                  borderRadius: '12px',
                                  opacity: 0.75,
                                  transition: 'all 0.2s ease',
                                  cursor: 'pointer',
                                  position: 'relative'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = '1';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = '0.75';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                                >
                                  <div style={{ 
                                    fontSize: '15px', 
                                    fontWeight: '600', 
                                    color: '#9ca3af', 
                                    marginBottom: '8px',
                                    lineHeight: '1.3',
                                    textDecoration: 'line-through',
                                    textDecorationColor: '#d1d5db'
                                  }}>
                                    {skill.title}
                                  </div>
                                  <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px',
                                    fontSize: '12px', 
                                    color: '#d1d5db',
                                    fontWeight: '500'
                                  }}>
                                    <span style={{
                                      background: '#e5e7eb',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: '600'
                                    }}>
                                      Stage {skill.layer}
                                    </span>
                                    <span style={{
                                      background: '#f3f4f6',
                                      color: '#9ca3af',
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '11px',
                                      fontWeight: '600'
                                    }}>
                                      {getNodeTypeLabel(nodeType).split(' ')[0]}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                marginTop: '32px',
                paddingTop: '24px',
                borderTop: '2px solid #e5e7eb'
              }}>
                <button
                  onClick={() => { setShowSkillProgressModal(false); setSelectedUserForProgress(null); }}
                  style={{ 
                    padding: '12px 32px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 6px -1px rgba(102, 126, 234, 0.3), 0 2px 4px -1px rgba(102, 126, 234, 0.2)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(102, 126, 234, 0.4), 0 4px 6px -2px rgba(102, 126, 234, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(102, 126, 234, 0.3), 0 2px 4px -1px rgba(102, 126, 234, 0.2)';
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Section */}
        {activeSection === 'settings' && (
          <div className="settings-section">
            <h2 className="section-title">Settings</h2>
            <p className="placeholder-text">Admin settings coming soon...</p>
          </div>
        )}
      </div>

        {/* Member Management Modal */}
        {showMemberManagement && selectedMember && (
          <div className="modal-overlay" onClick={() => setShowMemberManagement(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Manage: {selectedMember.username}</h3>
              
              <div className="member-stats-display">
                <div className="stat-item">
                  <span className="stat-label">Asset Points:</span>
                  <span className="stat-value">{selectedMember.assetPoints}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Tech Tokens:</span>
                  <span className="stat-value">{selectedMember.techTokens}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Voice Today:</span>
                  <span className="stat-value">{selectedMember.voiceMinutesToday}m</span>
                </div>
              </div>

              <div className="asset-points-management">
                <h4>Update Asset Points</h4>
                <input
                  type="number"
                  min="0"
                  value={assetPointsAmount}
                  onChange={(e) => setAssetPointsAmount(Number(e.target.value))}
                  placeholder="Amount"
                  className="points-input"
                />
                <div className="points-buttons">
                  <button className="add-btn" onClick={() => handleUpdateAssetPoints('add')}>
                    ➕ Add Points
                  </button>
                  <button className="subtract-btn" onClick={() => handleUpdateAssetPoints('subtract')}>
                    ➖ Subtract Points
                  </button>
                </div>
              </div>

              <button className="close-modal-btn" onClick={() => {
                setShowMemberManagement(false);
                setSelectedMember(null);
                setAssetPointsAmount(0);
              }}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* Create Skill Modal */}
        {showCreateSkill && (
          <div className="modal-overlay" onClick={() => {
            setShowCreateSkill(false);
            resetSkillForm();
          }}>
            <div className="modal-content skill-modal" onClick={(e) => e.stopPropagation()}>
              <h3>✨ Create New Quest</h3>
              
              <div className="skill-form">
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Title *</label>
                    <input
                      type="text"
                      value={skillTitle}
                      onChange={(e) => setSkillTitle(e.target.value)}
                      placeholder="Quest title"
                      className="skill-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Description *</label>
                    <div style={{ marginBottom: '8px' }}>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="image-upload-input"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;

                          const formData = new FormData();
                          formData.append('image', file);

                          try {
                            const response = await axios.post('/api/upload/image', formData, {
                              headers: { 'Content-Type': 'multipart/form-data' }
                            });

                            if (response.data.success) {
                              const imageUrl = response.data.url;
                              const altText = prompt('Enter alt text (optional):') || 'Image';
                              const imageSyntax = `![${altText}](${imageUrl})`;
                              const textarea = document.querySelector('.skill-textarea') as HTMLTextAreaElement;
                              const cursorPos = textarea?.selectionStart || skillDescription.length;
                              const newDescription = 
                                skillDescription.substring(0, cursorPos) + 
                                imageSyntax + 
                                skillDescription.substring(cursorPos);
                              setSkillDescription(newDescription);
                              // Focus back on textarea
                              setTimeout(() => {
                                if (textarea) {
                                  textarea.focus();
                                  textarea.setSelectionRange(cursorPos + imageSyntax.length, cursorPos + imageSyntax.length);
                                }
                              }, 0);
                            }
                          } catch (error: any) {
                            alert(error.response?.data?.error || 'Failed to upload image');
                          }

                          // Reset file input
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const imageUrl = prompt('Enter image URL:');
                          if (imageUrl) {
                            const altText = prompt('Enter alt text (optional):') || 'Image';
                            const imageSyntax = `![${altText}](${imageUrl})`;
                            const textarea = document.querySelector('.skill-textarea') as HTMLTextAreaElement;
                            const cursorPos = textarea?.selectionStart || skillDescription.length;
                            const newDescription = 
                              skillDescription.substring(0, cursorPos) + 
                              imageSyntax + 
                              skillDescription.substring(cursorPos);
                            setSkillDescription(newDescription);
                            // Focus back on textarea
                            setTimeout(() => {
                              if (textarea) {
                                textarea.focus();
                                textarea.setSelectionRange(cursorPos + imageSyntax.length, cursorPos + imageSyntax.length);
                              }
                            }, 0);
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          marginRight: '8px'
                        }}
                      >
                        📷 Insert Image URL
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          document.getElementById('image-upload-input')?.click();
                        }}
                        style={{
                          padding: '6px 12px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          marginRight: '8px'
                        }}
                      >
                        📤 Upload Image
                      </button>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        Use format: ![alt text](image-url)
                      </span>
                    </div>
                    <textarea
                      value={skillDescription}
                      onChange={(e) => setSkillDescription(e.target.value)}
                      placeholder="Detailed quest description. Use ![alt text](image-url) to add images."
                      className="skill-textarea"
                      rows={6}
                    />
                    {renderLinkedImagePreviews(skillDescription)}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Node Color/Type *</label>
                    <select
                      value={skillNodeColor}
                      onChange={(e) => {
                        const newColor = e.target.value as any;
                        setSkillNodeColor(newColor);
                        // Reset cost and AP fields when changing node type
                        if (newColor === 'green') {
                          setSkillCost(0);
                          setSkillNextQuestCost(25);
                        } else if (newColor === 'white' || newColor === 'yellow') {
                          // Adventure or Marker - no cost
                          setSkillCost(0);
                          setSkillMinAP(undefined);
                          setSkillMaxAP(undefined);
                        } else {
                          // Asset or EXTRA - may have cost
                          setSkillMinAP(undefined);
                          setSkillMaxAP(undefined);
                        }
                      }}
                      className="skill-input"
                    >
                      <option value="blue">Blue (Asset)</option>
                      <option value="yellow">Yellow (Marker)</option>
                      <option value="green">Green (Quest)</option>
                      <option value="white">White (Adventure)</option>
                      <option value="purple">Purple (EXTRA)</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  {skillNodeColor === 'green' && (
                    <div className="form-group">
                      <label>Next Quest Cost (Asset Points) *</label>
                      <input
                        type="number"
                        min="0"
                        value={skillNextQuestCost}
                        onChange={(e) => setSkillNextQuestCost(Math.max(0, Number(e.target.value)))}
                        className="skill-input"
                      />
                    </div>
                  )}
                  {(skillNodeColor === 'blue' || skillNodeColor === 'purple') && (
                    <div className="form-group">
                      <label>Cost (Asset Points) *</label>
                      <input
                        type="number"
                        min="0"
                        value={skillCost}
                        onChange={(e) => setSkillCost(Number(e.target.value))}
                        className="skill-input"
                      />
                    </div>
                  )}
                </div>

                {/* Quest Node AP Guidelines - only show for Quest (green) nodes */}
                {skillNodeColor === 'green' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Min AP (Recommended)</label>
                      <input
                        type="text"
                        value={skillMinAP !== undefined && skillMinAP !== null ? skillMinAP.toString() : ''}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          if (value === '') {
                            setSkillMinAP(undefined);
                          } else {
                            const numValue = Number(value);
                            if (!isNaN(numValue) && numValue >= 0) {
                              setSkillMinAP(numValue);
                            } else {
                              // Allow typing, but don't update state if invalid
                              // This allows user to type freely
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value === '') {
                            setSkillMinAP(undefined);
                          } else {
                            const numValue = Number(value);
                            if (!isNaN(numValue) && numValue >= 0) {
                              setSkillMinAP(numValue);
                            } else {
                              setSkillMinAP(undefined);
                              e.target.value = '';
                            }
                          }
                        }}
                        placeholder="Optional"
                        className="skill-input"
                      />
                    </div>
                    <div className="form-group">
                      <label>Max AP (Recommended)</label>
                      <input
                        type="text"
                        value={skillMaxAP !== undefined && skillMaxAP !== null ? skillMaxAP.toString() : ''}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          if (value === '') {
                            setSkillMaxAP(undefined);
                          } else {
                            const numValue = Number(value);
                            if (!isNaN(numValue) && numValue >= 0) {
                              setSkillMaxAP(numValue);
                            } else {
                              // Allow typing, but don't update state if invalid
                              // This allows user to type freely
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value === '') {
                            setSkillMaxAP(undefined);
                          } else {
                            const numValue = Number(value);
                            if (!isNaN(numValue) && numValue >= 0) {
                              setSkillMaxAP(numValue);
                            } else {
                              setSkillMaxAP(undefined);
                              e.target.value = '';
                            }
                          }
                        }}
                        placeholder="Optional"
                        className="skill-input"
                      />
                    </div>
                  </div>
                )}

                {/* Info message for free nodes */}
                {(skillNodeColor === 'white' || skillNodeColor === 'yellow') && (
                  <div style={{ 
                    padding: '12px', 
                    background: '#dbeafe', 
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '14px',
                    color: '#1e40af'
                  }}>
                    ℹ️ {skillNodeColor === 'white' ? 'Adventure' : 'Marker'} nodes are free and do not require Asset Points.
                  </div>
                )}

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Preview Clips (YouTube URLs - one per line)</label>
                    <textarea
                      value={skillPreviewClip}
                      onChange={(e) => setSkillPreviewClip(e.target.value)}
                      placeholder="Enter YouTube URLs, one per line&#10;https://youtube.com/watch?v=..."
                      className="skill-input"
                      rows={3}
                    />
                  </div>
                </div>

                {/* Content fields - hidden for Adventure (white) nodes */}
                {skillNodeColor !== 'white' && (
                  <>
                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Content - YouTube Links (one per line)</label>
                        <textarea
                          value={skillContentYouTube}
                          onChange={(e) => setSkillContentYouTube(e.target.value)}
                          placeholder="Enter YouTube URLs, one per line&#10;https://youtube.com/watch?v=..."
                          className="skill-input"
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Content - Google Drive Links (one per line)</label>
                        <textarea
                          value={skillContentGoogleDrive}
                          onChange={(e) => setSkillContentGoogleDrive(e.target.value)}
                          placeholder="Enter Google Drive URLs, one per line&#10;https://drive.google.com/..."
                          className="skill-input"
                          rows={3}
                        />
                      </div>
                    </div>
                  </>
                )}
                {renderSubQuestEditor()}
              </div>

              <div className="modal-actions">
                <button className="submit-btn" onClick={handleCreateSkill}>
                  Create Quest
                </button>
                <button className="cancel-btn" onClick={() => {
                  setShowCreateSkill(false);
                  resetSkillForm();
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Skill Detail/Edit Modal */}
        {showSkillDetail && selectedSkill && (
          <div className="modal-overlay" onClick={() => {
            setShowSkillDetail(false);
            setEditingSkill(false);
            resetSkillForm();
          }}>
            <div className={`modal-content skill-modal skill-detail-modal ${editingSkill ? 'node-edit-modal' : ''}`} onClick={(e) => e.stopPropagation()}>
              {!editingSkill ? (
                <>
                  <div className="skill-detail-header">
                    <h3>{selectedSkill.title}</h3>
                    <span className="skill-detail-cost">{selectedSkill.cost} AP</span>
                  </div>
                  
                  <div className="skill-detail-meta">
                    <span className="skill-layer-badge">Stage {selectedSkill.layer}</span>
                    <span className="skill-position-badge">Order {selectedSkill.position}</span>
                  </div>

                  <div className="skill-detail-description">
                    <h4>Description</h4>
                    <div style={{ lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                      {renderDescriptionWithImages(selectedSkill.description)}
                    </div>
                  </div>

                  {selectedSkill.subQuests && selectedSkill.subQuests.length > 0 && (
                    <div className="skill-detail-description">
                      <h4>Quest Steps ({selectedSkill.subQuests.length})</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selectedSkill.subQuests.map((subQuest, index) => (
                          <div key={subQuest.externalId || `${subQuest.title}-${index}`} style={{ padding: '10px', border: '1px solid #cfe0f5', borderRadius: '7px', background: '#f7fbff' }}>
                            <strong>{index + 1}. {subQuest.title}</strong>{subQuest.type && <span style={{ color: '#4e98ff', marginLeft: '8px', fontSize: '12px' }}>{subQuest.type}</span>}
                            {subQuest.descriptionParts?.length ? (
                              <div style={{ marginTop: '8px', display: 'grid', gap: '8px' }}>
                                {subQuest.descriptionParts.map((part, partIndex) => part.type === 'Image' ? (
                                  <img key={partIndex} src={part.content} alt={subQuest.title} style={{ display: 'block', maxWidth: '100%', maxHeight: '360px', objectFit: 'contain', borderRadius: '6px' }} />
                                ) : <div key={partIndex} style={{ whiteSpace: 'pre-wrap' }}>{renderDescriptionWithImages(part.content)}</div>)}
                              </div>
                            ) : subQuest.description && <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap' }}>{renderDescriptionWithImages(subQuest.description)}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedSkill.previewClip && selectedSkill.previewClip.length > 0 && (
                    <div className="skill-preview-section">
                      <h4>Preview Clips</h4>
                      {selectedSkill.previewClip.map((clip, index) => (
                        <div key={index} className="video-embed-container" style={{ marginBottom: index < selectedSkill.previewClip!.length - 1 ? '16px' : '0' }}>
                          <iframe
                            src={getYouTubeEmbedUrl(clip)}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title={`Preview Clip ${index + 1}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {((selectedSkill.contentYouTube && selectedSkill.contentYouTube.length > 0) || 
                    (selectedSkill.contentGoogleDrive && selectedSkill.contentGoogleDrive.length > 0)) && (
                    <div className="skill-content-section">
                      <h4>Content Links</h4>
                      {selectedSkill.contentYouTube && selectedSkill.contentYouTube.map((link, index) => (
                        <div key={`youtube-${index}`} className="content-link-item">
                          <span className="content-icon">📺</span>
                          <a href={link} target="_blank" rel="noopener noreferrer">
                            YouTube Content {selectedSkill.contentYouTube!.length > 1 ? `${index + 1}` : ''}
                          </a>
                        </div>
                      ))}
                      {selectedSkill.contentGoogleDrive && selectedSkill.contentGoogleDrive.map((link, index) => (
                        <div key={`gdrive-${index}`} className="content-link-item">
                          <span className="content-icon">📂</span>
                          <a href={link} target="_blank" rel="noopener noreferrer">
                            Google Drive Content {selectedSkill.contentGoogleDrive!.length > 1 ? `${index + 1}` : ''}
                          </a>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="modal-actions">
                    <button className="edit-btn" onClick={() => startEditingSkill(selectedSkill)}>
                      ✏️ Edit
                    </button>
                    <button className="duplicate-btn" onClick={() => handleDuplicateSkill(selectedSkill)}>
                      ⧉ Duplicate
                    </button>
                    <button className="delete-btn" onClick={() => handleDeleteSkill(selectedSkill._id)}>
                      🗑️ Delete
                    </button>
                    <button className="cancel-btn" onClick={() => {
                      setShowSkillDetail(false);
                      resetSkillForm();
                    }}>
                      Close
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="node-edit-header">
                    <div>
                      <h3>✏️ Edit Quest</h3>
                    </div>
                  </div>
                  <div className="node-edit-workspace">
                    <section className="node-edit-fields">
                      <div className="skill-form">
                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Title *</label>
                        <input
                          type="text"
                          value={skillTitle}
                          onChange={(e) => setSkillTitle(e.target.value)}
                          className="skill-input"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Description *</label>
                        <div style={{ marginBottom: '8px' }}>
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            id="image-upload-input-edit"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              const formData = new FormData();
                              formData.append('image', file);

                              try {
                                const response = await axios.post('/api/upload/image', formData, {
                                  headers: { 'Content-Type': 'multipart/form-data' }
                                });

                                if (response.data.success) {
                                  const imageUrl = response.data.url;
                                  const altText = prompt('Enter alt text (optional):') || 'Image';
                                  const imageSyntax = `![${altText}](${imageUrl})`;
                                  const textarea = document.querySelector('.skill-textarea') as HTMLTextAreaElement;
                                  const cursorPos = textarea?.selectionStart || skillDescription.length;
                                  const newDescription = 
                                    skillDescription.substring(0, cursorPos) + 
                                    imageSyntax + 
                                    skillDescription.substring(cursorPos);
                                  setSkillDescription(newDescription);
                                  // Focus back on textarea
                                  setTimeout(() => {
                                    if (textarea) {
                                      textarea.focus();
                                      textarea.setSelectionRange(cursorPos + imageSyntax.length, cursorPos + imageSyntax.length);
                                    }
                                  }, 0);
                                }
                              } catch (error: any) {
                                alert(error.response?.data?.error || 'Failed to upload image');
                              }

                              // Reset file input
                              e.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const imageUrl = prompt('Enter image URL:');
                              if (imageUrl) {
                                const altText = prompt('Enter alt text (optional):') || 'Image';
                                const imageSyntax = `![${altText}](${imageUrl})`;
                                const textarea = document.querySelector('.skill-textarea') as HTMLTextAreaElement;
                                const cursorPos = textarea?.selectionStart || skillDescription.length;
                                const newDescription = 
                                  skillDescription.substring(0, cursorPos) + 
                                  imageSyntax + 
                                  skillDescription.substring(cursorPos);
                                setSkillDescription(newDescription);
                                // Focus back on textarea
                                setTimeout(() => {
                                  if (textarea) {
                                    textarea.focus();
                                    textarea.setSelectionRange(cursorPos + imageSyntax.length, cursorPos + imageSyntax.length);
                                  }
                                }, 0);
                              }
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              marginRight: '8px'
                            }}
                          >
                            📷 Insert Image URL
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              document.getElementById('image-upload-input-edit')?.click();
                            }}
                            style={{
                              padding: '6px 12px',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              marginRight: '8px'
                            }}
                          >
                            📤 Upload Image
                          </button>
                        </div>
                        <textarea
                          value={skillDescription}
                          onChange={(e) => setSkillDescription(e.target.value)}
                          placeholder="Detailed quest description"
                          className="skill-textarea"
                          rows={6}
                        />
                        {renderLinkedImagePreviews(skillDescription)}
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Node Color/Type *</label>
                        <select
                          value={skillNodeColor}
                          onChange={(e) => {
                            const newColor = e.target.value as any;
                            setSkillNodeColor(newColor);
                            // Reset cost and AP fields when changing node type
                            if (newColor === 'green') {
                              setSkillCost(0);
                              setSkillNextQuestCost(25);
                            } else if (newColor === 'white' || newColor === 'yellow') {
                              // Adventure or Marker - no cost
                              setSkillCost(0);
                              setSkillMinAP(undefined);
                              setSkillMaxAP(undefined);
                            } else {
                              // Asset or EXTRA - may have cost
                              setSkillMinAP(undefined);
                              setSkillMaxAP(undefined);
                            }
                          }}
                          className="skill-input"
                        >
                          <option value="blue">Blue (Asset)</option>
                          <option value="yellow">Yellow (Marker)</option>
                          <option value="green">Green (Quest)</option>
                          <option value="white">White (Adventure)</option>
                          <option value="purple">Purple (EXTRA)</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      {skillNodeColor === 'green' && (
                        <div className="form-group">
                          <label>Next Quest Cost (Asset Points) *</label>
                          <input
                            type="number"
                            min="0"
                            value={skillNextQuestCost}
                            onChange={(e) => setSkillNextQuestCost(Math.max(0, Number(e.target.value)))}
                            className="skill-input"
                          />
                        </div>
                      )}
                      {(skillNodeColor === 'blue' || skillNodeColor === 'purple') && (
                        <div className="form-group">
                          <label>Cost (Asset Points) *</label>
                          <input
                            type="number"
                            min="0"
                            value={skillCost}
                            onChange={(e) => setSkillCost(Number(e.target.value))}
                            className="skill-input"
                          />
                        </div>
                      )}
                    </div>

                    {/* Quest Node AP Guidelines - only show for Quest (green) nodes */}
                    {skillNodeColor === 'green' && (
                      <div className="form-row">
                        <div className="form-group">
                          <label>Min AP (Recommended)</label>
                          <input
                            type="text"
                            value={skillMinAP !== undefined && skillMinAP !== null ? skillMinAP.toString() : ''}
                            onChange={(e) => {
                              const value = e.target.value.trim();
                              if (value === '') {
                                setSkillMinAP(undefined);
                              } else {
                                const numValue = Number(value);
                                if (!isNaN(numValue) && numValue >= 0) {
                                  setSkillMinAP(numValue);
                                } else {
                                  // Allow typing, but don't update state if invalid
                                  // This allows user to type freely
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (value === '') {
                                setSkillMinAP(undefined);
                              } else {
                                const numValue = Number(value);
                                if (!isNaN(numValue) && numValue >= 0) {
                                  setSkillMinAP(numValue);
                                } else {
                                  setSkillMinAP(undefined);
                                  e.target.value = '';
                                }
                              }
                            }}
                            placeholder="Optional"
                            className="skill-input"
                          />
                        </div>
                        <div className="form-group">
                          <label>Max AP (Recommended)</label>
                          <input
                            type="text"
                            value={skillMaxAP !== undefined && skillMaxAP !== null ? skillMaxAP.toString() : ''}
                            onChange={(e) => {
                              const value = e.target.value.trim();
                              if (value === '') {
                                setSkillMaxAP(undefined);
                              } else {
                                const numValue = Number(value);
                                if (!isNaN(numValue) && numValue >= 0) {
                                  setSkillMaxAP(numValue);
                                } else {
                                  // Allow typing, but don't update state if invalid
                                  // This allows user to type freely
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const value = e.target.value.trim();
                              if (value === '') {
                                setSkillMaxAP(undefined);
                              } else {
                                const numValue = Number(value);
                                if (!isNaN(numValue) && numValue >= 0) {
                                  setSkillMaxAP(numValue);
                                } else {
                                  setSkillMaxAP(undefined);
                                  e.target.value = '';
                                }
                              }
                            }}
                            placeholder="Optional"
                            className="skill-input"
                          />
                        </div>
                      </div>
                    )}

                    {/* Info message for free nodes */}
                    {(skillNodeColor === 'white' || skillNodeColor === 'yellow') && (
                      <div style={{ 
                        padding: '12px', 
                        background: '#dbeafe', 
                        borderRadius: '8px',
                        marginBottom: '16px',
                        fontSize: '14px',
                        color: '#1e40af'
                      }}>
                        ℹ️ {skillNodeColor === 'white' ? 'Adventure' : 'Marker'} nodes are free and do not require Asset Points.
                      </div>
                    )}

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Preview Clips (YouTube URLs - one per line)</label>
                        <textarea
                          value={skillPreviewClip}
                          onChange={(e) => setSkillPreviewClip(e.target.value)}
                          className="skill-input"
                          rows={3}
                          placeholder="Enter YouTube URLs, one per line"
                        />
                      </div>
                    </div>

                    {/* Content fields - hidden for Adventure (white) nodes */}
                    {skillNodeColor !== 'white' && (
                      <>
                        <div className="form-row">
                          <div className="form-group full-width">
                            <label>Content - YouTube Links (one per line)</label>
                            <textarea
                              value={skillContentYouTube}
                              onChange={(e) => setSkillContentYouTube(e.target.value)}
                              className="skill-input"
                              rows={3}
                              placeholder="Enter YouTube URLs, one per line"
                            />
                          </div>
                        </div>

                        <div className="form-row">
                          <div className="form-group full-width">
                            <label>Content - Google Drive Links (one per line)</label>
                            <textarea
                              value={skillContentGoogleDrive}
                              onChange={(e) => setSkillContentGoogleDrive(e.target.value)}
                              className="skill-input"
                              rows={3}
                              placeholder="Enter Google Drive URLs, one per line"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Prerequisites</label>
                        <div style={{ marginBottom: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setShowPrerequisiteModal(true)}
                            style={{
                              padding: '8px 16px',
                              background: '#6366f1',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: '500'
                            }}
                          >
                            🔗 Select Custom Prerequisites
                          </button>
                        </div>
                        {skillPrerequisites.length > 0 ? (
                          <div style={{ 
                            padding: '12px', 
                            background: '#f3f4f6', 
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}>
                            {skillPrerequisites.map((prereqId) => {
                              const prereqSkill = skills.find(s => s._id === prereqId);
                              return prereqSkill ? (
                                <div key={prereqId} style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  padding: '8px',
                                  background: 'white',
                                  borderRadius: '6px'
                                }}>
                                  <span style={{ fontSize: '14px' }}>
                                    <span style={{ 
                                      display: 'inline-block',
                                      width: '12px',
                                      height: '12px',
                                      borderRadius: '50%',
                                      background: getNodeColor(prereqSkill.nodeColor),
                                      border: `2px solid ${getNodeStrokeColor(prereqSkill.nodeColor)}`,
                                      marginRight: '8px'
                                    }}></span>
                                    {prereqSkill.title} (Stage {prereqSkill.layer})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setSkillPrerequisites(skillPrerequisites.filter(id => id !== prereqId))}
                                    style={{
                                      padding: '4px 8px',
                                      background: '#ef4444',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: 'pointer',
                                      fontSize: '12px'
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          <div style={{ 
                            padding: '12px', 
                            background: '#f3f4f6', 
                            borderRadius: '8px',
                            color: '#6b7280',
                            fontSize: '14px',
                            fontStyle: 'italic'
                          }}>
                            No prerequisites selected
                          </div>
                        )}
                      </div>
                    </div>
                      </div>
                      {renderSubQuestEditor()}
                    </section>
                    {renderNodeEditPreview()}
                  </div>
                  <div className="modal-actions">
                    <button className="submit-btn" onClick={handleUpdateSkill}>
                      Save Changes
                    </button>
                    <button className="cancel-btn" onClick={() => {
                      setEditingSkill(false);
                      resetSkillForm();
                    }}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Prerequisite Selection Modal */}
        {showPrerequisiteModal && (
          <div className="modal-overlay" onClick={() => setShowPrerequisiteModal(false)}>
            <div className="modal-content connection-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
              <h3>🔗 Select Prerequisites</h3>
              <p className="connection-help" style={{ marginBottom: '16px' }}>
                Select quest nodes that must be unlocked before this quest can be unlocked:
              </p>
              
              <div style={{ 
                maxHeight: '400px', 
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {skills
                  .filter(s => !selectedSkill || s._id !== selectedSkill._id)
                  .map(skill => {
                    const isSelected = skillPrerequisites.includes(skill._id);
                    return (
                      <div 
                        key={skill._id}
                        onClick={() => {
                          if (isSelected) {
                            setSkillPrerequisites(skillPrerequisites.filter(id => id !== skill._id));
                          } else {
                            setSkillPrerequisites([...skillPrerequisites, skill._id]);
                          }
                        }}
                        style={{
                          padding: '12px',
                          background: isSelected ? '#dbeafe' : 'white',
                          border: `2px solid ${isSelected ? '#3b82f6' : '#e5e7eb'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ cursor: 'pointer' }}
                        />
                        <div style={{ 
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: getNodeColor(skill.nodeColor),
                          border: `2px solid ${getNodeStrokeColor(skill.nodeColor)}`,
                          flexShrink: 0
                        }}></div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '15px' }}>{skill.title}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            Stage {skill.layer} • Order {skill.position} • {skill.cost} AP
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="connection-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button 
                  className="cancel-btn" 
                  onClick={() => setShowPrerequisiteModal(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connection Modal */}
        {showConnectionModal && connectionSource && (
          <div className="modal-overlay" onClick={() => {
            setShowConnectionModal(false);
            setConnectionSource(null);
          }}>
            <div className="modal-content connection-modal" onClick={(e) => e.stopPropagation()}>
              <h3>🔗 Add Connection from "{connectionSource.title}"</h3>
              <p className="connection-help">Select a target quest to connect to:</p>
              
              {/* Arrowhead Toggle */}
              <div className="connection-options">
                <label className="connection-option-label">
                  <input 
                    type="checkbox" 
                    checked={connectionHasArrowhead}
                    onChange={(e) => setConnectionHasArrowhead(e.target.checked)}
                  />
                  <span>Show Arrowhead</span>
                </label>
              </div>
              
              <div className="connection-skills-grid">
                {skills.filter(s => s._id !== connectionSource._id).map(targetSkill => (
                  <div key={targetSkill._id} className="connection-skill-item">
                    <div className="connection-skill-info">
                      <div 
                        className="connection-skill-color" 
                        style={{ 
                          backgroundColor: getNodeColor(targetSkill.nodeColor),
                          border: `2px solid ${getNodeStrokeColor(targetSkill.nodeColor)}`
                        }}
                      />
                      <div>
                        <strong>{targetSkill.title}</strong>
                        <span className="connection-skill-layer">Stage {targetSkill.layer}</span>
                      </div>
                    </div>
                    <div className="connection-buttons">
                      <button 
                        className="connection-btn-normal"
                        onClick={() => handleAddConnection(targetSkill, 'normal')}
                        title="Add normal connection (purple arrow)"
                      >
                        ➜ Normal
                      </button>
                      <button 
                        className="connection-btn-special"
                        onClick={() => handleAddConnection(targetSkill, 'special')}
                        title="Add special connection (red arrow)"
                      >
                        ⚡ Special
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button className="cancel-btn" onClick={() => {
                setShowConnectionModal(false);
                setConnectionSource(null);
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Create Shop Item Modal */}
        {showCreateShopItem && (
          <div className="modal-overlay" onClick={() => { setShowCreateShopItem(false); resetShopItemForm(); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
              <h3>Create Shop Item</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    value={shopItemTitle}
                    onChange={(e) => setShopItemTitle(e.target.value)}
                    placeholder="Item title"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Description (Optional)
                  </label>
                  <textarea
                    value={shopItemDescription}
                    onChange={(e) => setShopItemDescription(e.target.value)}
                    placeholder="Item description"
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      padding: '10px',
                      fontSize: '16px',
                      fontFamily: 'Dongle, sans-serif',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Price (Asset Points) *
                  </label>
                  <input
                    type="text"
                    value={shopItemPrice.toString()}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      if (value === '') {
                        setShopItemPrice(0);
                      } else {
                        const numValue = Number(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                          setShopItemPrice(numValue);
                        }
                      }
                    }}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Image URL *
                  </label>
                  <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      id="shop-image-upload-input"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        const formData = new FormData();
                        formData.append('image', file);

                        try {
                          const response = await axios.post('/api/upload/image', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          });

                          if (response.data.success) {
                            setShopItemImageUrl(response.data.url);
                          }
                        } catch (error: any) {
                          alert(error.response?.data?.error || 'Failed to upload image');
                        }

                        // Reset file input
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById('shop-image-upload-input')?.click();
                      }}
                      style={{
                        padding: '6px 12px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      📤 Upload Image
                    </button>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      or enter URL below
                    </span>
                  </div>
                  <input
                    type="text"
                    value={shopItemImageUrl}
                    onChange={(e) => setShopItemImageUrl(e.target.value)}
                    placeholder="https://example.com/image.png"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  {shopItemImageUrl && (
                    <div style={{ marginTop: '8px', width: '100%', paddingBottom: '56.25%', position: 'relative', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
                      <img
                        src={shopItemImageUrl}
                        alt="Preview"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain'
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Item Type *
                  </label>
                  <select
                    value={shopItemType}
                    onChange={(e) => setShopItemType(e.target.value as 'normal' | 'fiction')}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  >
                    <option value="normal">Normal Item (returns product)</option>
                    <option value="fiction">Fiction Item (multi-writer)</option>
                  </select>
                </div>
                {shopItemType === 'normal' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                      Product Data (Link/File/Text) *
                    </label>
                    <textarea
                      value={shopItemProductData}
                      onChange={(e) => setShopItemProductData(e.target.value)}
                      placeholder="Enter product link, file URL, or text content..."
                      style={{
                        width: '100%',
                        minHeight: '100px',
                        padding: '10px',
                        fontSize: '16px',
                        fontFamily: 'Dongle, sans-serif',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                )}
                {renderShopGuildAccess('shop-item-create')}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="shop-item-active"
                    checked={shopItemIsActive}
                    onChange={(e) => setShopItemIsActive(e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="shop-item-active" style={{ fontSize: '14px', cursor: 'pointer' }}>
                    Active (visible in shop)
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setShowCreateShopItem(false);
                    resetShopItemForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  className="submit-btn"
                  onClick={handleCreateShopItem}
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)'
                  }}
                >
                  Create Item
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Shop Item Modal */}
        {showEditShopItem && selectedShopItem && (
          <div className="modal-overlay" onClick={() => { setShowEditShopItem(false); resetShopItemForm(); }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
              <h3>Edit Shop Item</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    value={shopItemTitle}
                    onChange={(e) => setShopItemTitle(e.target.value)}
                    placeholder="Item title"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Description (Optional)
                  </label>
                  <textarea
                    value={shopItemDescription}
                    onChange={(e) => setShopItemDescription(e.target.value)}
                    placeholder="Item description"
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      padding: '10px',
                      fontSize: '16px',
                      fontFamily: 'Dongle, sans-serif',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      resize: 'vertical'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Price (Asset Points) *
                  </label>
                  <input
                    type="text"
                    value={shopItemPrice.toString()}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      if (value === '') {
                        setShopItemPrice(0);
                      } else {
                        const numValue = Number(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                          setShopItemPrice(numValue);
                        }
                      }
                    }}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Image URL *
                  </label>
                  <div style={{ marginBottom: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      id="shop-image-upload-input"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        const formData = new FormData();
                        formData.append('image', file);

                        try {
                          const response = await axios.post('/api/upload/image', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          });

                          if (response.data.success) {
                            setShopItemImageUrl(response.data.url);
                          }
                        } catch (error: any) {
                          alert(error.response?.data?.error || 'Failed to upload image');
                        }

                        // Reset file input
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById('shop-image-upload-input')?.click();
                      }}
                      style={{
                        padding: '6px 12px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      📤 Upload Image
                    </button>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      or enter URL below
                    </span>
                  </div>
                  <input
                    type="text"
                    value={shopItemImageUrl}
                    onChange={(e) => setShopItemImageUrl(e.target.value)}
                    placeholder="https://example.com/image.png"
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  />
                  {shopItemImageUrl && (
                    <div style={{ marginTop: '8px', width: '100%', paddingBottom: '56.25%', position: 'relative', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
                      <img
                        src={shopItemImageUrl}
                        alt="Preview"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain'
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                    Item Type *
                  </label>
                  <select
                    value={shopItemType}
                    onChange={(e) => setShopItemType(e.target.value as 'normal' | 'fiction')}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px'
                    }}
                  >
                    <option value="normal">Normal Item (returns product)</option>
                    <option value="fiction">Fiction Item (multi-writer)</option>
                  </select>
                </div>
                {shopItemType === 'normal' && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                      Product Data (Link/File/Text) *
                    </label>
                    <textarea
                      value={shopItemProductData}
                      onChange={(e) => setShopItemProductData(e.target.value)}
                      placeholder="Enter product link, file URL, or text content..."
                      style={{
                        width: '100%',
                        minHeight: '100px',
                        padding: '10px',
                        fontSize: '16px',
                        fontFamily: 'Dongle, sans-serif',
                        border: '2px solid #e5e7eb',
                        borderRadius: '8px',
                        resize: 'vertical'
                      }}
                    />
                  </div>
                )}
                {renderShopGuildAccess('shop-item-edit')}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="shop-item-active-edit"
                    checked={shopItemIsActive}
                    onChange={(e) => setShopItemIsActive(e.target.checked)}
                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  />
                  <label htmlFor="shop-item-active-edit" style={{ fontSize: '14px', cursor: 'pointer' }}>
                    Active (visible in shop)
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setShowEditShopItem(false);
                    resetShopItemForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  className="submit-btn"
                  onClick={handleUpdateShopItem}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)'
                  }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {showQuestJsonModal && (
          <div className="modal-overlay" onClick={() => !isImportingQuestJson && setShowQuestJsonModal(false)}>
            <div className="modal-content" onClick={(event) => event.stopPropagation()} style={{ maxWidth: '760px' }}>
              <h3>Import Quest Tree JSON</h3>
              <textarea
                className="skill-input"
                value={questJson}
                onChange={(event) => setQuestJson(event.target.value)}
                placeholder={'{\n  "version": 1,\n  "quests": [\n    {\n      "key": "first-quest",\n      "title": "First Quest",\n      "description": "...",\n      "cost": 0,\n      "nodeColor": "green",\n      "treePosition": { "x": 0, "y": 620 },\n      "connections": []\n    }\n  ]\n}'}
                style={{ minHeight: '360px', fontFamily: 'monospace', resize: 'vertical' }}
                spellCheck={false}
              />
              <div className="modal-actions">
                <button className="cancel-btn" disabled={isImportingQuestJson} onClick={() => setShowQuestJsonModal(false)}>
                  Cancel
                </button>
                <button className="submit-btn" disabled={!questJson.trim() || isImportingQuestJson} onClick={handleImportQuestJson}>
                  {isImportingQuestJson ? 'Importing...' : 'Import quests'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Approve Modal */}
        {showApproveModal && selectedApprovalRequest && (
          <div className="modal-overlay" onClick={() => setShowApproveModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
              <h3>Approve Request</h3>
              <p style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
                Enter the Asset Points to reward for completing this quest:
              </p>
              {(() => {
                const skill = skills.find(s => s._id === selectedApprovalRequest.skillId);
                return skill && (
                  <div style={{ 
                    padding: '12px', 
                    background: '#fef3c7', 
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '14px',
                    color: '#92400e'
                  }}>
                    Recommended reward: {skill.minAP ?? 35}{skill.maxAP !== undefined ? ` - ${skill.maxAP}` : ''} AP
                    <br />
                    Next quest cost: {skill.nextQuestCost ?? 25} AP
                  </div>
                );
              })()}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '600' }}>
                  Asset Points:
                </label>
                <input
                  type="number"
                  min="0"
                  value={approveAPAmount}
                  onChange={(e) => setApproveAPAmount(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '16px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setShowApproveModal(false);
                    setSelectedApprovalRequest(null);
                    setApproveAPAmount(0);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="submit-btn"
                  onClick={handleConfirmApprove}
                  style={{
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)'
                  }}
                >
                  Approve & Reward
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default AdminPage;
