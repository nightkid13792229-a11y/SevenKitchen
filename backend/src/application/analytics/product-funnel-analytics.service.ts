import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export interface TrackFunnelEventInput {
  /** 允许为空：登录前的浏览与点击同样要能采集 */
  customerId?: string | null;
  sessionId?: string | null;
  eventName: string;
  step?: string | null;
  recipeId?: string | null;
  dogId?: string | null;
  orderId?: string | null;
  entrySource?: string | null;
  properties?: Record<string, any> | null;
}

/**
 * 成品鲜食链路漏斗事件采集。
 *
 * 设计取舍：**写入失败绝不能影响用户主流程**。
 * 埋点属于旁路能力，任何异常都在这里被吞掉并记日志，不向上抛。
 */
@Injectable()
export class ProductFunnelAnalyticsService {
  private readonly logger = new Logger(ProductFunnelAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async track(input: TrackFunnelEventInput): Promise<void> {
    try {
      await this.prisma.productFunnelEvent.create({
        data: {
          customerId: input.customerId || null,
          sessionId: input.sessionId || null,
          eventName: input.eventName,
          step: input.step || null,
          recipeId: input.recipeId || null,
          dogId: input.dogId || null,
          orderId: input.orderId || null,
          entrySource: input.entrySource || null,
          properties: input.properties ?? undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to persist funnel event ${input.eventName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
