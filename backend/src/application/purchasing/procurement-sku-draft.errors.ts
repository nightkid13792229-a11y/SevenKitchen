/**
 * 「这条消息必须让员工看到」的专用异常（2026-11-01）。
 *
 * 为什么不用 `BadRequestException` 本身做判据：识别链路上**两种 400**含义完全不同 ——
 * 
 *   · 「这张图不是商品详情页」「今天的识别次数用完了」→ 员工必须看到，否则他会
 *     反复重传同一张图，或者不知道识别为什么突然不工作了；
 *   · 「DeepSeek 设置未启用」「API Key 未配置」→ 这是系统配置问题，员工看了也做不了
 *     什么，应该安静地退回手填（老板定的 A2：不阻断员工）。
 *
 * 早期实现用 `instanceof BadRequestException` 一刀切，结果第二种也被抛到界面上，
 * 员工看到的是"设置未启用"这种和他无关的错误。
 */

import { BadRequestException } from '@nestjs/common';

export class ProcurementSkuDraftNoticeException extends BadRequestException {}
