import React, { useState, useEffect, useRef } from 'react';

// Simple test component to verify recording works
const TestRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('Ready to test');
  const [webcamStream, setWebcamStream] = useState(null);
  const videoRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Start webcam
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setWebcamStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus('✅ Webcam started');
    } catch (error) {
      setStatus('❌ Webcam error: ' + error.message);
    }
  };

  // Start recording
  const startRecording = () => {
    if (!webcamStream) {
      setStatus('❌ Start webcam first!');
      return;
    }

    try {
      const recorder = new MediaRecorder(webcamStream, {
        mimeType: 'video/webm;codecs=vp9'
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log('Chunk received:', event.data.size, 'bytes');
        }
      };

      recorder.onstop = () => {
        console.log('Recording stopped, total chunks:', chunksRef.current.length);
      };

      recorder.start(1000); // Record in 1-second chunks for testing
      recorderRef.current = recorder;
      setIsRecording(true);
      setStatus('🔴 Recording...');
    } catch (error) {
      setStatus('❌ Recording error: ' + error.message);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop();
      setIsRecording(false);
      setStatus('⏹️ Recording stopped');
    }
  };

  // Test Cloudinary upload
  const testUpload = async () => {
    if (chunksRef.current.length === 0) {
      setStatus('❌ No recording data. Record something first!');
      return;
    }

    setStatus('⏳ Testing upload to Cloudinary...');

    try {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      console.log('Blob size:', blob.size, 'bytes');

      // Your Cloudinary config
      const CLOUD_NAME = 'dror3nw61';
      const UPLOAD_PRESET = 'exam_proctor_uploads';

      const formData = new FormData();
      formData.append('file', blob);
      formData.append('upload_preset', UPLOAD_PRESET);
      formData.append('folder', 'exam-proctor/test');
      formData.append('public_id', `test_${Date.now()}`);
      formData.append('resource_type', 'video');

      console.log('Uploading to Cloudinary...');

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Upload failed');
      }

      const data = await response.json();
      console.log('Upload successful:', data);
      setStatus('✅ Upload successful! URL: ' + data.secure_url);
      
      // Show URL in alert
      alert('Upload successful!\n\nURL: ' + data.secure_url);
    } catch (error) {
      console.error('Upload error:', error);
      setStatus('❌ Upload error: ' + error.message);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f172a',
      color: 'white',
      padding: '40px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: '#1e293b',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '700' }}>
          🎥 Recording Test
        </h1>
        <p style={{ margin: '0 0 32px 0', color: '#94a3b8', fontSize: '14px' }}>
          Test if recording and Cloudinary upload works
        </p>

        {/* Status */}
        <div style={{
          padding: '16px',
          background: '#334155',
          borderRadius: '8px',
          marginBottom: '24px',
          fontSize: '15px',
          fontWeight: '600'
        }}>
          Status: {status}
        </div>

        {/* Video Preview */}
        <div style={{
          width: '100%',
          height: '400px',
          background: '#000',
          borderRadius: '12px',
          overflow: 'hidden',
          marginBottom: '24px',
          border: '2px solid #334155'
        }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover'
            }}
          />
        </div>

        {/* Controls */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px'
        }}>
          <button
            onClick={startWebcam}
            disabled={webcamStream !== null}
            style={{
              padding: '16px',
              fontSize: '16px',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: webcamStream ? '#6b7280' : '#3b82f6',
              color: 'white',
              transition: 'all 0.3s'
            }}
          >
            {webcamStream ? '✅ Webcam Active' : '📹 Start Webcam'}
          </button>

          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!webcamStream}
            style={{
              padding: '16px',
              fontSize: '16px',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: isRecording ? '#ef4444' : '#10b981',
              color: 'white',
              transition: 'all 0.3s'
            }}
          >
            {isRecording ? '⏹️ Stop Recording' : '🔴 Start Recording'}
          </button>

          <button
            onClick={testUpload}
            disabled={chunksRef.current.length === 0}
            style={{
              padding: '16px',
              fontSize: '16px',
              fontWeight: '700',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              background: chunksRef.current.length === 0 ? '#6b7280' : '#8b5cf6',
              color: 'white',
              gridColumn: 'span 2',
              transition: 'all 0.3s'
            }}
          >
            ☁️ Test Upload to Cloudinary
          </button>
        </div>

        {/* Instructions */}
        <div style={{
          marginTop: '32px',
          padding: '20px',
          background: '#0f172a',
          borderRadius: '8px',
          fontSize: '14px',
          lineHeight: '1.6',
          color: '#cbd5e1'
        }}>
          <strong style={{ display: 'block', marginBottom: '12px', color: 'white' }}>
            📋 Test Steps:
          </strong>
          <ol style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Click "Start Webcam" - you should see yourself</li>
            <li>Click "Start Recording" - record for 5-10 seconds</li>
            <li>Click "Stop Recording"</li>
            <li>Click "Test Upload to Cloudinary"</li>
            <li>Check browser console (F12) for logs</li>
            <li>If successful, you'll see the video URL!</li>
          </ol>
        </div>

        {/* Recorded Info */}
        <div style={{
          marginTop: '16px',
          padding: '16px',
          background: '#334155',
          borderRadius: '8px',
          fontSize: '14px'
        }}>
          <strong>Debug Info:</strong>
          <div style={{ marginTop: '8px', fontFamily: 'monospace', fontSize: '13px' }}>
            <div>Webcam: {webcamStream ? '✅ Active' : '❌ Not started'}</div>
            <div>Recording: {isRecording ? '🔴 Active' : '⚪ Stopped'}</div>
            <div>Chunks recorded: {chunksRef.current.length}</div>
            <div>Total size: {Math.round(chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0) / 1024)} KB</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TestRecording;