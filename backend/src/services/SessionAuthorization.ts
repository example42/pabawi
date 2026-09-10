/** Revalidate idle sessions and serialize authorization with each delivery. */
export class SessionAuthorization {
  private closed = false;
  private pending = Promise.resolve();
  private queued = 0;
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly check: () => Promise<void>,
    private readonly onRevoked: () => void,
  ) {
    this.timer = setInterval(() => { this.run(() => { /* Revalidate idle connections. */ }); }, 1000);
    this.timer.unref();
  }

  run(action: () => void): void {
    if (this.closed) return;
    // A stalled authorization database must not accumulate unbounded output.
    if (this.queued >= 128) {
      this.close();
      this.onRevoked();
      return;
    }
    this.queued++;
    this.pending = this.pending.then(async () => {
      try {
        if (this.closed) return;
        await this.check();
        this.deliver(action);
      } finally {
        this.queued--;
      }
    }).catch(() => {
      if (this.closed) return;
      this.close();
      this.onRevoked();
    });
  }

  private deliver(action: () => void): void {
    if (!this.closed) action();
  }

  close(): void {
    this.closed = true;
    clearInterval(this.timer);
  }
}
