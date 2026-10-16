/**
 * 健康报告识别的每日上限（2026-10-16 上线前风险控制 B5）
 *
 * ══ 为什么要有它 ══════════════════════════════════════════════════════════
 *
 * 识别每张报告都要调一次模型（2~3 秒、真花钱）。上线后用量涨起来，
 * 被刷就是纯亏；而且在此之前我们连"一天用掉多少次"都不知道 ✗。
 *
 * ══ 三条硬口径 ════════════════════════════════════════════════════════════
 *
 * ① **拒绝必须发生在调模型之前**（省钱的关键）：
 *    调用方在动手调模型**之前**先 await 这里的 `assertWithinDailyLimit()`；
 *    超限直接抛错，一个 token 都不花 ✓。
 *
 * ② **计数持久 + 并发不穿透**：
 *    存在 `health_extraction_daily_usage` 表里（重启不丢 ✓）。
 *    计数只有两条**单语句**原子操作，没有"先读再写"：
 *      · 当天第一次 `create`（主键冲突 = 别人先建好了 → 转下一条）
 *      · `updateMany(where usedCount < 上限, { increment: 1 })`
 *        返回 0 行 = 到上限了；**到上限时那一行根本没被改**，
 *        所以被拒的请求不会把计数越推越高 ✓
 *    同一秒来 100 个请求，最多只有"剩余额度"个能通过 ✓
 *
 * ③ **上限可配、不写死**：
 *    值在 `global_config.health_extraction_daily_limit`（默认 500，0 = 不限量），
 *    后台 `PUT /api/v1/admin/global-config` 改完**即时生效**，不用改代码、不用重启 ✓
 *
 * ⚠️ 拒绝时的措辞：中文、能行动、**不是 500 也不是英文** ✗
 *   （HTTP 用的是 429 Too Many Requests —— 4xx 是"你这次请求的问题"，
 *    不是"我们服务器挂了"；小程序会把这句话原样显示给顾客。）
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  DEFAULT_HEALTH_EXTRACTION_DAILY_LIMIT,
  GlobalConfigService,
} from '../config/global-config.service';

/** 计数表里的"用途"（将来若要给别的识别单开额度，加一个 scope 即可） */
export const HEALTH_EXTRACTION_SCOPE = 'HEALTH_EXTRACTION';

/**
 * 超限时给顾客看的那句话。
 *
 * ⚠️ 措辞有两个坑，都是刻意的：
 *   · 说清"是今天用完了"，不让顾客以为是自己操作错了 —— 所以带"明天再试"；
 *   · 必须给出替代方案（手工填写）—— 否则家长这一条记录就录不进来了。
 *   另外：小程序侧 `resolveHealthScanErrorMessage` 会把含"频率/超限"字样的报错
 *   改写成"识别的人有点多，稍等一会儿再试"（那句是给 OCR 限流用的，含"稍等"，
 *   对"明天再来"的日限是错的）—— 所以这里**故意不带**那些字眼，
 *   让这句话原样到达顾客眼前 ✓（miniapp 有测试钉着这条契约）。
 */
export const HEALTH_EXTRACTION_QUOTA_MESSAGE =
  '今天的识别次数已经用完了，请明天再试，或者先用「手动填写」把这一条记下来';

