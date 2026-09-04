import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './authRoutes';

const apiRouter: Router = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
// Feature routers (boards, tasks) will be registered here in later phases.

export default apiRouter;
