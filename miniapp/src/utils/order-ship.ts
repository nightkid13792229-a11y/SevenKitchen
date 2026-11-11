/**
 * 发货抽屉顶部那一行「狗狗」（2026-11-11）。
 *
 * 一单可能有多个明细、绑了不同的狗；寄件时要一次看清寄给谁家的哪几只，
 * 所以按狗去重后拼成「名字 · 品种 · 体重」，多只之间用「；」隔开。
 *
 * 详情页和订单中心列表都从这里取，别各拼一套（以前详情页自己写了一份）。
 */

export interface ShipDogLike {
  id?: string | null;
  name?: string | null;
  breedName?: string | null;
  weightKg?: number | string | null;
}

export function buildShipDogSummary(
  items?: Array<{ dog?: ShipDogLike | null }> | null,
): string {
  if (!Array.isArray(items)) return '';

  const seen = new Map<string, ShipDogLike>();
  items.forEach((item) => {
    const dog = item?.dog;
    const key = String(dog?.id || dog?.name || '');
    if (dog && key && !seen.has(key)) seen.set(key, dog);
  });

  return Array.from(seen.values())
    .map((dog) =>
      [dog.name, dog.breedName, dog.weightKg ? `${dog.weightKg}kg` : '']
        .filter(Boolean)
        .join(' · '),
    )
    .filter(Boolean)
    .join('；');
}
