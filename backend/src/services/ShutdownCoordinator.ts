import type { RequestHandler } from 'express';
import type { LoggerService } from './LoggerService';

export class ShutdownCoordinator {
  private stopping = false;
  private completion?: Promise<number>;

  constructor(
    private readonly stopAdmission: () => void,
    private readonly drain: () => Promise<void>,
    private readonly close: () => Promise<void>,
    private readonly logger: LoggerService,
    private readonly deadlineMs = 25_000,
  ) {}

  readonly middleware: RequestHandler = (_req, res, next) => {
    if (this.stopping) {
      res.setHeader('Connection', 'close');
      res.status(503).json({ error: { code: 'SERVER_STOPPING', message: 'Server is shutting down' } });
      return;
    }
    next();
  };

  shutdown(): Promise<number> {
    if (this.completion) return this.completion;
    this.stopping = true;
    this.completion = this.finish();
    return this.completion;
  }

  private async finish(): Promise<number> {
    const state = { expired: false };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<number>((resolve) => {
      timer = setTimeout(() => {
        state.expired = true;
        this.logger.error('Shutdown deadline exceeded; restart will reconcile unfinished executions', {
          component: 'ShutdownCoordinator', operation: 'shutdown',
        });
        resolve(1);
      }, this.deadlineMs);
    });
    const work = (async (): Promise<number> => {
      this.stopAdmission();
      await this.drain();
      if (state.expired) return 1;
      await this.close();
      return 0;
    })().catch((error: unknown) => {
      this.logger.error('Shutdown failed; restart will reconcile unfinished executions', {
        component: 'ShutdownCoordinator', operation: 'shutdown',
      }, error instanceof Error ? error : new Error(String(error)));
      return 1;
    });
    try {
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
}
