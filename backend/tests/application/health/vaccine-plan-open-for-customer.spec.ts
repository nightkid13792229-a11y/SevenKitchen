import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildVaccinePlan } from '../../../src/domain/health/immunization-schedule';

/**
 * 按审核通过的标准对顾客开放（2026-10-06 老板定）。
 *
 * 老板原话："疫苗标签页中『本计划仍在做专业审核，暂不对顾客开放…』这句话删除掉。
 * 同时看一下后端是否有什么卡点，也请取消，我们现在就按审核通过的标准部署。"
 *
 * 原来有两道卡：① 前端底部那句"仍在做专业审核"；② 后端 VACCINE_PLAN
 * 环境变量开关，没开就回 available:false。两道一起取消。
 */
describe('疫苗计划 · 按审核通过的标准对顾客开放（2026-10-06）', () => {
  const service = () =>
    readFileSync(
      resolve(
        process.cwd(),
        'src/application/health/vaccine-plan.service.ts',
      ),
      'utf-8',
    );

  it('🔴 后端不再有"未开放"那条路', () => {
    const source = service();

    expect(source).not.toContain('isVaccinePlanCustomerEnabled');
    expect(source).not.toContain('available: false');
    expect(source).not.toContain('isCustomerEnabled');
    // 顾客拿到的计划直接标成已审核
    expect(source).toContain('reviewed: true');
    expect(source).not.toContain('reviewed: false');
  });

  it('环境变量开关本身也删掉了（留个随时能关的开关会让线上状态说不清）', () => {
    const domain = readFileSync(
      resolve(process.cwd(), 'src/domain/health/immunization-schedule.ts'),
      'utf-8',
    );

    expect(domain).not.toContain('export function isVaccinePlanCustomerEnabled');
    expect(domain).not.toContain("=== 'customer'");
  });

  it('每一步都带"疫苗种类"的中文名（前端不再自己维护一份映射）', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: '2026-02-01',
      records: [],
      today: new Date('2026-10-06'),
      reviewed: true,
    });

    expect(plan.steps.length).toBeGreaterThan(0);
    for (const step of plan.steps) {
      expect(typeof step.kindLabel).toBe('string');
      expect(step.kindLabel.length).toBeGreaterThan(0);
      // 中文名来自那份闭集定义，不是把英文 key 直接丢出来
      expect(step.kindLabel).not.toBe(step.kind);
    }
  });

  it('狂犬那一步的种类就叫「狂犬疫苗」', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: '2026-02-01',
      records: [],
      today: new Date('2026-10-06'),
      reviewed: true,
    });

    const rabies = plan.steps.find((step) => step.kind === 'rabies');
    expect(rabies).toBeTruthy();
    expect(rabies?.kindLabel).toBe('狂犬疫苗');
  });
});
