import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import CreateRoleDialog from './CreateRoleDialog.svelte';
import * as api from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  post: vi.fn(),
}));

// Mock toast notifications
vi.mock('../lib/toast.svelte', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

describe('CreateRoleDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock HTMLDialogElement methods — also set the `open` attribute so
    // testing-library treats the dialog content as visible.
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders form fields when isOpen is true', () => {
    render(CreateRoleDialog, {
      props: {
        isOpen: true,
        onClose: mockOnClose,
        onCreated: mockOnCreated,
      },
    });

    expect(screen.getByLabelText(/role name/i)).toBeTruthy();
    expect(screen.getByLabelText(/description/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^create role$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('submits valid data and calls onCreated on success', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'new-role-id', name: 'Test Role' });

    render(CreateRoleDialog, {
      props: {
        isOpen: true,
        onClose: mockOnClose,
        onCreated: mockOnCreated,
      },
    });

    const nameInput = screen.getByLabelText(/role name/i);
    const descInput = screen.getByLabelText(/description/i);

    await fireEvent.input(nameInput, { target: { value: 'Test Role' } });
    await fireEvent.input(descInput, { target: { value: 'A test role description' } });

    const submitButton = screen.getByRole('button', { name: /^create role$/i });
    await fireEvent.click(submitButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/api/roles', {
        name: 'Test Role',
        description: 'A test role description',
      });
      expect(mockOnCreated).toHaveBeenCalled();
    });
  });

  it('shows duplicate name error on 409 response', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('409 Conflict'));

    render(CreateRoleDialog, {
      props: {
        isOpen: true,
        onClose: mockOnClose,
        onCreated: mockOnCreated,
      },
    });

    const nameInput = screen.getByLabelText(/role name/i);
    await fireEvent.input(nameInput, { target: { value: 'Existing Role' } });

    const submitButton = screen.getByRole('button', { name: /^create role$/i });
    await fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/a role with this name already exists/i)).toBeTruthy();
    });
  });

  it('shows error message on 500 response and dialog stays open', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('Internal Server Error'));

    render(CreateRoleDialog, {
      props: {
        isOpen: true,
        onClose: mockOnClose,
        onCreated: mockOnCreated,
      },
    });

    const nameInput = screen.getByLabelText(/role name/i);
    await fireEvent.input(nameInput, { target: { value: 'New Role' } });

    const submitButton = screen.getByRole('button', { name: /^create role$/i });
    await fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeTruthy();
    });

    // Dialog should still be open (form fields still visible)
    expect(screen.getByLabelText(/role name/i)).toBeTruthy();
    expect(mockOnCreated).not.toHaveBeenCalled();
  });

  it('disables submit button when name is too short', async () => {
    render(CreateRoleDialog, {
      props: {
        isOpen: true,
        onClose: mockOnClose,
        onCreated: mockOnCreated,
      },
    });

    const nameInput = screen.getByLabelText(/role name/i);
    await fireEvent.input(nameInput, { target: { value: 'ab' } });

    const submitButton = screen.getByRole('button', { name: /^create role$/i });
    expect(submitButton).toHaveProperty('disabled', true);
  });
});
