import express from 'express';
import protect from '../middleware/auth.js';
import { getProfile, updateProfile, changePassword } from '../controllers/profileController.js';

const router = express.Router();

// shared by both roles — no roleGuard here
router.use(protect);

router.get('/', getProfile);
router.patch('/', updateProfile);
router.patch('/password', changePassword);

export default router;
