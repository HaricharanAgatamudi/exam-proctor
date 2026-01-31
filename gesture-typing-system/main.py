# main.py
"""
Main Application for Gesture-Based Typing System
Integrates all modules and runs the main processing loop
"""

import cv2
import time
import sys
import traceback

try:
    from config import Config
    from hand_detector import HandDetector
    from gesture_classifier import GestureClassifier
    from typing_detector import TypingDetector
    from keystroke_mapper import KeystrokeMapper
    from synchronizer import GestureSynchronizer
    from output_manager import OutputManager
    from visualizer import Visualizer
    print("✓ All modules imported successfully")
except Exception as e:
    print(f"ERROR importing modules: {e}")
    print(traceback.format_exc())
    input("Press Enter to exit...")
    sys.exit(1)

class GestureTypingSystem:
    def __init__(self):
        """Initialize all system components"""
        print("\n" + "="*60)
        print("GESTURE-BASED TYPING SYSTEM")
        print("="*60)
        print("\nInitializing components...")
        
        try:
            print("  - Initializing hand detector...", end="")
            self.hand_detector = HandDetector()
            print(" ✓")
            
            print("  - Initializing gesture classifier...", end="")
            self.gesture_classifier = GestureClassifier()
            print(" ✓")
            
            print("  - Initializing typing detector...", end="")
            self.typing_detector = TypingDetector()
            print(" ✓")
            
            print("  - Initializing keystroke mapper...", end="")
            self.keystroke_mapper = KeystrokeMapper()
            print(" ✓")
            
            print("  - Initializing synchronizer...", end="")
            self.synchronizer = GestureSynchronizer()
            print(" ✓")
            
            print("  - Initializing output manager...", end="")
            self.output_manager = OutputManager()
            print(" ✓")
            
            print(f"  - Opening camera (index {Config.CAMERA_INDEX})...", end="")
            self.cap = cv2.VideoCapture(Config.CAMERA_INDEX)
            
            if not self.cap.isOpened():
                print(" ✗ FAILED")
                print("\nERROR: Cannot open camera!")
                print("Try changing CAMERA_INDEX in config.py (try 0, 1, 2)")
                input("Press Enter to exit...")
                sys.exit(1)
            
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, Config.FRAME_WIDTH)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, Config.FRAME_HEIGHT)
            self.cap.set(cv2.CAP_PROP_FPS, Config.FPS)
            print(" ✓")
            
            print("  - Initializing visualizer...", end="")
            self.visualizer = Visualizer(Config.FRAME_WIDTH, Config.FRAME_HEIGHT)
            print(" ✓")
            
            self.is_running = False
            self.is_calibrated = False
            self.show_keyboard_zones = True
            
            print("\n✓ System initialized successfully!")
            print("="*60)
            
        except Exception as e:
            print(f"\n\nERROR during initialization: {e}")
            print(traceback.format_exc())
            input("Press Enter to exit...")
            sys.exit(1)
    
    def calibrate_system(self):
        """Run calibration sequence"""
        print("\n" + "="*60)
        print("CALIBRATION MODE")
        print("="*60)
        print("\nInstructions:")
        print("  1. Place BOTH hands in view of camera")
        print("  2. Position hands on 'home row':")
        print("     - Left hand: fingers on A, S, D, F")
        print("     - Right hand: fingers on J, K, L, ;")
        print("  3. Press 'C' to calibrate (needs both hands visible)")
        print("  4. Press 'S' to skip calibration")
        print("\nWaiting for hands...")
        
        calibration_window = 'Calibration - Gesture Typing System'
        
        try:
            while True:
                ret, frame = self.cap.read()
                if not ret:
                    print("ERROR: Failed to read from camera")
                    break
                
                frame = cv2.flip(frame, 1)
                
                hands_data = self.hand_detector.detect_hands(frame)
                
                if hands_data:
                    frame = self.hand_detector.draw_landmarks(frame, hands_data)
                    
                    # Show instructions on frame
                    cv2.putText(
                        frame,
                        f"Hands detected: {len(hands_data)} | Press 'C' to calibrate, 'S' to skip",
                        (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 255, 0),
                        2
                    )
                    
                    if len(hands_data) == 2:
                        cv2.putText(
                            frame,
                            "BOTH HANDS DETECTED - Ready to calibrate!",
                            (20, 100),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.8,
                            (0, 255, 0),
                            2
                        )
                else:
                    cv2.putText(
                        frame,
                        "No hands detected - Show both hands to camera",
                        (20, 50),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 0, 255),
                        2
                    )
                
                cv2.imshow(calibration_window, frame)
                
                key = cv2.waitKey(1) & 0xFF
                
                if key == ord('c'):
                    if len(hands_data) == 2:
                        reference_positions = {}
                        for hand_data in hands_data:
                            hand_type = hand_data['hand_type']
                            landmarks = hand_data['landmarks']
                            middle_tip = landmarks[12]
                            reference_positions[hand_type] = (middle_tip[0], middle_tip[1])
                        
                        self.keystroke_mapper.calibrate(reference_positions)
                        self.is_calibrated = True
                        print("\n✓ Calibration complete!")
                        break
                    else:
                        print(f"ERROR: Need 2 hands, detected {len(hands_data)}")
                        cv2.putText(
                            frame,
                            "ERROR: Both hands must be visible!",
                            (20, 150),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.8,
                            (0, 0, 255),
                            2
                        )
                        cv2.imshow(calibration_window, frame)
                        cv2.waitKey(1000)
                
                elif key == ord('s'):
                    print("\n⚠ Calibration skipped - using default settings")
                    self.is_calibrated = True
                    break
                
                elif key == ord('q'):
                    print("\n✗ Calibration cancelled by user")
                    cv2.destroyWindow(calibration_window)
                    self.cleanup()
                    sys.exit(0)
            
            cv2.destroyWindow(calibration_window)
            
        except Exception as e:
            print(f"\nERROR during calibration: {e}")
            print(traceback.format_exc())
            cv2.destroyWindow(calibration_window)
            input("Press Enter to exit...")
            sys.exit(1)
    
    def process_frame(self, frame, current_time):
        """Process a single frame"""
        hands_data = self.hand_detector.detect_hands(frame)
        
        typing_events = []
        key_predictions = []
        gesture_labels = []
        
        if hands_data:
            if Config.DRAW_LANDMARKS:
                frame = self.hand_detector.draw_landmarks(frame, hands_data)
            
            for hand_data in hands_data:
                landmarks = hand_data['landmarks']
                hand_type = hand_data['hand_type']
                
                finger_states = self.hand_detector.get_finger_states(landmarks)
                
                static_gesture = self.gesture_classifier.classify_static_gesture(
                    landmarks, finger_states
                )
                gesture_labels.append(static_gesture)
                
                self.gesture_classifier.add_to_history(landmarks)
                
                typing_events_hand = self.typing_detector.detect_typing_motion(
                    landmarks, hand_type, current_time
                )
                typing_events.extend(typing_events_hand)
            
            if Config.SHOW_GESTURE_LABEL:
                frame = self.visualizer.draw_gesture_label(
                    frame, hands_data, gesture_labels
                )
        
        for typing_event in typing_events:
            key_prediction = self.keystroke_mapper.map_typing_event_to_key(typing_event)
            key_predictions.append(key_prediction)
            
            sync_result = self.synchronizer.process_keystroke(key_prediction, current_time)
            
            if sync_result['should_send']:
                self.output_manager.send_keystroke(sync_result['key'])
                print(f"Key sent: {sync_result['key']}")
        
        if typing_events:
            frame = self.visualizer.draw_typing_indicator(frame, typing_events)
        
        if key_predictions:
            frame = self.visualizer.draw_predicted_key(frame, key_predictions[-1])
        
        if Config.SHOW_TYPED_TEXT:
            typed_text = self.output_manager.get_text_buffer()
            frame = self.visualizer.draw_typed_text(frame, typed_text)
        
        if self.show_keyboard_zones:
            frame = self.visualizer.draw_keyboard_zones(frame)
        
        return frame
    
    def run(self):
        """Main application loop"""
        try:
            if not self.is_calibrated:
                self.calibrate_system()
            
            self.is_running = True
            
            print("\n" + "="*60)
            print("TYPING MODE")
            print("="*60)
            print("\nControls:")
            print("  Q - Quit application")
            print("  R - Reset system")
            print("  K - Toggle keyboard zones")
            print("  S - Save typed text to file")
            print("  T - Show detailed statistics")
            print("\n✓ System running - Start typing with hand gestures!")
            print("="*60 + "\n")
            
            main_window = 'Gesture-Based Typing System'
            
            while self.is_running:
                start_time = time.time()
                
                ret, frame = self.cap.read()
                if not ret:
                    print("ERROR: Failed to capture frame")
                    break
                
                frame = cv2.flip(frame, 1)
                
                frame = self.process_frame(frame, start_time)
                
                frame_time = time.time() - start_time
                fps = self.visualizer.calculate_fps(frame_time)
                
                if Config.SHOW_FPS:
                    frame = self.visualizer.draw_fps(frame, fps)
                
                info_dict = {
                    'FPS': f"{fps:.1f}",
                    'Hands': len(self.hand_detector.results.multi_hand_landmarks) 
                            if self.hand_detector.results.multi_hand_landmarks else 0,
                    'Keys': self.output_manager.total_keystrokes_sent,
                    'WPM': f"{self.output_manager.get_typing_speed():.1f}"
                }
                frame = self.visualizer.draw_info_panel(frame, info_dict)
                
                cv2.imshow(main_window, frame)
                
                key = cv2.waitKey(1) & 0xFF
                
                if key == ord('q'):
                    print("\n✓ Shutting down...")
                    self.is_running = False
                
                elif key == ord('r'):
                    print("\n↻ Resetting system...")
                    self.reset_system()
                
                elif key == ord('k'):
                    self.show_keyboard_zones = not self.show_keyboard_zones
                    status = 'ON' if self.show_keyboard_zones else 'OFF'
                    print(f"⌨ Keyboard zones: {status}")
                
                elif key == ord('s'):
                    print("💾 Saving typed text...")
                    self.output_manager.save_text_to_file()
                
                elif key == ord('t'):
                    self.print_statistics()
        
        except KeyboardInterrupt:
            print("\n\n✗ Interrupted by user (Ctrl+C)")
        
        except Exception as e:
            print(f"\n\nERROR in main loop: {e}")
            print(traceback.format_exc())
            input("Press Enter to exit...")
        
        finally:
            self.cleanup()
    
    def reset_system(self):
        """Reset all system components"""
        self.typing_detector.reset()
        self.synchronizer.reset()
        self.output_manager.reset()
        self.gesture_classifier.clear_history()
        print("✓ System reset complete")
    
    def print_statistics(self):
        """Print detailed statistics"""
        print("\n" + "="*60)
        print("SYSTEM STATISTICS")
        print("="*60)
        
        output_stats = self.output_manager.get_statistics()
        sync_stats = self.synchronizer.get_statistics()
        typing_stats = self.typing_detector.get_typing_statistics()
        
        print("\n📊 Output Statistics:")
        for key, value in output_stats.items():
            print(f"  • {key}: {value}")
        
        print("\n⏱ Synchronization Statistics:")
        for key, value in sync_stats.items():
            print(f"  • {key}: {value}")
        
        print("\n⌨ Typing Statistics:")
        for key, value in typing_stats.items():
            print(f"  • {key}: {value}")
        
        print("="*60 + "\n")
    
    def cleanup(self):
        """Cleanup resources"""
        print("\n" + "="*60)
        print("CLEANUP")
        print("="*60)
        
        if self.output_manager.text_buffer:
            print("\n💾 Saving final text...")
            self.output_manager.save_text_to_file()
        
        self.print_statistics()
        
        print("\n🔧 Releasing resources...")
        self.cap.release()
        self.hand_detector.release()
        cv2.destroyAllWindows()
        
        print("\n✓ Cleanup complete. Goodbye!")
        print("="*60 + "\n")

def main():
    """Entry point"""
    try:
        print("\n" + "="*60)
        print("  GESTURE-BASED TYPING SYSTEM")
        print("  Starting application...")
        print("="*60)
        
        system = GestureTypingSystem()
        system.run()
        
    except Exception as e:
        print(f"\n\nFATAL ERROR: {e}")
        print(traceback.format_exc())
        input("\nPress Enter to exit...")
        sys.exit(1)

if __name__ == "__main__":
    main()