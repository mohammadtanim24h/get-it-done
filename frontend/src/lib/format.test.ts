import { describe, expect, it } from 'vitest';
import { formatDate } from './format';

describe('formatDate', () => {
  it('formats ISO timestamps as short dates', () => {
    expect(formatDate('2026-09-04T12:00:00.000Z')).toEqual('Sep 4, 2026');
  });
});
