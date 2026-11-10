/**
 * 订单截图 → 采购记录（2026-11-04 采购-报销 AI 接入）。
 *
 * 流程：上传图片 URL/Key → 验签下载 → 切段 → 视觉模型出 JSON → 解析自检
 *      → 按清单匹配 → 落「识别草稿」→ 员工核对/修改 → 确认后一次性生成采购记录。
 *
 * 三条硬约束（与设计文档一致）：
 *   1. 识别只出草稿，绝不自动生成采购记录；
 *   2. 金额自检不过、截图不完整时，确认接口直接拒绝；
 *   3. 读不到就给 null，不猜；匹配不上就交给员工，不做跨原料替代。
 *
 * 评审后加固（2026-11-04）：
 *   · 私有截图一律用 COS key 签名后再下载，且限制只能取本桶/CDN 的地址（防 SSRF）；
 *   · 多张图先全部识别完再一次性落库，中途失败不留半截草稿；
 *   · 确认时按 DRAFT → CONFIRMED 抢占，防止并发重复生成；
 *   · 换算比例以原料为准（与手工录入同一口径），不信任 SKU 上的可空比例。
 */

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import {
  AgentProviderConfigService,
  PURCHASE_REIMBURSEMENT_AGENT_PURPOSE,
} from '../nutrition-governance/agent-provider-config.service';
import type { DeepSeekChatOptions } from '../recipe-designer/deepseek-chat';
import { parseOrderDraft } from './purchase-order-parse';
import {
  extractSpecTokens,
  matchOrderLines,
  normalizeText,
} from './purchase-order-match';
import {
  canonicalChannelCode,
  channelMatchKey,
  toChannelOptions,
  type ChannelOption,
} from './channel-catalog';
import { PlatformOptionsService } from '../platform-options/platform-options.service';
import { PURCHASE_CHANNEL_SET } from '../platform-options/option-sets.registry';
import type {
  ListItemCandidate,
  ListSkuCandidate,
  MatchedOrderLine,
  ParsedOrderDraft,
} from './purchase-order-import.types';

/** 与商品截图识别共用「采购报销 Agent」配置；未单独配置时回退全局默认 */
export const PURCHASE_ORDER_IMPORT_PURPOSE =
  PURCHASE_REIMBURSEMENT_AGENT_PURPOSE;

/** 视觉模型调用口子（测试里替换掉，避免真打网络） */
export const PURCHASE_ORDER_IMPORT_MODEL = Symbol(
  'PURCHASE_ORDER_IMPORT_MODEL',
);

export interface PurchaseOrderImportModelPort {
  callDeepSeekJson(
    options: DeepSeekChatOptions,
  ): Promise<Record<string, unknown>>;
}

export const PURCHASE_ORDER_IMPORT_PROMPT_VERSION = '2026-11-05.2';

/** 一张图最多切 6 段；再长就让员工截短一点 */
const MAX_CHUNKS = 6;
const CHUNK_HEIGHT = 2100;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 20000;
const MODEL_TIMEOUT_MS = 90000;
const MODEL_TIMEOUT_FLOOR_MS = 45000;
/** 单笔订单的运费 / 包装费上限（元）；超过基本是填错了，直接拦下来 */
const MAX_FEE_AMOUNT = 5000;
/** 每人每天最多识别几次（一次 = 一笔订单） */
const DAILY_IMPORT_LIMIT_PER_USER = 30;
/** 全系统每月上限 */
const MONTHLY_IMPORT_LIMIT_SYSTEM = 3000;

const WEIGHT_OR_VOLUME_UNITS = new Set([
  'kg',
  'g',
  '克',
  '千克',
  '公斤',
  '斤',
  '两',
  'ml',
  '毫升',
  'l',
  '升',
]);

/** 按重量买：单位 → 基准单位（克）换算。只用于「没有采购商品」的重量行。 */
const WEIGHT_UNIT_TO_BASE_RATIO: Record<string, number> = {
  斤: 500,
  两: 50,
  克: 1,
  g: 1,
  公斤: 1000,
  千克: 1000,
  kg: 1000,
};

interface RecognizedOrder {
  url: string;
  imageKey: string | null;
  imageHash: string;
  draft: ParsedOrderDraft;
  matched: MatchedOrderLine[];
  raw: Record<string, unknown>;
  model: string;
}

@Injectable()
export class PurchaseOrderImportService {
  private readonly logger = new Logger(PurchaseOrderImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentConfig: AgentProviderConfigService,
    private readonly cosService: TencentCosService,
    private readonly platformOptions: PlatformOptionsService,
    @Inject(PURCHASE_ORDER_IMPORT_MODEL)
    private readonly model: PurchaseOrderImportModelPort,
  ) {}

  /**
   * 采购渠道的唯一来源：平台选项字典 `purchase_channel`。
   *
   * 2026-11-05 起 AI 的候选清单、员工端的选择项、匹配时的渠道归一
   * 都从这里读 —— 新增一个渠道只改后台字典，不再改代码或提示词。
   */
  private async loadChannelOptions(): Promise<ChannelOption[]> {
    const items = await this.platformOptions.listSet(PURCHASE_CHANNEL_SET);
    return toChannelOptions(items);
  }

  /** 把渠道清单写进提示词：模型只能从这些里选，认不出就 null */
  private buildSystemPrompt(channels: ChannelOption[]): string {
    const list = channels.map((item) => item.code).join('、');
    return `你是采购助理。用户会给你同一笔商超/网店订单的长截图，按从上到下的顺序切成 N 段。
请读完整笔订单，输出一个 JSON 对象。

输出字段：
{
  "channel": "从下面的渠道清单里选一个；如果截图上看不出、或者明显不在清单里，给 null",
  "orderNo": "字符串或null",
  "orderTime": "YYYY-MM-DD HH:mm 或null",
  "items": [{"name":"商品名原文","spec":"规格原文或null","qty":数字或null,"unit":"盒/袋/份/瓶或null","unitPrice":数字或null,"lineTotal":数字或null}],
  "subtotal": 数字或null,
  "shippingFee": 数字或null,
  "packagingFee": 数字或null,
  "discount": 数字或null,
  "paid": 数字或null,
  "weightAdjustment": {"exists": true或false, "amount": 数字或null},
  "incomplete": true或false,
  "note": "简短说明"
}

渠道清单（channel 只能填这里的原文，或者 null）：
${list}

规则：
1. 商品金额（盒马叫商品小计、山姆叫商品总金额、沃尔玛叫商品金额）是截图上的合计，照抄。可以自己把各行金额加一遍做参考，但对不上不代表漏读。
2. 合计数经常天然对不上：满减/优惠/优惠券、会员价或特价（商品行显示实付价、商品小计按原价）、环保包装费、运费、称重补差退款都会造成差额。这些都不算漏读，不要因此把 incomplete 置为 true。
3. 只有当确实看到商品行被折叠（出现「展开」「查看更多」，或标注的总件数明显多于读到的行数）时，才把 incomplete 置为 true，并在 note 里写清楚看到了什么。
4. 件数校验要看数量之和，不是行数之和。
5. 图上出现"¥29.00 ×2"这类写法时，29.00 是单价，行小计 = 单价 × 数量。
6. 金额一律输出数字（元），不要带 ¥ 符号、不要千分位。
7. 读不到的字段一律给 null，绝不编造。不要输出姓名、电话、地址。
8. 图上的「称重退差价」只是标签，不代表真的发生退款；只有出现「补差退款 X 元」这种带金额的文字，才把 weightAdjustment.exists 置为 true。
9. 渠道只凭截图上的店名/App 界面判断。认不出就给 null，绝对不要写「其他」「未知」或自己编一个店名 —— 员工会自己确认。`;
  }

