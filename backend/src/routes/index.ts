import { Router } from 'express';
import healthRouter from './health.routes';
import authRouter from './authRoutes';
import boardRouter from './boardRoutes';
import columnRouter from './columnRoutes';
import taskRouter from './taskRoutes';

const apiRouter: Router = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(boardRouter);
apiRouter.use(columnRouter);
apiRouter.use(taskRouter);

export default apiRouter;
