const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT Token
const generateToken = (userId) => {
  return jwt.sign(
    { userId, id: userId },
    process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    { expiresIn: '24h' }
  );
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, rollNo, password, department } = req.body;

    console.log('📝 Registration attempt:', { email, rollNo });

    // Validate
    if (!name || !email || !rollNo || !password) {
      return res.status(400).json({ 
        message: 'All fields are required' 
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { rollNo }]
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email or roll number already exists' 
      });
    }

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      rollNo: rollNo.toUpperCase(),
      password,
      department: department || 'Computer Science'
    });

    await user.save();

    // Generate token
    const token = user.generateAuthToken();

    console.log('✅ User registered:', user._id);

    // ✅ CRITICAL: Return user object with ALL fields
    res.status(201).json({
      token,
      user: {
        _id: user._id,
        id: user._id,  // Some code might use 'id'
        name: user.name,
        email: user.email,
        rollNo: user.rollNo,
        department: user.department
      }
    });
  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      message: 'Registration failed', 
      error: error.message 
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// Login
exports.login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    console.log('🔐 Login attempt:', identifier);

    if (!identifier || !password) {
      return res.status(400).json({ 
        message: 'Please provide email/roll number and password' 
      });
    }

    // Find user
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { rollNo: identifier.toUpperCase() }
      ]
    }).select('+password');

    if (!user) {
      return res.status(401).json({ 
        message: 'Invalid credentials' 
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        message: 'Invalid credentials' 
      });
    }

    // Generate token
    const token = user.generateAuthToken();

    console.log('✅ Login successful:', user._id);

    // ✅ CRITICAL: Return user object with ALL fields
    res.json({
      token,
      user: {
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        rollNo: user.rollNo,
        department: user.department
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      message: 'Login failed', 
      error: error.message 
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ message: 'Failed to get user', error: error.message });
  }
};