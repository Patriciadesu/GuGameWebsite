import { Client, GatewayIntentBits, VoiceState } from 'discord.js';
import User from '../models/User';

interface VoiceSession {
  userId: string;
  startTime: Date;
  channelId: string;
  lastUpdateTime: Date; // Last time this session was saved to database
}

export class VoiceTracker {
  private client: Client | null = null;
  private adminGuildId: string;
  private activeSessions: Map<string, VoiceSession> = new Map(); // userId -> session
  private resetInterval: NodeJS.Timeout | null = null;
  private periodicUpdateInterval: NodeJS.Timeout | null = null;
  private updateIntervalMinutes: number = 5; // Update every 5 minutes

  constructor(adminGuildId: string) {
    this.adminGuildId = adminGuildId;
  }

  async initialize(botToken: string): Promise<void> {
    if (this.client) {
      console.log('⚠️ Voice tracker already initialized');
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
      ]
    });

    this.client.once('ready', () => {
      console.log(`✅ Voice Tracker Bot logged in as ${this.client?.user?.tag}`);
      this.setupVoiceStateTracking();
      this.startMidnightResetScheduler();
      this.startPeriodicUpdates();
    });

    this.client.on('error', (error) => {
      console.error('❌ Discord bot error:', error);
    });

    await this.client.login(botToken);
  }

  private setupVoiceStateTracking(): void {
    if (!this.client) return;

    this.client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
      // Only track voice states in the admin guild
      if (newState.guild.id !== this.adminGuildId && oldState.guild.id !== this.adminGuildId) {
        return;
      }

      const userId = newState.member?.user.id || oldState.member?.user.id;
      if (!userId) return;

      const wasInChannel = oldState.channelId !== null;
      const isInChannel = newState.channelId !== null;
      const switchedChannel = wasInChannel && isInChannel && oldState.channelId !== newState.channelId;

      // User joined a voice channel
      if (!wasInChannel && isInChannel) {
        await this.handleVoiceJoin(userId, newState.channelId!);
      }
      // User left a voice channel
      else if (wasInChannel && !isInChannel) {
        await this.handleVoiceLeave(userId);
      }
      // User switched channels (moved to another channel)
      else if (switchedChannel) {
        await this.handleVoiceSwitch(userId, newState.channelId!);
      }
    });
  }

  private async handleVoiceJoin(userId: string, channelId: string): Promise<void> {
    const now = new Date();
    this.activeSessions.set(userId, {
      userId,
      startTime: now,
      channelId,
      lastUpdateTime: now // Initialize last update time
    });
    console.log(`🎤 User ${userId} joined voice channel ${channelId} at ${now.toISOString()}`);
  }

  private async handleVoiceLeave(userId: string): Promise<void> {
    const session = this.activeSessions.get(userId);
    if (!session) {
      console.log(`⚠️ User ${userId} left voice but no active session found`);
      return;
    }

    // Process the remaining time since last update
    await this.processVoiceSession(userId, session, true);
    this.activeSessions.delete(userId);
    console.log(`🎤 User ${userId} left voice channel`);
  }

  private async handleVoiceSwitch(userId: string, newChannelId: string): Promise<void> {
    const session = this.activeSessions.get(userId);
    if (!session) {
      // If no session exists, treat as a new join
      await this.handleVoiceJoin(userId, newChannelId);
      return;
    }

    // Process the time spent in the old channel (since last update)
    await this.processVoiceSession(userId, session, false);
    
    // Start a new session in the new channel
    const now = new Date();
    this.activeSessions.set(userId, {
      userId,
      startTime: now,
      channelId: newChannelId,
      lastUpdateTime: now
    });
    console.log(`🎤 User ${userId} switched from channel ${session.channelId} to ${newChannelId}`);
  }

  private async processVoiceSession(userId: string, session: VoiceSession, isFinal: boolean = false): Promise<void> {
    const now = new Date();
    // Calculate duration since last update (not since session start)
    const durationMs = now.getTime() - session.lastUpdateTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000); // Convert to minutes

    if (durationMinutes <= 0) {
      return; // Ignore sessions shorter than 1 minute
    }

    try {
      const user = await User.findOne({ discordId: userId });
      if (!user) {
        console.log(`⚠️ User ${userId} not found in database`);
        return;
      }

      // Check if we need to reset today's voice time (midnight UTC+7)
      await this.checkAndResetDailyVoiceTime(user);

      // Calculate time before and after midnight if session spans midnight
      // Use lastUpdateTime as the start point for this update period
      const { beforeMidnight, afterMidnight } = this.splitSessionByMidnight(
        session.lastUpdateTime,
        now
      );

      // Update total voice time (all time counts)
      user.totalVoiceMinutes = (user.totalVoiceMinutes || 0) + durationMinutes;

      // Update today's voice time (only time after midnight counts)
      user.voiceMinutesToday = (user.voiceMinutesToday || 0) + afterMidnight;

      await user.save();
      console.log(`✅ Updated voice time for user ${userId}: +${durationMinutes}min total, +${afterMidnight}min today (periodic update)`);

      // Update the lastUpdateTime to the current time (only if not final - session continues)
      if (!isFinal && this.activeSessions.has(userId)) {
        const updatedSession = this.activeSessions.get(userId);
        if (updatedSession) {
          updatedSession.lastUpdateTime = now;
          // Also update startTime to maintain continuity for midnight splitting
          updatedSession.startTime = session.startTime;
        }
      }
    } catch (error) {
      console.error(`❌ Error processing voice session for user ${userId}:`, error);
    }
  }

  private splitSessionByMidnight(startTime: Date, endTime: Date): { beforeMidnight: number; afterMidnight: number } {
    // Get midnight UTC+7 for the start and end dates
    const startMidnight = this.getMidnightUTC7(startTime);
    const endMidnight = this.getMidnightUTC7(endTime);

    // If session is within the same day (UTC+7), all time is "after midnight" (today)
    if (startMidnight.getTime() === endMidnight.getTime()) {
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationMinutes = Math.floor(durationMs / 60000);
      return { beforeMidnight: 0, afterMidnight: durationMinutes };
    }

    // Session spans midnight UTC+7 - split it
    // The endMidnight represents midnight of the end date in UTC+7
    // We need to find the actual UTC time when midnight UTC+7 occurs
    const midnightUtc = endMidnight; // getMidnightUTC7 already returns UTC time
    
    const beforeMidnightMs = Math.max(0, midnightUtc.getTime() - startTime.getTime());
    const afterMidnightMs = Math.max(0, endTime.getTime() - midnightUtc.getTime());

    const beforeMidnight = Math.floor(beforeMidnightMs / 60000);
    const afterMidnight = Math.floor(afterMidnightMs / 60000);

    return { beforeMidnight, afterMidnight };
  }

  private getMidnightUTC7(date: Date): Date {
    // Get the date components in UTC+7 (Asia/Bangkok timezone)
    const utc7Date = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    
    // Create midnight in UTC+7 by setting hours to 0
    const utc7Midnight = new Date(utc7Date);
    utc7Midnight.setHours(0, 0, 0, 0);
    
    // Calculate the UTC time that corresponds to midnight UTC+7
    // UTC+7 is 7 hours ahead, so midnight UTC+7 = 17:00 previous day UTC
    const utcOffset = 7 * 60 * 60 * 1000; // 7 hours in milliseconds
    return new Date(utc7Midnight.getTime() - utcOffset);
  }

  private async checkAndResetDailyVoiceTime(user: any): Promise<void> {
    const now = new Date();
    const lastReset = user.lastVoiceTimeReset || user.createdAt;
    const lastResetMidnight = this.getMidnightUTC7(lastReset);
    const nowMidnight = this.getMidnightUTC7(now);

    // If we've crossed midnight (UTC+7), reset today's voice time
    if (nowMidnight.getTime() > lastResetMidnight.getTime()) {
      user.voiceMinutesToday = 0;
      user.lastVoiceTimeReset = now;
      await user.save();
      console.log(`🔄 Reset daily voice time for user ${user.discordId}`);
    }
  }

  private startMidnightResetScheduler(): void {
    // Calculate time until next midnight UTC+7
    const now = new Date();
    const nextMidnight = this.getNextMidnightUTC7(now);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    console.log(`⏰ Next voice time reset scheduled for ${nextMidnight.toISOString()} (in ${Math.floor(msUntilMidnight / 1000 / 60)} minutes)`);

    // Schedule reset at midnight
    setTimeout(() => {
      this.resetAllDailyVoiceTimes();
      // Schedule next reset (24 hours later)
      this.resetInterval = setInterval(() => {
        this.resetAllDailyVoiceTimes();
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilMidnight);
  }

  private getNextMidnightUTC7(date: Date): Date {
    // Get today's midnight in UTC+7 (returns UTC time)
    const todayMidnight = this.getMidnightUTC7(date);
    
    // Get current time in UTC+7 and convert to UTC for comparison
    const utc7Now = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
    const utc7NowUtc = new Date(utc7Now.getTime() - (7 * 60 * 60 * 1000));
    
    // If current time is past midnight today, get tomorrow's midnight
    if (utc7NowUtc.getTime() >= todayMidnight.getTime()) {
      return new Date(todayMidnight.getTime() + 24 * 60 * 60 * 1000);
    }
    return todayMidnight;
  }

  private async resetAllDailyVoiceTimes(): Promise<void> {
    try {
      const now = new Date();
      const result = await User.updateMany(
        {},
        {
          $set: {
            voiceMinutesToday: 0,
            lastVoiceTimeReset: now
          }
        }
      );
      console.log(`🔄 Reset daily voice time for ${result.modifiedCount} users`);
    } catch (error) {
      console.error('❌ Error resetting daily voice times:', error);
    }
  }

  private startPeriodicUpdates(): void {
    const intervalMs = this.updateIntervalMinutes * 60 * 1000;
    console.log(`⏰ Starting periodic voice time updates every ${this.updateIntervalMinutes} minutes`);
    
    this.periodicUpdateInterval = setInterval(async () => {
      await this.updateAllActiveSessions();
    }, intervalMs);
  }

  private async updateAllActiveSessions(): Promise<void> {
    const sessions = Array.from(this.activeSessions.values());
    if (sessions.length === 0) {
      return; // No active sessions
    }

    console.log(`🔄 Updating voice time for ${sessions.length} active session(s)...`);
    for (const session of sessions) {
      await this.processVoiceSession(session.userId, session, false);
    }
  }

  // Process all active sessions (useful for shutdown or manual processing)
  async processAllActiveSessions(): Promise<void> {
    const sessions = Array.from(this.activeSessions.values());
    for (const session of sessions) {
      await this.processVoiceSession(session.userId, session, true);
    }
    this.activeSessions.clear();
  }

  async shutdown(): Promise<void> {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
    }
    if (this.periodicUpdateInterval) {
      clearInterval(this.periodicUpdateInterval);
    }
    await this.processAllActiveSessions();
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    console.log('🛑 Voice tracker shut down');
  }
}
