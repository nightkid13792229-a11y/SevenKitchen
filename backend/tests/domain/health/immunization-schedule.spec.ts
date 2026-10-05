import { buildVaccineCatalog } from '../../../src/domain/health/vaccine-catalog';
import {
  ALL_VACCINE_KINDS,
  CORE_ADULT_BOOSTER,
  addWeeks,
  CORE_PUPPY_SERIES,
  RABIES_SCHEDULE,
  buildImmunizationSchedule,
  buildVaccinePlan,
  classifyVaccineName,
  classifyVaccineKinds,
  detectConflicts,
  isVaccinePlanCustomerEnabled,
  parseDateText,
  toDateText,
  weeksBetween,
  type VaccineRecordLike,
} from '../../../src/domain/health/immunization-schedule';

/**
 * 疫苗计划（2026-10-01，第四期）。
 *
 * 老板的四条要求：
 *   15. 按免疫程序提醒还需要打哪些、什么时候打
 *   16. 首选 WSAVA 指南，结合国内法规；**引导顾客自己决策**
 *   17. 顾客计划与我们不一致时提醒
 *   18. 提醒只在小程序内
 *
 * 这组测试锁的是**推算逻辑**与**安全边界**：
 *   · 一只 10 岁的老狗不该被提示"幼犬首免已逾期"
 *   · 已经打过的针不该被重复提醒
 *   · 顾客选择"不做"的那一步不再报逾期（尊重决定）
 *   · 顾客侧默认关闭（未经专业审核不得开放）
 */
