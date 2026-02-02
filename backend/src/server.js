const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const proctoringRoutes = require('./routes/proctoring');
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exam');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// ✅ UPDATED CORS Configuration
const corsOptions = {
  origin: [
     'https://exam-proctor-app.vercel.app',  // ✅ Your actual Vercel URL
    'https://exam-proctor-app-*.vercel.app', // ✅ Preview deployments
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/proctoring', proctoringRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    database: 'connected' // You can add actual DB check here
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Exam Proctor Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      exams: '/api/exams',
      proctoring: '/api/proctoring'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Route not found',
      path: req.path,
      status: 404
    }
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 MongoDB: ${process.env.MONGODB_URI ? 'Connected' : 'Not configured'}`);
  console.log(`🔗 CORS enabled for:`, corsOptions.origin);
});

module.exports = app;