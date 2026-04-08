import {
  isAllowedCorsOrigin,
  resolveCorsOrigin,
} from '../../src/utils/cors.util';

describe('CORS util', () => {
  it('allows localhost-based admin origins used in local development', () => {
    expect(isAllowedCorsOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedCorsOrigin('http://localhost:5174')).toBe(true);
    expect(isAllowedCorsOrigin('http://127.0.0.1:5184')).toBe(true);
    expect(isAllowedCorsOrigin('http://1.14.3.2:5173')).toBe(true);
  });

  it('allows the production admin-web origin', () => {
    expect(isAllowedCorsOrigin('https://sevenkitchen.cloud')).toBe(true);
  });

  it('allows requests without an Origin header', () => {
    expect(isAllowedCorsOrigin(undefined)).toBe(true);
  });

  it('rejects unrelated origins', () => {
    expect(isAllowedCorsOrigin('https://evil.example.com')).toBe(false);
  });

  it('echoes allowed browser origins for credentialed CORS responses', () => {
    expect(resolveCorsOrigin('https://sevenkitchen.cloud')).toBe(
      'https://sevenkitchen.cloud',
    );
    expect(resolveCorsOrigin('http://localhost:5173')).toBe(
      'http://localhost:5173',
    );
  });

  it('returns false for disallowed browser origins', () => {
    expect(resolveCorsOrigin('https://evil.example.com')).toBe(false);
  });

  it('keeps non-browser requests allowed without forcing an origin header', () => {
    expect(resolveCorsOrigin(undefined)).toBe(true);
  });
});
