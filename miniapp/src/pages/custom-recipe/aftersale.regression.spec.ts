import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 售后页 · 守卫（2026-10-16，批次 2.5）
 *
 * ## 这一页最容易出的两类错
 *
 * **一、把类型写死在前端。** 售后类型本来就在选项字典里
 * （`custom_recipe_aftersale_type`），老板加一类"要发票"不该要发版。
 *
 * **二、把原因编成通用文案。** 后端会说"已超过售后受理期（交付后 30 天内）"，
 * 而前端很容易顺手写一句"提交失败，请稍后重试" ——
 * 顾客看完还是不知道自己为什么提不了。
 */

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

/**
 * 剥掉注释再断言。
 *
 * ⚠️ **本项目在这件事上被坑过 4 次**：断言的是源码字符串，
 * 结果自己写的注释把断言骗过去了（或者反过来，注释里的字样让守卫误报）。
 *
 * 这次就是后者：页面顶部注释里写了「问个问题 / 调整食谱 / 其他意见」
 * 作为说明，守卫却把它当成了"把类型写死在页面里"。
 * **守卫该断的是代码，不是注释。**
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

describe('售后页 · 类型与原因都来自后端', () => {
  // 剥注释：断言的是代码，不是注释（见 stripComments 的说明）
  const page = stripComments(read('src/pages/custom-recipe/aftersale.vue'));

  it('★ 类型选项来自选项字典，不写死在前端', () => {
    expect(page).toContain('fetchAftersaleTypes');
    expect(page).toContain('typeOptions');

    // 不许把三个类型的中文抄进页面
    expect(page).not.toContain('问个问题');
    expect(page).not.toContain('调整食谱');
    expect(page).not.toContain('其他意见');
  });

  it('★ 提交失败时显示**后端给的原因**，不是通用文案', () => {
    expect(page).toContain('result.message');
    // 这句是后端说的，页面只负责显示
    expect(page).not.toContain('提交失败，请稍后重试');
  });

  it('★ 能不能撤回由后端算好（页面不判断状态）', () => {
    expect(page).toContain('item.canCancel');
    // 不许在页面里写状态判断
    expect(page).not.toContain("status === 'PENDING'");
    expect(page).not.toContain("status === 'PROCESSING'");
  });

  it('进度节点与文案由后端下发', () => {
    expect(page).toContain('item.progress.timeline');
    expect(page).toContain('step.label');
  });

  it('客服的处理说明与驳回原因如实显示', () => {
    expect(page).toContain('item.handleNote');
    expect(page).toContain('item.rejectReason');
  });

  it('页面里的"能不能提交"只是省一次往返，真正的拦截在后端', () => {
    // 页面靠 canCancel 判断"有没有未处理完的"，而后端也会拦重复提交
    expect(page).toContain('canSubmitNew');
    const api = stripComments(read('src/api/custom-recipe.ts'));
    expect(api).toContain('/aftersale');
  });

  it('订单详情的售后入口在食谱卡上，状态与文案来自后端', () => {
    const detail = stripComments(
      read('src/pages/custom-recipe/order-detail.vue'),
    );
    expect(detail).toContain('aftersaleAction');
    expect(detail).toContain("findAction(order.value.renderable, 'APPLY_AFTERSALE')");
    expect(detail).toContain('viewAftersale');
    // 2026-10-24：整单售后卡已移除，入口留在每份食谱卡：
    // 可申请 → 继续调整；已有售后 → 查看进展
    expect(detail).toContain('aftersaleCount > 0 || aftersaleAction?.enabled');
    expect(detail).toContain('继续调整');
    expect(detail).toContain('查看进展');
  });
});
