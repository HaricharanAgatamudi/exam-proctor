const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  exam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
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
    type: String,
    timestamp: Date,
    description: String,
    severity: String
  }],
  timeTaken: {
    type: Number,
    default: 0
  },
  baseScore: {
    type: Number,
    default: 0
  },
  score: {
    type: Number,
    default: 0
  },
  percentage: {
    type: Number,
    default: 0
  },
  totalPoints: {
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
  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'flagged', 'reviewed'],
    default: 'in_progress'
  },
  proctorReport: {
    studentId: String,
    examId: String,
    duration: Number,
    totalViolations: Number,
    violationSummary: Object,
    detailedViolations: Array,
    riskLevel: {
      type: String,
      enum: ['LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK', 'UNKNOWN'],
      default: 'UNKNOWN'
    },
    framesProcessed: Number,
    screenFramesProcessed: Number,
    timestamp: String,
    violationBreakdown: {
      ghostTyping: Number,
      noFace: Number,
      multiplePersons: Number
    }
  },
  proctorSessionId: String,
  recordings: {
    cameraUrl: String,
    screenUrl: String,
    eventsUrl: String,
    sessionId: String
  },
  
  // ✅ NEW: Label data for ML training
  labeled: {
    type: Boolean,
    default: false
  },
  labeledAt: Date,
  labelData: {
    label: {
      type: String,
      enum: ['genuine', 'cheating', 'unlabeled'],
      default: 'unlabeled'
    },
    cheatingType: {
      type: String,
      enum: [
        'ghost_typing',
        'phone_usage',
        'copy_paste',
        'notes_usage',
        'tab_switching',
        'multiple_persons',
        'other',
        null
      ],
      default: null
    },
    notes: String,
    labeledBy: String,
    labeledAt: Date,
    metadata: {
      baseScore: Number,
      finalScore: Number,
      percentage: Number,
      totalViolations: Number,
      violationTypes: [String],
      proctorRiskLevel: String,
      ghostTypingCount: Number,
      timeTaken: Number
    }
  },
  
  submittedAt: {
    type: Date,
    default: Date.now
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
submissionSchema.index({ labeled: 1, 'labelData.label': 1 });
submissionSchema.index({ 'labelData.labeledAt': -1 });
submissionSchema.index({ student: 1, submittedAt: -1 });
module.exports = mongoose.model('Submission', submissionSchema);