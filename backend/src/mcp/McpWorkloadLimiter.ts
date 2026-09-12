// Capacity belongs to provider work, including work whose HTTP client disconnected.
export class McpWorkloadLimiter {
  private readonly accounts = new Map<string, number>();
  private total = 0;

  acquire(account: string): (() => void) | undefined {
    const active = this.accounts.get(account) ?? 0;
    if (active >= 4 || this.total >= 20) return undefined;
    this.accounts.set(account, active + 1);
    this.total++;
    let released = false;
    return (): void => {
      if (released) return;
      released = true;
      this.total--;
      const remaining = (this.accounts.get(account) ?? 1) - 1;
      if (remaining) this.accounts.set(account, remaining); else this.accounts.delete(account);
    };
  }
}

export const mcpWorkloadLimiter = new McpWorkloadLimiter();
