import type { RequestHandler } from 'express';
import { NotFoundError, UnauthorizedError } from '../utils/appError';
import { requireBoardAccess, requireColumnBoardAccess, requireTaskBoardAccess } from '../services/authorizationService';
import type { BoardPermission } from '../types/authorization';

/**
 * Reusable board authorization middleware factory.
 *
 * Usage (always after requireAuth):
 *   router.get('/boards/:boardId', requireAuth, authorizeBoard('read'), controller)
 *   router.post('/boards/:boardId/members', requireAuth, authorizeBoard('manageMembers'), controller)
 *
 * Behavior:
 * - 401 if the request is not authenticated.
 * - 404 NOT_FOUND if the board does not exist (existence is not leaked
 *   differently for authorized vs unauthorized users).
 * - 403 FORBIDDEN with a consistent error if the user lacks the permission.
 * - On success, attaches the resolved context to req.boardAccess so
 *   controllers never need to re-check or trust client input.
 */
export const authorizeBoard =
  (permission: BoardPermission): RequestHandler =>
  async (req, _res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const boardId = req.params.boardId;
      if (typeof boardId !== 'string' || boardId === '') {
        throw new NotFoundError('Board not found');
      }

      req.boardAccess = await requireBoardAccess(req.user.id, boardId, permission);
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Column-scoped routes (/columns/:columnId/...) resolve the column's parent
 * board FIRST, then authorize against that board. The resolved access
 * context (including boardId) is attached to req.boardAccess.
 */
export const authorizeColumn =
  (permission: BoardPermission): RequestHandler =>
  async (req, _res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const columnId = req.params.columnId;
      if (typeof columnId !== 'string' || columnId === '') {
        throw new NotFoundError('Column not found');
      }

      req.boardAccess = await requireColumnBoardAccess(req.user.id, columnId, permission);
      next();
    } catch (error) {
      next(error);
    }
  };

/**
 * Task-scoped routes (/tasks/:taskId) resolve the task's parent board (via
 * its column) FIRST, then authorize against that board. The resolved boardId
 * is attached to req.boardAccess and used by the service to re-verify
 * task/board consistency.
 */
export const authorizeTask =
  (permission: BoardPermission): RequestHandler =>
  async (req, _res, next) => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const taskId = req.params.taskId;
      if (typeof taskId !== 'string' || taskId === '') {
        throw new NotFoundError('Task not found');
      }

      req.boardAccess = await requireTaskBoardAccess(req.user.id, taskId, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
