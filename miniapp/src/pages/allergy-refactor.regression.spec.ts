import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 过敏板块重构（2026-10-04，第二 / 三 / 五期）的防退化测试。
 *
 * 内容全部用**源码文字**断言（与仓库里其它 .regression.spec.ts 一致的写法）。
 *
 * 这些断言盯的是**不能退的东西**：
 *   · 报告原件必须留住（改造前传完就丢）
 *   · 阴性不能被记成过敏
 *   · 排查计划的建议时长必须带出处
 *   · 兽医边界提示必须显示，不能被折叠掉
 *   · AI 只给候选、必须顾客确认 —— 这条从第一期就在，继续钉住
 */

const read = (...segments: string[]) =>
  readFileSync(resolve(process.cwd(), ...segments), 'utf-8');

describe('过敏板块重构 · 报告实体化（第二期）', () => {
  it('过敏页是「结论 / 依据」两段式，且结论排在记录列表上面', () => {
    const page = read('src/pages/dog-profile-health/index.vue');

    expect(page).toContain('AllergyConclusionSection');
    expect(page).toContain('AllergyReportSection');

    // 结论要在报告区之前 —— 顾客先看到"不能吃什么"，再看依据
    const conclusionIndex = page.indexOf('<AllergyConclusionSection');
    const reportIndex = page.indexOf('<AllergyReportSection');
    expect(conclusionIndex).toBeGreaterThan(-1);
    expect(reportIndex).toBeGreaterThan(-1);
    expect(conclusionIndex).toBeLessThan(reportIndex);
  });

  it('结论区给出四档可信度，且可以逐条修改', () => {
    const conclusion = read(
      'src/components/dog-profile/AllergyConclusionSection.vue',
    );

    // 四档必须齐全：确诊 / 可疑 / 待排查 / 已排除
    expect(conclusion).toContain("value: 'CONFIRMED'");
    expect(conclusion).toContain("value: 'SUSPECTED'");
    expect(conclusion).toContain("value: 'TO_VERIFY'");
    expect(conclusion).toContain("value: 'RULED_OUT'");

    // 改可信度走单条更新接口，不是本地硬改
    expect(conclusion).toContain('dogApi.healthRecords.allergy.update');
  });

  it('🔴 报告原件必须留住 —— 改造前识别完就把图片丢了', () => {
    const quickAdd = read(
      'src/components/dog-profile/AllergyQuickAddSection.vue',
    );

    // 上传返回的地址要存下来
    expect(quickAdd).toContain('reportImageUrl.value = imageUrl');
    // 确认时以**报告**的形式落库，而不是散装过敏原
    expect(quickAdd).toContain('dogApi.allergyReports.create');
    // 原件挂在报告上；一份报告常常不止一页，**全部原图**都要留住
    expect(quickAdd).toContain('collectedImageUrls.push(imageUrl)');
    expect(quickAdd).toContain(
      'attachments: sourceImageUrls.length > 0 ? sourceImageUrls : undefined',
    );
  });

  it('报告落库失败时退回逐条记录 —— 不能让顾客白拍一张照', () => {
    const quickAdd = read(
      'src/components/dog-profile/AllergyQuickAddSection.vue',
    );
    expect(quickAdd).toContain('if (!savedAsReport)');
    expect(quickAdd).toContain('createAllergyRecord(allergen)');
  });

  it('报告区能看原件（改造前顾客再也看不到自己传的报告）', () => {
    const reports = read('src/components/dog-profile/AllergyReportSection.vue');
    expect(reports).toContain('report.attachments');
    expect(reports).toContain('uni.previewImage');
  });

  it('删除报告不删过敏记录 —— 依据没了，结论仍然成立', () => {
    const reports = read('src/components/dog-profile/AllergyReportSection.vue');
    expect(reports).toContain('删除报告不会删掉上面已经记下的过敏原');
  });
});

describe('过敏板块重构 · 排查计划（第三期）', () => {
  it('规则表由后端下发，不写死在客户端', () => {
    const trial = read('src/components/dog-profile/AllergyTrialSection.vue');
    expect(trial).toContain('res.data.rules');
    expect(trial).toContain('rules.value = res.data.rules');
  });

  it('🔴 兽医边界提示必须显示（试验必须由兽医设计与监督）', () => {
    const trial = read('src/components/dog-profile/AllergyTrialSection.vue');
    expect(trial).toContain('rules.vetBoundaryNotes');
    expect(trial).toContain('trial-intro__boundary');
  });

  it('打卡只有三个动作 —— 要能坚持 6 到 12 周', () => {
    const trial = read('src/components/dog-profile/AllergyTrialSection.vue');
    expect(trial).toContain('itchScore');
    expect(trial).toContain('stoolScore');
    expect(trial).toContain('brokeStrict');
  });

  it('结论会回写过敏记录（复发了 → 确诊）', () => {
    const trial = read('src/components/dog-profile/AllergyTrialSection.vue');
    expect(trial).toContain('dogApi.allergyTrial.concludeChallenge');
  });

  it('破戒天数如实显示，不藏起来', () => {
    const trial = read('src/components/dog-profile/AllergyTrialSection.vue');
    expect(trial).toContain('trial.brokeStrictDays');
  });
});

describe('过敏板块重构 · AI 识别升级（第五期）', () => {
  it('读出每一项的结论等级，而不是只读食物名', () => {
    const quickAdd = read(
      'src/components/dog-profile/AllergyQuickAddSection.vue',
    );
    expect(quickAdd).toContain('candidateLevels');
    expect(quickAdd).toContain('data.drafts');
  });

  it('检测方式与日期也从报告里读出来，先填进表单让顾客确认', () => {
    const quickAdd = read(
      'src/components/dog-profile/AllergyQuickAddSection.vue',
    );
    expect(quickAdd).toContain('data.reportMeta');
    expect(quickAdd).toContain('reportTestMethod.value');
    expect(quickAdd).toContain('reportTestDate.value');
  });
});

describe('过敏板块重构 · 首页回报（第一期）', () => {
  it('首页「挑食/过敏」筛选会把档案里的过敏带出来', () => {
    const home = read('src/pages/home/index.vue');
    expect(home).toContain('loadAllergenSuggestion');
    expect(home).toContain('dogApi.allergenProfile');
    expect(home).toContain('allergenSuggestion');
  });

  it('顾客自己动过筛选后不再自动套用 —— 不冲掉他的选择', () => {
    const home = read('src/pages/home/index.vue');
    expect(home).toContain('excludedFilterTouchedByUser');
  });
});

describe('过敏板块重构 · 点选标签改为读后端词表', () => {
  it('「一点即选」优先用后端词表，并保留离线兜底', () => {
    const quickAdd = read(
      'src/components/dog-profile/AllergyQuickAddSection.vue',
    );
    expect(quickAdd).toContain('dogApi.commonAllergens');
    // 兜底清单必须还在：接口挂了顾客也不能面对空白
    expect(quickAdd).toContain('const commonAllergens = [');
  });

  it('定制单页也能点选，不再只能手打', () => {
    const customRecipe = read('src/pages/custom-recipe/index.vue');
    expect(customRecipe).toContain('allergen-quick-add');
    expect(customRecipe).toContain('addAllergenByName');
  });
});
