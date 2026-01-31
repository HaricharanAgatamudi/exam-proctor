import cv2
import mediapipe as mp
import numpy as np
from collections import deque
import time

# Try to import scipy, use fallback if not available
try:
    from scipy import signal
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False
    print("⚠ Warning: scipy not available, using basic FFT")


class UpperBodyTypingDetector:
    
    def __init__(self, buffer_size=60):
        self.mp_pose = mp.solutions.pose
        self.mp_drawing = mp.solutions.drawing_utils
        self.pose = self.mp_pose.Pose(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            model_complexity=1
        )
        
        self.buffer_size = buffer_size
        self.shoulder_positions = {
            'left': deque(maxlen=buffer_size),
            'right': deque(maxlen=buffer_size)
        }
        self.elbow_angles = {
            'left': deque(maxlen=buffer_size),
            'right': deque(maxlen=buffer_size)
        }
        self.shoulder_angles = {
            'left': deque(maxlen=buffer_size),
            'right': deque(maxlen=buffer_size)
        }
        
        self.is_typing = False
        self.typing_confidence = 0.0
        self.typing_duration = 0.0
        self.last_typing_time = 0.0
        
        self.baseline_elbow_angle = 90.0
        self.baseline_shoulder_y = None
        self.is_calibrated = False
        
        self.total_typing_detected = 0
        self.total_frames_processed = 0
        
    def detect_pose(self, frame):
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.pose.process(rgb_frame)
        
        if not results.pose_landmarks:
            return None
        
        landmarks = results.pose_landmarks.landmark
        
        pose_data = {
            'raw_landmarks': results.pose_landmarks,
            'left_shoulder': self._get_landmark_coords(landmarks, self.mp_pose.PoseLandmark.LEFT_SHOULDER),
            'right_shoulder': self._get_landmark_coords(landmarks, self.mp_pose.PoseLandmark.RIGHT_SHOULDER),
            'left_elbow': self._get_landmark_coords(landmarks, self.mp_pose.PoseLandmark.LEFT_ELBOW),
            'right_elbow': self._get_landmark_coords(landmarks, self.mp_pose.PoseLandmark.RIGHT_ELBOW),
            'left_wrist': self._get_landmark_coords(landmarks, self.mp_pose.PoseLandmark.LEFT_WRIST),
            'right_wrist': self._get_landmark_coords(landmarks, self.mp_pose.PoseLandmark.RIGHT_WRIST),
            'nose': self._get_landmark_coords(landmarks, self.mp_pose.PoseLandmark.NOSE)
        }
        
        return pose_data
    
    def _get_landmark_coords(self, landmarks, landmark_id):
        lm = landmarks[landmark_id]
        return (lm.x, lm.y, lm.z, lm.visibility)
    
    def calculate_angle(self, point1, point2, point3):
        a = np.array([point1[0], point1[1]])
        b = np.array([point2[0], point2[1]])
        c = np.array([point3[0], point3[1]])
        
        ba = a - b
        bc = c - b
        
        cosine_angle = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6)
        angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
        
        return np.degrees(angle)
    
    def calculate_velocity(self, positions, dt=1/30):
        if len(positions) < 2:
            return 0.0
        
        recent = list(positions)[-10:]
        velocities = []
        
        for i in range(1, len(recent)):
            dx = recent[i][0] - recent[i-1][0]
            dy = recent[i][1] - recent[i-1][1]
            velocity = np.sqrt(dx**2 + dy**2) / dt
            velocities.append(velocity)
        
        return np.mean(velocities) if velocities else 0.0
    
    def detect_typing_rhythm(self, shoulder_positions):
        if len(shoulder_positions) < 30:
            return False, 0.0, 0.0
        
        y_positions = [pos[1] for pos in shoulder_positions]
        
        # Detrend manually if scipy not available
        if SCIPY_AVAILABLE:
            y_detrended = signal.detrend(y_positions)
        else:
            # Simple linear detrend
            x = np.arange(len(y_positions))
            coeffs = np.polyfit(x, y_positions, 1)
            trend = np.polyval(coeffs, x)
            y_detrended = y_positions - trend
        
        # Apply FFT
        fft = np.fft.fft(y_detrended)
        frequencies = np.fft.fftfreq(len(y_detrended), d=1/30)
        
        positive_freq_idx = frequencies > 0
        frequencies = frequencies[positive_freq_idx]
        magnitudes = np.abs(fft[positive_freq_idx])
        
        if len(magnitudes) == 0:
            return False, 0.0, 0.0
        
        dominant_idx = np.argmax(magnitudes)
        dominant_freq = frequencies[dominant_idx]
        strength = magnitudes[dominant_idx] / (np.sum(magnitudes) + 1e-6)
        
        has_rhythm = (1.0 <= dominant_freq <= 3.0) and (strength > 0.1)
        
        return has_rhythm, dominant_freq, strength
    
    def analyze_typing_posture(self, pose_data, current_time):
        if pose_data is None:
            self.is_typing = False
            self.typing_confidence = 0.0
            return None
        
        left_elbow_angle = self.calculate_angle(
            pose_data['left_shoulder'][:2],
            pose_data['left_elbow'][:2],
            pose_data['left_wrist'][:2]
        )
        
        right_elbow_angle = self.calculate_angle(
            pose_data['right_shoulder'][:2],
            pose_data['right_elbow'][:2],
            pose_data['right_wrist'][:2]
        )
        
        left_shoulder_angle = self.calculate_angle(
            (pose_data['left_shoulder'][0] - 0.1, pose_data['left_shoulder'][1]),
            pose_data['left_shoulder'][:2],
            pose_data['left_elbow'][:2]
        )
        
        self.shoulder_positions['left'].append(pose_data['left_shoulder'][:2])
        self.shoulder_positions['right'].append(pose_data['right_shoulder'][:2])
        self.elbow_angles['left'].append(left_elbow_angle)
        self.elbow_angles['right'].append(right_elbow_angle)
        self.shoulder_angles['left'].append(left_shoulder_angle)
        
        avg_elbow_angle = (left_elbow_angle + right_elbow_angle) / 2
        elbow_score = 1.0 - min(abs(avg_elbow_angle - self.baseline_elbow_angle) / 45.0, 1.0)
        
        left_velocity = self.calculate_velocity(self.shoulder_positions['left'])
        shoulder_movement_score = 1.0 - min(left_velocity * 10, 1.0)
        
        has_rhythm, freq, strength = self.detect_typing_rhythm(
            list(self.shoulder_positions['left'])
        )
        rhythm_score = strength if has_rhythm else 0.0
        
        wrists_below = (
            pose_data['left_wrist'][1] > pose_data['left_elbow'][1] and
            pose_data['right_wrist'][1] > pose_data['right_elbow'][1]
        )
        position_score = 1.0 if wrists_below else 0.3
        
        angle_diff = abs(left_elbow_angle - right_elbow_angle)
        symmetry_score = 1.0 - min(angle_diff / 45.0, 1.0)
        
        weights = {
            'elbow': 0.25,
            'shoulder_movement': 0.20,
            'rhythm': 0.25,
            'position': 0.15,
            'symmetry': 0.15
        }
        
        self.typing_confidence = (
            weights['elbow'] * elbow_score +
            weights['shoulder_movement'] * shoulder_movement_score +
            weights['rhythm'] * rhythm_score +
            weights['position'] * position_score +
            weights['symmetry'] * symmetry_score
        )
        
        TYPING_THRESHOLD = 0.6
        
        was_typing = self.is_typing
        self.is_typing = self.typing_confidence > TYPING_THRESHOLD
        
        if self.is_typing:
            if not was_typing:
                self.last_typing_time = current_time
                self.total_typing_detected += 1
            self.typing_duration = current_time - self.last_typing_time
        else:
            self.typing_duration = 0.0
        
        self.total_frames_processed += 1
        
        return {
            'is_typing': self.is_typing,
            'confidence': self.typing_confidence,
            'duration': self.typing_duration,
            'features': {
                'elbow_angle': avg_elbow_angle,
                'elbow_score': elbow_score,
                'shoulder_velocity': left_velocity,
                'shoulder_score': shoulder_movement_score,
                'has_rhythm': has_rhythm,
                'rhythm_freq': freq,
                'rhythm_score': rhythm_score,
                'wrists_below': wrists_below,
                'position_score': position_score,
                'symmetry_score': symmetry_score
            },
            'pose_data': pose_data
        }
    
    def calibrate(self, frame):
        pose_data = self.detect_pose(frame)
        if pose_data is None:
            return False
        
        left_elbow = self.calculate_angle(
            pose_data['left_shoulder'][:2],
            pose_data['left_elbow'][:2],
            pose_data['left_wrist'][:2]
        )
        right_elbow = self.calculate_angle(
            pose_data['right_shoulder'][:2],
            pose_data['right_elbow'][:2],
            pose_data['right_wrist'][:2]
        )
        
        self.baseline_elbow_angle = (left_elbow + right_elbow) / 2
        self.baseline_shoulder_y = pose_data['left_shoulder'][1]
        self.is_calibrated = True
        
        print(f"✓ Calibrated: elbow={self.baseline_elbow_angle:.1f}°")
        return True
    
    def draw_visualization(self, frame, analysis_result):
        if analysis_result is None:
            return frame
        
        pose_data = analysis_result['pose_data']
        
        if pose_data and 'raw_landmarks' in pose_data:
            self.mp_drawing.draw_landmarks(
                frame,
                pose_data['raw_landmarks'],
                self.mp_pose.POSE_CONNECTIONS,
                self.mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=2),
                self.mp_drawing.DrawingSpec(color=(0, 255, 255), thickness=2)
            )
        
        h, w = frame.shape[:2]
        status_text = "TYPING" if analysis_result['is_typing'] else "NOT TYPING"
        status_color = (0, 255, 0) if analysis_result['is_typing'] else (0, 0, 255)
        
        cv2.rectangle(frame, (10, 10), (300, 100), (0, 0, 0), -1)
        cv2.rectangle(frame, (10, 10), (300, 100), status_color, 2)
        
        cv2.putText(frame, status_text, (20, 45),
                   cv2.FONT_HERSHEY_SIMPLEX, 1.2, status_color, 2)
        cv2.putText(frame, f"Confidence: {analysis_result['confidence']:.1%}",
                   (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        
        y_offset = 120
        features = analysis_result['features']
        feature_display = [
            f"Elbow: {features['elbow_angle']:.0f}° ({features['elbow_score']:.2f})",
            f"Movement: {features['shoulder_velocity']:.3f} ({features['shoulder_score']:.2f})",
            f"Rhythm: {features['rhythm_freq']:.1f}Hz ({features['rhythm_score']:.2f})",
            f"Position: {features['position_score']:.2f}",
            f"Symmetry: {features['symmetry_score']:.2f}"
        ]
        
        for text in feature_display:
            cv2.putText(frame, text, (10, y_offset),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            y_offset += 25
        
        return frame
    
    def get_statistics(self):
        return {
            'total_frames': self.total_frames_processed,
            'typing_detections': self.total_typing_detected,
            'current_typing': self.is_typing,
            'typing_confidence': self.typing_confidence,
            'typing_duration': self.typing_duration
        }
    
    def release(self):
        self.pose.close()