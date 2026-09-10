import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import SetupPage from './SetupPage.svelte';
import { fetchWithRetry } from '../lib/api';

vi.mock('../lib/api', () => ({ fetchWithRetry: vi.fn() }));
vi.mock('../lib/toast.svelte', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

describe('setup ownership credential', () => {
  it('submits the token only in its header, disables automatic retries and clears it after success', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithRetry).mockResolvedValue({});
    const { container } = render(SetupPage);
    const fields = { 'bootstrap-token': 'installation-fixture-token', username: 'owner', email: 'owner@example.test',
      firstName: 'Install', lastName: 'Owner', password: 'OwnerPass123!', confirmPassword: 'OwnerPass123!' };
    for (const [id, value] of Object.entries(fields)) {
      const input = container.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      await fireEvent.input(input);
    }
    await fireEvent.submit(container.querySelector('form')!);
    expect(fetchWithRetry).toHaveBeenCalledOnce();
    const [url, options, retry] = vi.mocked(fetchWithRetry).mock.calls[0];
    expect(url).toBe('/api/setup/initialize');
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json', 'X-Pabawi-Bootstrap-Token': fields['bootstrap-token'] });
    expect(options?.body).not.toContain(fields['bootstrap-token']);
    expect(retry).toEqual({ maxRetries: 0 });
    expect((screen.getByLabelText('Installation bootstrap token') as HTMLInputElement).value).toBe('');
    vi.clearAllTimers();
  });
});
