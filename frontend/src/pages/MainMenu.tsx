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
}

interface SkillNode {
  id: number;
  x: number;
  y: number;
  color: string;
  connections: number[];
}

function MainMenu() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'adventure' | 'skilltree'>('adventure');
  const [customPhrase] = useState<string>('"The only way to do great work is to love what you do. If you haven\'t found it yet, keep looking. Don\'t settle."');

  // Mock data
  const [assetPoints] = useState(300);
  const [techTokens] = useState(300);
  const [voiceToday] = useState(300);

  // Skill tree nodes matching reference image
  const [skillNodes] = useState<SkillNode[]>([
    // Green nodes (left column)
    { id: 1, x: 15, y: 15, color: '#4ade80', connections: [9] },
    { id: 2, x: 15, y: 25, color: '#4ade80', connections: [9] },
    { id: 3, x: 15, y: 35, color: '#4ade80', connections: [10] },
    { id: 4, x: 15, y: 45, color: '#4ade80', connections: [10] },
    { id: 5, x: 15, y: 55, color: '#4ade80', connections: [11] },
    { id: 6, x: 15, y: 65, color: '#4ade80', connections: [11] },
    { id: 7, x: 15, y: 75, color: '#4ade80', connections: [12] },
    { id: 8, x: 15, y: 85, color: '#4ade80', connections: [12] },
    
    // Yellow/Orange connector nodes
    { id: 9, x: 35, y: 20, color: '#fbbf24', connections: [13] },
    { id: 10, x: 35, y: 40, color: '#fbbf24', connections: [13] },
    { id: 11, x: 35, y: 60, color: '#fbbf24', connections: [14] },
    { id: 12, x: 35, y: 80, color: '#fbbf24', connections: [14] },
    { id: 13, x: 55, y: 30, color: '#fbbf24', connections: [15, 16, 17] },
    
    // Red nodes (right side - top branch)
    { id: 14, x: 55, y: 70, color: '#fbbf24', connections: [18, 19, 20] },
    { id: 15, x: 75, y: 15, color: '#ef4444', connections: [] },
    { id: 16, x: 75, y: 25, color: '#ef4444', connections: [] },
    { id: 17, x: 75, y: 35, color: '#ef4444', connections: [] },
    
    // Red nodes (right side - bottom branch)
    { id: 18, x: 75, y: 60, color: '#ef4444', connections: [] },
    { id: 19, x: 75, y: 70, color: '#ef4444', connections: [] },
    { id: 20, x: 75, y: 80, color: '#ef4444', connections: [] },
    { id: 21, x: 85, y: 65, color: '#ef4444', connections: [] },
    { id: 22, x: 85, y: 75, color: '#ef4444', connections: [] },
  ]);

  useEffect(() => {
    checkAuth();
  }, []);

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
              <svg className="nav-icon" viewBox="0 0 100 100" fill="currentColor">
                <text x="50" y="70" textAnchor="middle" fontSize="70" fontWeight="bold" fontFamily="serif">G</text>
              </svg>
            </div>
            <span className="nav-text">Guild</span>
          </div>

          {/* Tech Support Card */}
          <div className="nav-item support">
            <div className="nav-icon-wrapper">
              <svg className="nav-icon" viewBox="0 0 100 100" fill="currentColor">
                <circle cx="50" cy="35" r="15"/>
                <path d="M 50 50 Q 35 55 35 70 L 35 85 Q 35 90 40 90 L 45 90 L 45 75 Q 45 70 50 70 Q 55 70 55 75 L 55 90 L 60 90 Q 65 90 65 85 L 65 70 Q 65 55 50 50"/>
                <path d="M 25 25 Q 20 25 20 30 L 20 50 Q 20 55 25 55 L 35 55 L 35 40 L 25 40 Z"/>
                <path d="M 75 25 Q 80 25 80 30 L 80 50 Q 80 55 75 55 L 65 55 L 65 40 L 75 40 Z"/>
              </svg>
            </div>
            <span className="nav-text">Tech Support</span>
          </div>

          {/* Leaderboard Card */}
          <div className="nav-item leaderboard">
            <div className="nav-icon-wrapper">
              <svg className="nav-icon" viewBox="0 0 100 100" fill="currentColor">
                <rect x="15" y="60" width="20" height="35" rx="3"/>
                <rect x="40" y="40" width="20" height="55" rx="3"/>
                <rect x="65" y="25" width="20" height="70" rx="3"/>
              </svg>
            </div>
            <span className="nav-text">Leaderboard</span>
          </div>
        </div>
      </div>

      {/* Main Content Panel */}
      <div className="main-panel">
        {/* Slider Toggle and Logout */}
        <div className="panel-header">
          <div className="toggle-slider">
            <div className={`toggle-slider-bg ${activeTab === 'skilltree' ? 'right' : ''}`}></div>
            <button 
              className={`toggle-option ${activeTab === 'adventure' ? 'active' : ''}`}
              onClick={() => setActiveTab('adventure')}
            >
              Adventure
            </button>
            <button 
              className={`toggle-option ${activeTab === 'skilltree' ? 'active' : ''}`}
              onClick={() => setActiveTab('skilltree')}
            >
              Skill Tree
            </button>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>

        {/* Content */}
        <div className="panel-content">
          {activeTab === 'adventure' ? (
            <div className="adventure-view">
              <p>Adventure content coming soon...</p>
            </div>
          ) : (
            <div className="skilltree-view">
              <svg className="skill-tree" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                {/* Draw connections */}
                {skillNodes.map(node => 
                  node.connections.map(targetId => {
                    const target = skillNodes.find(n => n.id === targetId);
                    if (!target) return null;
                    return (
                      <line
                        key={`${node.id}-${targetId}`}
                        x1={node.x}
                        y1={node.y}
                        x2={target.x}
                        y2={target.y}
                        stroke="#d1d5db"
                        strokeWidth="0.4"
                      />
                    );
                  })
                )}
                
                {/* Draw nodes */}
                {skillNodes.map(node => (
                  <circle
                    key={node.id}
                    cx={node.x}
                    cy={node.y}
                    r="2.5"
                    fill={node.color}
                    className="node"
                  />
                ))}
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MainMenu;
