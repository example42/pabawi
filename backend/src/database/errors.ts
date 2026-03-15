/**
 * Error thrown when a database query fails.
 */
export class DatabaseQueryError extends Error {
  public readonly query: string;
  public readonly params: unknown[] | undefined;

  constructor(message: string, query: string, params?: unknown[]) {
    super(message);
    this.name = "DatabaseQueryError";
    this.query = query;
    this.params = params;
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
