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

function MainMenu() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [customPhrase] = useState<string>('"The only way to do great work is to love what you do. If you haven\'t found it yet, keep looking. Don\'t settle."');

  // Mock data
  const [assetPoints] = useState(300);
  const [techTokens] = useState(300);
  const [voiceToday] = useState(300);

  // Skill Tree states
  const [skills, setSkills] = useState<Skill[]>([]);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(0);
  const [panStartY, setPanStartY] = useState(0);
  const [layerGap] = useState(120); // Same as admin panel

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadSkills();
    }
  }, [user]);

  const loadSkills = async () => {
    try {
      const response = await axios.get('/api/skills');
      if (response.data.success) {
        setSkills(response.data.skills);
      }
    } catch (error) {
      console.error('Error loading skills:', error);
    }
  };

  const checkAuth = async () => {
    try {
      const response = await axios.get('/api/auth/user');
      if (response.data.authenticated && response.data.user) {
        setUser(response.data.user);
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
  const getNodeColor = (color: string) => {
    const colors: { [key: string]: string } = {
      yellow: '#eab308',
      blue: '#3b82f6',
      green: '#22c55e',
      white: '#ffffff',
      purple: '#9333ea'
    };
    return colors[color] || colors.blue;
  };

  const getNodeStrokeColor = (color: string) => {
    const colors: { [key: string]: string } = {
      yellow: '#ca8a04',
      blue: '#2563eb',
      green: '#16a34a',
      white: '#000000',
      purple: '#7e22ce'
    };
    return colors[color] || colors.blue;
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
    if (e.shiftKey || e.button === 1) {
      setIsPanning(true);
      setPanStartX(e.clientX - panX);
      setPanStartY(e.clientY - panY);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPanX(e.clientX - panStartX);
      setPanY(e.clientY - panStartY);
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
              <span className="stat-label">Tech Token:</span>
              <span className="stat-value">{techTokens}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Voice Today :</span>
              <span className="stat-value">{voiceToday}m</span>
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
            {/* Zoom Controls */}
            <div className="zoom-controls">
              <button className="zoom-btn" onClick={zoomIn} title="Zoom In">➕</button>
              <button className="zoom-btn" onClick={resetView} title="Reset View">🎯</button>
              <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">➖</button>
              <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            </div>

            <div className="skill-tree-container">
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
                  {/* Draw connections between skills */}
                  {skills.flatMap(skill => {
                    if (!skill.connections || skill.connections.length === 0) return [];
                    
                    const sourceLayer = skill.layer;
                    const sourceRadius = sourceLayer * layerGap;
                    const sourceAngle = (skill.position * Math.PI / 180) - Math.PI / 2;
                    const sourceX = sourceRadius * Math.cos(sourceAngle);
                    const sourceY = sourceRadius * Math.sin(sourceAngle);

                    return skill.connections.map((conn) => {
                      const targetSkill = skills.find(s => s._id === conn.targetSkillId);
                      if (!targetSkill) return null;

                      const targetRadius = targetSkill.layer * layerGap;
                      const targetAngle = (targetSkill.position * Math.PI / 180) - Math.PI / 2;
                      const targetX = targetRadius * Math.cos(targetAngle);
                      const targetY = targetRadius * Math.sin(targetAngle);

                      const color = conn.connectionType === 'special' ? '#ef4444' : '#9333ea';
                      const marker = conn.hasArrowhead !== false 
                        ? (conn.connectionType === 'special' ? 'url(#arrowhead-special)' : 'url(#arrowhead-normal)')
                        : 'none';

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
                          pathD += createArc(currentLayer, currentPos, targetSkill.position);
                        } else {
                          pathD += ` L ${targetX} ${targetY}`;
                        }
                      } else {
                        pathD += ` L ${targetX} ${targetY}`;
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
                      {skill.cost > 0 && (
                        <text
                          x="0"
                          y="25"
                          textAnchor="middle"
                          fill={skill.nodeColor === 'white' ? '#000000' : '#ffffff'}
                          fontSize="12"
                          fontWeight="bold"
                          style={{ pointerEvents: 'none' }}
                        >
                          {skill.cost} AP
                        </text>
                      )}
                    </g>
                  ))}

                  {/* Skills on circular layers (1-6) */}
                  {[1, 2, 3, 4, 5, 6].map(layer => {
                    const layerSkills = skills.filter(s => s.layer === layer);
                    const radius = layer * layerGap;

                    return layerSkills.map((skill) => {
                      const angle = (skill.position * Math.PI / 180) - Math.PI / 2;
                      const x = radius * Math.cos(angle);
                      const y = radius * Math.sin(angle);

                      return (
                        <g key={skill._id}>
                          <circle
                            cx={x}
                            cy={y}
                            r="40"
                            fill={getNodeColor(skill.nodeColor)}
                            stroke={getNodeStrokeColor(skill.nodeColor)}
                            strokeWidth="3"
                            className="skill-node"
                            style={{ cursor: 'pointer' }}
                          />
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
                          {skill.cost > 0 && (
                            <text
                              x={x}
                              y={y + 20}
                              textAnchor="middle"
                              fill={skill.nodeColor === 'white' || skill.nodeColor === 'yellow' ? '#000000' : '#ffffff'}
                              fontSize="11"
                              fontWeight="bold"
                              style={{ pointerEvents: 'none' }}
                            >
                              {skill.cost} AP
                            </text>
                          )}
                        </g>
                      );
                    });
                  })}
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MainMenu;
