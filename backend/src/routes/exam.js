const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const auth = require('../middleware/auth');
const axios = require('axios');

// Get active exam
router.get('/active', auth, async (req, res) => {
  try {
    const exam = await Exam.findOne({ isActive: true });
    
    if (!exam) {
      return res.status(404).json({ message: 'No active exam found' });
    }

    res.json(exam);
  } catch (error) {
    console.error('Error fetching active exam:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Start exam (create submission)
router.post('/start', auth, async (req, res) => {
  try {
    const exam = await Exam.findOne({ isActive: true });
    
    if (!exam) {
      return res.status(404).json({ message: 'No active exam found' });
    }

    // Check if user already has a submission
    const existingSubmission = await Submission.findOne({
      user: req.user.id,
      exam: exam._id
    });

    if (existingSubmission) {
      return res.json(existingSubmission);
    }

    // Create new submission
    const submission = new Submission({
      user: req.user.id,
      exam: exam._id,
      startTime: new Date(),
      status: 'in_progress',
      answers: [],
      violations: [],
      baseScore: 0,
      violationPenalty: 0,
      score: 0,
      totalPoints: exam.totalPoints || 100,
      percentage: 0,
      penaltyBreakdown: [] // Initialize as empty array
    });

    await submission.save();
    console.log('✅ Submission created:', submission._id);
    
    res.status(201).json(submission);
  } catch (error) {
    console.error('❌ Error starting exam:', error);
    res.status(500).json({ message: 'Failed to start exam', error: error.message });
  }
});

// Execute code
router.post('/execute', auth, async (req, res) => {
  try {
    const { code, input } = req.body;

    const options = {
      method: 'POST',
      url: 'https://judge0-ce.p.rapidapi.com/submissions',
      params: { base64_encoded: 'false', fields: '*' },
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
        'X-RapidAPI-Host': process.env.JUDGE0_HOST
      },
      data: {
        language_id: 54, // C++ (GCC 9.2.0)
        source_code: code,
        stdin: input || ''
      }
    };

    const response = await axios.request(options);
    const token = response.data.token;

    // Poll for result
    let result;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const resultResponse = await axios.get(
        `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
        {
          params: { base64_encoded: 'false', fields: '*' },
          headers: {
            'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
            'X-RapidAPI-Host': process.env.JUDGE0_HOST
          }
        }
      );

      result = resultResponse.data;

      if (result.status.id > 2) {
        break;
      }
      
      attempts++;
    }

    res.json({
      output: result.stdout || result.stderr || result.compile_output || 'No output',
      status: result.status.description,
      time: result.time,
      memory: result.memory
    });

  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ 
      message: 'Code execution failed', 
      error: error.message 
    });
  }
});

// Submit exam
router.post('/submit', auth, async (req, res) => {
  try {
    const { 
      submissionId, 
      answers, 
      violations, 
      timeTaken, 
      recordings,
      proctorReport,
      proctorSessionId 
    } = req.body;

    console.log('📥 Submission received:', {
      submissionId,
      answersCount: answers?.length,
      violationsCount: violations?.length
    });

    const submission = await Submission.findById(submissionId).populate('exam');
    
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Calculate scores
    let baseScore = 0;
    const exam = submission.exam;
    const totalPoints = exam.questions.reduce((sum, q) => sum + q.points, 0);
    const gradedAnswers = [];

    for (const answer of (answers || [])) {
      const question = exam.questions.find(q => q.questionNumber === answer.questionNumber);
      if (!question) continue;
      
      let isCorrect = false;
      let earnedPoints = 0;
      
      if (answer.output && answer.output.trim()) {
        const codeLength = (answer.code || '').length;
        const starterLength = (question.starterCode || '').length;
        
        if (codeLength > starterLength + 20) {
          earnedPoints = question.points * 0.4;
          const output = answer.output.toLowerCase();
          
          if (output.includes('✅') || output.includes('success')) {
            earnedPoints = question.points;
            isCorrect = true;
          } else if (!output.includes('error') && output.length > 10) {
            earnedPoints = question.points * 0.7;
          }
        }
      }
      
      baseScore += earnedPoints;
      gradedAnswers.push({
        questionNumber: answer.questionNumber,
        code: answer.code,
        output: answer.output,
        isCorrect,
        pointsEarned: Math.round(earnedPoints * 10) / 10,
        pointsPossible: question.points
      });
    }

    // Calculate penalty
const penaltyResult = calculateDynamicPenalty(violations, proctorReport);
    const finalScore = Math.max(0, baseScore - penaltyResult.totalPenalty);
    const percentage = totalPoints > 0 ? Math.round((finalScore / totalPoints) * 100) : 0;

    // Determine status
    const criticalViolations = penaltyResult.breakdown.filter(b => 
      b.type === 'GHOST_TYPING_DETECTED' || b.type === 'MULTIPLE_PERSONS'
    ).length;
    
    let status = 'submitted';
    if (criticalViolations > 0 || penaltyResult.totalPenalty > 30) {
      status = 'flagged';
    } else if (penaltyResult.totalPenalty > 15) {
      status = 'under_review';
    }

    // Update submission fields individually
    submission.answers = gradedAnswers;
    submission.baseScore = Math.round(baseScore * 10) / 10;
    submission.score = Math.round(finalScore * 10) / 10;
    submission.totalPoints = totalPoints;
    submission.percentage = percentage;
    submission.violations = violations || [];
    submission.violationPenalty = Math.round(penaltyResult.totalPenalty * 10) / 10;
    submission.status = status;
    submission.timeTaken = timeTaken || 0;
    submission.endTime = new Date();
    submission.submittedAt = new Date();
    submission.proctorSessionId = proctorSessionId;

    // ✅ CRITICAL FIX: Clear existing penaltyBreakdown and rebuild
    // First, clear the existing array completely
    submission.penaltyBreakdown = [];
    submission.markModified('penaltyBreakdown'); // Force Mongoose to detect changes
    
    if (Array.isArray(penaltyResult.breakdown)) {
      penaltyResult.breakdown.forEach(item => {
        submission.penaltyBreakdown.push({
          type: String(item.type || 'UNKNOWN'),
          count: Number(item.count || 0),
          penalty: Number(item.penalty || 0),
          maxReached: Boolean(item.maxReached || false)
        });
      });
    }
    
    console.log('🔍 Final breakdown length:', submission.penaltyBreakdown.length);
    console.log('🔍 Final breakdown:', JSON.stringify(submission.penaltyBreakdown, null, 2));

    // Update recordings if provided
    if (recordings) {
      submission.recordings = {
        sessionId: recordings.sessionId,
        webcamURL: recordings.webcamURL,
        screenURL: recordings.screenURL,
        eventsURL: recordings.eventsURL,
        webcamPublicId: recordings.webcamPublicId,
        screenPublicId: recordings.screenPublicId,
        eventsPublicId: recordings.eventsPublicId,
        duration: recordings.duration,
        message: recordings.message,
        keystrokes: recordings.keystrokes || []
      };
    }

    // Update proctor report if provided
    if (proctorReport) {
      let validRiskLevel = 'LOW_RISK';
      if (proctorReport.riskLevel) {
        const risk = String(proctorReport.riskLevel).toUpperCase().replace(/ /g, '_');
        if (['LOW_RISK', 'MEDIUM_RISK', 'HIGH_RISK'].includes(risk)) {
          validRiskLevel = risk;
        }
      }
      
 
      submission.proctorReport = {
        studentId: proctorReport.studentId,
        examId: proctorReport.examId,
        duration: proctorReport.duration,
        totalViolations: proctorReport.totalViolations || 0,
        framesProcessed: proctorReport.framesProcessed || 0,
        screenFramesProcessed: proctorReport.screenFramesProcessed || 0,
        riskLevel: validRiskLevel,
        violationBreakdown: proctorReport.violationBreakdown || {
          ghostTyping: 0,
          noFace: 0,
          multiplePersons: 0
        },
        violations: (proctorReport.violations || []).map(v => ({
          type: v.type,
          severity: v.severity,
          timestamp: v.timestamp,
          details: v.details,
          confidence: v.confidence
        }))
      };
    }

    await submission.save({ validateBeforeSave: true });

    console.log('✅ Exam submitted:', {
      submissionId: submission._id,
      finalScore: submission.score,
      status,
      penaltyCount: submission.penaltyBreakdown.length
    });

    res.json({
      _id: submission._id,
      baseScore: submission.baseScore,
      score: submission.score,
      totalPoints: submission.totalPoints,
      percentage: submission.percentage,
      answers: gradedAnswers,
      violations: violations || [],
      violationPenalty: submission.violationPenalty,
      penaltyBreakdown: submission.penaltyBreakdown,
      proctorReport: submission.proctorReport,
      status,
      timeTaken,
      recordings: submission.recordings,
      message: 'Exam submitted successfully'
    });

  } catch (error) {
    console.error('❌ Submission error:', error);
    console.error('Error details:', error.message);
    
    // More detailed error message
    if (error.name === 'ValidationError') {
      const validationErrors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      
      return res.status(400).json({
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to submit exam', 
      error: error.message 
    });
  }
});

// ========================================
// FIXED PENALTY CALCULATION
// Returns plain objects, not Mongoose documents
// ========================================
function calculateDynamicPenalty(violations, proctorReport) {
  const breakdown = [];
  let totalPenalty = 0;
  
  const safeViolations = Array.isArray(violations) ? violations : [];
  const violationsByType = {};
  
  safeViolations.forEach(v => {
    const vType = String(v.type || 'UNKNOWN');
    if (!violationsByType[vType]) {
      violationsByType[vType] = [];
    }
    violationsByType[vType].push(v);
  });
  
  const penaltyRules = {
    'GHOST_TYPING_DETECTED': { first: 15, increment: 5, max: 40 },
    'MULTIPLE_PERSONS': { first: 20, increment: 5, max: 45 },
    'NO_FACE_DETECTED': { first: 3, increment: 1, max: 10 },
    'tab_switch': { first: 2, increment: 0.5, max: 8 },
    'screen_stopped': { first: 10, increment: 3, max: 25 }
  };
  
  // Process violations
  Object.keys(violationsByType).forEach(vType => {
    const violationList = violationsByType[vType];
    const rule = penaltyRules[vType] || { first: 2, increment: 1, max: 10 };
    
    let typePenalty = 0;
    violationList.forEach((v, index) => {
      if (index === 0) {
        typePenalty += rule.first;
      } else {
        const additionalPenalty = Math.max(0.5, rule.increment - Math.floor(index / 3));
        typePenalty += additionalPenalty;
      }
    });
    
    typePenalty = Math.min(typePenalty, rule.max);
    totalPenalty += typePenalty;
    
    // ✅ Create PLAIN object (not Mongoose subdocument)
    breakdown.push({
      type: vType,
      count: violationList.length,
      penalty: Math.round(typePenalty * 10) / 10,
      maxReached: typePenalty >= rule.max
    });
  });
  
  // AI Proctor penalties
  if (proctorReport && proctorReport.violationBreakdown) {
    const aiBreakdown = proctorReport.violationBreakdown;
    
    if (aiBreakdown.ghostTyping > 0) {
      const ghostPenalty = Math.min(aiBreakdown.ghostTyping * 15, 40);
      totalPenalty += ghostPenalty;
      breakdown.push({
        type: 'AI_GHOST_TYPING',
        count: aiBreakdown.ghostTyping,
        penalty: ghostPenalty,
        maxReached: ghostPenalty >= 40
      });
    }
    
    if (aiBreakdown.multiplePersons > 0) {
      const multiPersonPenalty = Math.min(aiBreakdown.multiplePersons * 20, 45);
      totalPenalty += multiPersonPenalty;
      breakdown.push({
        type: 'AI_MULTIPLE_PERSONS',
        count: aiBreakdown.multiplePersons,
        penalty: multiPersonPenalty,
        maxReached: multiPersonPenalty >= 45
      });
    }
    
    if (aiBreakdown.noFace > 0) {
      const noFacePenalty = Math.min(aiBreakdown.noFace * 1, 10);
      totalPenalty += noFacePenalty;
      breakdown.push({
        type: 'AI_NO_FACE',
        count: aiBreakdown.noFace,
        penalty: noFacePenalty,
        maxReached: noFacePenalty >= 10
      });
    }
  }
  
  // ✅ Return PLAIN objects only
  return {
    totalPenalty: Math.round(totalPenalty * 10) / 10,
    breakdown: breakdown  // Array of plain objects
  };
}

// Label submission
router.post('/label', auth, async (req, res) => {
  try {
    const { submissionId, label, cheatingType, notes, labeledBy } = req.body;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    submission.label = label.toLowerCase();
    submission.cheatingType = cheatingType;
    submission.labelNotes = notes;
    submission.labeledAt = new Date();
    submission.labeledBy = labeledBy;
    submission.isLabeled = true;

    if (submission.recordings) {
      submission.recordings.label = label.toLowerCase();
      submission.recordings.cheatingType = cheatingType;
      submission.recordings.notes = notes;
      submission.recordings.labeledAt = new Date();
      submission.recordings.labeledBy = labeledBy;
    }

    await submission.save();

    res.json({ 
      success: true, 
      message: 'Label saved successfully',
      label: submission.label,
      isLabeled: submission.isLabeled
    });
  } catch (error) {
    console.error('❌ Error saving label:', error);
    res.status(500).json({ 
      message: 'Failed to save label',
      error: error.message 
    });
  }
});
// Get labeled submissions FOR EVALUATION
router.get('/evaluation-stats', async (req, res) => {
  try {
    const totalSubmissions = await Submission.countDocuments();
    const totalLabeled = await Submission.countDocuments({ isLabeled: true });
    const genuineCount = await Submission.countDocuments({ label: 'genuine' });
    const cheatingCount = await Submission.countDocuments({ label: 'cheating' });
    const unlabeledCount = totalSubmissions - totalLabeled;
    
    const labelingProgress = totalSubmissions > 0 
      ? ((totalLabeled / totalSubmissions) * 100).toFixed(2)
      : 0;

    res.json({
      totalSubmissions,
      totalLabeled,
      genuineCount,
      cheatingCount,
      unlabeledCount,
      labelingProgress: parseFloat(labelingProgress)
    });
  } catch (error) {
    console.error('Error fetching evaluation stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch evaluation statistics',
      message: error.message 
    });
  }
});

/**
 * GET /api/exams/labeled-submissions
 * Returns all labeled submissions for Python evaluation script
 */
router.get('/labeled-submissions', async (req, res) => {
  try {
    // Fetch all submissions that have been labeled
    const labeledSubmissions = await Submission.find({ 
      isLabeled: true,
      label: { $in: ['genuine', 'cheating'] }
    })
    .select({
      _id: 1,
      userId: 1,
      examId: 1,
      submittedAt: 1,
      completedAt: 1,
      score: 1,
      violations: 1,
      status: 1,
      label: 1,
      isLabeled: 1,
      cheatingType: 1,
      labeledBy: 1,
      labeledAt: 1,
      labelNotes: 1
    })
    .sort({ labeledAt: -1 })
    .lean();

    console.log(`✅ Fetched ${labeledSubmissions.length} labeled submissions for evaluation`);

    res.json(labeledSubmissions);
  } catch (error) {
    console.error('Error fetching labeled submissions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch labeled submissions',
      message: error.message 
    });
  }
});

// STEP 3: Add this helper endpoint for debugging
router.get('/label-stats', async (req, res) => {
  try {
    console.log('📊 Fetching label statistics...');
    
    const stats = {
      total: await Submission.countDocuments({}),
      labeled: await Submission.countDocuments({ isLabeled: true }),
      unlabeled: await Submission.countDocuments({ 
        $or: [
          { isLabeled: false },
          { isLabeled: { $exists: false } },
          { label: 'unlabeled' }
        ]
      }),
      genuine: await Submission.countDocuments({ 
        isLabeled: true, 
        label: 'genuine' 
      }),
      cheating: await Submission.countDocuments({ 
        isLabeled: true, 
        label: 'cheating' 
      }),
      // Additional breakdown
      byLabel: {
        genuine: await Submission.countDocuments({ label: 'genuine' }),
        cheating: await Submission.countDocuments({ label: 'cheating' }),
        unlabeled: await Submission.countDocuments({ label: 'unlabeled' })
      }
    };
    
    console.log('Stats:', JSON.stringify(stats, null, 2));
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check a single submission's label
router.get('/check-label/:submissionId', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId)
      .select('label isLabeled cheatingType labeledAt labeledBy');
    
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    res.json({
      submissionId: submission._id,
      isLabeled: submission.isLabeled,
      label: submission.label,
      cheatingType: submission.cheatingType,
      labeledAt: submission.labeledAt,
      labeledBy: submission.labeledBy
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get metrics
router.get('/metrics', async (req, res) => {
  try {
    const labeledSubmissions = await Submission.find({ 
      isLabeled: true,
      label: { $in: ['genuine', 'cheating'] }
    })
    .select('label violations')
    .lean();

    if (labeledSubmissions.length < 10) {
      return res.json({
        error: 'Insufficient data',
        message: 'Need at least 10 labeled submissions for metrics',
        labeledCount: labeledSubmissions.length,
        requiredCount: 10
      });
    }

    // Calculate confusion matrix
    let tp = 0, tn = 0, fp = 0, fn = 0;

    for (const sub of labeledSubmissions) {
      const violations = sub.violations || [];
      const manualLabel = sub.label;
      
      // System prediction based on critical violations
      const hasCriticalViolation = violations.some(v => 
        v.type === 'GHOST_TYPING_DETECTED' || 
        v.type === 'MULTIPLE_PERSONS' ||
        v.type === 'MULTIPLE_FACES'
      );
      
      const systemPrediction = hasCriticalViolation ? 'cheating' : 'genuine';
      
      // Classification
      if (systemPrediction === 'cheating' && manualLabel === 'cheating') {
        tp++;
      } else if (systemPrediction === 'genuine' && manualLabel === 'genuine') {
        tn++;
      } else if (systemPrediction === 'cheating' && manualLabel === 'genuine') {
        fp++;
      } else {
        fn++;
      }
    }

    const total = tp + tn + fp + fn;
    
    // Calculate metrics
    const accuracy = total > 0 ? ((tp + tn) / total * 100) : 0;
    const precision = (tp + fp) > 0 ? (tp / (tp + fp) * 100) : 0;
    const recall = (tp + fn) > 0 ? (tp / (tp + fn) * 100) : 0;
    const specificity = (tn + fp) > 0 ? (tn / (tn + fp) * 100) : 0;
    const f1Score = (precision + recall) > 0 
      ? (2 * precision * recall / (precision + recall)) 
      : 0;

    res.json({
      totalEvaluated: total,
      confusionMatrix: {
        truePositive: tp,
        trueNegative: tn,
        falsePositive: fp,
        falseNegative: fn
      },
      metrics: {
        accuracy: parseFloat(accuracy.toFixed(2)),
        precision: parseFloat(precision.toFixed(2)),
        recall: parseFloat(recall.toFixed(2)),
        specificity: parseFloat(specificity.toFixed(2)),
        f1Score: parseFloat(f1Score.toFixed(2))
      },
      breakdown: {
        genuineTotal: tn + fp,
        cheatingTotal: tp + fn,
        correctlyClassified: tp + tn,
        incorrectlyClassified: fp + fn
      }
    });
  } catch (error) {
    console.error('Error calculating metrics:', error);
    res.status(500).json({ 
      error: 'Failed to calculate metrics',
      message: error.message 
    });
  }
});

/**
 * GET /api/exams/all-submissions
 * Get all submissions (for debugging)
 */
router.get('/all-submissions', async (req, res) => {
  try {
    const submissions = await Submission.find()
      .select({
        _id: 1,
        userId: 1,
        examId: 1,
        submittedAt: 1,
        score: 1,
        violations: 1,
        status: 1,
        label: 1,
        isLabeled: 1,
        cheatingType: 1
      })
      .sort({ submittedAt: -1 })
      .limit(100)
      .lean();

    res.json({
      total: submissions.length,
      submissions: submissions
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch submissions',
      message: error.message 
    });
  }
});

// Get submission by ID
router.get('/submission/:id', auth, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('user', 'name email rollNo')
      .populate('exam', 'title duration');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    if (submission.user._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(submission);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ message: 'Failed to fetch submission' });
  }
});

// Get user's submissions
router.get('/my-submissions', auth, async (req, res) => {
  try {
    const submissions = await Submission.find({ user: req.user.id })
      .populate('exam', 'title duration')
      .sort({ createdAt: -1 });

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Failed to fetch submissions' });
  }
});

module.exports = router;