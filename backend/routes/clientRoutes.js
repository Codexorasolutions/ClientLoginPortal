import express from 'express';
import protect from '../middleware/auth.js';
import roleGuard from '../middleware/roleGuard.js';
import { getDashboard, createTicket, listTickets, getActivity, downloadInvoicePdf, downloadReceiptClient, replyToTicketClient } from '../controllers/clientController.js';

const router = express.Router();

// every route below requires a valid JWT AND role "client"
router.use(protect, roleGuard('client'));

router.get('/dashboard', getDashboard);
router.post('/tickets', createTicket);
router.post('/tickets/:id/reply', replyToTicketClient);
router.get('/tickets', listTickets);
router.get('/activity', getActivity);
router.get('/invoices/:id/pdf', downloadInvoicePdf);
router.get('/invoices/:id/receipt', downloadReceiptClient);

export default router;
