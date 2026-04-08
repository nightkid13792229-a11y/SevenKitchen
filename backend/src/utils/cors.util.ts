const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);
const EXPLICIT_ALLOWED_ORIGINS = new Set([
  'http://1.14.3.2:5173',
  'http://localhost:3000',
]);

export function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) {
    return true;
  }

  if (EXPLICIT_ALLOWED_ORIGINS.has(origin)) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    return (
      parsedOrigin.protocol === 'http:' &&
      LOOPBACK_HOSTS.has(parsedOrigin.hostname) &&
      parsedOrigin.port.length > 0
    );
  } catch {
    return false;
  }
}
