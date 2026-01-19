import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import IntegrationBadge from './IntegrationBadge.svelte';
import { integrationColors } from '../lib/integrationColors.svelte';

// Mock the integrationColors store
vi.mock('../lib/integrationColors.svelte', () => {
  const mockColors = {
    bolt: {
      primary: '#FFAE1A',
      light: '#FFF4E0',
      dark: '#CC8B15',
    },
    puppetdb: {
      primary: '#9063CD',
      light: '#F0E6FF',
      dark: '#7249A8',
    },
    puppetserver: {
      primary: '#2E3A87',
      light: '#E8EAFF',
      dark: '#1F2760',
    },
    hiera: {
      primary: '#C1272D',
      light: '#FFE8E9',
      dark: '#9A1F24',
    },
  };

  return {
    integrationColors: {
      loadColors: vi.fn(),
      getColor: vi.fn((integration: string) => {
        const normalizedIntegration = integration.toLowerCase();
        if (normalizedIntegration in mockColors) {
          return mockColors[normalizedIntegration as keyof typeof mockColors];
        }
        return {
          primary: '#6B7280',
          light: '#F3F4F6',
          dark: '#4B5563',
        };
      }),
    },
  };
});

describe('IntegrationBadge Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Variant: dot', () => {
    it('should render dot variant correctly', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'dot',
        },
      });

      const dot = screen.getByLabelText('Bolt indicator');
      expect(dot).toBeTruthy();
      expect(dot.classList.contains('rounded-full')).toBe(true);
    });

    it('should apply correct color to dot variant', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'puppetdb',
          variant: 'dot',
        },
      });

      const dot = screen.getByLabelText('PuppetDB indicator');
      expect(dot.style.backgroundColor).toBe('rgb(144, 99, 205)'); // #9063CD
    });

    it('should render dot with small size', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'dot',
          size: 'sm',
        },
      });

      const dot = screen.getByLabelText('Bolt indicator');
      expect(dot.classList.contains('w-2')).toBe(true);
      expect(dot.classList.contains('h-2')).toBe(true);
    });

    it('should render dot with medium size', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'dot',
          size: 'md',
        },
      });

      const dot = screen.getByLabelText('Bolt indicator');
      expect(dot.classList.contains('w-2.5')).toBe(true);
      expect(dot.classList.contains('h-2.5')).toBe(true);
    });

    it('should render dot with large size', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'dot',
          size: 'lg',
        },
      });

      const dot = screen.getByLabelText('Bolt indicator');
      expect(dot.classList.contains('w-3')).toBe(true);
      expect(dot.classList.contains('h-3')).toBe(true);
    });
  });

  describe('Variant: label', () => {
    it('should render label variant correctly', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'puppetserver',
          variant: 'label',
        },
      });

      const label = screen.getByText('Puppetserver');
      expect(label).toBeTruthy();
      expect(label.classList.contains('font-medium')).toBe(true);
    });

    it('should apply correct colors to label variant', () => {
      const { container } = render(IntegrationBadge, {
        props: {
          integration: 'hiera',
          variant: 'label',
        },
      });

      const labelContainer = container.querySelector('.inline-flex.items-center.gap-1\\.5');
      expect(labelContainer).toBeTruthy();
      expect(labelContainer?.getAttribute('style')).toContain('rgb(154, 31, 36)'); // dark color
    });

    it('should render label with small size', () => {
      const { container } = render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'label',
          size: 'sm',
        },
      });

      const labelContainer = container.querySelector('.text-xs');
      expect(labelContainer).toBeTruthy();
    });

    it('should render label with medium size', () => {
      const { container } = render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'label',
          size: 'md',
        },
      });

      const labelContainer = container.querySelector('.text-sm');
      expect(labelContainer).toBeTruthy();
    });

    it('should render label with large size', () => {
      const { container } = render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'label',
          size: 'lg',
        },
      });

      const labelContainer = container.querySelector('.text-base');
      expect(labelContainer).toBeTruthy();
    });

    it('should include colored dot in label variant', () => {
      const { container } = render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'label',
        },
      });

      const dot = container.querySelector('.rounded-full');
      expect(dot).toBeTruthy();
      expect(dot?.getAttribute('style')).toContain('rgb(255, 174, 26)'); // #FFAE1A
    });
  });

  describe('Variant: badge', () => {
    it('should render badge variant correctly', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'badge',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge).toBeTruthy();
      expect(badge.textContent).toBe('Bolt');
      expect(badge.classList.contains('rounded-full')).toBe(true);
      expect(badge.classList.contains('font-medium')).toBe(true);
    });

    it('should apply correct colors to badge variant', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'puppetdb',
          variant: 'badge',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.style.backgroundColor).toBe('rgb(240, 230, 255)'); // light color
      expect(badge.style.color).toBe('rgb(114, 73, 168)'); // dark color
    });

    it('should render badge with small size', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'badge',
          size: 'sm',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.classList.contains('px-2')).toBe(true);
      expect(badge.classList.contains('py-0.5')).toBe(true);
      expect(badge.classList.contains('text-xs')).toBe(true);
    });

    it('should render badge with medium size', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'badge',
          size: 'md',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.classList.contains('px-2.5')).toBe(true);
      expect(badge.classList.contains('py-1')).toBe(true);
      expect(badge.classList.contains('text-sm')).toBe(true);
    });

    it('should render badge with large size', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'badge',
          size: 'lg',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.classList.contains('px-3')).toBe(true);
      expect(badge.classList.contains('py-1.5')).toBe(true);
      expect(badge.classList.contains('text-base')).toBe(true);
    });
  });

  describe('Integration types', () => {
    it('should render correct label for bolt integration', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'badge',
        },
      });

      expect(screen.getByText('Bolt')).toBeTruthy();
    });

    it('should render correct label for puppetdb integration', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'puppetdb',
          variant: 'badge',
        },
      });

      expect(screen.getByText('PuppetDB')).toBeTruthy();
    });

    it('should render correct label for puppetserver integration', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'puppetserver',
          variant: 'badge',
        },
      });

      expect(screen.getByText('Puppetserver')).toBeTruthy();
    });

    it('should render correct label for hiera integration', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'hiera',
          variant: 'badge',
        },
      });

      expect(screen.getByText('Hiera')).toBeTruthy();
    });
  });

  describe('Color application', () => {
    it('should apply bolt colors correctly', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
          variant: 'badge',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.style.backgroundColor).toBe('rgb(255, 244, 224)'); // #FFF4E0
      expect(badge.style.color).toBe('rgb(204, 139, 21)'); // #CC8B15
    });

    it('should apply puppetdb colors correctly', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'puppetdb',
          variant: 'badge',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.style.backgroundColor).toBe('rgb(240, 230, 255)'); // #F0E6FF
      expect(badge.style.color).toBe('rgb(114, 73, 168)'); // #7249A8
    });

    it('should apply puppetserver colors correctly', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'puppetserver',
          variant: 'badge',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.style.backgroundColor).toBe('rgb(232, 234, 255)'); // #E8EAFF
      expect(badge.style.color).toBe('rgb(31, 39, 96)'); // #1F2760
    });

    it('should apply hiera colors correctly', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'hiera',
          variant: 'badge',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.style.backgroundColor).toBe('rgb(255, 232, 233)'); // #FFE8E9
      expect(badge.style.color).toBe('rgb(154, 31, 36)'); // #9A1F24
    });
  });

  describe('Default props', () => {
    it('should use badge variant by default', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge).toBeTruthy();
    });

    it('should use medium size by default', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
        },
      });

      const badge = screen.getByRole('status');
      expect(badge.classList.contains('px-2.5')).toBe(true);
      expect(badge.classList.contains('py-1')).toBe(true);
      expect(badge.classList.contains('text-sm')).toBe(true);
    });
  });

  describe('Integration with color store', () => {
    it('should call loadColors on mount', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'bolt',
        },
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(integrationColors.loadColors).toHaveBeenCalled();
    });

    it('should call getColor with correct integration', () => {
      render(IntegrationBadge, {
        props: {
          integration: 'puppetdb',
        },
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(integrationColors.getColor).toHaveBeenCalledWith('puppetdb');
    });
  });
});
