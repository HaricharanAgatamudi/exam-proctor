// src/utils/recordingManager.js

class RecordingManager {
  constructor() {
    this.webcamRecorder = null;
    this.screenRecorder = null;
    this.webcamChunks = [];
    this.screenChunks = [];
    this.isRecording = false;
    this.sessionId = null;
    this.eventLog = [];
    this.keystrokes = []; // Store keystroke timestamps
  }

  initSession(userId, sessionType) {
    this.sessionId = `${userId}_${sessionType}_${Date.now()}`;
    this.eventLog = [];
    this.keystrokes = [];
    this.webcamChunks = [];
    this.screenChunks = [];
    console.log('📹 Recording session initialized:', this.sessionId);
  }

  getSupportedMimeType() {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('✅ Using MIME type:', type);
        return type;
      }
    }

    console.warn('⚠️ No supported MIME type found, using browser default');
    return '';
  }

  async startRecording(webcamStream, screenStream) {
    try {
      console.log('🎬 Starting recording process...');
      console.log('📹 Webcam stream:', webcamStream);
      console.log('🖥️ Screen stream:', screenStream);

      if (!screenStream) {
        throw new Error('Screen stream is required');
      }

      // Clear previous chunks
      this.webcamChunks = [];
      this.screenChunks = [];

      const mimeType = this.getSupportedMimeType();
      console.log('📝 Selected MIME type:', mimeType || 'browser default');

      // CRITICAL: Start screen recording first
      console.log('🖥️ Starting screen recording...');
      const screenVideoTrack = screenStream.getVideoTracks()[0];
      
      if (!screenVideoTrack) {
        throw new Error('No video track in screen stream');
      }

      console.log('🖥️ Screen track state:', screenVideoTrack.readyState);
      console.log('🖥️ Screen track settings:', screenVideoTrack.getSettings());

      const screenMediaStream = new MediaStream([screenVideoTrack]);

      // Use lower bitrate and ensure compatibility
      const screenOptions = mimeType 
        ? { mimeType, videoBitsPerSecond: 1500000 }
        : { videoBitsPerSecond: 1500000 };

      console.log('🖥️ Screen recorder options:', screenOptions);

      this.screenRecorder = new MediaRecorder(screenMediaStream, screenOptions);
      console.log('✅ Screen MediaRecorder created:', this.screenRecorder.state);
      console.log('✅ Screen recorder mimeType:', this.screenRecorder.mimeType);

      // Set up screen chunk collection
      this.screenRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.screenChunks.push(event.data);
          console.log(`📦 Screen chunk #${this.screenChunks.length}: ${Math.round(event.data.size / 1024)} KB`);
        } else {
          console.warn('⚠️ Empty screen chunk received');
        }
      };

      this.screenRecorder.onerror = (error) => {
        console.error('❌ Screen recorder error:', error);
        this.logEvent('recording_error', 'Screen recording error', { error: error.toString() });
      };

      this.screenRecorder.onstart = () => {
        console.log('✅ Screen recorder started');
      };

      this.screenRecorder.onstop = () => {
        console.log('🛑 Screen recorder stopped, total chunks:', this.screenChunks.length);
      };

      // Start screen recording with 3-second intervals for more frequent chunks
      this.screenRecorder.start(3000);
      console.log('✅ Screen recording started successfully');

      // Wait a moment to ensure screen recording is active
      await new Promise(resolve => setTimeout(resolve, 500));

      // Start webcam recording
      if (webcamStream) {
        try {
          console.log('📹 Starting webcam recording...');
          const webcamVideoTrack = webcamStream.getVideoTracks()[0];
          
          if (!webcamVideoTrack) {
            console.warn('⚠️ No video track in webcam stream');
          } else {
            console.log('📹 Webcam track state:', webcamVideoTrack.readyState);
            console.log('📹 Webcam track settings:', webcamVideoTrack.getSettings());

            const webcamMediaStream = new MediaStream([webcamVideoTrack]);

            const webcamOptions = mimeType 
              ? { mimeType, videoBitsPerSecond: 800000 }
              : { videoBitsPerSecond: 800000 };

            console.log('📹 Webcam recorder options:', webcamOptions);

            this.webcamRecorder = new MediaRecorder(webcamMediaStream, webcamOptions);
            console.log('✅ Webcam MediaRecorder created:', this.webcamRecorder.state);
            console.log('✅ Webcam recorder mimeType:', this.webcamRecorder.mimeType);

            this.webcamRecorder.ondataavailable = (event) => {
              if (event.data && event.data.size > 0) {
                this.webcamChunks.push(event.data);
                console.log(`📦 Webcam chunk #${this.webcamChunks.length}: ${Math.round(event.data.size / 1024)} KB`);
              } else {
                console.warn('⚠️ Empty webcam chunk received');
              }
            };

            this.webcamRecorder.onerror = (error) => {
              console.error('❌ Webcam recorder error:', error);
              this.logEvent('recording_error', 'Webcam recording error', { error: error.toString() });
            };

            this.webcamRecorder.onstart = () => {
              console.log('✅ Webcam recorder started');
            };

            this.webcamRecorder.onstop = () => {
              console.log('🛑 Webcam recorder stopped, total chunks:', this.webcamChunks.length);
            };

            // Start webcam recording with 3-second intervals
            this.webcamRecorder.start(3000);
            console.log('✅ Webcam recording started successfully');
          }
        } catch (webcamError) {
          console.warn('⚠️ Webcam recording failed (non-critical):', webcamError);
          this.logEvent('recording_warning', 'Webcam recording failed', { error: webcamError.toString() });
        }
      } else {
        console.log('⏭️ No webcam stream provided, skipping webcam recording');
      }

      this.isRecording = true;
      console.log('✅ SUCCESS: Recording active');
      console.log('📊 Current status:', {
        screenRecorder: this.screenRecorder?.state,
        webcamRecorder: this.webcamRecorder?.state,
        screenChunks: this.screenChunks.length,
        webcamChunks: this.webcamChunks.length
      });

      this.logEvent('recording_started', 'Recording session initiated');

      return { success: true, sessionId: this.sessionId };
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  async stopRecording() {
    console.log('🛑 Stopping recordings...');
    console.log('📊 Pre-stop status:', {
      screenRecorder: this.screenRecorder?.state,
      webcamRecorder: this.webcamRecorder?.state,
      screenChunks: this.screenChunks.length,
      webcamChunks: this.webcamChunks.length
    });

    return new Promise((resolve) => {
      let stoppedCount = 0;
      const totalRecorders = [this.webcamRecorder, this.screenRecorder].filter(Boolean).length;

      if (totalRecorders === 0) {
        console.warn('⚠️ No active recorders to stop');
        this.isRecording = false;
        resolve();
        return;
      }

      const checkAllStopped = () => {
        stoppedCount++;
        console.log(`✓ Recorder stopped (${stoppedCount}/${totalRecorders})`);
        
        if (stoppedCount >= totalRecorders) {
          this.isRecording = false;
          this.logEvent('recording_stopped', 'Recording session ended');
          
          console.log('✅ All recordings stopped');
          console.log('📊 Final chunk counts:', {
            screenChunks: this.screenChunks.length,
            webcamChunks: this.webcamChunks.length,
            events: this.eventLog.length,
            keystrokes: this.keystrokes.length
          });
          
          resolve();
        }
      };

      // Stop screen recorder
      if (this.screenRecorder && this.screenRecorder.state !== 'inactive') {
        this.screenRecorder.onstop = () => {
          console.log('✅ Screen recorder stopped');
          checkAllStopped();
        };
        
        try {
          this.screenRecorder.stop();
        } catch (err) {
          console.error('❌ Error stopping screen recorder:', err);
          checkAllStopped();
        }
      } else {
        console.log('⏭️ Screen recorder already inactive or null');
        checkAllStopped();
      }

      // Stop webcam recorder
      if (this.webcamRecorder && this.webcamRecorder.state !== 'inactive') {
        this.webcamRecorder.onstop = () => {
          console.log('✅ Webcam recorder stopped');
          checkAllStopped();
        };
        
        try {
          this.webcamRecorder.stop();
        } catch (err) {
          console.error('❌ Error stopping webcam recorder:', err);
          checkAllStopped();
        }
      } else if (totalRecorders > 1) {
        console.log('⏭️ Webcam recorder already inactive or null');
        checkAllStopped();
      }

      // Timeout safety
      setTimeout(() => {
        if (stoppedCount < totalRecorders) {
          console.warn('⚠️ Timeout waiting for recorders to stop, forcing completion');
          this.isRecording = false;
          resolve();
        }
      }, 5000);
    });
  }

  async uploadRecordings(userId, examId, label = 'unlabeled') {
    try {
      console.log('☁️ Starting upload to Cloudinary...');
      console.log('📦 Webcam chunks:', this.webcamChunks.length);
      console.log('📦 Screen chunks:', this.screenChunks.length);
      console.log('📦 Events:', this.eventLog.length);
      console.log('📦 Keystrokes:', this.keystrokes.length);

      // Cloudinary credentials
      const cloudName = 'dror3nw61';
      const uploadPreset = 'exam_proctor_uploads';

      console.log('🔑 Cloud name:', cloudName);
      console.log('🔑 Upload preset:', uploadPreset);

      if (!cloudName || !uploadPreset) {
        console.error('❌ Cloudinary credentials not configured!');
        throw new Error('Cloudinary credentials not configured.');
      }

      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;

      const results = {
        sessionId: this.sessionId,
        webcamURL: null,
        screenURL: null,
        eventsURL: null,
        webcamPublicId: null,
        screenPublicId: null,
        eventsPublicId: null,
        label: label,
        duration: null,
        keystrokes: this.keystrokes
      };

      // Upload webcam recording
      if (this.webcamChunks.length > 0) {
        console.log('📹 Uploading webcam recording...');
        console.log('📹 Creating blob from', this.webcamChunks.length, 'chunks');
        
        const webcamBlob = new Blob(this.webcamChunks, { type: 'video/webm' });
        console.log('📹 Webcam blob size:', Math.round(webcamBlob.size / 1024), 'KB');
        
        const webcamFormData = new FormData();
        webcamFormData.append('file', webcamBlob, 'webcam.webm');
        webcamFormData.append('upload_preset', uploadPreset);
        webcamFormData.append('folder', `exam-recordings/${userId}/${examId}`);
        webcamFormData.append('public_id', `webcam_${this.sessionId}`);
        webcamFormData.append('tags', `exam,webcam,${label},${userId},${examId}`);
        webcamFormData.append('resource_type', 'video');

        console.log('📹 Sending webcam upload request...');
        const webcamResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: webcamFormData
        });

        if (!webcamResponse.ok) {
          const errorText = await webcamResponse.text();
          console.error('❌ Webcam upload error:', errorText);
          throw new Error(`Webcam upload failed: ${webcamResponse.statusText}`);
        }

        const webcamData = await webcamResponse.json();
        results.webcamURL = webcamData.secure_url;
        results.webcamPublicId = webcamData.public_id;
        results.duration = webcamData.duration;
        console.log('✅ Webcam uploaded:', webcamData.secure_url);
        console.log('✅ Duration:', webcamData.duration, 'seconds');
      } else {
        console.warn('⚠️ No webcam chunks to upload');
      }

      // Upload screen recording
      if (this.screenChunks.length > 0) {
        console.log('🖥️ Uploading screen recording...');
        console.log('🖥️ Creating blob from', this.screenChunks.length, 'chunks');
        
        const screenBlob = new Blob(this.screenChunks, { type: 'video/webm' });
        console.log('🖥️ Screen blob size:', Math.round(screenBlob.size / 1024), 'KB');
        
        const screenFormData = new FormData();
        screenFormData.append('file', screenBlob, 'screen.webm');
        screenFormData.append('upload_preset', uploadPreset);
        screenFormData.append('folder', `exam-recordings/${userId}/${examId}`);
        screenFormData.append('public_id', `screen_${this.sessionId}`);
        screenFormData.append('tags', `exam,screen,${label},${userId},${examId}`);
        screenFormData.append('resource_type', 'video');

        console.log('🖥️ Sending screen upload request...');
        const screenResponse = await fetch(uploadUrl, {
          method: 'POST',
          body: screenFormData
        });

        if (!screenResponse.ok) {
          const errorText = await screenResponse.text();
          console.error('❌ Screen upload error:', errorText);
          throw new Error(`Screen upload failed: ${screenResponse.statusText}`);
        }

        const screenData = await screenResponse.json();
        results.screenURL = screenData.secure_url;
        results.screenPublicId = screenData.public_id;
        console.log('✅ Screen uploaded:', screenData.secure_url);
        console.log('✅ Duration:', screenData.duration, 'seconds');
      } else {
        console.warn('⚠️ No screen chunks to upload');
      }

      // Upload combined event log and keystrokes as JSON
      if (this.eventLog.length > 0 || this.keystrokes.length > 0) {
        console.log('📄 Uploading event log and keystrokes...');
        
        const combinedData = {
          sessionId: this.sessionId,
          events: this.eventLog,
          keystrokes: this.keystrokes,
          metadata: {
            totalEvents: this.eventLog.length,
            totalKeystrokes: this.keystrokes.length,
            recordingDuration: results.duration,
            uploadedAt: new Date().toISOString()
          }
        };
        
        const eventsBlob = new Blob([JSON.stringify(combinedData, null, 2)], { type: 'application/json' });
        const eventsFormData = new FormData();
        eventsFormData.append('file', eventsBlob, 'events.json');
        eventsFormData.append('upload_preset', uploadPreset);
        eventsFormData.append('folder', `exam-recordings/${userId}/${examId}`);
        eventsFormData.append('public_id', `events_${this.sessionId}`);
        eventsFormData.append('resource_type', 'raw');

        const eventsResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`,
          {
            method: 'POST',
            body: eventsFormData
          }
        );

        if (eventsResponse.ok) {
          const eventsData = await eventsResponse.json();
          results.eventsURL = eventsData.secure_url;
          results.eventsPublicId = eventsData.public_id;
          console.log('✅ Events and keystrokes uploaded:', eventsData.secure_url);
        }
      }

      results.message = 'Recordings uploaded successfully to Cloudinary';
      console.log('✅ All uploads complete:', results);
      return results;

    } catch (error) {
      console.error('❌ Upload failed:', error);
      throw new Error(`Failed to upload recordings: ${error.message}`);
    }
  }

  logEvent(type, description, metadata = {}) {
    const event = {
      type,
      description,
      timestamp: new Date().toISOString(),
      metadata
    };
    this.eventLog.push(event);
    console.log('📝 Event logged:', type);
  }

  logViolation(type, description) {
    this.logEvent('violation', description, { violationType: type });
  }

  logKeystroke(key, codeLength, timestamp = Date.now()) {
    const keystroke = {
      timestamp,
      key,
      codeLength,
      relativeTime: timestamp - (this.keystrokes[0]?.timestamp || timestamp)
    };
    this.keystrokes.push(keystroke);
  }

  logKeyboardActivity(keyCount, codeLength) {
    this.logEvent('keyboard_activity', 'Keyboard activity detected', {
      keyPressCount: keyCount,
      codeLength: codeLength,
      timestamp: Date.now()
    });
  }

  cleanup() {
    console.log('🧹 Cleaning up recording manager...');
    this.webcamChunks = [];
    this.screenChunks = [];
    this.eventLog = [];
    this.keystrokes = [];
    this.webcamRecorder = null;
    this.screenRecorder = null;
    this.isRecording = false;
    this.sessionId = null;
  }
}

const recordingManager = new RecordingManager();
export default recordingManager;