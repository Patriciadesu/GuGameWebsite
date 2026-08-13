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
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const UserSchema = new mongoose_1.Schema({
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
}, {
    timestamps: true
});
UserSchema.index({ guildId: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ level: 1 });
UserSchema.index({ nickname: 1 });
exports.default = mongoose_1.default.model('User', UserSchema);
