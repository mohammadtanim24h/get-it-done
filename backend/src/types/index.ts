// Shared type definitions for the API layer.
// Domain types (boards, columns, tasks) will be added in later phases.
export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    message: string;
  };
};

export type HealthStatus = {
  status: 'ok';
  uptime: number;
  timestamp: string;
  environment: string;
};
