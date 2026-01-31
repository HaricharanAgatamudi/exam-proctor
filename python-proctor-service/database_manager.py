# database_manager.py
"""
Database Manager for Typing Detection System
Stores all detection events, analysis results, and session data in MongoDB.
"""

from pymongo import MongoClient, ASCENDING, DESCENDING
from datetime import datetime
import json
import numpy as np


class TypingDetectionDatabase:
    """
    Manages database storage for typing detection system.
    
    Collections:
    1. sessions - Overall exam/recording sessions
    2. typing_events - Individual typing detection events
    3. pose_analysis - Detailed pose analysis frames
    4. hand_detections - When hands are visible (potential cheating)
    5. statistics - Aggregated statistics
    """
    
    def __init__(self, connection_string="mongodb://localhost:27017/", db_name="typing_detection"):
        """
        Initialize database connection.
        
        Args:
            connection_string: MongoDB connection string
            db_name: Database name
        """
        self.client = MongoClient(connection_string)
        self.db = self.client[db_name]
        
        # Collections
        self.sessions = self.db['sessions']
        self.typing_events = self.db['typing_events']
        self.pose_analysis = self.db['pose_analysis']
        self.hand_detections = self.db['hand_detections']
        self.statistics = self.db['statistics']
        
        # Create indexes for efficient queries
        self._create_indexes()
        
        print("✓ Database connected successfully")
    
    def _create_indexes(self):
        """Create database indexes for fast queries"""
        # Session indexes
        self.sessions.create_index([("user_id", ASCENDING)])
        self.sessions.create_index([("exam_id", ASCENDING)])
        self.sessions.create_index([("start_time", DESCENDING)])
        
        # Typing events indexes
        self.typing_events.create_index([("session_id", ASCENDING)])
        self.typing_events.create_index([("timestamp", ASCENDING)])
        self.typing_events.create_index([("is_typing", ASCENDING)])
        
        # Pose analysis indexes
        self.pose_analysis.create_index([("session_id", ASCENDING)])
        self.pose_analysis.create_index([("frame_number", ASCENDING)])
        
        # Hand detection indexes
        self.hand_detections.create_index([("session_id", ASCENDING)])
        self.hand_detections.create_index([("timestamp", ASCENDING)])
    
    def _convert_numpy_types(self, obj):
        """Recursively convert numpy types to Python native types"""
        if isinstance(obj, dict):
            return {key: self._convert_numpy_types(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_numpy_types(item) for item in obj]
        elif isinstance(obj, np.integer):
            return int(obj)
        elif isinstance(obj, np.floating):
            return float(obj)
        elif isinstance(obj, np.bool_):
            return bool(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        else:
            return obj
    
    # ==================== SESSION MANAGEMENT ====================
    
    def create_session(self, user_id, exam_id, session_type="exam"):
        """
        Create a new detection session.
        
        Args:
            user_id: User/student identifier
            exam_id: Exam identifier
            session_type: Type of session (exam, practice, calibration)
            
        Returns:
            session_id (ObjectId)
        """
        session_doc = {
            'user_id': user_id,
            'exam_id': exam_id,
            'session_type': session_type,
            'start_time': datetime.now(),
            'end_time': None,
            'status': 'active',
            'statistics': {
                'total_frames': 0,
                'typing_detected_frames': 0,
                'hands_visible_frames': 0,
                'total_typing_events': 0,
                'total_cheating_alerts': 0
            },
            'recordings': {
                'webcam_url': None,
                'screen_url': None,
                'events_url': None
            }
        }
        
        result = self.sessions.insert_one(session_doc)
        session_id = result.inserted_id
        
        print(f"✓ Session created: {session_id}")
        return str(session_id)
    
    def end_session(self, session_id, recordings=None):
        """
        End a session and store final recording URLs.
        
        Args:
            session_id: Session identifier
            recordings: Dict with webcam_url, screen_url, events_url
        """
        from bson.objectid import ObjectId
        
        # Convert string session_id to ObjectId if needed
        if isinstance(session_id, str):
            session_id = ObjectId(session_id)
        
        update_doc = {
            '$set': {
                'end_time': datetime.now(),
                'status': 'completed'
            }
        }
        
        if recordings:
            update_doc['$set']['recordings'] = recordings
        
        self.sessions.update_one({'_id': session_id}, update_doc)
        print(f"✓ Session ended: {session_id}")
    
    def get_session(self, session_id):
        """Retrieve session data"""
        from bson.objectid import ObjectId
        
        if isinstance(session_id, str):
            session_id = ObjectId(session_id)
        
        return self.sessions.find_one({'_id': session_id})
    
    # ==================== TYPING EVENTS ====================
    
    def log_typing_event(self, session_id, timestamp_ms, typing_analysis):
        """
        Log typing detection event with proper type conversion.
        
        Args:
            session_id: Session identifier
            timestamp_ms: Unix timestamp in milliseconds
            typing_analysis: Analysis result dictionary
            
        Returns:
            inserted_id or None on error
        """
        # Convert the entire analysis to Python native types
        typing_analysis_clean = self._convert_numpy_types(typing_analysis)
        
        event_doc = {
            'session_id': session_id,
            'timestamp': timestamp_ms,
            'datetime': datetime.fromtimestamp(timestamp_ms / 1000),
            'is_typing': typing_analysis_clean['is_typing'],
            'confidence': typing_analysis_clean['confidence'],
            'duration': typing_analysis_clean['duration'],
            'features': typing_analysis_clean['features']
        }
        
        try:
            result = self.typing_events.insert_one(event_doc)
            return result.inserted_id
        except Exception as e:
            print(f"Error logging typing event: {e}")
            return None
    
    def get_typing_events(self, session_id, start_time=None, end_time=None):
        """
        Get typing events for a session, optionally filtered by time range.
        
        Args:
            session_id: Session identifier
            start_time: Optional start timestamp (ms)
            end_time: Optional end timestamp (ms)
            
        Returns:
            List of typing events
        """
        query = {'session_id': session_id}
        
        if start_time or end_time:
            query['timestamp'] = {}
            if start_time:
                query['timestamp']['$gte'] = start_time
            if end_time:
                query['timestamp']['$lte'] = end_time
        
        return list(self.typing_events.find(query).sort('timestamp', ASCENDING))
    
    # ==================== POSE ANALYSIS ====================
    
    def log_pose_analysis(self, session_id, frame_number, timestamp, pose_data, analysis_result):
        """
        Log detailed pose analysis for a frame.
        Store every Nth frame to avoid database overload.
        
        Args:
            session_id: Session identifier
            frame_number: Frame sequence number
            timestamp: Unix timestamp (ms)
            pose_data: Raw pose landmarks
            analysis_result: Analysis result
        """
        # Extract landmark positions (not the full MediaPipe object)
        landmarks_list = []
        if pose_data:
            for key in ['left_shoulder', 'right_shoulder', 'left_elbow', 
                       'right_elbow', 'left_wrist', 'right_wrist', 'nose']:
                if key in pose_data:
                    landmarks_list.append({
                        'name': key,
                        'x': float(pose_data[key][0]),
                        'y': float(pose_data[key][1]),
                        'z': float(pose_data[key][2]) if len(pose_data[key]) > 2 else 0.0,
                        'visibility': float(pose_data[key][3]) if len(pose_data[key]) > 3 else 1.0
                    })
        
        # Convert analysis result
        analysis_result_clean = self._convert_numpy_types(analysis_result)
        
        analysis_doc = {
            'session_id': session_id,
            'frame_number': frame_number,
            'timestamp': timestamp,
            'datetime': datetime.fromtimestamp(timestamp / 1000),
            'landmarks': landmarks_list,
            'is_typing': analysis_result_clean['is_typing'],
            'confidence': analysis_result_clean['confidence'],
            'features': analysis_result_clean['features']
        }
        
        self.pose_analysis.insert_one(analysis_doc)
    
    # ==================== HAND DETECTION (CHEATING ALERTS) ====================
    
    def log_hand_detection(self, session_id, timestamp, hands_data, alert_type="hands_visible"):
        """
        Log when hands ARE visible in the frame (potential cheating indicator).
        
        During exam:
        - Hands should NOT be visible (they're on keyboard below camera)
        - If hands ARE visible → potential remote/ghost writing
        
        Args:
            session_id: Session identifier
            timestamp: Unix timestamp (ms)
            hands_data: List of detected hands from hand_detector
            alert_type: Type of alert (hands_visible, gesture_detected, etc.)
        """
        from bson.objectid import ObjectId
        
        # Convert string session_id to ObjectId if needed
        if isinstance(session_id, str):
            session_id_obj = ObjectId(session_id)
        else:
            session_id_obj = session_id
        
        # Extract hand information
        hands_info = []
        for hand_data in hands_data:
            # Get fingertip positions
            fingertips = {
                'thumb': hand_data['landmarks'][4],
                'index': hand_data['landmarks'][8],
                'middle': hand_data['landmarks'][12],
                'ring': hand_data['landmarks'][16],
                'pinky': hand_data['landmarks'][20]
            }
            
            hands_info.append({
                'hand_type': hand_data['hand_type'],
                'confidence': float(hand_data['confidence']),
                'fingertips': fingertips,
                'num_landmarks': len(hand_data['landmarks'])
            })
        
        alert_doc = {
            'session_id': session_id,
            'timestamp': timestamp,
            'datetime': datetime.fromtimestamp(timestamp / 1000),
            'alert_type': alert_type,
            'num_hands': len(hands_data),
            'hands_info': hands_info,
            'severity': 'high' if len(hands_data) > 0 else 'low'
        }
        
        self.hand_detections.insert_one(alert_doc)
        
        # Update session statistics
        self.sessions.update_one(
            {'_id': session_id_obj},
            {
                '$inc': {
                    'statistics.hands_visible_frames': 1,
                    'statistics.total_cheating_alerts': 1
                }
            }
        )
        
        print(f"⚠ CHEATING ALERT: {len(hands_data)} hand(s) detected at {datetime.fromtimestamp(timestamp/1000)}")
    
    def get_cheating_alerts(self, session_id):
        """Get all cheating alerts for a session"""
        return list(self.hand_detections.find({'session_id': session_id}).sort('timestamp', ASCENDING))
    
    # ==================== STATISTICS ====================
    
    def compute_session_statistics(self, session_id):
        """
        Compute detailed statistics for a session.
        
        Returns:
            Dict with comprehensive statistics
        """
        # Get session
        session = self.get_session(session_id)
        if not session:
            return None
        
        # Get all typing events
        typing_events = self.get_typing_events(session_id)
        
        # Calculate statistics
        total_events = len(typing_events)
        typing_events_count = sum(1 for e in typing_events if e['is_typing'])
        
        # Average confidence
        confidences = [e['confidence'] for e in typing_events]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        # Typing percentage
        typing_percentage = (typing_events_count / total_events * 100) if total_events > 0 else 0.0
        
        # Longest typing duration
        max_duration = max([e['duration'] for e in typing_events], default=0.0)
        
        # Cheating alerts
        cheating_alerts = list(self.hand_detections.find({'session_id': session_id}))
        
        stats = {
            'session_id': str(session_id),
            'user_id': session['user_id'],
            'exam_id': session['exam_id'],
            'total_frames': total_events,
            'typing_detected_frames': typing_events_count,
            'typing_percentage': typing_percentage,
            'average_confidence': avg_confidence,
            'max_typing_duration': max_duration,
            'cheating_alerts_count': len(cheating_alerts),
            'has_suspicious_activity': len(cheating_alerts) > 0,
            'computed_at': datetime.now()
        }
        
        # Store statistics
        self.statistics.insert_one(stats)
        
        return stats
    
    # ==================== QUERIES ====================
    
    def get_user_sessions(self, user_id):
        """Get all sessions for a user"""
        return list(self.sessions.find({'user_id': user_id}).sort('start_time', DESCENDING))
    
    def get_flagged_sessions(self, min_alerts=1):
        """Get sessions with cheating alerts"""
        return list(self.sessions.find({
            'statistics.total_cheating_alerts': {'$gte': min_alerts}
        }).sort('start_time', DESCENDING))
    
    def export_session_data(self, session_id, output_file):
        """
        Export all session data to JSON file.
        Useful for training ML models.
        
        Args:
            session_id: Session identifier
            output_file: Path to output JSON file
        """
        from bson.objectid import ObjectId
        
        data = {
            'session': self.get_session(session_id),
            'typing_events': self.get_typing_events(session_id),
            'cheating_alerts': self.get_cheating_alerts(session_id),
            'statistics': self.compute_session_statistics(session_id)
        }
        
        # Convert datetime and ObjectId objects to strings
        def json_handler(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            elif isinstance(obj, ObjectId):
                return str(obj)
            raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
        
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2, default=json_handler)
        
        print(f"✓ Session data exported to {output_file}")
    
    def close(self):
        """Close database connection"""
        self.client.close()
        print("✓ Database connection closed")