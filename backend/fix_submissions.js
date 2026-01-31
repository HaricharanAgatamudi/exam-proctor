

const mongoose = require('mongoose');

// MongoDB Connection String
const MONGODB_URI = 'mongodb://localhost:27017/exam_proctor';

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

// Main migration function
async function migrateSubmissions() {
  console.log('\n🔧 Starting Submission Schema Migration...\n');
  
  try {
    // Get the submissions collection directly
    const db = mongoose.connection.db;
    const submissionsCollection = db.collection('submissions');
    
    // Step 1: Check current state
    console.log('📊 Checking current state...');
    const totalCount = await submissionsCollection.countDocuments();
    const labeledCount = await submissionsCollection.countDocuments({ isLabeled: true });
    const unlabeledCount = totalCount - labeledCount;
    
    console.log(`   Total submissions: ${totalCount}`);
    console.log(`   Already labeled: ${labeledCount}`);
    console.log(`   Need migration: ${unlabeledCount}`);
    console.log('');
    
    if (totalCount === 0) {
      console.log('⚠️  No submissions found in database!');
      return;
    }
    
    // Step 2: Update all submissions
    console.log('🔄 Updating all submissions with label fields...');
    
    const result = await submissionsCollection.updateMany(
      {},  // Match ALL documents
      {
        $set: {
          label: 'unlabeled',
          isLabeled: false,
          cheatingType: null,
          labelNotes: '',
          labeledBy: null,
          labeledAt: null
        }
      }
    );
    
    console.log('✅ Update complete!');
    console.log(`   Matched: ${result.matchedCount} documents`);
    console.log(`   Modified: ${result.modifiedCount} documents`);
    console.log('');
    
    // Step 3: Verify the update
    console.log('🔍 Verifying migration...');
    const verifyCount = await submissionsCollection.countDocuments({ 
      label: 'unlabeled',
      isLabeled: false
    });
    
    console.log(`   Submissions with new schema: ${verifyCount}`);
    
    // Step 4: Show sample document
    const sample = await submissionsCollection.findOne({}, {
      projection: {
        _id: 1,
        label: 1,
        isLabeled: 1,
        cheatingType: 1,
        labelNotes: 1,
        violations: 1,
        status: 1
      }
    });
    
    if (sample) {
      console.log('\n📋 Sample submission after migration:');
      console.log('   ID:', sample._id.toString());
      console.log('   label:', sample.label);
      console.log('   isLabeled:', sample.isLabeled);
      console.log('   cheatingType:', sample.cheatingType);
      console.log('   violations:', sample.violations?.length || 0);
      console.log('   status:', sample.status);
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Restart your backend: node server.js');
    console.log('   2. Go to Results page after completing an exam');
    console.log('   3. Select "Genuine" or "Cheating"');
    console.log('   4. Click "Save Label"');
    console.log('   5. Run: python test_integration.py');
    console.log('');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run migration
async function main() {
  try {
    await connectDB();
    await migrateSubmissions();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Execute
main();