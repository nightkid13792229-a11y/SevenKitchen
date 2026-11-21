import type { ExceptionRecord } from '../../application/ingredient-creation/ingredient-creation.types';

/**
 * 人登记例外的服务端收口。
 *
 * 浏览器会带 `approvedBy` / `approvedAt`，但那只能是提示：审批人与时间必须由
 * 服务端按当前登录人/当前时间盖章，否则审计记录可以被随便写。理由为空一律
 * 拒绝——没有理由的例外和直接放行没有区别。
 */
/**
 * 读已有例外里「可以沿用」的审批留痕：同 code + 同理由才算同一条登记。
 *
 * 页面每次登记都会把**整份**例外数组发回来；如果每次都盖章，后一个人登记
 * 第二条时，第一条的审批人/时间会被悄悄改写成他，审计就答不出「当初是谁批的」。
 */
function readPreservedApprovals(
  existing: unknown,
): Map<string, { reason: string; approvedBy: string; approvedAt: string }> {
  const preserved = new Map<
    string,
    { reason: string; approvedBy: string; approvedAt: string }
  >();
  if (!Array.isArray(existing)) {
    return preserved;
  }
  for (const raw of existing) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      continue;
    }
    const record = raw as {
      code?: unknown;
      reason?: unknown;
      approvedBy?: unknown;
      approvedAt?: unknown;
    };
    const code = typeof record.code === 'string' ? record.code.trim() : '';
    const reason =
      typeof record.reason === 'string' ? record.reason.trim() : '';
    const by =
      typeof record.approvedBy === 'string' ? record.approvedBy.trim() : '';
    const at =
      typeof record.approvedAt === 'string' ? record.approvedAt.trim() : '';
    if (!code || !reason || !by || !at) {
      continue;
    }
    preserved.set(code, { reason, approvedBy: by, approvedAt: at });
  }
  return preserved;
}

export function sanitizeVerifyExceptions(
  value: unknown,
  approvedBy: string,
  approvedAt: string,
  /** 当前草稿里已登记的例外：同 code 同理由的沿用原审批留痕。 */
  existing?: unknown,
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

  const preserved = readPreservedApprovals(existing);
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

    const kept = preserved.get(code);
    exceptions.push({
      code,
      reason,
      // 同一条（code + 理由都没变）沿用原来的审批留痕；改理由视为重新登记。
      approvedBy: kept && kept.reason === reason ? kept.approvedBy : approvedBy,
      approvedAt: kept && kept.reason === reason ? kept.approvedAt : approvedAt,
    });
  }

  return { ok: true, exceptions };
}
