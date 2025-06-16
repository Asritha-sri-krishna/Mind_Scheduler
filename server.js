// server.js (Your complete server.js file from previous iteration, with changes)

require('dotenv').config(); // MUST be at the very top of your file

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
    // Check and create main app tables (users, mood_data, tasks)
    const usersTableCheck = await client.query("SELECT to_regclass('public.users');");
    if (!usersTableCheck.rows[0].to_regclass) {
      console.log('🚀 Creating main database tables (users, mood_data, tasks)...');
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
      console.log('✅ Main database tables created.');
    } else {
      console.log('ℹ️ Main database tables already exist.');
    }

    // Check and create twilio_requests table
    const twilioTableCheck = await client.query("SELECT to_regclass('public.twilio_requests');");
    if (!twilioTableCheck.rows[0].to_regclass) {
        console.log('🚀 Creating twilio_requests table...');
        await client.query(`
            CREATE TABLE twilio_requests (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                phone_number VARCHAR(15) UNIQUE NOT NULL,
                company VARCHAR(100)
            );
        `);
        console.log('✅ twilio_requests table created.');
    } else {
        console.log('ℹ️ twilio_requests table already exists.');
    }

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

// Twilio config for general SMS (keep this for SMS scheduling)
const accountSid = process.env.TWILIO_SID; // Your Account SID
const authToken = process.env.TWILIO_AUTH_TOKEN; // Your Auth Token
const fromPhone = process.env.TWILIO_PHONE_NUMBER; // Your Twilio Phone Number (for general SMS)
// twilioVerifyServiceSid is no longer used for automated send on form submission
const twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID; // Still needed if you build a separate manual verify tool

if (!accountSid || !authToken || !fromPhone || !twilioVerifyServiceSid) { // Keep this check for other Twilio features
  console.error('Missing Twilio environment variables. Please check TWILIO_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, and TWILIO_VERIFY_SERVICE_SID in your .env file.');
  process.exit(1);
}

const twilioClient = twilio(accountSid, authToken);

// --- Twilio Verification Function (kept for potential future/manual use, but NOT called by the form submission) ---
async function sendTwilioVerification(phoneNumber) {
    // This function will exist but will NOT be called by the /api/twilio-access-request endpoint
    // It's here in case you use it for an internal admin tool later.
    console.log("Attempting to send Twilio verification (manual trigger expected, not auto from form).");
    if (!accountSid || !authToken || !twilioVerifyServiceSid) {
        console.warn('Twilio credentials not fully set for verification. Skipping actual verification call.');
        return { success: false, error: 'Twilio credentials missing.' };
    }
    try {
        const verification = await twilioClient.verify.v2.services(twilioVerifyServiceSid)
            .verifications
            .create({ to: phoneNumber, channel: 'sms' });
        console.log(`Twilio verification sent to ${phoneNumber}: SID ${verification.sid}`);
        return { success: true, sid: verification.sid };
    } catch (error) {
        console.error(`Error sending Twilio verification to ${phoneNumber}:`, error.message);
        return { success: false, error: error.message, twilioErrorCode: error.code };
    }
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

// --- API Endpoint for Twilio SMS Access Request (MODIFIED) ---
app.post('/api/twilio-access-request', async (req, res) => {
    const { userName, userEmail, userPhone, userCompany } = req.body;

    if (!userName || !userEmail || !userPhone) {
        return res.status(400).json({ success: false, message: 'Full Name, Email, and Phone Number are required.' });
    }

    let client;
    try {
        client = await db.connect();
        await client.query('BEGIN');

        // 1. Check if user already exists by email
        const checkUserQuery = `
            SELECT email, phone_number FROM twilio_requests WHERE email = $1;
        `;
        const { rows: existingUsers } = await client.query(checkUserQuery, [userEmail]);
        
        let referenceId = null; // Will be null for existing users
        let isNewUser = false;
        let responseMessage = ''; // Custom message for frontend

        if (existingUsers.length > 0) {
            console.log(`Existing user found for email: ${userEmail}.`);
            responseMessage = 'Your request has been noted. You are already an existing user for SMS access.';
        } else {
            isNewUser = true;
            // Generate a reference ID for the new user (not stored in your current DB schema)
            referenceId = `SMS-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`.toUpperCase();

            // 2. Insert new user data into PostgreSQL
            const insertQuery = `
                INSERT INTO twilio_requests 
                    (username, email, phone_number, company)
                VALUES ($1, $2, $3, $4) RETURNING id;
            `;
            await client.query(insertQuery, [userName, userEmail, userPhone, userCompany]);
            console.log(`New user inserted for ${userEmail}.`);
            
            // --- IMPORTANT CHANGE: NO AUTOMATED TWILIO VERIFICATION HERE ---
            // The `sendTwilioVerification` function is NOT called here.
            // This aligns with your manual verification process.

            responseMessage = 'Your SMS access request has been submitted successfully for manual review.';
        }

        await client.query('COMMIT');

        res.status(200).json({
            success: true,
            referenceId: referenceId, // Will be null for existing users
            isNewUser: isNewUser,
            message: responseMessage // Send the specific message to the frontend
        });

    } catch (err) {
        if (client) {
            await client.query('ROLLBACK');
        }
        console.error('Error processing Twilio access request:', err);
        if (err.code === '23505') {
             return res.status(409).json({ success: false, message: 'An account with this email or phone number already exists.' });
        }
        res.status(500).json({ success: false, message: 'An internal server error occurred.' });
    } finally {
        if (client) {
            client.release();
        }
    }
});


// API endpoint for JWT verification (already existing)
app.get('/api/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, userId: req.user.userId, email: req.user.email });
});


// --- Serve static files from the 'public' directory ---
// This should be at the very end of your routes, so API routes are prioritized.
app.use(express.static(path.join(__dirname, 'public')));
// If you want index.html to be served directly from root path (e.g., http://localhost:3000)
// and not require /index.html, add this route before app.use(express.static)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Server start
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
