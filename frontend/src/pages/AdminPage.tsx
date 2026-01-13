import { useEffect, useState } from 'react';
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
}

interface Guild {
  _id: string;
  name: string;
  guildLeaderId?: string;
  adminIds: string[];
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
  previewClip?: string;
  contentYouTube?: string;
  contentGoogleDrive?: string;
  layer: number;
  position: number;
  isActive: boolean;
  nodeColor: 'yellow' | 'blue' | 'green' | 'white' | 'purple';
  connections?: Array<{
    targetSkillId: string;
    connectionType: 'normal' | 'special';
    hasArrowhead: boolean;
    breakPoints?: Array<{ layer: number; position: number }>;
  }>;
  prerequisites?: string[];
  createdAt: string;
  updatedAt: string;
}

type AdminSection = 'dashboard' | 'guilds' | 'users' | 'skilltree' | 'settings';

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
  const [userGuildInfo, setUserGuildInfo] = useState<GuildInfo | null>(null);
  const [isGuildLeader, setIsGuildLeader] = useState(false);

  // User section filters
  const [filterGuild, setFilterGuild] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterName, setFilterName] = useState('');

  // Form states
  const [newGuildName, setNewGuildName] = useState('');
  const [newGuildLeaderId, setNewGuildLeaderId] = useState('');
  const [assetPointsAmount, setAssetPointsAmount] = useState(0);

  // Skill Tree states
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [showSkillDetail, setShowSkillDetail] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState(false);
  const [draggingSkill, setDraggingSkill] = useState<string | null>(null);
  const [tempSkillPositions, setTempSkillPositions] = useState<{ [key: string]: number }>({});
  
  // Zoom and Pan states
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartY, setPanStartY] = useState(0);
  
  // Skill form states
  const [skillTitle, setSkillTitle] = useState('');
  const [skillDescription, setSkillDescription] = useState('');
  const [skillCost, setSkillCost] = useState(0);
  const [skillPreviewClip, setSkillPreviewClip] = useState('');
  const [skillContentYouTube, setSkillContentYouTube] = useState('');
  const [skillContentGoogleDrive, setSkillContentGoogleDrive] = useState('');
  const [skillLayer, setSkillLayer] = useState(1);
  const [skillPosition, setSkillPosition] = useState(0);
  const [skillNodeColor, setSkillNodeColor] = useState<'yellow' | 'blue' | 'green' | 'white' | 'purple'>('blue');
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  const [connectionSource, setConnectionSource] = useState<Skill | null>(null);
  const [layerGap, setLayerGap] = useState(120); // Gap between each layer
  const [connectionHasArrowhead, setConnectionHasArrowhead] = useState(true);
  const [editingConnection, setEditingConnection] = useState<{ skillId: string; targetSkillId: string } | null>(null);
  const [draggingBreakPoint, setDraggingBreakPoint] = useState<{ 
    skillId: string; 
    targetSkillId: string; 
    pointIndex: number 
  } | null>(null);
  const [tempBreakPoints, setTempBreakPoints] = useState<{ 
    [connectionKey: string]: Array<{ layer: number; position: number }> 
  }>({});

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadGuilds();
      loadAllUsers();
      loadUserGuildInfo();
      if (user.role === 'super-admin') {
        loadSkills();
      }
    }
  }, [user]);

  useEffect(() => {
    if (selectedGuild) {
      loadGuildMembers(selectedGuild._id);
    }
  }, [selectedGuild]);

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

  const handleCreateSkill = async () => {
    if (!skillTitle.trim() || !skillDescription.trim()) {
      alert('Please fill in title and description');
      return;
    }

    try {
      await axios.post('/api/skills', {
        title: skillTitle,
        description: skillDescription,
        cost: skillCost,
        previewClip: skillPreviewClip || undefined,
        contentYouTube: skillContentYouTube || undefined,
        contentGoogleDrive: skillContentGoogleDrive || undefined,
        layer: skillLayer,
        position: skillPosition,
        nodeColor: skillNodeColor
      });

      alert('Skill created successfully!');
      resetSkillForm();
      setShowCreateSkill(false);
      loadSkills();
    } catch (error) {
      console.error('Error creating skill:', error);
      alert('Failed to create skill');
    }
  };

  const handleUpdateSkill = async () => {
    if (!selectedSkill || !skillTitle.trim() || !skillDescription.trim()) {
      alert('Please fill in title and description');
      return;
    }

    try {
      await axios.put(`/api/skills/${selectedSkill._id}`, {
        title: skillTitle,
        description: skillDescription,
        cost: skillCost,
        previewClip: skillPreviewClip || undefined,
        contentYouTube: skillContentYouTube || undefined,
        contentGoogleDrive: skillContentGoogleDrive || undefined,
        layer: skillLayer,
        position: skillPosition,
        nodeColor: skillNodeColor
      });

      alert('Skill updated successfully!');
      resetSkillForm();
      setEditingSkill(false);
      setShowSkillDetail(false);
      loadSkills();
    } catch (error) {
      console.error('Error updating skill:', error);
      alert('Failed to update skill');
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
    if (!confirm('Are you sure you want to delete this skill?')) {
      return;
    }

    try {
      await axios.delete(`/api/skills/${skillId}`);
      alert('Skill deleted successfully!');
      setShowSkillDetail(false);
      loadSkills();
    } catch (error) {
      console.error('Error deleting skill:', error);
      alert('Failed to delete skill');
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
    setSkillPreviewClip(skill.previewClip || '');
    setSkillContentYouTube(skill.contentYouTube || '');
    setSkillContentGoogleDrive(skill.contentGoogleDrive || '');
    setSkillLayer(skill.layer);
    setSkillPosition(skill.position);
    setSkillNodeColor(skill.nodeColor);
    setEditingSkill(true);
    setShowSkillDetail(true);
  };

  const resetSkillForm = () => {
    setSkillTitle('');
    setSkillDescription('');
    setSkillCost(0);
    setSkillPreviewClip('');
    setSkillContentYouTube('');
    setSkillContentGoogleDrive('');
    setSkillLayer(1);
    setSkillPosition(0);
    setSkillNodeColor('blue');
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
      yellow: '#eab308',
      blue: '#3b82f6',
      green: '#22c55e',
      white: '#ffffff',
      purple: '#9333ea'
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

  // Zoom and Pan handlers
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.3), 3));
  };

  const handlePanStart = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) { // Middle click or Shift+Left click
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

  // Handle dragging nodes freely around their circle
  const handleNodeDrag = (e: React.MouseEvent<SVGElement>, skill: Skill) => {
    if (skill.layer === 0) return; // Center node can't be dragged
    if (isPanning) return; // Don't drag nodes while panning

    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // Get mouse position relative to SVG center, accounting for zoom and pan
      const mouseX = (moveEvent.clientX - rect.left - centerX - panX) / zoom;
      const mouseY = (moveEvent.clientY - rect.top - centerY - panY) / zoom;
      
      // Calculate angle from center (in degrees, 0-360)
      let angle = Math.atan2(mouseY, mouseX);
      let degrees = (angle * 180 / Math.PI + 90 + 360) % 360;
      
      // Update local state only (no API call, no save yet)
      setTempSkillPositions(prev => ({ ...prev, [skill._id]: degrees }));
    };

    const handleMouseUp = () => {
      setDraggingSkill(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Don't save - wait for user to click save button
    };

    setDraggingSkill(skill._id);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle break point dragging (constrained to circle)
  useEffect(() => {
    if (!draggingBreakPoint) return;

    const handleMouseMove = (e: MouseEvent) => {
      const svg = document.querySelector('.skill-tree-svg') as SVGSVGElement;
      if (!svg) return;

      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      
      // Transform to skill tree coordinates
      const mouseX = (svgP.x - panX / zoom) / zoom;
      const mouseY = (svgP.y - panY / zoom) / zoom;

      // Calculate angle from center
      let angle = Math.atan2(mouseY, mouseX);
      let degrees = (angle * 180 / Math.PI + 90 + 360) % 360;

      // Update local state only (no API call yet)
      const connectionKey = `${draggingBreakPoint.skillId}-${draggingBreakPoint.targetSkillId}`;
      const skill = skills.find(s => s._id === draggingBreakPoint.skillId);
      if (!skill) return;

      const conn = skill.connections?.find(c => c.targetSkillId === draggingBreakPoint.targetSkillId);
      if (!conn || !conn.breakPoints) return;

      const currentPoints = tempBreakPoints[connectionKey] || conn.breakPoints;
      const newBreakPoints = [...currentPoints];
      // Keep same layer, only update position (angle)
      newBreakPoints[draggingBreakPoint.pointIndex] = { 
        layer: newBreakPoints[draggingBreakPoint.pointIndex].layer,
        position: degrees 
      };

      setTempBreakPoints(prev => ({
        ...prev,
        [connectionKey]: newBreakPoints
      }));
    };

    const handleMouseUp = async () => {
      // Save to database on mouse up
      const connectionKey = `${draggingBreakPoint.skillId}-${draggingBreakPoint.targetSkillId}`;
      const finalBreakPoints = tempBreakPoints[connectionKey];
      
      if (finalBreakPoints) {
        try {
          await axios.put(`/api/skills/${draggingBreakPoint.skillId}/connections/${draggingBreakPoint.targetSkillId}`, {
            breakPoints: finalBreakPoints
          });
          
          // Clear temp state and reload
          setTempBreakPoints(prev => {
            const updated = { ...prev };
            delete updated[connectionKey];
            return updated;
          });
          
          await loadSkills();
        } catch (error) {
          console.error('Error saving break point:', error);
        }
      }
      
      setDraggingBreakPoint(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingBreakPoint, zoom, panX, panY, skills, tempBreakPoints]);

  // Save all position changes
  const handleSavePositions = async () => {
    try {
      const updates = Object.entries(tempSkillPositions).map(([skillId, position]) =>
        axios.put(`/api/skills/${skillId}`, { position })
      );
      
      await Promise.all(updates);
      alert('All positions saved successfully!');
      setTempSkillPositions({});
      await loadSkills(); // Ensure skills are reloaded
    } catch (error) {
      console.error('Error saving positions:', error);
      alert('Failed to save some positions');
    }
  };

  // Reset all unsaved changes
  const handleResetPositions = () => {
    if (confirm('Discard all unsaved position changes?')) {
      setTempSkillPositions({});
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
        guildLeaderId: newGuildLeaderId || undefined
      });
      setNewGuildName('');
      setNewGuildLeaderId('');
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
            🌳 Skill Tree
          </button>
        )}
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
                <select
                  value={newGuildLeaderId}
                  onChange={(e) => setNewGuildLeaderId(e.target.value)}
                  className="guild-select"
                >
                  <option value="">Select Guild Leader (optional)</option>
                  {allUsers
                    .filter(u => u.role === 'admin' || u.role === 'super-admin')
                    .map(user => (
                      <option key={user.discordId} value={user.discordId}>
                        {user.username} ({user.role})
                      </option>
                    ))
                  }
                </select>
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
                {guild.guildLeaderId && (
                  <p className="guild-leader-name">
                    👑 {allUsers.find(u => u.discordId === guild.guildLeaderId)?.username || 'Leader'}
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
              
              {/* Guild Leader Info */}
              {selectedGuild.guildLeaderId && (
                <div className="guild-leader-badge">
                  <span className="leader-icon">👑</span>
                  <span className="leader-text">
                    Leader: {allUsers.find(u => u.discordId === selectedGuild.guildLeaderId)?.username || 'Unknown'}
                  </span>
                </div>
              )}

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
              <h2 className="section-title">Skill Tree Management</h2>
              <button className="create-skill-btn" onClick={() => {
                resetSkillForm();
                setShowCreateSkill(true);
              }}>
                ➕ Create New Skill
              </button>
            </div>

            {/* Skill Tree Visualization - 6 Circular Layers */}
            <div 
              className="skill-tree-container"
              onWheel={(e) => e.preventDefault()}
            >
              {/* Zoom Controls */}
              <div className="zoom-controls">
                <button className="zoom-btn" onClick={zoomIn} title="Zoom In">➕</button>
                <button className="zoom-btn" onClick={resetView} title="Reset View">🎯</button>
                <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">➖</button>
                <span className="zoom-level">{Math.round(zoom * 100)}%</span>
              </div>

              {/* Layer Gap Controls */}
              <div className="layer-gap-controls">
                <label className="gap-label">
                  Layer Gap:
                  <input 
                    type="range" 
                    min="80" 
                    max="200" 
                    step="10" 
                    value={layerGap}
                    onChange={(e) => setLayerGap(Number(e.target.value))}
                    className="gap-slider"
                  />
                  <span className="gap-value">{layerGap}px</span>
                </label>
              </div>

              {/* Save Controls - Always visible */}
              <div className="save-controls">
                {Object.keys(tempSkillPositions).length > 0 ? (
                  <div className="unsaved-badge">
                    {Object.keys(tempSkillPositions).length} unsaved
                  </div>
                ) : (
                  <div className="saved-badge">
                    ✓ All saved
                  </div>
                )}
                <button 
                  className="save-btn" 
                  onClick={handleSavePositions} 
                  disabled={Object.keys(tempSkillPositions).length === 0}
                  title="Save all position changes"
                >
                  💾 Save Changes
                </button>
                <button 
                  className="reset-btn" 
                  onClick={handleResetPositions} 
                  disabled={Object.keys(tempSkillPositions).length === 0}
                  title="Discard all changes"
                >
                  ↩️ Reset
                </button>
              </div>

              {/* Connection Editing Controls */}
              {editingConnection && (() => {
                const skill = skills.find(s => s._id === editingConnection.skillId);
                const conn = skill?.connections?.find(c => c.targetSkillId === editingConnection.targetSkillId);
                const targetSkill = skills.find(s => s._id === editingConnection.targetSkillId);
                
                return skill && conn && targetSkill ? (
                  <div className="connection-edit-controls">
                    <div className="connection-edit-header">
                      <span>✏️ Editing: {skill.title} → {targetSkill.title}</span>
                      <button 
                        className="close-edit-btn" 
                        onClick={() => setEditingConnection(null)}
                        title="Stop editing"
                      >
                        ✕
                      </button>
                    </div>
                    <label className="connection-edit-option">
                      <input 
                        type="checkbox" 
                        checked={conn.hasArrowhead !== false}
                        onChange={(e) => {
                          axios.put(`/api/skills/${skill._id}/connections/${conn.targetSkillId}`, {
                            hasArrowhead: e.target.checked
                          }).then(() => loadSkills());
                        }}
                      />
                      <span>Show Arrowhead</span>
                    </label>
                    <p className="connection-edit-help">
                      • Double-click line to add break point (snaps to circle)<br/>
                      • Drag green circles along circle to adjust position<br/>
                      • Click ✕ on break point to delete
                    </p>
                    <button 
                      className="delete-connection-btn"
                      onClick={() => {
                        if (confirm('Delete this connection?')) {
                          axios.delete(`/api/skills/${skill._id}/connections/${conn.targetSkillId}`)
                            .then(() => {
                              setEditingConnection(null);
                              loadSkills();
                            });
                        }
                      }}
                    >
                      🗑️ Delete Connection
                    </button>
                  </div>
                ) : null;
              })()}

              <svg 
                className="skill-tree-svg" 
                viewBox="-900 -900 1800 1800" 
                style={{ background: 'white', cursor: isPanning ? 'grabbing' : 'grab' }}
                onWheel={handleWheel}
                onMouseDown={handlePanStart}
                onMouseMove={handlePanMove}
                onMouseUp={handlePanEnd}
                onMouseLeave={handlePanEnd}
              >
                <defs>
                  {/* Arrow marker for normal connections (purple) */}
                  <marker
                    id="arrowhead-normal"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#9333ea" />
                  </marker>
                  {/* Arrow marker for special connections (red) */}
                  <marker
                    id="arrowhead-special"
                    markerWidth="10"
                    markerHeight="10"
                    refX="9"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#ef4444" />
                  </marker>
                </defs>

                <g transform={`translate(${panX / zoom}, ${panY / zoom}) scale(${zoom})`}>
                  {/* Draw circles for each layer */}
                  {[1, 2, 3, 4, 5, 6].map(layer => {
                    const radius = layer * layerGap; // Use layerGap
                    return (
                      <circle
                        key={`layer-${layer}`}
                        cx="0"
                        cy="0"
                        r={radius}
                        fill="none"
                        stroke="#000000"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                        opacity="0.4"
                      />
                    );
                  })}

                  {/* Draw connections between skills */}
                  {skills.flatMap(skill => {
                    if (!skill.connections || skill.connections.length === 0) return [];
                    
                    const sourceLayer = skill.layer;
                    const sourceRadius = sourceLayer * layerGap; // Use layerGap
                    
                    // Use temp position if dragging, otherwise use actual position
                    const sourcePosition = tempSkillPositions[skill._id] ?? skill.position;
                    const sourceAngle = (sourcePosition * Math.PI / 180) - Math.PI / 2;
                    const sourceX = sourceRadius * Math.cos(sourceAngle);
                    const sourceY = sourceRadius * Math.sin(sourceAngle);

                    return skill.connections.map((conn) => {
                      const targetSkill = skills.find(s => s._id === conn.targetSkillId);
                      if (!targetSkill) {
                        console.warn('Target skill not found:', conn.targetSkillId);
                        return null;
                      }

                      const targetRadius = targetSkill.layer * layerGap; // Use layerGap
                      const targetPosition = tempSkillPositions[targetSkill._id] ?? targetSkill.position;
                      const targetAngle = (targetPosition * Math.PI / 180) - Math.PI / 2;
                      const targetX = targetRadius * Math.cos(targetAngle);
                      const targetY = targetRadius * Math.sin(targetAngle);

                      const color = conn.connectionType === 'special' ? '#ef4444' : '#9333ea';
                      const marker = conn.hasArrowhead !== false 
                        ? (conn.connectionType === 'special' ? 'url(#arrowhead-special)' : 'url(#arrowhead-normal)')
                        : 'none';

                      // Get break points (use temp if dragging, otherwise use actual)
                      const connectionKey = `${skill._id}-${conn.targetSkillId}`;
                      const breakPoints = tempBreakPoints[connectionKey] || conn.breakPoints;
                      
                      // Helper function to calculate point on circle
                      const getPointOnCircle = (layer: number, position: number) => {
                        const radius = layer * layerGap;
                        const angle = (position * Math.PI / 180) - Math.PI / 2;
                        return {
                          x: radius * Math.cos(angle),
                          y: radius * Math.sin(angle)
                        };
                      };
                      
                      // Helper function to create arc path between two points on same circle
                      const createArc = (layer: number, startPos: number, endPos: number) => {
                        const radius = layer * layerGap;
                        // Calculate if we should go clockwise or counter-clockwise (shorter path)
                        let angleDiff = endPos - startPos;
                        if (angleDiff > 180) angleDiff -= 360;
                        if (angleDiff < -180) angleDiff += 360;
                        
                        const largeArc = Math.abs(angleDiff) > 180 ? 1 : 0;
                        const sweep = angleDiff > 0 ? 1 : 0;
                        
                        const endPoint = getPointOnCircle(layer, endPos);
                        return ` A ${radius} ${radius} 0 ${largeArc} ${sweep} ${endPoint.x} ${endPoint.y}`;
                      };
                      
                      // Create path with break points
                      let pathD: string = `M ${sourceX},${sourceY}`;
                      
                      if (breakPoints && breakPoints.length > 0) {
                        // Build path through break points
                        let currentLayer = skill.layer;
                        let currentPos = sourcePosition;
                        
                        breakPoints.forEach((bp) => {
                          const bpPoint = getPointOnCircle(bp.layer, bp.position);
                          
                          if (bp.layer === currentLayer) {
                            // Same layer - draw arc along circle
                            pathD += createArc(currentLayer, currentPos, bp.position);
                          } else {
                            // Different layer - draw straight line
                            pathD += ` L ${bpPoint.x} ${bpPoint.y}`;
                          }
                          
                          currentLayer = bp.layer;
                          currentPos = bp.position;
                        });
                        
                        // Final segment to target
                        if (targetSkill.layer === currentLayer) {
                          // Same layer as last break point - arc
                          pathD += createArc(currentLayer, currentPos, targetPosition);
                        } else {
                          // Different layer - straight line
                          pathD += ` L ${targetX} ${targetY}`;
                        }
                      } else {
                        // No break points - straight line
                        pathD += ` L ${targetX} ${targetY}`;
                      }

                      return (
                        <g key={`conn-${skill._id}-${conn.targetSkillId}`}>
                          <path
                            d={pathD}
                            stroke={color}
                            strokeWidth="5"
                            fill="none"
                            markerEnd={marker}
                            opacity="0.9"
                            strokeLinecap="round"
                            onClick={() => {
                              // Click to edit connection
                              if (editingConnection?.skillId === skill._id && editingConnection?.targetSkillId === conn.targetSkillId) {
                                setEditingConnection(null); // Toggle off
                              } else {
                                setEditingConnection({ skillId: skill._id, targetSkillId: conn.targetSkillId });
                              }
                            }}
                            onDoubleClick={(e) => {
                              // Double-click to add break point (snapped to circle)
                              e.stopPropagation();
                              const svg = e.currentTarget.ownerSVGElement;
                              if (!svg) return;
                              
                              // Get mouse position
                              const pt = svg.createSVGPoint();
                              pt.x = e.clientX;
                              pt.y = e.clientY;
                              const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                              
                              // Transform to skill tree coordinates
                              const mouseX = (svgP.x - panX / zoom) / zoom;
                              const mouseY = (svgP.y - panY / zoom) / zoom;
                              
                              // Find nearest circle layer
                              const distFromCenter = Math.sqrt(mouseX * mouseX + mouseY * mouseY);
                              const nearestLayer = Math.max(1, Math.min(6, Math.round(distFromCenter / layerGap)));
                              
                              // Calculate angle on that circle
                              let angle = Math.atan2(mouseY, mouseX);
                              let degrees = (angle * 180 / Math.PI + 90 + 360) % 360;
                              
                              console.log('🎯 Adding break point:', {
                                source: skill.title,
                                target: targetSkill.title,
                                layer: nearestLayer,
                                position: degrees
                              });
                              
                              // Add break point
                              const currentBreakPoints = conn.breakPoints || [];
                              const newBreakPoints = [...currentBreakPoints, { layer: nearestLayer, position: degrees }];
                              
                              axios.put(`/api/skills/${skill._id}/connections/${conn.targetSkillId}`, {
                                breakPoints: newBreakPoints
                              }).then(() => {
                                console.log('✅ Break point saved, reloading skills');
                                loadSkills();
                              }).catch(err => {
                                console.error('❌ Failed to save break point:', err);
                              });
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          {/* Render break points if editing this connection */}
                          {editingConnection?.skillId === skill._id && 
                           editingConnection?.targetSkillId === conn.targetSkillId &&
                           breakPoints?.map((point, pointIdx) => {
                            const bpRadius = point.layer * layerGap;
                            const bpAngle = (point.position * Math.PI / 180) - Math.PI / 2;
                            const bpX = bpRadius * Math.cos(bpAngle);
                            const bpY = bpRadius * Math.sin(bpAngle);
                            
                            return (
                              <g key={`bp-${pointIdx}`}>
                                <circle
                                  cx={bpX}
                                  cy={bpY}
                                  r="8"
                                  fill="#22c55e"
                                  stroke="#fff"
                                  strokeWidth="2"
                                  style={{ cursor: 'move' }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setDraggingBreakPoint({ 
                                      skillId: skill._id, 
                                      targetSkillId: conn.targetSkillId, 
                                      pointIndex: pointIdx 
                                    });
                                  }}
                                />
                                {/* Delete break point button */}
                                <text
                                  x={bpX + 12}
                                  y={bpY - 8}
                                  fill="#ef4444"
                                  fontSize="16"
                                  fontWeight="bold"
                                  style={{ cursor: 'pointer' }}
                                  onClick={() => {
                                    const newBreakPoints = conn.breakPoints!.filter((_, idx) => idx !== pointIdx);
                                    axios.put(`/api/skills/${skill._id}/connections/${conn.targetSkillId}`, {
                                      breakPoints: newBreakPoints
                                    }).then(() => {
                                      loadSkills();
                                    });
                                  }}
                                >
                                  ✕
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    });
                  }).filter(Boolean)}

                  {/* Center node (layer 0) */}
                  {skills.filter(s => s.layer === 0).map((skill) => (
                    <g key={skill._id}>
                      <circle
                        cx="0"
                        cy="0"
                        r="50"
                        fill={getNodeColor(skill.nodeColor)}
                        stroke={getNodeStrokeColor(skill.nodeColor)}
                        strokeWidth="4"
                        className="skill-node-center"
                        onClick={() => openSkillDetail(skill)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setConnectionSource(skill);
                          setShowConnectionModal(true);
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <text
                        x="0"
                        y="6"
                        textAnchor="middle"
                        fill={skill.nodeColor === 'white' ? '#000000' : '#ffffff'}
                        fontSize="18"
                        fontWeight="bold"
                        style={{ pointerEvents: 'none' }}
                      >
                        {skill.title.length > 14 ? skill.title.substring(0, 14) + '...' : skill.title}
                      </text>
                    </g>
                  ))}

                  {/* Skills on circular layers (1-6) */}
                  {[1, 2, 3, 4, 5, 6].map(layer => {
                    const layerSkills = skills.filter(s => s.layer === layer);
                    const radius = layer * layerGap; // Use layerGap

                    return layerSkills.map((skill) => {
                      // Use temp position if dragging, otherwise use actual position
                      const position = tempSkillPositions[skill._id] ?? skill.position;
                      const angle = (position * Math.PI / 180) - Math.PI / 2;
                      const x = radius * Math.cos(angle);
                      const y = radius * Math.sin(angle);
                      const isDragging = draggingSkill === skill._id;

                      return (
                        <g key={skill._id}>
                          {/* Skill node */}
                          <circle
                            cx={x}
                            cy={y}
                            r="40"
                            fill={isDragging ? "#2563eb" : getNodeColor(skill.nodeColor)}
                            stroke={getNodeStrokeColor(skill.nodeColor)}
                            strokeWidth="3"
                            className="skill-node"
                            onMouseDown={(e) => handleNodeDrag(e, skill)}
                            onClick={() => {
                              if (!isDragging) {
                                openSkillDetail(skill);
                              }
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setConnectionSource(skill);
                              setShowConnectionModal(true);
                            }}
                            style={{ cursor: 'move' }}
                          />
                          
                          {/* Skill title */}
                          <text
                            x={x}
                            y={y + 5}
                            textAnchor="middle"
                            fill={skill.nodeColor === 'white' || skill.nodeColor === 'yellow' ? '#000000' : '#ffffff'}
                            fontSize="16"
                            fontWeight="bold"
                            style={{ pointerEvents: 'none' }}
                          >
                            {skill.title.length > 12 ? skill.title.substring(0, 12) + '...' : skill.title}
                          </text>
                        </g>
                      );
                    });
                  })}
                </g>
              </svg>
              <div className="skill-tree-help">
                <p>💡 <strong>Scroll</strong> to zoom | <strong>Shift+Drag</strong> to pan | <strong>Left-click</strong> node for details | <strong>Right-click</strong> node to connect</p>
              </div>
            </div>

            {/* Skill List */}
            <div className="skill-list-section">
              <h3 className="subsection-title">All Skills ({skills.length})</h3>
              <div className="skill-cards-grid">
                {skills.length === 0 ? (
                  <div className="empty-skills-message">
                    <p>No skills created yet. Click "Create New Skill" to get started!</p>
                  </div>
                ) : (
                  skills.map(skill => (
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
                        <span className="skill-layer-badge">Layer {skill.layer}</span>
                        {skill.previewClip && <span className="skill-has-preview">🎬</span>}
                        {(skill.contentYouTube || skill.contentGoogleDrive) && <span className="skill-has-content">📚</span>}
                      </div>
                    </div>
                  ))
                )}
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
              <h3>✨ Create New Skill</h3>
              
              <div className="skill-form">
                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Title *</label>
                    <input
                      type="text"
                      value={skillTitle}
                      onChange={(e) => setSkillTitle(e.target.value)}
                      placeholder="Skill title"
                      className="skill-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Description *</label>
                    <textarea
                      value={skillDescription}
                      onChange={(e) => setSkillDescription(e.target.value)}
                      placeholder="Detailed skill description"
                      className="skill-textarea"
                      rows={4}
                    />
                  </div>
                </div>

                <div className="form-row">
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
                  <div className="form-group">
                    <label>Layer (0=center, 1-6) *</label>
                    <input
                      type="number"
                      min="0"
                      max="6"
                      value={skillLayer}
                      onChange={(e) => setSkillLayer(Number(e.target.value))}
                      className="skill-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Position (0-360°) *</label>
                    <input
                      type="number"
                      min="0"
                      max="360"
                      step="0.1"
                      value={skillPosition}
                      onChange={(e) => setSkillPosition(Number(e.target.value))}
                      className="skill-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Node Color *</label>
                    <select
                      value={skillNodeColor}
                      onChange={(e) => setSkillNodeColor(e.target.value as any)}
                      className="skill-input"
                    >
                      <option value="blue">Blue</option>
                      <option value="yellow">Yellow</option>
                      <option value="green">Green</option>
                      <option value="white">White</option>
                      <option value="purple">Purple</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Preview Clip (YouTube URL)</label>
                    <input
                      type="text"
                      value={skillPreviewClip}
                      onChange={(e) => setSkillPreviewClip(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="skill-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Content - YouTube Link</label>
                    <input
                      type="text"
                      value={skillContentYouTube}
                      onChange={(e) => setSkillContentYouTube(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="skill-input"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group full-width">
                    <label>Content - Google Drive Link</label>
                    <input
                      type="text"
                      value={skillContentGoogleDrive}
                      onChange={(e) => setSkillContentGoogleDrive(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="skill-input"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="submit-btn" onClick={handleCreateSkill}>
                  Create Skill
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
            <div className="modal-content skill-modal skill-detail-modal" onClick={(e) => e.stopPropagation()}>
              {!editingSkill ? (
                <>
                  <div className="skill-detail-header">
                    <h3>{selectedSkill.title}</h3>
                    <span className="skill-detail-cost">{selectedSkill.cost} AP</span>
                  </div>
                  
                  <div className="skill-detail-meta">
                    <span className="skill-layer-badge">Layer {selectedSkill.layer}</span>
                    <span className="skill-position-badge">Position {selectedSkill.position}</span>
                  </div>

                  <div className="skill-detail-description">
                    <h4>Description</h4>
                    <p>{selectedSkill.description}</p>
                  </div>

                  {selectedSkill.previewClip && (
                    <div className="skill-preview-section">
                      <h4>Preview Clip</h4>
                      <div className="video-embed-container">
                        <iframe
                          src={getYouTubeEmbedUrl(selectedSkill.previewClip)}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title="Preview Clip"
                        />
                      </div>
                    </div>
                  )}

                  {(selectedSkill.contentYouTube || selectedSkill.contentGoogleDrive) && (
                    <div className="skill-content-section">
                      <h4>Content Links</h4>
                      {selectedSkill.contentYouTube && (
                        <div className="content-link-item">
                          <span className="content-icon">📺</span>
                          <a href={selectedSkill.contentYouTube} target="_blank" rel="noopener noreferrer">
                            YouTube Content
                          </a>
                        </div>
                      )}
                      {selectedSkill.contentGoogleDrive && (
                        <div className="content-link-item">
                          <span className="content-icon">📂</span>
                          <a href={selectedSkill.contentGoogleDrive} target="_blank" rel="noopener noreferrer">
                            Google Drive Content
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="modal-actions">
                    <button className="edit-btn" onClick={() => startEditingSkill(selectedSkill)}>
                      ✏️ Edit
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
                  <h3>✏️ Edit Skill</h3>
                  
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
                        <textarea
                          value={skillDescription}
                          onChange={(e) => setSkillDescription(e.target.value)}
                          className="skill-textarea"
                          rows={4}
                        />
                      </div>
                    </div>

                    <div className="form-row">
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
                      <div className="form-group">
                        <label>Layer (0-6) *</label>
                        <input
                          type="number"
                          min="0"
                          max="6"
                          value={skillLayer}
                          onChange={(e) => setSkillLayer(Number(e.target.value))}
                          className="skill-input"
                        />
                      </div>
                      <div className="form-group">
                        <label>Position (0-360°) *</label>
                        <input
                          type="number"
                          min="0"
                          max="360"
                          step="0.1"
                          value={skillPosition}
                          onChange={(e) => setSkillPosition(Number(e.target.value))}
                          className="skill-input"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Node Color *</label>
                        <select
                          value={skillNodeColor}
                          onChange={(e) => setSkillNodeColor(e.target.value as any)}
                          className="skill-input"
                        >
                          <option value="blue">Blue</option>
                          <option value="yellow">Yellow</option>
                          <option value="green">Green</option>
                          <option value="white">White</option>
                          <option value="purple">Purple</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Preview Clip (YouTube URL)</label>
                        <input
                          type="text"
                          value={skillPreviewClip}
                          onChange={(e) => setSkillPreviewClip(e.target.value)}
                          className="skill-input"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Content - YouTube Link</label>
                        <input
                          type="text"
                          value={skillContentYouTube}
                          onChange={(e) => setSkillContentYouTube(e.target.value)}
                          className="skill-input"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group full-width">
                        <label>Content - Google Drive Link</label>
                        <input
                          type="text"
                          value={skillContentGoogleDrive}
                          onChange={(e) => setSkillContentGoogleDrive(e.target.value)}
                          className="skill-input"
                        />
                      </div>
                    </div>
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

        {/* Connection Modal */}
        {showConnectionModal && connectionSource && (
          <div className="modal-overlay" onClick={() => {
            setShowConnectionModal(false);
            setConnectionSource(null);
          }}>
            <div className="modal-content connection-modal" onClick={(e) => e.stopPropagation()}>
              <h3>🔗 Add Connection from "{connectionSource.title}"</h3>
              <p className="connection-help">Select a target skill to connect to:</p>
              
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
                        <span className="connection-skill-layer">Layer {targetSkill.layer}</span>
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
    </div>
  );
}

export default AdminPage;
