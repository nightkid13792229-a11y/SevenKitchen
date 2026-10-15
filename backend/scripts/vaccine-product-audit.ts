/**
 * 产品库分类体检（老板 2026-10-12 第 2 问）
 * 用法：cd backend && npx ts-node -T scripts/vaccine-product-audit.ts
 */
import { VACCINE_PRODUCTS, kindsOfComponents } from '../src/domain/health/vaccine/products';

const KIND_CN: Record<string, string> = {
  core_early: '早期核心',
  core: '核心',
  lepto: '钩端',
  rabies: '狂犬',
  other: '其他',
};

let otherCount = 0, noComponent = 0, coreOnly = 0, combo = 0;
const lines: string[] = [];

for (const p of VACCINE_PRODUCTS) {
  const kinds = p.kinds && p.kinds.length > 0 ? p.kinds : kindsOfComponents(p);
  const label = kinds.map((k) => KIND_CN[k] || k).join(' + ');
  const flags: string[] = [];
  if (!p.components || p.components.length === 0) { flags.push('⚠️ 无成分数据'); noComponent += 1; }
  if (kinds.includes('other')) { flags.push('（非核心/非钩端/非狂犬，按老板口径不用管）'); otherCount += 1; }
  if (kinds.length === 1 && kinds[0] === 'core') coreOnly += 1;
  if (kinds.length > 1) combo += 1;
  lines.push(`| ${p.name} | ${label} | ${p.recommendable === false ? '国产·不推荐' : '推荐'} | ${flags.join(' ')} |`);
}

console.log(`共 ${VACCINE_PRODUCTS.length} 支：多联（含两种以上分类）${combo} 支｜纯核心 ${coreOnly} 支｜其他类 ${otherCount} 支｜无成分数据 ${noComponent} 支\n`);
console.log('| 产品 | 分类 | 推荐状态 | 备注 |');
console.log('|---|---|---|---|');
console.log(lines.join('\n'));