  /**
   * 识别一批截图：每张图 = 一笔订单。
   * 先全部识别成功，再一次性落库；中途失败不会留下半截草稿。
   */
  async importFromScreenshots(input: {
    purchaseListId: string;
    userId: string;
    imageUrls: string[];
    imageKeys?: string[];
  }): Promise<any[]> {
    const imageUrls = (input.imageUrls || [])
      .map((url) => url?.trim())
      .filter(Boolean);
    if (imageUrls.length === 0) {
      throw new BadRequestException('请至少上传一张订单截图');
    }
    if (imageUrls.length > 5) {
      throw new BadRequestException('一次最多识别 5 笔订单');
    }

    await this.assertListImportable(input.purchaseListId);
    await this.assertQuota(input.userId, imageUrls.length);

    const candidates = await this.buildCandidates(input.purchaseListId);
    const channels = await this.loadChannelOptions();
    const recognized: RecognizedOrder[] = [];

    /**
     * 上次手动匹配学到的映射按渠道存。
     *
     * 历史行的 channelFamily 是旧口径（「盒马」「山姆」），读之前先按字典
     * 归一，否则这次统一会让「沿用上次匹配」全部失效。
     */
    const aliasCache = new Map<
      string,
      Array<{
        normalizedName: string;
        channelFamily: string;
        ingredientId: string;
        procurementSkuId: string | null;
      }>
    >();
    const getAliasesForChannel = async (channel: string | null) => {
      const normalized = channel ? channelMatchKey(channel, channels) : '';
      const cacheKey = normalized || '__none__';
      if (!aliasCache.has(cacheKey)) {
        const rows = await this.prisma.purchaseOrderMatchAlias.findMany({
          select: {
            normalizedName: true,
            channelFamily: true,
            ingredientId: true,
            procurementSkuId: true,
          },
        });
        const applicable = rows.filter((row) => {
          if (!row.channelFamily) return true;
          if (!normalized) return false;
          return channelMatchKey(row.channelFamily, channels) === normalized;
        });
        aliasCache.set(cacheKey, applicable);
      }
      return aliasCache.get(cacheKey)!;
    };

    for (const [index, url] of imageUrls.entries()) {
      const imageKey = input.imageKeys?.[index]?.trim() || null;
      const buffer = await this.downloadImage(url, imageKey);
      const imageHash = createHash('sha256').update(buffer).digest('hex');

      const duplicated = await this.prisma.purchaseOrderImport.findFirst({
        where: {
          purchaseListId: input.purchaseListId,
          imageHash,
          status: { not: 'DISCARDED' },
        },
        select: { id: true },
      });
      if (duplicated) {
        throw new BadRequestException(
          '这张截图已经导入过，请勿重复上传（可在识别记录里放弃后重试）',
        );
      }

      const { draft, raw, model } = await this.recognize(buffer, url, channels);
      const aliases = await getAliasesForChannel(draft.channel);
      let matched = matchOrderLines(
        draft.items,
        candidates,
        draft.channel,
        channels,
        aliases,
      );

      // 字面匹配不上的，再用模型在清单内做一次语义归一（鲑鱼→三文鱼）。
      const unmatched = matched
        .map((line, index) => ({ line, index }))
        .filter((entry) => !entry.line.ingredientId);
      if (unmatched.length > 0) {
        const hints = await this.semanticMapIngredients(
          unmatched.map((entry) => ({
            index: entry.index,
            rawName: entry.line.rawName,
            spec: entry.line.spec,
          })),
          candidates,
          draft.channel,
        );
        if (hints.length > 0) {
          matched = matchOrderLines(
            draft.items,
            candidates,
            draft.channel,
            channels,
            aliases,
            hints,
          );
        }
      }

      recognized.push({
        url,
        imageKey,
        imageHash,
        draft,
        matched,
        raw,
        model,
      });
    }

    // 全部识别成功后才落库，避免「第 3 张失败、前 2 张留在草稿里」。
    const saved = await this.prisma
      .$transaction(async (tx) => {
        const rows = [];
        for (const item of recognized) {
          rows.push(
            await tx.purchaseOrderImport.create({
              data: {
                purchaseListId: input.purchaseListId,
                uploadedById: input.userId,
                channel: item.draft.channel,
                orderNo: item.draft.orderNo,
                orderTime: item.draft.orderTime
                  ? parseOrderTime(item.draft.orderTime)
                  : null,
                subtotal: item.draft.subtotal,
                shippingFee: item.draft.shippingFee,
                packagingFee: item.draft.packagingFee,
                paid: item.draft.paid,
                imageUrls: [item.url],
                imageKeys: item.imageKey ? [item.imageKey] : [],
                imageHash: item.imageHash,
                incomplete: item.draft.incomplete,
                incompleteReason: item.draft.incompleteReason,
                model: item.model,
                promptVersion: PURCHASE_ORDER_IMPORT_PROMPT_VERSION,
                rawResult: JSON.parse(JSON.stringify(item.raw)),
                lines: {
                  create: item.matched.map((line, lineIndex) => ({
                    lineNo: lineIndex + 1,
                    rawName: line.rawName,
                    spec: line.spec,
                    qty: line.qty,
                    unit: line.unit,
                    unitPrice: line.unitPrice,
                    lineTotal: line.lineTotal,
                    ingredientId: line.ingredientId,
                    procurementSkuId: line.procurementSkuId,
                    matchSource: line.needsNewSku ? 'NEW_SKU' : 'AUTO',
                    matchConfidence: line.confidence,
                    // 没匹配到原料 = 系统不认识这个商品，先按个人采购放行（2026-11-05 老板定）：
                    // 员工要报销，误标会自己改回来；不再让这种行堵住整笔生成。
                    isPersonal: !line.ingredientId,
                    purchaseItemId: line.purchaseItemId,
                  })),
                },
              },
              include: { lines: { orderBy: { lineNo: 'asc' } } },
            }),
          );
        }
        return rows;
      })
      .catch((error: any) => {
        if (error?.code === 'P2002') {
          throw new BadRequestException(
            '这张截图已经导入过，请勿重复上传（可在识别记录里放弃后重试）',
          );
        }
        throw error;
      });

    return Promise.all(saved.map((row) => this.toView(row)));
  }

