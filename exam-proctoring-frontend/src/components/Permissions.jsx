import React, { useState, useEffect, useRef } from 'react';
import '../styles/Permissions.css';

const Permissions = ({ onPermissionsGranted, user, token, onLogout }) => {
  const [cameraGranted, setCameraGranted] = useState(false);
  const [screenGranted, setScreenGranted] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cameraSkipped, setCameraSkipped] = useState(false);
  
  const cameraVideoRef = useRef(null);
  const screenVideoRef = useRef(null);

  const stopStream = (stream) => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
    }
  };

  const requestCameraAccess = async () => {
    setLoading(true);
    setError('');
    
    try {
      if (cameraStream) {
        stopStream(cameraStream);
        setCameraStream(null);
      }

      console.log('📹 Requesting camera access...');

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 }
        },
        audio: false 
      });

      console.log('✅ Camera stream obtained:', stream);
      console.log('📹 Camera tracks:', stream.getVideoTracks());
      
      setCameraStream(stream);
      setCameraGranted(true);
      setError('');
      setRetryCount(0);
      
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        console.log('✅ Camera attached to video element');
        
        await new Promise((resolve) => {
          cameraVideoRef.current.onloadedmetadata = () => {
            cameraVideoRef.current.play().then(() => {
              console.log('✅ Camera video playing');
              resolve();
            }).catch(err => {
              console.warn('⚠️ Autoplay warning (non-critical):', err);
              resolve();
            });
          };
        });
      }
      
    } catch (err) {
      console.error('❌ Camera error:', err);
      
      let errorMessage = '';
      let helpText = '';
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera permission denied.';
        helpText = 'You can skip camera and continue with screen recording only.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found.';
        helpText = 'You can skip camera and continue with screen recording only.';
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is in use by another application.';
        helpText = 'Close other apps or skip camera to continue with screen recording only.';
      } else {
        errorMessage = `Camera error: ${err.message}`;
        helpText = 'You can skip camera and continue with screen recording only.';
      }
      
      setError(`${errorMessage}\n\n${helpText}`);
      setRetryCount(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };
  const skipCamera = () => {
    console.log('⏭️ Skipping camera - proceeding with screen only');
    setCameraSkipped(true);
    setCameraGranted(true);
    setError('');
  };

  const requestScreenAccess = async () => {
    setLoading(true);
    setError('');
    
    try {
      if (screenStream) {
        stopStream(screenStream);
      }

      console.log('🖥️ Requesting screen share...');

      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          logicalSurface: true,
          frameRate: { ideal: 15 }
        },
        audio: false
      });

      console.log('✅ Screen stream obtained:', stream);
      console.log('🖥️ Screen tracks:', stream.getVideoTracks());
      
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('Screen sharing stopped by user');
        setScreenGranted(false);
        setScreenStream(null);
        setError('Screen sharing was stopped. Please share your screen again to continue.');
      });
      
      setScreenStream(stream);
      setScreenGranted(true);
      setError('');
      
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
        console.log('✅ Screen attached to video element');
        
        await new Promise((resolve) => {
          screenVideoRef.current.onloadedmetadata = () => {
            screenVideoRef.current.play().then(() => {
              console.log('✅ Screen video playing');
              resolve();
            }).catch(err => {
              console.warn('⚠️ Autoplay warning (non-critical):', err);
              resolve();
            });
          };
        });
      }
      
    } catch (err) {
      console.error('❌ Screen error:', err);
      
      if (err.name === 'NotAllowedError') {
        setError('Screen sharing cancelled. Please select a screen/window and click "Share".');
      } else {
        setError(`Screen sharing error: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cameraGranted && screenGranted && screenStream) {
      console.log('✅ Both permissions granted, preparing to proceed...');
      console.log('📹 Camera stream:', cameraStream);
      console.log('🖥️ Screen stream:', screenStream);
      
      const screenTrack = screenStream.getVideoTracks()[0];
      console.log('🖥️ Screen track state:', screenTrack.readyState);
      console.log('🖥️ Screen track enabled:', screenTrack.enabled);
      
      if (screenTrack.readyState === 'live') {
        console.log('✅ Screen is live, proceeding to exam in 1.5s...');
        
        const timer = setTimeout(() => {
          console.log('🚀 Calling onPermissionsGranted with streams...');
          onPermissionsGranted({ 
            cameraStream: cameraSkipped ? null : cameraStream,
            screenStream: screenStream
          });
        }, 1500);
        
        return () => clearTimeout(timer);
      } else {
        console.error('❌ Screen stream not active');
        setError('Screen stream not active. Please grant screen permission again.');
        setScreenGranted(false);
      }
    }
  }, [cameraGranted, screenGranted, cameraStream, screenStream, cameraSkipped, onPermissionsGranted]);

  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up permission streams');
      stopStream(cameraStream);
      stopStream(screenStream);
    };
  }, []);

  return (
    <div className="permissions-container">
      <div className="permissions-wrapper">
        <div className="permissions-header">
          <div>
            <h2>Setup Exam Environment</h2>
            <p className="permissions-subtitle">
              Hello, <strong>{user?.name || user?.email}</strong>! Grant permissions to start your coding exam
            </p>
          </div>
          <button className="logout-btn-permissions" onClick={onLogout}>
            Logout
          </button>
        </div>

        {error && (
          <div className="error-message">
            <span className="error-icon">⚠️</span>
            <div style={{ whiteSpace: 'pre-line' }}>{error}</div>
          </div>
        )}

        <div className="permissions-grid">
          <div className="permission-card">
            <div className="permission-icon camera-icon">📷</div>
            <h3>Camera Access (Optional)</h3>
            <p className="permission-description">
              Recommended for identity verification and proctoring
            </p>
            
            {cameraGranted ? (
              <div className="status-granted">
                <span className="status-icon">✓</span>
                {cameraSkipped ? 'SKIPPED' : 'GRANTED'}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                <button 
                  className="grant-btn" 
                  onClick={requestCameraAccess}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="btn-spinner"></span>
                      <span>Accessing Camera...</span>
                    </>
                  ) : (
                    retryCount > 0 ? '🔄 Retry Camera' : '📹 Grant Camera Access'
                  )}
                </button>
                <button 
                  className="grant-btn"
                  onClick={skipCamera}
                  disabled={loading}
                  style={{ background: '#64748b' }}
                >
                  ⏭️ Skip Camera
                </button>
              </div>
            )}
            
            {cameraStream && !cameraSkipped && (
              <div className="video-preview-container">
                <video 
                  ref={cameraVideoRef}
                  autoPlay 
                  muted 
                  playsInline
                  className="preview-video"
                  style={{ width: '100%', height: 'auto', background: '#000' }}
                />
                <div className="video-label">Camera Preview</div>
              </div>
            )}
            
            {cameraSkipped && (
              <div className="video-preview-container" style={{ background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
                <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                  <div style={{ fontSize: '48px' }}>📷</div>
                  <p>Camera Skipped</p>
                  <small>Screen recording will be used</small>
                </div>
              </div>
            )}
          </div>

          <div className="permission-card">
            <div className="permission-icon screen-icon">🖥️</div>
            <h3>Screen Recording (Required)</h3>
            <p className="permission-description">
              Required to monitor screen activity during exam
            </p>
            
            {screenGranted ? (
              <div className="status-granted">
                <span className="status-icon">✓</span>
                GRANTED
              </div>
            ) : (
              <button 
                className="grant-btn" 
                onClick={requestScreenAccess}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="btn-spinner"></span>
                    <span>Accessing Screen...</span>
                  </>
                ) : (
                  '🖥️ Grant Screen Access'
                )}
              </button>
            )}
            
            {screenStream && (
              <div className="video-preview-container">
                <video 
                  ref={screenVideoRef}
                  autoPlay 
                  muted 
                  playsInline
                  className="preview-video"
                  style={{ width: '100%', height: 'auto', background: '#000' }}
                />
                <div className="video-label">Screen Preview</div>
              </div>
            )}
          </div>
        </div>

        {cameraGranted && screenGranted && (
          <div className="success-message">
            <span className="success-icon">✓</span>
            {cameraSkipped 
              ? 'Screen recording granted! Starting exam (camera skipped)...'
              : 'All permissions granted! Starting exam...'}
          </div>
        )}

        <div className="permissions-info">
          <p><strong>💡 Troubleshooting Tips:</strong></p>
          <ul>
            <li>Camera is optional - you can skip it if unavailable</li>
            <li>Screen recording is mandatory for exam proctoring</li>
            <li>Close all apps using camera (Zoom, Teams, Skype)</li>
            <li>Refresh page if permissions were denied</li>
            <li>Try a different browser (Chrome or Edge recommended)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Permissions;