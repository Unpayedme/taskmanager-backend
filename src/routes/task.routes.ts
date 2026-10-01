import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import * as controller from '../controllers/task.controller.js';

const router = Router();
router.use(requireAuth);
router.get('/', controller.list);
router.get('/stats', controller.stats);
router.post('/', controller.create);
router.get('/:id', controller.get);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
export default router;
