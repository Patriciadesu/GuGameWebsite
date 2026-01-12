# GuGame

A web-based game with Discord authentication and admin role management.

## Features

- Discord OAuth2 Authentication
- Admin role verification via Discord server roles
- User session management
- MongoDB database integration
- React frontend with TypeScript
- Express backend with TypeScript

## Environment Variables

### Backend (.env in /backend)

```env
# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# Session Secret (Generate a secure random string)
SESSION_SECRET=your-secure-session-secret

# Discord OAuth Configuration
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_CALLBACK_URL=https://your-domain.com/api/auth/discord/callback

# Frontend URL
FRONTEND_URL=https://your-domain.com

# MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database

# Admin Configuration
# The Discord Guild (Server) ID where admin roles are checked
ADMIN_GUILD_ID=your-guild-id

# Comma-separated list of Discord Role IDs that grant admin access
ADMIN_ROLE_IDS=role-id-1,role-id-2,role-id-3

# Optional: Discord Bot Token (for future features)
DISCORD_BOT_TOKEN=your-bot-token
```

### Frontend (.env in /frontend)

```env
# Backend API URL
VITE_BACKEND_URL=http://localhost:3001
```

## Setup Instructions

### Backend

1. Navigate to backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file with required variables (see above)

4. Run development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   npm start
   ```

### Frontend

1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create `.env` file with backend URL

4. Run development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   ```

## Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 section
4. Add redirect URL: `https://your-domain.com/api/auth/discord/callback`
5. Copy Client ID and Client Secret to your `.env` file
6. Enable required scopes: `identify`, `email`, `guilds.members.read`

## Admin Role Setup

1. Get your Discord Server (Guild) ID and add to `ADMIN_GUILD_ID`
2. Get the Role IDs that should have admin access
3. Add role IDs to `ADMIN_ROLE_IDS` (comma-separated)
4. Users with any of these roles will have `isAdmin: true`
5. Users without these roles can still login but will have `isAdmin: false`

## Project Structure

```
GuGame/
├── backend/
│   ├── src/
│   │   ├── models/
│   │   │   └── User.ts
│   │   └── server.ts
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   └── MainMenu.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── .env
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## API Endpoints

- `GET /api/auth/discord` - Initiate Discord OAuth flow
- `GET /api/auth/discord/callback` - Discord OAuth callback
- `GET /api/auth/user` - Check authentication status
- `POST /api/auth/logout` - Logout user

## License

MIT
