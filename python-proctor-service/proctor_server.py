from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import cv2
import numpy as np
import base64
from datetime import datetime
import traceback
import time
import os
from dotenv import load_dotenv
from pymongo import MongoClient
load_dotenv()
MONGODB_URI = os.getenv('MONGODB_URI')
client = MongoClient(MONGODB_URI)
db = client['exam_proctoring']

app = Flask(__name__)
CORS(app, origins=["*"])

# SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")
MONGODB_URI = os.getenv('MONGODB_URI')
if MONGODB_URI:
    try:
        client = MongoClient(MONGODB_URI)
        db = client['exam_proctoring']
        print("✅ MongoDB Connected")
    except Exception as e:
        print(f"❌ MongoDB Error: {e}")
        db = None
else:
    print("❌ MongoDB URI not found")
    db = None

# Routes
@app.route('/')
def home():
    return jsonify({
        "status": "running",
        "message": "Exam Proctor AI Service",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "detect_face": "/detect-face",
            "analyze_typing": "/analyze-typing"
        }
    })

@app.route('/health')
def health():
    return jsonify({
        "status": "OK",
        "message": "AI Service is running",
        "mongodb": "connected" if db is not None else "disconnected"
    })

active_sessions = {}

class ProctorSession:
    def __init__(self, student_id, exam_id):
        self.student_id = student_id
        self.exam_id = exam_id
        self.violations = []
        self.frame_count = 0
        self.screen_frame_count = 0
        self.start_time = time.time()
        
        # BALANCED ghost typing detection
        self.typing_mismatch_count = 0
        self.screen_typing_detected = False
        self.hands_typing_detected = False
        self.hands_visible = False
        self.last_check_time = time.time()
        
        # History for BALANCED analysis
        self.detection_history = []
        self.ghost_typing_incidents = []
        
        # Cooldown to prevent spam
        self.last_ghost_typing_time = 0
        
        try:
            from hand_detector import HandDetector
            from upper_body_detector import UpperBodyDetector
            from screen_activity_detector import ScreenActivityDetector
            
            self.hand_detector = HandDetector()
            self.body_detector = UpperBodyDetector()
            self.screen_detector = ScreenActivityDetector()
            print(f"✅ All detectors initialized for {student_id}")
        except Exception as e:
            print(f"❌ Error initializing detectors: {e}")
            traceback.print_exc()
            self.hand_detector = None
            self.body_detector = None
            self.screen_detector = None

    def process_video_frame(self, frame):
        """Process camera frame - BALANCED detection"""
        violations = []
        timestamp = datetime.now().isoformat()
        
        try:
            # Detect face
            if self.body_detector:
                body_result = self.body_detector.detect(frame)
                
                if body_result['face_count'] == 0:
                    violations.append({
                        'type': 'NO_FACE_DETECTED',
                        'severity': 'MEDIUM',
                        'timestamp': timestamp,
                        'details': 'Face not visible'
                    })
                
                if body_result['face_count'] > 1:
                    violations.append({
                        'type': 'MULTIPLE_PERSONS',
                        'severity': 'CRITICAL',
                        'timestamp': timestamp,
                        'details': f"{body_result['face_count']} people detected"
                    })
            
            # Detect hands - BALANCED
            if self.hand_detector:
                hands_result = self.hand_detector.detect(frame)
                
                # Use smoothed results (more stable)
                self.hands_visible = hands_result.get('smoothed_visibility', False)
                self.hands_typing_detected = hands_result.get('smoothed_typing', False)
                
                # Store for analysis
                self.detection_history.append({
                    'timestamp': time.time(),
                    'frame_number': self.frame_count,
                    'hands_visible': self.hands_visible,
                    'hands_typing': self.hands_typing_detected,
                    'hand_count': hands_result.get('count', 0),
                    'typing_confidence': hands_result.get('confidence', 0.0),
                    'screen_typing': self.screen_typing_detected
                })
                
                # Keep only last 40 detections (4 seconds)
                if len(self.detection_history) > 40:
                    self.detection_history.pop(0)
            
            self.frame_count += 1
            
            # Analyze ghost typing BALANCED every 2 seconds
            current_time = time.time()
            if current_time - self.last_check_time >= 2.0:
                ghost_typing = self._balanced_ghost_typing_analysis()
                if ghost_typing:
                    violations.append(ghost_typing)
                self.last_check_time = current_time
                    
        except Exception as e:
            print(f"❌ Error processing video frame: {e}")
            traceback.print_exc()
        
        return violations

    def process_screen_frame(self, frame):
        """Process screen - detect typing activity"""
        violations = []
        
        try:
            if self.screen_detector:
                self.screen_typing_detected = self.screen_detector.detect_typing_activity(frame)
                
            self.screen_frame_count += 1
                
        except Exception as e:
            print(f"❌ Error processing screen frame: {e}")
            traceback.print_exc()
        
        return violations

    def _balanced_ghost_typing_analysis(self):
        """
        BALANCED GHOST TYPING DETECTION
        
        Philosophy: Detect real ghost typing reliably while avoiding false positives
        
        Requirements for detection:
        1. Screen shows typing in majority of frames (60%+)
        2. Hands either:
           a) Not visible consistently (70%+), OR
           b) Visible but not typing (70%+)
        3. Cooldown period to avoid spam
        4. Require pattern confirmation
        """
        if len(self.detection_history) < 15:
            return None
        
        # Analyze last 20 detections (2 seconds)
        recent = self.detection_history[-20:]
        
        # Count frames
        screen_typing_frames = sum(1 for d in recent if d['screen_typing'])
        hands_typing_frames = sum(1 for d in recent if d['hands_typing'])
        hands_not_visible_frames = sum(1 for d in recent if not d['hands_visible'])
        hands_visible_not_typing = sum(
            1 for d in recent 
            if d['hands_visible'] and not d['hands_typing']
        )
        
        # COOLDOWN: 8 second between detections
        current_time = time.time()
        if current_time - self.last_ghost_typing_time < 8.0:
            return None
        
        # SCENARIO 1: Screen typing BUT hands completely absent
        # Requirements:
        # - Screen typing in 12+ of 20 frames (60%)
        # - Hands not visible in 14+ of 20 frames (70%)
        
        if screen_typing_frames >= 12 and hands_not_visible_frames >= 14:
            # Confirm with longer history
            if len(self.detection_history) >= 30:
                longer_recent = self.detection_history[-30:]
                longer_screen = sum(1 for d in longer_recent if d['screen_typing'])
                longer_no_hands = sum(1 for d in longer_recent if not d['hands_visible'])
                
                # Need strong evidence over longer period
                if longer_screen >= 18 and longer_no_hands >= 21:
                    confidence = 0.90
                    
                    self.typing_mismatch_count += 1
                    self.last_ghost_typing_time = current_time
                    
                    incident = {
                        'type': 'GHOST_TYPING_DETECTED',
                        'severity': 'CRITICAL',
                        'timestamp': datetime.now().isoformat(),
                        'details': 'Screen typing detected with hands consistently absent',
                        'confidence': confidence,
                        'evidence': {
                            'screen_typing_frames': screen_typing_frames,
                            'hands_not_visible': hands_not_visible_frames,
                            'analysis_window': '2 seconds',
                            'longer_confirmation': f'{longer_screen}/{longer_no_hands} over 3 seconds'
                        },
                        'scenario': 'hands_absent'
                    }
                    
                    self.ghost_typing_incidents.append(incident)
                    
                    print(f"🚨 GHOST TYPING DETECTED!")
                    print(f"   Screen: {screen_typing_frames}/20, Hands absent: {hands_not_visible_frames}/20")
                    
                    return incident
        
        # SCENARIO 2: Screen typing BUT hands visible and NOT typing
        # Requirements:
        # - Screen typing in 12+ of 20 frames (60%)
        # - Hands typing in 4 or fewer frames (20%)
        # - Hands visible but not typing in 14+ frames
        
        elif screen_typing_frames >= 12 and hands_typing_frames <= 4 and hands_visible_not_typing >= 14:
            # Confirm with longer history
            if len(self.detection_history) >= 30:
                longer_recent = self.detection_history[-30:]
                longer_screen = sum(1 for d in longer_recent if d['screen_typing'])
                longer_hands_typing = sum(1 for d in longer_recent if d['hands_typing'])
                
                # Strong mismatch over longer period
                if longer_screen >= 18 and longer_hands_typing <= 6:
                    confidence = 0.80
                    
                    self.typing_mismatch_count += 1
                    self.last_ghost_typing_time = current_time
                    
                    incident = {
                        'type': 'GHOST_TYPING_DETECTED',
                        'severity': 'HIGH',
                        'timestamp': datetime.now().isoformat(),
                        'details': 'Screen typing but hands not in typing position',
                        'confidence': confidence,
                        'evidence': {
                            'screen_typing_frames': screen_typing_frames,
                            'hands_typing_frames': hands_typing_frames,
                            'hands_visible_not_typing': hands_visible_not_typing,
                            'longer_confirmation': f'{longer_screen} screen vs {longer_hands_typing} hands'
                        },
                        'scenario': 'hands_not_typing'
                    }
                    
                    self.ghost_typing_incidents.append(incident)
                    
                    print(f"⚠️  GHOST TYPING SUSPECTED")
                    print(f"   Screen: {screen_typing_frames}/20, Hands typing: {hands_typing_frames}/20")
                    
                    return incident
        
        # No ghost typing detected
        return None

    def generate_report(self):
        """Generate final report"""
        exam_duration = time.time() - self.start_time
        
        violation_counts = {}
        for v in self.violations:
            vtype = v['type']
            violation_counts[vtype] = violation_counts.get(vtype, 0) + 1
        
        ghost_typing = violation_counts.get('GHOST_TYPING_DETECTED', 0)
        multiple_persons = violation_counts.get('MULTIPLE_PERSONS', 0)
        no_face = violation_counts.get('NO_FACE_DETECTED', 0)
        
        # Risk assessment - MUST be valid enum value
        if ghost_typing >= 3 or multiple_persons >= 2:
            risk_level = 'HIGH_RISK'
        elif ghost_typing >= 1 or no_face > 20:
            risk_level = 'MEDIUM_RISK'
        else:
            risk_level = 'LOW_RISK'
        
        report = {
            'studentId': self.student_id,
            'examId': self.exam_id,
            'duration': exam_duration,
            'totalViolations': len(self.violations),
            'violationSummary': violation_counts,
            'detailedViolations': self.violations[-20:],
            'riskLevel': risk_level,  # Valid enum value
            'framesProcessed': self.frame_count,
            'screenFramesProcessed': self.screen_frame_count,
            'timestamp': datetime.now().isoformat(),
            'violationBreakdown': {
                'ghostTyping': ghost_typing,
                'noFace': no_face,
                'multiplePersons': multiple_persons
            }
        }
        
        return report

