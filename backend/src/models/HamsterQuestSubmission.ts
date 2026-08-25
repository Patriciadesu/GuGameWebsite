import mongoose, { Document, Schema } from 'mongoose';

export type HamsterQuestSubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface IHamsterQuestSubmission extends Document {
  userId: string;
  skillId: string;
  externalUserId: string;
  externalQuestId: string;
  externalUserQuestId: string;
  externalSubQuestId: string;
  externalHouseId: string;
  externalSubmissionId?: string;
  status: HamsterQuestSubmissionStatus;
  message?: string;
  imageUrl?: string;
  submittedAt: Date;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HamsterQuestSubmissionSchema = new Schema<IHamsterQuestSubmission>({
  userId: { type: String, required: true, index: true },
  skillId: { type: String, required: true, index: true },
  externalUserId: { type: String, required: true },
  externalQuestId: { type: String, required: true },
  externalUserQuestId: { type: String, required: true },
  externalSubQuestId: { type: String, required: true },
  externalHouseId: { type: String, required: true },
  externalSubmissionId: { type: String, default: undefined },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  message: { type: String, default: '' },
  imageUrl: { type: String, default: undefined },
  submittedAt: { type: Date, default: () => new Date() },
  syncedAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

HamsterQuestSubmissionSchema.index(
  { userId: 1, skillId: 1, externalSubQuestId: 1 },
  { unique: true, name: 'unique_hamsterquest_submission_per_step' }
);

export default mongoose.model<IHamsterQuestSubmission>('HamsterQuestSubmission', HamsterQuestSubmissionSchema);
