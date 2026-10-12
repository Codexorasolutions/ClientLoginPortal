import express from 'express';
import protect from '../middleware/auth.js';
import roleGuard from '../middleware/roleGuard.js';
import upload from '../middleware/upload.js';
import {
  listPendingRequests,
  approveRequest,
  rejectRequest,
  uploadDeliverable,
  getOverview,
  listClients,
  getClientDetail,
  upsertProject,
  createInvoice,
  updateInvoice,
  downloadInvoicePdfOwner,
  downloadReceiptOwner,
  listAllTickets,
  replyToTicketOwner,
  updateTicketStatus,
  listAllActivity,
} from '../controllers/ownerController.js';
import { listLeads, updateLeadStatus } from '../controllers/leadController.js';
import { getOwnerSettings, updateOwnerSettings, sendTestEmail } from '../controllers/settingsController.js';
import { listAudit, listAuditActions } from '../controllers/auditController.js';

const router = express.Router();

// wraps multer so a too-large or malformed upload returns a clear JSON
// message instead of falling through to Express's default HTML error page
const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'That file is too large — the limit is 10 MB.' });
    }
    console.error(err);
    return res.status(400).json({ message: `Upload failed: ${err.message}` });
  });
};

// every route below requires a valid JWT AND role "owner"
router.use(protect, roleGuard('owner'));

router.get('/overview', getOverview);
router.get('/activity', listAllActivity);

router.get('/pending-requests', listPendingRequests);
router.post('/approve/:id', approveRequest);
router.post('/reject/:id', rejectRequest);

router.get('/clients', listClients);
router.get('/clients/:id', getClientDetail);
router.post('/clients/:id/project', upsertProject);
router.post('/clients/:id/invoices', createInvoice);
router.patch('/invoices/:invoiceId', updateInvoice);
router.get('/invoices/:invoiceId/pdf', downloadInvoicePdfOwner);
router.get('/invoices/:invoiceId/receipt', downloadReceiptOwner);
router.post('/clients/:clientId/deliverables', handleUpload, uploadDeliverable);

router.get('/tickets', listAllTickets);
router.post('/tickets/:id/reply', replyToTicketOwner);
router.patch('/tickets/:id', updateTicketStatus);

router.get('/leads', listLeads);
router.patch('/leads/:id', updateLeadStatus);

// business settings (receipts + email wording) and the owner audit log
router.get('/settings', getOwnerSettings);
router.put('/settings', updateOwnerSettings);
router.post('/settings/test-email', sendTestEmail);
router.get('/audit/actions', listAuditActions);
router.get('/audit', listAudit);

export default router;
