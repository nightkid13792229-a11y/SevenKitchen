import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 站内消息（2026-10-18）
 *
 * ## 它解决的真实问题
 *
 * 微信订阅消息有一个硬限制：**顾客没点过"允许"就发不出去**，而且失败不报错。
 * 也就是说只看订阅消息的话，有一部分顾客永远收不到交付通知 —— 我们还不知道是谁。
 *
 * 站内消息是唯一"一定送得到"的渠道。所以两个都要：
 * 订阅消息负责"推一下"，站内消息负责"保证能看到"。
 *
 * ## 设计上刻意做的取舍
 *
 * **消息不存业务内容，只存一句摘要 + 一个指针。**
 * `linkType` + `linkId` 指向业务对象（交付 / 售后 / 订单 / 物流），
 * 点进去现查。
 *
 * 为什么：如果消息里存一份"食谱名 + 交付时间"的副本，
 * 重新交付之后旧消息就会跟实际不一致 —— 顾客点进去看到的是新版，
 * 消息里写的是旧版，两边打架。
 * 存指针就没有这个问题：**永远指向真实的那一份**。
 */
@Injectable()
export class CustomerMessageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 发一条站内消息。
   *
   * **失败不抛错**：消息发不出去不该让交付/售后这些主流程失败。
   * 但会打日志 —— 静默失败等于没做这件事。
   */
  async send(input: {
    customerId: string;
    category: 'DELIVERY' | 'AFTERSALE' | 'SHIPPING' | 'SYSTEM';
    title: string;
    body: string;
    linkType?: 'DELIVERY' | 'AFTERSALE' | 'ORDER' | 'SHIPPING' | null;
    linkId?: string | null;
  }): Promise<boolean> {
    try {
      await this.prisma.customerMessage.create({
        data: {
          customerId: input.customerId,
          category: input.category,
          // 截断到列宽，避免超长正文把整条消息写失败
          title: input.title.slice(0, 120),
          body: input.body.slice(0, 500),
          linkType: input.linkType ?? null,
          linkId: input.linkId ?? null,
        },
      });
      return true;
    } catch (error) {
      console.warn('[CustomerMessage] 写站内消息失败（不影响主流程）：', error);
      return false;
    }
  }

  /** 消息列表（倒序）。`category` 为空表示"全部" */
  async list(params: {
    customerId: string;
    category?: string | null;
    limit?: number;
    offset?: number;
  }) {
    const take = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
    const skip = Math.max(Number(params.offset) || 0, 0);
    const where = {
      customerId: params.customerId,
      ...(params.category ? { category: params.category } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.customerMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.customerMessage.count({ where }),
    ]);

    return {
      total,
      hasMore: skip + rows.length < total,
      items: rows.map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        body: row.body,
        linkType: row.linkType,
        linkId: row.linkId,
        // 前端只需要"读过没有"，不需要时间戳
        read: row.readAt !== null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** 未读数（底部红点 / 铃铛角标用） */
  async unreadCount(customerId: string): Promise<number> {
    return this.prisma.customerMessage.count({
      where: { customerId, readAt: null },
    });
  }

  /** 标记一条已读。**只允许标记自己的** —— 别人的 id 传进来等于什么都没发生 */
  async markRead(customerId: string, messageId: string): Promise<boolean> {
    const result = await this.prisma.customerMessage.updateMany({
      where: { id: messageId, customerId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  }

  /** 全部标记已读 */
  async markAllRead(customerId: string): Promise<number> {
    const result = await this.prisma.customerMessage.updateMany({
      where: { customerId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
