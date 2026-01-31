import cv2
import numpy as np
from datetime import datetime
from hand_detector import HandDetector
from upper_body_detector import UpperBodyDetector
from exam_proctor_detector import ExamProctorDetector
import time

class RealtimeProctor:
    def __init__(self, student_id, exam_id):
        self.student_id = student_id
        self.exam_id = exam_id
        self.hand_detector = HandDetector()
        self.body_detector = UpperBodyDetector()
        self.proctor_detector = ExamProctorDetector()
        
        self.last_hand_positions = []
        self.suspicious_typing_count = 0
        self.no_face_count = 0
        self.multiple_face_count = 0
        self.looking_away_count = 0
        
        self.start_time = time.time()
        
    def process_frame(self, frame):
        """Process a single video frame and detect violations"""
        violations = []
        timestamp = datetime.now().isoformat()
        
        # 1. Detect hands and analyze typing patterns
        hands_result = self.hand_detector.detect(frame)
        if hands_result:
            typing_pattern = self._analyze_typing_pattern(hands_result)
            if typing_pattern['is_ghost_typing']:
                self.suspicious_typing_count += 1
                violations.append({
                    'type': 'GHOST_TYPING',
                    'severity': 'HIGH',
                    'timestamp': timestamp,
                    'details': typing_pattern,
                    'confidence': typing_pattern['confidence']
                })
        
        # 2. Face and body detection
        body_result = self.body_detector.detect(frame)
        
        # Check for no face
        if body_result['face_count'] == 0:
            self.no_face_count += 1
            if self.no_face_count > 15:  # 0.5 seconds at 30fps
                violations.append({
                    'type': 'NO_FACE_DETECTED',
                    'severity': 'HIGH',
                    'timestamp': timestamp,
                    'details': 'Student not visible in camera'
                })
        else:
            self.no_face_count = 0
        
        # Check for multiple faces
        if body_result['face_count'] > 1:
            self.multiple_face_count += 1
            if self.multiple_face_count > 10:
                violations.append({
                    'type': 'MULTIPLE_PERSONS',
                    'severity': 'CRITICAL',
                    'timestamp': timestamp,
                    'details': f"{body_result['face_count']} faces detected"
                })
        else:
            self.multiple_face_count = 0
        
        # Check head pose (looking away)
        if body_result.get('looking_away'):
            self.looking_away_count += 1
            if self.looking_away_count > 60:  # 2 seconds
                violations.append({
                    'type': 'LOOKING_AWAY',
                    'severity': 'MEDIUM',
                    'timestamp': timestamp,
                    'details': 'Student looking away from screen'
                })
        else:
            self.looking_away_count = 0
        
        return violations
    
    def _analyze_typing_pattern(self, hands_result):
        """Analyze hand movements for ghost typing detection"""
        current_positions = []
        
        for hand in hands_result['hands']:
            # Get fingertip positions
            fingertips = [hand['landmarks'][i] for i in [4, 8, 12, 16, 20]]
            current_positions.append(fingertips)
        
        self.last_hand_positions.append(current_positions)
        if len(self.last_hand_positions) > 30:  # Keep last 1 second
            self.last_hand_positions.pop(0)
        
        # Ghost typing indicators
        is_ghost_typing = False
        confidence = 0.0
        reasons = []
        
        if len(self.last_hand_positions) >= 10:
            # Calculate movement velocity
            velocities = self._calculate_velocities()
            
            # Check for unnatural patterns
            if self._check_robotic_movement(velocities):
                is_ghost_typing = True
                confidence += 0.3
                reasons.append("Robotic movement pattern")
            
            if self._check_simultaneous_finger_movement():
                is_ghost_typing = True
                confidence += 0.3
                reasons.append("Simultaneous finger movement")
            
            if self._check_hovering_hands():
                is_ghost_typing = True
                confidence += 0.2
                reasons.append("Hands hovering above keyboard")
            
            if self._check_typing_speed_anomaly():
                is_ghost_typing = True
                confidence += 0.2
                reasons.append("Abnormal typing speed")
        
        return {
            'is_ghost_typing': is_ghost_typing,
            'confidence': min(confidence, 1.0),
            'reasons': reasons,
            'hand_count': len(current_positions)
        }
    
    def _calculate_velocities(self):
        """Calculate finger movement velocities"""
        velocities = []
        for i in range(1, len(self.last_hand_positions)):
            prev = self.last_hand_positions[i-1]
            curr = self.last_hand_positions[i]
            # Calculate movement for each finger
            # Implementation here
        return velocities
    
    def _check_robotic_movement(self, velocities):
        """Check if movements are too uniform (robotic)"""
        if len(velocities) < 5:
            return False
        std_dev = np.std(velocities)
        return std_dev < 0.01  # Too uniform
    
    def _check_simultaneous_finger_movement(self):
        """Check if all fingers move at exact same time"""
        # Implementation
        return False
    
    def _check_hovering_hands(self):
        """Check if hands are not making contact with keyboard"""
        # Implementation
        return False
    
    def _check_typing_speed_anomaly(self):
        """Check for superhuman typing speed"""
        # Implementation
        return False
    
    def analyze_screen(self, screen_frame):
        """Analyze screen capture for suspicious activity"""
        violations = []
        timestamp = datetime.now().isoformat()
        
        # Detect browser tabs/windows switching
        # Detect external applications
        # Detect copy-paste from external sources
        
        return violations
    
    def generate_report(self, violations):
        """Generate final proctoring report"""
        exam_duration = time.time() - self.start_time
        
        violation_counts = {}
        for v in violations:
            vtype = v['type']
            violation_counts[vtype] = violation_counts.get(vtype, 0) + 1
        
        report = {
            'studentId': self.student_id,
            'examId': self.exam_id,
            'duration': exam_duration,
            'totalViolations': len(violations),
            'violationSummary': violation_counts,
            'detailedViolations': violations,
            'riskLevel': self._calculate_risk_level(violations),
            'timestamp': datetime.now().isoformat()
        }
        
        return report
    
    def _calculate_risk_level(self, violations):
        """Calculate overall risk level"""
        critical = sum(1 for v in violations if v['severity'] == 'CRITICAL')
        high = sum(1 for v in violations if v['severity'] == 'HIGH')
        
        if critical > 0 or high > 5:
            return 'HIGH_RISK'
        elif high > 0:
            return 'MEDIUM_RISK'
        else:
            return 'LOW_RISK'