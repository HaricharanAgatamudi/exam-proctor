// E:\Exam_Proctor\backend\src\models\Exam.js
const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  duration: {
    type: Number,
    required: true // Duration in minutes
  },
  questions: [{
    questionNumber: {
      type: Number,
      required: true
    },
    question: {
      type: String,
      required: true
    },
    points: {
      type: Number,
      default: 10
    },
    starterCode: {
      type: String,
      default: ''
    },
    testCases: [{
      input: String,
      expectedOutput: String
    }]
  }],
  isActive: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Exam', examSchema);