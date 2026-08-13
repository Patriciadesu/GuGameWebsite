import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  discordId: string;
  username: string;
  nickname?: string; // Guild nickname from ADMIN_GUILD_ID
  discriminator: string;
  avatar: string | null;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  isAdmin: boolean;
  role: 'user' | 'admin' | 'super-admin';
  level: number;
  guildId?: string; // Guild membership (MongoDB ObjectId)
  assetPoints: number;
  techTokens: number;
  voiceMinutesToday: number; // Minutes spent in voice today (resets at midnight UTC+7)
  totalVoiceMinutes: number; // Total minutes spent in voice (cumulative)
  lastVoiceTimeReset: Date; // Last time voiceMinutesToday was reset
  lastVoiceRewardTime?: Date; // Last time user received hourly voice reward (50 AP)
  unlockedSkills?: string[]; // Array of unlocked skill IDs
  completedQuestSteps?: Array<{ skillId: string; stepId: string; completedAt: Date }>;
  completedQuestRewards?: string[];
  hamsterQuestAccessToken?: string;
  hamsterQuestLinkedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    discordId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    username: {
      type: String,
      required: true
    },
    nickname: {
      type: String,
      default: undefined
    },
    discriminator: {
      type: String,
      required: true
    },
    avatar: {
      type: String,
      default: null
    },
    email: {
      type: String,
      default: undefined
    },
    accessToken: {
      type: String,
      default: undefined
    },
    refreshToken: {
      type: String,
      default: undefined
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'super-admin'],
      default: 'user'
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
      validate: Number.isInteger
    },
    guildId: {
      type: String,
      default: undefined
    },
    assetPoints: {
      type: Number,
      default: 0
    },
    techTokens: {
      type: Number,
      default: 0
    },
    voiceMinutesToday: {
      type: Number,
      default: 0
    },
    totalVoiceMinutes: {
      type: Number,
      default: 0
    },
    lastVoiceTimeReset: {
      type: Date,
      default: () => new Date()
    },
    lastVoiceRewardTime: {
      type: Date,
      default: undefined
    },
    unlockedSkills: {
      type: [String],
      default: []
    },
    completedQuestSteps: [{
      skillId: { type: String, required: true },
      stepId: { type: String, required: true },
      completedAt: { type: Date, default: () => new Date() }
    }],
    completedQuestRewards: {
      type: [String],
      default: []
    },
    hamsterQuestAccessToken: {
      type: String,
      default: undefined,
      select: false
    },
    hamsterQuestLinkedAt: {
      type: Date,
      default: undefined
    }
  },
  {
    timestamps: true
  }
);

UserSchema.index({ guildId: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ level: 1 });
UserSchema.index({ nickname: 1 });

export default mongoose.model<IUser>('User', UserSchema);