  async listByPurchaseList(purchaseListId: string): Promise<any[]> {
    const rows = await this.prisma.purchaseOrderImport.findMany({
      where: { purchaseListId, status: { not: 'DISCARDED' } },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  /** 改渠道 / 订单号 / 下单时间 / 运费 / 包装费（识别错了手动修正） */
  async updateImport(
    id: string,
    dto: {
      channel?: string;
      orderNo?: string | null;
      orderTime?: string | null;
      shippingFee?: number | null;
      packagingFee?: number | null;
    },
  ): Promise<any> {
    const current = await this.prisma.purchaseOrderImport.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('识别记录不存在');
    if (current.status !== 'DRAFT') {
      throw new BadRequestException('已确认的识别记录不能再修改');
    }

    const channels = await this.loadChannelOptions();
    const data: Record<string, unknown> = {};
    let channelChanged = false;
    if (dto.channel !== undefined) {
      const raw = dto.channel.trim();
      if (!raw) throw new BadRequestException('渠道不能为空');
      const channel = canonicalChannelCode(raw, channels);
      if (!channel) {
        throw new BadRequestException(
          `「${raw}」不在渠道清单里，请从后台维护的渠道中选择`,
        );
      }
      data.channel = channel;
      channelChanged = channel !== current.channel;
    }
    if (dto.orderNo !== undefined) {
      data.orderNo = dto.orderNo?.trim() || null;
    }
    if (dto.orderTime !== undefined) {
      data.orderTime = dto.orderTime ? parseOrderTime(dto.orderTime) : null;
    }
    if (dto.shippingFee !== undefined) {
      data.shippingFee = normalizeFee(dto.shippingFee, '运费');
    }
    if (dto.packagingFee !== undefined) {
      data.packagingFee = normalizeFee(dto.packagingFee, '包装费');
    }

    const updated = await this.prisma.purchaseOrderImport.update({
      where: { id },
      data,
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });

    // 金额类改动留痕：模型读到的原值和员工改成多少都写进日志，审核可回溯。
    const feeChanges: string[] = [];
    if (dto.shippingFee !== undefined) {
      const before = toNum(current.shippingFee);
      const after = toNum(updated.shippingFee);
      if (before !== after) {
        feeChanges.push(`运费 ${fmtFee(before)} → ${fmtFee(after)}`);
      }
    }
    if (dto.packagingFee !== undefined) {
      const before = toNum(current.packagingFee);
      const after = toNum(updated.packagingFee);
      if (before !== after) {
        feeChanges.push(`包装费 ${fmtFee(before)} → ${fmtFee(after)}`);
      }
    }
    if (feeChanges.length > 0) {
      const aiRaw = (current.rawResult ?? {}) as Record<string, unknown>;
      this.logger.log(
        `[order-import ${id}] ${feeChanges.join('，')}；模型原值 ` +
          `运费 ${fmtFee(toNum(aiRaw.shippingFee))}、包装费 ${fmtFee(toNum(aiRaw.packagingFee))}`,
      );
    }

    // 渠道改了要重新匹配：商品匹配是「按渠道」做的，只改个名字等于没改。
    if (channelChanged) {
      await this.rematchAutoLines(id, String(data.channel), channels);
      const refreshed = await this.prisma.purchaseOrderImport.findUnique({
        where: { id },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
      });
      return this.toView(refreshed ?? updated);
    }

    return this.toView(updated);
  }

  /**
   * 换渠道后重算商品匹配（2026-11-05）。
   *
   * 只动「系统自动匹配、员工没碰过」的行：
   *   · matchSource = AUTO 且 editedByUser = false；
   *   · 员工手选过的（MANUAL）、标了个人采购的（PERSONAL）、新建过商品的（NEW_SKU）一律保留，
   *     否则会把人工的判断冲掉。
   *
   * 原料的命中结果会作为 hint 带进去 —— 换渠道只该换商品，不该把原料也重挑一遍。
   */
  private async rematchAutoLines(
    importId: string,
    channel: string,
    channels: ChannelOption[],
  ): Promise<void> {
    const current = await this.prisma.purchaseOrderImport.findUnique({
      where: { id: importId },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!current) return;

    const targets = current.lines.filter(
      (line) =>
        line.matchSource === 'AUTO' && !line.editedByUser && !line.isPersonal,
    );
    if (targets.length === 0) return;

    const candidates = await this.buildCandidates(current.purchaseListId);
    if (candidates.length === 0) return;

    const aliases = await this.prisma.purchaseOrderMatchAlias.findMany({
      select: {
        normalizedName: true,
        channelFamily: true,
        ingredientId: true,
        procurementSkuId: true,
      },
    });
    const normalized = channelMatchKey(channel, channels);
    const applicableAliases = aliases.filter(
      (row) =>
        !row.channelFamily ||
        channelMatchKey(row.channelFamily, channels) === normalized,
    );

    const parsed = targets.map((line) => ({
      rawName: line.rawName,
      spec: line.spec,
      qty: numOrNull(line.qty),
      unit: line.unit,
      unitPrice: numOrNull(line.unitPrice),
      lineTotal: numOrNull(line.lineTotal),
    }));
    const hints = targets
      .map((line, index) => ({
        lineIndex: index,
        ingredientId: line.ingredientId,
      }))
      .filter((hint): hint is { lineIndex: number; ingredientId: string } =>
        Boolean(hint.ingredientId),
      );

    const matched = matchOrderLines(
      parsed,
      candidates,
      channel,
      channels,
      applicableAliases,
      hints,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const [index, line] of matched.entries()) {
        await tx.purchaseOrderImportLine.update({
          where: { id: targets[index].id },
          data: {
            ingredientId: line.ingredientId,
            purchaseItemId: line.purchaseItemId,
            procurementSkuId: line.procurementSkuId,
            matchConfidence: line.confidence,
          },
        });
      }
    });
  }

  /** 改一行：截图里的名字/数量/单价/小计/匹配原料/个人标记 */
  async updateLine(input: {
    importId: string;
    lineId: string;
    userId?: string;
    dto: {
      /** 截图里那串字，识别错了允许员工直接改（2026-11-05） */
      rawName?: string;
      ingredientId?: string | null;
      procurementSkuId?: string | null;
      qty?: number | null;
      unit?: string | null;
      unitPrice?: number | null;
      lineTotal?: number | null;
      isPersonal?: boolean;
      /** 只有员工显式勾选才同步商品名 */
      syncSkuName?: boolean;
    };
  }): Promise<any> {
    const line = await this.prisma.purchaseOrderImportLine.findFirst({
      where: { id: input.lineId, importId: input.importId },
      include: { import: true },
    });
    if (!line) throw new NotFoundException('识别行不存在');
    if (line.import.status !== 'DRAFT') {
      throw new BadRequestException('已确认的识别记录不能再修改');
    }

    const dto = input.dto;
    const data: Record<string, unknown> = { editedByUser: true };

    // 截图名字：改的是「这行在截图上写的是什么」，同时也会被当成
    // 下一次自动匹配要记住的叫法，所以只做「去掉首尾空格 + 限长」。
    if (dto.rawName !== undefined) {
      const rawName = String(dto.rawName ?? '').trim();
      if (!rawName) {
        throw new BadRequestException('名字不能为空');
      }
      data.rawName = rawName.slice(0, 200);
    }

    if (dto.qty !== undefined) {
      if (dto.qty !== null && (!Number.isFinite(dto.qty) || dto.qty <= 0)) {
        throw new BadRequestException('数量必须大于 0');
      }
      data.qty = dto.qty;
    }
    if (dto.unit !== undefined) {
      data.unit = dto.unit?.trim() || null;
    }
    if (dto.unitPrice !== undefined) {
      if (
        dto.unitPrice !== null &&
        (!Number.isFinite(dto.unitPrice) || dto.unitPrice < 0)
      ) {
        throw new BadRequestException('单价不能小于 0');
      }
      data.unitPrice = dto.unitPrice;
    }
    if (dto.lineTotal !== undefined) {
      if (
        dto.lineTotal !== null &&
        (!Number.isFinite(dto.lineTotal) || dto.lineTotal < 0)
      ) {
        throw new BadRequestException('金额不能小于 0');
      }
      data.lineTotal = dto.lineTotal;
    } else if (dto.qty !== undefined || dto.unitPrice !== undefined) {
      const qty = dto.qty !== undefined ? dto.qty : toNum(line.qty);
      const price =
        dto.unitPrice !== undefined ? dto.unitPrice : toNum(line.unitPrice);
      if (qty !== null && price !== null) data.lineTotal = round2(qty * price);
    }

    if (dto.isPersonal !== undefined) {
      data.isPersonal = dto.isPersonal;
      if (dto.isPersonal) {
        data.matchSource = 'PERSONAL';
        data.ingredientId = null;
        data.procurementSkuId = null;
      }
    }

    if (dto.ingredientId !== undefined) {
      if (dto.ingredientId) {
        const item = await this.prisma.purchaseItem.findFirst({
          where: {
            purchaseListId: line.import.purchaseListId,
            ingredientId: dto.ingredientId,
          },
          select: { id: true },
        });
        if (!item) {
          throw new BadRequestException('这个原料不在本次采购清单里');
        }
        data.ingredientId = dto.ingredientId;
        data.purchaseItemId = item.id;
        data.isPersonal = false;
        data.matchSource = 'MANUAL';
        data.matchConfidence = 'HIGH';
        // 只有真的换了原料才清掉商品；重复保存同一个原料时保留已选商品。
        if (dto.ingredientId !== line.ingredientId) {
          data.procurementSkuId = null;
        }
      } else {
        data.ingredientId = null;
        data.purchaseItemId = null;
        data.procurementSkuId = null;
      }
    }

    if (dto.procurementSkuId !== undefined) {
      if (dto.procurementSkuId) {
        const ingredientId =
          (data.ingredientId as string | undefined) ?? line.ingredientId;
        if (!ingredientId) {
          throw new BadRequestException('请先选择原料，再选择采购商品');
        }
        const sku = await this.prisma.procurementSku.findFirst({
          where: { id: dto.procurementSkuId, ingredientId, isActive: true },
          select: { id: true, name: true, purchaseChannel: true },
        });
        if (!sku) {
          throw new BadRequestException('这个采购商品不属于所选原料');
        }
        // 渠道是商品的身份证（2026-11-07）：这笔订单在沃尔玛，就不能挂山姆的商品，
        // 否则生成记录时按山姆的净含量折算，成本对不上。前端只列本渠道的商品，
        // 这里再挡一次，旧版本 / 改参数也绕不过去。
        const channels = await this.loadChannelOptions();
        const orderChannelKey = channelMatchKey(
          line.import.channel,
          channels,
        );
        if (!orderChannelKey) {
          throw new BadRequestException(
            '这笔订单还没确认渠道，请先选好渠道再挂商品',
          );
        }
        if (channelMatchKey(sku.purchaseChannel, channels) !== orderChannelKey) {
          throw new BadRequestException(
            `「${sku.name}」是${sku.purchaseChannel || '未填渠道'}的商品，这笔订单是${line.import.channel}，不能挂过来`,
          );
        }
        data.procurementSkuId = dto.procurementSkuId;
        data.isPersonal = false;
        data.matchSource = 'MANUAL';
      } else {
        data.procurementSkuId = null;
      }
    }

    // 只有“换了采购商品”才同步商品名；只改数量/金额不触发改名。
    const targetSkuId = dto.procurementSkuId ?? null;
    const skuChanged =
      Boolean(targetSkuId) && targetSkuId !== line.procurementSkuId;
    // 默认不改名：换商品只是匹配，改名必须由员工在界面上显式同意（并二次确认）。
    // 2026-11-05 起界面上不再有这个勾选 —— 改名统一挪到「生成采购记录」那一下做。
    const shouldRename = skuChanged && dto.syncSkuName === true;
    const desiredSkuName = shouldRename
      ? String(dto.rawName ?? line.rawName)
          .trim()
          .slice(0, 200)
      : '';

    const updated = await this.prisma.$transaction(async (tx) => {
      // 手动匹配现有商品时，把商品名同步成截图里的名字，并留一条改名记录。
      if (targetSkuId && shouldRename && desiredSkuName) {
        const sku = await tx.procurementSku.findUnique({
          where: { id: targetSkuId },
          select: { name: true },
        });
        if (sku && sku.name !== desiredSkuName) {
          await tx.procurementSku.update({
            where: { id: targetSkuId },
            data: { name: desiredSkuName },
          });
          await tx.procurementSkuNameChange.create({
            data: {
              skuId: targetSkuId,
              oldName: sku.name,
              newName: desiredSkuName,
              source: 'ORDER_IMPORT',
              changedById: input.userId ?? null,
            },
          });
        }
      }
      return tx.purchaseOrderImportLine.update({
        where: { id: input.lineId },
        data,
      });
    });

    const view = this.toLineView(updated);
    return shouldRename && desiredSkuName
      ? { ...view, renamedTo: desiredSkuName }
      : view;
  }

  /** 确认：一次性生成采购记录 */
  async confirm(importIds: string[], userId: string): Promise<any> {
    const ids = Array.from(new Set(importIds || []));
    if (ids.length === 0)
      throw new BadRequestException('请选择要确认的识别记录');

    const imports = await this.prisma.purchaseOrderImport.findMany({
      where: { id: { in: ids } },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (imports.length !== ids.length) {
      throw new NotFoundException('识别记录不存在或已被删除');
    }

    const listIds = Array.from(
      new Set(imports.map((row) => row.purchaseListId)),
    );
    if (listIds.length > 1) {
      throw new BadRequestException('一次只能确认同一张采购清单的识别记录');
    }

    const list = await this.assertListImportable(listIds[0]);
    if (!list.startedAt && !list.isDraft) {
      throw new BadRequestException('请先开始采购，再生成采购记录');
    }

    const channels = await this.loadChannelOptions();
    for (const row of imports) {
      if (row.status !== 'DRAFT') {
        throw new BadRequestException('有识别记录已经确认过了，请刷新后重试');
      }
      this.assertImportReady(row);
    }

    const result = await this.prisma
      .$transaction(async (tx) => {
        let createdCount = 0;
        const renames: Array<{
          lineId: string;
          skuId: string;
          from: string;
          to: string;
        }> = [];
        for (const row of imports) {
          // 抢占式确认：并发第二次会拿到 count=0，直接失败，不会重复记账。
          const claimed = await tx.purchaseOrderImport.updateMany({
            where: { id: row.id, status: 'DRAFT' },
            data: {
              status: 'CONFIRMED',
              confirmedAt: new Date(),
              confirmedById: userId,
            },
          });
          if (claimed.count !== 1) {
            throw new BadRequestException(
              '这条识别记录已经确认过了，请刷新后重试',
            );
          }

          for (const line of row.lines) {
            if (line.isPersonal) continue;

            const qty = toNum(line.qty);
            if (qty === null || qty <= 0) {
              throw new BadRequestException(
                `「${line.rawName}」缺少购买数量，不能生成采购记录`,
              );
            }
            const amount = toNum(line.lineTotal);
            if (amount === null) {
              throw new BadRequestException(
                `「${line.rawName}」没有金额，不能生成采购记录`,
              );
            }

            const lineUnit = (line.unit ?? '').trim();
            const weightBaseRatio =
              lineUnit && !line.procurementSkuId
                ? WEIGHT_UNIT_TO_BASE_RATIO[lineUnit.toLowerCase()]
                : undefined;

            // 补货改版：按斤/公斤/克/两买的，不强制采购商品，直接按重量记。
            if (weightBaseRatio !== undefined) {
              const weightItemId =
                line.purchaseItemId ??
                (
                  await tx.purchaseItem.findFirst({
                    where: {
                      purchaseListId: row.purchaseListId,
                      ingredientId: line.ingredientId!,
                    },
                    select: { id: true },
                  })
                )?.id;
              if (!weightItemId) {
                throw new BadRequestException(
                  `「${line.rawName}」在清单里找不到对应原料`,
                );
              }
              const weightItem = await tx.purchaseItem.findUnique({
                where: { id: weightItemId },
                select: {
                  id: true,
                  ingredientId: true,
                  ingredientName: true,
                  ingredient: {
                    select: {
                      name: true,
                      baseUnit: true,
                      purchaseChannel: true,
                    },
                  },
                },
              });
              if (!weightItem) {
                throw new BadRequestException(
                  `「${line.rawName}」在清单里找不到对应原料`,
                );
              }
              if (weightItem.ingredient?.baseUnit !== 'G') {
                throw new BadRequestException(
                  `「${line.rawName}」按重量只支持基准单位为克的原料，请改用商品净含量`,
                );
              }

              const weightChannelCode =
                row.channel ||
                canonicalChannelCode(
                  weightItem.ingredient?.purchaseChannel ?? null,
                  channels,
                ) ||
                '';
              const weightChannelName =
                channels.find((item) => item.code === weightChannelCode)?.label ??
                weightChannelCode;

              const weightRecord = await tx.purchaseRecord.create({
                data: {
                  purchaseListId: row.purchaseListId,
                  purchaseItemId: weightItem.id,
                  ingredientId: weightItem.ingredientId,
                  procurementSkuId: null,
                  procurementSkuName: line.rawName,
                  ingredientName:
                    weightItem.ingredientName ||
                    weightItem.ingredient?.name ||
                    line.rawName,
                  purchaseChannel: weightChannelCode,
                  purchaseChannelName: weightChannelName,
                  actualQuantity: qty,
                  actualPackageCount: qty,
                  actualPackageSize: 1,
                  actualPackageUnit: lineUnit,
                  actualBaseQuantity: qty * weightBaseRatio,
                  actualBaseUnit: 'G',
                  actualCost: amount,
                  productModel: line.spec,
                  purchasedAt: row.orderTime ?? new Date(),
                  sourceImportId: row.id,
                  sourceImportLineId: line.id,
                  sourceImageKey: row.imageKeys?.[0] ?? null,
                },
              });

              await tx.purchaseOrderImportLine.update({
                where: { id: line.id },
                data: { purchaseRecordId: weightRecord.id },
              });
              createdCount += 1;
              continue;
            }

            if (!line.procurementSkuId) {
              throw new BadRequestException(
                `「${line.rawName}」缺少采购商品，请先新建商品`,
              );
            }

            const sku = await tx.procurementSku.findUnique({
              where: { id: line.procurementSkuId! },
              select: {
                id: true,
                ingredientId: true,
                name: true,
                productModel: true,
                purchaseChannel: true,
                purchaseUnit: true,
                purchaseToBaseRatio: true,
                ingredient: {
                  select: {
                    baseUnit: true,
                    name: true,
                    purchaseToBaseRatio: true,
                  },
                },
              },
            });
            if (!sku) throw new BadRequestException('采购商品不存在');
            if (sku.ingredientId !== line.ingredientId) {
              throw new BadRequestException(
                `「${line.rawName}」的原料和采购商品对不上，请重新选择`,
              );
            }

            // 名字对齐：把这行的截图叫法写成商品名（认不准的行不动）。
            // 先改名再记账，记录里存的才是新名字。
            const renamed = await this.syncLineSkuName(tx, {
              line,
              sku,
              userId,
            });
            const skuName = renamed?.to ?? sku.name;
            if (renamed) {
              renames.push({ lineId: line.id, ...renamed });
            }

            if (
              lineUnit &&
              WEIGHT_OR_VOLUME_UNITS.has(lineUnit.toLowerCase())
            ) {
              throw new BadRequestException(
                `「${line.rawName}」是按重量/体积买的（${lineUnit}），请改成件数再生成`,
              );
            }

            // 只用采购商品自己的净含量（盒/袋）。
            // 2026-11-07 复核：原来「商品没填换算就退回原料比例」，
            // 而食材的档案换算恒为 1 —— 截图导入会把「2 盒」记成「2 克」。
            // 这里不再兜底：没有净含量就让员工先补商品。
            const ratio = Number(sku.purchaseToBaseRatio ?? 0);
            if (!Number.isFinite(ratio) || ratio <= 0) {
              throw new BadRequestException(
                `「${sku.name}」缺少净含量/换算比例，请先补全采购商品`,
              );
            }

            const purchaseItemId =
              line.purchaseItemId ??
              (
                await tx.purchaseItem.findFirst({
                  where: {
                    purchaseListId: row.purchaseListId,
                    ingredientId: line.ingredientId!,
                  },
                  select: { id: true },
                })
              )?.id;
            if (!purchaseItemId) {
              throw new BadRequestException(
                `「${line.rawName}」在清单里找不到对应原料`,
              );
            }

            // 这条原料可能早就被标过「无需采购」（原计划不买，后来又真买了）。
            // 生成采购记录时把标记清掉：数据上不允许一条原料同时是「已采购」和「无需采购」，
            // 否则旧版小程序/后台（仍按标记优先显示）会把这条记录藏起来，员工容易重复记账。
            const clearedNoPurchase = await tx.purchaseItem.updateMany({
              where: { id: purchaseItemId, noPurchaseNeeded: true },
              data: {
                noPurchaseNeeded: false,
                noPurchaseReason: null,
                noPurchaseMarkedAt: null,
                noPurchaseMarkedById: null,
              },
            });
            if (clearedNoPurchase.count > 0) {
              // 清掉的是一条人为决定，留个痕迹方便事后追溯（明细表没有 updatedAt）。
              this.logger.warn(
                `Purchase item ${purchaseItemId} (${sku.ingredient.name}) no-purchase marker cleared when creating a record from import ${row.id}`,
              );
            }

            // 建档时记下渠道码 + 当时的名字（快照），以后改名不回写历史
            const recordChannelCode =
              row.channel ||
              canonicalChannelCode(sku.purchaseChannel, channels) ||
              '';
            const recordChannelName =
              channels.find((item) => item.code === recordChannelCode)
                ?.label ?? recordChannelCode;

            const record = await tx.purchaseRecord.create({
              data: {
                purchaseListId: row.purchaseListId,
                purchaseItemId,
                ingredientId: line.ingredientId!,
                procurementSkuId: sku.id,
                procurementSkuName: skuName,
                ingredientName: sku.ingredient.name,
                purchaseChannel: recordChannelCode,
                purchaseChannelName: recordChannelName,
                actualQuantity: qty,
                actualPackageCount: qty,
                actualPackageSize: ratio,
                actualPackageUnit: sku.ingredient.baseUnit,
                actualBaseQuantity: qty * ratio,
                actualBaseUnit: sku.ingredient.baseUnit,
                actualCost: amount,
                productModel: line.spec,
                purchasedAt: row.orderTime ?? new Date(),
                sourceImportId: row.id,
                sourceImportLineId: line.id,
                sourceImageKey: row.imageKeys?.[0] ?? null,
              },
            });

            await tx.purchaseOrderImportLine.update({
              where: { id: line.id },
              data: { purchaseRecordId: record.id },
            });

            // 手动匹配/新建商品成功后，记住「这个叫法在这个渠道对应哪个商品」。
            if (
              line.matchSource !== 'AUTO' &&
              line.ingredientId &&
              line.procurementSkuId
            ) {
              const normalizedName = normalizeText(line.rawName);
              if (normalizedName.length >= 2) {
                const channelFamily = channelMatchKey(row.channel, channels);
                await tx.purchaseOrderMatchAlias.upsert({
                  where: {
                    normalizedName_channelFamily: {
                      normalizedName,
                      channelFamily,
                    },
                  },
                  create: {
                    normalizedName,
                    channelFamily,
                    ingredientId: line.ingredientId,
                    procurementSkuId: line.procurementSkuId,
                    createdById: userId,
                  },
                  update: {
                    ingredientId: line.ingredientId,
                    procurementSkuId: line.procurementSkuId,
                  },
                });
              }
            }
            createdCount += 1;
          }
        }
        return { createdCount, renamed: renames };
      })
      .catch((error: any) => {
        if (error?.code === 'P2002') {
          throw new BadRequestException(
            '这条识别记录已经生成过采购记录，请刷新后重试',
          );
        }
        throw error;
      });

    this.logger.log(
      `Purchase order import confirmed: ${result.createdCount} records from ${ids.length} imports`,
    );
    return result;
  }

  /**
   * 生成采购记录时，把这一行在截图上的叫法同步成匹配到的商品名（2026-11-05）。
   *
   * 为什么放在「生成」这一下，而不是「保存这一行」：
   *   保存是一行一行来的，员工只点开过的行才会被改名 —— 名字对不对，
   *   就取决于他点开了几行。放在生成，所有匹配行一次对齐，报一个数字就够。
   *
   * 只在「认得出来」的行上改，认不准宁可不动：
   *   · 名字是字面命中 / 沿用上次匹配（HIGH），或者员工自己挑的商品（MANUAL）；
   *   · 同渠道没有「同名又同规格」的商品（否则以后两件货分不开）；
   *   · 去掉名字尾巴上跟商品规格重复的那段（「…450g」→「…」），免得越改越长；
   *   · 名字不能变成纯数字 / 符号。
   */
  private async syncLineSkuName(
    tx: any,
    input: {
      line: any;
      sku: {
        id: string;
        name: string;
        productModel?: string | null;
        purchaseChannel: string | null;
      };
      userId: string;
    },
  ): Promise<{ skuId: string; from: string; to: string } | null> {
    const { line, sku } = input;
    if (line.isPersonal) return null;
    const trusted =
      line.matchSource === 'MANUAL' || line.matchConfidence === 'HIGH';
    if (!trusted) return null;

    const desired = stripSpecSuffix(
      String(line.rawName ?? '').trim(),
      sku.productModel ?? null,
    ).slice(0, 200);
    if (!desired || desired === sku.name) return null;
    // 「冷鲜 鲜切黄牛后腿肉」vs「冷鲜 鲜切黄牛后腿肉 约200g」是同一个名字，
    // 只是截图没写规格：不要为了这点排版差异去改商品主数据、写改名历史（2026-11-07）。
    if (normalizeText(desired) === normalizeText(sku.name)) return null;
    // 「300g」「×2」这种认岔的名字不要写进商品表
    if (!/[\u4e00-\u9fa5a-zA-Z]/.test(desired)) return null;

    const sameName = await tx.procurementSku.findMany({
      where: {
        id: { not: sku.id },
        isActive: true,
        name: desired,
        purchaseChannel: sku.purchaseChannel,
      },
      select: { id: true, productModel: true },
    });
    const targetSpec = specKeyOf(sku.productModel ?? null);
    const conflicted = (sameName ?? []).some(
      (row: any) => specKeyOf(row.productModel ?? null) === targetSpec,
    );
    if (conflicted) return null;

    await tx.procurementSku.update({
      where: { id: sku.id },
      data: { name: desired },
    });
    await tx.procurementSkuNameChange.create({
      data: {
        skuId: sku.id,
        oldName: sku.name,
        newName: desired,
        source: 'ORDER_IMPORT',
        changedById: input.userId ?? null,
      },
    });
    return { skuId: sku.id, from: sku.name, to: desired };
  }

  async discard(
    id: string,
    userId?: string,
  ): Promise<{ id: string; status: string }> {
    const current = await this.prisma.purchaseOrderImport.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('识别记录不存在');
    if (current.status !== 'DRAFT') {
      throw new BadRequestException('已确认的识别记录不能放弃');
    }
    await this.prisma.purchaseOrderImport.update({
      where: { id },
      data: { status: 'DISCARDED' },
    });
    for (const key of current.imageKeys ?? []) {
      await this.cosService.deleteImage(key).catch((error: any) => {
        this.logger.warn(
          `Failed to delete discarded screenshot ${key}: ${error?.message}`,
        );
      });
    }
    // 整单放弃也要留下「员工手动挑过什么」的记忆（2026-11-07）：
    // 重复上传、传错清单、想重来一遍都很常见，之前只有「生成采购记录」
    // 那一步才记，放弃过的单里教过的东西全丢了，下次同样的字还得再挑。
    // 这只是记忆缓存：写失败不能让「已经放弃」的请求变成 500，也不能
    // 连带把删图跳过（那会留下孤儿截图），所以放最后并兜住错误。
    try {
      await this.rememberManualMatches(current, userId);
    } catch (error: any) {
      this.logger.warn(
        `Failed to remember manual matches of discarded import ${id}: ${error?.message}`,
      );
    }
    return { id, status: 'DISCARDED' };
  }

  /**
   * 记住这张单里员工手动匹配过的「叫法 → 原料/商品」。
   *
   * 只记员工动过手的行（自动匹配、个人采购不记）：这是员工确认过的事实，
   * 与这单最后是生成还是放弃无关。渠道没确认时不记 —— 同一个叫法
   * 换个渠道就是另一个商品，记了反而会串。
   */
  private async rememberManualMatches(
    row: any,
    userId?: string,
  ): Promise<void> {
    const lines = await this.prisma.purchaseOrderImportLine.findMany({
      where: {
        importId: row.id,
        matchSource: { notIn: ['AUTO', 'PERSONAL'] },
        ingredientId: { not: null },
        procurementSkuId: { not: null },
      },
      select: {
        rawName: true,
        ingredientId: true,
        procurementSkuId: true,
      },
    });
    if (!lines || lines.length === 0) return;

    const channels = await this.loadChannelOptions();
    const channelFamily = channelMatchKey(row.channel, channels);
    if (!channelFamily) return;

    for (const line of lines) {
      const normalizedName = normalizeText(line.rawName);
      if (normalizedName.length < 2) continue;
      await this.prisma.purchaseOrderMatchAlias.upsert({
        where: {
          normalizedName_channelFamily: { normalizedName, channelFamily },
        },
        create: {
          normalizedName,
          channelFamily,
          ingredientId: line.ingredientId!,
          procurementSkuId: line.procurementSkuId,
          createdById: userId ?? row.uploadedById ?? null,
        },
        update: {
          ingredientId: line.ingredientId!,
          procurementSkuId: line.procurementSkuId,
        },
      });
    }
  }

  /** 采购清单列表用：每张清单的识别记录数（草稿 + 已确认） */
  async countByPurchaseLists(ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return {};
    const rows = await this.prisma.purchaseOrderImport.groupBy({
      by: ['purchaseListId'],
      where: {
        purchaseListId: { in: ids },
        status: { in: ['DRAFT', 'CONFIRMED'] },
      },
      _count: { _all: true },
    });
    return Object.fromEntries(
      rows.map((row) => [row.purchaseListId, row._count._all]),
    );
  }

  /** 报销提交用：这些清单下已确认的订单截图 key 白名单 */
  async getAllowedReceiptKeys(purchaseListIds: string[]): Promise<Set<string>> {
    if (purchaseListIds.length === 0) return new Set();
    const rows = await this.prisma.purchaseOrderImport.findMany({
      where: {
        purchaseListId: { in: purchaseListIds },
        status: 'CONFIRMED',
      },
      select: { imageKeys: true },
    });
    return new Set(rows.flatMap((row) => row.imageKeys ?? []));
  }

  /** 采购记录列表用：哪些记录来自截图、来源是哪张图 */
  async getRecordSources(
    purchaseListId: string,
  ): Promise<Map<string, { sourceImportId: string }>> {
    const rows = await this.prisma.purchaseRecord.findMany({
      where: { purchaseListId, sourceImportId: { not: null } },
      select: { id: true, sourceImportId: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { sourceImportId: row.sourceImportId as string },
      ]),
    );
  }

  // ---------------------------------------------------------------------------

  private async recognize(
    buffer: Buffer,
    imageUrl: string,
    channels: ChannelOption[],
  ): Promise<{
    draft: ParsedOrderDraft;
    raw: Record<string, unknown>;
    model: string;
  }> {
    const chunks = await splitImage(buffer);
    if (chunks.length > MAX_CHUNKS) {
      throw new BadRequestException(
        '截图太长了，请分两张截（每张不超过 6 屏）',
      );
    }

    const runtime = await this.agentConfig.getEnabledDeepSeekRuntimeConfig({
      purpose: PURCHASE_ORDER_IMPORT_PURPOSE,
      fallbackToDefault: true,
    });

    const content: any[] = [
      {
        type: 'text',
        text: `这是同一笔订单的长截图，共 ${chunks.length} 段，按顺序给出。`,
      },
      ...chunks.map((chunk) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:image/jpeg;base64,${chunk.toString('base64')}`,
        },
      })),
    ];

    const raw = await this.model.callDeepSeekJson({
      baseUrl: runtime.baseUrl,
      model: runtime.model,
      apiKey: runtime.apiKey,
      requestTimeoutMs: Math.min(
        Math.max(runtime.requestTimeoutMs, 45000),
        90000,
      ),
      systemPrompt: this.buildSystemPrompt(channels),
      userContent: content,
      temperature: 0,
      extraBody: { thinking: { type: 'disabled' } },
    });

    const draft = parseOrderDraft(raw, channels);
    if (draft.items.length === 0) {
      throw new BadRequestException(
        '这张图里没读出商品，请确认是订单详情截图后重试',
      );
    }
    this.logger.log(
      `Order screenshot recognized: ${draft.channel ?? '渠道未确认'} ${draft.items.length} lines, consistent=${draft.amountsConsistent}, url=${imageUrl.slice(0, 60)}`,
    );
    return { draft, raw, model: runtime.model };
  }

  /**
   * 字面匹配不上的行，交给模型在「本次清单的原料」里做语义归一。
   * 只允许从清单里选，不允许换成别的部位/品类；不确定必须返回 null。
   */
  private async semanticMapIngredients(
    items: Array<{ index: number; rawName: string; spec: string | null }>,
    candidates: ListItemCandidate[],
    channel: string | null,
  ): Promise<Array<{ lineIndex: number; ingredientId: string }>> {
    if (items.length === 0 || candidates.length === 0) return [];

    const runtime = await this.agentConfig.getEnabledDeepSeekRuntimeConfig({
      purpose: PURCHASE_ORDER_IMPORT_PURPOSE,
      fallbackToDefault: true,
    });

    let raw: Record<string, unknown>;
    try {
      raw = await this.model.callDeepSeekJson({
        baseUrl: runtime.baseUrl,
        model: runtime.model,
        apiKey: runtime.apiKey,
        requestTimeoutMs: Math.min(
          Math.max(runtime.requestTimeoutMs, 15000),
          30000,
        ),
        systemPrompt: `你是食材归一助手。只能从用户给出的“允许的原料”里选，不能发明新原料。
判断规则：
1. 同一种食材的不同叫法可以对应（例如鲑鱼 = 三文鱼，鸡胸肉 = 鸡胸）。
2. 部位/品类不同不算同一种（牛肋条 ≠ 牛里脊，鸡腿 ≠ 鸡胸，鳕鱼 ≠ 银鳕鱼）。
3. 拿不准就返回 null，不要猜。
输出 JSON：{"matches":[{"lineNo":1,"ingredient":"三文鱼","confidence":"HIGH"}]}
ingredient 必须是“允许的原料”里的原文；不确定时 ingredient 为 null，confidence 为 LOW。`,
        userPayload: {
          channel,
          allowedIngredients: candidates.map((item) => item.ingredientName),
          items: items.map((item, index) => ({
            lineNo: index + 1,
            name: item.rawName,
            spec: item.spec,
          })),
        },
        temperature: 0,
        maxTokens: 800,
        extraBody: { thinking: { type: 'disabled' } },
      });
    } catch (error: any) {
      this.logger.warn(
        `Semantic ingredient mapping failed, keep unmatched: ${error?.message}`,
      );
      return [];
    }

    const byName = new Map(
      candidates.map((item) => [
        normalizeText(item.ingredientName),
        item.ingredientId,
      ]),
    );
    const matches = Array.isArray((raw as any).matches)
      ? ((raw as any).matches as any[])
      : [];
    const hints: Array<{ lineIndex: number; ingredientId: string }> = [];
    for (const match of matches) {
      const lineNo = Number(match?.lineNo);
      const ingredientName = String(match?.ingredient ?? '').trim();
      const confidence = String(match?.confidence ?? 'HIGH').toUpperCase();
      if (!Number.isInteger(lineNo) || lineNo < 1 || lineNo > items.length) {
        continue;
      }
      if (!ingredientName || confidence === 'LOW') continue;
      const ingredientId = byName.get(normalizeText(ingredientName));
      if (!ingredientId) continue;
      hints.push({ lineIndex: items[lineNo - 1].index, ingredientId });
    }
    return hints;
  }

  private async assertListImportable(purchaseListId: string) {
    const list = await this.prisma.purchaseList.findUnique({
      where: { id: purchaseListId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        isDraft: true,
        reimbursementId: true,
        items: { select: { purchaseChannel: true }, take: 1 },
      },
    });
    if (!list) throw new NotFoundException('采购清单不存在');
    if (list.status !== 'PENDING') {
      throw new BadRequestException('采购清单已完成，不能再导入截图');
    }
    if (list.reimbursementId) {
      throw new BadRequestException('采购清单已关联报销单，不能再导入截图');
    }
    return {
      ...list,
      channelHint: list.items?.[0]?.purchaseChannel ?? null,
    };
  }

  private async assertQuota(userId: string, incoming: number): Promise<void> {
    const now = new Date();
    // 本地日历的零点（服务端时区 Asia/Shanghai），不能用 Date.UTC 混着本地年月日。
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dayCount, monthCount] = await Promise.all([
      this.prisma.purchaseOrderImport.count({
        where: { uploadedById: userId, createdAt: { gte: dayStart } },
      }),
      this.prisma.purchaseOrderImport.count({
        where: { createdAt: { gte: monthStart } },
      }),
    ]);

    if (monthCount + incoming > MONTHLY_IMPORT_LIMIT_SYSTEM) {
      throw new BadRequestException('本月识别次数已达上限，请手动录入');
    }
    if (dayCount + incoming > DAILY_IMPORT_LIMIT_PER_USER) {
      throw new BadRequestException(
        `今天的识别次数不够用（每天 ${DAILY_IMPORT_LIMIT_PER_USER} 次），请少传几张或手动录入`,
      );
    }
  }

  private async buildCandidates(
    purchaseListId: string,
  ): Promise<ListItemCandidate[]> {
    const items = await this.prisma.purchaseItem.findMany({
      where: { purchaseListId },
      select: {
        id: true,
        ingredientId: true,
        ingredientName: true,
      },
    });

    // 补货草稿没有明细：按全库原料 + 启用商品匹配（2026-11-10）。
    if (items.length === 0) {
      return this.buildCatalogCandidates();
    }

    const ingredientIds = Array.from(
      new Set(items.map((item) => item.ingredientId)),
    );
    const skus = await this.prisma.procurementSku.findMany({
      where: { ingredientId: { in: ingredientIds }, isActive: true },
      select: {
        id: true,
        ingredientId: true,
        name: true,
        productModel: true,
        purchaseChannel: true,
        purchaseToBaseRatio: true,
        purchaseUnit: true,
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    });

    const byIngredient = new Map<string, ListItemCandidate>();
    // 曾用名：生成记录时商品名会被截图里的叫法替换，匹配必须同时认旧名字。
    const previousNames = await this.loadPreviousSkuNames(
      skus.map((sku) => sku.id),
    );
    for (const item of items) {
      if (byIngredient.has(item.ingredientId)) continue;
      byIngredient.set(item.ingredientId, {
        purchaseItemId: item.id,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        skus: skus
          .filter((sku) => sku.ingredientId === item.ingredientId)
          .map((sku) => this.mapSkuCandidate(sku, previousNames)),
      });
    }
    return Array.from(byIngredient.values());
  }

  /**
   * 补货没有计划清单，匹配候选就是全库原料 + 各自启用中的采购商品。
   * `purchaseItemId` 为 null：明细在保存时才创建。
   */
  private async buildCatalogCandidates(): Promise<ListItemCandidate[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (ingredients.length === 0) {
      return [];
    }

    const skus = await this.prisma.procurementSku.findMany({
      where: {
        ingredientId: { in: ingredients.map((ingredient) => ingredient.id) },
        isActive: true,
      },
      select: {
        id: true,
        ingredientId: true,
        name: true,
        productModel: true,
        purchaseChannel: true,
        purchaseToBaseRatio: true,
        purchaseUnit: true,
      },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    });
    const previousNames = await this.loadPreviousSkuNames(
      skus.map((sku) => sku.id),
    );

    return ingredients.map((ingredient) => ({
      purchaseItemId: null,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      skus: skus
        .filter((sku) => sku.ingredientId === ingredient.id)
        .map((sku) => this.mapSkuCandidate(sku, previousNames)),
    }));
  }

  private mapSkuCandidate(
    sku: any,
    previousNames: Map<string, string[]>,
  ): ListSkuCandidate {
    return {
      id: sku.id,
      name: sku.name,
      productModel: sku.productModel,
      purchaseChannel: sku.purchaseChannel,
      purchaseToBaseRatio: sku.purchaseToBaseRatio
        ? Number(sku.purchaseToBaseRatio)
        : null,
      purchaseUnit: sku.purchaseUnit,
      previousNames: previousNames.get(sku.id) ?? [],
    };
  }

  /** 每个商品最近改过什么名字（最多留 5 个，够匹配用） */
  private async loadPreviousSkuNames(
    skuIds: string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (skuIds.length === 0) return result;
    const changes = await this.prisma.procurementSkuNameChange.findMany({
      where: { skuId: { in: skuIds } },
      select: { skuId: true, oldName: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const change of changes ?? []) {
      const list = result.get(change.skuId) ?? [];
      if (list.length >= 5) continue;
      if (list.includes(change.oldName)) continue;
      list.push(change.oldName);
      result.set(change.skuId, list);
    }
    return result;
  }

  private async downloadImage(
    url: string,
    imageKey: string | null,
  ): Promise<Buffer> {
    let target: string;
    if (imageKey) {
      // 只允许本功能自己的目录，避免拿别的私有对象（如定制食谱附件）来签名。
      if (!imageKey.startsWith('purchase-order-screenshots/')) {
        throw new BadRequestException('图片地址无效，请重新上传');
      }
      const signed = await this.cosService.getSignedUrl(imageKey, 600);
      if (!signed) {
        throw new BadRequestException('截图签名失败，请重新上传');
      }
      target = signed;
    } else {
      // 没有 key 时只允许取本桶/CDN 的地址，避免被当成任意 URL 代理（SSRF）。
      if (!this.cosService.isOwnedAssetUrl(url)) {
        throw new BadRequestException('图片地址无效，请重新上传');
      }
      target = url;
    }

    const response = await fetch(target, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    }).catch((error: any) => {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw new BadRequestException('截图下载超时，请重试');
      }
      throw new BadRequestException('截图下载失败，请重新上传');
    });
    if (!response.ok) {
      throw new BadRequestException('截图下载失败，请重新上传');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException('截图超过 12MB，请压缩后再传');
    }
    return buffer;
  }

  private assertImportReady(row: {
    channel: string | null;
    lines: Array<{
      rawName: string;
      isPersonal: boolean;
      ingredientId: string | null;
      procurementSkuId: string | null;
      unit?: string | null;
      lineTotal: unknown;
      qty: unknown;
    }>;
  }): void {
    // 渠道必须先确认：商品是按渠道匹配的，渠道不对，下面的行级检查只会误导员工。
    if (!row.channel) {
      throw new BadRequestException('这笔订单还没确认渠道，请先选一下在哪买的');
    }
    // 2026-11-05 起不再拦「金额对不上」和「模型判不完整」：
    // 优惠/特价/包装费本来就会让合计对不上，页面已经让员工勾选核对过。
    // 这里只拦真正没法记账的：没匹配原料、缺数量、缺金额。
    const unresolved = row.lines.filter(
      (line) => !line.isPersonal && !line.ingredientId,
    );
    if (unresolved.length > 0) {
      throw new BadRequestException(
        `还有 ${unresolved.length} 行没匹配原料：${unresolved
          .slice(0, 3)
          .map((line) => line.rawName)
          .join('、')}`,
      );
    }

    const missingSku = row.lines.filter(
      (line) =>
        !line.isPersonal &&
        line.ingredientId &&
        !line.procurementSkuId &&
        WEIGHT_UNIT_TO_BASE_RATIO[
          String(line.unit ?? '').trim().toLowerCase()
        ] === undefined,
    );
    if (missingSku.length > 0) {
      throw new BadRequestException(
        `还有 ${missingSku.length} 行需要先新建或选择采购商品：${missingSku
          .slice(0, 3)
          .map((line) => line.rawName)
          .join('、')}`,
      );
    }

    const invalidQty = row.lines.filter(
      (line) =>
        !line.isPersonal &&
        (toNum(line.qty) === null || (toNum(line.qty) as number) <= 0),
    );
    if (invalidQty.length > 0) {
      throw new BadRequestException(
        `还有 ${invalidQty.length} 行没有有效数量，请补充后再生成`,
      );
    }

    const missingAmount = row.lines.filter(
      (line) => !line.isPersonal && toNum(line.lineTotal as number) === null,
    );
    if (missingAmount.length > 0) {
      throw new BadRequestException(
        `还有 ${missingAmount.length} 行没有金额，不能生成采购记录`,
      );
    }
  }

  private async toView(row: any): Promise<any> {
    const keys: string[] = Array.isArray(row.imageKeys) ? row.imageKeys : [];
    const signedUrls = keys.length
      ? await Promise.all(
          keys.map((key) =>
            this.cosService.getSignedUrl(key, 3600).catch(() => ''),
          ),
        )
      : [];
    const imageUrls =
      signedUrls.filter(Boolean).length > 0
        ? signedUrls.filter(Boolean)
        : Array.isArray(row.imageUrls)
          ? row.imageUrls
          : [];

    const rawItems = Array.isArray((row.rawResult as any)?.items)
      ? ((row.rawResult as any).items as any[])
      : [];
    const lines = (row.lines || []).map((line: any) =>
      this.toLineView(line, rawItems[line.lineNo - 1]),
    );
    const rawDraft = (row.rawResult ?? {}) as Record<string, unknown>;
    // 历史草稿可能存的是旧写法（「山姆」「盒马」）甚至「其他」：
    // 能归一到字典就按标准名显示，归不上（比如「其他」）就当没确认，
    // 否则员工会以为这笔已经选好渠道了。
    const channels = await this.loadChannelOptions();
    const channel = row.channel
      ? canonicalChannelCode(row.channel, channels)
      : null;
    return {
      id: row.id,
      purchaseListId: row.purchaseListId,
      // null = 还没确认渠道；页面据此先把「这笔在哪买的」问清楚
      channel,
      channelConfirmed: Boolean(channel),
      // 模型当初猜的原文（可能是「大润发」这种不在清单里的），只用于提示，不参与匹配
      aiChannelGuess:
        typeof rawDraft.channel === 'string' ? rawDraft.channel : null,
      orderNo: row.orderNo,
      orderTime: row.orderTime,
      subtotal: numOrNull(row.subtotal),
      shippingFee: numOrNull(row.shippingFee),
      packagingFee: numOrNull(row.packagingFee),
      // 模型当初读到的运费/包装费，用于页面显示「已改动（AI 读到 ¥x）」和审核对照。
      aiShippingFee: numOrNull(rawDraft.shippingFee),
      aiPackagingFee: numOrNull(rawDraft.packagingFee),
      paid: numOrNull(row.paid),
      incomplete: row.incomplete,
      incompleteReason: row.incompleteReason,
      status: row.status,
      model: row.model ?? null,
      promptVersion: row.promptVersion ?? null,
      imageUrls,
      imageKeys: keys,
      confirmedAt: row.confirmedAt,
      createdAt: row.createdAt,
      lines,
      summary: summarizeLines(lines),
    };
  }

  private toLineView(line: any, rawItem?: any): any {
    const ingredientId = line.ingredientId ?? null;
    const state = line.isPersonal
      ? 'PERSONAL'
      : !ingredientId
        ? 'UNMATCHED'
        : !line.procurementSkuId
          ? 'NEEDS_SKU'
          : 'MATCHED';
    return {
      id: line.id,
      lineNo: line.lineNo,
      rawName: line.rawName,
      spec: line.spec,
      qty: numOrNull(line.qty),
      unit: line.unit,
      unitPrice: numOrNull(line.unitPrice),
      lineTotal: numOrNull(line.lineTotal),
      // 模型当时读到的金额，用于「和原图对照」；员工改过之后 lineTotal 会变。
      aiLineTotal: numOrNull(rawItem?.lineTotal ?? rawItem?.total),
      ingredientId,
      procurementSkuId: line.procurementSkuId ?? null,
      isPersonal: line.isPersonal,
      editedByUser: line.editedByUser,
      confidence: line.matchConfidence ?? 'LOW',
      matchSource: line.matchSource ?? null,
      state,
      purchaseItemId: line.purchaseItemId ?? null,
    };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNum(value: unknown): number | null {
  return numOrNull(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 运费/包装费人工修正的入口校验：只收 0 或正数，最多两位小数。
 * null 表示「明确清空」，按 0 计；不传则不改。
 */
function normalizeFee(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`${label}必须是 0 或正数`);
  }
  if (value > MAX_FEE_AMOUNT) {
    throw new BadRequestException(
      `${label}超过 ${MAX_FEE_AMOUNT} 元，请核对后再填`,
    );
  }
  return round2(value);
}

/** 日志里打印金额用：null 显示「未读到」，不要打印成 0 */
function fmtFee(value: number | null): string {
  return value === null ? '未读到' : `¥${value.toFixed(2)}`;
}

function parseOrderTime(value: string): Date | null {
  const normalized = value.trim().replace(/\//g, '-');
  const withSeconds = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
  const parsed = new Date(withSeconds.replace(' ', 'T') + '+08:00');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function summarizeLines(
  lines: Array<{ state: string; lineTotal: number | null }>,
): {
  total: number;
  matched: number;
  personal: number;
  unmatched: number;
  needsSku: number;
  matchedAmount: number;
  personalAmount: number;
} {
  const start = {
    total: 0,
    matched: 0,
    personal: 0,
    unmatched: 0,
    needsSku: 0,
    matchedAmount: 0,
    personalAmount: 0,
  };
  return lines.reduce((acc, line) => {
    const amount = line.lineTotal ?? 0;
    acc.total = round2(acc.total + amount);
    if (line.state === 'MATCHED') {
      acc.matched += 1;
      acc.matchedAmount = round2(acc.matchedAmount + amount);
    } else if (line.state === 'PERSONAL') {
      acc.personal += 1;
      acc.personalAmount = round2(acc.personalAmount + amount);
    } else if (line.state === 'NEEDS_SKU') {
      acc.needsSku += 1;
    } else {
      acc.unmatched += 1;
    }
    return acc;
  }, start);
}

/**
 * 把长截图按空白行切成 ≤2100px 的段。找不到空白行就直接硬切。
 */
export async function splitImage(buffer: Buffer): Promise<Buffer[]> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) {
    throw new BadRequestException('截图格式不支持');
  }
  if (height <= CHUNK_HEIGHT) return [buffer];

  const { data } = await sharp(buffer)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cuts: number[] = [];
  let start = 0;
  while (height - start > CHUNK_HEIGHT) {
    const target = start + CHUNK_HEIGHT;
    const cut = findWhitespaceRow(data, width, target, height);
    cuts.push(cut);
    start = cut;
    if (cuts.length >= MAX_CHUNKS) break;
  }
  cuts.push(height);

  const chunks: Buffer[] = [];
  let top = 0;
  for (const bottom of cuts) {
    const sliceHeight = bottom - top;
    if (sliceHeight <= 0) continue;
    chunks.push(
      await sharp(buffer)
        .extract({ left: 0, top, width, height: sliceHeight })
        .jpeg({ quality: 88 })
        .toBuffer(),
    );
    top = bottom;
  }
  return chunks;
}

function findWhitespaceRow(
  gray: Buffer,
  width: number,
  target: number,
  height: number,
): number {
  const x0 = Math.floor(width * 0.1);
  const x1 = Math.floor(width * 0.9);
  for (let y = target; y < Math.min(target + 500, height - 1); y += 1) {
    let allWhite = true;
    for (let x = x0; x < x1; x += 6) {
      if (gray[y * width + x] < 246) {
        allWhite = false;
        break;
      }
    }
    if (allWhite) return y;
  }
  return Math.min(target, height - 1);
}

/** 规格的归一化指纹：450g/袋 → "450g"；没规格 → 空串 */
function specKeyOf(value: string | null | undefined): string {
  return extractSpecTokens(value ?? '')
    .map((token) => token.key)
    .sort()
    .join('|');
}

/**
 * 把名字末尾跟规格重复的那段去掉（2026-11-05）。
 * 截图名常写成「冰鲜 原切澳洲牛嫩肉 450g」，而规格字段本来就存了 450g/袋；
 * 不去掉的话商品名会越来越长，而且下次截图写「450克」又要再变一次。
 */
function stripSpecSuffix(name: string, productModel: string | null): string {
  const trimmed = name.trim();
  if (!trimmed || !productModel) return trimmed;
  const core = productModel.split(/[\/／]/)[0].trim();
  if (!core) return trimmed;
  for (const candidate of [core, core.replace(/^约/, '')]) {
    if (candidate.length < 2) continue;
    if (!trimmed.endsWith(candidate)) continue;
    const rest = trimmed
      .slice(0, -candidate.length)
      .replace(/[（(\s]+$/, '')
      .replace(/[约\s]+$/, '')
      .trim();
    if (rest.length >= 2) return rest;
  }
  return trimmed;
}
