import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ApprovalRequest from '../src/models/ApprovalRequest';
import Guild from '../src/models/Guild';
import Purchase from '../src/models/Purchase';
import ShopItem from '../src/models/ShopItem';
import Skill from '../src/models/Skill';
import User from '../src/models/User';

dotenv.config();

const dbName = process.env.LOAD_TEST_DB_NAME || 'gugame_load_test';
const userCount = Number(process.env.LOAD_TEST_USERS || 200);
const skillCount = Number(process.env.LOAD_TEST_SKILLS || 70);
const inventoryItemsPerUser = Number(process.env.LOAD_TEST_INVENTORY_ITEMS || 20);

if (!dbName.startsWith('gugame_load_test')) {
  throw new Error('LOAD_TEST_DB_NAME must start with "gugame_load_test"');
}
if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is required');
}
if (!Number.isInteger(userCount) || userCount < 1 || userCount > 2_000) {
  throw new Error('LOAD_TEST_USERS must be between 1 and 2000');
}

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName });
  await mongoose.connection.dropDatabase();

  const guildIds = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  const skillIds = Array.from({ length: skillCount }, () => new mongoose.Types.ObjectId());
  const shopItemIds = Array.from({ length: Math.max(inventoryItemsPerUser, 24) }, () => new mongoose.Types.ObjectId());

  await Guild.insertMany(guildIds.map((guildId, index) => ({
    _id: guildId,
    name: `Load Guild ${index + 1}`,
    guildLeaderIds: [],
    adminIds: [],
    createdBy: 'load-user-0',
    assetPointName: 'AP'
  })));

  await Skill.insertMany(skillIds.map((skillId, index) => ({
    _id: skillId,
    title: `Load Quest ${index + 1}`,
    description: `Performance test quest ${index + 1}. ${'Detailed quest content. '.repeat(20)}`,
    cost: index % 5 === 0 ? 10 : 0,
    nextQuestCost: 25,
    layer: 0,
    position: index,
    treePosition: { x: (index % 10) * 160, y: Math.floor(index / 10) * 180 },
    nodeColor: index % 8 === 0 ? 'yellow' : 'green',
    nodeType: index % 8 === 0 ? 'marker' : 'quest',
    isActive: true,
    prerequisites: index > 0 ? [skillIds[index - 1].toString()] : [],
    connections: index < skillCount - 1 ? [{
      targetSkillId: skillIds[index + 1].toString(),
      connectionType: 'normal',
      hasArrowhead: true,
      curveMode: 'auto',
      controlPoints: []
    }] : [],
    subQuests: Array.from({ length: 4 }, (_, stepIndex) => ({
      externalId: `step-${stepIndex}`,
      title: `Step ${stepIndex + 1}`,
      description: `Complete load-test step ${stepIndex + 1}.`,
      descriptionParts: [{ type: 'Text', content: `Step details ${stepIndex + 1}` }]
    }))
  })));

  await ShopItem.insertMany(shopItemIds.map((shopItemId, index) => ({
    _id: shopItemId,
    title: `Load Item ${index + 1}`,
    description: `Inventory item ${index + 1}`,
    price: 10,
    imageUrl: '',
    isActive: true,
    availableToAllGuilds: true,
    guildIds: [],
    itemType: 'normal'
  })));

  const users = Array.from({ length: userCount }, (_, index) => {
    const unlockedSkills = skillIds.slice(0, index % 15).map(skillId => skillId.toString());
    return {
      discordId: `load-user-${index}`,
      username: `Load User ${index}`,
      nickname: `Load User ${index}`,
      discriminator: '0',
      avatar: null,
      isAdmin: index === 0,
      role: index === 0 ? 'super-admin' : 'user',
      guildId: guildIds[index % guildIds.length].toString(),
      assetPoints: 1_000,
      techTokens: 0,
      voiceMinutesToday: index % 120,
      totalVoiceMinutes: index * 10,
      unlockedSkills,
      completedQuestSteps: unlockedSkills.slice(0, 5).map((skillId, stepIndex) => ({
        skillId,
        stepId: `step-${stepIndex % 4}`,
        completedAt: new Date()
      })),
      completedQuestRewards: unlockedSkills.slice(0, 3)
    };
  });
  await User.insertMany(users);

  const purchases = users.flatMap(user =>
    shopItemIds.slice(0, inventoryItemsPerUser).map((shopItemId, index) => ({
      userId: user.discordId,
      shopItemId,
      status: 'completed',
      purchasedAt: new Date(),
      contributionCredits: 0,
      quantity: (index % 3) + 1
    }))
  );
  if (purchases.length > 0) await Purchase.insertMany(purchases);

  await ApprovalRequest.insertMany(users
    .filter((_, index) => index % 20 === 0)
    .map((user, index) => ({
      userId: user.discordId,
      skillId: skillIds[index % skillIds.length].toString(),
      status: 'pending'
    })));

  await Promise.all([
    User.syncIndexes(),
    Guild.syncIndexes(),
    Skill.syncIndexes(),
    ShopItem.syncIndexes(),
    Purchase.syncIndexes(),
    ApprovalRequest.syncIndexes()
  ]);

  console.log(JSON.stringify({
    dbName,
    users: users.length,
    skills: skillIds.length,
    shopItems: shopItemIds.length,
    purchases: purchases.length
  }, null, 2));
  await mongoose.disconnect();
};

run().catch(async error => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
