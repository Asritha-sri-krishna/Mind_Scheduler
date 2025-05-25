require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;

// Twilio config
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

if (!accountSid || !authToken || !fromPhone) {
    console.error('Missing Twilio environment variables');
    process.exit(1);
}

const client = twilio(accountSid, authToken);

// Middleware to log incoming requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// SMS endpoint
app.post('/schedule-sms', (req, res) => {
    const { phone, message, delay } = req.body;

    if (!phone || !message || typeof delay !== 'number') {
        return res.status(400).json({ success: false, error: 'Missing or invalid parameters' });
    }

    if (delay < 0) {
        return res.status(400).json({ success: false, error: 'Delay must be non-negative' });
    }

    setTimeout(() => {
        client.messages
            .create({
                body: message,
                from: fromPhone,
                to: phone,
            })
            .then(message => console.log(`SMS sent: ${message.sid}`))
            .catch(err => console.error('Error sending SMS:', err));
    }, delay);

    res.json({ success: true, message: 'SMS scheduled' });
});

// Start the server
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});


  