# Socket.IO handlers
@app.route('/')
def index():
    return jsonify({
        'status': 'running',
        'message': 'Python Proctor Server - BALANCED',
        'active_sessions': len(active_sessions),
        'version': '4.0 - Balanced Detection'
    })

@socketio.on('connect')
def handle_connect():
    print(f"✅ Client connected: {request.sid}")
    emit('connection_response', {'status': 'connected', 'sid': request.sid})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"❌ Client disconnected: {request.sid}")
    if request.sid in active_sessions:
        session = active_sessions[request.sid]
        print(f"   Student {session.student_id} session ended")
        del active_sessions[request.sid]

@socketio.on('start_proctoring')
def start_proctoring(data):
    try:
        student_id = data.get('studentId') or 'unknown-student'
        exam_id = data.get('examId')
        
        print(f"🎬 Starting BALANCED proctoring for {student_id}")
        
        session = ProctorSession(student_id, exam_id)
        active_sessions[request.sid] = session
        
        emit('proctoring_started', {
            'status': 'success',
            'message': f'Balanced proctoring started for {student_id}',
            'sessionId': request.sid
        })
        
    except Exception as e:
        print(f"❌ Error: {e}")
        traceback.print_exc()
        emit('error', {'message': str(e)})

@socketio.on('video_frame')
def handle_video_frame(data):
    try:
        session = active_sessions.get(request.sid)
        if not session:
            return
        
        img_data = base64.b64decode(data['frame'].split(',')[1])
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return
        
        violations = session.process_video_frame(frame)
        
        if violations:
            session.violations.extend(violations)
            emit('violation_detected', {
                'violations': violations,
                'timestamp': data.get('timestamp')
            })
        
        if session.frame_count % 50 == 0:
            emit('proctor_status', {
                'framesProcessed': session.frame_count,
                'screenFramesProcessed': session.screen_frame_count,
                'totalViolations': len(session.violations),
                'ghostTypingCount': session.typing_mismatch_count
            })
            print(f"📊 {session.student_id}: {session.frame_count} frames, "
                  f"{len(session.violations)} violations, "
                  f"{session.typing_mismatch_count} ghost typing")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        traceback.print_exc()

