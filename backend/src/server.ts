import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import axios from 'axios';
import User, { IUser } from './models/User';
import Guild, { IGuild } from './models/Guild';
import Skill, { ISkill } from './models/Skill';

// Extend Express types for Passport
declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      discriminator: string;
      avatar: string | null;
      email?: string;
      isAdmin: boolean;
      role: 'user' | 'admin' | 'super-admin';
    }
  }
}

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const MONGODB_URI = process.env.MONGODB_URI || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const ADMIN_GUILD_ID = process.env.ADMIN_GUILD_ID || '';
const ADMIN_ROLE_IDS = process.env.ADMIN_ROLE_IDS?.split(',') || [];
const SUPER_ADMIN_ROLE_IDS = process.env.SUPER_ADMIN_ROLE_IDS?.split(',') || [];

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

if (!ADMIN_GUILD_ID || ADMIN_ROLE_IDS.length === 0) {
  console.warn('⚠️ ADMIN_GUILD_ID and ADMIN_ROLE_IDS not set - all users will be marked as regular users');
}

if (SUPER_ADMIN_ROLE_IDS.length === 0) {
  console.warn('⚠️ SUPER_ADMIN_ROLE_IDS not set - no users will have super-admin access');
} else {
  console.log(`✅ Super-Admin Role IDs loaded: ${SUPER_ADMIN_ROLE_IDS.join(', ')}`);
}

if (ADMIN_ROLE_IDS.length > 0) {
  console.log(`✅ Admin Role IDs loaded: ${ADMIN_ROLE_IDS.join(', ')}`);
}

console.log(`✅ Admin Guild ID: ${ADMIN_GUILD_ID}`);

