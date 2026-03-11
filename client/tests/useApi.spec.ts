import { vi } from 'vitest';

// dynamically import so that stubbed env is picked up during module evaluation
const loadModule = async () => await import('@/composables/useApi');

describe('useApi environment configuration', () => {
  it('defaults to /api when no env var is present', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const { BASE_URL } = await loadModule();
    expect(BASE_URL).toBe('/api');
  });

  it('uses VITE_API_BASE_URL when provided', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://backend.example.com');
    const { BASE_URL } = await loadModule();
    expect(BASE_URL).toBe('https://backend.example.com');
  });
});
