import express from 'express';
import protect from '../middleware/auth.js';
import { listNotifications, markRead, markAllRead } from '../controllers/notificationController.js';

const router = express.Router();

// any logged-in user (client or owner) can read their own notifications
router.use(protect);

router.get('/', listNotifications);
router.patch('/:id/read', markRead);
router.patch('/read-all', markAllRead);

export default router;
