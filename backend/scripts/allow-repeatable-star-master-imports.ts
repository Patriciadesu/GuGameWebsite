import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || '';
const INDEX_NAME = 'externalSource_1_externalQuestId_1';

const migrate = async () => {
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  await mongoose.connect(MONGODB_URI, MONGODB_DB_NAME ? { dbName: MONGODB_DB_NAME } : undefined);
  const skills = mongoose.connection.collection('skills');
  const indexes = await skills.indexes();
  const existing = indexes.find(index => index.name === INDEX_NAME);

  if (existing?.unique) await skills.dropIndex(INDEX_NAME);
  if (!existing || existing.unique) {
    await skills.createIndex(
      { externalSource: 1, externalQuestId: 1 },
      { name: INDEX_NAME, sparse: true }
    );
  }

  console.log('StarMaster quests can now be imported more than once.');
  await mongoose.disconnect();
};

migrate().catch(async error => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
