import { io } from 'socket.io-client';

// Use Vite environment variables
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const PYTHON_PROCTOR_URL = import.meta.env.VITE_PYTHON_PROCTOR_URL || 'http://localhost:5001';

class ProctorService {
  constructor() {
    this.socket = null;
    this.isProctoring = false;
    this.sessionId = null;
    this.captureInterval = null;
    this.screenVideoElement = null;
    this.retryAttempts = 0;
    this.maxRetries = 10;
  }

  connect() {
    console.log('🔌 Connecting to Python Proctor Server...');
    console.log('🌐 Using URL:', PYTHON_PROCTOR_URL);
    
    this.socket = io(PYTHON_PROCTOR_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to Proctor Server');
    });

    this.socket.on('connection_response', (data) => {
      console.log('📡 Server response:', data);
    });

    this.socket.on('violation_detected', (data) => {
      console.warn('⚠️ Violation detected:', data);
      this.handleViolation(data);
    });

    this.socket.on('proctor_status', (data) => {
      console.log('📊 Proctor status:', data);
    });

    this.socket.on('proctoring_started', (data) => {
      console.log('🎬 Proctoring started:', data);
    });

    this.socket.on('proctoring_ended', (data) => {
      console.log('🏁 Proctoring ended:', data);
    });

    this.socket.on('error', (error) => {
      console.error('❌ Proctor error:', error);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from Proctor Server');
    });
  }

  async startProctoring(studentId, examId) {
    try {
      // ✅ VALIDATION
      console.log('🔍 Validating inputs:');
      console.log('   studentId type:', typeof studentId, 'value:', studentId);
      console.log('   examId type:', typeof examId, 'value:', examId);
      
      if (!studentId || studentId === 'undefined' || studentId === 'null') {
        throw new Error('Invalid student ID: ' + studentId);
      }
      
      if (!examId || examId === 'undefined' || examId === 'null') {
        throw new Error('Invalid exam ID: ' + examId);
      }

      const studentIdStr = String(studentId);
      const examIdStr = String(examId);
      
      console.log(`🎬 Starting proctoring for student: ${studentIdStr}, exam: ${examIdStr}`);

      // Notify Node.js backend
      try {
        const response = await fetch(`${BACKEND_URL}/api/proctoring/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            studentId: studentIdStr,
            examId: examIdStr
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          this.sessionId = data.sessionId;
          console.log('✅ Backend session created:', this.sessionId);
        } else {
          const error = await response.json();
          console.error('❌ Backend session failed:', error);
        }
      } catch (error) {
        console.error('❌ Backend API error:', error);
      }

      // Start Python proctor
      this.socket.emit('start_proctoring', { 
        studentId: studentIdStr,
        examId: examIdStr
      });

      // Start capturing frames
      this.isProctoring = true;
      this.retryAttempts = 0;
      
      // Wait for DOM and streams to be ready
      setTimeout(() => {
        this.startFrameCapture();
      }, 2000);

      return this.sessionId;
    } catch (error) {
      console.error('❌ Failed to start proctoring:', error);
      throw error;
    }
  }

  findScreenVideoElement() {
    // Try to find screen video by ID first
    const screenById = document.getElementById('exam-screen');
    if (screenById && screenById.videoWidth > 0) {
      this.screenVideoElement = screenById;
      console.log('✅ Found screen video by ID:', screenById);
      return true;
    }

    // Try to find the screen video element
    const videos = document.querySelectorAll('video');
    
    // Find the one that's NOT the exam camera
    for (let video of videos) {
      if (video.id !== 'exam-camera' && video.videoWidth > 100) {
        this.screenVideoElement = video;
        console.log('✅ Found screen video element:', video);
        return true;
      }
    }
    
    return false;
  }

  startFrameCapture() {
    console.log('🎥 Attempting to start frame capture...');
    
    const cameraElement = document.getElementById('exam-camera');
    
    if (!cameraElement) {
      this.retryAttempts++;
      if (this.retryAttempts < this.maxRetries) {
        console.warn(`⚠️ Camera element not found, retry ${this.retryAttempts}/${this.maxRetries} in 500ms...`);
        setTimeout(() => this.startFrameCapture(), 500);
        return;
      } else {
        console.error('❌ Camera video element not found after max retries');
        return;
      }
    }

    // Wait for video to be ready
    if (cameraElement.readyState < 2 || cameraElement.videoWidth === 0) {
      this.retryAttempts++;
      if (this.retryAttempts < this.maxRetries) {
        console.warn(`⚠️ Camera not ready (readyState: ${cameraElement.readyState}, width: ${cameraElement.videoWidth}), retry ${this.retryAttempts}/${this.maxRetries}...`);
        setTimeout(() => this.startFrameCapture(), 500);
        return;
      }
    }

    console.log('✅ Camera element ready:', {
      readyState: cameraElement.readyState,
      videoWidth: cameraElement.videoWidth,
      videoHeight: cameraElement.videoHeight
    });

    // Try to find screen element
    this.findScreenVideoElement();

    this.captureFrames(cameraElement);
  }

  captureFrames(cameraElement) {
    const cameraCanvas = document.createElement('canvas');
    const cameraContext = cameraCanvas.getContext('2d');
    
    const screenCanvas = document.createElement('canvas');
    const screenContext = screenCanvas.getContext('2d');
    
    let frameCount = 0;
    let screenFrameCount = 0;
    let lastLogTime = Date.now();

    const captureFrame = () => {
      if (!this.isProctoring) {
        console.log('🛑 Proctoring stopped, ending frame capture');
        return;
      }

      try {
        // CAPTURE CAMERA FRAME
        if (cameraElement.readyState >= 2 && cameraElement.videoWidth > 0) {
          cameraCanvas.width = cameraElement.videoWidth;
          cameraCanvas.height = cameraElement.videoHeight;
          cameraContext.drawImage(cameraElement, 0, 0, cameraCanvas.width, cameraCanvas.height);
          
          const cameraData = cameraCanvas.toDataURL('image/jpeg', 0.7);
          
          this.socket.emit('video_frame', {
            frame: cameraData,
            timestamp: Date.now()
          });
          
          frameCount++;
        } else if (frameCount === 0) {
          console.warn('⚠️ Camera still not ready:', {
            readyState: cameraElement.readyState,
            width: cameraElement.videoWidth
          });
        }

        // CAPTURE SCREEN FRAME
        // Retry finding screen element if not found
        if (!this.screenVideoElement || this.screenVideoElement.videoWidth === 0) {
          this.findScreenVideoElement();
        }

        if (this.screenVideoElement && 
            this.screenVideoElement.readyState >= 2 && 
            this.screenVideoElement.videoWidth > 0) {
          screenCanvas.width = this.screenVideoElement.videoWidth;
          screenCanvas.height = this.screenVideoElement.videoHeight;
          screenContext.drawImage(this.screenVideoElement, 0, 0, screenCanvas.width, screenCanvas.height);
          
          const screenData = screenCanvas.toDataURL('image/jpeg', 0.6);
          
          this.socket.emit('screen_frame', {
            frame: screenData,
            timestamp: Date.now()
          });
          
          screenFrameCount++;
        }

        // Log progress every 5 seconds
        const now = Date.now();
        if (now - lastLogTime > 5000) {
          console.log(`📹 Captured ${frameCount} camera frames, ${screenFrameCount} screen frames`);
          lastLogTime = now;
        }

      } catch (error) {
        console.error('❌ Error capturing frame:', error);
      }
    };

    // Capture at 10 FPS (every 100ms)
    this.captureInterval = setInterval(captureFrame, 100);
    console.log('✅ Frame capture loop started at 10 FPS');
    
    // Immediately capture first frame
    captureFrame();
  }

  async handleViolation(data) {
    console.warn('⚠️ Handling violation:', data);

    // Save to Node.js backend if session exists
    if (this.sessionId) {
      try {
        await fetch(`${BACKEND_URL}/api/proctoring/violation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this.sessionId,
            violation: data.violations[0]
          })
        });
      } catch (error) {
        console.error('Failed to save violation:', error);
      }
    }

    // Notify UI
    window.dispatchEvent(new CustomEvent('proctorViolation', { detail: data }));
  }

  async endProctoring() {
    console.log('🏁 Ending proctoring...');
    this.isProctoring = false;

    // Stop frame capture
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
      console.log('✅ Frame capture stopped');
    }

    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        console.warn('⚠️ Socket not connected, resolving with empty report');
        resolve({
          report: {
            totalViolations: 0,
            riskLevel: 'UNKNOWN'
          }
        });
        return;
      }

      this.socket.emit('end_proctoring', {});

      this.socket.once('proctoring_ended', async (data) => {
        console.log('📊 Final report:', data);

        // Save final report to Node.js if session exists
        if (this.sessionId) {
          try {
            await fetch(`${BACKEND_URL}/api/proctoring/end`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: this.sessionId,
                finalReport: data.report
              })
            });
          } catch (error) {
            console.error('Failed to save final report:', error);
          }
        }

        resolve(data);
      });

      // Timeout fallback
      setTimeout(() => {
        console.warn('⚠️ Proctor end timeout, resolving anyway');
        resolve({
          report: {
            totalViolations: 0,
            riskLevel: 'UNKNOWN'
          }
        });
      }, 5000);
    });
  }

  disconnect() {
    console.log('🔌 Disconnecting proctor service...');
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isProctoring = false;
    this.sessionId = null;
    this.screenVideoElement = null;
    this.retryAttempts = 0;
    console.log('✅ Proctor service disconnected');
  }
}

export default new ProctorService();