import express from 'express';
import { createLead } from '../controllers/leadController.js';

const router = express.Router();

// public — no auth, this is the incoming contact-form endpoint
router.post('/', createLead);

export default router;
