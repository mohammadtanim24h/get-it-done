import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

const healthRouter: Router = Router();

healthRouter.get('/health', getHealth);

export default healthRouter;
