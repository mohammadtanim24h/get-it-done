import { Router } from 'express';
import { register, login, logout, me } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const authRouter: Router = Router();

authRouter.post('/auth/register', register);
authRouter.post('/auth/login', login);
authRouter.post('/auth/logout', logout);
authRouter.get('/auth/me', requireAuth, me);

export default authRouter;
