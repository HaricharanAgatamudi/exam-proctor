import cv2
import time
import sys
import numpy as np
from datetime import datetime

try:
    from upper_body_detector import UpperBodyTypingDetector
    from hand_detector import HandDetector
    from database_manager import TypingDetectionDatabase
except ImportError as e:
    print(f"Error importing modules: {e}")
    sys.exit(1)


class ExamProctorSystem:
    def __init__(self, user_id, exam_id, db_connection="mongodb://localhost:27017/"):
        print("\n" + "="*70)
        print("EXAM PROCTORING SYSTEM - INITIALIZATION")
        print("="*70)
        
        print("Initializing detectors...", end=" ")
        self.upper_body_detector = UpperBodyTypingDetector(buffer_size=60)
        self.hand_detector = HandDetector()
        print("✓")
        
        print("Connecting to database...", end=" ")
        self.db = TypingDetectionDatabase(db_connection)
        print("✓")
        
        self.session_id = self.db.create_session(user_id, exam_id, session_type="exam")
        
        self.user_id = user_id
        self.exam_id = exam_id
        self.frame_count = 0
        self.start_time = time.time()
        self.is_calibrated = False
        
        self.stats = {
            'typing_frames': 0,
            'hands_visible_frames': 0,
            'cheating_alerts': 0,
            'total_frames': 0
        }
        
        print(f"\n✓ Session: {self.session_id}")
        print("="*70)
    
    def _convert_for_db(self, data):
        """Convert numpy types to Python native types for MongoDB"""
        if isinstance(data, dict):
            return {key: self._convert_for_db(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._convert_for_db(item) for item in data]
        elif isinstance(data, np.integer):
            return int(data)
        elif isinstance(data, np.floating):
            return float(data)
        elif isinstance(data, np.bool_):
            return bool(data)
        elif isinstance(data, np.ndarray):
            return data.tolist()
        else:
            return data
    
    def calibrate(self, frame):
        print("\nCalibrating...", end=" ")
        success = self.upper_body_detector.calibrate(frame)
        if success:
            self.is_calibrated = True
            print("✓")
        else:
            print("✗ (using defaults)")
            self.is_calibrated = True
        return success
    
    def process_frame(self, frame):
        current_time = time.time()
        timestamp_ms = int(current_time * 1000)
        self.frame_count += 1
        self.stats['total_frames'] += 1
        
        display_frame = frame.copy()
        
        # Detect typing posture
        pose_data = self.upper_body_detector.detect_pose(frame)
        typing_analysis = self.upper_body_detector.analyze_typing_posture(pose_data, current_time)
        
        # Log typing events to database
        if typing_analysis and typing_analysis['is_typing']:
            self.stats['typing_frames'] += 1
            if self.frame_count % 5 == 0:  # Log every 5 frames to reduce DB load
                try:
                    # Convert numpy types before logging
                    typing_analysis_clean = self._convert_for_db(typing_analysis)
                    self.db.log_typing_event(self.session_id, timestamp_ms, typing_analysis_clean)
                except Exception as e:
                    print(f"⚠ DB logging error: {e}")
        
        # Draw typing visualization
        if typing_analysis:
            display_frame = self.upper_body_detector.draw_visualization(display_frame, typing_analysis)
        
        # Detect hands (potential cheating)
        hands_data = self.hand_detector.detect_hands(frame)
        
        if hands_data and len(hands_data) > 0:
            self.stats['hands_visible_frames'] += 1
            self.stats['cheating_alerts'] += 1
            
            display_frame = self.hand_detector.draw_landmarks(display_frame, hands_data)
            
            # Draw alert banner
            h, w = display_frame.shape[:2]
            cv2.rectangle(display_frame, (0, h-100), (w, h), (0, 0, 255), -1)
            cv2.putText(display_frame, f"ALERT: {len(hands_data)} HAND(S) VISIBLE",
                       (20, h-60), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
            cv2.putText(display_frame, "Hands should be on keyboard (below camera)",
                       (20, h-25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 1)
            
            try:
                hands_data_clean = self._convert_for_db(hands_data)
                self.db.log_hand_detection(self.session_id, timestamp_ms, hands_data_clean, 
                                          alert_type="hands_visible_during_exam")
            except Exception as e:
                print(f"⚠ Hand detection logging error: {e}")
            
            print(f"⚠ ALERT: {len(hands_data)} hand(s) at frame {self.frame_count}")
        
        # Calculate FPS
        elapsed_time = current_time - self.start_time
        fps = self.frame_count / elapsed_time if elapsed_time > 0 else 0
        
        # Draw stats panel
        cv2.rectangle(display_frame, (display_frame.shape[1]-320, 10),
                     (display_frame.shape[1]-10, 180), (0, 0, 0), -1)
        cv2.rectangle(display_frame, (display_frame.shape[1]-320, 10),
                     (display_frame.shape[1]-10, 180), (255, 255, 255), 2)
        
        status_texts = [
            f"FPS: {fps:.1f}",
            f"Frame: {self.frame_count}",
            f"Typing: {self.stats['typing_frames']}",
            f"Hands: {self.stats['hands_visible_frames']}",
            f"Alerts: {self.stats['cheating_alerts']}",
            f"Session: {self.session_id[:8]}..."
        ]
        
        y_offset = 35
        for text in status_texts:
            cv2.putText(display_frame, text, (display_frame.shape[1]-310, y_offset),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            y_offset += 25
        
        typing_pct = (self.stats['typing_frames'] / self.stats['total_frames'] * 100) \
                     if self.stats['total_frames'] > 0 else 0
        
        detection_results = {
            'frame_number': self.frame_count,
            'timestamp': timestamp_ms,
            'typing_detected': typing_analysis['is_typing'] if typing_analysis else False,
            'typing_confidence': typing_analysis['confidence'] if typing_analysis else 0.0,
            'hands_visible': len(hands_data) if hands_data else 0,
            'is_suspicious': (len(hands_data) > 0) if hands_data else False,
            'fps': fps,
            'typing_percentage': typing_pct
        }
        
        return display_frame, detection_results
    
    def run(self, camera_index=0, duration_minutes=None):
        print("\nOpening camera...")
        cap = cv2.VideoCapture(camera_index)
        
        if not cap.isOpened():
            print("ERROR: Cannot open camera index 0")
            print("Trying camera index 1...")
            cap = cv2.VideoCapture(1)
            if not cap.isOpened():
                print("ERROR: No camera found!")
                return
        
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, 30)
        
        # Test camera
        ret, test_frame = cap.read()
        if not ret:
            print("ERROR: Cannot read from camera!")
            cap.release()
            return
        
        print(f"✓ Camera opened - Resolution: {test_frame.shape[1]}x{test_frame.shape[0]}")
        
        print("\n" + "="*70)
        print("EXAM PROCTORING - ACTIVE")
        print("="*70)
        print("\nInstructions:")
        print("  • Sit in normal typing position")
        print("  • Keep hands on keyboard (below camera)")
        print("  • Press 'C' to calibrate")
        print("  • Press 'S' to skip calibration")
        print("  • Press 'Q' to quit")
        print("  • Press 'R' to show report")
        print("\n" + "="*70 + "\n")
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("Failed to capture frame")
                    break
                
                frame = cv2.flip(frame, 1)
                
                # Calibration phase
                if not self.is_calibrated:
                    cv2.putText(frame, "CALIBRATION - Press 'C' or 'S' to skip",
                               (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
                    cv2.imshow('Exam Proctor', frame)
                    
                    key = cv2.waitKey(1) & 0xFF
                    if key == ord('c'):
                        self.calibrate(frame)
                    elif key == ord('s'):
                        self.is_calibrated = True
                        print("⏭ Skipped calibration")
                    elif key == ord('q'):
                        print("Quitting...")
                        break
                    continue
                
                # Process frame
                display_frame, results = self.process_frame(frame)
                
                # Check duration limit
                if duration_minutes:
                    elapsed_min = (time.time() - self.start_time) / 60
                    remaining = duration_minutes - elapsed_min
                    
                    # Draw timer
                    timer_text = f"Time: {elapsed_min:.1f}/{duration_minutes} min"
                    cv2.putText(display_frame, timer_text, (10, display_frame.shape[0] - 10),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
                    
                    if elapsed_min >= duration_minutes:
                        print(f"\n✓ Duration limit reached ({duration_minutes} min)")
                        break
                
                cv2.imshow('Exam Proctor', display_frame)
                
                # Handle keyboard input
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    print("\nStopping...")
                    break
                elif key == ord('r'):
                    self.print_statistics()
        
        except KeyboardInterrupt:
            print("\n\nInterrupted by user (Ctrl+C)")
        except Exception as e:
            print(f"\nError during execution: {e}")
            import traceback
            traceback.print_exc()
        finally:
            print("\n" + "="*70)
            print("SHUTTING DOWN")
            print("="*70)
            
            self.print_statistics()
            
            try:
                self.db.end_session(self.session_id)
                export_file = f"session_{self.session_id}.json"
                self.db.export_session_data(self.session_id, export_file)
            except Exception as e:
                print(f"⚠ Error saving session data: {e}")
            
            cap.release()
            self.upper_body_detector.release()
            self.hand_detector.release()
            self.db.close()
            cv2.destroyAllWindows()
            
            print("\n✓ Cleanup complete")
            print("="*70)
    
    def print_statistics(self):
        print("\n" + "="*70)
        print("SESSION STATISTICS")
        print("="*70)
        
        elapsed = time.time() - self.start_time
        
        print(f"\nGeneral:")
        print(f"  Duration: {elapsed/60:.1f} minutes")
        print(f"  Total frames: {self.stats['total_frames']}")
        if elapsed > 0:
            print(f"  Average FPS: {self.frame_count/elapsed:.1f}")
        
        if self.stats['total_frames'] > 0:
            typing_pct = (self.stats['typing_frames'] / self.stats['total_frames'] * 100)
            print(f"\nTyping Detection:")
            print(f"  Frames with typing: {self.stats['typing_frames']}")
            print(f"  Typing percentage: {typing_pct:.1f}%")
            
            print(f"\nCheating Detection:")
            print(f"  Frames with hands: {self.stats['hands_visible_frames']}")
            print(f"  Total alerts: {self.stats['cheating_alerts']}")
            
            if self.stats['cheating_alerts'] > 0:
                print(f"\n  ⚠ WARNING: Suspicious activity detected!")
            else:
                print(f"\n  ✓ No suspicious activity")
        
        try:
            db_stats = self.db.compute_session_statistics(self.session_id)
            if db_stats:
                print(f"\nDatabase Statistics:")
                print(f"  Typing events: {db_stats.get('typing_detected_frames', 0)}")
                print(f"  Average confidence: {db_stats.get('average_confidence', 0):.2%}")
                print(f"  Max typing duration: {db_stats.get('max_typing_duration', 0):.1f}s")
        except Exception as e:
            print(f"\n⚠ Could not retrieve database statistics: {e}")
        
        print("="*70)


def main():
    print("\n" + "="*70)
    print("EXAM PROCTORING SYSTEM")
    print("="*70)
    
    user_id = input("\nStudent ID (Enter for 'test_student'): ").strip()
    if not user_id:
        user_id = "test_student"
    
    exam_id = input("Exam ID (Enter for 'test_exam'): ").strip()
    if not exam_id:
        exam_id = "test_exam"
    
    duration = input("Duration in minutes (Enter for unlimited): ").strip()
    duration = int(duration) if duration else None
    
    try:
        proctor = ExamProctorSystem(
            user_id=user_id,
            exam_id=exam_id,
            db_connection="mongodb://localhost:27017/"
        )
        
        proctor.run(camera_index=0, duration_minutes=duration)
    except Exception as e:
        print(f"\nFatal error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()