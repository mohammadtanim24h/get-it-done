import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './authRoutes';
import boardRouter from './boardRoutes';

const apiRouter: Router = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(boardRouter);
// Feature routers (columns, tasks) will be registered here in later phases.

export default apiRouter;
