require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

client.messages.create({
  from: process.env.TWILIO_WHATSAPP_FROM,
  to: 'whatsapp:+918999197373', // ← put your own phone number here
  body: '🏫 SchoolMS Test Message - WhatsApp is working!'
})
.then(msg => console.log('✅ SUCCESS! Message SID:', msg.sid))
.catch(err => console.error('❌ FAILED:', err.message));