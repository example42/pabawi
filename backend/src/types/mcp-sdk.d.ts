declare module "@modelcontextprotocol/sdk/server/streamableHttp.js" {
  import type { Request, Response } from "express";

  export interface StreamableHTTPServerTransportOptions {
    sessionIdGenerator?: () => string;
    onsessioninitialized?: (sessionId: string) => void;
  }

  export class StreamableHTTPServerTransport {
    constructor(options?: StreamableHTTPServerTransportOptions);
    onclose?: () => void;
    handleRequest(req: Request, res: Response, body?: unknown): Promise<void>;
    close(): void;
  }
}
