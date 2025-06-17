// server.js - Complete version for Supabase and Render deployment
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const app = express();

// Enhanced CORS configuration for production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://mind-scheduler.onrender.com'] 
    : '*',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Environment variables
const PORT = process.env.PORT;
if (!PORT) {
  console.error('❌ PORT not set by Render');
  process.exit(1);  // Good practice for catching misconfigurations
}

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

const JWT_SECRET = process.env.JWT_SECRET || 'your-very-strong-secret-key-for-production';

// Supabase PostgreSQL connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase
  }
});

// Test database connection
db.connect()
  .then(client => {
    console.log('✅ Successfully connected to Supabase PostgreSQL');
    client.release();
  })
  .catch(err => {
    console.error('❌ Failed to connect to Supabase:', err);
    console.error('Connection string:', process.env.DATABASE_URL ? 'Set' : 'Not set');
  });

// --- Database Schema and Table Creation ---
async function createTables() {
  const client = await db.connect();
  try {
    console.log('🔍 Checking database tables...');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create mood_data table
    await client.query(`
      CREATE TABLE IF NOT EXISTS mood_data (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date_key TEXT NOT NULL,
        mood TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date_key)
      );
    `);
    
    // Create tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        date TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create twilio_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS twilio_requests (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone_number VARCHAR(15) UNIQUE NOT NULL,
        company VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('✅ All database tables ready');
  } catch (err) {
    console.error('❌ Error creating tables:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Initialize tables
createTables().catch(err => {
  console.error("Fatal: Could not create tables:", err);
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// --- Database Query Functions ---
async function findUserByEmail(email) {
  try {
    const res = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    return res.rows[0];
  } catch (err) {
    console.error('Error finding user by email:', err);
    throw err;
  }
}

async function createUser(email, hashedPassword) {
  try {
    const res = await db.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
      [email.toLowerCase(), hashedPassword]
    );
    return { lastInsertRowid: res.rows[0].id };
  } catch (err) {
    console.error('Error creating user:', err);
    throw err;
  }
}

async function getUserById(id) {
  try {
    const res = await db.query('SELECT id, email, created_at FROM users WHERE id = $1', [id]);
    return res.rows[0];
  } catch (err) {
    console.error('Error getting user by id:', err);
    throw err;
  }
}

async function getMoodData(userId) {
  try {
    const res = await db.query('SELECT date_key, mood FROM mood_data WHERE user_id = $1', [userId]);
    return res.rows;
  } catch (err) {
    console.error('Error getting mood data:', err);
    throw err;
  }
}

async function getTasks(userId) {
  try {
    const res = await db.query(
      'SELECT id, text, completed, date FROM tasks WHERE user_id = $1 ORDER BY date DESC',
      [userId]
    );
    return res.rows;
  } catch (err) {
    console.error('Error getting tasks:', err);
    throw err;
  }
}

async function updateTasksTx(userId, tasks) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM tasks WHERE user_id = $1', [userId]);
    for (const task of tasks) {
      await client.query(
        'INSERT INTO tasks (user_id, text, completed, date) VALUES ($1, $2, $3, $4)',
        [userId, task.text, task.completed ? true : false, task.date]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error updating tasks:', e);
    throw e;
  } finally {
    client.release();
  }
}

// Twilio configuration
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client only if credentials are available
let twilioClient = null;
if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
  console.log('✅ Twilio client initialized');
} else {
  console.warn('⚠️ Twilio credentials not found. SMS features will be disabled.');
}

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied, no token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT Verification Error:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Helper functions
function convertMoodDataToFrontendFormat(moodDataRows) {
  const moodData = {};
  for (const row of moodDataRows) {
    moodData[row.date_key] = row.mood;
  }
  return moodData;
}

function convertTasksToFrontendFormat(taskRows) {
  return taskRows.map(row => ({
    id: row.id,
    text: row.text,
    completed: Boolean(row.completed),
    date: row.date
  }));
}

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbTest = await db.query('SELECT NOW()');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: true,
        time: dbTest.rows[0].now
      },
      services: {
        twilio: !!twilioClient
      }
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Authentication endpoints
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await createUser(email, hashedPassword);

    res.status(201).json({ 
      message: 'User created successfully', 
      userId: newUser.lastInsertRowid 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const moodDataRows = await getMoodData(user.id);
    const taskRows = await getTasks(user.id);

    const token = jwt.sign(
      { userId: user.id, email: user.email }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        moodData: convertMoodDataToFrontendFormat(moodDataRows),
        tasks: convertTasksToFrontendFormat(taskRows),
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// User data routes
app.get('/api/user/data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const moodDataRows = await getMoodData(userId);
    const taskRows = await getTasks(userId);

    res.json({
      id: user.id,
      email: user.email,
      moodData: convertMoodDataToFrontendFormat(moodDataRows),
      tasks: convertTasksToFrontendFormat(taskRows),
      createdAt: user.created_at
    });
  } catch (error) {
    console.error('Get user data error:', error);
    res.status(500).json({ error: 'Server error fetching user data' });
  }
});

app.put('/api/user/mood', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { moodData } = req.body;
    
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM mood_data WHERE user_id = $1', [userId]);
      
      for (const [dateKey, mood] of Object.entries(moodData)) {
        await client.query(
          `INSERT INTO mood_data (user_id, date_key, mood) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, date_key) DO UPDATE SET
          mood = EXCLUDED.mood`,
          [userId, dateKey, mood]
        );
      }
      
      await client.query('COMMIT');
    } catch(e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const updatedMoodDataRows = await getMoodData(userId);
    res.json({ moodData: convertMoodDataToFrontendFormat(updatedMoodDataRows) });
  } catch (error) {
    console.error('Update mood error:', error);
    res.status(500).json({ error: 'Server error updating mood data' });
  }
});

app.put('/api/user/tasks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { tasks } = req.body;
    await updateTasksTx(userId, tasks);
    const updatedTaskRows = await getTasks(userId);
    res.json({ tasks: convertTasksToFrontendFormat(updatedTaskRows) });
  } catch (error) {
    console.error('Update tasks error:', error);
    res.status(500).json({ error: 'Server error updating tasks' });
  }
});

