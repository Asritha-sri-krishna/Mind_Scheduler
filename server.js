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
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-very-strong-secret-key-for-production';

// Initialize PostgreSQL Pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

console.log(`✅ PostgreSQL client configured.`);

// --- Database Schema and Table Creation ---
async function createTables() {
  const client = await db.connect();
  try {
    const tableCheck = await client.query("SELECT to_regclass('public.users');");
    if (tableCheck.rows[0].to_regclass) {
      console.log('ℹ️ Tables already exist. Skipping creation.');
      return;
    }
    console.log('🚀 Creating database tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS mood_data (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        date_key TEXT NOT NULL,
        mood TEXT NOT NULL,
        UNIQUE(user_id, date_key)
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        date TIMESTAMP NOT NULL
      );
    `);
    console.log('✅ Database tables created.');
  } catch (err) {
    console.error('❌ Error creating tables:', err);
  } finally {
    client.release();
  }
}

createTables().catch(err => console.error("Initial table creation failed:", err));

// --- Database Query Functions ---
async function findUserByEmail(email) {
  const res = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return res.rows[0];
}

async function createUser(email, hashedPassword) {
  const res = await db.query(
    'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
    [email.toLowerCase(), hashedPassword]
  );
  return { lastInsertRowid: res.rows[0].id };
}

async function getUserById(id) {
  const res = await db.query('SELECT id, email, created_at FROM users WHERE id = $1', [id]);
  return res.rows[0];
}

async function getMoodData(userId) {
  const res = await db.query('SELECT date_key, mood FROM mood_data WHERE user_id = $1', [userId]);
  return res.rows;
}

async function insertOrReplaceMood(userId, dateKey, mood) {
  await db.query(
    `INSERT INTO mood_data (user_id, date_key, mood) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, date_key) DO UPDATE SET mood = EXCLUDED.mood`,
    [userId, dateKey, mood]
  );
}

async function deleteMoodData(userId) {
  await db.query('DELETE FROM mood_data WHERE user_id = $1', [userId]);
}

async function getTasks(userId) {
  const res = await db.query('SELECT id, text, completed, date FROM tasks WHERE user_id = $1 ORDER BY date DESC', [userId]);
  return res.rows;
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
    throw e;
  } finally {
    client.release();
  }
}

// Twilio config
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromPhone) {
  console.error('Missing Twilio environment variables');
  process.exit(1);
}

const twilioClient = twilio(accountSid, authToken);

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// JWT Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied, no token provided' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT Verification Error:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Helper functions for mood and tasks formatting
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

// Authentication endpoints (signup, login)
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const existingUser = await findUserByEmail(email);
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await createUser(email, hashedPassword);

    res.status(201).json({ message: 'User created successfully', userId: newUser.lastInsertRowid });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return res.status(400).json({ error: 'Invalid credentials' });

    const moodDataRows = await getMoodData(user.id);
    const taskRows = await getTasks(user.id);

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

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
    if (!user) return res.status(404).json({ error: 'User not found' });

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
    // insert or update moods in a transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM mood_data WHERE user_id = $1', [userId]);
      for (const [dateKey, mood] of Object.entries(moodData)) {
        await client.query(
          `INSERT INTO mood_data (user_id, date_key, mood) VALUES ($1, $2, $3)
          ON CONFLICT (user_id, date_key) DO UPDATE SET mood = EXCLUDED.mood`,
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

// SMS Scheduling Route - sends SMS after delay (no DB storage)
app.post('/api/schedule-sms', authenticateToken, (req, res) => {
  const { phone, message, delay } = req.body;

  if (!phone || !message || typeof delay !== 'number') {
    return res.status(400).json({ success: false, error: 'Missing or invalid parameters' });
  }
  if (delay < 0) {
    return res.status(400).json({ success: false, error: 'Delay must be non-negative' });
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
// In server.js, add this (before app.listen):
app.get('/api/verify', authenticateToken, (req, res) => {
  // If authenticateToken passes, the token is valid
  res.json({ valid: true, userId: req.user.userId, email: req.user.email });
});
// Server start
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});