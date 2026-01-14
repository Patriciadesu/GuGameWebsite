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
  const [layerGaps, setLayerGaps] = useState<{ [key: number]: number }>({ 1: 120, 2: 120, 3: 120, 4: 120, 5: 120, 6: 120 }); // Gap for each layer
  const [arrowheadGapFromNode, setArrowheadGapFromNode] = useState(0); // Gap from target node edge
  const [arrowheadStartPoint, setArrowheadStartPoint] = useState(0); // Distance from path end where arrowhead starts
  const [arrowheadSize, setArrowheadSize] = useState(20); // Size of the arrowhead

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      loadSkills();
      loadSkillTreeSettings();
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
          for (let i = 1; i <= 6; i++) {
            gaps[i] = settings.layerGaps[i] || settings.layerGap || 120;
          }
          setLayerGaps(gaps);
        } else {
          // Fallback to single layerGap for backward compatibility
          const defaultGap = settings.layerGap || 120;
          setLayerGaps({ 1: defaultGap, 2: defaultGap, 3: defaultGap, 4: defaultGap, 5: defaultGap, 6: defaultGap });
        }
        setArrowheadGapFromNode(settings.arrowheadGapFromNode || 0);
        setArrowheadStartPoint(settings.arrowheadStartPoint || 0);
        setArrowheadSize(settings.arrowheadSize || 20);
      }
    } catch (error) {
      console.error('Error loading skill tree settings:', error);
    }
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
                        const targetNodeRadius = targetSkill.layer === 0 ? 60 : 50;
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
                  {skills.filter(s => s.layer === 0).map((skill) => (
                    <g key={skill._id} className="skill-node-center-group">
                      <circle
                        cx="0"
                        cy="0"
                        r="60"
                        fill={getNodeColor(skill.nodeColor)}
                        stroke={getNodeStrokeColor(skill.nodeColor)}
                        strokeWidth="4"
                        style={{ cursor: 'pointer', pointerEvents: 'all' }}
                      />
                      <text
                        x="0"
                        y="0"
                        textAnchor="middle"
                        fill={skill.nodeColor === 'white' ? '#000000' : '#ffffff'}
                        fontSize="28"
                        fontWeight="bold"
                        fontFamily="Dongle, sans-serif"
                        style={{ pointerEvents: 'none' }}
                      >
                        {wrapText(skill.title, 180, 28).map((line, idx) => {
                          const totalLines = wrapText(skill.title, 180, 28).length;
                          const offsetY = totalLines === 1 ? "0.15em" : -((totalLines - 1) * 28) / 2 + 4;
                          return <tspan key={idx} x="0" dy={idx === 0 ? `${offsetY}` : "28"}>{line}</tspan>;
                        })}
                      </text>
                    </g>
                  ))}

                  {/* Skills on circular layers (1-6) */}
                  {[1, 2, 3, 4, 5, 6].map(layer => {
                    const layerSkills = skills.filter(s => s.layer === layer);
                    const radius = getLayerRadius(layer);

                    return layerSkills.map((skill) => {
                      const angle = (skill.position * Math.PI / 180) - Math.PI / 2;
                      const x = radius * Math.cos(angle);
                      const y = radius * Math.sin(angle);

                      return (
                        <g key={skill._id} className="skill-node-group">
                          {/* Skill node */}
                          <circle
                            cx={x}
                            cy={y}
                            r="50"
                            fill={getNodeColor(skill.nodeColor)}
                            stroke={getNodeStrokeColor(skill.nodeColor)}
                            strokeWidth="3"
                            style={{ cursor: 'pointer', pointerEvents: 'all' }}
                          />
                          
                          {/* Skill title */}
                          <text
                            x={x}
                            y={y}
                            textAnchor="middle"
                            fill={skill.nodeColor === 'white' || skill.nodeColor === 'yellow' ? '#000000' : '#ffffff'}
                            fontSize="28"
                            fontWeight="bold"
                            fontFamily="Dongle, sans-serif"
                            style={{ pointerEvents: 'none' }}
                          >
                            {wrapText(skill.title, 150, 28).map((line, idx) => {
                              const totalLines = wrapText(skill.title, 150, 28).length;
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
    </div>
  );
}

export default MainMenu;
