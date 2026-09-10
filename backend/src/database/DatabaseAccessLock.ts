/** Coordinates normal pooled work with exclusive connection maintenance. */
export class DatabaseAccessLock {
  private readers = 0;
  private writer = false;
  private queue: { exclusive: boolean; resolve: () => void }[] = [];

  async run<T>(exclusive: boolean, work: () => Promise<T>): Promise<T> {
    await new Promise<void>(resolve => {
      this.queue.push({ exclusive, resolve });
      this.drain();
    });
    try {
      return await work();
    } finally {
      if (exclusive) this.writer = false;
      else this.readers--;
      this.drain();
    }
  }

  private drain(): void {
    while (!this.writer && this.queue.length > 0) {
      const next = this.queue[0];
      if (next.exclusive && this.readers > 0) return;
      this.queue.shift();
      if (next.exclusive) this.writer = true;
      else this.readers++;
      next.resolve();
    }
  }
}
