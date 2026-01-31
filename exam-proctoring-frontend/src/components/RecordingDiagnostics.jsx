import React, { useState, useEffect } from 'react';
import recordingManager from '../utils/recordingManager';

const RecordingDiagnostics = ({ cameraStream, screenStream }) => {
  const [diagnostics, setDiagnostics] = useState({
    cameraAvailable: false,
    screenAvailable: false,
    cameraTrackState: 'unknown',
    screenTrackState: 'unknown',
    isRecording: false,
    webcamChunks: 0,
    screenChunks: 0,
    eventCount: 0,
    keystrokeCount: 0,
    sessionId: null
  });

  useEffect(() => {
    const updateDiagnostics = () => {
      const cameraTrack = cameraStream?.getVideoTracks()[0];
      const screenTrack = screenStream?.getVideoTracks()[0];

      setDiagnostics({
        cameraAvailable: !!cameraStream,
        screenAvailable: !!screenStream,
        cameraTrackState: cameraTrack?.readyState || 'none',
        screenTrackState: screenTrack?.readyState || 'none',
        isRecording: recordingManager.isRecording,
        webcamChunks: recordingManager.webcamChunks?.length || 0,
        screenChunks: recordingManager.screenChunks?.length || 0,
        eventCount: recordingManager.eventLog?.length || 0,
        keystrokeCount: recordingManager.keystrokes?.length || 0,
        sessionId: recordingManager.sessionId,
        webcamRecorderState: recordingManager.webcamRecorder?.state || 'none',
        screenRecorderState: recordingManager.screenRecorder?.state || 'none'
      });
    };

    updateDiagnostics();
    const interval = setInterval(updateDiagnostics, 1000);
    return () => clearInterval(interval);
  }, [cameraStream, screenStream]);

  const getStatusColor = (value, type = 'boolean') => {
    if (type === 'boolean') {
      return value ? '#22c55e' : '#ef4444';
    }
    if (type === 'state') {
      if (value === 'live' || value === 'recording') return '#22c55e';
      if (value === 'ended' || value === 'inactive') return '#ef4444';
      return '#f59e0b';
    }
    if (type === 'count') {
      return value > 0 ? '#22c55e' : '#ef4444';
    }
    return '#64748b';
  };

  const testRecording = async () => {
    try {
      console.log('🧪 Testing recording...');
      
      if (!recordingManager.isRecording) {
        await recordingManager.startRecording(cameraStream, screenStream);
        console.log('✅ Test recording started');
      } else {
        await recordingManager.stopRecording();
        console.log('✅ Test recording stopped');
      }
    } catch (error) {
      console.error('❌ Test recording failed:', error);
      alert('Test failed: ' + error.message);
    }
  };

  const downloadChunks = () => {
    if (recordingManager.screenChunks.length > 0) {
      const blob = new Blob(recordingManager.screenChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'screen-test.webm';
      a.click();
      URL.revokeObjectURL(url);
      console.log('✅ Downloaded screen recording');
    }
    
    if (recordingManager.webcamChunks.length > 0) {
      const blob = new Blob(recordingManager.webcamChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'webcam-test.webm';
      a.click();
      URL.revokeObjectURL(url);
      console.log('✅ Downloaded webcam recording');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      background: 'rgba(15, 23, 42, 0.95)',
      color: 'white',
      padding: '20px',
      borderRadius: '12px',
      fontSize: '12px',
      fontFamily: 'monospace',
      minWidth: '300px',
      maxHeight: '500px',
      overflowY: 'auto',
      zIndex: 10000,
      border: '2px solid #334155',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)'
    }}>
      <div style={{
        fontWeight: 'bold',
        fontSize: '14px',
        marginBottom: '12px',
        color: '#38bdf8'
      }}>
        🔍 Recording Diagnostics
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <DiagnosticItem
          label="Session ID"
          value={diagnostics.sessionId || 'Not initialized'}
          color="#38bdf8"
        />
        
        <DiagnosticItem
          label="Recording Active"
          value={diagnostics.isRecording ? 'YES' : 'NO'}
          color={getStatusColor(diagnostics.isRecording, 'boolean')}
        />

        <div style={{ height: '1px', background: '#334155', margin: '8px 0' }} />

        <DiagnosticItem
          label="Camera Stream"
          value={diagnostics.cameraAvailable ? 'Available' : 'Missing'}
          color={getStatusColor(diagnostics.cameraAvailable, 'boolean')}
        />
        
        <DiagnosticItem
          label="Camera Track"
          value={diagnostics.cameraTrackState}
          color={getStatusColor(diagnostics.cameraTrackState, 'state')}
        />
        
        <DiagnosticItem
          label="Webcam Recorder"
          value={diagnostics.webcamRecorderState}
          color={getStatusColor(diagnostics.webcamRecorderState, 'state')}
        />
        
        <DiagnosticItem
          label="Webcam Chunks"
          value={diagnostics.webcamChunks}
          color={getStatusColor(diagnostics.webcamChunks, 'count')}
        />

        <div style={{ height: '1px', background: '#334155', margin: '8px 0' }} />

        <DiagnosticItem
          label="Screen Stream"
          value={diagnostics.screenAvailable ? 'Available' : 'Missing'}
          color={getStatusColor(diagnostics.screenAvailable, 'boolean')}
        />
        
        <DiagnosticItem
          label="Screen Track"
          value={diagnostics.screenTrackState}
          color={getStatusColor(diagnostics.screenTrackState, 'state')}
        />
        
        <DiagnosticItem
          label="Screen Recorder"
          value={diagnostics.screenRecorderState}
          color={getStatusColor(diagnostics.screenRecorderState, 'state')}
        />
        
        <DiagnosticItem
          label="Screen Chunks"
          value={diagnostics.screenChunks}
          color={getStatusColor(diagnostics.screenChunks, 'count')}
        />

        <div style={{ height: '1px', background: '#334155', margin: '8px 0' }} />

        <DiagnosticItem
          label="Events Logged"
          value={diagnostics.eventCount}
          color="#38bdf8"
        />
        
        <DiagnosticItem
          label="Keystrokes"
          value={diagnostics.keystrokeCount}
          color="#38bdf8"
        />
      </div>

      <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
        <button
          onClick={testRecording}
          style={{
            flex: 1,
            padding: '8px',
            background: diagnostics.isRecording ? '#ef4444' : '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold'
          }}
        >
          {diagnostics.isRecording ? 'Stop Test' : 'Start Test'}
        </button>
        
        <button
          onClick={downloadChunks}
          disabled={diagnostics.screenChunks === 0 && diagnostics.webcamChunks === 0}
          style={{
            flex: 1,
            padding: '8px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: 'bold',
            opacity: (diagnostics.screenChunks === 0 && diagnostics.webcamChunks === 0) ? 0.5 : 1
          }}
        >
          Download
        </button>
      </div>
    </div>
  );
};

const DiagnosticItem = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ color: '#94a3b8' }}>{label}:</span>
    <span style={{ color, fontWeight: 'bold' }}>{value}</span>
  </div>
);

export default RecordingDiagnostics;