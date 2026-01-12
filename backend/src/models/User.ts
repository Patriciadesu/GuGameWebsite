import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  discordId: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  isAdmin: boolean;
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
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IUser>('User', UserSchema);
