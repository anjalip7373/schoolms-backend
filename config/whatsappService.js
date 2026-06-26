require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const formatPhone = (phone) => {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '91' + cleaned.slice(1);
  if (!cleaned.startsWith('91') && cleaned.length === 10) cleaned = '91' + cleaned;
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
};

// HELPER LOGIC: STRICT INDIA LOCAL TIME CAPTURE OVERRIDE FOR TWILIO
const getIndiaDateTimeString = () => {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: true
  });
};

const sendWhatsApp = async (toPhone, message) => {
  try {
    const formatted = formatPhone(toPhone);
    if (!formatted) {
      console.log('Invalid phone number:', toPhone);
      return false;
    }
    const msg = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${formatted}`,
      body: message
    });
    console.log(`✅ WhatsApp sent to ${formatted} | SID: ${msg.sid}`);
    return true;
  } catch (err) {
    console.error(`❌ WhatsApp failed to ${toPhone}:`, err.message);
    return false;
  }
};

// ── PASSWORD RESET OTP ────────────────────────────────────────
const sendPasswordResetWhatsApp = async (phone, userName, otp) => {
  const message =
    `🏫 *SchoolMS - Password Reset OTP*\n\n` +
    `Hello *${userName}*,\n\n` +
    `Your OTP for password reset is:\n\n` +
    `🔐 *${otp}*\n\n` +
    `⏱ Valid for *15 minutes* only.\n` +
    `⚠ Do NOT share this OTP with anyone.\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

// ── PASSWORD CHANGED CONFIRMATION ────────────────────────────
const sendPasswordChangedWhatsApp = async (phone, userName) => {
  const message =
    `🏫 *SchoolMS - Password Changed*\n\n` +
    `Hello *${userName}*,\n\n` +
    `✅ Your SchoolMS password has been changed successfully.\n\n` +
    `🕐 Time: *${getIndiaDateTimeString()}*\n\n` +
    `⚠ If you did not do this, contact your administrator immediately.\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

// ── ATTENDANCE NOTIFICATION ───────────────────────────────────
const sendAttendanceWhatsApp = async (phone, studentName, className, date, status) => {
  const statusEmoji = { absent: '❌', late: '⏰', halfday: '🌓' };
  const statusText  = { absent: 'ABSENT', late: 'LATE', halfday: 'HALF DAY' };
  const message =
    `🏫 *SchoolMS Attendance Alert*\n\n` +
    `${statusEmoji[status] || '📋'} Dear Parent/Guardian,\n\n` +
    `Your child *${studentName}* has been marked *${statusText[status] || status.toUpperCase()}* today.\n\n` +
    `📋 *Details:*\n` +
    `👤 Student: *${studentName}*\n` +
    `🏫 Class: *${className}*\n` +
    `📅 Date: *${date}*\n` +
    `📊 Status: *${statusText[status] || status.toUpperCase()}*\n\n` +
    `Please contact the school for more information.\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

// ── FEE PAYMENT NOTIFICATION ──────────────────────────────────
const sendFeeWhatsApp = async (phone, studentName, className, receiptNo, amount, feeType, date, paymentMethod) => {
  const message =
    `🏫 *SchoolMS - Fee Payment Confirmed*\n\n` +
    `✅ Payment received successfully!\n\n` +
    `📋 *Receipt No:* ${receiptNo}\n` +
    `👤 *Student:* ${studentName}\n` +
    `🏫 *Class:* ${className}\n` +
    `📚 *Fee Type:* ${feeType}\n` +
    `💵 *Amount:* Rs. ${parseFloat(amount || 0).toLocaleString('en-IN')}\n` +
    `💳 *Method:* ${paymentMethod || 'Cash'}\n` +
    `📅 *Date:* ${date}\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

// ── SALARY SLIP NOTIFICATION ──────────────────────────────────
const sendSalaryWhatsApp = async (phone, empName, month, netSalary, slipNo) => {
  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const monthLabel = month ? (() => {
    const parts = month.split('-');
    return `${monthNames[parseInt(parts[1]) - 1]} ${parts[0]}`;
  })() : month;
  const message =
    `🏫 *SchoolMS - Salary Slip*\n\n` +
    `Salary slip for *${monthLabel}* is ready!\n\n` +
    `👤 Employee: *${empName}*\n` +
    `📅 Month: *${monthLabel}*\n` +
    `💰 Net Salary: *Rs. ${parseFloat(netSalary || 0).toLocaleString('en-IN')}*\n\n` +
    `Please check your email for the PDF salary slip.\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

// ── BROADCAST NOTIFICATION ────────────────────────────────────
const sendBroadcastWhatsApp = async (phone, name, title, message) => {
  const fullMessage =
    `🏫 *SchoolMS Announcement*\n\n` +
    `📢 *${title}*\n\n` +
    `${message}\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, fullMessage);
};


// ─── WELCOME EMPLOYEE WHATSAPP ────────────────────────────────
const sendEmployeeWelcomeWhatsApp = async (phone, empName, empId, loginUserId, role, password) => {
  const message =
    `🏫 *Welcome to SchoolMS!*\n\n` +
    `Dear *${empName}*,\n\n` +
    `Your staff account has been created successfully.\n\n` +
    `📋 *Your Details:*\n` +
    `🆔 Employee ID: *${empId}*\n` +
    `👤 Login User ID: *${loginUserId}*\n` +
    `🔑 Password: *${password}*\n` +
    `💼 Role: *${role}*\n\n` +
    `⚠️ Please change your password after first login.\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

// ─── EMPLOYEE UPDATE WHATSAPP ─────────────────────────────────
const sendEmployeeUpdateWhatsApp = async (phone, empName) => {
  const message =
    `🏫 *SchoolMS - Profile Updated*\n\n` +
    `Dear *${empName}*,\n\n` +
    `✅ Your staff profile has been updated.\n\n` +
    `🕐 Time: *${getIndiaDateTimeString()}*\n\n` +
    `⚠️ If you did not expect this change, contact your administrator.\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

// ─── WELCOME STUDENT WHATSAPP ─────────────────────────────────
const sendStudentWelcomeWhatsApp = async (phone, studentName, rollNo, className) => {
  const message =
    `🏫 *Welcome to SchoolMS!*\n\n` +
    `Dear *${studentName}*,\n\n` +
    `You have been successfully enrolled!\n\n` +
    `📋 *Your Details:*\n` +
    `🎫 Roll No: *${rollNo}*\n` +
    `🏫 Class: *${className}*\n\n` +
    `Wishing you a great academic journey! 🌟\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

// ─── STUDENT UPDATE WHATSAPP ──────────────────────────────────
const sendStudentUpdateWhatsApp = async (phone, studentName) => {
  const message =
    `🏫 *SchoolMS - Profile Updated*\n\n` +
    `Dear *${studentName}*,\n\n` +
    `✅ Your student profile has been updated.\n\n` +
    `🕐 Time: *${getIndiaDateTimeString()}*\n\n` +
    `⚠️ If you did not expect this change, contact your school administrator.\n\n` +
    `_SchoolMS - School Management System_`;
  return sendWhatsApp(phone, message);
};

module.exports = {
  sendWhatsApp,
  sendPasswordResetWhatsApp,
  sendPasswordChangedWhatsApp,
  sendAttendanceWhatsApp,
  sendFeeWhatsApp,
  sendSalaryWhatsApp,
  sendBroadcastWhatsApp,
  sendEmployeeWelcomeWhatsApp,
  sendEmployeeUpdateWhatsApp,
  sendStudentWelcomeWhatsApp,
  sendStudentUpdateWhatsApp,
};