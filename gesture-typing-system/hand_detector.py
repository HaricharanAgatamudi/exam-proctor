# hand_detector.py
"""
Hand Detection Module using MediaPipe Hands
Detects and tracks hands in video frames, extracts 21 landmarks per hand
"""

import cv2
import mediapipe as mp
import numpy as np
from config import Config

class HandDetector:
    def __init__(self):
        """Initialize MediaPipe Hands solution"""
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=Config.MAX_NUM_HANDS,
            min_detection_confidence=Config.MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=Config.MIN_TRACKING_CONFIDENCE
        )
        
        self.results = None
        
    def detect_hands(self, frame):
        """
        Detect hands in the given frame
        
        Args:
            frame: BGR image from camera
            
        Returns:
            list of hand data dictionaries
        """
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process the frame
        self.results = self.hands.process(rgb_frame)
        
        hands_data = []
        
        if self.results.multi_hand_landmarks:
            for idx, hand_landmarks in enumerate(self.results.multi_hand_landmarks):
                # Extract landmarks as list of (x, y, z) tuples
                landmarks = []
                for landmark in hand_landmarks.landmark:
                    landmarks.append((landmark.x, landmark.y, landmark.z))
                
                # Get hand type (Left/Right)
                hand_type = self.results.multi_handedness[idx].classification[0].label
                confidence = self.results.multi_handedness[idx].classification[0].score
                
                hands_data.append({
                    'landmarks': landmarks,
                    'hand_type': hand_type,
                    'confidence': confidence,
                    'raw_landmarks': hand_landmarks
                })
        
        return hands_data
    
    def get_finger_tips(self, landmarks):
        """Get fingertip coordinates from landmarks"""
        FINGER_TIPS = {
            'thumb': 4,
            'index': 8,
            'middle': 12,
            'ring': 16,
            'pinky': 20
        }
        
        fingertips = {}
        for finger_name, tip_idx in FINGER_TIPS.items():
            fingertips[finger_name] = landmarks[tip_idx]
        
        return fingertips
    
    def get_finger_states(self, landmarks):
        """Determine if each finger is extended or bent"""
        FINGER_INDICES = {
            'thumb': [1, 2, 3, 4],
            'index': [5, 6, 7, 8],
            'middle': [9, 10, 11, 12],
            'ring': [13, 14, 15, 16],
            'pinky': [17, 18, 19, 20]
        }
        
        finger_states = {}
        
        for finger_name, indices in FINGER_INDICES.items():
            base_to_tip = np.linalg.norm(
                np.array(landmarks[indices[3]][:2]) - np.array(landmarks[indices[0]][:2])
            )
            
            pip_to_tip = np.linalg.norm(
                np.array(landmarks[indices[3]][:2]) - np.array(landmarks[indices[1]][:2])
            )
            
            finger_states[finger_name] = base_to_tip > pip_to_tip * 1.3
        
        return finger_states
    
    def calculate_bounding_box(self, landmarks, frame_shape):
        """Calculate bounding box around the hand"""
        h, w = frame_shape[:2]
        
        x_coords = [lm[0] * w for lm in landmarks]
        y_coords = [lm[1] * h for lm in landmarks]
        
        padding = 20
        x_min = max(0, int(min(x_coords)) - padding)
        y_min = max(0, int(min(y_coords)) - padding)
        x_max = min(w, int(max(x_coords)) + padding)
        y_max = min(h, int(max(y_coords)) + padding)
        
        return (x_min, y_min, x_max, y_max)
    
    def draw_landmarks(self, frame, hands_data):
        """Draw hand landmarks and connections on the frame"""
        for hand_data in hands_data:
            self.mp_drawing.draw_landmarks(
                frame,
                hand_data['raw_landmarks'],
                self.mp_hands.HAND_CONNECTIONS,
                self.mp_drawing_styles.get_default_hand_landmarks_style(),
                self.mp_drawing_styles.get_default_hand_connections_style()
            )
            
            # Draw hand type label
            landmarks = hand_data['landmarks']
            wrist = landmarks[0]
            h, w = frame.shape[:2]
            pos = (int(wrist[0] * w), int(wrist[1] * h) - 20)
            
            cv2.putText(
                frame,
                f"{hand_data['hand_type']} ({hand_data['confidence']:.2f})",
                pos,
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                Config.COLOR_TEXT,
                2
            )
        
        return frame
    
    def release(self):
        """Release MediaPipe resources"""
        self.hands.close()