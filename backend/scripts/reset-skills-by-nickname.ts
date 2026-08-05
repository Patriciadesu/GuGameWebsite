import mongoose from 'mongoose';
import User from '../src/models/User';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function resetSkillsByNickname() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gugame';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const nicknamePrefix = 'Dek70';

    // Find all users with nickname starting with the prefix
    const users = await User.find({
      nickname: { $regex: `^${nicknamePrefix}`, $options: 'i' }
    });

    if (users.length === 0) {
      console.log(`❌ No users found with nickname starting with "${nicknamePrefix}"`);
      await mongoose.disconnect();
      return;
    }

    console.log(`📋 Found ${users.length} user(s) with nickname starting with "${nicknamePrefix}":`);
    users.forEach(user => {
      console.log(`  - ${user.nickname} (${user.username}, Discord ID: ${user.discordId})`);
      console.log(`    Current unlocked skills: ${user.unlockedSkills?.length || 0}`);
    });

    // Reset unlockedSkills for all matching users
    const result = await User.updateMany(
      { nickname: { $regex: `^${nicknamePrefix}`, $options: 'i' } },
      { $set: { unlockedSkills: [] } }
    );

    console.log(`\n✅ Successfully reset skill tree progress for ${result.modifiedCount} user(s)`);
    console.log(`📊 Modified count: ${result.modifiedCount}`);

    // Verify the reset
    const updatedUsers = await User.find({
      nickname: { $regex: `^${nicknamePrefix}`, $options: 'i' }
    });
    console.log('\n🔍 Verification:');
    updatedUsers.forEach(user => {
      console.log(`  - ${user.nickname}: ${user.unlockedSkills?.length || 0} unlocked skills`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
resetSkillsByNickname();
