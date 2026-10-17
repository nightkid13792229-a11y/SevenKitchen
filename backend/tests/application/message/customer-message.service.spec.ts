import { CustomerMessageService } from '../../../src/application/message/customer-message.service';

/**
 * 站内消息服务 · 守卫
 *
 * 这一块最容易出三类问题，都在这里钉死：
 *   ① **越权**：只能看/改自己的消息
 *   ② **写消息失败拖垮主流程**：交付、售后不该因为消息发不出去而失败
 *   ③ **消息里存业务副本**：重新交付之后旧消息会与实际不一致
 */
describe('CustomerMessageService', () => {
  function makeService(overrides: any = {}) {
    const prisma: any = {
      customerMessage: {
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      ...overrides,
    };
    return { service: new CustomerMessageService(prisma), prisma };
  }

  it('★ 写消息失败不抛错（消息发不出去不该让交付失败）', async () => {
    const { service } = makeService({
      customerMessage: {
        create: jest.fn().mockRejectedValue(new Error('db down')),
      },
    });
    await expect(
      service.send({
        customerId: 'c1',
        category: 'DELIVERY',
        title: 't',
        body: 'b',
      }),
    ).resolves.toBe(false);
  });

  it('★ 超长正文被截断，不会把整条消息写失败', async () => {
    const { service, prisma } = makeService();
    await service.send({
      customerId: 'c1',
      category: 'SYSTEM',
      title: 'x'.repeat(200),
      body: 'y'.repeat(900),
    });
    const arg = prisma.customerMessage.create.mock.calls[0][0];
    expect(arg.data.title.length).toBe(120);
    expect(arg.data.body.length).toBe(500);
  });

  it('★ 标记已读时把 customerId 一起作为条件（防越权）', async () => {
    const { service, prisma } = makeService();
    await service.markRead('c1', 'm-other');
    const arg = prisma.customerMessage.updateMany.mock.calls[0][0];
    // 只传 id 会让任何人能标记任何人的消息
    expect(arg.where.customerId).toBe('c1');
    expect(arg.where.id).toBe('m-other');
  });

  it('列表按时间倒序，且 limit 被夹在 1~50', async () => {
    const { service, prisma } = makeService();
    await service.list({ customerId: 'c1', limit: 9999 });
    const arg = prisma.customerMessage.findMany.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.take).toBe(50);

    const { service: s2, prisma: p2 } = makeService();
    await s2.list({ customerId: 'c1', limit: 0 });
    expect(p2.customerMessage.findMany.mock.calls[0][0].take).toBe(20);
  });

  it('列表对外只给"读过没有"，不给 readAt 时间戳', async () => {
    const { service } = makeService({
      customerMessage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'm1',
            category: 'DELIVERY',
            title: 't',
            body: 'b',
            linkType: 'DELIVERY',
            linkId: 'd1',
            readAt: new Date('2026-10-18T00:00:00Z'),
            createdAt: new Date('2026-10-18T00:00:00Z'),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    });
    const data = await service.list({ customerId: 'c1' });
    expect(data.items[0].read).toBe(true);
    expect(data.items[0]).not.toHaveProperty('readAt');
  });

  it('分类为空时查全部（不加 category 条件）', async () => {
    const { service, prisma } = makeService();
    await service.list({ customerId: 'c1', category: null });
    expect(prisma.customerMessage.findMany.mock.calls[0][0].where).toEqual({
      customerId: 'c1',
    });
  });
});
