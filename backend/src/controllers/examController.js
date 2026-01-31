const Exam = require('../models/Exam');
const Submission = require('../models/Submission');
const axios = require('axios');

// @route   GET /api/exam/active
// @desc    Get active exam
exports.getActiveExam = async (req, res) => {
  try {
    const exam = await Exam.findOne({ isActive: true });
    
    if (!exam) {
      return res.status(404).json({ message: 'No active exam found' });
    }

    res.json(exam);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/exam/start
// @desc    Start exam (create submission)
exports.startExam = async (req, res) => {
  try {
    console.log('📝 Start exam request from user:', req.user._id);
    
    const exam = await Exam.findOne({ isActive: true });
    
    if (!exam) {
      return res.status(404).json({ message: 'No active exam found' });
    }

    console.log('✅ Found active exam:', exam._id);

    // Delete existing submission to allow retake (for data collection)
    const deleted = await Submission.deleteMany({
      user: req.user._id,
      exam: exam._id
    });

    if (deleted.deletedCount > 0) {
      console.log(`🗑️ Deleted ${deleted.deletedCount} previous submission(s)`);
    }

    // Create new submission
    const submission = await Submission.create({
      user: req.user._id,
      exam: exam._id,
      startTime: new Date(),
      answers: [],
      violations: [],
      status: 'in_progress',
      score: 0,
      totalPoints: exam.questions.reduce((sum, q) => sum + q.points, 0)
    });

    console.log('✅ Submission created:', submission._id);

    res.status(201).json({
      _id: submission._id,
      id: submission._id,
      submissionId: submission._id,
      user: submission.user,
      exam: submission.exam,
      startTime: submission.startTime,
      status: submission.status
    });
  } catch (error) {
    console.error('❌ Start exam error:', error);
    res.status(500).json({ 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @route   POST /api/exam/execute
// @desc    Execute C++ code using Judge0
exports.executeCode = async (req, res) => {
  try {
    const { code, input } = req.body;

    if (!code || code.trim() === '') {
      return res.status(400).json({ 
        output: '❌ Error: No code provided',
        status: 'Error'
      });
    }

    // Check if Judge0 is configured
    if (!process.env.JUDGE0_HOST || !process.env.JUDGE0_API_KEY) {
      console.warn('⚠️ Judge0 not configured, returning mock response');
      return res.json({
        output: '// Mock output (Judge0 not configured)\nHello World!\n',
        status: 'Accepted',
        time: '0.001',
        memory: '2048'
      });
    }

    const options = {
      method: 'POST',
      url: `https://${process.env.JUDGE0_HOST}/submissions`,
      params: { base64_encoded: 'false', wait: 'true' },
      headers: {
        'content-type': 'application/json',
        'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
        'X-RapidAPI-Host': process.env.JUDGE0_HOST
      },
      data: {
        language_id: 54,
        source_code: code,
        stdin: input || ''
      }
    };

    const response = await axios.request(options);
    
    res.json({
      output: response.data.stdout || response.data.stderr || 'No output',
      status: response.data.status.description,
      time: response.data.time,
      memory: response.data.memory
    });
  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ 
      output: `❌ Execution Error: ${error.message}`,
      status: 'Error'
    });
  }
};

// @route   POST /api/exam/submit
// @desc    Submit exam
exports.submitExam = async (req, res) => {
  try {
    const { submissionId, answers, violations, timeTaken, recordings } = req.body;

    console.log('📤 Submitting exam:', submissionId);

    const submission = await Submission.findById(submissionId).populate('exam');
    
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    if (submission.status === 'submitted') {
      return res.status(400).json({ message: 'Exam already submitted' });
    }

    // Calculate score
    let score = 0;
    const exam = submission.exam;
    
    if (exam) {
      answers.forEach(answer => {
        const question = exam.questions.find(q => q.questionNumber === answer.questionNumber);
        if (question && answer.isCorrect) {
          score += question.points;
        }
      });
    }

    // Update submission
    submission.answers = answers;
    submission.violations = violations || [];
    submission.score = score;
    submission.totalPoints = exam.questions.reduce((sum, q) => sum + q.points, 0);
    submission.timeTaken = timeTaken;
    submission.endTime = new Date();
    submission.status = violations.length > 5 ? 'flagged' : 'submitted';
    
    // Store recording URLs from Cloudinary
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
        label: recordings.label || 'unlabeled',
        message: recordings.message
      };
    }

    await submission.save();

    console.log('✅ Exam submitted successfully');

    res.json({
      _id: submission._id,
      score: submission.score,
      totalPoints: submission.totalPoints,
      status: submission.status,
      timeTaken: submission.timeTaken,
      violations: submission.violations,
      answers: submission.answers,
      recordings: submission.recordings
    });
  } catch (error) {
    console.error('❌ Submit exam error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/exam/upload-video
// @desc    Upload video recording to Cloudinary
exports.uploadVideo = async (req, res) => {
  try {
    const { submissionId, videoType, videoData } = req.body;

    const submission = await Submission.findById(submissionId);
    
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    console.log(`📹 Received ${videoType} video for submission:`, submissionId);

    if (videoType === 'camera') {
      submission.recordings = submission.recordings || {};
      submission.recordings.webcam = videoData || 'pending_upload';
    } else if (videoType === 'screen') {
      submission.recordings = submission.recordings || {};
      submission.recordings.screen = videoData || 'pending_upload';
    }

    await submission.save();

    res.json({ 
      message: 'Video uploaded successfully',
      videoType,
      submissionId
    });
  } catch (error) {
    console.error('Video upload error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/exam/label
// @desc    Label a submission for ML training
exports.labelSubmission = async (req, res) => {
  try {
    const { submissionId, sessionId, label, cheatingType, notes, userId } = req.body;
    
    console.log('🏷️ Labeling submission:', submissionId);
    
    const submission = await Submission.findById(submissionId);
    
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }
    
    // Update label metadata
    submission.recordings = submission.recordings || {};
    submission.recordings.label = label;
    submission.recordings.cheatingType = cheatingType || null;
    submission.recordings.notes = notes || '';
    submission.recordings.labeledAt = new Date();
    submission.recordings.labeledBy = userId;
    
    await submission.save();
    
    console.log('✅ Label saved:', label);
    
    res.json({ 
      success: true, 
      message: 'Label saved successfully',
      submission: {
        _id: submission._id,
        recordings: submission.recordings
      }
    });
  } catch (error) {
    console.error('❌ Error saving label:', error);
    res.status(500).json({ message: error.message });
  }
};