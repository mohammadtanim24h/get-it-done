import type { Request, Response, NextFunction } from 'express';
import { getHealthStatus } from '../services/health.service';

export async function getHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const health = await getHealthStatus();
    res.status(health.database === 'connected' ? 200 : 503).json({ data: health });
  } catch (error) {
    next(error);
  }
}
