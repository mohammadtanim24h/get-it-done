import { describe, expect, it } from 'vitest';
import { API_BASE_URL, API_PREFIX, apiUrl } from './config';

describe('api config', () => {
  it('builds URLs from the base URL and API prefix', () => {
    expect(apiUrl('/boards')).toBe(`${API_BASE_URL}${API_PREFIX}/boards`);
    expect(apiUrl('/boards')).toBe('http://localhost:4000/api/boards');
  });
});
