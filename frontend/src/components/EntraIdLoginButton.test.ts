import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import EntraIdLoginButton from './EntraIdLoginButton.svelte';

describe('EntraIdLoginButton', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: '' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('renders with Microsoft logo SVG', () => {
    render(EntraIdLoginButton);

    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    // Microsoft logo has 4 colored rectangles
    const rects = svg?.querySelectorAll('rect');
    expect(rects?.length).toBe(4);
  });

  it('renders default "Sign in with Microsoft" text', () => {
    render(EntraIdLoginButton);

    expect(screen.getByText('Sign in with Microsoft')).toBeTruthy();
  });

  it('renders custom provider name when passed', () => {
    render(EntraIdLoginButton, { props: { providerName: 'Contoso' } });

    expect(screen.getByText('Sign in with Contoso')).toBeTruthy();
  });

  it('has correct aria-label with default provider name', () => {
    render(EntraIdLoginButton);

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toBe('Sign in with Microsoft');
  });

  it('has correct aria-label with custom provider name', () => {
    render(EntraIdLoginButton, { props: { providerName: 'Contoso' } });

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toBe('Sign in with Contoso');
  });

  it('redirects to /api/auth/entra-id/login on click', async () => {
    render(EntraIdLoginButton);

    const button = screen.getByRole('button');
    await fireEvent.click(button);

    expect(window.location.href).toBe('/api/auth/entra-id/login');
  });
});
