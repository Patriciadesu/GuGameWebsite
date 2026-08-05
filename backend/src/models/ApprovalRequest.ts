import mongoose, { Document, Schema } from 'mongoose';

export interface IApprovalRequest extends Document {
  userId: string; // Discord ID of the user making the request
  skillId: string; // Skill ID that the user wants to complete
  message?: string; // Optional message from user to admin
  status: 'pending' | 'approved' | 'rejected';
  rewardAP?: number; // AP amount awarded when approved (set by admin)
  reviewedBy?: string; // Discord ID of admin who reviewed
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>(
  {
    userId: { type: String, required: true, index: true },
    skillId: { type: String, required: true, index: true },
    message: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rewardAP: { type: Number, default: undefined },
    reviewedBy: { type: String, default: undefined },
    reviewedAt: { type: Date, default: undefined }
  },
  { timestamps: true }
);

// Index for efficient queries
ApprovalRequestSchema.index({ status: 1 });
ApprovalRequestSchema.index({ status: 1, createdAt: -1 });
ApprovalRequestSchema.index({ userId: 1, skillId: 1 });
ApprovalRequestSchema.index({ userId: 1, status: 1, skillId: 1 });
ApprovalRequestSchema.index(
  { userId: 1, skillId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'unique_pending_approval_per_user_skill'
  }
);

export default mongoose.model<IApprovalRequest>('ApprovalRequest', ApprovalRequestSchema);