// SMS Scheduling Route
app.post('/api/schedule-sms', authenticateToken, async (req, res) => {
  const { phone, message, delay } = req.body;

  if (!phone || !message || typeof delay !== 'number') {
    return res.status(400).json({ success: false, error: 'Missing or invalid parameters' });
  }
  
  if (delay < 0) {
    return res.status(400).json({ success: false, error: 'Delay must be non-negative' });
  }

  if (!twilioClient) {
    return res.status(503).json({ success: false, error: 'SMS service not available' });
  }

  try {
    setTimeout(async () => {
      try {
        const msg = await twilioClient.messages.create({
          body: message,
          from: fromPhone,
          to: phone,
        });
        console.log(`SMS sent (sid: ${msg.sid}) to ${phone}`);
      } catch (err) {
        console.error(`Failed to send SMS to ${phone}:`, err);
      }
    }, delay);

    res.json({ success: true, message: 'SMS scheduled successfully' });
  } catch (error) {
    console.error('Error scheduling SMS:', error);
    res.status(500).json({ success: false, error: 'Server error during SMS scheduling' });
  }
});

// Twilio Access Request endpoint (for user-guide.html form)
app.post('/api/twilio-access-request', async (req, res) => {
  const { userName, userEmail, userPhone, userCompany } = req.body;

  if (!userName || !userEmail || !userPhone) {
    return res.status(400).json({ 
      success: false, 
      message: 'Full Name, Email, and Phone Number are required.' 
    });
  }

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');

    const checkUserQuery = `SELECT email, phone_number FROM twilio_requests WHERE email = $1;`;
    const { rows: existingUsers } = await client.query(checkUserQuery, [userEmail]);
    
    let referenceId = null;
    let isNewUser = false;
    let responseMessage = '';

    if (existingUsers.length > 0) {
      console.log(`Existing user found for email: ${userEmail}`);
      responseMessage = 'Your request has been noted. You are already an existing user for SMS access.';
    } else {
      isNewUser = true;
      referenceId = `SMS-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase();

      const insertQuery = `
        INSERT INTO twilio_requests (username, email, phone_number, company)
        VALUES ($1, $2, $3, $4) RETURNING id;
      `;
      await client.query(insertQuery, [userName, userEmail, userPhone, userCompany || null]);
      console.log(`New user inserted for ${userEmail}`);
      
      responseMessage = 'Your SMS access request has been submitted successfully for manual review.';
    }

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      referenceId: referenceId,
      isNewUser: isNewUser,
      message: responseMessage
    });

  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Error processing Twilio access request:', err);
    
    if (err.code === '23505') {
      return res.status(409).json({ 
        success: false, 
        message: 'An account with this email or phone number already exists.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'An internal server error occurred.' 
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

// JWT Verification endpoint
app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({ 
    valid: true, 
    userId: req.user.userId, 
    email: req.user.email 
  });
});

// --- STATIC FILE SERVING AND HTML ROUTES ---
// Serve static files (CSS, JS, images, etc.) from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Specific routes for your HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/guide.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guide.html'));
});

// Catch-all route for any unmatched routes
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // For any other route, redirect to index.html
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, 'public')}`);
  console.log(`📄 Available HTML files: index.html, guide.html`);
});

          
             