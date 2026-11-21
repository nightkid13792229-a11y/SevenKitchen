import type { ExceptionRecord } from '../../application/ingredient-creation/ingredient-creation.types';

/**
 * 人登记例外的服务端收口。
 *
 * 浏览器会带 `approvedBy` / `approvedAt`，但那只能是提示：审批人与时间必须由
 * 服务端按当前登录人/当前时间盖章，否则审计记录可以被随便写。理由为空一律
 * 拒绝——没有理由的例外和直接放行没有区别。
 */
export function sanitizeVerifyExceptions(
  value: unknown,
  approvedBy: string,
  approvedAt: string,
): { ok: true; exceptions: ExceptionRecord[] } | { ok: false; error: string } {
  if (value === undefined || value === null) {
    return { ok: true, exceptions: [] };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'verify 必须是对象，且 exceptions 必须是数组' };
  }

  const rawExceptions = (value as { exceptions?: unknown }).exceptions;
  if (rawExceptions === undefined) {
    return { ok: true, exceptions: [] };
  }
  if (!Array.isArray(rawExceptions)) {
    return { ok: false, error: 'verify.exceptions 必须是数组' };
  }

  const exceptions: ExceptionRecord[] = [];
  for (const raw of rawExceptions) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: '每条例外必须是对象' };
    }

    const record = raw as {
      code?: unknown;
      reason?: unknown;
    };
    const code =
      typeof record.code === 'string' ? record.code.trim() : '';
    const reason =
      typeof record.reason === 'string' ? record.reason.trim() : '';

    if (!code) {
      return { ok: false, error: '例外必须写明 code' };
    }
    if (!reason) {
      return { ok: false, error: `例外 ${code} 必须写理由` };
    }

    exceptions.push({ code, reason, approvedBy, approvedAt });
  }

  return { ok: true, exceptions };
}
