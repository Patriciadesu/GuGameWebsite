import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import ApprovalRequest from '../src/models/ApprovalRequest';
import OfficeQuestCache from '../src/models/OfficeQuestCache';
import Skill from '../src/models/Skill';
import User from '../src/models/User';

dotenv.config({ path: path.join(__dirname, '../.env') });

const applyChanges = process.argv.includes('--apply');
const importedSkillFilter = {
  $or: [
    { externalQuestId: { $exists: true, $nin: [null, ''] } },
    { externalSource: { $in: ['office-quest', 'hamquest', 'star-master'] } }
  ]
};

async function clearQuestImportData() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gugame';

  try {
    await mongoose.connect(mongoUri);

    const importedSkills = await Skill.find(importedSkillFilter)
      .select('_id title mapNodeRole externalSource externalQuestId')
      .lean();
    const importedSkillIds = importedSkills.map((skill) => skill._id.toString());
    const gatewayImports = importedSkills.filter((skill) => skill.mapNodeRole === 'topic-gateway');

    const [
      approvalRequests,
      cachedQuests,
      usersWithQuestSteps,
      usersWithQuestRewards,
      usersWithImportedUnlocks,
      skillsReferencingImports
    ] = await Promise.all([
      ApprovalRequest.countDocuments(),
      OfficeQuestCache.countDocuments(),
      User.countDocuments({ 'completedQuestSteps.0': { $exists: true } }),
      User.countDocuments({ 'completedQuestRewards.0': { $exists: true } }),
      importedSkillIds.length
        ? User.countDocuments({ unlockedSkills: { $in: importedSkillIds } })
        : Promise.resolve(0),
      importedSkillIds.length
        ? Skill.countDocuments({
            _id: { $nin: importedSkills.map((skill) => skill._id) },
            $or: [
              { 'connections.targetSkillId': { $in: importedSkillIds } },
              { prerequisites: { $in: importedSkillIds } }
            ]
          })
        : Promise.resolve(0)
    ]);

    console.log(JSON.stringify({
      mode: applyChanges ? 'apply' : 'dry-run',
      importedSkills: importedSkills.length,
      importedSkillRoles: importedSkills.reduce<Record<string, number>>((counts, skill) => {
        const role = skill.mapNodeRole || 'lesson';
        counts[role] = (counts[role] || 0) + 1;
        return counts;
      }, {}),
      approvalRequests,
      cachedQuests,
      usersWithQuestSteps,
      usersWithQuestRewards,
      usersWithImportedUnlocks,
      skillsReferencingImports
    }, null, 2));

    if (!applyChanges) {
      console.log('Dry run only. Run again with --apply to clear this data.');
      return;
    }

    if (gatewayImports.length > 0) {
      throw new Error(
        `Refusing to delete ${gatewayImports.length} imported topic gateway(s); this would damage a Constellation Map.`
      );
    }

    if (importedSkillIds.length > 0) {
      await Skill.updateMany(
        { _id: { $nin: importedSkills.map((skill) => skill._id) } },
        {
          $pull: {
            connections: { targetSkillId: { $in: importedSkillIds } },
            prerequisites: { $in: importedSkillIds }
          }
        }
      );
    }

    const userUpdate: Record<string, unknown> = {
      $set: {
        completedQuestSteps: [],
        completedQuestRewards: []
      }
    };
    if (importedSkillIds.length > 0) {
      userUpdate.$pull = { unlockedSkills: { $in: importedSkillIds } };
    }

    const [deletedSkills, deletedApprovals, deletedCache, updatedUsers] = await Promise.all([
      Skill.deleteMany({ _id: { $in: importedSkills.map((skill) => skill._id) } }),
      ApprovalRequest.deleteMany({}),
      OfficeQuestCache.deleteMany({}),
      User.updateMany({}, userUpdate)
    ]);

    const [remainingImports, remainingApprovals, remainingCache, remainingStepUsers, remainingRewardUsers] =
      await Promise.all([
        Skill.countDocuments(importedSkillFilter),
        ApprovalRequest.countDocuments(),
        OfficeQuestCache.countDocuments(),
        User.countDocuments({ 'completedQuestSteps.0': { $exists: true } }),
        User.countDocuments({ 'completedQuestRewards.0': { $exists: true } })
      ]);

    console.log(JSON.stringify({
      deleted: {
        importedSkills: deletedSkills.deletedCount,
        approvalRequests: deletedApprovals.deletedCount,
        cachedQuests: deletedCache.deletedCount
      },
      usersMatched: updatedUsers.matchedCount,
      remaining: {
        importedSkills: remainingImports,
        approvalRequests: remainingApprovals,
        cachedQuests: remainingCache,
        usersWithQuestSteps: remainingStepUsers,
        usersWithQuestRewards: remainingRewardUsers
      }
    }, null, 2));

    if (
      remainingImports > 0 ||
      remainingApprovals > 0 ||
      remainingCache > 0 ||
      remainingStepUsers > 0 ||
      remainingRewardUsers > 0
    ) {
      throw new Error('Verification failed: quest or import data remains.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

clearQuestImportData().catch((error) => {
  console.error(error);
  process.exit(1);
});
