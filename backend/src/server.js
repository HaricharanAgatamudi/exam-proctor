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

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/exams', examRoutes);
  app.use('/api/proctoring', proctoringRoutes);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server is running' });
  });

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });