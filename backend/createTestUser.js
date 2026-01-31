const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

// Import User model (it will hash password automatically)
const User = require('./src/models/User');

async function createTestUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Delete existing test user
    await User.deleteOne({ email: 'test@example.com' });
    console.log('🗑️ Deleted any existing test user');

    // Create user (password will be auto-hashed by the model)
    const user = await User.create({
      name: 'Test Student',
      email: 'test@example.com',
      password: 'password123', // Will be auto-hashed
      rollNo: 'TEST001',
      department: 'Computer Science',
      role: 'student'
    });

    console.log('✅ Test user created:');
    console.log('   Email: test@example.com');
    console.log('   Roll No: TEST001');
    console.log('   Password: password123');
    console.log('   Name:', user.name);

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestUser();