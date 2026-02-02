// src/config/api.js or src/api/index.js
// API Configuration for Vite + Express Backend

// ✅ For Vite: prefer `import.meta.env` - fall back to sensible defaults
// In production we should NOT default to localhost. If no VITE var is provided,
// use same-origin (empty string -> requests go to '/api/...') so deployed
// frontend will call the backend on the host it's served from.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost' ? 'http://localhost:5000' : '');
const PYTHON_PROCTOR_URL = import.meta.env.VITE_PYTHON_PROCTOR_URL ?? (typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost' ? 'http://localhost:5001' : '');

console.log('🔗 Resolved Backend URL:', BACKEND_URL || '(same-origin)');
console.log('🤖 Resolved Python Proctor URL:', PYTHON_PROCTOR_URL || '(same-origin)');

class API {
  async request(url, options = {}) {
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Important for cookies/sessions
      ...options,
    };

    console.log(`📡 ${options.method || 'GET'} ${url}`);

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || data.message || 'Request failed');
      }

      console.log('✅ Success:', data);
      return data;
    } catch (error) {
      console.error('❌ API Error:', error.message);
      throw error;
    }
  }

  // ==================== AUTH ENDPOINTS ====================
  
  async register(userData) {
    return this.request(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async login(credentials) {
    return this.request(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async logout() {
    return this.request(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
    });
  }

  async getCurrentUser() {
    return this.request(`${BACKEND_URL}/api/auth/me`, {
      method: 'GET',
    });
  }

  // ==================== EXAM ENDPOINTS ====================
  
  async getExams() {
    return this.request(`${BACKEND_URL}/api/exams`, {
      method: 'GET',
    });
  }

  async getExamById(examId) {
    return this.request(`${BACKEND_URL}/api/exams/${examId}`, {
      method: 'GET',
    });
  }

  async startExam(examId) {
    return this.request(`${BACKEND_URL}/api/exams/${examId}/start`, {
      method: 'POST',
    });
  }

  async submitExam(examId, submission) {
    return this.request(`${BACKEND_URL}/api/exams/${examId}/submit`, {
      method: 'POST',
      body: JSON.stringify(submission),
    });
  }

  async getExamResults(examId) {
    return this.request(`${BACKEND_URL}/api/exams/${examId}/results`, {
      method: 'GET',
    });
  }

  // ==================== PROCTORING ENDPOINTS (Python Service) ====================
  
  async analyzeFrame(frameData) {
    return this.request(`${PYTHON_PROCTOR_URL}/api/proctor/analyze`, {
      method: 'POST',
      body: JSON.stringify({ frame: frameData }),
    });
  }

  async detectFace(imageData) {
    return this.request(`${PYTHON_PROCTOR_URL}/api/proctor/detect-face`, {
      method: 'POST',
      body: JSON.stringify({ image: imageData }),
    });
  }

  async detectGhostTyping(typingData) {
    return this.request(`${PYTHON_PROCTOR_URL}/api/proctor/ghost-typing`, {
      method: 'POST',
      body: JSON.stringify(typingData),
    });
  }

  async analyzeGaze(gazeData) {
    return this.request(`${PYTHON_PROCTOR_URL}/api/proctor/gaze`, {
      method: 'POST',
      body: JSON.stringify(gazeData),
    });
  }

  // ==================== PROCTORING REPORTS (Node Backend) ====================
  
  async reportViolation(violationData) {
    return this.request(`${BACKEND_URL}/api/proctoring/violation`, {
      method: 'POST',
      body: JSON.stringify(violationData),
    });
  }

  async getViolations(sessionId) {
    return this.request(`${BACKEND_URL}/api/proctoring/violations/${sessionId}`, {
      method: 'GET',
    });
  }

  async getProctoringReport(examId) {
    return this.request(`${BACKEND_URL}/api/proctoring/report/${examId}`, {
      method: 'GET',
    });
  }

  // ==================== HEALTH CHECKS ====================
  
  async checkBackendHealth() {
    try {
      return await this.request(`${BACKEND_URL}/health`);
    } catch (error) {
      return { status: 'ERROR', message: error.message };
    }
  }

  async checkPythonServiceHealth() {
    try {
      return await this.request(`${PYTHON_PROCTOR_URL}/health`);
    } catch (error) {
      return { status: 'ERROR', message: error.message };
    }
  }
}

const api = new API();
export default api;

// Also export URLs for direct use
export { BACKEND_URL, PYTHON_PROCTOR_URL };