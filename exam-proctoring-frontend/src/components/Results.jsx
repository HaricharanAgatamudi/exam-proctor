import React, { useState } from 'react';
import { uploadToCloudinary } from '../config/cloudinary';
import '../styles/Results.css';

// ✅ HARDCODED URL
const BACKEND_URL = 'https://exam-proctor-backend-jxrb.onrender.com';

const Results = ({ user, submission, onExit }) => {
  const [sessionLabel, setSessionLabel] = useState('unlabeled');
  const [cheatingType, setCheatingType] = useState('');
  const [notes, setNotes] = useState('');
  const [isLabeling, setIsLabeling] = useState(false);
  const [labelSaved, setLabelSaved] = useState(false);

  // Calculate metrics
  const baseScore = submission.baseScore || submission.score || 0;
  const finalScore = submission.score || 0;
  const percentage = submission.percentage || 0;
  const violationPenalty = submission.violationPenalty || 0;
  const completedQuestions = submission.answers?.length || 0;
  const totalViolations = submission.violations?.length || 0;
  const proctorReport = submission.proctorReport || {};
  const penaltyBreakdown = submission.penaltyBreakdown || [];
  
  const getGrade = (percent) => {
    if (percent >= 90) return { grade: 'A+', color: '#22c55e' };
    if (percent >= 80) return { grade: 'A', color: '#3b82f6' };
    if (percent >= 70) return { grade: 'B', color: '#8b5cf6' };
    if (percent >= 60) return { grade: 'C', color: '#f59e0b' };
    return { grade: 'F', color: '#ef4444' };
  };

  const gradeInfo = getGrade(percentage);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatViolationType = (type) => {
    return type.replace(/_/g, ' ').split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getRiskLevelColor = (level) => {
    switch(level) {
      case 'LOW_RISK': return '#22c55e';
      case 'MEDIUM_RISK': return '#f59e0b';
      case 'HIGH_RISK': return '#ef4444';
      default: return '#64748b';
    }
  };

  // Save label to Cloudinary
const handleSaveLabel = async () => {
  if (sessionLabel === 'unlabeled') {
    alert('Please select a label (Genuine or Cheating)');
    return;
  }

  if (sessionLabel === 'cheating' && !cheatingType) {
    alert('Please specify the type of cheating');
    return;
  }

  setIsLabeling(true);

  try {
    // ✅ SAVE TO BACKEND FIRST
    const response = await fetch(`${BACKEND_URL}/api/exams/label`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        submissionId: submission._id,
        label: sessionLabel,
        cheatingType: sessionLabel === 'cheating' ? cheatingType : null,
        notes,
        labeledBy: user.name
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save label to backend');
    }

    const result = await response.json();
    console.log('✅ Label saved to backend:', result);

    // ✅ THEN SAVE TO CLOUDINARY (for training data)
    const sessionId = submission.recordings?.sessionId;
    if (sessionId) {
      const labelData = {
        sessionId,
        userId: user.rollNo,
        label: sessionLabel,
        cheatingType: sessionLabel === 'cheating' ? cheatingType : null,
        notes,
        labeledAt: Date.now(),
        labeledBy: user.name,
        submissionScore: submission.score,
        violations: submission.violations?.length || 0,
        proctorRiskLevel: submission.proctorReport?.riskLevel || 'UNKNOWN'
      };

      const labelBlob = new Blob([JSON.stringify(labelData, null, 2)], {
        type: 'application/json'
      });

      const folder = `exam-recordings/${user.rollNo}/${sessionId}`;
      
      await uploadToCloudinary(
        labelBlob,
        'label.json',
        folder,
        'raw'
      );

      console.log('✅ Label saved to Cloudinary');
    }

    setLabelSaved(true);
    alert('Label saved successfully! ✅\n\nData saved to:\n- Database (for queries)\n- Cloudinary (for ML training)');

  } catch (error) {
    console.error('❌ Error saving label:', error);
    alert('Failed to save label: ' + error.message);
  } finally {
    setIsLabeling(false);
  }
};

  return (
    <div className="results-container">
      <div className="results-content">
        {/* Success Header */}
        <div className="results-header">
          <div className="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h1>Exam Completed!</h1>
          <p>Congratulations, <strong>{user.name}</strong>! Your exam has been submitted and analyzed.</p>
        </div>

        {/* Score Card */}
        <div className="score-card">
          <div className="score-display">
            <div className="score-circle" style={{ '--grade-color': gradeInfo.color }}>
              <div className="score-inner">
                <div className="percentage">{percentage}%</div>
                <div className="grade" style={{ color: gradeInfo.color }}>{gradeInfo.grade}</div>
              </div>
            </div>
            <div className="score-details">
              <div className="score-stat">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
                  </svg>
                </div>
                <div>
                  <div className="stat-value">{completedQuestions}</div>
                  <div className="stat-label">Questions Completed</div>
                </div>
              </div>
              
              <div className="score-stat">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"></path>
                  </svg>
                </div>
                <div>
                  <div className="stat-value">{finalScore}/{submission.totalPoints || 0}</div>
                  <div className="stat-label">Points Earned</div>
                </div>
              </div>

              <div className="score-stat">
                <div className="stat-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
                <div>
                  <div className="stat-value">{formatTime(submission.timeTaken || 0)}</div>
                  <div className="stat-label">Time Taken</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PENALTY BREAKDOWN */}
        {violationPenalty > 0 && (
          <div className="report-section">
            <h2 className="section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
              </svg>
              Score Deduction Breakdown
            </h2>

            <div className="report-card">
              {/* Score Flow Visual */}
              <div style={{
                background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                border: '2px solid #fecaca',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '20px',
                  gap: '20px'
                }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', color: '#991b1b', marginBottom: '8px', fontWeight: '600' }}>
                      Base Score
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#059669' }}>
                      {baseScore.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      From {completedQuestions} questions
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '48px', color: '#dc2626', lineHeight: 1 }}>
                    −
                  </div>
                  
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', color: '#991b1b', marginBottom: '8px', fontWeight: '600' }}>
                      Penalties
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#dc2626' }}>
                      {violationPenalty.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      From {totalViolations} violations
                    </div>
                  </div>
                  
                  <div style={{ fontSize: '48px', color: '#3b82f6', lineHeight: 1 }}>
                    =
                  </div>
                  
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', color: '#991b1b', marginBottom: '8px', fontWeight: '600' }}>
                      Final Score
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#1e40af' }}>
                      {finalScore.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      {percentage}% overall
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Penalty Breakdown */}
              {penaltyBreakdown && penaltyBreakdown.length > 0 && (
                <>
                  <h3 style={{ 
                    fontSize: '16px', 
                    fontWeight: '600', 
                    marginBottom: '16px',
                    color: '#0f172a'
                  }}>
                    Detailed Penalty Breakdown
                  </h3>
                  
                  {penaltyBreakdown.map((item, idx) => (
                    <div key={idx} style={{
                      padding: '16px',
                      background: item.maxReached ? '#fee2e2' : '#fef3c7',
                      border: `2px solid ${item.maxReached ? '#fecaca' : '#fde68a'}`,
                      borderLeft: `4px solid ${item.maxReached ? '#dc2626' : '#f59e0b'}`,
                      borderRadius: '8px',
                      marginBottom: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontWeight: '600', 
                          color: '#0f172a', 
                          marginBottom: '6px',
                          fontSize: '15px'
                        }}>
                          {formatViolationType(item.type)}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b' }}>
                          {item.count} occurrence{item.count > 1 ? 's' : ''}
                          {item.maxReached && (
                            <span style={{ 
                              marginLeft: '8px', 
                              color: '#dc2626',
                              fontWeight: '600'
                            }}>
                              • Maximum penalty reached
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: item.maxReached ? '#dc2626' : '#d97706',
                        minWidth: '80px',
                        textAlign: 'right'
                      }}>
                        −{item.penalty} pts
                      </div>
                    </div>
                  ))}
                  
                  <div style={{
                    marginTop: '20px',
                    padding: '16px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#475569',
                    borderLeft: '3px solid #3b82f6'
                  }}>
                    <strong style={{ color: '#1e40af' }}>📊 Smart Penalty System:</strong> First occurrence of each violation type receives full penalty. 
                    Repeated violations have progressively reduced penalties to prevent excessive deductions. 
                    Each violation type has a maximum penalty cap to ensure fair grading.
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI Proctor Analysis */}
        {proctorReport && proctorReport.riskLevel && (
          <div className="report-section">
            <h2 className="section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              AI Proctor Analysis
            </h2>

            <div className="report-card">
              <div className="proctor-summary" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div style={{
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Risk Level</div>
                  <div style={{ 
                    fontSize: '20px', 
                    fontWeight: 'bold', 
                    color: getRiskLevelColor(proctorReport.riskLevel)
                  }}>
                    {proctorReport.riskLevel?.replace('_', ' ')}
                  </div>
                </div>

                <div style={{
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Frames Analyzed</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>
                    {proctorReport.framesProcessed || 0}
                  </div>
                </div>

                <div style={{
                  padding: '16px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>AI Violations</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
                    {proctorReport.totalViolations || 0}
                  </div>
                </div>
              </div>

              {/* Violation Breakdown */}
              {proctorReport.violationBreakdown && (
                <div style={{
                  padding: '20px',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '20px'
                }}>
                  <h3 style={{ 
                    fontSize: '16px', 
                    fontWeight: '600', 
                    marginBottom: '16px',
                    color: '#0f172a'
                  }}>
                    AI Violation Detection
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: '12px'
                  }}>
                    {proctorReport.violationBreakdown.ghostTyping > 0 && (
                      <div style={{
                        padding: '12px',
                        background: '#fef2f2',
                        borderLeft: '3px solid #ef4444',
                        borderRadius: '4px'
                      }}>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626' }}>
                          {proctorReport.violationBreakdown.ghostTyping}
                        </div>
                        <div style={{ fontSize: '13px', color: '#991b1b' }}>Ghost Typing</div>
                      </div>
                    )}
                    
                    {proctorReport.violationBreakdown.noFace > 0 && (
                      <div style={{
                        padding: '12px',
                        background: '#fef3c7',
                        borderLeft: '3px solid #f59e0b',
                        borderRadius: '4px'
                      }}>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706' }}>
                          {proctorReport.violationBreakdown.noFace}
                        </div>
                        <div style={{ fontSize: '13px', color: '#92400e' }}>No Face Detected</div>
                      </div>
                    )}
                    
                    {proctorReport.violationBreakdown.multiplePersons > 0 && (
                      <div style={{
                        padding: '12px',
                        background: '#fee2e2',
                        borderLeft: '3px solid #dc2626',
                        borderRadius: '4px'
                      }}>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#b91c1c' }}>
                          {proctorReport.violationBreakdown.multiplePersons}
                        </div>
                        <div style={{ fontSize: '13px', color: '#7f1d1d' }}>Multiple Persons</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Question-by-Question Breakdown */}
        {submission.answers && submission.answers.length > 0 && (
          <div className="report-section">
            <h2 className="section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
              Answer Breakdown
            </h2>

            <div className="report-card">
              {submission.answers.map((answer, idx) => (
                <div key={idx} style={{
                  padding: '16px',
                  marginBottom: '12px',
                  background: answer.isCorrect ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${answer.isCorrect ? '#86efac' : '#fecaca'}`,
                  borderRadius: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <strong style={{ color: '#0f172a' }}>Question {answer.questionNumber}</strong>
                    <div style={{
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: '600',
                      background: answer.isCorrect ? '#22c55e' : answer.pointsEarned > 0 ? '#f59e0b' : '#ef4444',
                      color: 'white'
                    }}>
                      {answer.pointsEarned || 0} / {answer.pointsPossible || 0} pts
                    </div>
                  </div>
                  {answer.output && (
                    <pre style={{
                      fontSize: '12px',
                      color: '#475569',
                      background: 'white',
                      padding: '8px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '100px'
                    }}>
                      {answer.output}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Traditional Violations Report */}
        <div className="report-section">
          <h2 className="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            Session Monitoring Report
          </h2>

          <div className="report-card">
            <div className="violations-summary">
              <div className="summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div>
                <div className="summary-count" style={{ color: totalViolations === 0 ? '#22c55e' : '#ef4444' }}>
                  {totalViolations}
                </div>
                <div className="summary-label">Total Violations</div>
              </div>
              <div className={`status-badge ${totalViolations === 0 ? 'clean' : 'flagged'}`}>
                {totalViolations === 0 ? 'Clean Exam' : submission.status === 'flagged' ? 'Flagged for Review' : 'Under Review'}
              </div>
            </div>

            {totalViolations === 0 ? (
              <div className="no-violations-message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <h3>Perfect! No Violations Detected</h3>
                <p>You followed all exam guidelines throughout the session.</p>
              </div>
            ) : (
              <div className="violations-list-results">
                {submission.violations.map((v, idx) => (
                  <div key={idx} className="violation-item-result">
                    <div className="violation-header">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      <div className="violation-type-result">
                        {formatViolationType(v.type)}
                      </div>
                      <div className="violation-time-result">
                        {new Date(v.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    {v.description && (
                      <div className="violation-description">
                        {v.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DATA LABELING SECTION */}
        {submission.recordings && (
          <div className="labeling-section">
            <div className="section-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <h2>Label This Session for AI Training</h2>
            </div>

            <div className="labeling-card">
              <p className="labeling-description">
                Help improve the ghost typing detection system by labeling this session. Your labels will train the AI model to become more accurate.
              </p>

              <div className="label-options">
                <div className="label-group">
                  <label className="label-title">Session Type *</label>
                  <div className="radio-group">
                    <label className={`radio-option ${sessionLabel === 'genuine' ? 'selected' : ''}`}>
                      <input 
                        type="radio" 
                        name="label" 
                        value="genuine"
                        checked={sessionLabel === 'genuine'}
                        onChange={(e) => setSessionLabel(e.target.value)}
                        disabled={labelSaved}
                      />
                      <div className="radio-content">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                          <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        <div>
                          <strong>Genuine</strong>
                          <span>Completed honestly</span>
                        </div>
                      </div>
                    </label>

                    <label className={`radio-option ${sessionLabel === 'cheating' ? 'selected' : ''}`}>
                      <input 
                        type="radio" 
                        name="label" 
                        value="cheating"
                        checked={sessionLabel === 'cheating'}
                        onChange={(e) => setSessionLabel(e.target.value)}
                        disabled={labelSaved}
                      />
                      <div className="radio-content">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"></path>
                        </svg>
                        <div>
                          <strong>Cheating</strong>
                          <span>Suspicious activity</span>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {sessionLabel === 'cheating' && (
                  <div className="label-group">
                    <label className="label-title">Type of Cheating *</label>
                    <select 
                      value={cheatingType}
                      onChange={(e) => setCheatingType(e.target.value)}
                      className="select-input"
                      disabled={labelSaved}
                    >
                      <option value="">Select type...</option>
                      <option value="ghost_typing">Ghost Typing (Remote/Dictation)</option>
                      <option value="phone_usage">Phone/Device Usage</option>
                      <option value="copy_paste">Copy-Paste from Sources</option>
                      <option value="notes_usage">Physical Notes Off-Screen</option>
                      <option value="tab_switching">Tab Switching</option>
                      <option value="multiple_persons">Multiple People Present</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                )}

                <div className="label-group">
                  <label className="label-title">Notes (Optional)</label>
                  <textarea 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any observations..."
                    className="textarea-input"
                    rows="3"
                    disabled={labelSaved}
                  />
                </div>
              </div>

              {!labelSaved ? (
                <button 
                  onClick={handleSaveLabel}
                  disabled={isLabeling || sessionLabel === 'unlabeled'}
                  className="save-label-button"
                >
                  {isLabeling ? (
                    <>
                      <div className="spinner-small"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"></path>
                      </svg>
                      Save Label
                    </>
                  )}
                </button>
              ) : (
                <div className="label-saved-message">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                  <div>
                    <strong>Label Saved!</strong>
                    <p>Added to training dataset as <strong>{sessionLabel}</strong></p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Exit Button */}
        <button onClick={onExit} className="exit-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Exit Exam Portal
        </button>
      </div>
    </div>
  );
};

export default Results;