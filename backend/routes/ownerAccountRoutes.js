import express from 'express';
import {
  getAccount, updateProfile, avatarUpload, uploadAvatar, removeAvatar, updateBusiness, logoUpload, uploadLogo, removeLogo,
  changePassword, requestEmailChange, verifyEmailChange, setTwoFactor, updatePreferences, listSessions, logoutAll,
} from '../controllers/ownerAccountController.js';

// mounted at /api/owner/account, inside ownerRoutes — so protect + roleGuard('owner') already ran
const router = express.Router();

router.get('/', getAccount);
router.put('/profile', updateProfile);
router.post('/avatar', avatarUpload, uploadAvatar);
router.delete('/avatar', removeAvatar);
router.put('/business', updateBusiness);
router.post('/business/logo', logoUpload, uploadLogo);
router.delete('/business/logo', removeLogo);
router.put('/password', changePassword);
router.post('/email/request-otp', requestEmailChange);
router.post('/email/verify', verifyEmailChange);
router.put('/two-factor', setTwoFactor);
router.put('/preferences', updatePreferences);
router.get('/sessions', listSessions);
router.post('/logout-all', logoutAll);

export default router;
