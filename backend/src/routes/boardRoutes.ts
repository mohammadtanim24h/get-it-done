import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { authorizeBoard } from '../middleware/authorization';
import {
  create,
  list,
  getOne,
  update,
  remove,
  addMember,
  removeMember,
} from '../controllers/boardController';

const boardRouter: Router = Router();

// Board CRUD. Board-scoped routes resolve access first (404 for missing
// boards, 403 for no access) so controllers never re-check permissions.
boardRouter.post('/boards', requireAuth, create);
boardRouter.get('/boards', requireAuth, list);
boardRouter.get('/boards/:boardId', requireAuth, authorizeBoard('read'), getOne);
boardRouter.patch('/boards/:boardId', requireAuth, authorizeBoard('modify'), update);
boardRouter.delete('/boards/:boardId', requireAuth, authorizeBoard('modify'), remove);

// Sharing. Member management is owner-only; membership of other users is
// not inspectable by anyone without manage-members access.
boardRouter.post('/boards/:boardId/members', requireAuth, authorizeBoard('manageMembers'), addMember);
boardRouter.delete('/boards/:boardId/members/:userId', requireAuth, authorizeBoard('manageMembers'), removeMember);

export default boardRouter;
