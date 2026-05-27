const express = require('express');
const router = express.Router();
const broadcastController = require('../controllers/broadcastController');
const { authenticate, requireAdminOrPrincipal } = require('../middleware/auth');

router.get('/', authenticate, broadcastController.getBroadcasts);
router.post('/', authenticate, requireAdminOrPrincipal, broadcastController.sendBroadcast);
router.post('/whatsapp', authenticate, requireAdminOrPrincipal, broadcastController.sendWhatsAppBroadcast);
router.delete('/:id', authenticate, requireAdminOrPrincipal, broadcastController.deleteBroadcast);

module.exports = router;