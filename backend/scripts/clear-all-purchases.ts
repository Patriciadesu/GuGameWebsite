import mongoose from 'mongoose';
import Purchase from '../src/models/Purchase';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function clearAllPurchases() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gugame';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Count existing purchases
    const purchaseCount = await Purchase.countDocuments();
    console.log(`📊 Found ${purchaseCount} purchase record(s)`);

    if (purchaseCount === 0) {
      console.log('ℹ️  No purchases to clear.');
      await mongoose.disconnect();
      return;
    }

    // Delete all purchases
    const result = await Purchase.deleteMany({});
    
    console.log(`\n✅ Successfully deleted ${result.deletedCount} purchase record(s)`);
    console.log(`📊 Deleted count: ${result.deletedCount}`);

    // Verify deletion
    const remainingCount = await Purchase.countDocuments();
    console.log(`\n🔍 Verification: ${remainingCount} purchase record(s) remaining`);

    if (remainingCount === 0) {
      console.log('✅ All purchases have been cleared successfully');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} purchase record(s) still exist`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the script
clearAllPurchases();
