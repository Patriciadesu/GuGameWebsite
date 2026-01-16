import mongoose, { Document, Schema } from 'mongoose';

export interface IGuild extends Document {
  name: string;
  guildLeaderIds?: string[]; // Discord IDs of the guild leaders
  adminIds: string[]; // Discord IDs of assigned admins
  createdBy: string; // Discord ID of super-admin who created it
  createdAt: Date;
  updatedAt: Date;
}

const GuildSchema = new Schema<IGuild>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    guildLeaderIds: {
      type: [String],
      default: []
    },
    adminIds: {
      type: [String],
      default: []
    },
    createdBy: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IGuild>('Guild', GuildSchema);
