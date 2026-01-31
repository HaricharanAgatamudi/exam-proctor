  const mongoose = require('mongoose');
  const dotenv = require('dotenv');

  dotenv.config();

  // Exam Schema
  const examSchema = new mongoose.Schema({
    title: String,
    description: String,
    duration: Number,
    questions: [{
      questionNumber: Number,
      question: String,
      points: Number,
      starterCode: String,
      testCases: [{
        input: String,
        expectedOutput: String
      }]
    }],
    isActive: Boolean,
    createdAt: { type: Date, default: Date.now }
  });

  const Exam = mongoose.model('Exam', examSchema);

  // Sample Exam Data
  const sampleExam = {
    title: 'C++ Programming Fundamentals',
    description: 'Test your C++ programming skills with basic to intermediate problems',
    duration: 60,
    questions: [
      {
        questionNumber: 1,
        question: 'Write a C++ program to find the largest element in an array.',
        points: 20,
        starterCode: `#include <iostream>
  using namespace std;

  int main() {
      int arr[] = {3, 5, 7, 2, 8, 1};
      int n = 6;
      
      // Write your code here
      
      return 0;
  }`,
        testCases: [{ input: '', expectedOutput: '8' }]
      },
      {
        questionNumber: 2,
        question: 'Write a C++ program to reverse a string.',
        points: 15,
        starterCode: `#include <iostream>
  #include <string>
  using namespace std;

  int main() {
      string str = "Hello";
      
      // Write your code here
      
      return 0;
  }`,
        testCases: [{ input: '', expectedOutput: 'olleH' }]
      },
      {
        questionNumber: 3,
        question: 'Write a C++ program to check if a number is prime.',
        points: 25,
        starterCode: `#include <iostream>
  using namespace std;

  bool isPrime(int n) {
      // Write your code here
  }

  int main() {
      int num = 17;
      if(isPrime(num))
          cout << num << " is prime";
      else
          cout << num << " is not prime";
      return 0;
  }`,
        testCases: [{ input: '', expectedOutput: '17 is prime' }]
      },
      {
        questionNumber: 4,
        question: 'Write a C++ program to find factorial using recursion.',
        points: 20,
        starterCode: `#include <iostream>
  using namespace std;

  int factorial(int n) {
      // Write your code here
  }

  int main() {
      int n = 5;
      cout << "Factorial of " << n << " is " << factorial(n);
      return 0;
  }`,
        testCases: [{ input: '', expectedOutput: 'Factorial of 5 is 120' }]
      }
    ],
    isActive: true
  };

  // Main function with proper connection handling
  async function seedDatabase() {
    try {
      console.log('🔄 Connecting to MongoDB...');
      console.log('📍 Connection URI:', process.env.MONGODB_URI);
      
      // Updated connection without deprecated options
      await mongoose.connect(process.env.MONGODB_URI);
      
      console.log('✅ Connected to MongoDB successfully!');

      // Check if exam already exists
      const existingExam = await Exam.findOne({ title: sampleExam.title });
      
      if (existingExam) {
        console.log('⚠️  Exam already exists. Deleting old exam...');
        await Exam.deleteOne({ title: sampleExam.title });
      }

      // Create new exam
      const exam = await Exam.create(sampleExam);
      
      console.log('✅ Sample exam created successfully!');
      console.log('📚 Exam Title:', exam.title);
      console.log('❓ Questions:', exam.questions.length);
      console.log('⏱️  Duration:', exam.duration, 'minutes');
      console.log('📝 Total Points:', exam.questions.reduce((sum, q) => sum + q.points, 0));
      
      await mongoose.connection.close();
      console.log('👋 Database connection closed');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
      process.exit(1);
    }
  }

  // Run the seed function
  seedDatabase();