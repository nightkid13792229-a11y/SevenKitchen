/**
 * 报销单审核 / 撤销审核的领域规则（2026-11-07）
 *
 * 背景：手机端把「上传付款凭证」和「审核通过」拆成两个动作，
 * 并新增「24 小时内撤销审核」。这里锁住三条不能回退的约束：
 * 1. 只有已报销的单能撤销，撤销后回到待审核；
 * 2. 撤销保留 reviewedById / reviewedAt（页面要显示「上次审核」），
 *    但 reviewComment 换成撤销原因；
 * 3. 撤销**不能**顺带把「已报销」变成员工可重新提交的状态。
 */

// uuid 是纯 ESM 包，jest 默认不转 node_modules；实体只在没传 id 时才用到它
jest.mock('uuid', () => ({
  v4: () => '00000000-0000-4000-8000-000000000000',
}));

import { Reimbursement } from '../reimbursement.entity';
import { ReimbursementStatus } from '../enums';
import { isWithinRevertWindow } from '../reimbursement-review-window';

function buildReimbursement(): Reimbursement {
  return new Reimbursement({
    claimNumber: 'BX202611070001',
    status: ReimbursementStatus.PENDING_REVIEW,
    totalActualCost: 233.83,
    totalEstimatedCost: 240,
    receiptUrls: ['https://example.com/receipt.jpg'],
    submittedById: 'user-employee',
    submittedAt: new Date('2026-11-07T11:03:00.000Z'),
  });
}

function buildReimbursed(): Reimbursement {
  const reimbursement = buildReimbursement();
  reimbursement.review('user-admin', 'APPROVE', '同意');
  reimbursement.paymentProofUrls.push('https://example.com/proof.jpg');
  return reimbursement;
}

describe('Reimbursement 审核与撤销', () => {
  it('APPROVE 之后状态是已报销，并记下审核人', () => {
    const reimbursement = buildReimbursed();

    expect(reimbursement.status).toBe(ReimbursementStatus.REIMBURSED);
    expect(reimbursement.reviewedById).toBe('user-admin');
    expect(reimbursement.reviewedAt).toBeInstanceOf(Date);
  });

  it('撤销审核把已报销退回待审核，保留上次审核人和时间', () => {
    const reimbursement = buildReimbursed();
    const reviewedAt = reimbursement.reviewedAt;

    reimbursement.revertReview('金额录错了');

    expect(reimbursement.status).toBe(ReimbursementStatus.PENDING_REVIEW);
    expect(reimbursement.reviewedById).toBe('user-admin');
    expect(reimbursement.reviewedAt).toBe(reviewedAt);
    expect(reimbursement.reviewComment).toBe('金额录错了');
  });

  it('撤销后没有原因时，备注用默认文案，不会留空', () => {
    const reimbursement = buildReimbursed();

    reimbursement.revertReview('   ');

    expect(reimbursement.reviewComment).toBe('审核已撤销');
  });

  it('待审核的单不能被撤销', () => {
    const reimbursement = buildReimbursement();

    expect(() => reimbursement.revertReview()).toThrow(
      /Only REIMBURSED reimbursements can be reverted/,
    );
  });

  it('已报销的单不能被员工「重新提交」（撤销不能走 resubmit 那条路）', () => {
    const reimbursement = buildReimbursed();

    expect(() => reimbursement.resubmit()).toThrow(
      /Only REJECTED or REQUIRES_RESUBMIT/,
    );
  });
});

describe('撤销审核的 24 小时窗口', () => {
  const now = new Date('2026-11-07T20:00:00.000Z');

  it('刚审核完可以撤销', () => {
    expect(
      isWithinRevertWindow(new Date('2026-11-07T19:30:00.000Z'), now),
    ).toBe(true);
  });

  it('正好 24 小时仍然可以撤销', () => {
    expect(
      isWithinRevertWindow(new Date('2026-11-06T20:00:00.000Z'), now),
    ).toBe(true);
  });

  it('超过 24 小时不能撤销', () => {
    expect(
      isWithinRevertWindow(new Date('2026-11-06T19:59:00.000Z'), now),
    ).toBe(false);
  });

  it('没有审核时间、时间非法、时间在未来都不能撤销', () => {
    expect(isWithinRevertWindow(null, now)).toBe(false);
    expect(isWithinRevertWindow('not-a-date', now)).toBe(false);
    expect(
      isWithinRevertWindow(new Date('2026-11-07T21:00:00.000Z'), now),
    ).toBe(false);
  });
});
