import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 采购管理 · 可读性守门人（P3）
 *
 * 2026-11-02 的审核里，最严重的一类问题是"文字色 = 底色"（对比度 1.0），
 * 以及金底黑字这类低对比组合。这些在截图里很显眼，但代码里只是一行色值，
 * 很容易在下次改色时再次出现。
 *
 * 这个测试直接读 8 个页面的 <style>，对"同一条规则里同时声明 color 与
 * background"的组合做 WCAG 对比度计算：
 *   - 普通文字 ≥ 4.5 : 1
 *   - ≥36rpx 或 ≥28rpx 加粗（大字）≥ 3 : 1
 * 并单独拦截 color === background。
 *
 * 不覆盖继承底色（父级背景），那是截图与走查负责的部分。
 */

const PAGES = [
  'staff-purchasing/index.vue',
  'staff-purchasing/detail.vue',
  'staff-purchasing/preview.vue',
  'staff-purchasing/stock-create.vue',
  'staff-purchasing/record-form.vue',
  'staff-purchasing/reimbursement/list.vue',
  'staff-purchasing/reimbursement/submit.vue',
  'staff-purchasing/reimbursement/detail.vue',
  'staff-production/index.vue',
  'staff-production/detail.vue',
  'staff-production/components/SupplementPacking.vue',
  'staff-inventory/index.vue',
  'staff-inventory/stocktake-create.vue',
  'staff-inventory/stocktake-records.vue',
  'staff-inventory/stocktake-result.vue',
  'staff-inventory/components/AdjustmentSheet.vue',
  'staff-inventory/components/InventoryDrawer.vue',
];

const readPage = (path: string) =>
  readFileSync(resolve(__dirname, path), 'utf8');

const luminance = (hex: string) => {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const [r, g, b] = [0, 2, 4].map(
    (offset) => parseInt(full.slice(offset, offset + 2), 16) / 255,
  );
  const channel = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (foreground: string, background: string) => {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
};

interface Rule {
  selector: string;
  body: string;
}

const extractRules = (css: string): Rule[] => {
  const rules: Rule[] = [];
  const regex = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    const selector = match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .pop();
    if (!selector) continue;
    rules.push({ selector, body: match[2] });
  }
  return rules;
};

const explicitPairs = (rule: Rule) => {
  const color = rule.body.match(
    /(?<!background-)(?<!border-)color:\s*(#[0-9a-fA-F]{3,6})\s*;/,
  )?.[1];
  if (!color) return [];

  const gradient = rule.body.match(
    /background(?:-color)?:\s*linear-gradient\(([^;]*)\)/,
  )?.[1];
  if (gradient) {
    return [...gradient.matchAll(/#[0-9a-fA-F]{3,6}/g)].map((m) => m[0]);
  }

  const background = rule.body.match(
    /background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})\s*;/,
  )?.[1];

  return background ? [background] : [];
};

const isLargeText = (rule: Rule) => {
  const size = Number(rule.body.match(/font-size:\s*(\d+)rpx/)?.[1] || 28);
  const weight = rule.body.match(/font-weight:\s*(\d+|bold)/)?.[1];
  const bold = weight === 'bold' || Number(weight) >= 600;
  return size >= 36 || (size >= 28 && bold);
};

describe('采购管理 UI 可读性守门人', () => {
  it('不存在"文字色 = 底色"的规则', () => {
    const offenders: string[] = [];

    PAGES.forEach((path) => {
      const source = readPage(path);
      const css = source.slice(source.indexOf('<style'));
      extractRules(css).forEach((rule) => {
        const color = rule.body.match(
          /(?<!background-)(?<!border-)color:\s*(#[0-9a-fA-F]{3,6})\s*;/,
        )?.[1];
        const background = rule.body.match(
          /background(?:-color)?:\s*(#[0-9a-fA-F]{3,6})\s*;/,
        )?.[1];
        if (
          color &&
          background &&
          color.toLowerCase() === background.toLowerCase()
        ) {
          offenders.push(`${path} → ${rule.selector} (${color})`);
        }
      });
    });

    expect(offenders).toEqual([]);
  });

  it('显式声明的"文字 / 底色"组合达到 WCAG AA', () => {
    const offenders: string[] = [];

    PAGES.forEach((path) => {
      const source = readPage(path);
      const css = source.slice(source.indexOf('<style'));
      extractRules(css).forEach((rule) => {
        if (/\[disabled\]|\.disabled/.test(rule.selector)) return;

        const color = rule.body.match(
          /(?<!background-)(?<!border-)color:\s*(#[0-9a-fA-F]{3,6})\s*;/,
        )?.[1];
        if (!color) return;

        const threshold = isLargeText(rule) ? 3 : 4.5;
        explicitPairs(rule).forEach((background) => {
          const ratio = contrast(color, background);
          if (ratio < threshold) {
            offenders.push(
              `${path} → ${rule.selector} ${color} on ${background} = ${ratio.toFixed(2)} (need ${threshold})`,
            );
          }
        });
      });
    });

    expect(offenders).toEqual([]);
  });

  it('每个页面的固定底栏都带安全区留白', () => {
    const offenders: string[] = [];

    PAGES.forEach((path) => {
      const source = readPage(path);
      if (!/position:\s*fixed/.test(source)) return;

      // 只有贴底的操作栏需要安全区；全屏弹窗遮罩不需要。
      const hasBottomBar = /\.(bottom|detail-progress|bottom-actions|bottom-action|bottom-bar)[^{]*\{[^}]*position:\s*fixed/s.test(
        source,
      );
      if (hasBottomBar && !source.includes('env(safe-area-inset-bottom)')) {
        offenders.push(path);
      }
    });

    expect(offenders).toEqual([]);
  });
  it('库存页不写页内大标题（标题只出现一次）', () => {
    const offenders = PAGES.filter((path) =>
      path.startsWith('staff-inventory'),
    ).filter((path) => /<h1|class="page-title"|class="title"/.test(readPage(path)));

    expect(offenders).toEqual([]);
  });

  it('库存页最小字号不小于 24rpx', () => {
    const offenders: string[] = [];

    PAGES.filter((path) => path.startsWith('staff-inventory')).forEach(
      (path) => {
        const source = readPage(path);
        for (const match of source.matchAll(/font-size:\s*(\d+)rpx/g)) {
          if (Number(match[1]) < 24) {
            offenders.push(`${path} → ${match[1]}rpx`);
          }
        }
      },
    );

    expect(offenders).toEqual([]);
  });
});
