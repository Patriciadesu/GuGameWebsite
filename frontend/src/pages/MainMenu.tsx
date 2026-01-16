import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import './MainMenu.css';
import guildIcon from '../assets/Guild.svg';
import leaderboardIcon from '../assets/Leaderboard.svg';
import supportIcon from '../assets/Tech Support.svg';

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
  previewClip?: string[];
  contentYouTube?: string[];
  contentGoogleDrive?: string[];
  layer: number;
  position: number;
  isActive: boolean;
  nodeColor: 'yellow' | 'blue' | 'green' | 'white' | 'purple';
  nodeType?: 'adventure' | 'asset' | 'quest' | 'marker' | 'EXTRA';
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
  const [voiceMinutesToday, setVoiceMinutesToday] = useState(0);
  const [totalVoiceMinutes, setTotalVoiceMinutes] = useState(0);

  // Skill Tree states
  const [skills, setSkills] = useState<Skill[]>([]);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartY, setPanStartY] = useState(0);
  const [highlightedSkillId, setHighlightedSkillId] = useState<string | null>(null);
  const [layerGaps, setLayerGaps] = useState<{ [key: number]: number }>({ 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120, 7: 120 }); // Gap for each layer
  const [arrowheadGapFromNode, setArrowheadGapFromNode] = useState(0); // Gap from target node edge
  const [arrowheadStartPoint, setArrowheadStartPoint] = useState(0); // Distance from path end where arrowhead starts
  const [arrowheadSize, setArrowheadSize] = useState(20); // Size of the arrowhead
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [unlockedSkills, setUnlockedSkills] = useState<string[]>([]);
  const [showApprovalRequestModal, setShowApprovalRequestModal] = useState(false);
  const [approvalMessage, setApprovalMessage] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadSkills();
      loadSkillTreeSettings();
      loadUserStats();
      loadVoiceTime();
    }
  }, [user]);

  const loadSkills = async () => {
    try {
      const response = await axios.get('/api/skills');
      if (response.data.success) {
        setSkills(response.data.skills);
        // Debug: Log connections with arrowhead info
        response.data.skills.forEach((skill: any) => {
          if (skill.connections && skill.connections.length > 0) {
            skill.connections.forEach((conn: any) => {
              console.log(`Connection: ${skill.title} -> ${conn.targetSkillId}, hasArrowhead: ${conn.hasArrowhead}`);
            });
          }
        });
      }
    } catch (error) {
      console.error('Error loading skills:', error);
    }
  };

  const loadSkillTreeSettings = async () => {
    try {
      const response = await axios.get('/api/skill-tree-settings');
      if (response.data.success) {
        const settings = response.data.settings;
        // Load per-layer gaps if available, otherwise use default
        if (settings.layerGaps) {
          const gaps: { [key: number]: number } = {};
          for (let i = 1; i <= 7; i++) {
            gaps[i] = settings.layerGaps[i] || settings.layerGap || 120;
          }
          setLayerGaps(gaps);
        } else {
          // Fallback to single layerGap for backward compatibility
          const defaultGap = settings.layerGap || 120;
          setLayerGaps({ 1: defaultGap, 2: defaultGap, 3: defaultGap, 4: defaultGap, 5: defaultGap, 6: defaultGap, 7: defaultGap });
        }
        setArrowheadGapFromNode(settings.arrowheadGapFromNode || 0);
        setArrowheadStartPoint(settings.arrowheadStartPoint || 0);
        setArrowheadSize(settings.arrowheadSize || 20);
      }
    } catch (error) {
      console.error('Error loading skill tree settings:', error);
    }
  };

  const loadUserStats = async () => {
    try {
      const response = await axios.get('/api/auth/user');
      if (response.data.authenticated && response.data.user) {
        // Try to get full user data with stats
        const userResponse = await axios.get(`/api/users/${response.data.user.id}`);
        if (userResponse.data.success && userResponse.data.user) {
          setAssetPoints(userResponse.data.user.assetPoints || 0);
        }
      }
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  };

  const loadVoiceTime = async () => {
    try {
      if (!user?.id) return;
      const response = await axios.get(`/api/users/${user.id}/voice-time`);
      if (response.data.success && response.data.voiceTime) {
        setVoiceMinutesToday(response.data.voiceTime.voiceMinutesToday || 0);
        setTotalVoiceMinutes(response.data.voiceTime.totalVoiceMinutes || 0);
      }
    } catch (error) {
      console.error('Error loading voice time:', error);
    }
  };

  const loadUnlockedSkills = async () => {
    try {
      const response = await axios.get('/api/user/unlocked-skills');
      if (response.data.success) {
        setUnlockedSkills(response.data.unlockedSkills || []);
      }
    } catch (error) {
      console.error('Error loading unlocked skills:', error);
    }
  };

  useEffect(() => {
    if (user) {
      loadUnlockedSkills();
    }
  }, [user]);

  const handleSkillClick = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSkillModal(true);
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

    const isQuest = selectedSkill.nodeType === 'quest' || selectedSkill.nodeColor === 'green';
    
    // For quest nodes, show approval request modal instead
    if (isQuest) {
      setShowApprovalRequestModal(true);
      return;
    }

    try {
      const response = await axios.post(`/api/skills/${selectedSkill._id}/unlock`);
      if (response.data.success) {
        // Update unlocked skills
        setUnlockedSkills([...unlockedSkills, selectedSkill._id]);
        // Update asset points
        setAssetPoints(response.data.remainingAssetPoints);
        // Close modal
        setShowSkillModal(false);
        setSelectedSkill(null);
        // Don't show notification for Adventure and Marker nodes
        const isAdventure = selectedSkill.nodeType === 'adventure' || selectedSkill.nodeColor === 'white';
        const isMarker = selectedSkill.nodeType === 'marker' || selectedSkill.nodeColor === 'yellow';
        if (!isAdventure && !isMarker) {
          alert('Skill unlocked successfully!');
        }
      }
    } catch (error: any) {
      console.error('Error unlocking skill:', error);
      alert(error.response?.data?.error || 'Failed to unlock skill');
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

  // Parse description and render images from markdown-style syntax ![alt](url)
  const renderDescriptionWithImages = (description: string) => {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
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
      const altText = match[1];
      const imageUrl = match[2];
      parts.push(
        <img
          key={key++}
          src={imageUrl}
          alt={altText || 'Skill image'}
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

  // Convert YouTube URL to embed URL
  const getYouTubeEmbedUrl = (url: string) => {
    if (!url) return '';
    const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/watch\?.+&v=))([\w-]{11})/);
    return videoIdMatch ? `https://www.youtube.com/embed/${videoIdMatch[1]}` : url;
  };

  // Helper function to calculate radius for a layer (cumulative)
  const getLayerRadius = (layer: number): number => {
    if (layer === 0) return 0; // Center node
    let radius = 0;
    for (let i = 1; i <= layer; i++) {
      radius += layerGaps[i] || 120;
    }
    return radius;
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

  const getAvatarUrl = () => {
    if (user?.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    }
    return `https://cdn.discordapp.com/embed/avatars/${Math.abs(parseInt(user?.id || '0', 10)) % 5}.png`;
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
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Only allow panning with Shift key or middle mouse button
    if (e.shiftKey || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStartX(e.clientX);
      setPanStartY(e.clientY);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      e.preventDefault();
      const deltaX = e.clientX - panStartX;
      const deltaY = e.clientY - panStartY;
      // Adjust pan based on zoom level, with increased speed (multiply by 2 for faster panning)
      const panSpeed = 2.0; // Increase this value to make panning faster
      setPanX(prev => prev + (deltaX / zoom) * panSpeed);
      setPanY(prev => prev + (deltaY / zoom) * panSpeed);
      setPanStartX(e.clientX);
      setPanStartY(e.clientY);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

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
              <span className="stat-label">Asset point :</span>
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
          {/* Guild Card */}
          <div className="nav-item guild">
            <div className="nav-icon-wrapper">
              <img src={guildIcon} alt="Guild" className="nav-icon" />
            </div>
            <span className="nav-text">Guild</span>
          </div>

          {/* Tech Support Card */}
          <div className="nav-item support">
            <div className="nav-icon-wrapper">
              <img src={supportIcon} alt="Tech Support" className="nav-icon" />
            </div>
            <span className="nav-text">Tech Support</span>
          </div>

          {/* Leaderboard Card */}
          <div className="nav-item leaderboard">
            <div className="nav-icon-wrapper">
              <img src={leaderboardIcon} alt="Leaderboard" className="nav-icon" />
            </div>
            <span className="nav-text">Leaderboard</span>
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
          <h2 className="panel-title">Skill Tree</h2>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {/* Content */}
        <div className="panel-content">
          <div className="skill-tree-view">
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

              <svg 
                className="skill-tree-svg" 
                viewBox="-900 -900 1800 1800" 
                style={{ background: 'white', cursor: isPanning ? 'grabbing' : 'grab' }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <defs>
                  {/* Arrow marker for normal connections (black) */}
                  <marker
                    id="arrowhead-normal"
                    markerWidth={arrowheadSize}
                    markerHeight={arrowheadSize}
                    refX={arrowheadSize * 0.9 + arrowheadStartPoint}
                    refY={arrowheadSize / 2}
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d={`M 0,0 L 0,${arrowheadSize} L ${arrowheadSize * 0.9},${arrowheadSize / 2} Z`} fill="#000000" stroke="#000000" strokeWidth="0.5" />
                  </marker>
                  {/* Arrow marker for special connections (black) */}
                  <marker
                    id="arrowhead-special"
                    markerWidth={arrowheadSize}
                    markerHeight={arrowheadSize}
                    refX={arrowheadSize * 0.9 + arrowheadStartPoint}
                    refY={arrowheadSize / 2}
                    orient="auto"
                    markerUnits="userSpaceOnUse"
                  >
                    <path d={`M 0,0 L 0,${arrowheadSize} L ${arrowheadSize * 0.9},${arrowheadSize / 2} Z`} fill="#000000" stroke="#000000" strokeWidth="0.5" />
                  </marker>
                </defs>

                <g transform={`translate(${panX / zoom}, ${panY / zoom}) scale(${zoom})`}>
                  {/* Draw connections between skills */}
                  {skills.flatMap(skill => {
                    if (!skill.connections || skill.connections.length === 0) return [];
                    
                    const sourceLayer = skill.layer;
                    const sourceRadius = getLayerRadius(sourceLayer);
                    const sourceAngle = (skill.position * Math.PI / 180) - Math.PI / 2;
                    const sourceXOnLayer = sourceRadius * Math.cos(sourceAngle);
                    const sourceYOnLayer = sourceRadius * Math.sin(sourceAngle);
                    
                    return skill.connections.map((conn) => {
                      const targetSkill = skills.find(s => s._id === conn.targetSkillId);
                      if (!targetSkill) return null;

                      const targetRadius = getLayerRadius(targetSkill.layer);
                      const targetAngle = (targetSkill.position * Math.PI / 180) - Math.PI / 2;
                      const targetXOnLayer = targetRadius * Math.cos(targetAngle);
                      const targetYOnLayer = targetRadius * Math.sin(targetAngle);
                      
                      // Connection line starts from the center of the source node
                      let sourceX, sourceY;
                      if (sourceLayer === 0) {
                        // Center node: start from center (0, 0)
                        sourceX = 0;
                        sourceY = 0;
                      } else {
                        // Other nodes: start from center of the node (which is on the layer circle)
                        sourceX = sourceXOnLayer;
                        sourceY = sourceYOnLayer;
                      }

                      // Default to true if undefined, only false if explicitly set to false
                      const hasArrowhead = conn.hasArrowhead !== false;
                      
                      // Calculate target point: if arrowhead, stop at node edge; otherwise at center
                      let targetX, targetY;
                      if (hasArrowhead) {
                        // With arrowhead: stop at node edge with gap (pointing to circle without overlapping)
                        const isTargetExtra = targetSkill.nodeType === 'EXTRA' || targetSkill.nodeColor === 'purple';
                        const targetNodeRadius = targetSkill.layer === 0 
                          ? (isTargetExtra ? 120 : 60)  // EXTRA center nodes are 120, regular are 60
                          : (isTargetExtra ? 100 : 50); // EXTRA circular nodes are 100, regular are 50
                        const totalGap = targetNodeRadius + arrowheadGapFromNode; // Node radius + gap from node
                        const distanceFromCenter = Math.sqrt(targetXOnLayer * targetXOnLayer + targetYOnLayer * targetYOnLayer);
                        
                        if (targetSkill.layer === 0) {
                          // Center node: calculate direction from source to center
                          const dirX = -sourceXOnLayer;
                          const dirY = -sourceYOnLayer;
                          const dirLength = Math.sqrt(dirX * dirX + dirY * dirY);
                          if (dirLength > 0) {
                            targetX = (dirX / dirLength) * totalGap;
                            targetY = (dirY / dirLength) * totalGap;
                          } else {
                            targetX = totalGap;
                            targetY = 0;
                          }
                        } else {
                          // Other nodes: move back from center by node radius + gap along radial direction
                          const dirX = targetXOnLayer / distanceFromCenter;
                          const dirY = targetYOnLayer / distanceFromCenter;
                          targetX = targetXOnLayer - dirX * totalGap;
                          targetY = targetYOnLayer - dirY * totalGap;
                        }
                      } else {
                        // No arrowhead: stop at center
                        if (targetSkill.layer === 0) {
                          targetX = 0;
                          targetY = 0;
                        } else {
                          targetX = targetXOnLayer;
                          targetY = targetYOnLayer;
                        }
                      }
                      
                      // If has arrow head, use black; otherwise use #6631D7
                      const color = hasArrowhead ? '#000000' : '#6631D7';
                      const marker = hasArrowhead
                        ? (conn.connectionType === 'special' ? 'url(#arrowhead-special)' : 'url(#arrowhead-normal)')
                        : 'none';

                      // Helper function to calculate point on circle
                      const getPointOnCircle = (layer: number, position: number) => {
                        const radius = getLayerRadius(layer);
                        const angle = (position * Math.PI / 180) - Math.PI / 2;
                        return {
                          x: radius * Math.cos(angle),
                          y: radius * Math.sin(angle)
                        };
                      };
                      
                      // Helper function to create arc path between two points on same circle
                      const createArc = (layer: number, startPos: number, endPos: number) => {
                        const radius = getLayerRadius(layer);
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
                      const breakPoints = conn.breakPoints || [];
                      
                      if (breakPoints.length > 0) {
                        let currentLayer = skill.layer;
                        let currentPos = skill.position;
                        
                        breakPoints.forEach((bp) => {
                          const bpPoint = getPointOnCircle(bp.layer, bp.position);
                          
                          if (bp.layer === currentLayer) {
                            pathD += createArc(currentLayer, currentPos, bp.position);
                          } else {
                            pathD += ` L ${bpPoint.x} ${bpPoint.y}`;
                          }
                          
                          currentLayer = bp.layer;
                          currentPos = bp.position;
                        });
                        
                        if (targetSkill.layer === currentLayer) {
                          // Same layer as last break point - arc to layer circle, then line to node edge
                          pathD += createArc(currentLayer, currentPos, targetSkill.position);
                          // Add line from layer circle to node edge
                          pathD += ` L ${targetX} ${targetY}`;
                        } else {
                          // Different layer - straight line to node edge
                          pathD += ` L ${targetX} ${targetY}`;
                        }
                      } else {
                        // No break points - check if source and target are on same layer
                        if (skill.layer === targetSkill.layer) {
                          // Same layer - arc to layer circle, then line to node edge
                          pathD += createArc(skill.layer, skill.position, targetSkill.position);
                          // Add line from layer circle to node edge
                          pathD += ` L ${targetX} ${targetY}`;
                        } else {
                          // Different layer - straight line to node edge
                          pathD += ` L ${targetX} ${targetY}`;
                        }
                      }

                      return (
                        <path
                          key={`conn-${skill._id}-${conn.targetSkillId}`}
                          d={pathD}
                          stroke={color}
                          strokeWidth="5"
                          fill="none"
                          markerEnd={marker}
                          opacity="0.9"
                          strokeLinecap="round"
                        />
                      );
                    });
                  }).filter(Boolean)}

                  {/* Center node (layer 0) */}
                  {skills.filter(s => s.layer === 0).map((skill) => {
                    const isUnlocked = unlockedSkills.includes(skill._id);
                    const canUnlock = canUnlockSkill(skill);
                    const isExtraNode = skill.nodeType === 'EXTRA' || skill.nodeColor === 'purple';
                    const nodeRadius = isExtraNode ? 120 : 60; // EXTRA nodes are twice the size
                    return (
                      <g key={skill._id} className="skill-node-center-group">
                        <circle
                          cx="0"
                          cy="0"
                          r={nodeRadius}
                          fill={getNodeColor(skill.nodeColor)}
                          stroke={getNodeStrokeColor(skill.nodeColor)}
                          strokeWidth="4"
                          className={`${canUnlock ? 'skill-node-available' : ''} ${highlightedSkillId === skill._id ? 'skill-node-highlight' : ''}`}
                          style={{ 
                            cursor: 'pointer', 
                            pointerEvents: 'all',
                            opacity: highlightedSkillId === skill._id ? 1 : (isUnlocked ? 1 : 1),
                            filter: isUnlocked ? 'none' : 'grayscale(0.3) brightness(0.9)',
                            r: nodeRadius // Ensure radius is set in style as well
                          }}
                          onClick={() => handleSkillClick(skill)}
                        />
                      <text
                        x="0"
                        y="0"
                        textAnchor="middle"
                        fill="#000000"
                        fontSize="28"
                        fontWeight="bold"
                        fontFamily="Dongle, sans-serif"
                        style={{ pointerEvents: 'none' }}
                      >
                        {wrapText(skill.title, isExtraNode ? 360 : 180, 28).map((line, idx) => {
                          const totalLines = wrapText(skill.title, isExtraNode ? 360 : 180, 28).length;
                          const offsetY = totalLines === 1 ? "0.15em" : -((totalLines - 1) * 28) / 2 + 4;
                          return <tspan key={idx} x="0" dy={idx === 0 ? `${offsetY}` : "28"}>{line}</tspan>;
                        })}
                      </text>
                    </g>
                    );
                  })}

                  {/* Skills on circular layers (1-7) */}
                  {[1, 2, 3, 4, 5, 6, 7].map(layer => {
                    const layerSkills = skills.filter(s => s.layer === layer);
                    const radius = getLayerRadius(layer);

                    return layerSkills.map((skill) => {
                      const angle = (skill.position * Math.PI / 180) - Math.PI / 2;
                      const x = radius * Math.cos(angle);
                      const y = radius * Math.sin(angle);
                      const isUnlocked = unlockedSkills.includes(skill._id);
                      const canUnlock = canUnlockSkill(skill);

                      const isExtraNode = skill.nodeType === 'EXTRA' || skill.nodeColor === 'purple';
                      const nodeRadius = isExtraNode ? 100 : 50; // EXTRA nodes are twice the size
                      return (
                        <g key={skill._id} className="skill-node-group">
                          {/* Skill node */}
                          <circle
                            cx={x}
                            cy={y}
                            r={nodeRadius}
                            fill={getNodeColor(skill.nodeColor)}
                            stroke={getNodeStrokeColor(skill.nodeColor)}
                            strokeWidth="3"
                            className={`${canUnlock ? 'skill-node-available' : ''} ${highlightedSkillId === skill._id ? 'skill-node-highlight' : ''}`}
                            style={{ 
                              cursor: 'pointer', 
                              pointerEvents: 'all',
                              opacity: isUnlocked ? 1 : 1,
                              filter: isUnlocked ? 'none' : 'grayscale(0.3) brightness(0.9)',
                              r: nodeRadius // Ensure radius is set in style as well
                            }}
                            onClick={() => handleSkillClick(skill)}
                          />
                          
                          {/* Skill title */}
                          <text
                            x={x}
                            y={y}
                            textAnchor="middle"
                            fill="#000000"
                            fontSize="28"
                            fontWeight="bold"
                            fontFamily="Dongle, sans-serif"
                            style={{ pointerEvents: 'none' }}
                          >
                            {wrapText(skill.title, isExtraNode ? 300 : 150, 28).map((line, idx) => {
                              const totalLines = wrapText(skill.title, isExtraNode ? 300 : 150, 28).length;
                              const offsetY = totalLines === 1 ? "0.15em" : -((totalLines - 1) * 28) / 2 + 4;
                              return <tspan key={idx} x={x} dy={idx === 0 ? `${offsetY}` : "28"}>{line}</tspan>;
                            })}
                          </text>
                        </g>
                      );
                    });
                  })}
                </g>
              </svg>
              <div className="skill-tree-help">
                <p>💡 <strong>Scroll</strong> to zoom | <strong>Shift+Drag</strong> to pan | <strong>Left-click</strong> node for details</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skill Detail Modal */}
      {showSkillModal && selectedSkill && (
        <div className="guild-selection-modal-overlay" onClick={() => setShowSkillModal(false)}>
          <div className="guild-selection-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="guild-selection-header">
              <h2>{selectedSkill.title}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                <span style={{ fontSize: '1.4rem', color: '#6b7280' }}>
                  {(() => {
                    const isAdventure = selectedSkill.nodeType === 'adventure' || selectedSkill.nodeColor === 'white';
                    const isMarker = selectedSkill.nodeType === 'marker' || selectedSkill.nodeColor === 'yellow';
                    if (isAdventure) {
                      return <strong style={{ color: '#4e98ff' }}>Free Adventure</strong>;
                    } else if (isMarker) {
                      return <strong style={{ color: '#4e98ff' }}>Free Marker</strong>;
                    } else {
                      return <>Cost: <strong style={{ color: '#4e98ff' }}>{selectedSkill.cost} AP</strong></>;
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
                <div style={{ fontSize: '1.4rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', color: '#374151' }}>
                  {renderDescriptionWithImages(selectedSkill.description)}
                </div>
              </div>

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
                            {isUnlocked ? '✓' : '✗'} {prereqSkill?.title || 'Unknown Skill'}
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
                selectedSkill.nodeType !== 'adventure' && selectedSkill.nodeColor !== 'white' && (
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
                  disabled={!canUnlockSkill(selectedSkill)}
                  style={{
                    background: canUnlockSkill(selectedSkill) 
                      ? 'linear-gradient(135deg, #22c55e, #16a34a)' 
                      : '#6b7280',
                    boxShadow: canUnlockSkill(selectedSkill)
                      ? '0 4px 20px rgba(34, 197, 94, 0.6), 0 0 20px rgba(34, 197, 94, 0.4)'
                      : 'none',
                    animation: canUnlockSkill(selectedSkill) ? 'glow 2s ease-in-out infinite' : 'none',
                    opacity: canUnlockSkill(selectedSkill) ? 1 : 0.6,
                    cursor: canUnlockSkill(selectedSkill) ? 'pointer' : 'not-allowed'
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
                      return '📤 Send Approval Request';
                    } else {
                      return `🔓 Unlock Skill (${selectedSkill.cost} AP)`;
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

      {/* Approval Request Modal */}
      {showApprovalRequestModal && selectedSkill && (
        <div className="guild-selection-modal-overlay" onClick={() => setShowApprovalRequestModal(false)}>
          <div className="guild-selection-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="guild-selection-header">
              <h2>Send Approval Request</h2>
              <p style={{ fontSize: '1.4rem', color: '#6b7280', marginTop: '8px' }}>
                Request approval for: <strong>{selectedSkill.title}</strong>
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
