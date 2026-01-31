import React, { useState, useEffect, useRef } from 'react';
import recordingManager from '../utils/recordingManager';
import ProctorService from '../services/ProctorService';
import '../styles/Exam.css';

const ExamPage = ({ user, token, streams, onExamComplete }) => {
  const [exam, setExam] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [submissionId, setSubmissionId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(3600);
  const [violations, setViolations] = useState([]);
  const [proctorViolations, setProctorViolations] = useState([]);
  const [faceDetected, setFaceDetected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyPressCount, setKeyPressCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState('Not started');
  const [proctorStatus, setProctorStatus] = useState('Not started');
  const [proctorSessionId, setProctorSessionId] = useState(null);
  
  const keyboardActivityRef = useRef({ count: 0, lastActivity: Date.now() });
  const { cameraStream, screenStream } = streams;
  const recordingInitialized = useRef(false);
  const proctorInitialized = useRef(false);

  // Initialize recording ONCE on mount
  useEffect(() => {
    const initSystems = async () => {
      if (user && screenStream && !recordingInitialized.current) {
        recordingInitialized.current = true;
        
        console.log('🎬 Initializing recording system...');
        console.log('👤 User:', user);
        setRecordingStatus('Initializing...');
        
        try {
          // Start recording
          recordingManager.initSession(user.rollNo, 'exam_session');
          await recordingManager.startRecording(cameraStream, screenStream);
          console.log('✅ Recording started');
          setRecordingStatus('Recording active');
        } catch (err) {
          console.error('❌ Recording initialization failed:', err);
          setRecordingStatus('Failed: ' + err.message);
        }
      }
    };

    initSystems();

    // Listen for proctor violations
    const handleProctorViolation = (event) => {
      console.log('⚠️ Proctor violation:', event.detail);
      setProctorViolations(prev => [...prev, ...event.detail.violations]);
      
      // Update face detection status
      const violation = event.detail.violations[0];
      if (violation && violation.type === 'NO_FACE_DETECTED') {
        setFaceDetected(false);
        setTimeout(() => setFaceDetected(true), 3000);
      }
    };

    window.addEventListener('proctorViolation', handleProctorViolation);

    return () => {
      window.removeEventListener('proctorViolation', handleProctorViolation);
      
      if (recordingManager.isRecording) {
        recordingManager.stopRecording().catch(console.error);
      }
      
      if (ProctorService.isProctoring) {
        ProctorService.endProctoring().catch(console.error);
        ProctorService.disconnect();
      }
    };
  }, [user, screenStream, cameraStream]);

  // Fetch exam on mount
  useEffect(() => {
    fetchExam();
  }, []);

  const fetchExam = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/api/exams/active', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch exam');
      }

      const examData = await response.json();
      console.log('✅ Exam loaded:', examData);
      
      setExam(examData);
      setTimeRemaining(examData.duration * 60);
      
      // Create submission
      const subResponse = await fetch('http://localhost:5000/api/exams/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`  
        }
      });

      if (!subResponse.ok) {
        throw new Error('Failed to start exam');
      }

      const subData = await subResponse.json();
      const idFromServer = subData._id || subData.id || subData.submissionId;

      if (!idFromServer) {
        throw new Error('Failed to start exam: no submission id returned');
      }

      console.log('✅ Submission created:', idFromServer);
      setSubmission(subData);
      setSubmissionId(idFromServer);
      
      // ✅ START PROCTORING - FIXED VERSION
      if (!proctorInitialized.current && user) {
        proctorInitialized.current = true;
        
        // Wait for DOM to be fully ready with video elements
        setTimeout(async () => {
          try {
            console.log('🎬 Initializing proctor system...');
            setProctorStatus('Connecting...');
            
            ProctorService.connect();
            
            // ✅ CRITICAL FIX: Use ANY available identifier with priority fallback
            console.log('🔍 DEBUGGING USER OBJECT:');
            console.log('Full user object:', JSON.stringify(user, null, 2));
            console.log('Available keys:', Object.keys(user));
            
            // Priority: rollNo > _id > id > email > name
            let studentId = user.rollNo || 
                           user._id || 
                           user.id || 
                           user.email || 
                           user.name ||
                           subData?.user ||
                           'unknown-student';
            
            console.log('👤 User object:', user);
            console.log('📄 Submission data:', subData);
            console.log('🎬 Starting proctor with:');
            console.log('   studentId:', studentId);
            console.log('   studentId source:', user.rollNo ? 'rollNo' : user._id ? '_id' : user.id ? 'id' : user.email ? 'email' : 'fallback');
            console.log('   examId:', examData._id);
            
            // Validate studentId
            if (!studentId || studentId === 'unknown-student') {
              console.error('❌ Could not determine student identifier');
              throw new Error('Could not determine valid student identifier from user data');
            }
            
            const sessionId = await ProctorService.startProctoring(
              String(studentId),
              String(examData._id || examData.id)
            );
            
            setProctorSessionId(sessionId);
            setProctorStatus('Proctoring active');
            console.log('✅ Proctoring started with session:', sessionId);
          } catch (err) {
            console.error('❌ Proctor start failed:', err);
            setProctorStatus('Failed: ' + err.message);
            // Don't throw - allow exam to continue without proctoring
          }
        }, 2500); // 2.5 second delay for DOM readiness
      }
      
      // Initialize answers object
      const initialAnswers = {};
      examData.questions.forEach(q => {
        initialAnswers[q.questionNumber] = {
          questionNumber: q.questionNumber,
          code: q.starterCode || '',
          output: '',
          isCorrect: false
        };
      });
      setAnswers(initialAnswers);
      
      if (examData.questions.length > 0) {
        setCode(examData.questions[0].starterCode || '');
      }
      
    } catch (error) {
      console.error('❌ Error in fetchExam:', error);
      alert('Failed to load exam: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Load code when question changes
  useEffect(() => {
    if (exam && exam.questions[currentQuestion]) {
      const currentQ = exam.questions[currentQuestion];
      const savedAnswer = answers[currentQ.questionNumber];
      
      if (savedAnswer) {
        setCode(savedAnswer.code || currentQ.starterCode || '');
        setOutput(savedAnswer.output || '');
      } else {
        setCode(currentQ.starterCode || '');
        setOutput('');
      }
    }
  }, [currentQuestion, exam, answers]);

  // Timer countdown
  useEffect(() => {
    if (!loading && timeRemaining > 0 && !isSubmitting) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleFinishExam();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [loading, timeRemaining, isSubmitting]);

  // Monitor keyboard activity
  useEffect(() => {
    if (isSubmitting) return;

    const interval = setInterval(() => {
      const { count } = keyboardActivityRef.current;
      recordingManager.logKeyboardActivity(count, code.length);
      keyboardActivityRef.current.count = 0;
    }, 1000);

    return () => clearInterval(interval);
  }, [isSubmitting, code]);

  // Tab switching detection
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && !isSubmitting) {
        addViolation('tab_switch', 'User switched to another tab or window');
        recordingManager.logViolation('tab_switch', 'User switched tabs');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isSubmitting]);

  // Monitor screen sharing
  useEffect(() => {
    if (screenStream && !isSubmitting) {
      const videoTrack = screenStream.getVideoTracks()[0];
      
      const handleEnded = () => {
        addViolation('screen_stopped', 'User stopped sharing screen');
        recordingManager.logViolation('screen_stopped', 'Screen sharing stopped');
      };
      
      videoTrack.addEventListener('ended', handleEnded);
      
      return () => {
        videoTrack.removeEventListener('ended', handleEnded);
      };
    }
  }, [screenStream, isSubmitting]);

  const addViolation = (type, description) => {
    const newViolation = {
      type,
      timestamp: new Date(),
      description
    };
    setViolations(prev => [...prev, newViolation]);
  };

  const handleCodeChange = (e) => {
    const newCode = e.target.value;
    const oldCode = code;
    setCode(newCode);
    
    const timestamp = Date.now();
    const addedChars = newCode.length - oldCode.length;
    
    if (addedChars !== 0) {
      recordingManager.logKeystroke(
        addedChars > 0 ? 'add' : 'delete',
        newCode.length,
        timestamp
      );
    }
    
    keyboardActivityRef.current.count++;
    keyboardActivityRef.current.lastActivity = timestamp;
    setKeyPressCount(prev => prev + 1);
  };

  const runCode = async () => {
    setIsRunning(true);
    setOutput('⏳ Compiling and running...\n');

    try {
      const response = await fetch('http://localhost:5000/api/exams/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code, input: '' })
      });

      if (!response.ok) {
        throw new Error('Code execution failed');
      }

      const data = await response.json();
      
      let outputText = '';
      if (data.output) outputText += `📤 Output:\n${data.output}\n`;
      if (data.status) outputText += `\n✅ Status: ${data.status}\n`;
      if (data.time) outputText += `⏱️  Time: ${data.time}s\n`;
      if (data.memory) outputText += `💾 Memory: ${data.memory} KB\n`;
      
      const finalOutput = outputText || 'No output received';
      setOutput(finalOutput);
      saveCurrentAnswer(code, finalOutput);
    } catch (error) {
      const errorOutput = `❌ Error: ${error.message}`;
      setOutput(errorOutput);
      saveCurrentAnswer(code, errorOutput);
    }
    
    setIsRunning(false);
  };

  const saveCurrentAnswer = (currentCode = code, currentOutput = output) => {
    if (exam && exam.questions[currentQuestion]) {
      const question = exam.questions[currentQuestion];
      setAnswers(prev => ({ 
        ...prev, 
        [question.questionNumber]: { 
          questionNumber: question.questionNumber,
          code: currentCode, 
          output: currentOutput,
          isCorrect: false
        } 
      }));
    }
  };

  const saveAnswer = () => {
    saveCurrentAnswer();
  };

  const previousQuestion = () => {
    if (currentQuestion > 0) {
      saveAnswer();
      setCurrentQuestion(prev => prev - 1);
    }
  };

  const nextQuestion = () => {
    saveAnswer();
    
    if (exam && currentQuestion === exam.questions.length - 1) {
      handleFinishExam();
    } else {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const goToQuestion = (index) => {
    saveAnswer();
    setCurrentQuestion(index);
  };

  const handleFinishExam = async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setIsUploading(true);
    saveAnswer();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      if (!submissionId) {
        throw new Error('No submission ID found');
      }

      // Stop recording
      console.log('🛑 Stopping recording...');
      await recordingManager.stopRecording();

      // End proctoring and get report
      console.log('🛑 Ending proctoring...');
      const proctorReport = await ProctorService.endProctoring();
      console.log('📊 Proctor report:', proctorReport);

      // Upload recordings
      console.log('☁️ Uploading recordings...');
      setRecordingStatus('Uploading to cloud...');
      
      const uploadResult = await recordingManager.uploadRecordings(
        user.rollNo,
        exam._id,
        'unlabeled'
      );

      console.log('✅ Upload complete:', uploadResult);
      setRecordingStatus('Upload complete');

      const timeTaken = exam.duration * 60 - timeRemaining;
      const answersArray = Object.values(answers).filter(ans => 
        ans.questionNumber !== undefined
      );

      // Combine all violations
      const allViolations = [
        ...violations,
        ...(proctorReport?.report?.violations || [])
      ];

      console.log('📤 Submitting exam with proctor data...');
      const response = await fetch('http://localhost:5000/api/exams/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          submissionId: submissionId,
          answers: answersArray,
          violations: allViolations,
          timeTaken: timeTaken,
          recordings: uploadResult,
          proctorReport: proctorReport?.report || null,
          proctorSessionId: proctorSessionId
        })
      });

      const responseData = await response.json();
      console.log('✅ Submit response:', responseData);

      if (!response.ok) {
        throw new Error(responseData.message || 'Failed to submit exam');
      }
      
      // Stop streams
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }

      recordingManager.cleanup();
      ProctorService.disconnect();

      alert('Exam submitted successfully!');
      onExamComplete({ 
        ...responseData, 
        recordings: uploadResult,
        proctorReport: proctorReport?.report
      });
    } catch (error) {
      console.error('❌ Error submitting exam:', error);
      setRecordingStatus('Error: ' + error.message);
      alert('Failed to submit exam: ' + error.message);
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0f172a',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div className="loading-spinner"></div>
          <p style={{ marginTop: '20px', fontSize: '18px' }}>Loading exam...</p>
        </div>
      </div>
    );
  }

  if (!exam || !exam.questions || exam.questions.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0f172a',
        padding: '20px'
      }}>
        <div style={{
          background: '#1e293b',
          padding: '40px',
          borderRadius: '12px',
          textAlign: 'center',
          maxWidth: '600px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
          <h2 style={{ color: '#ef4444', marginBottom: '16px' }}>Failed to Load Exam</h2>
          <button 
            onClick={() => window.location.reload()}
            style={{
              background: '#3b82f6',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer'
            }}
          > 
            🔄 Retry
          </button>
        </div>
      </div>
    );
  }

  const currentQ = exam.questions[currentQuestion];
  const answeredCount = Object.values(answers).filter(ans => 
    ans.code && ans.code.trim() !== (currentQ.starterCode || '').trim()
  ).length;

  const totalViolations = violations.length + proctorViolations.length;

  return (
    <div className="exam-container">
      {/* ✅ HIDDEN VIDEO ELEMENTS FOR PROCTORING */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <video 
          id="exam-camera" 
          autoPlay 
          playsInline 
          muted
          ref={(el) => {
            if (el && cameraStream && !el.srcObject) {
              el.srcObject = cameraStream;
              el.play().catch(err => console.error('Camera play error:', err));
            }
          }}
          style={{ width: '320px', height: '240px' }}
        />
        <video 
          id="exam-screen" 
          autoPlay 
          playsInline 
          muted
          ref={(el) => {
            if (el && screenStream && !el.srcObject) {
              el.srcObject = screenStream;
              el.play().catch(err => console.error('Screen play error:', err));
            }
          }}
          style={{ width: '640px', height: '480px' }}
        />
      </div>

      {isUploading && (
        <div className="upload-overlay">
          <div className="upload-modal">
            <div className="loading-spinner"></div>
            <h2>Processing Exam Submission...</h2>
            <p>Uploading recordings and analyzing proctor data</p>
            <p style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>
              {recordingStatus}
            </p>
          </div>
        </div>
      )}

      <header className="exam-header">
        <div className="header-content">
          <div className="header-left">
            <h1>AI Proctored Coding Exam</h1>
            <p className="student-info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              {user.name} ({user.rollNo})
            </p>
          </div>
          
          <div className="header-right">
            <div className={`status-item ${faceDetected ? 'active' : 'inactive'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              <span>{faceDetected ? 'Face Detected' : 'No Face'}</span>
            </div>
            
            <div className={`status-item ${ProctorService.isProctoring ? 'active' : 'inactive'}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
              <span>{proctorStatus}</span>
            </div>
            
            <div className="timer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span className="time">{formatTime(timeRemaining)}</span>
            </div>
          </div>
        </div>
      </header>

      <div style={{
        background: '#1e293b',
        color: '#cbd5e1',
        padding: '12px 36px',
        fontSize: '13px',
        fontFamily: 'monospace',
        borderBottom: '1px solid #334155'
      }}>
        📊 Recording: {recordingStatus} | Proctor: {proctorStatus} | Violations: {totalViolations}
      </div>

      <div className="exam-content">
        <div className="main-area">
          <div className="question-section">
            <div className="question-header">
              <div className="question-number">
                Question {currentQuestion + 1} of {exam.questions.length}
              </div>
              <div className="question-meta">
                <span className="points-badge">{currentQ.points} Points</span>
                <span className="progress-badge">
                  Completed: {answeredCount}/{exam.questions.length}
                </span>
              </div>
            </div>

            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${((currentQuestion + 1) / exam.questions.length) * 100}%` }}
              ></div>
            </div>

            <h2 className="question-text">{currentQ.question}</h2>

            <div className="code-editor-section">
              <div className="editor-header">
                <div className="editor-title">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 18 22 12 16 6"></polyline>
                    <polyline points="8 6 2 12 8 18"></polyline>
                  </svg>
                  Code Editor (C++)
                </div>
                <button 
                  onClick={runCode}
                  disabled={isRunning || isSubmitting}
                  className="run-button"
                >
                  {isRunning ? (
                    <>
                      <div className="spinner-small"></div>
                      Running...
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                      </svg>
                      Run Code
                    </>
                  )}
                </button>
              </div>

              <textarea
                value={code}
                onChange={handleCodeChange}
                className="code-textarea"
                spellCheck="false"
                placeholder="Write your C++ code here..."
                disabled={isSubmitting}
              />
            </div>

            <div className="output-section">
              <div className="output-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 17 10 11 4 5"></polyline>
                  <line x1="12" y1="19" x2="20" y2="19"></line>
                </svg>
                Output Console
              </div>
              <pre className="output-content">
                {output || '// Output will appear here...'}
              </pre>
            </div>

            <div className="navigation-buttons">
              <button
                onClick={previousQuestion}
                disabled={currentQuestion === 0 || isSubmitting}
                className="nav-button prev"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Previous
              </button>

              {currentQuestion === exam.questions.length - 1 ? (
                <button
                  onClick={handleFinishExam}
                  disabled={isSubmitting}
                  className="nav-button finish"
                >
                  {isSubmitting ? (
                    <>
                      <div className="spinner-small"></div>
                      Submitting...
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      Finish Exam
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={nextQuestion}
                  disabled={isSubmitting}
                  className="nav-button next"
                >
                  Next
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="sidebar">
          <div className="sidebar-card">
            <h3 className="sidebar-title">Question Navigator</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Completed:</span>
                <span className="stat-value completed">{answeredCount}/{exam.questions.length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Remaining:</span>
                <span className="stat-value remaining">{exam.questions.length - answeredCount}</span>
              </div>
            </div>
            <div className="question-grid">
              {exam.questions.map((q, idx) => (
                <button
                  key={q.questionNumber}
                  onClick={() => goToQuestion(idx)}
                  disabled={isSubmitting}
                  className={`question-button ${
                    answers[q.questionNumber] && answers[q.questionNumber].code && 
                    answers[q.questionNumber].code.trim() !== (q.starterCode || '').trim() ? 'answered' : ''
                  } ${idx === currentQuestion ? 'current' : ''}`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-card violations-card">
            <h3 className="sidebar-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
              AI Violations ({totalViolations})
            </h3>
            <div className="violations-list">
              {totalViolations === 0 ? (
                <div className="no-violations">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <p>No violations</p>
                  <span>Keep it up!</span>
                </div>
              ) : (
                [...violations, ...proctorViolations].slice(-5).reverse().map((v, idx) => (
                  <div key={idx} className="violation-item">
                    <div className="violation-type">
                      {(v.type || 'UNKNOWN').replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <div className="violation-time">
                      {new Date(v.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ExamPage;