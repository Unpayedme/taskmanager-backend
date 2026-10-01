import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/auth.controller.js';
import { requireTrustedOrigin } from '../middlewares/csrf.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts. Please try again later.' } },
});
const refreshLimiter = rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
router.get('/config', controller.config);
router.post('/register', requireTrustedOrigin, credentialsLimiter, controller.register);
router.post('/login', requireTrustedOrigin, credentialsLimiter, controller.login);
router.post('/refresh', requireTrustedOrigin, refreshLimiter, controller.refresh);
router.post('/logout', requireTrustedOrigin, controller.logout);
router.get('/me', requireAuth, controller.me);
router.get('/google', credentialsLimiter, controller.googleStart);
router.get('/google/callback', controller.googleCallback);
export default router;
