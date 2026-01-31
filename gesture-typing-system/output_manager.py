# output_manager.py
"""
Output Management Module
Handles keystroke output to OS and text buffer management
"""

import time
from pynput.keyboard import Controller, Key
from config import Config

class OutputManager:
    def __init__(self):
        """Initialize keyboard controller and text buffer"""
        self.keyboard = Controller()
        self.text_buffer = ""
        self.keystroke_log = []
        
        self.total_keystrokes_sent = 0
        self.start_time = time.time()
        
    def send_keystroke(self, key):
        """Send a keystroke to the operating system"""
        try:
            if key == ' ':
                self.keyboard.press(Key.space)
                self.keyboard.release(Key.space)
            elif key == '\n':
                self.keyboard.press(Key.enter)
                self.keyboard.release(Key.enter)
            elif key == '\t':
                self.keyboard.press(Key.tab)
                self.keyboard.release(Key.tab)
            elif key == '\b':
                self.keyboard.press(Key.backspace)
                self.keyboard.release(Key.backspace)
                if self.text_buffer:
                    self.text_buffer = self.text_buffer[:-1]
                return True
            else:
                self.keyboard.press(key.lower())
                self.keyboard.release(key.lower())
            
            if key != '\b':
                self.text_buffer += key
            
            self.keystroke_log.append({
                'key': key,
                'timestamp': time.time()
            })
            
            self.total_keystrokes_sent += 1
            
            return True
            
        except Exception as e:
            print(f"Error sending keystroke '{key}': {e}")
            return False
    
    def send_text(self, text):
        """Send multiple characters as text"""
        for char in text:
            self.send_keystroke(char)
            time.sleep(0.01)
    
    def get_text_buffer(self):
        """Get current text buffer"""
        return self.text_buffer
    
    def clear_buffer(self):
        """Clear text buffer"""
        self.text_buffer = ""
    
    def save_text_to_file(self, filepath=None):
        """Save text buffer to file"""
        if filepath is None:
            filepath = Config.TEXT_OUTPUT_PATH
        
        try:
            import os
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(self.text_buffer)
            
            print(f"Text saved to {filepath}")
            return True
            
        except Exception as e:
            print(f"Error saving text: {e}")
            return False
    
    def get_typing_speed(self):
        """Calculate typing speed in words per minute (WPM)"""
        elapsed_time = time.time() - self.start_time
        
        if elapsed_time < 1:
            return 0.0
        
        words = len(self.text_buffer.split())
        wpm = (words / elapsed_time) * 60
        
        return wpm
    
    def get_statistics(self):
        """Get output statistics"""
        return {
            'total_keystrokes': self.total_keystrokes_sent,
            'characters_typed': len(self.text_buffer),
            'words_typed': len(self.text_buffer.split()),
            'typing_speed_wpm': self.get_typing_speed(),
            'elapsed_time': time.time() - self.start_time
        }
    
    def get_recent_keystrokes(self, count=10):
        """Get recent keystrokes from log"""
        return self.keystroke_log[-count:]
    
    def reset(self):
        """Reset output manager state"""
        self.text_buffer = ""
        self.keystroke_log.clear()
        self.total_keystrokes_sent = 0
        self.start_time = time.time()