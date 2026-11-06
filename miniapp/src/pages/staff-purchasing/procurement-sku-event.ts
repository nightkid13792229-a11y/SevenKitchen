/**
 * 「新增采购商品」广播的归属（2026-11-06）。
 *
 * uni.$emit 是全应用广播：页面被压在导航栈里也收得到。
 * 以前从识别结果页新建商品，下面的日采清单详情页也会收到，
 * 于是它按自己那套「新增完商品 → 打开添加采购记录抽屉」的逻辑把抽屉打开了；
 * 员工确认生成记录、退回详情页，就看到一个自己没点过的抽屉。
 *
 * 现在新建商品页把「谁让我建的」原样广播回来（from），
 * 每个页面只处理自己发起的广播，其余一律忽略。
 */
export type SkuCreateSource = 'detail' | 'order-import' | 'record-form';

const SOURCES: SkuCreateSource[] = ['detail', 'order-import', 'record-form'];

/** 路由上的 from 参数只认已知页面，其余（旧链接、手改参数）一律当没带。 */
export function normalizeSkuCreateSource(value: unknown): SkuCreateSource | '' {
  const raw = String(value ?? '').trim();
  return (SOURCES as string[]).includes(raw) ? (raw as SkuCreateSource) : '';
}

/** 这条广播是不是我发起的；没有 from 的历史广播谁都不认。 */
export function isSkuCreatedFor(payload: any, source: SkuCreateSource): boolean {
  return payload?.from === source;
}

/** 跳新增商品页时统一拼来源参数。 */
export function buildSkuCreateQuery(source: SkuCreateSource): string {
  return `from=${source}`;
}
