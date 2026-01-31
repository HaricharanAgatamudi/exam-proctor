import React, { useEffect, useState, useRef } from 'react';
import ProctorService from '../services/ProctorService';

const ExamProctoring = ({ studentId, examId, onExamComplete }) => {
  const [violations, setViolations] = useState([]);
  const [proctorStatus, setProctorStatus] = useState('initializing');
  const videoRef = useRef(null);

  useEffect(() => {
    // Initialize camera
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false
        });
        videoRef.current.srcObject = stream;
        
        // Connect to proctor service
        ProctorService.connect();
        
        // Start proctoring
        await ProctorService.startProctoring(studentId, examId);
        setProctorStatus('active');
      } catch (error) {
        console.error('Camera initialization failed:', error);
        setProctorStatus('error');
      }
    };

    initCamera();

    // Listen for violations
    const handleViolation = (event) => {
      setViolations(prev => [...prev, event.detail]);
    };
    window.addEventListener('proctorViolation', handleViolation);

    return () => {
      window.removeEventListener('proctorViolation', handleViolation);
      ProctorService.endProctoring();
      ProctorService.disconnect();
    };
  }, [studentId, examId]);

  const handleEndExam = async () => {
    const report = await ProctorService.endProctoring();
    onExamComplete(report);
  };

  return (
    <div className="exam-proctoring">
      <div className="camera-feed">
        <video
          ref={videoRef}
          id="exam-camera"
          autoPlay
          muted
          style={{ width: '320px', height: '240px' }}
        />
        <div className="proctor-status">
          Status: {proctorStatus}
        </div>
      </div>

      {violations.length > 0 && (
        <div className="violation-alerts">
          <h3>Warnings ({violations.length})</h3>
          {violations.slice(-3).map((v, i) => (
            <div key={i} className={`alert alert-${v.violations[0].severity.toLowerCase()}`}>
              {v.violations[0].type}: {v.violations[0].details}
            </div>
          ))}
        </div>
      )}

      {/* Your exam questions here */}
      
      <button onClick={handleEndExam} className="end-exam-btn">
        Submit Exam
      </button>
    </div>
  );
};

export default ExamProctoring;