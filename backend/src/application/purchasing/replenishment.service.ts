/**
 * 补货记录服务（2026-11-10 改版）
 *
 * 与「日采清单」的区别：
 *  - 补货没有计划：下单后传截图，保存成一条记录；
 *  - 保存即完成（status = COMPLETED，供报销复用），但库存不算；
 *  - 到货是独立动作：只有确认到货才写入库存流水。
 *
 * 本文件先承载「草稿」；保存/到货在后续任务里补齐。
 */

import { Inject, Injectable } from '@nestjs/common';
import type { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import { PurchaseList } from '../../domain/purchasing/purchase-list.entity';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../domain/purchasing/enums';
import { PURCHASE_LIST_REPOSITORY } from './purchasing.service.tokens';

@Injectable()
export class ReplenishmentService {
  constructor(
    @Inject(PURCHASE_LIST_REPOSITORY)
    private readonly purchaseListRepository: PurchaseListRepository,
  ) {}

  /**
   * 开始记一笔补货：建一条无明细的草稿。
   *
   * 草稿对用户不可见（列表过滤 isDraft），识别成功后保存时转正；
   * 识别失败/放弃时可直接删除。
   */
  async createDraft(createdById: string): Promise<PurchaseList> {
    const targetDate = new Date();
    targetDate.setHours(12, 0, 0, 0);

    const draft = new PurchaseList({
      targetDate,
      kind: PurchaseListKind.STOCK_REPLENISHMENT,
      status: PurchaseListStatus.PENDING,
      totalEstimatedCost: 0,
      itemCount: 0,
      createdById,
      sourceOrderIds: [],
      isDraft: true,
    });

    return this.purchaseListRepository.save(draft);
  }
}
