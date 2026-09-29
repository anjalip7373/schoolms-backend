const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const broadcastController = require('../controllers/broadcastController');
const { authenticate, requireAdminOrPrincipal } = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 16 * 1024 * 1024 } });

const uploadMedia = (req, res, next) => {
  upload.single('media')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: "File too large. Limits: images 4 MB, videos and other files 16 MB. Please choose a smaller file." });
      }
      return res.status(400).json({ message: err.message });
    }
    if (req.file && req.file.mimetype.startsWith('image/') && req.file.size > 4 * 1024 * 1024) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: "Image too large. Images can be up to 4 MB. Please choose a smaller image." });
    }
    next();
  });
};

router.get('/', authenticate, broadcastController.getBroadcasts);
router.post('/', authenticate, requireAdminOrPrincipal, uploadMedia, broadcastController.sendBroadcast);
router.post('/whatsapp', authenticate, requireAdminOrPrincipal, uploadMedia, broadcastController.sendWhatsAppBroadcast);
router.delete('/:id', authenticate, requireAdminOrPrincipal, broadcastController.deleteBroadcast);

module.exports = router;