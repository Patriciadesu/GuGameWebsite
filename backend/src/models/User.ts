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
  guildId?: string; // Guild membership (MongoDB ObjectId)
  assetPoints: number;
  techTokens: number;
  voiceMinutesToday: number;
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
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IUser>('User', UserSchema);
