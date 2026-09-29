const { sendBroadcastWhatsApp } = require('../config/whatsappService');

const pool = require('../config/db');
const { sendBroadcastEmail } = require('../config/emailService');
// const { sendWhatsAppMessage } = require('../config/whatsappService');


exports.getBroadcasts = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT b.*, u.full_name as sent_by_name, c.name as class_name
       FROM broadcasts b
       JOIN users u ON b.sent_by = u.id
       LEFT JOIN classes c ON b.target_class_id = c.id
       ORDER BY b.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.sendBroadcast = async (req, res) => {
  try {
    const { title, message, target_type, target_class_id } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    // Media file detection
    let fileUrl = null, fileName = null, fileType = null;
    if (req.file) {
      fileUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5000'}/uploads/${req.file.filename}`;
      fileName = req.file.originalname;
      fileType = req.file.mimetype;
    }

    // Get recipients based on target
    let recipients = [];

    if (target_type === 'all') {
      // All students + all employees
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s WHERE s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`
      );
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, 'employee' as type FROM users u WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''`
      );
      recipients = [...students, ...employees];

    } else if (target_type === 'class') {
      // All students in a class
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s 
         WHERE s.class_id = ? AND s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`,
        [target_class_id]
      );
      recipients = students;

    } else if (target_type === 'students') {
      // All students
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, 'student' as type FROM students s WHERE s.fee_status = 'active' AND s.email IS NOT NULL AND s.email != ''`
      );
      recipients = students;

    } else if (target_type === 'employees') {
      // All employees
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, 'employee' as type FROM users u WHERE u.is_active = 1 AND u.email IS NOT NULL AND u.email != ''`
      );
      recipients = employees;
    }

    console.log(`Broadcasting to ${recipients.length} recipients`);

    // Save broadcast record
    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count, file_url, file_name, file_type)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [title, message, target_type, target_class_id || null, req.user.id, recipients.length, fileUrl, fileName, fileType]
      );
    } catch (dbErr) {
      // Fallback if file_url/file_name/file_type columns don't exist yet on this DB
      [result] = await pool.execute(
        `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count)
         VALUES (?,?,?,?,?,?)`,
        [title, message, target_type, target_class_id || null, req.user.id, recipients.length]
      );
    }

    // Send emails async
    if (recipients.length > 0) {
      sendBroadcastNotifications(recipients, title, message, req.user.full_name || 'SchoolMS', fileUrl)
        .catch(e => console.error('Broadcast notification error:', e.message));
    }

    res.json({
      message: `Broadcast sent to ${recipients.length} recipients`,
      broadcast_id: result.insertId,
      sent_count: recipients.length,
      file_url: fileUrl
    });

  } catch (err) {
    console.error('Broadcast error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.deleteBroadcast = async (req, res) => {
  try {
    await pool.execute('DELETE FROM broadcasts WHERE id=?', [req.params.id]);
    res.json({ message: 'Broadcast deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Send emails in batches
const sendBroadcastNotifications = async (recipients, title, message, senderName, fileUrl) => {
  const { sendBroadcastEmail } = require('../config/emailService');
  let emailSent = 0, whatsappSent = 0;

  for (const recipient of recipients) {
    // Send Email — attachment shown as a button using the same fileUrl
    if (recipient.email) {
      try {
        await sendBroadcastEmail(recipient.email, recipient.full_name, title, message, senderName, fileUrl);
        emailSent++;
      } catch (e) {
        console.error(`Email failed for ${recipient.email}:`, e.message);
      }
    }

    // Send WhatsApp — image/PDF sent as real media, not a text link
    const phone = recipient.whatsapp_no || recipient.phone;
    if (phone) {
      try {
        await sendBroadcastWhatsApp(phone, recipient.full_name, title, message, fileUrl);
        whatsappSent++;
      } catch (e) {
        console.error(`WhatsApp failed for ${phone}:`, e.message);
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`Broadcast complete: ${emailSent} emails, ${whatsappSent} WhatsApp sent`);
};

exports.sendWhatsAppBroadcast = async (req, res) => {
  try {
    const { title, message, target_type, target_class_id } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    // Media file detection
    let fileUrl = null, fileName = null, fileType = null;
    if (req.file) {
      fileUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5000'}/uploads/${req.file.filename}`;
      fileName = req.file.originalname;
      fileType = req.file.mimetype;
    }

    // Get recipients with phone numbers
    let recipients = [];

    if (target_type === 'all') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.fee_status = 'active'`
      );
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, u.phone, NULL as whatsapp_no, 'employee' as type 
         FROM users u WHERE u.is_active = 1`
      );
      recipients = [...students, ...employees];

    } else if (target_type === 'class') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.class_id = ? AND s.fee_status = 'active'`,
        [target_class_id]
      );
      recipients = students;

    } else if (target_type === 'students') {
      const [students] = await pool.execute(
        `SELECT s.full_name, s.email, s.phone, s.whatsapp_no, 'student' as type 
         FROM students s WHERE s.fee_status = 'active'`
      );
      recipients = students;

    } else if (target_type === 'employees') {
      const [employees] = await pool.execute(
        `SELECT u.full_name, u.email, u.phone, NULL as whatsapp_no, 'employee' as type 
         FROM users u WHERE u.is_active = 1`
      );
      recipients = employees;
    }

    

    // Filter only those with phone
    const withPhone = recipients.filter(r => r.phone || r.phone2);
    console.log(`WhatsApp broadcast to ${withPhone.length} recipients`);

    // Save to broadcast history
    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count, file_url, file_name, file_type)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [`[WhatsApp] ${title}`, message, target_type, target_class_id || null, req.user.id, withPhone.length, fileUrl, fileName, fileType]
      );
    } catch (dbErr) {
      [result] = await pool.execute(
        `INSERT INTO broadcasts (title, message, target_type, target_class_id, sent_by, sent_count)
         VALUES (?,?,?,?,?,?)`,
        [`[WhatsApp] ${title}`, message, target_type, target_class_id || null, req.user.id, withPhone.length]
      );
    }

    // Send WhatsApp messages async — don't block response
    sendWhatsAppMessages(withPhone, title, message, req.user.full_name, fileUrl)
      .catch(e => console.error('WhatsApp broadcast error:', e.message));

    res.json({
      message: `WhatsApp broadcast sending to ${withPhone.length} recipients`,
      broadcast_id: result.insertId,
      sent_count: withPhone.length,
      skipped: recipients.length - withPhone.length,
      file_url: fileUrl
    });

  } catch (err) {
    console.error('WhatsApp broadcast error:', err.message);
    res.status(500).json({ message: err.message });
  }
};

const sendWhatsAppMessages = async (recipients, title, message, senderName, fileUrl) => {
  let sent = 0;
  for (const recipient of recipients) {
    try {
      const phone = recipient.phone || recipient.phone2;
      await sendBroadcastWhatsApp(phone, recipient.full_name, title, message, fileUrl);
      sent++;
      console.log(`WhatsApp sent to: ${recipient.full_name}`);
    } catch (e) {
      console.error(`WhatsApp failed for ${recipient.full_name}:`, e.message);
    }
  }
  console.log(`WhatsApp broadcast complete: ${sent}/${recipients.length}`);
};