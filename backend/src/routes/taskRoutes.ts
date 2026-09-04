import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authorizeColumn, authorizeTask } from '../middleware/authorization';
import { create, list, getOne, update, remove, move } from '../controllers/taskController';

const taskRouter: Router = Router();

// Task routes resolve the parent board before authorization: column-scoped
// routes via authorizeColumn, taskId-scoped routes via authorizeTask.
// Reading needs 'read'; changing content needs 'content' (owner or member).
taskRouter.post('/columns/:columnId/tasks', requireAuth, authorizeColumn('content'), create);
taskRouter.get('/columns/:columnId/tasks', requireAuth, authorizeColumn('read'), list);
taskRouter.get('/tasks/:taskId', requireAuth, authorizeTask('read'), getOne);
taskRouter.patch('/tasks/:taskId', requireAuth, authorizeTask('content'), update);
// Movement is a content-level change: it reorders the board's tasks.
taskRouter.patch('/tasks/:taskId/move', requireAuth, authorizeTask('content'), move);
taskRouter.delete('/tasks/:taskId', requireAuth, authorizeTask('content'), remove);

export default taskRouter;
