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
import { parseOrderDraft, isLineSetConsistent } from './purchase-order-parse';
import {
  matchOrderLines,
  normalizeText,
  resolveChannelFamily,
} from './purchase-order-match';
import type {
  ListItemCandidate,
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

export const PURCHASE_ORDER_IMPORT_PROMPT_VERSION = '2026-11-04.2';

/** 一张图最多切 6 段；再长就让员工截短一点 */
const MAX_CHUNKS = 6;
const CHUNK_HEIGHT = 2100;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 20000;
const MODEL_TIMEOUT_MS = 90000;
const MODEL_TIMEOUT_FLOOR_MS = 45000;
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

const SYSTEM_PROMPT = `你是采购助理。用户会给你同一笔商超订单（山姆/盒马/沃尔玛）的长截图，按从上到下的顺序切成 N 段。
请读完整笔订单，输出一个 JSON 对象。

输出字段：
{
  "channel": "盒马|山姆|沃尔玛|其他",
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

规则：
1. 商品金额（盒马叫商品小计、山姆叫商品总金额、沃尔玛叫商品金额）应当等于各行小计之和。你必须自己把各行金额加一遍，再和截图上的合计对比。
2. 如果加出来和截图合计不一致，说明有商品行没读到或被折叠（例如底部写"共18件"但只显示几行）。此时 incomplete=true，并在 note 里写清楚差多少钱。
3. 件数校验要看数量之和，不是行数之和。
4. 图上出现"¥29.00 ×2"这类写法时，29.00 是单价，行小计 = 单价 × 数量。请用订单合计校验你的判断。
5. 金额一律输出数字（元），不要带 ¥ 符号、不要千分位。
6. 读不到的字段一律给 null，绝不编造。不要输出姓名、电话、地址。
7. 图上的「称重退差价」只是标签，不代表真的发生退款；只有出现「补差退款 X 元」这种带金额的文字，才把 weightAdjustment.exists 置为 true。`;

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
    @Inject(PURCHASE_ORDER_IMPORT_MODEL)
    private readonly model: PurchaseOrderImportModelPort,
  ) {}

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
    const recognized: RecognizedOrder[] = [];

    const aliasCache = new Map<string, Array<{
      normalizedName: string;
      channelFamily: string;
      ingredientId: string;
      procurementSkuId: string | null;
    }>>();
    const getAliasesForChannel = async (channel: string) => {
      const family = resolveChannelFamily(channel);
      const key = family || '__none__';
      if (!aliasCache.has(key)) {
        const rows = await this.prisma.purchaseOrderMatchAlias.findMany({
          where: family
            ? { OR: [{ channelFamily: family }, { channelFamily: '' }] }
            : { channelFamily: '' },
          select: {
            normalizedName: true,
            channelFamily: true,
            ingredientId: true,
            procurementSkuId: true,
          },
        });
        aliasCache.set(key, rows);
      }
      return aliasCache.get(key)!;
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

      const { draft, raw, model } = await this.recognize(buffer, url);
      const aliases = await getAliasesForChannel(draft.channel);
      recognized.push({
        url,
        imageKey,
        imageHash,
        draft,
        matched: matchOrderLines(
          draft.items,
          candidates,
          draft.channel,
          aliases,
        ),
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
                    isPersonal: false,
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

  /** 改渠道 / 订单号 / 下单时间（识别错了手动修正） */
  async updateImport(
    id: string,
    dto: {
      channel?: string;
      orderNo?: string | null;
      orderTime?: string | null;
    },
  ): Promise<any> {
    const current = await this.prisma.purchaseOrderImport.findUnique({
      where: { id },
    });
    if (!current) throw new NotFoundException('识别记录不存在');
    if (current.status !== 'DRAFT') {
      throw new BadRequestException('已确认的识别记录不能再修改');
    }

    const data: Record<string, unknown> = {};
    if (dto.channel !== undefined) {
      if (!dto.channel.trim()) throw new BadRequestException('渠道不能为空');
      data.channel = dto.channel.trim();
    }
    if (dto.orderNo !== undefined) {
      data.orderNo = dto.orderNo?.trim() || null;
    }
    if (dto.orderTime !== undefined) {
      data.orderTime = dto.orderTime ? parseOrderTime(dto.orderTime) : null;
    }

    const updated = await this.prisma.purchaseOrderImport.update({
      where: { id },
      data,
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    return this.toView(updated);
  }

  /** 改一行：数量/单价/小计/匹配原料/个人标记 */
  async updateLine(input: {
    importId: string;
    lineId: string;
    userId?: string;
    dto: {
      ingredientId?: string | null;
      procurementSkuId?: string | null;
      qty?: number | null;
      unit?: string | null;
      unitPrice?: number | null;
      lineTotal?: number | null;
      isPersonal?: boolean;
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
          select: { id: true, name: true },
        });
        if (!sku) {
          throw new BadRequestException('这个采购商品不属于所选原料');
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
    const desiredSkuName = skuChanged
      ? line.rawName.trim().slice(0, 200)
      : '';

    const updated = await this.prisma.$transaction(async (tx) => {
      // 手动匹配现有商品时，把商品名同步成截图里的名字，并留一条改名记录。
      if (targetSkuId && skuChanged && desiredSkuName) {
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
    return skuChanged && desiredSkuName
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
    if (!list.startedAt) {
      throw new BadRequestException('请先开始采购，再生成采购记录');
    }

    for (const row of imports) {
      if (row.status !== 'DRAFT') {
        throw new BadRequestException('有识别记录已经确认过了，请刷新后重试');
      }
      this.assertImportReady(row);
    }

    const result = await this.prisma
      .$transaction(async (tx) => {
        let createdCount = 0;
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

            const sku = await tx.procurementSku.findUnique({
              where: { id: line.procurementSkuId! },
              select: {
                id: true,
                ingredientId: true,
                name: true,
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

            const unit = (line.unit ?? '').trim();
            if (unit && WEIGHT_OR_VOLUME_UNITS.has(unit.toLowerCase())) {
              throw new BadRequestException(
                `「${line.rawName}」是按重量/体积买的（${unit}），请改成件数再生成`,
              );
            }

            // 换算优先用采购商品自己的净含量（盒/袋），没有才回退原料比例。
            // 猪肝 200g/盒 与「散称 1kg」的换算不同，用原料比例会把 200g 算成 1g。
            const ratio = Number(
              sku.purchaseToBaseRatio ??
                sku.ingredient.purchaseToBaseRatio ??
                0,
            );
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

            const record = await tx.purchaseRecord.create({
              data: {
                purchaseListId: row.purchaseListId,
                purchaseItemId,
                ingredientId: line.ingredientId!,
                procurementSkuId: sku.id,
                procurementSkuName: sku.name,
                ingredientName: sku.ingredient.name,
                purchaseChannel:
                  row.channel || sku.purchaseChannel || '未知渠道',
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
                const channelFamily = resolveChannelFamily(row.channel);
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
        return { createdCount };
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

  async discard(id: string): Promise<{ id: string; status: string }> {
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
    return { id, status: 'DISCARDED' };
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
  async getAllowedReceiptKeys(
    purchaseListIds: string[],
  ): Promise<Set<string>> {
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
      rows.map((row) => [row.id, { sourceImportId: row.sourceImportId as string }]),
    );
  }

  // ---------------------------------------------------------------------------

  private async recognize(
    buffer: Buffer,
    imageUrl: string,
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
      systemPrompt: SYSTEM_PROMPT,
      userContent: content,
      temperature: 0,
      extraBody: { thinking: { type: 'disabled' } },
    });

    const draft = parseOrderDraft(raw);
    if (draft.items.length === 0) {
      throw new BadRequestException(
        '这张图里没读出商品，请确认是订单详情截图后重试',
      );
    }
    this.logger.log(
      `Order screenshot recognized: ${draft.channel} ${draft.items.length} lines, consistent=${draft.amountsConsistent}, url=${imageUrl.slice(0, 60)}`,
    );
    return { draft, raw, model: runtime.model };
  }

  private async assertListImportable(purchaseListId: string) {
    const list = await this.prisma.purchaseList.findUnique({
      where: { id: purchaseListId },
      select: {
        id: true,
        status: true,
        startedAt: true,
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
    for (const item of items) {
      if (byIngredient.has(item.ingredientId)) continue;
      byIngredient.set(item.ingredientId, {
        purchaseItemId: item.id,
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName,
        skus: skus
          .filter((sku) => sku.ingredientId === item.ingredientId)
          .map((sku) => ({
            id: sku.id,
            name: sku.name,
            productModel: sku.productModel,
            purchaseChannel: sku.purchaseChannel,
            purchaseToBaseRatio: sku.purchaseToBaseRatio
              ? Number(sku.purchaseToBaseRatio)
              : null,
            purchaseUnit: sku.purchaseUnit,
          })),
      });
    }
    return Array.from(byIngredient.values());
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
    incomplete: boolean;
    lines: Array<{
      rawName: string;
      isPersonal: boolean;
      ingredientId: string | null;
      procurementSkuId: string | null;
      lineTotal: unknown;
      qty: unknown;
    }>;
    subtotal: unknown;
  }): void {
    if (row.incomplete) {
      throw new BadRequestException(
        '这张截图没读完整（商品金额对不上），请展开全部商品后重新上传',
      );
    }

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
      (line) => !line.isPersonal && line.ingredientId && !line.procurementSkuId,
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

    const subtotal = toNum(row.subtotal as number);
    if (
      subtotal !== null &&
      !isLineSetConsistent(
        row.lines.map((line) => ({
          lineTotal: toNum(line.lineTotal as number),
        })),
        subtotal,
      )
    ) {
      throw new BadRequestException(
        '各行金额之和与截图上的商品金额对不上，请检查后再生成',
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
    return {
      id: row.id,
      purchaseListId: row.purchaseListId,
      channel: row.channel,
      orderNo: row.orderNo,
      orderTime: row.orderTime,
      subtotal: numOrNull(row.subtotal),
      shippingFee: numOrNull(row.shippingFee),
      packagingFee: numOrNull(row.packagingFee),
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
