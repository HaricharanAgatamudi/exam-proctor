const express = require('express');
const router = express.Router();
const ProctorReport = require('../models/ProctorReport');

// Start proctoring session
router.post('/start', async (req, res) => {
  try {
    const { studentId, examId } = req.body;
    
    console.log('🎬 Creating proctor session for:', studentId);
    
    const report = new ProctorReport({
      studentId,
      examId,
      startTime: new Date(),
      status: 'active',
      violations: []
    });
    
    await report.save();
    
    console.log('✅ Session created:', report._id);
    res.json({ success: true, sessionId: report._id });
  } catch (error) {
    console.error('❌ Error starting proctoring:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save violation in real-time
router.post('/violation', async (req, res) => {
  try {
    const { sessionId, violation } = req.body;
    
    console.log('⚠️ Saving violation for session:', sessionId);
    
    await ProctorReport.findByIdAndUpdate(
      sessionId,
      { $push: { violations: violation } }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error saving violation:', error);
    res.status(500).json({ error: error.message });
  }
});

// End proctoring and save final report
router.post('/end', async (req, res) => {
  try {
    const { sessionId, finalReport } = req.body;
    
    console.log('🏁 Ending session:', sessionId);
    
    await ProctorReport.findByIdAndUpdate(sessionId, {
      endTime: new Date(),
      status: 'completed',
      finalReport,
      riskLevel: finalReport?.riskLevel
    });
    
    console.log('✅ Session completed');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error ending proctoring:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get proctoring report
router.get('/report/:sessionId', async (req, res) => {
  try {
    const report = await ProctorReport.findById(req.params.sessionId);
    res.json(report);
  } catch (error) {
    console.error('❌ Error fetching report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all reports for a student
router.get('/student/:studentId', async (req, res) => {
  try {
    const reports = await ProctorReport.find({ 
      studentId: req.params.studentId 
    }).sort({ startTime: -1 });
    
    res.json(reports);
  } catch (error) {
    console.error('❌ Error fetching student reports:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;