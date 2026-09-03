import type { Request, Response } from 'express';
import { getHealthStatus } from '../services/health.service';

export function getHealth(_req: Request, res: Response): void {
  const health = getHealthStatus();
  res.status(200).json(health);
}
