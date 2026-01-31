import cv2
import mediapipe as mp
import numpy as np
import math
from collections import deque

class HandDetector:
    """
    BALANCED Hand Detection for Ghost Typing
    
    Philosophy: Detect real ghost typing while avoiding false positives
    Balance between Documents 8 (too lenient) and previous (too strict)
    """
    
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.5,  # BALANCED
            min_tracking_confidence=0.5,
            model_complexity=1
        )
        self.mp_draw = mp.solutions.drawing_utils
        
        # Moderate history - not too long, not too short
        self.typing_history = deque(maxlen=20)  # 2 seconds at 10fps
        self.hands_visible_history = deque(maxlen=20)
        
        print("✅ HandDetector initialized - BALANCED MODE")
        
    def detect(self, frame):
        """
        BALANCED hand detection
        
        Returns smoothed, reliable results
        """
        try:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb_frame)
            
            # No hands detected
            if not results.multi_hand_landmarks:
                self.hands_visible_history.append(0)
                self.typing_history.append(0)
                
                # Require consistent absence (10+ frames = 1 second)
                recent_invisible = sum(1 for x in list(self.hands_visible_history)[-10:] if x == 0)
                
                return {
                    'hands': [],
                    'count': 0,
                    'hands_visible': False,
                    'in_typing_position': False,
                    'typing_gesture_detected': False,
                    'confidence': 0.0,
                    'smoothed_typing': sum(self.typing_history) >= 8,  # Need 8/20 frames
                    'smoothed_visibility': recent_invisible < 8  # Assume present unless really absent
                }
            
            # Hands detected
            self.hands_visible_history.append(1)
            
            hands_data = {
                'hands': [],
                'count': len(results.multi_hand_landmarks),
                'hands_visible': True,
                'in_typing_position': False,
                'typing_gesture_detected': False,
                'confidence': 0.0
            }
            
            typing_confidence_scores = []
            
            for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                landmarks = []
                for landmark in hand_landmarks.landmark:
                    landmarks.append({
                        'x': landmark.x,
                        'y': landmark.y,
                        'z': landmark.z
                    })
                
                # BALANCED typing analysis
                typing_score, typing_details = self._balanced_typing_analysis(landmarks, frame.shape)
                typing_confidence_scores.append(typing_score)
                
                hands_data['hands'].append({
                    'landmarks': landmarks,
                    'is_typing': typing_score > 0.4,  # BALANCED threshold
                    'typing_confidence': typing_score,
                    'details': typing_details
                })
            
            # Overall typing detection - BALANCED
            max_confidence = max(typing_confidence_scores) if typing_confidence_scores else 0.0
            
            hands_data['typing_gesture_detected'] = max_confidence > 0.35  # BALANCED
            hands_data['in_typing_position'] = max_confidence > 0.30  # BALANCED
            hands_data['confidence'] = max_confidence
            
            # Update history
            self.typing_history.append(1 if hands_data['typing_gesture_detected'] else 0)
            
            # BALANCED smoothing: Need 8+ of last 20 frames (40%)
            hands_data['smoothed_typing'] = sum(self.typing_history) >= 8
            hands_data['smoothed_visibility'] = sum(self.hands_visible_history) >= 10
            
            return hands_data
            
        except Exception as e:
            print(f"❌ Hand detection error: {e}")
            # On error, return neutral state
            return {
                'hands': [],
                'count': 0,
                'hands_visible': False,
                'in_typing_position': False,
                'typing_gesture_detected': False,
                'confidence': 0.0,
                'smoothed_typing': False,
                'smoothed_visibility': False
            }
    
    def _balanced_typing_analysis(self, landmarks, frame_shape):
        """
        BALANCED typing analysis
        
        Detects typical typing positions while allowing for variation
        """
        try:
            height, width = frame_shape[:2]
            score = 0.0
            max_score = 10.0
            details = {}
            
            # Key landmarks
            wrist = landmarks[0]
            thumb_tip = landmarks[4]
            index_tip = landmarks[8]
            middle_tip = landmarks[12]
            ring_tip = landmarks[16]
            pinky_tip = landmarks[20]
            palm_base = landmarks[9]
            
            # Start at neutral
            score = 3.0  # 30% base
            
            # === CRITERION 1: Hand Position (in lower 60% of frame) ===
            if 0.4 < wrist['y'] < 0.9:  # Lower part of frame
                score += 2.5
                details['hand_in_typing_area'] = True
            else:
                score -= 1.0
                details['hand_in_typing_area'] = False
            
            # === CRITERION 2: Finger Curl (natural typing position) ===
            finger_tips = [index_tip, middle_tip, ring_tip, pinky_tip]
            curled_fingers = 0
            
            for tip in finger_tips:
                dist_from_palm = math.sqrt(
                    (tip['x'] - palm_base['x'])**2 + 
                    (tip['y'] - palm_base['y'])**2
                )
                # Typing: fingers slightly curled, not extended or clenched
                if 0.08 < dist_from_palm < 0.25:
                    curled_fingers += 1
            
            if curled_fingers >= 2:  # At least 2 fingers in typing position
                score += 2.0
                details['fingers_curled'] = True
            elif curled_fingers >= 1:
                score += 1.0
                details['fingers_curled'] = 'partial'
            else:
                details['fingers_curled'] = False
            
            # === CRITERION 3: Hand Orientation (not waving/pointing) ===
            fingers_up = 0
            for tip in finger_tips:
                if tip['y'] < wrist['y'] - 0.12:  # Significantly above wrist
                    fingers_up += 1
            
            if fingers_up >= 3:  # Waving or pointing
                score -= 2.0
                details['not_waving'] = False
            else:
                score += 1.5
                details['not_waving'] = True
            
            # === CRITERION 4: Hand not clenched (not a fist) ===
            all_tips_close = all(
                math.sqrt((tip['x'] - palm_base['x'])**2 + (tip['y'] - palm_base['y'])**2) < 0.05
                for tip in finger_tips
            )
            
            if not all_tips_close:
                score += 1.0
                details['not_fist'] = True
            else:
                score -= 1.0
                details['not_fist'] = False
            
            # === BONUS: Horizontal hand position (typical for keyboard) ===
            if 0.3 < wrist['x'] < 0.7:  # Center area
                score += 0.5
                details['centered'] = True
            
            # Normalize to 0.0-1.0
            confidence = max(0.0, min(1.0, score / max_score))
            
            details['raw_score'] = score
            details['max_score'] = max_score
            details['confidence'] = confidence
            
            return confidence, details
            
        except Exception as e:
            print(f"Error in typing analysis: {e}")
            return 0.0, {'error': str(e)}
    
    def draw_landmarks(self, frame, hands_data):
        """Draw hand landmarks on frame"""
        if not hands_data or len(hands_data) == 0:
            return frame
        
        for hand in hands_data:
            # Draw simple indicators
            pass
        
        return frame
    
    def cleanup(self):
        """Release resources"""
        if self.hands:
            self.hands.close()