"""
Integrated Exam Proctoring System
Synchronizes:
1. Webcam feed (typing posture detection)
2. Screen recording (keyboard activity detection)
3. Hand visibility detection (cheating detection)

Real-time analysis of correlation between screen typing and physical posture
"""

import cv2
import numpy as np
import time
import threading
import queue
from datetime import datetime
from pynput import keyboard
import json
import sys

try:
    import mss
    MSS_AVAILABLE = True
except ImportError:
    MSS_AVAILABLE = False
    print("⚠ MSS not available, will use PIL")

from upper_body_detector import UpperBodyTypingDetector
from hand_detector import HandDetector
from database_manager import TypingDetectionDatabase


class ScreenActivityMonitor:
    """Monitor screen for typing activity and keyboard inputs"""
    
    def __init__(self):
        self.typing_detected = False
        self.last_keypress_time = 0
        self.keypress_count = 0
        self.recent_keys = []
        self.key_buffer_size = 10
        
        # Start keyboard listener
        self.listener = keyboard.Listener(on_press=self._on_key_press)
        self.listener.start()
        
    def _on_key_press(self, key):
        """Callback for keyboard press events"""
        current_time = time.time()
        self.last_keypress_time = current_time
        self.keypress_count += 1
        self.typing_detected = True
        
        # Store recent keys (for analysis, not logging actual content)
        try:
            key_name = key.char if hasattr(key, 'char') else str(key)
            self.recent_keys.append({
                'timestamp': current_time,
                'key_type': 'char' if hasattr(key, 'char') else 'special'
            })
            
            # Keep only recent keys
            if len(self.recent_keys) > self.key_buffer_size:
                self.recent_keys.pop(0)
                
        except Exception as e:
            pass
    
    def is_typing_on_screen(self, time_window=2.0):
        """Check if typing detected on screen in last N seconds"""
        current_time = time.time()
        time_since_keypress = current_time - self.last_keypress_time
        return time_since_keypress < time_window
    
    def get_typing_rate(self):
        """Get keys per second in recent window"""
        if not self.recent_keys:
            return 0.0
        
        current_time = time.time()
        recent = [k for k in self.recent_keys if current_time - k['timestamp'] < 5.0]
        
        if len(recent) < 2:
            return 0.0
        
        time_span = recent[-1]['timestamp'] - recent[0]['timestamp']
        return len(recent) / time_span if time_span > 0 else 0.0
    
    def get_statistics(self):
        """Get keyboard activity statistics"""
        return {
            'total_keypresses': self.keypress_count,
            'typing_rate': self.get_typing_rate(),
            'is_typing': self.is_typing_on_screen(),
            'recent_activity': len(self.recent_keys)
        }
    
    def stop(self):
        """Stop keyboard monitoring"""
        self.listener.stop()


class ScreenRecorder:
    """Record screen using PIL ImageGrab (Windows compatible)"""
    
    def __init__(self, fps=5):  # Reduced FPS for better performance
        self.fps = fps
        self.recording = False
        self.frames = queue.Queue(maxsize=30)
        self.last_frame = None
        
        # Use PIL ImageGrab instead of MSS (fixes threading issue on Windows)
        try:
            from PIL import ImageGrab
            self.ImageGrab = ImageGrab
            self.use_pil = True
            print("✓ Using PIL ImageGrab for screen capture")
        except ImportError:
            print("⚠ PIL not available, using MSS")
            self.sct = mss.mss()
            self.monitor = self.sct.monitors[1]
            self.use_pil = False
        
    def start_recording(self):
        """Start screen recording in separate thread"""
        self.recording = True
        self.thread = threading.Thread(target=self._record_loop, daemon=True)
        self.thread.start()
        print("✓ Screen recording started")
    
    def _record_loop(self):
        """Internal recording loop"""
        interval = 1.0 / self.fps
        
        while self.recording:
            start_time = time.time()
            
            try:
                if self.use_pil:
                    # Use PIL ImageGrab (Windows compatible, no threading issues)
                    screenshot = self.ImageGrab.grab()
                    frame = np.array(screenshot)
                    frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                else:
                    # Fallback to MSS
                    screenshot = self.sct.grab(self.monitor)
                    frame = np.array(screenshot)
                    frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
                
                self.last_frame = frame
                
                # Add to queue (drop if full)
                try:
                    self.frames.put((time.time(), frame), block=False)
                except queue.Full:
                    # Remove oldest and add new
                    try:
                        self.frames.get_nowait()
                        self.frames.put((time.time(), frame), block=False)
                    except:
                        pass
            except Exception as e:
                if self.recording:  # Only print error if still recording
                    print(f"⚠ Screen capture error: {e}")
                    time.sleep(1)  # Wait before retrying
            
            # Maintain FPS
            elapsed = time.time() - start_time
            sleep_time = max(0, interval - elapsed)
            time.sleep(sleep_time)
    
    def get_latest_frame(self):
        """Get most recent screen frame"""
        try:
            return self.frames.get_nowait()
        except queue.Empty:
            # Return last known frame if queue is empty
            if self.last_frame is not None:
                return (time.time(), self.last_frame)
            return None
    
    def stop_recording(self):
        """Stop screen recording"""
        self.recording = False
        if hasattr(self, 'thread'):
            self.thread.join(timeout=2.0)
        print("✓ Screen recording stopped")


