/**
 * Error thrown when a database query fails.
 * Note: raw parameter values are not stored to avoid accidental exposure of
 * sensitive data in logs or serialised error responses. Only the count of
 * parameters is retained for debugging purposes.
 */
export class DatabaseQueryError extends Error {
  public readonly query: string;
  public readonly paramCount: number;

  constructor(message: string, query: string, params?: unknown[]) {
    super(message);
    this.name = "DatabaseQueryError";
    this.query = query;
    this.paramCount = params?.length ?? 0;
  }
}

/**
 * Error thrown when a database connection fails.
 */
export class DatabaseConnectionError extends Error {
  public readonly connectionDetails: string;

  constructor(message: string, connectionDetails: string) {
    super(message);
    this.name = "DatabaseConnectionError";
    this.connectionDetails = connectionDetails;
  }
}
