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

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

if (!ADMIN_GUILD_ID || ADMIN_ROLE_IDS.length === 0) {
  console.warn('⚠️ ADMIN_GUILD_ID and ADMIN_ROLE_IDS not set - all users will be marked as non-admin');
}

// Helper function to check if user has required roles in the admin guild
async function checkUserHasAdminRole(accessToken: string, userId: string): Promise<boolean> {
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

    // Check if user has any of the required admin roles
    const hasAdminRole = ADMIN_ROLE_IDS.some(roleId => userRoles.includes(roleId.trim()));

    return hasAdminRole;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ Error checking user roles: ${error.response?.status} - ${error.response?.statusText}`);
      console.error('Response data:', error.response?.data);
    } else {
      console.error('❌ Error checking user roles:', error);
    }
    return false;
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
    // Check if user has required admin roles
    const isAdmin = await checkUserHasAdminRole(accessToken, profile.id);

    if (isAdmin) {
      console.log(`✅ User ${profile.username} (${profile.id}) has admin role`);
    } else {
      console.log(`ℹ️ User ${profile.username} (${profile.id}) logged in as regular user`);
    }

    let user = await User.findOne({ discordId: profile.id });

    if (user) {
      // Update existing user
      user.username = profile.username;
      user.discriminator = profile.discriminator;
      user.avatar = profile.avatar;
      user.email = profile.email;
      user.accessToken = accessToken;
      user.refreshToken = refreshToken;
      user.isAdmin = isAdmin;
      await user.save();
    } else {
      // Create new user
      user = await User.create({
        discordId: profile.id,
        username: profile.username,
        discriminator: profile.discriminator,
        avatar: profile.avatar,
        email: profile.email,
        accessToken,
        refreshToken,
        isAdmin
      });
    }

    return done(null, {
      id: user.discordId,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      email: user.email,
      isAdmin: user.isAdmin
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
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
        isAdmin: user.isAdmin
      });
    } else {
      done(null, false);
    }
  } catch (error) {
    done(error, null);
  }
});

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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Backend URL: http://localhost:${PORT}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
});
