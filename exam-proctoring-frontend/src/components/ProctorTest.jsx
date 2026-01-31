import React, { useEffect, useState, useRef } from 'react';
import ProctorService from '../services/ProctorService';

const ProctorTest = ({ onBack }) => {
  const [isProctoring, setIsProctoring] = useState(false);
  const [violations, setViolations] = useState([]);
  const [status, setStatus] = useState('Not Started');
  const videoRef = useRef(null);

  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        setStatus('Camera Ready');
      } catch (error) {
        console.error('Camera error:', error);
        setStatus('Camera Error');
      }
    };

    initCamera();

    const handleViolation = (event) => {
      setViolations(prev => [...prev, event.detail]);
    };
    
    window.addEventListener('proctorViolation', handleViolation);

    return () => {
      window.removeEventListener('proctorViolation', handleViolation);
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      ProctorService.disconnect();
    };
  }, []);

  const startTest = async () => {
    try {
      ProctorService.connect();
      await ProctorService.startProctoring('test-student-123', 'test-exam-456');
      setIsProctoring(true);
      setStatus('Proctoring Active');
    } catch (error) {
      console.error('Failed to start:', error);
      setStatus('Error Starting');
    }
  };

  const endTest = async () => {
    try {
      const report = await ProctorService.endProctoring();
      setIsProctoring(false);
      setStatus('Proctoring Ended');
      console.log('Final Report:', report);
      alert(`Proctoring ended!\nTotal violations: ${report.report.totalViolations}\nRisk Level: ${report.report.riskLevel}`);
    } catch (error) {
      console.error('Failed to end:', error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial', maxWidth: '1200px', margin: '0 auto' }}>
      {onBack && (
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            marginBottom: '20px',
            backgroundColor: '#666',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ← Back to Login
        </button>
      )}

      <h1>🎥 Exam Proctor Test</h1>
      
      <div style={{ 
        marginBottom: '20px', 
        padding: '15px', 
        backgroundColor: '#f0f0f0', 
        borderRadius: '8px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <strong>Status:</strong> 
          <span style={{ 
            marginLeft: '10px',
            padding: '4px 12px',
            borderRadius: '4px',
            backgroundColor: status === 'Proctoring Active' ? '#4CAF50' : 
                           status === 'Camera Ready' ? '#2196F3' : 
                           status === 'Camera Error' ? '#f44336' : '#999',
            color: 'white'
          }}>
            {status}
          </span>
        </div>
        <div>
          <strong>Violations:</strong> <span style={{ fontSize: '20px', marginLeft: '10px' }}>{violations.length}</span>
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <video
          ref={videoRef}
          id="exam-camera"
          autoPlay
          muted
          style={{
            width: '100%',
            maxWidth: '640px',
            height: 'auto',
            border: '3px solid #333',
            borderRadius: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
        />
      </div>

      <div style={{ marginBottom: '30px' }}>
        <button
          onClick={startTest}
          disabled={isProctoring}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            marginRight: '10px',
            backgroundColor: isProctoring ? '#ccc' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isProctoring ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isProctoring ? '✓ Proctoring Active' : 'Start Proctoring'}
        </button>

        <button
          onClick={endTest}
          disabled={!isProctoring}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            backgroundColor: !isProctoring ? '#ccc' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: !isProctoring ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          End Proctoring
        </button>
      </div>

      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '8px', 
        padding: '20px',
        backgroundColor: 'white'
      }}>
        <h3 style={{ marginTop: 0 }}>⚠️ Violations Log ({violations.length})</h3>
        <div style={{ 
          maxHeight: '300px', 
          overflowY: 'auto', 
          border: '1px solid #eee', 
          padding: '10px',
          borderRadius: '4px'
        }}>
          {violations.length === 0 ? (
            <p style={{ color: '#999', textAlign: 'center' }}>No violations detected yet...</p>
          ) : (
            violations.map((v, i) => (
              <div 
                key={i} 
                style={{ 
                  marginBottom: '12px', 
                  padding: '12px', 
                  backgroundColor: v.violations[0].severity === 'CRITICAL' ? '#ffebee' :
                                 v.violations[0].severity === 'HIGH' ? '#fff3e0' :
                                 v.violations[0].severity === 'MEDIUM' ? '#fff9c4' : '#f1f8e9',
                  borderLeft: `4px solid ${
                    v.violations[0].severity === 'CRITICAL' ? '#f44336' :
                    v.violations[0].severity === 'HIGH' ? '#ff9800' :
                    v.violations[0].severity === 'MEDIUM' ? '#fbc02d' : '#8bc34a'
                  }`,
                  borderRadius: '4px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <strong style={{ color: '#333' }}>{v.violations[0].type}</strong>
                  <span style={{ 
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '3px',
                    backgroundColor: v.violations[0].severity === 'CRITICAL' ? '#f44336' :
                                   v.violations[0].severity === 'HIGH' ? '#ff9800' :
                                   v.violations[0].severity === 'MEDIUM' ? '#fbc02d' : '#8bc34a',
                    color: 'white'
                  }}>
                    {v.violations[0].severity}
                  </span>
                </div>
                <div style={{ fontSize: '14px', color: '#666' }}>{v.violations[0].details}</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '5px' }}>
                  {new Date(v.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '8px',
        fontSize: '14px'
      }}>
        <strong>💡 Testing Tips:</strong>
        <ul style={{ marginTop: '10px', marginBottom: 0 }}>
          <li>Cover your face to trigger "NO_FACE_DETECTED"</li>
          <li>Have someone appear behind you for "MULTIPLE_PERSONS"</li>
          <li>Move your hands rapidly for "SUSPICIOUS_HAND_MOVEMENT"</li>
          <li>Look at Python terminal to see real-time frame processing</li>
        </ul>
      </div>
    </div>
  );
};

export default ProctorTest;