/** 北京时间的那一天（ISO 日期串，如 2026-10-16） */
export function resolveHealthExtractionUsageDateKey(
  now: Date = new Date(),
): string {
  /**
   * ⚠️ 用**北京时间**分天，不用服务器本地时区（2026-10-16）。
   *
   * 生产机时区不确定（可能 UTC、可能 CST）：按服务器本地时区分天的话，
   * 同一份代码在两台机器上"今天"不是同一天，额度会在莫名其妙的时刻重置 ✗。
   * 业务日 = 北京时间的自然日，写死它、并用 Intl 算（不猜 offset）。
   */
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * 日期串 → 写进 `DATE` 列的值。
 *
 * 取当天 **12:00 UTC**：`@db.Date` 只存年月日，而 Postgres 在写 DATE 时
 * 会按会话时区做一次换算 —— 用 00:00Z 的话，在 UTC-5 这类时区的机器上
 * 会退回前一天 ✗。12:00Z 对 ±12 小时内的任何时区都落在同一天 ✓（生产在 +8）。
 */
export function toHealthExtractionUsageDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

export interface HealthExtractionDailyUsage {
  /** 当天的上限；0 = 不限量 */
  limit: number;
  /** 到今天为止用掉几次（含这一次） */
  used: number;
  /** 北京时间的那一天 */
  dateKey: string;
}

@Injectable()
export class HealthExtractionQuotaService {
  private readonly logger = new Logger(HealthExtractionQuotaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /**
   * 占一次额度；到上限了直接抛 429（中文）。
   *
   * ⚠️ 调用点必须在**调模型之前**，见文件头 ①。
   *
   * ── 计数出错时一律**放行**（fail-open），只记一行 warn ──────────────────
   * 本模块的硬规矩是"识别失败绝不卡住顾客"，防刷是**次要目标**：
   * 万一是计数表还没迁移 / 权限不对，正确答案是"照常识别 + 日志喊人来看"，
   * 而不是把整个识别功能关掉 ✗（那是把防刷做成了全站不可用）。
   * ⚠️ 但"到上限"这条判断本身**绝不放过** —— 它是真值，不是错误 ✓。
   */
  async assertWithinDailyLimit(): Promise<HealthExtractionDailyUsage> {
    const limit = await this.readDailyLimit();
    const dateKey = resolveHealthExtractionUsageDateKey();
    const usageDate = toHealthExtractionUsageDate(dateKey);
    const capped = limit > 0;

    // ① 当天第一次：直接建这一行（usedCount = 1）
    try {
      await this.prisma.healthExtractionDailyUsage.create({
        data: {
          usageDate,
          scope: HEALTH_EXTRACTION_SCOPE,
          usedCount: 1,
        },
      });
      return { limit, used: 1, dateKey };
    } catch {
      /**
       * 走到这里最常见的原因是主键冲突（今天已经有人建过这一行）——
       * 这是**正常路径**，不是错误；其它异常（表不存在等）由下面 ② 的
       * catch 统一处理，一样只记日志、不挡顾客 ✓
       */
    }

    let counted: number | null = null;
    try {
      // ② 只有还没到上限才 +1（一条 UPDATE，并发安全）
      const updated = await this.prisma.healthExtractionDailyUsage.updateMany({
        where: {
          usageDate,
          scope: HEALTH_EXTRACTION_SCOPE,
          ...(capped ? { usedCount: { lt: limit } } : {}),
        },
        data: { usedCount: { increment: 1 } },
      });
      counted = updated.count;

      if (capped && updated.count === 0) {
        /**
         * ⚠️ 0 行有两种完全不同的含义，**必须分开**（2026-10-16 自检发现）：
         *   (a) 行在、`used_count >= 上限` → 真的用完了 → 429 ✓
         *   (b) 行**根本不存在** → 说明上面那次 create 不是"今天已经有人建过"，
         *       而是表没迁移 / 权限不对 / 瞬时故障 → 这是**故障**，不是"用完了" ✗
         * 把 (b) 当成 (a) 的后果：计数表一出问题，**所有顾客都识别不了** ✗
         * （与本文件"计数故障要放行"的口径直接矛盾）。所以这里先读一眼那一行。
         */
        const current = await this.readUsedCountOrNull(usageDate);

        if (current !== null && current >= limit) {
          // 到上限了：这一行**没有被改动**，所以被拒的请求不会把计数推高 ✓
          this.logger.warn(
            `[ExtractionQuota] 今天的识别次数已用完（${current}/${limit}，${dateKey}）→ 已拒绝，未调用模型`,
          );
          /**
           * ⚠️ 前缀用 `[ExtractionQuota]` 而不是 `[Extraction][QUOTA]`：
           * `backend/scripts/scan-failure-report.sh` 用 `grep '\[Extraction\]'`
           * 数"总共识别了几次"—— 这一行要是也带 `[Extraction]`，
           * 一次被拒会被数成两次 ✗（识别的成本口径就全错了）。
           *
           * 拒绝原因仍然挂在异常里：外层那行 `[Extraction][FAIL]` 会写
           * `limit/used` 与 reason，两个一起看就知道"是用完了"还是"出故障了" ✓
           */
          const rejection = new HttpException(
            HEALTH_EXTRACTION_QUOTA_MESSAGE,
            HttpStatus.TOO_MANY_REQUESTS,
          );
          (
            rejection as HttpException & { quota?: HealthExtractionDailyUsage }
          ).quota = { limit, used: current, dateKey };
          throw rejection;
        }

        this.logger.warn(
          `[ExtractionQuota] 这一次没计上数（${
            current === null ? '当天那一行不存在' : `当前 ${current}/`
          }上限 ${limit}）→ 本次放行：计数表可能有问题，请查 health_extraction_daily_usage`,
        );
      }
    } catch (error) {
      // ⚠️ 到上限那个 429 要原样抛出去（它是判断结果，不是故障）
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn(
        `[ExtractionQuota] 计数失败，本次放行（上限暂时管不住，请查 health_extraction_daily_usage）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      limit,
      used: counted === null ? 0 : await this.readUsedCount(usageDate),
      dateKey,
    };
  }

  /** 今天用掉几次（只读，给日志/排查用；不会改动计数） */
  async getTodayUsage(): Promise<HealthExtractionDailyUsage> {
    const limit = await this.readDailyLimit();
    const dateKey = resolveHealthExtractionUsageDateKey();
    return {
      limit,
      used: await this.readUsedCount(toHealthExtractionUsageDate(dateKey)),
      dateKey,
    };
  }

  /**
   * 读当天上限。读不到（配置表故障）→ 用内置默认 500 并记一行 warn：
   * 上限读不到也不该挡住顾客（同上，fail-open）✓
   */
  private async readDailyLimit(): Promise<number> {
    try {
      return await this.globalConfigService.getHealthExtractionDailyLimit();
    } catch (error) {
      this.logger.warn(
        `[ExtractionQuota] 每日上限读不到，按默认 ${DEFAULT_HEALTH_EXTRACTION_DAILY_LIMIT} 次处理：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return DEFAULT_HEALTH_EXTRACTION_DAILY_LIMIT;
    }
  }

  /**
   * 读当前计数；读不到（当天还没有记录）算 0。
   *
   * ⚠️ 它也**不许抛错**（2026-10-16）：这个数字只是写进日志用的，
   * 为了"日志里那个 used 读不到"而把顾客的识别弄挂，是本末倒置 ✗
   * （同上，fail-open 的完整含义：计数这条链上任何一环故障都不挡识别）
   */
  private async readUsedCount(usageDate: Date): Promise<number> {
    return (await this.readUsedCountOrNull(usageDate)) ?? 0;
  }

  /**
   * 读当前计数；**那一行不存在时返回 null**（不是 0）——
   * "行不存在"和"这一天用了 0 次"是两回事，判上限时不能混 ✗
   * （见 assertWithinDailyLimit 里 0 行那段）。读挂了也返回 null，不抛错。
   */
  private async readUsedCountOrNull(usageDate: Date): Promise<number | null> {
    try {
      const row = await this.prisma.healthExtractionDailyUsage.findUnique({
        where: {
          usageDate_scope: {
            usageDate,
            scope: HEALTH_EXTRACTION_SCOPE,
          },
        },
        select: { usedCount: true },
      });

      return row?.usedCount ?? null;
    } catch (error) {
      this.logger.warn(
        `[ExtractionQuota] 当天用量读不到（日志里那个 used 会显示 0）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
