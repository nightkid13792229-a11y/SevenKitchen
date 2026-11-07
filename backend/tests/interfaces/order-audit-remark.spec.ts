import { readFileSync } from 'fs';
import { resolve } from 'path';

const controllerSource = readFileSync(
  resolve(
    __dirname,
    '../../src/interfaces/controllers/staff-customer-service.controller.ts',
  ),
  'utf8',
);

describe('订单审计与备注分离（2026-11-07）', () => {
  it('改价与代客下单只写操作日志表', () => {
    expect(controllerSource).toContain('orderOperationLog.create');
    expect(controllerSource).toContain("action: 'PRICE_ADJUST'");
    expect(controllerSource).toContain("action: 'ASSISTED_ORDER'");
  });

  it('审计行不再拼进 adminRemark', () => {
    // 以前是 updateAdminRemark(orderId, [order.adminRemark, auditLine].join('\n'))
    expect(controllerSource).not.toMatch(
      /updateAdminRemark\(\s*orderId,\s*\[order\.adminRemark,\s*auditLine\]/,
    );
    expect(controllerSource).not.toMatch(
      /updateAdminRemark\(\s*createdOrder\.id,\s*\[createdOrder\.adminRemark,\s*auditLine\]/,
    );
  });

  it('代客下单时客服写的那句人话仍然留在备注里', () => {
    expect(controllerSource).toContain('reason: body.remark');
    expect(controllerSource).toContain('updateAdminRemark');
    expect(controllerSource).toContain('String(body.remark).trim()');
  });
});
