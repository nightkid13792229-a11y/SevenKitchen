import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('定制下单页 · 长页面进度（2026-10-25）', () => {
  const page = read('src/pages/custom-recipe/index.vue');

  it('★ 四个必填门槛有顶部进度条，可点跳转', () => {
    expect(page).toContain('class="form-progress"');
    expect(page).toContain('formProgressSteps');
    expect(page).toContain('scrollToCustomSection(step.selector)');
    expect(page).toContain("label: '体况门槛'");
    expect(page).toContain("label: '体重方向'");
    expect(page).toContain("label: '过敏'");
    expect(page).toContain("label: '饲喂历史'");
  });

  it('★ 进度条只做提示，不替代提交校验', () => {
    expect(page).toContain('只用于顶部进度感，不参与提交校验');
    expect(page).toContain('validateCustomRecipeForm');
  });

  it('★ 进度条吸顶，不让长页面滚丢', () => {
    expect(page).toContain('position: sticky');
    expect(page).toContain('form-progress__step--done');
    expect(page).toContain('form-progress__step--active');
    expect(page).toContain('offsetTop: uni.upx2px(96)');
  });
});
