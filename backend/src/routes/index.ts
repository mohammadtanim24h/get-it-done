import { Router } from 'express';
import healthRouter from './health.routes';

const apiRouter: Router = Router();

apiRouter.use(healthRouter);
// Feature routers (auth, boards, tasks) will be registered here in later phases.

export default apiRouter;
