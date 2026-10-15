/**
 * 用生产库的真实食材名单，复核「过敏避雷」闸门是否会通过。
 * 判据与 prisma/seed-allergen-vocabulary.ts 的白名单把关完全一致：
 *   未标注过敏原的食材，必须出现在 REVIEWED_NON_ALLERGEN_INGREDIENTS 里。
 * 只读名单文件，不连任何数据库。
 */
import { readFileSync } from 'node:fs';
import {
  INGREDIENT_ALLERGEN_MAP,
  REVIEWED_NON_ALLERGEN_INGREDIENTS,
} from '../../backend/prisma/seed-allergen-vocabulary';

const names = readFileSync('/tmp/prod-food-ingredients.txt', 'utf8')
  .split('\n')
  .map((s) => s.trim())
  .filter(Boolean);

const mapped = new Set(Object.keys(INGREDIENT_ALLERGEN_MAP));
const reviewed = new Set(REVIEWED_NON_ALLERGEN_INGREDIENTS);

const unmapped = names.filter((n) => !mapped.has(n));
const unreviewed = unmapped.filter((n) => !reviewed.has(n));

console.log(`生产库 FOOD 食材: ${names.length}`);
console.log(`已标过敏原: ${names.length - unmapped.length}`);
console.log(`未标过敏原: ${unmapped.length}（预期：蔬菜/水果/菌菇/油脂/种子类）`);
console.log(`其中不在「已复核」清单里的: ${unreviewed.length}`);
console.log('油麦菜是否已列入复核清单:', reviewed.has('油麦菜'));
if (unreviewed.length > 0) {
  console.log('');
  console.log('❌ 会让脚本失败的食材:', unreviewed.join('、'));
  process.exit(1);
}
console.log('');
console.log('✅ 闸门通过：所有未标注食材都在「已人工复核」清单里。');
