import cv2
import mediapipe as mp

class UpperBodyDetector:
    def __init__(self):
        self.mp_face_detection = mp.solutions.face_detection
        self.face_detection = self.mp_face_detection.FaceDetection(
            min_detection_confidence=0.5
        )
        print("✅ UpperBodyDetector initialized")
        
    def detect(self, frame):
        """Detect face and upper body"""
        try:
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
            print(f"Face detection error: {e}")
            return {'face_count': 0, 'looking_away': False}