import cv2
import numpy as np
from collections import deque
import time

class ScreenActivityDetector:
    def __init__(self):
        self.prev_frame = None
        self.prev_prev_frame = None
        
        # Longer history for better accuracy
        self.activity_history = deque(maxlen=50)
        self.change_history = deque(maxlen=20)
        
        self.last_activity_time = 0
        self.consecutive_activity = 0
        
        self.frame_count = 0
        
        print("✅ ScreenActivityDetector initialized - ACCURATE MODE")
    
    def detect_typing_activity(self, frame):
        """
        Detect REAL keyboard typing on screen with HIGH ACCURACY
        
        PHILOSOPHY: Only report typing when CONFIDENT it's actual typing
        Avoid false positives from:
        - Mouse movements
        - Scrolling
        - Window switches
        - Cursor blinking alone
        """
        try:
            if frame is None or frame.size == 0:
                return False
            
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape
            
            # Focus on CODE EDITOR area (where typing happens)
            editor_top = int(h * 0.25)
            editor_bottom = int(h * 0.80)
            editor_left = int(w * 0.15)
            editor_right = int(w * 0.85)
            
            editor_region = gray[editor_top:editor_bottom, editor_left:editor_right]
            
            if self.prev_frame is None:
                self.prev_frame = editor_region.copy()
                return False
            
            # Frame difference
            diff = cv2.absdiff(editor_region, self.prev_frame)
            diff = cv2.GaussianBlur(diff, (5, 5), 0)
            
            # MULTI-LEVEL thresholding for accuracy
            _, thresh_low = cv2.threshold(diff, 20, 255, cv2.THRESH_BINARY)
            _, thresh_med = cv2.threshold(diff, 35, 255, cv2.THRESH_BINARY)
            _, thresh_high = cv2.threshold(diff, 50, 255, cv2.THRESH_BINARY)
            
            # Count pixels
            total_pixels = editor_region.shape[0] * editor_region.shape[1]
            low_pixels = cv2.countNonZero(thresh_low)
            med_pixels = cv2.countNonZero(thresh_med)
            high_pixels = cv2.countNonZero(thresh_high)
            
            low_ratio = low_pixels / total_pixels
            med_ratio = med_pixels / total_pixels
            high_ratio = high_pixels / total_pixels
            
            # TYPING SIGNATURES:
            # 1. Small localized changes (text appearing)
            #    Ratio: 0.003 - 0.04 (0.3% - 4%)
            signature_small_change = 0.003 < low_ratio < 0.04 and med_ratio < 0.02
            
            # 2. Moderate continuous changes (typing multiple characters)
            #    Ratio: 0.005 - 0.06
            signature_typing_flow = 0.005 < med_ratio < 0.06 and high_ratio < 0.03
            
            # 3. NOT typing signatures (exclude these):
            # - Large changes (>10% pixels) = scrolling, window switch
            # - Very tiny changes (<0.2%) = just cursor blink
            # - Uniform changes across screen = mouse movement
            
            too_large = low_ratio > 0.12 or med_ratio > 0.08
            too_small = low_ratio < 0.002
            
            # Check change distribution (typing is localized, not uniform)
            if low_pixels > 100:  # Have some changes
                # Divide region into 4 quadrants
                mid_h = editor_region.shape[0] // 2
                mid_w = editor_region.shape[1] // 2
                
                quadrants = [
                    thresh_low[:mid_h, :mid_w],
                    thresh_low[:mid_h, mid_w:],
                    thresh_low[mid_h:, :mid_w],
                    thresh_low[mid_h:, mid_w:]
                ]
                
                quad_pixels = [cv2.countNonZero(q) for q in quadrants]
                max_quad = max(quad_pixels)
                min_quad = min(quad_pixels)
                
                # Typing: changes concentrated in 1-2 quadrants
                # Non-typing: changes spread across all quadrants
                is_localized = max_quad > 3 * min_quad if min_quad > 0 else True
            else:
                is_localized = False
            
            # TEMPORAL PATTERN ANALYSIS
            self.change_history.append({
                'low': low_ratio,
                'med': med_ratio,
                'timestamp': time.time()
            })
            
            # Typing has characteristic rhythm
            recent = [c for c in self.change_history if time.time() - c['timestamp'] < 2.0]
            
            if len(recent) >= 8:
                changes = [c['med'] for c in recent]
                variance = np.var(changes)
                mean_change = np.mean(changes)
                
                # Typing: moderate variance, moderate mean
                has_typing_rhythm = (
                    0.00002 < variance < 0.002 and
                    0.003 < mean_change < 0.06
                )
            else:
                has_typing_rhythm = False
            
            # FINAL DECISION with HIGH CONFIDENCE REQUIREMENT
            is_typing = (
                (signature_small_change or signature_typing_flow) and  # Matches typing signature
                not too_large and  # Not scrolling/window switch
                not too_small and  # Not just cursor
                is_localized and  # Changes localized (not mouse)
                (has_typing_rhythm or self.consecutive_activity >= 2)  # Has pattern OR continuing
            )
            
            # CONSECUTIVE FRAME VALIDATION
            # Require 3+ consecutive frames to REALLY confirm
            if is_typing:
                self.consecutive_activity += 1
                self.last_activity_time = time.time()
            else:
                self.consecutive_activity = max(0, self.consecutive_activity - 1)
            
            # HIGH CONFIDENCE: Detected in 3+ consecutive frames
            confirmed_typing = is_typing and self.consecutive_activity >= 3
            
            # Store in history
            self.activity_history.append({
                'timestamp': time.time(),
                'is_typing': confirmed_typing,
                'low_ratio': low_ratio,
                'med_ratio': med_ratio,
                'consecutive': self.consecutive_activity,
                'has_rhythm': has_typing_rhythm,
                'localized': is_localized
            })
            
            # Update frames
            self.prev_prev_frame = self.prev_frame.copy()
            self.prev_frame = editor_region.copy()
            self.frame_count += 1
            
            # DEBUG every 30 frames
            if self.frame_count % 30 == 0 and confirmed_typing:
                print(f"🖥️  Screen: TYPING CONFIRMED - low={low_ratio:.4f}, "
                      f"med={med_ratio:.4f}, consec={self.consecutive_activity}")
            
            return confirmed_typing
            
        except Exception as e:
            print(f"❌ Screen detection error: {e}")
            return False
    
    def get_recent_activity_level(self):
        """Get typing activity in last 3 seconds"""
        if not self.activity_history:
            return 0.0
        
        recent = [a for a in self.activity_history if time.time() - a['timestamp'] < 3.0]
        if not recent:
            return 0.0
        
        typing_frames = sum(1 for a in recent if a['is_typing'])
        return typing_frames / len(recent)
    
    def is_actively_typing(self):
        """Check if typing in last 1.5 seconds"""
        return (time.time() - self.last_activity_time) < 1.5
    
    def reset(self):
        """Reset state"""
        self.prev_frame = None
        self.prev_prev_frame = None
        self.activity_history.clear()
        self.change_history.clear()
        self.last_activity_time = 0
        self.consecutive_activity = 0
        self.frame_count = 0