describe('疫苗计划', () => {
  const TODAY = new Date('2026-10-01T00:00:00');

  function dog(ageWeeks: number) {
    const birthday = new Date(TODAY.getTime() - ageWeeks * 7 * 86400000);
    return toDateText(birthday);
  }

  function record(id: string, name: string, date: string, nextDueDate?: string): VaccineRecordLike {
    return { id, vaccineName: name, vaccinationDate: date, nextDueDate: nextDueDate ?? null };
  }

  describe('疫苗名分类', () => {
    it('认得出的按真实成分归类', () => {
      expect(classifyVaccineName('狂犬疫苗')).toBe('rabies');
      expect(classifyVaccineName('Rabies')).toBe('rabies');
      expect(classifyVaccineName('卫佳伍')).toBe('core');
      // 联数写法也要认 —— 产品目录只收进口苗，"六联"是顾客的常态写法
      expect(classifyVaccineName('六联')).toBe('core');
      expect(classifyVaccineName('犬四联')).toBe('core');
      expect(classifyVaccineName('犬瘟热')).toBe('core');
    })

    it('🔴 认不出来的一律**不猜**（2026-10-05）', () => {
      // 以前这里是"不认识就当核心苗"，后果很严重：
      // 一针驱虫药、一支非核心的犬窝咳，只要日期落在窗口里，
      // 就会把核心苗的某一针标记成**已完成** —— 我们从此不再提醒，
      // 而且没人看得出来为什么。
      expect(classifyVaccineName('随便写点什么')).toBe('other');
      expect(classifyVaccineName('')).toBe('other');
      expect(classifyVaccineKinds('随便写点什么')).toEqual([]);
      expect(classifyVaccineKinds('拜宠清')).toEqual([]); // 那是驱虫药，不是疫苗
    })

    it('非核心、而且我们没有程序的 → other，不参与计划', () => {
      // WSAVA 里犬窝咳、冠状病毒都属于"按生活方式逐只评估"的非核心苗。
      // 记下来是对的，能顶掉核心苗的某一针是错的。
      expect(classifyVaccineKinds('犬窝咳')).toEqual(['other']);
      expect(classifyVaccineKinds('犬冠状病毒')).toEqual(['other']);
      expect(classifyVaccineKinds('莱姆病')).toEqual(['other']);
    })
  })

  describe('幼犬：首免程序', () => {
    it('8 周龄的幼犬，首针正处于应做状态', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(8),
        records: [],
        today: TODAY,
      });

      const first = plan.steps.find((step) => step.key === 'core-puppy-1');
      expect(first).toBeDefined();
      expect(['DUE', 'OVERDUE']).toContain(first!.status);
      expect(plan.nextStep).toBeTruthy();
    })

    it('首免程序覆盖到 16 周龄（不是打满三针就停）', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [],
        today: TODAY,
      });

      const puppySteps = plan.steps.filter((step) => step.key.startsWith('core-puppy-'));
      const lastEnd = puppySteps[puppySteps.length - 1].windowEnd
      // 末针窗口必须落在 16 周龄及以后
      const birthdayDate = parseDateText(plan.birthday)!
      expect(weeksBetween(birthdayDate, parseDateText(lastEnd)!)).toBeGreaterThanOrEqual(14)
    })

    it('每一步都带依据（顾客和审核的人都要能查）', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(8),
        records: [],
        today: TODAY,
      });

      for (const step of plan.steps) {
        expect(step.basis.length).toBeGreaterThan(10);
        expect(step.reminder.length).toBeGreaterThan(0);
      }
    })

    it('已经打过的针不再提醒（窗口内命中记录即算完成）', () => {
      const birthday = parseDateText(dog(20))!;
      const firstDoseDate = toDateText(new Date(birthday.getTime() + 7 * 7 * 86400000));

      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [record('v1', '六联', firstDoseDate)],
        today: TODAY,
      });

      const first = plan.steps.find((step) => step.key === 'core-puppy-1');
      expect(first!.status).toBe('DONE');
      expect(first!.matchedRecordId).toBe('v1');
    })
  })

  describe('成年犬', () => {
    it('10 岁且无任何记录的老狗，不会被提示"幼犬首免已逾期"', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-old',
        birthday: dog(520),
        records: [],
        today: TODAY,
      });

      const puppyOverdue = plan.steps.filter(
        (step) => step.key.startsWith('core-puppy-') && step.status === 'OVERDUE',
      );
      // 十年前的窗口不是"现在该做的事"
      expect(puppyOverdue).toEqual([]);
    })

    it('年幼的狗不会一次列出十几年后的安排', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-puppy',
        birthday: dog(8),
        records: [],
        today: TODAY,
      });

      // 狂犬一共排了 12 次，但只该看到近期的那几次
      const rabies = plan.steps.filter((step) => step.kind === 'rabies');
      expect(rabies.length).toBeLessThan(RABIES_SCHEDULE.maxDoses);
      expect(plan.steps.length).toBeLessThan(20);
    })

    it('成年加强按三年一次排（看完整的免疫程序表，不受"计划过滤"影响）', () => {
      // 计划会过滤掉过期太久与太远的步骤，所以间隔要从**程序表**上看
      const schedule = buildImmunizationSchedule(parseDateText(dog(20))!);
      const adult = schedule.filter((item) => item.key.startsWith('core-adult-'));
      expect(adult.length).toBeGreaterThanOrEqual(CORE_ADULT_BOOSTER.maxBoosters);

      const gapYears =
        (adult[1].windowStart.getTime() - adult[0].windowStart.getTime()) /
        (365 * 86400000);
      expect(Math.round(gapYears)).toBe(CORE_ADULT_BOOSTER.repeatYears);
    })

    it('免疫程序表包含幼犬首免、成年加强、狂犬三类，且每步都有依据', () => {
      const schedule = buildImmunizationSchedule(parseDateText(dog(8))!);

      expect(schedule.some((item) => item.key.startsWith('core-puppy-'))).toBe(true);
      expect(schedule.some((item) => item.key.startsWith('core-adult-'))).toBe(true);
      expect(schedule.some((item) => item.key.startsWith('rabies-'))).toBe(true);
      for (const item of schedule) {
        expect(item.basis.length).toBeGreaterThan(10);
      }
    })

    it('汇总数对得上', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(8),
        records: [],
        today: TODAY,
      });

      const { summary, steps } = plan;
      expect(summary.done + summary.due + summary.overdue + summary.upcoming + summary.skipped)
        .toBe(steps.length);
    })
  })

  describe('引导顾客决策（老板第 16 条）', () => {
    it('顾客选择"不做"的那一步不再报逾期', () => {
      const birthday = dog(8);
      const planWithout = buildVaccinePlan({
        dogId: 'dog-1',
        birthday,
        records: [],
        today: TODAY,
      });
      const target = planWithout.steps.find((step) => step.status !== 'DONE')!;

      const planWith = buildVaccinePlan({
        dogId: 'dog-1',
        birthday,
        records: [],
        decisions: { [target.key]: 'SKIP' },
        today: TODAY,
      });

      const after = planWith.steps.find((step) => step.key === target.key);
      expect(after!.status).toBe('SKIPPED');
      expect(planWith.summary.skipped).toBeGreaterThan(0);
    })

    it('决定原样带在结果里（顾客能看出哪些是自己改过的）', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(8),
        records: [],
        decisions: { 'core-puppy-2': 'DEFER' },
        today: TODAY,
      });

      expect(plan.decisions['core-puppy-2']).toBe('DEFER');
    })

    it('下一步优先给逾期，其次当前', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(30),
        records: [],
        today: TODAY,
      });

      if (plan.summary.overdue > 0) {
        expect(plan.nextStep!.status).toBe('OVERDUE');
      } else {
        expect(['DUE', 'UPCOMING']).toContain(plan.nextStep!.status);
      }
    })
  })

  describe('冲突提醒（老板第 17 条）', () => {
    it('4 周龄以下接种会被标出来', () => {
      const birthday = parseDateText(dog(20))!;
      // 出生后第 2 周就打核心疫苗 —— 早于 4 周龄这条红线
      const tooEarly = toDateText(new Date(birthday.getTime() + 14 * 86400000));

      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [record('v1', '六联', tooEarly)],
        today: TODAY,
      });

      expect(plan.conflicts.length).toBeGreaterThan(0);
      expect(plan.conflicts[0].reason).toContain('4 周龄之前');
    })

    it('4 周龄的那一针不报"过早" —— 那是指南里的正规产品', () => {
      // Table 1："Canine parvovirus-2 (recombinant)+canine distemper virus (MLV)
      //          — Administer a single dose from 4 weeks of age"
      // 家长按兽医建议在 4 周龄打了这一针，回来记录不该被我们标成错误。
      const birthday = parseDateText(dog(20))!;
      const atFourWeeks = toDateText(
        new Date(birthday.getTime() + 28 * 86400000),
      );

      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [record('v1', '幼犬保', atFourWeeks)],
        today: TODAY,
      });

      expect(
        plan.conflicts.filter((item) => item.reason.includes('4 周龄之前')),
      ).toEqual([]);
    })

    it('狂犬两针间隔不足一年会被标出来', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(200),
        records: [
          record('r1', '狂犬疫苗', '2025-01-10'),
          record('r2', '狂犬疫苗', '2025-06-10'),
        ],
        today: TODAY,
      });

      const rabiesConflict = plan.conflicts.find((item) => item.kind === 'rabies');
      expect(rabiesConflict).toBeDefined();
      expect(rabiesConflict!.suggestion).toContain('兽医');
    })

    it('记录里的"下次到期日"与建议对不上时会提示', () => {
      // 2026-10-01 的 200 周龄狗，核心加强窗口在 2026-06 附近；
      // 填一个 8 年后的到期日，明显在按另一套程序走。
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(200),
        records: [record('v1', '六联', '2026-01-10', '2034-09-01')],
        today: TODAY,
      });

      expect(plan.conflicts.some((item) => item.reason.includes('下次到期日'))).toBe(true);
    })

    it('冲突只是提醒，措辞里不说"必须"', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [record('v1', '六联', toDateText(new Date(parseDateText(dog(20))!.getTime() + 14 * 86400000)))],
        today: TODAY,
      });

      for (const conflict of plan.conflicts) {
        expect(conflict.suggestion).not.toContain('必须');
        expect(conflict.suggestion).not.toContain('立刻');
      }
    })

    it('没有记录时不会凭空造出冲突', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [],
        today: TODAY,
      });
      expect(plan.conflicts).toEqual([]);
    })
  })

  describe('安全边界', () => {
    it('没有出生日期时返回空计划而不是报错', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: '',
        records: [],
        today: TODAY,
      });

      expect(plan.steps).toEqual([]);
      expect(plan.nextStep).toBeNull();
    })

    it('顾客侧默认关闭（未经专业审核不得开放）', () => {
      expect(isVaccinePlanCustomerEnabled({} as NodeJS.ProcessEnv)).toBe(false);
      expect(isVaccinePlanCustomerEnabled({ VACCINE_PLAN: '' } as any)).toBe(false);
      expect(isVaccinePlanCustomerEnabled({ VACCINE_PLAN: 'off' } as any)).toBe(false);
    })

    it('审核完成后才可打开', () => {
      expect(isVaccinePlanCustomerEnabled({ VACCINE_PLAN: 'customer' } as any)).toBe(true);
      expect(isVaccinePlanCustomerEnabled({ VACCINE_PLAN: 'CUSTOMER' } as any)).toBe(true);
    })

    it('计划自带 reviewed 标记，未审核时可以据此不给顾客看', () => {
      const unreviewed = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(8),
        records: [],
        today: TODAY,
      });
      expect(unreviewed.reviewed).toBe(false);

      const reviewed = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(8),
        records: [],
        reviewed: true,
        today: TODAY,
      });
      expect(reviewed.reviewed).toBe(true);
    })

    it('免疫程序的三个来源都能追溯到具体依据', () => {
      expect(CORE_PUPPY_SERIES.basis).toContain('WSAVA');
      expect(CORE_ADULT_BOOSTER.basis).toContain('WSAVA');
      expect(RABIES_SCHEDULE.basis).toContain('国内');
    })
  })

  describe('detectConflicts 纯函数', () => {
    it('没有记录就没有冲突', () => {
      const seeds: any[] = [];
      expect(detectConflicts([], seeds, TODAY)).toEqual([]);
    })

    it('日期格式不对的记录会被跳过，不炸', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [record('bad', '六联', '不是日期')],
        today: TODAY,
      });
      expect(plan.conflicts).toEqual([]);
    })
  })

  /**
   * 没有记录时不说"已逾期"（2026-10-04 老板定的口径）
   *
   * 家长明明年年带狗去打、只是没在小程序里记，打开却看到一串
   * "已经过了建议时间，建议尽快安排" —— 第一反应是"我是不是漏打了"，
   * 第二反应是"这系统不准"。
   *
   * 我们**没有证据**说他没打，就不该用"逾期"这种口气。
   */
  describe('没有接种记录时的文案口径', () => {
    it('一条记录都没有时，逾期/该打的提醒不说"已过建议时间"', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [],
        today: TODAY,
      })

      expect(plan.noRecordAtAll).toBe(true)

      const actionable = plan.steps.filter(
        (step) => step.status === 'OVERDUE' || step.status === 'DUE',
      )
      expect(actionable.length).toBeGreaterThan(0)
      for (const step of actionable) {
        expect(step.reminder).toContain('档案里还没有这一针的记录')
        expect(step.reminder).not.toContain('已经过了建议时间')
        expect(step.reminder).not.toContain('尽快安排')
      }
    })

    it('有记录时该说逾期还是要说 —— 口径只对"完全没记录"生效', () => {
      // 幼犬期打过一针（落在首免窗口内），但后面几针确实没打 ——
      // 这时提示逾期是**准确的**，不该被软化。
      const birthday = dog(30);
      const firstDose = addWeeks(new Date(birthday + 'T00:00:00'), 10)
        .toISOString()
        .slice(0, 10);

      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday,
        records: [record('r1', '六联', firstDose)],
        today: TODAY,
      })

      // 这一针被认出来了 → 我们手上是有证据的
      expect(plan.noRecordAtAll).toBe(false)

      const overdue = plan.steps.filter((step) => step.status === 'OVERDUE')
      expect(overdue.length).toBeGreaterThan(0)
      expect(
        overdue.some((step) => step.reminder.includes('已经过了建议时间')),
      ).toBe(true)
    })

    it('没有出生日期时也不炸，noRecordAtAll 按"没有记录"算', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: '',
        records: [],
        today: TODAY,
      })
      expect(plan.steps).toEqual([])
    })
  })

  /**
   * 按疫苗种类单独设置（2026-10-04 兽医审核意见第 3 条）。
   *
   * 审核原话：
   *   "免疫程序表的每 3 年加强没有问题，但是个别疫苗它可能需要每年接种一次，
   *    比如钩端螺旋体。这个我们可能需要分疫苗种类来单独设置。"
   *
   * 顺带修掉一个错：以前是"不是狂犬就算核心苗"，于是一针**单独的钩端螺旋体**
   * 会被算成完成了一针核心苗，计划会少算一针。
   */
  describe('按疫苗种类单独设置间隔（钩端螺旋体：每年）', () => {
    it('一条记录可以同时算好几类 —— 卫佳捌既是核心苗又含钩端', () => {
      expect(classifyVaccineKinds('卫佳捌').sort()).toEqual(['core', 'lepto']);
      expect(classifyVaccineKinds('狂犬疫苗')).toEqual(['rabies']);
      expect(classifyVaccineKinds('六联')).toEqual(['core']);
    })

    it('商品名里带空格也认得出（"宠必威 幼犬保"）', () => {
      // 顾客本子上、AI 识别结果里带空格的写法很常见。
      // 归一化之前 "宠必威 幼犬保".includes("宠必威幼犬保") 是 false，
      // 会一路掉到"默认当核心苗"—— 碰巧这次答案对，但"卫佳 捌"就会漏掉钩端那一类。
      expect(classifyVaccineKinds('卫佳 捌').sort()).toEqual(['core', 'lepto']);
      expect(classifyVaccineKinds('宠必威 乐必妥')).toEqual(['lepto']);
      expect(classifyVaccineKinds('Vanguard Plus 5-CVL').sort()).toEqual(['core', 'lepto']);
    })

    it('单独的钩端螺旋体**不再**被算成核心苗', () => {
      // 以前 classifyVaccineName 是"不是狂犬就算 core"，
      // 一针单苗会被当成完成了一针核心疫苗。
      expect(classifyVaccineKinds('钩端螺旋体')).toEqual(['lepto']);
      expect(classifyVaccineKinds('宠必威乐必妥')).toEqual(['lepto']);
    })

    it('没打过钩端的狗，计划里不出现钩端 —— 非核心苗不默认推给每一只狗', () => {
      // WSAVA 与已审核的 immune-001 都写着：非核心苗要按生活方式逐只评估，
      // 不是默认全打。所以没记录就不出现，要不要开始是它和兽医的事。
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(80),
        records: [],
        today: TODAY,
      })

      expect(plan.steps.some((step) => step.kind === 'lepto')).toBe(false)
    })

    it('已经在打钩端的狗，按**每年**提醒（不是核心苗那套三年）', () => {
      const birthday = dog(80)
      const firstLepto = addWeeks(new Date(birthday + 'T00:00:00'), 9)
        .toISOString()
        .slice(0, 10)

      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday,
        records: [record('r1', '钩端螺旋体', firstLepto)],
        today: TODAY,
      })

      const lepto = plan.steps.filter((step) => step.kind === 'lepto')
      expect(lepto.length).toBeGreaterThan(0)

      // 每年一次 → 相邻两步的间隔约一年；核心苗那套是三年，这里必须区分开
      const repeats = lepto.filter((step) => step.key.includes('-repeat-'))
      expect(repeats.length).toBeGreaterThan(1)
      const firstRepeat = new Date(`${repeats[0].windowStart}T00:00:00`)
      const secondRepeat = new Date(`${repeats[1].windowStart}T00:00:00`)
      const yearsApart =
        (secondRepeat.getTime() - firstRepeat.getTime()) / (365 * 86400000)
      expect(yearsApart).toBeGreaterThan(0.9)
      expect(yearsApart).toBeLessThan(1.1)
    })

    it('每一类非核心苗的依据都要写清是哪支产品的说明书', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(80),
        records: [record('r1', '钩端螺旋体', '2026-06-01')],
        today: TODAY,
      })

      for (const step of plan.steps.filter((item) => item.kind === 'lepto')) {
        // 顾客和复鞫的人都要能查到这句话是从哪来的
        expect(step.basis).toContain('说明书')
      }
    })

    it('整套程序表（营养师看的）包含全部类别', () => {
      const all = buildImmunizationSchedule(new Date(`${dog(80)}T00:00:00`), {
        kinds: ALL_VACCINE_KINDS,
      })
      const kinds = new Set(all.map((item) => item.kind))
      expect(kinds.has('core')).toBe(true)
      expect(kinds.has('rabies')).toBe(true)
      expect(kinds.has('lepto')).toBe(true)
    })

    it('默认只排核心苗与狂犬（非核心苗要按记录加）', () => {
      const standard = buildImmunizationSchedule(new Date(`${dog(80)}T00:00:00`))
      const kinds = new Set(standard.map((item) => item.kind))
      expect(kinds.has('lepto')).toBe(false)
    })
  })

  /**
   * 提醒里推荐具体产品（2026-10-04 兽医审核意见第 5、6 条）。
   *
   *   ⑤ "我们不推荐国产疫苗，所有国产疫苗都不推荐。"
   *   ⑥ "提醒里面写最多 3 个产品，每个疫苗种类最多 3 个，可以，没问题。"
   */
  describe('常见产品（只列进口苗，每类最多 3 个）', () => {
    it('每一步都给出常见产品，且不超过 3 个', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [],
        today: TODAY,
      })

      expect(plan.steps.length).toBeGreaterThan(0)
      for (const step of plan.steps) {
        expect(Array.isArray(step.commonProducts)).toBe(true)
        expect(step.commonProducts.length).toBeLessThanOrEqual(3)
      }
    })

    it('核心里排在最前的是批签发批数最多的那几支', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [],
        today: TODAY,
      })

      const core = plan.steps.find((step) => step.kind === 'core')
      expect(core).toBeDefined()
      // 批签发：卫佳捌 41 批 > 宠必威优免康 32 批 > 卫佳伍 14 批
      expect(core!.commonProducts[0]).toBe('卫佳捌')
    })

    it('🔴 一个国产苗都不出现', () => {
      // 老板审核意见第 5 条。这里是硬约束：清单里不能有国产。
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(80),
        records: [
          record('r1', '钩端螺旋体', '2026-06-01'),
          record('r2', '狂犬疫苗', '2026-03-01'),
        ],
        today: TODAY,
      })

      const all = plan.steps.flatMap((step) => step.commonProducts).join(' ')
      for (const domestic of [
        '中牧', '科前', '科旺', '五星', '宠安士佳', '金宇', '犬康',
        '犬力康', '犬泰', '贝倍旺', '国药', '华南农大', '普莱柯', '惠中',
        '佑本', '爱宠', '齐鲁', '瑞普', '和元', '易邦', '同泰', '正业',
        '西诺', '怡安', '博莱得利',
      ]) {
        expect(all).not.toContain(domestic)
      }
    })

    it('狂犬那一步只推狂犬苗', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [],
        today: TODAY,
      })

      const rabies = plan.steps.find((step) => step.kind === 'rabies')
      expect(rabies!.commonProducts.length).toBeGreaterThan(0)
      // 这几支是狂犬苗；反过来核心苗不该出现在这里
      expect(rabies!.commonProducts).toContain('宠必威锐必威')
      expect(rabies!.commonProducts).not.toContain('卫佳伍')
    })

    it('钩端那一步推的苗必须真的含钩端（卫佳捌算，卫佳伍不算）', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(80),
        records: [record('r1', '钩端螺旋体', '2026-06-01')],
        today: TODAY,
      })

      const lepto = plan.steps.find((step) => step.kind === 'lepto')
      expect(lepto).toBeDefined()
      expect(lepto!.commonProducts).toContain('卫佳捌')
      expect(lepto!.commonProducts).toContain('宠必威乐必妥')
      // 卫佳伍不含钩端，绝不能出现在钩端那一步
      expect(lepto!.commonProducts).not.toContain('卫佳伍')
    })
  })

  /**
   * `noRecordAtAll` 与 `noEvidence` 是两个概念（2026-10-04 拆开）。
   *
   * 起因是老板看到"档案里还没有接种记录"这张卡，追问零记录时为什么还显示
   * 下一步和接种计划。查下来发现字段本身就名不副实：
   *
   *   · 注释写的是"这只狗**一条接种记录都没有**"；
   *   · 代码算的却是 `!hasAnyEvidence`（没有任何一步被匹配上）。
   *
   * 两件事在多数情况下重合，但确实会分开。最典型的一种：
   * 顾客录了一条**打在 8 周龄的狂犬疫苗** ——
   * 记录是真的（有些地方确实这么打），但它落在狂犬首针窗口（12 周起）之外，
   * 于是"一条都没对上号"。这时界面不能说他"还没有接种记录"。
   */
  describe('noRecordAtAll vs noEvidence（2026-10-04 拆开）', () => {
    it('一条记录都没有：两个都为真', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(20),
        records: [],
        today: TODAY,
      })

      expect(plan.noRecordAtAll).toBe(true)
      expect(plan.noEvidence).toBe(true)
    })

    it('有记录但一条都没对上号：noRecordAtAll 假、noEvidence 真', () => {
      // 一只 20 周龄的狗，唯一一条记录是 8 周龄打的狂犬 ——
      // 记录是真的，但落在狂犬首针窗口（12 周起）之外，一条都对不上号。
      const birthday = dog(20)
      const earlyRabies = addWeeks(new Date(birthday + 'T00:00:00'), 8)
        .toISOString()
        .slice(0, 10)

      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday,
        records: [record('r1', '狂犬疫苗', earlyRabies)],
        today: TODAY,
      })

      // 人家明明录了一条 —— 界面不能说他"还没有接种记录"
      expect(plan.noRecordAtAll).toBe(false)
      // 但确实一条都没对上号，措辞还是要软
      expect(plan.noEvidence).toBe(true)

      const actionable = plan.steps.filter(
        (step) => step.status === 'OVERDUE' || step.status === 'DUE',
      )
      expect(actionable.length).toBeGreaterThan(0)
      for (const step of actionable) {
        expect(step.reminder).toContain('档案里还没有这一针的记录')
        expect(step.reminder).not.toContain('已经过了建议时间')
      }
    })

    it('记录对得上号：两个都为假', () => {
      const birthday = dog(30)
      const firstDose = addWeeks(new Date(birthday + 'T00:00:00'), 10)
        .toISOString()
        .slice(0, 10)

      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday,
        records: [record('r1', '六联', firstDose)],
        today: TODAY,
      })

      expect(plan.noRecordAtAll).toBe(false)
      expect(plan.noEvidence).toBe(false)
    })

    it('没有出生日期时两个字段也都在（前端要靠它决定显示什么）', () => {
      const empty = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: '',
        records: [],
        today: TODAY,
      })
      expect(empty.noRecordAtAll).toBe(true)
      expect(empty.noEvidence).toBe(true)

      const withRecord = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: '',
        records: [record('r1', '狂犬疫苗', '2026-09-01')],
        today: TODAY,
      })
      expect(withRecord.noRecordAtAll).toBe(false)
      expect(withRecord.noEvidence).toBe(false)
    })
  })

  /**
   * 免疫程序表的四处修正（2026-10-04，读 WSAVA 2024 正本后）
   *
   * 这四条都是照着指南原文改的，每条都能翻到页码。
   */
  describe('程序表修正（2026-10-04）', () => {
    it('🔴 首免最后一针不早于 16 周龄 —— 不能 14 周就收尾', () => {
      // p11 "The most important of these early vaccine doses is the one
      //      administered at 16 weeks of age or older."
      // p14 "continues to recommend finishing no earlier than 16 weeks."
      const birthdayDate = parseDateText(dog(30))!;
      const schedule = buildImmunizationSchedule(birthdayDate);
      const puppy = schedule.filter((item) => item.key.startsWith('core-puppy-'));

      const lastStartWeeks = weeksBetween(
        birthdayDate,
        puppy[puppy.length - 1].windowStart,
      );
      expect(lastStartWeeks).toBeGreaterThanOrEqual(16);
      // 从 6 周龄起排是 6/10/14/18 —— 4 针，不是 3 针
      expect(puppy.length).toBe(4);
    })

    it('🔴 狂犬首针窗口不从 12 周往前放宽', () => {
      // 之前所有年接种窗口统一 -30 天，把首针拉到 ≈7.7 周龄，
      // 于是"8 周龄打狂犬"也会被判成已完成 —— 12 周是说明书上的最低月龄，
      // 往下放宽没有任何依据。
      const birthdayDate = parseDateText(dog(30))!;
      const schedule = buildImmunizationSchedule(birthdayDate);
      const firstRabies = schedule.find((item) => item.key === 'rabies-1')!;

      expect(weeksBetween(birthdayDate, firstRabies.windowStart)).toBeGreaterThanOrEqual(12);
    })

    it('🟠 26 周龄那一针是"推荐"，不叫"可选"', () => {
      // p14："Revaccination at or after 26 weeks of age … is advised"
      // 且明确说这条取代了旧的"12~16 月龄第一次加强"。
      const schedule = buildImmunizationSchedule(parseDateText(dog(30))!);
      const booster = schedule.find((item) => item.key === 'core-26w')!;

      expect(booster).toBeDefined();
      expect(booster.label).not.toContain('可选');
      expect(booster.basis).toContain('26 周龄');
    })

    it('🔴 成年加强从 26 周龄那一针起算（不是"16 周 + 1 年"）', () => {
      const birthdayDate = parseDateText(dog(30))!;
      const schedule = buildImmunizationSchedule(birthdayDate);
      const booster26w = schedule.find((item) => item.key === 'core-26w')!;
      const firstAdult = schedule.find((item) => item.key === 'core-adult-1')!;

      const gapYears =
        (firstAdult.windowStart.getTime() - booster26w.windowStart.getTime()) /
        (365 * 86400000);
      expect(gapYears).toBeGreaterThan(2.9);
      expect(gapYears).toBeLessThan(3.1);
    })

    it('每一条依据都写明出处（顾客和审核的人都要能查）', () => {
      const schedule = buildImmunizationSchedule(parseDateText(dog(30))!);
      for (const item of schedule) {
        expect(item.basis.length).toBeGreaterThan(10);
      }
      // 狂犬的依据要如实说明"以说明书与当地规定为准"，不能写成指南要求
      const rabies = schedule.find((item) => item.kind === 'rabies')!;
      expect(rabies.basis).toContain('说明书');
    })
  })
})

