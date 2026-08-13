"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceTracker = void 0;
const discord_js_1 = require("discord.js");
const User_1 = __importDefault(require("../models/User"));
class VoiceTracker {
    constructor(adminGuildId) {
        this.client = null;
        this.activeSessions = new Map(); // userId -> session
        this.resetInterval = null;
        this.periodicUpdateInterval = null;
        this.hourlyRewardInterval = null;
        this.updateIntervalMinutes = 1; // Update every 1 minute for more frequent updates
        this.adminGuildId = adminGuildId;
    }
    async initialize(botToken) {
        if (this.client) {
            console.log('⚠️ Voice tracker already initialized');
            return;
        }
        this.client = new discord_js_1.Client({
            intents: [
                discord_js_1.GatewayIntentBits.Guilds,
                discord_js_1.GatewayIntentBits.GuildVoiceStates
            ]
        });
        this.client.once('ready', () => {
            console.log(`✅ Voice Tracker Bot logged in as ${this.client?.user?.tag}`);
            this.setupVoiceStateTracking();
            this.startMidnightResetScheduler();
            this.startPeriodicUpdates();
            this.startHourlyRewardScheduler();
        });
        this.client.on('error', (error) => {
            console.error('❌ Discord bot error:', error);
        });
        await this.client.login(botToken);
    }
    setupVoiceStateTracking() {
        if (!this.client)
            return;
        this.client.on('voiceStateUpdate', async (oldState, newState) => {
            // Only track voice states in the admin guild
            if (newState.guild.id !== this.adminGuildId && oldState.guild.id !== this.adminGuildId) {
                return;
            }
            const userId = newState.member?.user.id || oldState.member?.user.id;
            if (!userId)
                return;
            const wasInChannel = oldState.channelId !== null;
            const isInChannel = newState.channelId !== null;
            const switchedChannel = wasInChannel && isInChannel && oldState.channelId !== newState.channelId;
            // User joined a voice channel
            if (!wasInChannel && isInChannel) {
                await this.handleVoiceJoin(userId, newState.channelId);
            }
            // User left a voice channel
            else if (wasInChannel && !isInChannel) {
                await this.handleVoiceLeave(userId);
            }
            // User switched channels (moved to another channel)
            else if (switchedChannel) {
                await this.handleVoiceSwitch(userId, newState.channelId);
            }
        });
    }
    async handleVoiceJoin(userId, channelId) {
        const now = new Date();
        this.activeSessions.set(userId, {
            userId,
            startTime: now,
            channelId,
            lastUpdateTime: now // Initialize last update time
        });
        console.log(`🎤 User ${userId} joined voice channel ${channelId} at ${now.toISOString()}`);
    }
    async handleVoiceLeave(userId) {
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
    async handleVoiceSwitch(userId, newChannelId) {
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
    async processVoiceSession(userId, session, isFinal = false) {
        const now = new Date();
        // Calculate duration since last update (not since session start)
        const durationMs = now.getTime() - session.lastUpdateTime.getTime();
        const durationMinutes = Math.floor(durationMs / 60000); // Convert to minutes
        if (durationMinutes < 0) {
            console.warn(`⚠️ Negative duration detected for user ${userId}: ${durationMinutes} minutes. Skipping update.`);
            return;
        }
        // Update even if duration is 0 to ensure lastUpdateTime is refreshed
        // This helps with tracking very short sessions
        try {
            const user = await User_1.default.findOne({ discordId: userId });
            if (!user) {
                console.log(`⚠️ User ${userId} not found in database`);
                return;
            }
            // Check if we need to reset today's voice time (midnight UTC+7)
            await this.checkAndResetDailyVoiceTime(user);
            // Calculate time before and after midnight if session spans midnight
            // Use lastUpdateTime as the start point for this update period
            const { beforeMidnight, afterMidnight } = this.splitSessionByMidnight(session.lastUpdateTime, now);
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
        }
        catch (error) {
            console.error(`❌ Error processing voice session for user ${userId}:`, error);
        }
    }
    splitSessionByMidnight(startTime, endTime) {
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
    getMidnightUTC7(date) {
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
    async checkAndResetDailyVoiceTime(user) {
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
    startMidnightResetScheduler() {
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
    getNextMidnightUTC7(date) {
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
    async resetAllDailyVoiceTimes() {
        try {
            const now = new Date();
            const result = await User_1.default.updateMany({}, {
                $set: {
                    voiceMinutesToday: 0,
                    lastVoiceTimeReset: now
                }
            });
            console.log(`🔄 Reset daily voice time for ${result.modifiedCount} users`);
        }
        catch (error) {
            console.error('❌ Error resetting daily voice times:', error);
        }
    }
    startPeriodicUpdates() {
        const intervalMs = this.updateIntervalMinutes * 60 * 1000;
        console.log(`⏰ Starting periodic voice time updates every ${this.updateIntervalMinutes} minutes`);
        this.periodicUpdateInterval = setInterval(async () => {
            await this.updateAllActiveSessions();
        }, intervalMs);
    }
    startHourlyRewardScheduler() {
        // Calculate time until next hour (e.g., if it's 2:30, wait until 3:00)
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setMinutes(0, 0, 0);
        nextHour.setHours(nextHour.getHours() + 1);
        const msUntilNextHour = nextHour.getTime() - now.getTime();
        console.log(`💰 Next hourly voice reward scheduled for ${nextHour.toISOString()} (in ${Math.floor(msUntilNextHour / 1000 / 60)} minutes)`);
        // Schedule first reward at the next hour
        setTimeout(() => {
            this.awardHourlyVoiceRewards();
            // Then schedule every hour
            this.hourlyRewardInterval = setInterval(() => {
                this.awardHourlyVoiceRewards();
            }, 60 * 60 * 1000); // 1 hour
        }, msUntilNextHour);
    }
    async awardHourlyVoiceRewards() {
        const now = new Date();
        const sessions = Array.from(this.activeSessions.values());
        if (sessions.length === 0) {
            console.log('💰 No active voice sessions for hourly reward');
            return;
        }
        console.log(`💰 Processing hourly voice rewards for ${sessions.length} active session(s)...`);
        for (const session of sessions) {
            try {
                const user = await User_1.default.findOne({ discordId: session.userId });
                if (!user) {
                    console.log(`⚠️ User ${session.userId} not found for hourly reward`);
                    continue;
                }
                // Check if user has been continuously in voice for at least 1 hour
                // We check if the session has been active for at least 1 hour
                const sessionDuration = now.getTime() - session.startTime.getTime();
                const sessionDurationHours = sessionDuration / (1000 * 60 * 60);
                // Also check if it's been at least 1 hour since last reward
                const lastRewardTime = user.lastVoiceRewardTime || session.startTime;
                const timeSinceLastReward = now.getTime() - new Date(lastRewardTime).getTime();
                const hoursSinceLastReward = timeSinceLastReward / (1000 * 60 * 60);
                // Award 50 Asset Points if:
                // 1. User has been in this voice session for at least 1 hour, AND
                // 2. It's been at least 1 hour since their last reward
                if (sessionDurationHours >= 1 && hoursSinceLastReward >= 1) {
                    // Get custom asset point name from guild
                    let assetPointName = 'Asset Point';
                    if (user.guildId) {
                        const Guild = (await Promise.resolve().then(() => __importStar(require('../models/Guild')))).default;
                        const guild = await Guild.findById(user.guildId);
                        if (guild && guild.assetPointName) {
                            assetPointName = guild.assetPointName;
                        }
                    }
                    user.assetPoints = (user.assetPoints || 0) + 50;
                    user.lastVoiceRewardTime = now;
                    await user.save();
                    console.log(`💰 Awarded 50 ${assetPointName} to user ${session.userId} for 1 hour in voice chat (session duration: ${sessionDurationHours.toFixed(2)} hours)`);
                }
            }
            catch (error) {
                console.error(`❌ Error awarding hourly reward to user ${session.userId}:`, error);
            }
        }
    }
    async updateAllActiveSessions() {
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
    async processAllActiveSessions() {
        const sessions = Array.from(this.activeSessions.values());
        for (const session of sessions) {
            await this.processVoiceSession(session.userId, session, true);
        }
        this.activeSessions.clear();
    }
    async shutdown() {
        if (this.resetInterval) {
            clearInterval(this.resetInterval);
        }
        if (this.periodicUpdateInterval) {
            clearInterval(this.periodicUpdateInterval);
        }
        if (this.hourlyRewardInterval) {
            clearInterval(this.hourlyRewardInterval);
        }
        await this.processAllActiveSessions();
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
        console.log('🛑 Voice tracker shut down');
    }
}
exports.VoiceTracker = VoiceTracker;