// Helper function to check user's role and get nickname in the admin guild
async function checkUserRoleAndNickname(accessToken: string, userId: string): Promise<{ role: 'user' | 'admin' | 'super-admin', nickname?: string }> {
  try {
    // Fetch the user's guild member information
    const response = await axios.get(
      `https://discord.com/api/v10/users/@me/guilds/${ADMIN_GUILD_ID}/member`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const memberData = response.data;
    const userRoles: string[] = memberData.roles || [];
    const nickname = memberData.nick || undefined; // Guild nickname

    // Debug logging
    console.log(`🔍 Checking roles for user ${userId}:`);
    console.log(`  User's Discord roles: ${userRoles.join(', ')}`);
    console.log(`  Guild nickname: ${nickname || 'None (using username)'}`);
    console.log(`  Super-Admin role IDs to check: ${SUPER_ADMIN_ROLE_IDS.join(', ')}`);
    console.log(`  Admin role IDs to check: ${ADMIN_ROLE_IDS.join(', ')}`);

    // Check for super-admin role first (highest priority)
    const hasSuperAdminRole = SUPER_ADMIN_ROLE_IDS.some(roleId => {
      const trimmedRoleId = roleId.trim();
      const hasRole = userRoles.includes(trimmedRoleId);
      if (hasRole) {
        console.log(`  ✅ Found super-admin role: ${trimmedRoleId}`);
      }
      return hasRole;
    });
    
    if (hasSuperAdminRole) {
      console.log(`  🔐 Result: SUPER-ADMIN`);
      return { role: 'super-admin', nickname };
    }

    // Check for admin role
    const hasAdminRole = ADMIN_ROLE_IDS.some(roleId => {
      const trimmedRoleId = roleId.trim();
      const hasRole = userRoles.includes(trimmedRoleId);
      if (hasRole) {
        console.log(`  ✅ Found admin role: ${trimmedRoleId}`);
      }
      return hasRole;
    });
    
    if (hasAdminRole) {
      console.log(`  ⚡ Result: ADMIN`);
      return { role: 'admin', nickname };
    }

    // Default to regular user
    console.log(`  👤 Result: USER (no special roles found)`);
    return { role: 'user', nickname };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ Error checking user roles: ${error.response?.status} - ${error.response?.statusText}`);
      console.error('Response data:', error.response?.data);
    } else {
      console.error('❌ Error checking user roles:', error);
    }
    return { role: 'user' };
  }
}

// Trust proxy for cookies behind Nginx
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// MongoDB connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    touchAfter: 24 * 3600
  }),
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Passport Discord Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID || '',
  clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  callbackURL: process.env.DISCORD_CALLBACK_URL || '',
  scope: ['identify', 'email', 'guilds.members.read']
},
async (accessToken: string, refreshToken: string, profile: any, done: any) => {
  try {
    // Check user's role and get nickname from Discord guild
    const { role: userRole, nickname } = await checkUserRoleAndNickname(accessToken, profile.id);
    const isAdmin = userRole === 'admin' || userRole === 'super-admin';

    // Log the user's role
    const displayName = nickname || profile.username;
    if (userRole === 'super-admin') {
      console.log(`🔐 User ${displayName} (${profile.id}) logged in as SUPER-ADMIN`);
    } else if (userRole === 'admin') {
      console.log(`✅ User ${displayName} (${profile.id}) logged in as ADMIN`);
    } else {
      console.log(`ℹ️ User ${displayName} (${profile.id}) logged in as regular USER`);
    }

    let user = await User.findOne({ discordId: profile.id });

    if (user) {
      // Update existing user
      user.username = profile.username;
      user.nickname = nickname;
      user.discriminator = profile.discriminator;
      user.avatar = profile.avatar;
      user.email = profile.email;
      user.accessToken = accessToken;
      user.refreshToken = refreshToken;
      user.isAdmin = isAdmin;
      user.role = userRole;
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        discordId: profile.id,
        username: profile.username,
        nickname: nickname,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
        email: profile.email,
        accessToken,
        refreshToken,
        isAdmin,
        role: userRole
      });
    }

    return done(null, {
      id: user.discordId,
      username: user.nickname || user.username, // Use nickname if available
      discriminator: user.discriminator,
      avatar: user.avatar,
      email: user.email,
      isAdmin: user.isAdmin,
      role: user.role
    });
  } catch (error) {
    return done(error, null);
  }
}));

// Serialize user
passport.serializeUser((user: Express.User, done) => {
  done(null, user.id);
});

// Deserialize user
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findOne({ discordId: id });
    if (user) {
      done(null, {
        id: user.discordId,
        username: user.nickname || user.username, // Use nickname if available
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
        isAdmin: user.isAdmin,
        role: user.role
      });
    } else {
      done(null, false);
    }
  } catch (error) {
    done(error, null);
  }
});

// Middleware for role-based access control
const requireAuth = (req: Request, res: Response, next: any) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized', message: 'You must be logged in to access this resource' });
};

const requireAdmin = (req: Request, res: Response, next: any) => {
  if (req.isAuthenticated() && req.user && (req.user.role === 'admin' || req.user.role === 'super-admin')) {
    return next();
  }
  res.status(403).json({ error: 'Forbidden', message: 'Admin access required' });
};

const requireSuperAdmin = (req: Request, res: Response, next: any) => {
  if (req.isAuthenticated() && req.user && req.user.role === 'super-admin') {
    return next();
  }
  res.status(403).json({ error: 'Forbidden', message: 'Super-admin access required' });
};

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'GuGame Backend API' });
});

// Discord OAuth routes
app.get('/api/auth/discord', passport.authenticate('discord'));

app.get('/api/auth/discord/callback',
  passport.authenticate('discord', { 
    failureRedirect: `${FRONTEND_URL}/login?error=auth_failed`
  }),
  (req: Request, res: Response) => {
    res.redirect(`${FRONTEND_URL}/mainmenu`);
  }
);

// Check authentication status
app.get('/api/auth/user', (req: Request, res: Response) => {
  if (req.isAuthenticated()) {
    res.json({ authenticated: true, user: req.user });
  } else {
    res.json({ authenticated: false });
  }
});

// Logout route
app.post('/api/auth/logout', (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Protected routes examples
// Example: User-only route (requires authentication)
app.get('/api/user/profile', requireAuth, (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'User profile accessed',
    user: req.user 
  });
});

// Example: Admin route (requires admin or super-admin role)
app.get('/api/admin/dashboard', requireAdmin, (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'Admin dashboard accessed',
    role: req.user?.role 
  });
});

// Example: Super-admin route (requires super-admin role only)
app.get('/api/super-admin/settings', requireSuperAdmin, (req: Request, res: Response) => {
  res.json({ 
    success: true, 
    message: 'Super-admin settings accessed',
    role: req.user?.role 
  });
});

// ===== GUILD MANAGEMENT ROUTES =====

// Create a new guild (super-admin only)
app.post('/api/guilds', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, guildLeaderId, adminIds } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Guild name is required' });
    }

    // Check if guild name already exists
    const existingGuild = await Guild.findOne({ name });
    if (existingGuild) {
      return res.status(400).json({ error: 'Guild name already exists' });
    }

    // Verify guild leader exists and has appropriate role
    if (guildLeaderId) {
      const leader = await User.findOne({ discordId: guildLeaderId });
      if (!leader) {
        return res.status(400).json({ error: 'Guild leader not found' });
      }
      if (leader.role !== 'admin' && leader.role !== 'super-admin') {
        return res.status(400).json({ error: 'Guild leader must be an admin or super-admin' });
      }
    }

    const guild = await Guild.create({
      name,
      guildLeaderId: guildLeaderId || undefined,
      adminIds: adminIds || [],
      createdBy: req.user!.id
    });

    res.json({ success: true, guild });
  } catch (error) {
    console.error('Error creating guild:', error);
    res.status(500).json({ error: 'Failed to create guild' });
  }
});

// Get all guilds (admin and super-admin)
app.get('/api/guilds', requireAdmin, async (req: Request, res: Response) => {
  try {
    const guilds = await Guild.find().sort({ createdAt: -1 });
    res.json({ success: true, guilds });
  } catch (error) {
    console.error('Error fetching guilds:', error);
    res.status(500).json({ error: 'Failed to fetch guilds' });
  }
});

// Get guild by ID (admin and super-admin)
app.get('/api/guilds/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const guild = await Guild.findById(req.params.id);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }
    res.json({ success: true, guild });
  } catch (error) {
    console.error('Error fetching guild:', error);
    res.status(500).json({ error: 'Failed to fetch guild' });
  }
});

// Update guild (super-admin only)
app.put('/api/guilds/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, guildLeaderId, adminIds } = req.body;
    const guild = await Guild.findById(req.params.id);

    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    // Verify guild leader if provided
    if (guildLeaderId !== undefined) {
      if (guildLeaderId) {
        const leader = await User.findOne({ discordId: guildLeaderId });
        if (!leader) {
          return res.status(400).json({ error: 'Guild leader not found' });
        }
        if (leader.role !== 'admin' && leader.role !== 'super-admin') {
          return res.status(400).json({ error: 'Guild leader must be an admin or super-admin' });
        }
      }
      guild.guildLeaderId = guildLeaderId || undefined;
    }

    if (name) guild.name = name;
    if (adminIds !== undefined) guild.adminIds = adminIds;

    await guild.save();
    res.json({ success: true, guild });
  } catch (error) {
    console.error('Error updating guild:', error);
    res.status(500).json({ error: 'Failed to update guild' });
  }
});

// Delete guild (super-admin only)
app.delete('/api/guilds/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const guild = await Guild.findByIdAndDelete(req.params.id);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    // Remove guild association from all users
    await User.updateMany({ guildId: req.params.id }, { $unset: { guildId: '' } });

    res.json({ success: true, message: 'Guild deleted successfully' });
  } catch (error) {
    console.error('Error deleting guild:', error);
    res.status(500).json({ error: 'Failed to delete guild' });
  }
});

// Get guild members (admin and super-admin)
app.get('/api/guilds/:id/members', requireAdmin, async (req: Request, res: Response) => {
  try {
    const members = await User.find({ guildId: req.params.id }).select('-accessToken -refreshToken');
    
    // Transform members to use nickname as username
    const transformedMembers = members.map(member => ({
      discordId: member.discordId,
      username: member.nickname || member.username, // Use nickname if available
      discriminator: member.discriminator,
      avatar: member.avatar,
      email: member.email,
      role: member.role,
      guildId: member.guildId,
      assetPoints: member.assetPoints,
      techTokens: member.techTokens,
      voiceMinutesToday: member.voiceMinutesToday,
      isAdmin: member.isAdmin
    }));
    
    res.json({ success: true, members: transformedMembers });
  } catch (error) {
    console.error('Error fetching guild members:', error);
    res.status(500).json({ error: 'Failed to fetch guild members' });
  }
});

// Get guild statistics (for guild leaders)
app.get('/api/guilds/:id/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const guild = await Guild.findById(req.params.id);
    if (!guild) {
      return res.status(404).json({ error: 'Guild not found' });
    }

    // Get all members
    const members = await User.find({ guildId: req.params.id }).select('-accessToken -refreshToken');
    
    // Calculate statistics
    const totalMembers = members.length;
    const totalAssetPoints = members.reduce((sum, member) => sum + member.assetPoints, 0);
    const totalTechTokens = members.reduce((sum, member) => sum + member.techTokens, 0);
    const totalVoiceMinutes = members.reduce((sum, member) => sum + member.voiceMinutesToday, 0);
    
    // Get guild leader info
    let guildLeader = null;
    if (guild.guildLeaderId) {
      const leader = await User.findOne({ discordId: guild.guildLeaderId }).select('-accessToken -refreshToken');
      if (leader) {
        guildLeader = {
          discordId: leader.discordId,
          username: leader.nickname || leader.username,
          role: leader.role
        };
      }
    }

    res.json({
      success: true,
      stats: {
        guildName: guild.name,
        guildLeader,
        totalMembers,
        totalAssetPoints,
        totalTechTokens,
        totalVoiceMinutes,
        topMembers: members
          .sort((a, b) => b.assetPoints - a.assetPoints)
          .slice(0, 5)
          .map(m => ({
            username: m.nickname || m.username,
            assetPoints: m.assetPoints
          }))
      }
    });
  } catch (error) {
    console.error('Error fetching guild stats:', error);
    res.status(500).json({ error: 'Failed to fetch guild stats' });
  }
});

// Get user's guild info (for dashboard)
app.get('/api/user/guild-info', requireAdmin, async (req: Request, res: Response) => {
  try {
    // Find guilds where user is the leader
    const leaderGuilds = await Guild.find({ guildLeaderId: req.user!.id });
    
    if (leaderGuilds.length === 0) {
      return res.json({ success: true, isLeader: false, guild: null });
    }

    // Return the first guild (in case user leads multiple)
    const guild = leaderGuilds[0];
    const members = await User.find({ guildId: guild._id }).select('-accessToken -refreshToken');
    
    const totalMembers = members.length;
    const totalAssetPoints = members.reduce((sum, member) => sum + member.assetPoints, 0);

    res.json({
      success: true,
      isLeader: true,
      guild: {
        _id: guild._id,
        name: guild.name,
        totalMembers,
        totalAssetPoints
      }
    });
  } catch (error) {
    console.error('Error fetching user guild info:', error);
    res.status(500).json({ error: 'Failed to fetch guild info' });
  }
});

// Get all users (for guild assignment, admin and super-admin)
app.get('/api/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const users = await User.find().select('-accessToken -refreshToken').sort({ username: 1 });
    
    // Transform users to use nickname as username
    const transformedUsers = users.map(user => ({
      discordId: user.discordId,
      username: user.nickname || user.username, // Use nickname if available
      discriminator: user.discriminator,
      avatar: user.avatar,
      email: user.email,
      role: user.role,
      guildId: user.guildId,
      assetPoints: user.assetPoints,
      techTokens: user.techTokens,
      voiceMinutesToday: user.voiceMinutesToday,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
    
    res.json({ success: true, users: transformedUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Assign user to guild (admin and super-admin)
app.post('/api/users/:userId/guild', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { guildId } = req.body;
    const user = await User.findOne({ discordId: req.params.userId });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify guild exists
    if (guildId) {
      const guild = await Guild.findById(guildId);
      if (!guild) {
        return res.status(404).json({ error: 'Guild not found' });
      }
    }

    user.guildId = guildId || undefined;
    await user.save();

    res.json({ success: true, user: { ...user.toObject(), accessToken: undefined, refreshToken: undefined } });
  } catch (error) {
    console.error('Error assigning user to guild:', error);
    res.status(500).json({ error: 'Failed to assign user to guild' });
  }
});

// Update user asset points (admin and super-admin)
app.post('/api/users/:userId/asset-points', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { amount, operation } = req.body; // operation: 'add' or 'subtract'
    const user = await User.findOne({ discordId: req.params.userId });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (operation === 'add') {
      user.assetPoints += amount;
    } else if (operation === 'subtract') {
      user.assetPoints = Math.max(0, user.assetPoints - amount);
    } else if (operation === 'set') {
      user.assetPoints = amount;
    } else {
      return res.status(400).json({ error: 'Invalid operation. Use "add", "subtract", or "set"' });
    }

    await user.save();

    res.json({ 
      success: true, 
      user: { 
        discordId: user.discordId,
        username: user.nickname || user.username,
        assetPoints: user.assetPoints 
      } 
    });
  } catch (error) {
    console.error('Error updating asset points:', error);
    res.status(500).json({ error: 'Failed to update asset points' });
  }
});

// ==================== SKILL MANAGEMENT API ====================

// Get all skills (authenticated users can view)
app.get('/api/skills', requireAuth, async (req: Request, res: Response) => {
  try {
    const skills = await Skill.find({ isActive: true }).sort({ layer: 1, position: 1 });
    res.json({ success: true, skills });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Get single skill by ID
app.get('/api/skills/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    res.json({ success: true, skill });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ error: 'Failed to fetch skill' });
  }
});

// Create new skill (super-admin only)
app.post('/api/skills', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, cost, previewClip, contentYouTube, contentGoogleDrive, layer, position, prerequisites, nodeColor } = req.body;

    if (!title || !description || cost === undefined || layer === undefined || position === undefined) {
      return res.status(400).json({ error: 'Missing required fields: title, description, cost, layer, position' });
    }

    // Validate layer is between 0 and 6
    if (layer < 0 || layer > 6) {
      return res.status(400).json({ error: 'Layer must be between 0 (center) and 6' });
    }

    const skill = new Skill({
      title,
      description,
      cost,
      previewClip,
      contentYouTube,
      contentGoogleDrive,
      layer,
      position,
      nodeColor: nodeColor || 'blue',
      prerequisites: prerequisites || [],
      connections: []
    });

    console.log(`✨ Creating skill: ${title}`, { layer, position, nodeColor });

    await skill.save();
    res.json({ success: true, skill });
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// Update skill (super-admin only)
app.put('/api/skills/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, cost, previewClip, contentYouTube, contentGoogleDrive, layer, position, prerequisites, isActive, nodeColor, connections } = req.body;

    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Validate layer if provided
    if (layer !== undefined && (layer < 0 || layer > 6)) {
      return res.status(400).json({ error: 'Layer must be between 0 (center) and 6' });
    }

    // Update fields
    if (title !== undefined) skill.title = title;
    if (description !== undefined) skill.description = description;
    if (cost !== undefined) skill.cost = cost;
    if (previewClip !== undefined) skill.previewClip = previewClip;
    if (contentYouTube !== undefined) skill.contentYouTube = contentYouTube;
    if (contentGoogleDrive !== undefined) skill.contentGoogleDrive = contentGoogleDrive;
    if (layer !== undefined) skill.layer = layer;
    if (position !== undefined) skill.position = position;
    if (prerequisites !== undefined) skill.prerequisites = prerequisites;
    if (isActive !== undefined) skill.isActive = isActive;
    if (nodeColor !== undefined) skill.nodeColor = nodeColor;
    if (connections !== undefined) skill.connections = connections;

    console.log(`📝 Updating skill: ${skill.title}`, { connections: skill.connections });

    await skill.save();
    res.json({ success: true, skill });
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// Delete skill (super-admin only)
app.delete('/api/skills/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const skill = await Skill.findByIdAndDelete(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    res.json({ success: true, message: 'Skill deleted successfully' });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

// Add connection to a skill (super-admin only)
app.post('/api/skills/:id/connections', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { targetSkillId, connectionType, hasArrowhead, breakPoints } = req.body;

    if (!targetSkillId || !connectionType) {
      return res.status(400).json({ error: 'Missing targetSkillId or connectionType' });
    }

    const skill = await Skill.findById(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Initialize connections array if undefined
    if (!skill.connections) {
      skill.connections = [];
    }

    // Check if connection already exists
    const existingConnection = skill.connections.find(
      (conn: any) => conn.targetSkillId.toString() === targetSkillId
    );

    if (existingConnection) {
      return res.status(400).json({ error: 'Connection already exists' });
    }

    // Add new connection
    skill.connections.push({ 
      targetSkillId, 
      connectionType,
      hasArrowhead: hasArrowhead !== undefined ? hasArrowhead : true,
      breakPoints: breakPoints || []
    });
    
    console.log(`🔗 Adding connection: ${skill.title} -> ${targetSkillId} (${connectionType}, arrowhead: ${hasArrowhead})`);
    
    await skill.save();
    res.json({ success: true, skill });
  } catch (error) {
    console.error('Error adding connection:', error);
    res.status(500).json({ error: 'Failed to add connection' });
  }
});

// Update connection properties (super-admin only)
app.put('/api/skills/:id/connections/:targetSkillId', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id, targetSkillId } = req.params;
    const { hasArrowhead, breakPoints, connectionType } = req.body;

    const skill = await Skill.findById(id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Initialize connections array if undefined
    if (!skill.connections) {
      skill.connections = [];
    }

    // Find and update connection
    const connection = skill.connections.find(
      (conn: any) => conn.targetSkillId.toString() === targetSkillId
    );

    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Update properties
    if (hasArrowhead !== undefined) connection.hasArrowhead = hasArrowhead;
    if (breakPoints !== undefined) connection.breakPoints = breakPoints;
    if (connectionType !== undefined) connection.connectionType = connectionType;

    console.log(`🔄 Updating connection: ${skill.title} -> ${targetSkillId}`, { hasArrowhead, breakPoints: breakPoints?.length });

    await skill.save();
    res.json({ success: true, skill });
  } catch (error) {
    console.error('Error updating connection:', error);
    res.status(500).json({ error: 'Failed to update connection' });
  }
});

// Remove connection from a skill (super-admin only)
app.delete('/api/skills/:id/connections/:targetSkillId', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id, targetSkillId } = req.params;

    const skill = await Skill.findById(id);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Initialize connections array if undefined
    if (!skill.connections) {
      skill.connections = [];
    }

    // Remove connection
    skill.connections = skill.connections.filter(
      (conn: any) => conn.targetSkillId.toString() !== targetSkillId
    );

    console.log(`🔓 Removing connection: ${skill.title} -> ${targetSkillId}`);

    await skill.save();
    res.json({ success: true, skill });
  } catch (error) {
    console.error('Error removing connection:', error);
    res.status(500).json({ error: 'Failed to remove connection' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Backend URL: http://localhost:${PORT}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});