class IntegratedExamProctor:
    """
    Main integrated proctoring system that correlates:
    - Webcam typing posture
    - Screen keyboard activity
    - Hand visibility
    """
    
    def __init__(self, user_id, exam_id, db_connection="mongodb://localhost:27017/"):
        print("\n" + "="*80)
        print("INTEGRATED EXAM PROCTORING SYSTEM")
        print("="*80)
        
        # Initialize detectors
        print("\nInitializing components...")
        self.upper_body_detector = UpperBodyTypingDetector(buffer_size=60)
        self.hand_detector = HandDetector()
        self.screen_monitor = ScreenActivityMonitor()
        self.screen_recorder = ScreenRecorder(fps=5)
        print("✓ Detectors initialized")
        
        # Database
        try:
            self.db = TypingDetectionDatabase(db_connection)
            self.session_id = self.db.create_session(user_id, exam_id, session_type="integrated_exam")
            self.db_enabled = True
        except Exception as e:
            print(f"⚠ Database error: {e}")
            print("⚠ Continuing without database")
            self.db_enabled = False
            self.session_id = f"offline_{int(time.time())}"
        
        self.user_id = user_id
        self.exam_id = exam_id
        self.start_time = time.time()
        self.frame_count = 0
        self.is_calibrated = False
        
        # Statistics
        self.stats = {
            'total_frames': 0,
            'webcam_typing_frames': 0,
            'screen_typing_frames': 0,
            'synchronized_typing': 0,
            'mismatch_count': 0,
            'hands_visible_frames': 0,
            'suspicious_events': []
        }
        
        print(f"✓ Session ID: {self.session_id}")
        print("="*80)
    
    def calibrate(self, frame):
        """Calibrate typing posture detector"""
        print("\n📐 Calibrating...", end=" ")
        success = self.upper_body_detector.calibrate(frame)
        if success:
            self.is_calibrated = True
            print("✓")
        else:
            print("✗ (using defaults)")
            self.is_calibrated = True
        return success
    
    def analyze_correlation(self, webcam_typing, screen_typing, hands_visible):
        """
        Analyze correlation between webcam posture and screen activity.
        Detect suspicious patterns.
        """
        current_time = time.time()
        
        is_synchronized = webcam_typing == screen_typing
        
        anomaly = None
        severity = "normal"
        
        # Case 1: Screen typing but no physical typing posture
        if screen_typing and not webcam_typing:
            anomaly = "screen_typing_without_posture"
            severity = "high"
            description = "Keyboard activity detected but student not in typing posture"
        
        # Case 2: Typing posture but no screen activity
        elif webcam_typing and not screen_typing:
            anomaly = "posture_without_screen_activity"
            severity = "medium"
            description = "Typing posture detected but no keyboard activity"
        
        # Case 3: Hands visible during typing
        elif screen_typing and hands_visible:
            anomaly = "hands_visible_during_typing"
            severity = "critical"
            description = "Hands visible on camera while typing (should be on keyboard below)"
        
        # Case 4: Both typing (normal)
        elif webcam_typing and screen_typing:
            anomaly = None
            severity = "normal"
            description = "Normal synchronized typing activity"
        
        # Case 5: Neither typing (normal)
        else:
            anomaly = None
            severity = "normal"
            description = "No typing activity"
        
        result = {
            'timestamp': current_time,
            'webcam_typing': webcam_typing,
            'screen_typing': screen_typing,
            'hands_visible': hands_visible,
            'is_synchronized': is_synchronized,
            'anomaly': anomaly,
            'severity': severity,
            'description': description
        }
        
        # Log suspicious events
        if anomaly and severity in ['high', 'critical']:
            self.stats['suspicious_events'].append(result)
            self._log_suspicious_event(result)
        
        return result
    
    def _log_suspicious_event(self, event):
        """Log suspicious event to database and console (with rate limiting)"""
        # Rate limit: only log same event type once every 10 seconds
        current_time = time.time()
        
        if not hasattr(self, '_last_log_time'):
            self._last_log_time = {}
        
        anomaly_type = event['anomaly']
        if anomaly_type in self._last_log_time:
            time_since_last = current_time - self._last_log_time[anomaly_type]
            if time_since_last < 10.0:  # Don't log same event within 10 seconds
                return
        
        self._last_log_time[anomaly_type] = current_time
        
        print(f"\n⚠️  SUSPICIOUS: {event['description']}")
        print(f"   Severity: {event['severity'].upper()}")
        print(f"   Time: {datetime.fromtimestamp(event['timestamp']).strftime('%H:%M:%S')}")
    
    def process_frame(self, webcam_frame, screen_frame):
        """Process both webcam and screen frames simultaneously"""
        current_time = time.time()
        self.frame_count += 1
        self.stats['total_frames'] += 1
        
        # Get webcam dimensions
        h, w = webcam_frame.shape[:2]
        
        # Resize screen frame to match webcam
        if screen_frame is not None:
            screen_h, screen_w = screen_frame.shape[:2]
            # Resize to match webcam width
            scale = w / screen_w
            new_h = int(screen_h * scale)
            screen_resized = cv2.resize(screen_frame, (w, new_h))
            
            # If screen is taller, crop it
            if new_h > h:
                screen_resized = screen_resized[:h, :]
            # If screen is shorter, pad it
            elif new_h < h:
                padding = h - new_h
                screen_resized = cv2.copyMakeBorder(screen_resized, 0, padding, 0, 0, 
                                                   cv2.BORDER_CONSTANT, value=(50, 50, 50))
        else:
            screen_resized = np.zeros((h, w, 3), dtype=np.uint8)
            cv2.putText(screen_resized, "Capturing screen...", (w//2 - 100, h//2),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        
        # Combine frames side by side
        display_frame = np.hstack([webcam_frame, screen_resized])
        
        # --- Webcam Analysis ---
        pose_data = self.upper_body_detector.detect_pose(webcam_frame)
        typing_analysis = self.upper_body_detector.analyze_typing_posture(pose_data, current_time)
        
        webcam_typing = typing_analysis['is_typing'] if typing_analysis else False
        if webcam_typing:
            self.stats['webcam_typing_frames'] += 1
        
        # Draw typing visualization on webcam frame
        if typing_analysis:
            webcam_display = self.upper_body_detector.draw_visualization(webcam_frame.copy(), typing_analysis)
            display_frame[:h, :w] = webcam_display
        
        # --- Hand Detection ---
        hands_data = self.hand_detector.detect_hands(webcam_frame)
        hands_visible = len(hands_data) > 0 if hands_data else False
        
        if hands_visible:
            self.stats['hands_visible_frames'] += 1
            webcam_display = self.hand_detector.draw_landmarks(display_frame[:h, :w].copy(), hands_data)
            display_frame[:h, :w] = webcam_display
        
        # --- Screen Activity ---
        screen_typing = self.screen_monitor.is_typing_on_screen(time_window=2.0)
        if screen_typing:
            self.stats['screen_typing_frames'] += 1
        
        typing_rate = self.screen_monitor.get_typing_rate()
        
        # --- Correlation Analysis ---
        correlation = self.analyze_correlation(webcam_typing, screen_typing, hands_visible)
        
        if correlation['is_synchronized']:
            self.stats['synchronized_typing'] += 1
        else:
            self.stats['mismatch_count'] += 1
        
        # --- Draw Status Panel ---
        self._draw_status_panel(display_frame, {
            'webcam_typing': webcam_typing,
            'screen_typing': screen_typing,
            'hands_visible': hands_visible,
            'typing_rate': typing_rate,
            'correlation': correlation,
            'typing_confidence': typing_analysis['confidence'] if typing_analysis else 0.0
        })
        
        return display_frame, correlation
    
    def _draw_status_panel(self, frame, data):
        """Draw comprehensive status panel on frame"""
        h, w = frame.shape[:2]
        panel_width = 400
        panel_height = 280
        x_offset = w - panel_width - 10
        y_offset = 10
        
        # Semi-transparent background
        overlay = frame.copy()
        cv2.rectangle(overlay, (x_offset, y_offset), 
                     (x_offset + panel_width, y_offset + panel_height),
                     (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
        
        # Border
        cv2.rectangle(frame, (x_offset, y_offset),
                     (x_offset + panel_width, y_offset + panel_height),
                     (255, 255, 255), 2)
        
        # Title
        cv2.putText(frame, "INTEGRATED MONITORING", (x_offset + 10, y_offset + 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        y = y_offset + 60
        line_height = 25
        
        # Status indicators
        statuses = [
            ("Webcam Typing:", data['webcam_typing'], (0, 255, 0) if data['webcam_typing'] else (100, 100, 100)),
            ("Screen Typing:", data['screen_typing'], (0, 255, 0) if data['screen_typing'] else (100, 100, 100)),
            ("Hands Visible:", data['hands_visible'], (0, 0, 255) if data['hands_visible'] else (0, 255, 0)),
        ]
        
        for label, value, color in statuses:
            cv2.putText(frame, label, (x_offset + 10, y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            status_text = "YES" if value else "NO"
            cv2.putText(frame, status_text, (x_offset + 200, y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
            y += line_height
        
        y += 10
        
        # Metrics
        cv2.putText(frame, f"Typing Rate: {data['typing_rate']:.1f} keys/s",
                   (x_offset + 10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        y += line_height
        
        cv2.putText(frame, f"Confidence: {data['typing_confidence']:.1%}",
                   (x_offset + 10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        y += line_height
        
        # Correlation status
        correlation = data['correlation']
        severity_colors = {
            'normal': (0, 255, 0),
            'medium': (0, 255, 255),
            'high': (0, 165, 255),
            'critical': (0, 0, 255)
        }
        
        severity_color = severity_colors.get(correlation['severity'], (255, 255, 255))
        
        cv2.putText(frame, "Status:", (x_offset + 10, y),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        cv2.putText(frame, correlation['severity'].upper(), (x_offset + 100, y),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, severity_color, 2)
        y += line_height + 5
        
        # Description (word wrap)
        description = correlation['description']
        words = description.split()
        line = ""
        for word in words:
            test_line = line + word + " "
            if len(test_line) * 6 > panel_width - 20:
                cv2.putText(frame, line, (x_offset + 10, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
                y += 18
                line = word + " "
            else:
                line = test_line
        if line:
            cv2.putText(frame, line, (x_offset + 10, y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
        
        # Session info at bottom
        y = y_offset + panel_height - 30
        elapsed = time.time() - self.start_time
        cv2.putText(frame, f"Time: {elapsed/60:.1f} min | Frame: {self.frame_count}",
                   (x_offset + 10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)
    
    def run(self, camera_index=0, duration_minutes=None):
        """Run the integrated proctoring system"""
        
        # Open webcam with retries
        print("\nOpening webcam...")
        cap = None
        
        for attempt in range(3):
            cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)  # Use DirectShow on Windows
            if cap.isOpened():
                break
            print(f"⚠ Attempt {attempt + 1} failed, trying again...")
            if cap:
                cap.release()
            time.sleep(1)
            
            # Try different camera index
            if attempt == 1:
                camera_index = 1
                print(f"⚠ Trying camera index {camera_index}...")
        
        if not cap or not cap.isOpened():
            print("ERROR: Cannot open camera!")
            print("Possible fixes:")
            print("  1. Close other apps using the camera (Teams, Zoom, etc.)")
            print("  2. Check camera permissions in Windows Settings")
            print("  3. Try running: python test_integrated_proctor.py")
            return
        
        # Configure camera
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer
        
        # Test camera
        print("Testing camera...", end=" ")
        ret, test_frame = cap.read()
        if not ret or test_frame is None:
            print("FAILED!")
            print("ERROR: Camera opened but cannot read frames!")
            cap.release()
            return
        
        print(f"✓ Camera OK ({test_frame.shape[1]}x{test_frame.shape[0]})")
        
        # Start screen recording
        self.screen_recorder.start_recording()
        time.sleep(1)  # Give screen recorder time to start
        
        print("\n" + "="*80)
        print("INTEGRATED EXAM PROCTORING - ACTIVE")
        print("="*80)
        print("\nControls:")
        print("  • Press 'C' to calibrate")
        print("  • Press 'S' to skip calibration")
        print("  • Press 'F' to toggle fullscreen")
        print("  • Press 'R' for statistics")
        print("  • Press 'Q' or ESC to quit")
        print("="*80 + "\n")
        
        # Create resizable window (NOT fullscreen by default)
        cv2.namedWindow('Integrated Exam Proctor', cv2.WINDOW_NORMAL)
        cv2.resizeWindow('Integrated Exam Proctor', 1600, 800)
        
        # Fullscreen toggle flag
        is_fullscreen = False
        
        frame_errors = 0
        max_errors = 10
        
        # Calibration timeout
        calibration_start_time = time.time()
        calibration_timeout = 10  # Auto-skip after 10 seconds
        
        try:
            while True:
                ret, webcam_frame = cap.read()
                if not ret or webcam_frame is None:
                    frame_errors += 1
                    print(f"⚠ Frame read error {frame_errors}/{max_errors}")
                    
                    if frame_errors >= max_errors:
                        print("ERROR: Too many frame errors, stopping...")
                        break
                    
                    time.sleep(0.1)
                    continue
                
                frame_errors = 0  # Reset error counter on success
                webcam_frame = cv2.flip(webcam_frame, 1)
                
                # Calibration phase
                if not self.is_calibrated:
                    # Check timeout
                    elapsed = time.time() - calibration_start_time
                    remaining = int(calibration_timeout - elapsed)
                    
                    if elapsed >= calibration_timeout:
                        print("\n⏱ Auto-skipping calibration (timeout)")
                        self.is_calibrated = True
                        continue
                    
                    # Draw big calibration message
                    h, w = webcam_frame.shape[:0]
                    
                    # Semi-transparent overlay
                    overlay = webcam_frame.copy()
                    cv2.rectangle(overlay, (0, 0), (w, 180), (0, 0, 0), -1)
                    cv2.addWeighted(overlay, 0.7, webcam_frame, 0.3, 0, webcam_frame)
                    
                    cv2.putText(webcam_frame, "CALIBRATION REQUIRED", (50, 40),
                               cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 255), 3)
                    cv2.putText(webcam_frame, "1. CLICK THIS WINDOW to focus it", (50, 80),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                    cv2.putText(webcam_frame, "2. Press 'C' to calibrate or 'S' to skip", (50, 110),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                    cv2.putText(webcam_frame, f"Auto-skip in {remaining}s...", (50, 140),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    cv2.putText(webcam_frame, "Press 'Q' to quit", (50, 170),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 100, 100), 1)
                    
                    cv2.imshow('Integrated Exam Proctor', webcam_frame)
                    
                    # Check keyboard input
                    key = cv2.waitKey(1) & 0xFF
                    
                    if key == ord('c') or key == ord('C'):
                        self.calibrate(webcam_frame)
                    elif key == ord('s') or key == ord('S') or key == 13:  # 's', 'S', or ENTER
                        self.is_calibrated = True
                        print("⏭ Skipped calibration")
                    elif key == ord('q') or key == ord('Q') or key == 27:
                        print("Quitting...")
                        break
                    
                    continue
                
                # Get screen frame
                screen_data = self.screen_recorder.get_latest_frame()
                screen_frame = screen_data[1] if screen_data else None
                
                # Process both frames
                display_frame, correlation = self.process_frame(webcam_frame, screen_frame)
                
                # Check duration limit
                if duration_minutes:
                    elapsed_min = (time.time() - self.start_time) / 60
                    if elapsed_min >= duration_minutes:
                        print(f"\n✓ Duration limit reached ({duration_minutes} min)")
                        break
                
                # Display
                cv2.imshow('Integrated Exam Proctor', display_frame)
                
                # Handle keyboard
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q') or key == 27:  # 'q' or ESC
                    print("\nStopping...")
                    break
                elif key == ord('r'):
                    self.print_statistics()
                elif key == ord('f'):
                    # Toggle fullscreen
                    is_fullscreen = not is_fullscreen
                    if is_fullscreen:
                        cv2.setWindowProperty('Integrated Exam Proctor', cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
                        print("✓ Fullscreen mode ON")
                    else:
                        cv2.setWindowProperty('Integrated Exam Proctor', cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_NORMAL)
                        print("✓ Fullscreen mode OFF")
        
        except KeyboardInterrupt:
            print("\n\nInterrupted by user")
        except Exception as e:
            print(f"\nError: {e}")
            import traceback
            traceback.print_exc()
        finally:
            print("\n" + "="*80)
            print("SHUTTING DOWN")
            print("="*80)
            
            self.print_statistics()
            
            # Cleanup
            self.screen_recorder.stop_recording()
            self.screen_monitor.stop()
            cap.release()
            self.upper_body_detector.release()
            self.hand_detector.release()
            
            if self.db_enabled:
                try:
                    self.db.end_session(self.session_id)
                    export_file = f"integrated_session_{self.session_id}.json"
                    self.db.export_session_data(self.session_id, export_file)
                except Exception as e:
                    print(f"⚠ Error saving session: {e}")
                
                self.db.close()
            
            cv2.destroyAllWindows()
            
            print("\n✓ Cleanup complete")
            print("="*80)
    
    def print_statistics(self):
        """Print comprehensive statistics"""
        print("\n" + "="*80)
        print("INTEGRATED SESSION STATISTICS")
        print("="*80)
        
        elapsed = time.time() - self.start_time
        
        print(f"\nGeneral:")
        print(f"  Duration: {elapsed/60:.1f} minutes")
        print(f"  Total frames: {self.stats['total_frames']}")
        
        if self.stats['total_frames'] > 0:
            print(f"\nTyping Detection:")
            print(f"  Webcam typing: {self.stats['webcam_typing_frames']} frames "
                  f"({self.stats['webcam_typing_frames']/self.stats['total_frames']*100:.1f}%)")
            print(f"  Screen typing: {self.stats['screen_typing_frames']} frames "
                  f"({self.stats['screen_typing_frames']/self.stats['total_frames']*100:.1f}%)")
            print(f"  Synchronized: {self.stats['synchronized_typing']} frames "
                  f"({self.stats['synchronized_typing']/self.stats['total_frames']*100:.1f}%)")
            
            print(f"\nAnomaly Detection:")
            print(f"  Mismatched frames: {self.stats['mismatch_count']}")
            print(f"  Hands visible: {self.stats['hands_visible_frames']} frames")
            print(f"  Suspicious events: {len(self.stats['suspicious_events'])}")
            
            if self.stats['suspicious_events']:
                print(f"\n  ⚠️  WARNING: {len(self.stats['suspicious_events'])} suspicious events!")
                for i, event in enumerate(self.stats['suspicious_events'][-5:], 1):
                    print(f"     {i}. {event['description']} [{event['severity']}]")
            else:
                print(f"\n  ✓ No major suspicious activity")
        
        # Screen statistics
        screen_stats = self.screen_monitor.get_statistics()
        print(f"\nKeyboard Activity:")
        print(f"  Total keypresses: {screen_stats['total_keypresses']}")
        print(f"  Average rate: {screen_stats['typing_rate']:.1f} keys/s")
        
        print("="*80)


def main():
    print("\n" + "="*80)
    print("INTEGRATED EXAM PROCTORING SYSTEM")
    print("Monitors: Webcam + Screen + Keyboard Activity")
    print("="*80)
    
    try:
        user_id = input("\nStudent ID (Enter for 'test_student'): ").strip() or "test_student"
        exam_id = input("Exam ID (Enter for 'test_exam'): ").strip() or "test_exam"
        duration = input("Duration in minutes (Enter for unlimited): ").strip()
        duration = int(duration) if duration else None
        
        proctor = IntegratedExamProctor(
            user_id=user_id,
            exam_id=exam_id,
            db_connection="mongodb://localhost:27017/"
        )
        
        proctor.run(camera_index=0, duration_minutes=duration)
    except KeyboardInterrupt:
        print("\n\nExiting...")
    except Exception as e:
        print(f"\nFatal error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()