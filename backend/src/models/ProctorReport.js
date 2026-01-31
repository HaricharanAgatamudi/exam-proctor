const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'GHOST_TYPING',
      'NO_FACE_DETECTED', 
      'MULTIPLE_PERSONS',
      'LOOKING_AWAY',
      'TAB_SWITCH',
      'EXTERNAL_APP',
      'SUSPICIOUS_HAND_MOVEMENT'
    ],
    required: true
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true
  },
  timestamp: {
    type: Date,
    required: true
  },
  details: mongoose.Schema.Types.Mixed,
  confidence: Number
});

const proctorReportSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    index: true
  },
  examId: {
    type: String,
    required: true,
    index: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: Date,
  status: {
    type: String,
    enum: ['active', 'completed', 'interrupted'],
    default: 'active'
  },
  violations: [violationSchema],
  finalReport: mongoose.Schema.Types.Mixed,
  riskLevel: {
    type: String,
    enum: ['LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ProctorReport', proctorReportSchema);