@socketio.on('screen_frame')
def handle_screen_frame(data):
    try:
        session = active_sessions.get(request.sid)
        if not session:
            return
        
        img_data = base64.b64decode(data['frame'].split(',')[1])
        nparr = np.frombuffer(img_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return
        
        violations = session.process_screen_frame(frame)
        
        if violations:
            session.violations.extend(violations)
            emit('violation_detected', {
                'violations': violations,
                'timestamp': data.get('timestamp'),
                'source': 'screen'
            })
            
    except Exception as e:
        print(f"❌ Error: {e}")
        traceback.print_exc()

@socketio.on('end_proctoring')
def end_proctoring(data):
    try:
        session = active_sessions.get(request.sid)
        if not session:
            emit('error', {'message': 'No active session'})
            return
        
        report = session.generate_report()
        
        emit('proctoring_ended', {
            'status': 'success',
            'report': report
        })
        
        print(f"🏁 Session ended for {session.student_id}")
        print(f"   Risk: {report['riskLevel']}, Ghost typing: {session.typing_mismatch_count}")
        
        del active_sessions[request.sid]
        
    except Exception as e:
        print(f"❌ Error: {e}")
        traceback.print_exc()
        emit('error', {'message': str(e)})

if __name__ == '__main__':

    
    try:
        port = int(os.getenv('PORT', 5001))
        print(f"🚀 Starting AI Service on port {port}")
        socketio.run(app, host='0.0.0.0', port=port, debug=False)
       
    except Exception as e:
        print(f"❌ Server error: {e}")