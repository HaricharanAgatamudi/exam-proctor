import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import Permissions from './components/Permissions';
import ExamPage from './components/ExamPage';
import Results from './components/Results';

import './styles/App.css';

const App = () => {
  const [currentPage, setCurrentPage] = useState('login');
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [streams, setStreams] = useState({ cameraStream: null, screenStream: null });
  const [submission, setSubmission] = useState(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUserRaw = localStorage.getItem('user');

    let parsedUser = null;
    if (storedUserRaw) {
      try {
        parsedUser = JSON.parse(storedUserRaw);
      } catch (err) {
        console.warn('Failed to parse stored user:', err);
        parsedUser = null;
      }
    }

    const isValidUser = parsedUser && typeof parsedUser === 'object' && (parsedUser._id || parsedUser.email);

    if (storedToken && isValidUser) {
      setToken(storedToken);
      setUser(parsedUser);
      setCurrentPage('permissions');
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
      setToken(null);
      setCurrentPage('login');
    }
  }, []);

  const handleLogin = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setCurrentPage('permissions');
  };

  const handleRegister = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setCurrentPage('permissions');
  };

  const handlePermissionsGranted = (grantedStreams) => {
    console.log('📹 Streams granted:', {
      camera: !!grantedStreams.cameraStream,
      screen: !!grantedStreams.screenStream
    });
    setStreams(grantedStreams);
    setCurrentPage('exam');
  };

  const handleExamComplete = (submissionData) => {
    setSubmission(submissionData);
    setCurrentPage('results');
  };

  const handleLogout = () => {
    if (streams.cameraStream) {
      streams.cameraStream.getTracks().forEach(track => track.stop());
    }
    if (streams.screenStream) {
      streams.screenStream.getTracks().forEach(track => track.stop());
    }
    
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
    setStreams({ cameraStream: null, screenStream: null });
    setSubmission(null);
    setCurrentPage('login');
  };

  const switchToRegister = () => {
    setCurrentPage('register');
  };

  const switchToLogin = () => {
    setCurrentPage('login');
  };

  return (
    <div className="app-container">
      {currentPage === 'login' && (
        <Login 
          onLogin={handleLogin} 
          onSwitchToRegister={switchToRegister}
        />
      )}

      {currentPage === 'register' && (
        <Register 
          onRegister={handleRegister}
          onSwitchToLogin={switchToLogin}
        />
      )}

      {currentPage === 'permissions' && user && (
        <Permissions 
          onPermissionsGranted={handlePermissionsGranted} 
          user={user}
          token={token}
          onLogout={handleLogout}
        />
      )}

      {currentPage === 'exam' && user && streams.screenStream && (
        <ExamPage 
          user={user}
          token={token}
          streams={streams}
          onExamComplete={handleExamComplete}
        />
      )}

      {currentPage === 'results' && submission && (
        <Results 
          user={user}
          submission={submission}
          onExit={handleLogout}
        />
      )}

      {currentPage === 'permissions' && !user && (
        <div className="error" style={{
          padding: '40px',
          textAlign: 'center',
          background: '#fee',
          margin: '20px',
          borderRadius: '8px'
        }}>
          <p>Session error — no user found.</p>
          <button onClick={() => { 
            localStorage.clear(); 
            window.location.reload(); 
          }} style={{
            padding: '10px 20px',
            marginTop: '10px',
            cursor: 'pointer'
          }}>
            Reset & Login Again
          </button>
        </div>
      )}

      {currentPage === 'exam' && !streams.screenStream && (
        <div className="info" style={{
          padding: '40px',
          textAlign: 'center',
          background: '#ffa',
          margin: '20px',
          borderRadius: '8px'
        }}>
          <p>⚠️ Screen sharing is required to continue.</p>
          <button onClick={() => setCurrentPage('permissions')} style={{
            padding: '10px 20px',
            marginTop: '10px',
            cursor: 'pointer'
          }}>
            Grant Permissions Again
          </button>
        </div>
      )}
    </div>
  );
};

export default App;