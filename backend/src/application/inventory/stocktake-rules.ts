import { BadRequestException } from '@nestjs/common';

/**
 * 盘点容差：差异 ≤ max(2%, 下限)。
 * 下限按单位：克/毫升 50，粒/片 2。
 * 为什么按单位：50 粒的容差等于"怎么数都算对"。
 */
export function toleranceFloor(baseUnit: string): number {
  return baseUnit === 'PCS' ? 2 : 50;
}

export function isWithinTolerance(
  delta: number,
  expected: number,
  baseUnit: string,
): boolean {
  const floor = toleranceFloor(baseUnit);
  return Math.abs(delta) <= Math.max(Math.abs(expected) * 0.02, floor);
}

/** 只有草稿可以编辑；SUBMITTED 锁定，APPLIED/REJECTED 为终态。 */
export function canEdit(status: string): boolean {
  return status === 'DRAFT';
}

/** 驳回必须写原因；通过不需要。 */
export function assertRejectNote(
  approve: boolean,
  note?: string | null,
): void {
  if (!approve && !note?.trim()) {
    throw new BadRequestException('驳回必须填写原因');
  }
}
