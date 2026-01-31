# config.py
"""
Configuration settings for the Gesture-Based Typing System
"""

class Config:
    # Camera Settings
    CAMERA_INDEX = 0
    FRAME_WIDTH = 1280
    FRAME_HEIGHT = 720
    FPS = 30
    
    # MediaPipe Hand Detection Settings
    MAX_NUM_HANDS = 2
    MIN_DETECTION_CONFIDENCE = 0.7
    MIN_TRACKING_CONFIDENCE = 0.5
    
    # Gesture Recognition Settings
    GESTURE_BUFFER_SIZE = 10  # Number of frames to store for motion analysis
    TYPING_VELOCITY_THRESHOLD = 0.15  # Minimum velocity to detect typing
    TYPING_DOWNWARD_THRESHOLD = -0.1  # Y-axis velocity threshold
    
    # Keystroke Synchronization Settings
    DEBOUNCE_INTERVAL = 150  # Milliseconds between keystrokes
    CONFIRMATION_FRAMES = 3  # Consecutive frames needed to confirm gesture
    
    # Keyboard Layout
    KEYBOARD_LAYOUT = {
        'row_1': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        'row_2': ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        'row_3': ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        'row_4': ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
    }
    
    # Hand Position Calibration (will be updated during calibration)
    LEFT_HAND_KEYS = ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B']
    RIGHT_HAND_KEYS = ['Y', 'U', 'I', 'O', 'P', 'H', 'J', 'K', 'L', 'N', 'M']
    
    # Finger to Key Mapping
    FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
    
    # Left Hand Finger Mapping
    LEFT_FINGER_KEYS = {
        'Pinky': ['Q', 'A', 'Z', '1'],
        'Ring': ['W', 'S', 'X', '2'],
        'Middle': ['E', 'D', 'C', '3'],
        'Index': ['R', 'F', 'V', 'T', 'G', 'B', '4', '5'],
        'Thumb': [' ']  # Space bar
    }
    
    # Right Hand Finger Mapping
    RIGHT_FINGER_KEYS = {
        'Thumb': [' '],  # Space bar
        'Index': ['Y', 'H', 'N', 'U', 'J', 'M', '6', '7'],
        'Middle': ['I', 'K', '8'],
        'Ring': ['O', 'L', '9'],
        'Pinky': ['P', '0']
    }
    
    # Visual Display Settings
    DRAW_LANDMARKS = True
    DRAW_CONNECTIONS = True
    SHOW_FPS = True
    SHOW_GESTURE_LABEL = True
    SHOW_TYPED_TEXT = True
    
    # Colors (BGR format for OpenCV)
    COLOR_HAND_LANDMARKS = (0, 255, 0)
    COLOR_CONNECTIONS = (255, 0, 0)
    COLOR_TYPING_INDICATOR = (0, 0, 255)
    COLOR_TEXT = (255, 255, 255)
    
    # Output Settings
    SAVE_OUTPUT_VIDEO = False
    OUTPUT_VIDEO_PATH = "output/typing_session.mp4"
    SAVE_TYPED_TEXT = True
    TEXT_OUTPUT_PATH = "output/typed_text.txt"
    
    # Calibration Settings
    CALIBRATION_MODE = False
    CALIBRATION_SAMPLES = 30