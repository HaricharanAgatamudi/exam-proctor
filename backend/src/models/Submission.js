const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  submittedAt: {
    type: Date
  },
  timeTaken: {
    type: Number,
    default: 0
  },
  answers: [{
    questionNumber: Number,
    code: String,
    output: String,
    isCorrect: Boolean,
    pointsEarned: Number,
    pointsPossible: Number
  }],
  violations: [{
    type: {
      type: String,
      enum: [
        'tab_switch', 
        'face_not_detected', 
        'multiple_faces', 
        'phone_detected', 
        'screen_stopped', 
        'suspicious_behavior',
        'NO_FACE_DETECTED',
        'MULTIPLE_PERSONS',
        'GHOST_TYPING_DETECTED',
        'LOOKING_AWAY',
        'SUSPICIOUS_HAND_MOVEMENT'
      ]
    },
    timestamp: Date,
    description: String,
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    },
    details: mongoose.Schema.Types.Mixed,
    confidence: Number
  }],
  recordings: {
    sessionId: String,
    webcamURL: String,
    screenURL: String,
    eventsURL: String,
    webcamPublicId: String,
    screenPublicId: String,
    eventsPublicId: String,
    duration: Number,
    label: {
      type: String,
      enum: ['clean', 'suspicious', 'cheating', 'genuine', 'unlabeled'],
      default: 'unlabeled'
    },
    cheatingType: String,
    notes: String,
    labeledAt: Date,
    labeledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: String,
    keystrokes: [{
      timestamp: Number,
      key: String,
      codeLength: Number,
      relativeTime: Number
    }]
  },
  
  // ========================================
  // PROCTOR REPORT FIELDS
  // ========================================
  proctorReport: {
    studentId: String,
    examId: String,
    duration: Number,
    totalViolations: Number,
    framesProcessed: Number,
    screenFramesProcessed: Number,
    riskLevel: {
      type: String,
      enum: ['LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK']
    },
    violationBreakdown: {
      ghostTyping: { type: Number, default: 0 },
      noFace: { type: Number, default: 0 },
      multiplePersons: { type: Number, default: 0 },
      lookingAway: { type: Number, default: 0 },
      suspiciousHands: { type: Number, default: 0 }
    },
    violations: [{
      type: String,
      severity: String,
      timestamp: Date,
      details: mongoose.Schema.Types.Mixed,
      confidence: Number
    }]
  },
  proctorSessionId: String,
  
  // ========================================
  // SCORING FIELDS
  // ========================================
  baseScore: {
    type: Number,
    default: 0
  },
  violationPenalty: {
    type: Number,
    default: 0
  },
  penaltyBreakdown: [{
    type: String,
    count: Number,
    penalty: Number,
    maxReached: Boolean
  }],
  score: {
    type: Number,
    default: 0
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  percentage: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'flagged', 'under_review', 'graded'],
    default: 'in_progress'
  },
  
  // ========================================
  // LABELING FIELDS FOR AI TRAINING
  // ========================================
  label: {
    type: String,
    enum: ['unlabeled', 'genuine', 'cheating'],
    default: 'unlabeled'
  },
  cheatingType: {
    type: String,
    enum: [
      null,
      'ghost_typing',
      'phone_usage',
      'copy_paste',
      'notes_usage',
      'tab_switching',
      'multiple_persons',
      'other'
    ],
    default: null
  },
  labelNotes: {
    type: String,
    default: ''
  },
  labeledBy: {
    type: String,
    default: null
  },
  labeledAt: {
    type: Date,
    default: null
  },
  isLabeled: {
    type: Boolean,
    default: false
  }
  
}, { 
  timestamps: true 
});

// ========================================
// PRE-SAVE HOOKS
// ========================================

// Calculate percentage before saving
submissionSchema.pre('save', function(next) {
  if (this.totalPoints > 0) {
    this.percentage = Math.round((this.score / this.totalPoints) * 100);
  }
  
  // Auto-set isLabeled flag
  if (this.label && this.label !== 'unlabeled') {
    this.isLabeled = true;
  }
  
  next();
});

// ========================================
// INDEXES FOR EFFICIENT QUERIES
// ========================================
submissionSchema.index({ user: 1, exam: 1 });
submissionSchema.index({ 'recordings.sessionId': 1 });
submissionSchema.index({ status: 1 });
submissionSchema.index({ proctorSessionId: 1 });
submissionSchema.index({ label: 1 });
submissionSchema.index({ isLabeled: 1 });
submissionSchema.index({ labeledAt: -1 });

// ========================================
// INSTANCE METHODS
// ========================================

// Get submission classification (for evaluation)
submissionSchema.methods.getClassification = function() {
  const systemPredictedCheating = (this.violations?.length > 0) || 
                                 (this.violationPenalty > 0) ||
                                 (this.status === 'flagged');
  
  const actualCheating = (this.label === 'cheating');
  
  if (systemPredictedCheating && actualCheating) {
    return 'TP'; // True Positive
  } else if (!systemPredictedCheating && !actualCheating) {
    return 'TN'; // True Negative
  } else if (systemPredictedCheating && !actualCheating) {
    return 'FP'; // False Positive
  } else {
    return 'FN'; // False Negative
  }
};

// Check if has ghost typing violation
submissionSchema.methods.hasGhostTyping = function() {
  const hasTraditionalGT = this.violations?.some(v => 
    v.type === 'GHOST_TYPING_DETECTED'
  );
  
  const hasAIGT = this.proctorReport?.violationBreakdown?.ghostTyping > 0;
  
  return hasTraditionalGT || hasAIGT;
};

// ========================================
// STATIC METHODS
// ========================================

// Get evaluation metrics for all labeled submissions
submissionSchema.statics.getEvaluationMetrics = async function() {
  const labeledSubmissions = await this.find({ 
    isLabeled: true,
    label: { $in: ['genuine', 'cheating'] }
  });

  if (labeledSubmissions.length === 0) {
    return {
      message: 'No labeled data available',
      totalLabeled: 0,
      metrics: null
    };
  }

  let tp = 0, tn = 0, fp = 0, fn = 0;

  labeledSubmissions.forEach(sub => {
    const classification = sub.getClassification();
    
    if (classification === 'TP') tp++;
    else if (classification === 'TN') tn++;
    else if (classification === 'FP') fp++;
    else if (classification === 'FN') fn++;
  });

  const total = tp + tn + fp + fn;
  const accuracy = ((tp + tn) / total * 100).toFixed(2);
  const precision = tp + fp > 0 ? (tp / (tp + fp) * 100).toFixed(2) : 0;
  const recall = tp + fn > 0 ? (tp / (tp + fn) * 100).toFixed(2) : 0;
  const specificity = tn + fp > 0 ? (tn / (tn + fp) * 100).toFixed(2) : 0;
  const f1Score = precision > 0 && recall > 0 
    ? (2 * (precision * recall) / (parseFloat(precision) + parseFloat(recall))).toFixed(2) 
    : 0;

  return {
    totalLabeled: labeledSubmissions.length,
    confusionMatrix: {
      TP: tp,
      TN: tn,
      FP: fp,
      FN: fn
    },
    metrics: {
      accuracy: parseFloat(accuracy),
      precision: parseFloat(precision),
      recall: parseFloat(recall),
      specificity: parseFloat(specificity),
      f1Score: parseFloat(f1Score),
      fpr: tp + tn > 0 ? ((fp / (fp + tn)) * 100).toFixed(2) : 0,
      fnr: tp + fn > 0 ? ((fn / (fn + tp)) * 100).toFixed(2) : 0
    }
  };
};

module.exports = mongoose.model('Submission', submissionSchema);