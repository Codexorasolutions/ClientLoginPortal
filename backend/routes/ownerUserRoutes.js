import express from 'express';
import {
  listUsers, exportUsersCsv, getUser, updateUser, approve, reject, suspend, reactivate, terminate, restore, forceLogout, resetPassword, resendEmail,
  exportUserData, hardDelete, bulkAction,
} from '../controllers/ownerUsersController.js';

// mounted at /api/owner/users inside ownerRoutes — protect + roleGuard('owner') already ran.
// NOTE: fixed paths (/export, /bulk) must come before /:id.
const router = express.Router();

router.get('/', listUsers);
router.get('/export', exportUsersCsv);
router.post('/bulk', bulkAction);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.get('/:id/export', exportUserData);
router.post('/:id/approve', approve);
router.post('/:id/reject', reject);
router.post('/:id/suspend', suspend);
router.post('/:id/reactivate', reactivate);
router.post('/:id/terminate', terminate);
router.post('/:id/restore', restore);
router.post('/:id/force-logout', forceLogout);
router.post('/:id/reset-password', resetPassword);
router.post('/:id/resend-email', resendEmail);
router.delete('/:id', hardDelete);

export default router;
