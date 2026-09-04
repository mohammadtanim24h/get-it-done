import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authorizeBoard } from '../middleware/authorization';
import { create, list, update, remove } from '../controllers/columnController';

const columnRouter: Router = Router();

// Column CRUD, scoped to a board. Reading needs 'read'; changing content
// needs 'content' (owner or member). The service additionally verifies the
// column belongs to the requested board.
columnRouter.post('/boards/:boardId/columns', requireAuth, authorizeBoard('content'), create);
columnRouter.get('/boards/:boardId/columns', requireAuth, authorizeBoard('read'), list);
columnRouter.patch('/boards/:boardId/columns/:columnId', requireAuth, authorizeBoard('content'), update);
columnRouter.delete('/boards/:boardId/columns/:columnId', requireAuth, authorizeBoard('content'), remove);

export default columnRouter;
