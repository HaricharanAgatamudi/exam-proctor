import cv2
import mediapipe as mp
import numpy as np

class UpperBodyDetector:
    def __init__(self):
        # Face detection
        self.mp_face = mp.solutions.face_detection
        self.face_detection = self.mp_face.FaceDetection(
            min_detection_confidence=0.6  # Increased confidence
        )
        
        print("✅ UpperBodyDetector initialized")
        
    def detect(self, frame):
        """Detect faces"""
        try:
            if frame is None or frame.size == 0:
                return {'face_count': 0, 'looking_away': False}
            
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.face_detection.process(rgb_frame)
            
            face_count = 0
            if results.detections:
                face_count = len(results.detections)
            
            return {
                'face_count': face_count,
                'looking_away': False
            }
            
        except Exception as e:
            print(f"❌ Face detection error: {e}")
            return {'face_count': 0, 'looking_away': False}
    
    def cleanup(self):
        """Release resources"""
        if self.face_detection:
            self.face_detection.close()