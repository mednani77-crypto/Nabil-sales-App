import { describe, expect, it } from 'vitest';
import { waNumber } from './files';

describe('WhatsApp number', () => {
  it('turns Ethiopian numbers into international form', () => {
    expect(waNumber('0915 234 567')).toBe('251915234567');
    expect(waNumber('+251 915-234-567')).toBe('251915234567');
    expect(waNumber('915234567')).toBe('251915234567');
    expect(waNumber('0711 234 567')).toBe('251711234567');
  });
  it('rejects anything else', () => {
    expect(waNumber('')).toBeNull();
    expect(waNumber(undefined)).toBeNull();
    expect(waNumber('025 111 2233')).toBeNull();
    expect(waNumber('12345')).toBeNull();
  });
});