/**
 * 疫苗名称库 + 归类闭集（2026-10-05）。
 *
 * 老板："怎么保障用户填写正确的、可以被识别并归类的产品名称？"
 * 这份目录就是答案的载体：一点即选的名字都带已知归类；
 * 产品库进口国产都能选，但只有进口能进"常见的有…"那一行。
 */
describe('疫苗目录（名称库 + 归类闭集）', () => {
  it('归类闭集就是四类，other 不参与计划', () => {
    const catalog = buildVaccineCatalog();

    expect(catalog.kinds.map((k) => k.value)).toEqual([
      'core',
      'rabies',
      'lepto',
      'other',
    ]);
    expect(catalog.kinds.find((k) => k.value === 'other')!.affectsPlan).toBe(false);
    expect(catalog.kinds.find((k) => k.value === 'core')!.affectsPlan).toBe(true);
  })

  it('一点即选的名字**每一个都带得出归类**（点一下就不会错）', () => {
    const catalog = buildVaccineCatalog();

    expect(catalog.presets.length).toBeGreaterThan(5);
    for (const preset of catalog.presets) {
      expect(preset.kinds.length).toBeGreaterThan(0)
    }
    // 抽查几个容易错的
    const byName = Object.fromEntries(catalog.presets.map((p) => [p.name, p.kinds]))
    expect(byName['狂犬疫苗']).toEqual(['rabies'])
    expect(byName['犬四联']).toEqual(['core'])
    expect(byName['钩端螺旋体']).toEqual(['lepto'])
    // 犬窝咳是**非核心**，绝不能落进核心苗
    expect(byName['犬窝咳']).toEqual(['other'])
    expect(byName['犬冠状病毒']).toEqual(['other'])
  })

  it('产品库：国产能选，但不可推荐', () => {
    const catalog = buildVaccineCatalog();

    const domestic = catalog.products.filter((p) => p.recommendable === false)
    const imported = catalog.products.filter((p) => p.recommendable !== false)

    // 审核意见第 5 条"不推荐国产" + 2026-10-05"产品库允许选国产"
    expect(domestic.length).toBeGreaterThan(5)
    expect(imported.length).toBeGreaterThan(5)

    // 国产苗确实在库里（顾客打了国产苗得有地方记）
    expect(domestic.some((p) => p.name.includes('犬康') || p.name.includes('犬力康'))).toBe(true)
  })

  it('产品库每一项的归类都在闭集里', () => {
    const catalog = buildVaccineCatalog();
    const allowed = new Set(catalog.kinds.map((k) => k.value));

    for (const product of catalog.products) {
      expect(product.kinds.length).toBeGreaterThan(0)
      for (const kind of product.kinds) {
        expect(allowed.has(kind)).toBe(true)
      }
    }
  })
})
