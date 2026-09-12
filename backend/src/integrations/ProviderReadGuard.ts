export class ProviderReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderReadError';
  }
}

/** A timeout bounds the caller's wait; capacity stays occupied until the provider settles. */
export class ProviderReadGuard {
  private readonly active = new Map<string, number>();

  constructor(private readonly limit = 20) {}

  async run<T>(source: string, timeoutMs: number, read: () => Promise<T>): Promise<T> {
    const count = this.active.get(source) ?? 0;
    if (count >= this.limit) {
      throw new ProviderReadError(`Source '${source}' has too many outstanding reads`);
    }
    this.active.set(source, count + 1);
    const work = Promise.resolve().then(read).finally(() => {
      const remaining = (this.active.get(source) ?? 1) - 1;
      if (remaining === 0) this.active.delete(source);
      else this.active.set(source, remaining);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new ProviderReadError(`Source '${source}' timed out after ${String(timeoutMs)}ms`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
}
