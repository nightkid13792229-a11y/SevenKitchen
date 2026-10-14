import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { globSync } from 'node:fs';

/**
 * ══ 模板里不许对 ref 写 `.value`（2026-10-14 老板报的 bug）════════════════
 *
 * 老板："另外一个问题是修改的按钮并没有办法点击。"
 *
 * 根因：`VaccineRecordCard.vue` 的模板里写成了
 *
 *     v-if="hasComponentSelection() && !kindPickerOpen.value"
 *
 * 而 Vue 3 `<script setup>` 的模板里 **ref 会自动解包** ——
 * 所以 `kindPickerOpen.value` 取到的是 `undefined`，
 * `!undefined` **恒为真** ✗：点「修改」确实把 kindPickerOpen 设成了 true，
 * 可条件读的是 undefined、恒真 → 界面**毫无变化** ✗，看着就像点不动 ✗。
 *
 * ⚠️ 更糟的是：当时还有一条断言**把错误写法当成正确的规矩**钉着
 *    （"模板里 ref 不会自动解包，要写 .value"）—— 测试反而锁死了 bug ✗。
 *    那条已经改正。
 *
 * 这类 bug 特别难发现：**不报错、不崩**，只是"点了没反应" ✗。
 * 所以固化成一条全局扫描。
 */
describe('Vue 模板 · ref 不许写 .value（2026-10-14 老板报的 bug）', () => {
  const SRC = resolve(process.cwd(), 'src');

  it('🔴 模板里对 ref 的引用一律不写 `.value`', () => {
    const files = globSync('**/*.vue', { cwd: SRC });
    const offenders: string[] = [];

    for (const file of files) {
      const raw = readFileSync(resolve(SRC, file), 'utf-8');
      const scriptMatch = /<script[^>]*>([\s\S]*?)<\/script>/.exec(raw);
      const templateMatch = /<template>([\s\S]*?)<\/template>\s*(?=<script|<style|$)/.exec(raw);
      if (!scriptMatch || !templateMatch) continue;

      // ① 脚本里找出真正的 ref / computed 变量名
      const refs = new Set(
        Array.from(
          scriptMatch[1].matchAll(
            /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:ref|shallowRef|computed)\s*[<(]/g,
          ),
          (m) => m[1],
        ),
      );
      if (refs.size === 0) continue;

      // ② 看模板里有没有对这些名字写 `.value`
      //    （`option.value` / `detail.value` 这类是对象属性，合法 ✓）
      const tpl = templateMatch[1].replace(/<!--[\s\S]*?-->/g, '');
      for (const m of tpl.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*value\b/g)) {
        if (refs.has(m[1])) {
          offenders.push(`${file}: ${m[1]}.value`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
