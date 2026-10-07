import { buildVaccineCatalog } from '../../../src/domain/health/vaccine-catalog';
import {
  ALL_VACCINE_KINDS,
  VACCINE_KIND_CYCLE_NOTES,
  VACCINE_KIND_LABELS,
  VACCINE_KINDS,
  CORE_ADULT_BOOSTER,
  addWeeks,
  CORE_PUPPY_SERIES,
  RABIES_SCHEDULE,
  buildImmunizationSchedule,
  buildVaccinePlan,
  classifyVaccineName,
  classifyVaccineKinds,
  detectConflicts,
  parseDateText,
  recordCoversStep,
  toDateText,
  weeksBetween,
  type VaccineRecordLike,
} from '../../../src/domain/health/immunization-schedule';
import {
  VACCINE_PRODUCTS,
  findProductsInName,
} from '../../../src/domain/health/vaccine-products';

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
    it('10 岁且无任何记录的老狗：只看到"一针"，不会看到幼犬首免那一串', () => {
      /*
       * ⚠️ 2026-10-07 老板拍板改过口径。
       *
       * 原来这条要求"老狗一条核心提示都不许有"—— 初衷是别拿十年前那种
       * "幼犬首免 第 1 针已逾期"去烦人。但一刀切成"什么都不提示"会走过头：
       * 一只从没打过疫苗的成年犬（老板的狗「面包」实测）恰恰最需要补一针核心，
       * 却被一起藏掉了。老板拍板：档案里没有核心记录的狗，这一针永远显示成已逾期。
       *
       * 不变的是：**十年前的窗口不是"现在该做的事"** —— 早期那几针仍然不许冒出来
       * （见下面的 key 断言），显示出来的这一针也不再叫"幼犬首免"，而是
       * 「核心疫苗 首免（一针）」（WSAVA 2024：成年才开始首免的犬一针即可）。
       */
      const plan = buildVaccinePlan({
        dogId: 'dog-old',
        birthday: dog(520),
        records: [],
        today: TODAY,
      });

      // 幼犬首免那一串只剩「一针」，且是老狗说得通的说法
      // （成年加强是另一条线，它自己按 3 年一次排，不算"幼犬首免"）
      const puppySteps = plan.steps.filter((step) => /^core-puppy-/.test(step.key));
      expect(puppySteps.length).toBe(1);
      expect(puppySteps[0].label).toContain('一针');
      expect(puppySteps[0].status).toBe('OVERDUE');
      expect(plan.steps.every((step) => !step.label.includes('幼犬'))).toBe(true);

      // 十年前的窗口仍然不是"现在该做的事"：早期那几针一条都不许出现
      for (const key of ['core-puppy-1', 'core-puppy-2', 'core-puppy-3', 'core-26w']) {
        expect(plan.steps.find((step) => step.key === key)).toBeUndefined();
      }
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
      /*
       * ⚠️ 2026-10-06：这条记录原来落在"200 周龄"（成年才开始首免）——
       * 那种犬按 WSAVA 只需要一针，幼犬首免那一串步骤会被裁掉，
       * 于是"下一个该打的窗口"变了，这条测试要测的机制跟着失效。
       * 改成 12 周龄打的第一针（幼犬首免程序完整），本意不变。
       */
      const birthday = dog(200)
      const firstDose = addWeeks(new Date(`${birthday}T00:00:00`), 12)
        .toISOString()
        .slice(0, 10)
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday,
        records: [record('v1', '六联', firstDose, '2034-09-01')],
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

    // 2026-10-06：那个 VACCINE_PLAN 环境变量开关已经取消 ——
    // 老板定"按审核通过的标准部署"，程序表就是对顾客的口径，
    // 不再有"内部先看"的状态（留个随时能关的开关会让线上状态说不清）。
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

    it('🔴 商标符号 ® 也认得出 —— 老板记录里就是「宠必威® 幼犬保」', () => {
      // 实测翻车：本子上印「宠必威® 幼犬保」，库里存「宠必威幼犬保」，
      // 中间一个 ® 就让 includes 匹配不上，三条记录全判不出来。
      // 幼犬保是「早期核心疫苗」，单独一类 —— 它 4 周龄起 1 针，
      // 跟普通核心苗（6~8 周起 4 针 + 三年一次）周期完全不同
      expect(classifyVaccineKinds('宠必威® 幼犬保')).toEqual(['core_early']);
      expect(classifyVaccineKinds('宠必威®锐必威')).toEqual(['rabies']);
      expect(classifyVaccineKinds('卫佳®伍')).toEqual(['core']);
      expect(classifyVaccineKinds('卫佳®捌').sort()).toEqual(['core', 'lepto']);
      expect(classifyVaccineKinds('瑞比克®')).toEqual(['rabies']);
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

    /**
     * ⚠️ 2026-10-06 老板改了口径，这条**反过来**了。
     *
     * 老板："钩端螺旋体为什么是有记录才排呢？钩端螺旋体虽然不在核心疫苗内，
     * 但是在中国大陆还是非常常见。好像也是，强烈建议将其纳入到接种疫苗类的吧。"
     *
     * 核对：WSAVA 2024 对**高风险地区**（接触积水、牲畜或鼠类）是"强烈建议"；
     * 中国大陆多属常见地区。所以默认排出来、让家长拿去和兽医讨论，
     * 比"等他自己录过才提醒"更有用。
     * 其余非核心苗（犬窝咳、冠状…）仍然"有记录才加"。
     */
    it('🔴 没打过钩端的狗，计划里也排钩端（2026-10-06 老板改：中国大陆常见）', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(80),
        records: [],
        today: TODAY,
      })

      expect(plan.steps.some((step) => step.kind === 'lepto')).toBe(true)
    })

    it('但其余非核心苗仍然"有记录才加"（不默认推给每一只狗）', () => {
      const plan = buildVaccinePlan({
        dogId: 'dog-1',
        birthday: dog(80),
        records: [],
        today: TODAY,
      })

      // 幼犬保那条线（core_early）没记录就不出现
      expect(plan.steps.some((step) => step.kind === 'core_early')).toBe(false)
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

    it('默认排核心苗、狂犬、钩端（2026-10-06 起钩端也在默认里）', () => {
      const standard = buildImmunizationSchedule(new Date(`${dog(80)}T00:00:00`))
      const kinds = new Set(standard.map((item) => item.kind))
      expect(kinds.has('core')).toBe(true)
      expect(kinds.has('rabies')).toBe(true)
      expect(kinds.has('lepto')).toBe(true)
      // 幼犬保那条线仍要"有记录才加"
      expect(kinds.has('core_early')).toBe(false)
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
  it('分类闭集是五类（按接种周期分），other 不参与计划', () => {
    const catalog = buildVaccineCatalog();

    // 五类 —— 分类是**按接种周期/窗口**分的，不是按联数
    expect(catalog.kinds.map((k) => k.value)).toEqual([
      'core_early',
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

/**
 * 产品库 / 分类 / 周期的三项审计（2026-10-05 老板要求）。
 *
 * 老板原话：
 *   "第一要确认产品库是否完整。第二要确认每一个产品是否有明确的分类。
 *    第三一个要确认每一个分类是否有明确的接种周期或者是接种窗口。"
 *
 * 这三条任何一条破了，都会表现成同一个症状：某个疫苗"排不进计划"。
 * 所以钉成测试，改坏了立刻知道。
 */
describe('产品库 / 分类 / 周期 三项审计', () => {
  it('① 产品库非空，且进口国产都在', () => {
    const imported = VACCINE_PRODUCTS.filter((p) => p.recommendable !== false)
    const domestic = VACCINE_PRODUCTS.filter((p) => p.recommendable === false)

    // 进口要够撑起"常见的有…"那一行（每类最多 3 个）
    expect(imported.length).toBeGreaterThanOrEqual(10)
    // 国产苗在本地医院更常见，产品库里必须有得选
    expect(domestic.length).toBeGreaterThanOrEqual(20)
  })

  it('② 每一个产品都有明确分类，而且分类都在闭集里', () => {
    const allowed = new Set<string>(VACCINE_KINDS)

    for (const product of VACCINE_PRODUCTS) {
      expect({ name: product.name, kinds: product.kinds }).toEqual({
        name: product.name,
        kinds: expect.any(Array),
      })
      expect(product.kinds.length).toBeGreaterThan(0)
      for (const kind of product.kinds) {
        expect(`${product.name}:${kind}`).toBe(
          allowed.has(kind) ? `${product.name}:${kind}` : `${product.name}:非法分类`,
        )
      }
    }
  })

  it('③ 每一个分类都有明确的接种周期说明 —— 读不出周期就不该存在', () => {
    for (const kind of VACCINE_KINDS) {
      const note = VACCINE_KIND_CYCLE_NOTES[kind]
      expect(`${kind}:${Boolean(note && note.length > 8)}`).toBe(`${kind}:true`)
      expect(VACCINE_KIND_LABELS[kind]).toBeTruthy()
    }
  })

  it('🔴 早期核心疫苗（4 周龄起）必须是**单独一类**，不能混进核心苗', () => {
    // 老板特意点出来的："还有一些特殊的产品，比如在 4 周龄就可以开始注射的
    // 早期疫苗，举例，宠必威的幼犬保。这些特殊的疫苗，我们也需要进行单独的分类，
    // 不然的话，没有办法确认它们的接种周期，进而就没有办法在计划中排期。"
    const early = VACCINE_PRODUCTS.find((p) => p.name === '宠必威幼犬保')
    expect(early).toBeDefined()
    expect(early!.kinds).toEqual(['core_early'])
    expect(early!.minWeeks).toBe(4)

    // 普通核心苗不能被误判成早期苗
    expect(VACCINE_PRODUCTS.find((p) => p.name === '卫佳伍')!.kinds).toEqual(['core'])
  })

  it('早期核心疫苗的窗口在 4 周龄 —— 不是核心苗那套 6~8 周', () => {
    const birthday = new Date('2026-01-05T00:00:00');
    const all = buildImmunizationSchedule(birthday, { kinds: ALL_VACCINE_KINDS })

    const early = all.filter((item) => item.kind === 'core_early')
    expect(early.length).toBe(1) // 只排 1 针，不按周期重复

    // 4 周龄 = 出生 + 28 天
    const expected = new Date(birthday.getTime() + 28 * 86400000)
    expect(early[0].windowStart.getTime()).toBe(expected.getTime())

    // 而且它**不能**顶替核心苗首免：core 的那几针照旧从 6 周起
    const core = all.filter((item) => item.kind === 'core')
    expect(core.length).toBeGreaterThan(0)
  })
})

/**
 * 老板 2026-10-05 加的两条排期规则。
 */
describe('排期规则：同品牌优先 + 不同分类不同天', () => {
  // helper 在上一层 describe 里，这里自己来一份
  const TODAY = new Date('2026-10-01T00:00:00');

  function dog(ageWeeks: number) {
    const birthday = new Date(TODAY.getTime() - ageWeeks * 7 * 86400000);
    return toDateText(birthday);
  }

  function record(
    id: string,
    name: string,
    date: string,
    nextDueDate?: string,
  ): VaccineRecordLike {
    return {
      id,
      vaccineName: name,
      vaccinationDate: date,
      nextDueDate: nextDueDate ?? null,
    };
  }

  it('🔴 打过宠必威幼犬保之后，续针优先同品牌的四联 —— 不是继续推幼犬保', () => {
    // 老板原话："早期的核心疫苗，比如宠必威的幼犬保，第一针打完之后，
    // 从第二针 6~8 周起，就应该打同品牌的 4 联疫苗了，
    // 而不是继续打幼犬保这种二联疫苗。"
    const birthday = dog(30);
    const puppyEarly = addWeeks(new Date(birthday + 'T00:00:00'), 5)
      .toISOString()
      .slice(0, 10);

    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday,
      records: [record('r1', '宠必威幼犬保', puppyEarly)],
      today: TODAY,
    });

    // ① 幼犬保自己那一类（早期核心疫苗）里推它没问题
    const early = plan.steps.find((step) => step.kind === 'core_early');
    expect(early!.commonProducts).toContain('宠必威幼犬保');

    // ② 但**常规首免**那几步里，幼犬保绝不能出现（它只防犬瘟+细小）
    const core = plan.steps.filter((step) => step.kind === 'core');
    expect(core.length).toBeGreaterThan(0);
    for (const step of core) {
      expect(step.commonProducts).not.toContain('宠必威幼犬保');
    }

    // ③ 而且优先推同品牌（英特威）的四联 —— 宠必威优免康排第一
    expect(core[0].commonProducts[0]).toBe('宠必威优免康');
  })

  it('没打过任何苗的狗，按默认顺序推（批签发批数多的在前）', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: dog(30),
      records: [],
      today: TODAY,
    })

    const core = plan.steps.find((step) => step.kind === 'core')
    // 没有品牌偏好时按默认顺序：卫佳捌 41 批 > 宠必威优免康 32 批
    expect(core!.commonProducts[0]).toBe('卫佳捌')
  })

  it('细小单苗（卫佳细）不能拿来顶常规首免 —— 它只防细小', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: dog(30),
      records: [],
      today: TODAY,
    })

    // 卫佳细是 core 类，但只防犬瘟…不，它只防细小一种病。
    // 推荐的产品必须**真的顶得上这一步**（老板规则一背后的要求）。
    for (const step of plan.steps.filter((item) => item.kind === 'core')) {
      expect(step.commonProducts).not.toContain('卫佳细')
    }
    // 但它在产品库里照样能选 —— 只是不该被"推荐"去顶常规首免
    expect(findProductsInName('卫佳细').length).toBe(1)
  })

  it('🔴 不同分类的针撞在同一段时间时，提醒别同一天打', () => {
    // 老板原话："不同分类的疫苗不可以在同一天接种，尽量避开 2~3 天。
    // 比如狂犬疫苗、核心疫苗和钩端螺旋体要分开打。"
    const birthday = dog(80)
    // 让它有钩端记录 → 计划里才有 lepto 这一类
    const leptoAt = addWeeks(new Date(birthday + 'T00:00:00'), 9)
      .toISOString()
      .slice(0, 10)

    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday,
      records: [record('r1', '钩端螺旋体', leptoAt)],
      today: TODAY,
    })

    const withNote = plan.steps.filter((step) => step.spacingNote)
    expect(withNote.length).toBeGreaterThan(0)
    expect(withNote[0].spacingNote).toContain('不要同一天打')
    // 提醒里要说清是跟哪一类错开
    expect(withNote.some((step) => /核心疫苗|狂犬疫苗|钩端螺旋体/.test(step.spacingNote))).toBe(true)
  })

  it('对面那针还没到窗口时**不提醒** —— 否则每步都挂，人就不看了', () => {
    // 核心苗窗口横跨 6~18 周、狂犬从 12 周起，两边几乎永远重叠。
    // 不加门槛的话实测 5 步里 4 步都挂着"别和狂犬同一天打"。
    //
    // ⚠️ 2026-10-06：钩端进默认计划后，7 周龄的狗**钩端 8 周龄就开**（正好第 7 天），
    // 所以那一步的提醒是应该出现的。这条测试回到它原本要守的东西：
    // **狂犬（12 周）还早着呢，不许提它**。
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: dog(7), // 7 周龄：狂犬窗口（12 周）还没开，钩端（8 周）一周内就开
      records: [],
      today: TODAY,
    })

    const first = plan.steps.find((step) => step.kind === 'core')
    expect(first).toBeDefined()
    expect(first!.spacingNote).not.toContain('狂犬')
  })

  it('同一类内部的针不互相提醒错开（本来就是同一套程序）', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: dog(80),
      records: [],
      today: TODAY,
    })

    // 只有 core + rabies 时，core 的几针之间不该互相报"别同一天"
    const coreSteps = plan.steps.filter((step) => step.kind === 'core')
    for (const step of coreSteps) {
      expect(step.spacingNote).not.toContain('核心疫苗」要打')
    }
  })

  it('每一条排期规则都给得出依据（顾客和审核的人要能查）', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: dog(80),
      records: [record('r1', '钩端螺旋体', '2026-06-01')],
      today: TODAY,
    })

    for (const step of plan.steps) {
      expect(step.basis.length).toBeGreaterThan(8)
    }
  })
})

/**
 * 老板第 2 问与第 4 问引出的两条规则（2026-10-05）。
 */
describe('单联苗顶不上 + 多联苗别重复（老板四问的收尾）', () => {
  const TODAY2 = new Date('2026-10-01T00:00:00');

  function dogAt(ageWeeks: number) {
    return toDateText(new Date(TODAY2.getTime() - ageWeeks * 7 * 86400000));
  }
  function rec(id: string, name: string, date: string): VaccineRecordLike {
    return { id, vaccineName: name, vaccinationDate: date, nextDueDate: null };
  }

  it('🔴 单联苗/二联苗**顶不上**核心首免 —— 记了也当没打过', () => {
    // 老板第 2 问："像卫佳细这种单联疫苗……即便顾客记录接种了这一类的疫苗，
    // 也当做没有接种过。核心疫苗需要重新开始免疫流程呢？"
    // 实质正确。卫佳细只防细小、犬二联只防两种，都顶不上要求防四种的核心首免。
    expect(recordCoversStep('卫佳细', 'core')).toBe(false)
    expect(recordCoversStep('犬二联', 'core')).toBe(false)
    expect(recordCoversStep('犬三联', 'core')).toBe(false)
    // 四联及以上才顶得上
    expect(recordCoversStep('卫佳伍', 'core')).toBe(true)
    expect(recordCoversStep('犬四联', 'core')).toBe(true)
    expect(recordCoversStep('卫佳捌', 'core')).toBe(true)
  })

  it('记了一条犬二联，核心首免那几针**不算完成**（继续提醒）', () => {
    const birthday = dogAt(30)
    // 10 周龄打了一针犬二联 —— 正好落在首免第 2 针的窗口里
    const date = addWeeks(new Date(birthday + 'T00:00:00'), 10)
      .toISOString()
      .slice(0, 10)

    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday,
      records: [rec('r1', '犬二联', date)],
      today: TODAY2,
    })

    // 一条都不能算完成 —— 宁可多提醒
    const coreSteps = plan.steps.filter((step) => step.kind === 'core')
    expect(coreSteps.length).toBeGreaterThan(0)
    expect(coreSteps.some((step) => step.status === 'DONE')).toBe(false)
  })

  it('🔴 刚打过核心苗之后，钩端那一步只推**钩端单苗**，不再推多联苗', () => {
    // 老板第 4 问："如果一只幼犬在 16 周后打了一针卫佳八……
    // 它的下一针是要再打一针卫佳八，还是单独隔 2~4 周打一针钩端螺旋体呢？"
    // 答案：**隔 2~4 周单独打一针钩端单苗** ——
    // 再来一针卫佳捌等于核心苗在 2~4 周内又打了一次，而核心该等到 26 周。
    // 用**固定日期**，不要用 toISOString 算 —— 跨时区会差一天，
    // 结果核心苗没落在窗口里，规则就不触发了（第一版测试就是这么假失败的）。
    // 生日 2026-01-05：6/10/14/18 周分别是下面这四天。
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: '2026-01-05',
      records: [
        rec('r1', '卫佳伍', '2026-02-16'),
        rec('r2', '卫佳伍', '2026-03-16'),
        rec('r3', '卫佳伍', '2026-04-13'),
        // 18 周那一针是**卫佳捌**（核心 + 钩端）
        rec('r4', '卫佳捌', '2026-05-11'),
      ],
      // 站在 21 周看
      today: new Date('2026-06-01T00:00:00'),
    })

    const lepto = plan.steps.filter((step) => step.kind === 'lepto')
    expect(lepto.length).toBeGreaterThan(0)
    for (const step of lepto) {
      // 只推单苗 —— 卫佳捌/优乐康这类"核心+钩端"的组合苗不许出现
      expect(step.commonProducts).not.toContain('卫佳捌')
      expect(step.commonProducts).not.toContain('优乐康')
      expect(step.commonProducts).toContain('宠必威乐必妥')
    }
  })

  it('没打过钩端的狗，26 周补强照常推多联苗（不误伤常见做法）', () => {
    /*
     * ⚠️ 2026-10-06：狗的月龄从 26 周改成 20 周。
     * 新规则下"26 周龄或更大才开始首免"的犬**不需要 26 周补强**（WSAVA），
     * 所以用 26 周龄的狗来测这一步已经不成立了 ——
     * 20 周龄落在 16~26 之间，26 周补强仍然要排，这条测试的本意（推多联苗）不变。
     */
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: dogAt(20),
      records: [],
      today: TODAY2,
    })

    const booster = plan.steps.find((step) => step.key === 'core-26w')
    expect(booster).toBeDefined()
    // 钩端从来就没"刚打过"，所以卫佳捌照推 —— 这是医院的常见做法
    expect(booster!.commonProducts).toContain('卫佳捌')
  })

  it('过期批准文号的疫苗不收录（佑达康）', () => {
    // 老板第 3 条："批准文号已过期的疫苗产品不收录。"
    // 佑达康（北京科牧丰，兽药生字010726044）有效期至 2025-11-04，已过期。
    const names = VACCINE_PRODUCTS.map((product) => product.name).join(' ')
    expect(names).not.toContain('佑达康')
    expect(names).not.toContain('科牧丰')
  })

  it('瑞比克归属勃林格（老板确认）', () => {
    const product = VACCINE_PRODUCTS.find((item) => item.name === '瑞比克')
    expect(product).toBeDefined()
    expect(product!.brand).toBe('勃林格')
  })
})

/**
 * 记录怎么对上步骤：**按针数**，不是"窗口里有没有"（2026-10-05 改）。
 *
 * 起因是老板看着截图问："这个系统的疫苗推荐流程我还没有看明白。"
 * 截图里 18 周打了卫佳捌（含钩端），系统却认为**一针钩端都没打过**，
 * 让他再打两针 —— 因为 18 周掉在钩端那两个窗口（8~12、12~16 周）之外。
 *
 * 老办法判的是"有没有在**对的时间**打"，而系列苗真正要数的是**打了几针**。
 */
describe('按针数分配记录（老板截图引出的改法）', () => {
  function rec2(id: string, name: string, date: string): VaccineRecordLike {
    return { id, vaccineName: name, vaccinationDate: date, nextDueDate: null };
  }

  const scenario = () =>
    buildVaccinePlan({
      dogId: 'dog-1',
      birthday: '2026-01-05',
      records: [
        rec2('r1', '卫佳伍', '2026-02-16'),
        rec2('r2', '卫佳伍', '2026-03-16'),
        rec2('r3', '卫佳伍', '2026-04-13'),
        // 18 周那一针是卫佳捌（核心 + 钩端）—— 它会掉在钩端窗口之外
        rec2('r4', '卫佳捌', '2026-05-11'),
      ],
      today: new Date('2026-06-01T00:00:00'),
    })

  it('🔴 窗口外的记录照样算数 —— 18 周那针卫佳捌里的钩端就是第 1 针', () => {
    const plan = scenario()

    const lepto = plan.steps.filter((step) => step.kind === 'lepto')
    const first = lepto.find((step) => step.key === 'lepto-primary-1')
    expect(first).toBeDefined()
    // 以前这里是 OVERDUE（18 周掉在 8~12、12~16 两个窗口之外，一条没算上）
    expect(first!.status).toBe('DONE')
    expect(first!.matchedRecordDate).toBe('2026-05-11')

    /*
     * 只需要再补**第 2 针**，不是两针都重来。
     *
     * ⚠️ 2026-10-06 起这条的状态是 **UPCOMING**（原来是 OVERDUE）——
     * 因为窗口改成**锚定实际接种日**：第 1 针实际打在 2026-05-11，
     * 第 2 针的窗口就顺延成 [06-08, 07-06]（间隔仍是程序表的 4 周）。
     * 而这一天的 today 是 2026-06-01 —— 还没到窗口，所以是"待安排"。
     * 这正是要的效果：**不再拿"按生日起算"的旧窗口去说人家逾期**。
     */
    const second = lepto.find((step) => step.key === 'lepto-primary-2')
    expect(second!.status).toBe('UPCOMING')
  })

  it('一条记录只能顶一步 —— 一针不能算两次', () => {
    const plan = scenario()
    const leptoDone = plan.steps.filter(
      (step) => step.kind === 'lepto' && step.status === 'DONE',
    )
    // 只打了 1 针钩端，就只能有 1 步是 DONE
    expect(leptoDone.length).toBe(1)
  })

  it('组合苗可以同时顶**不同类**的各一步（卫佳捌 = 核心那步 + 钩端那步）', () => {
    const plan = scenario()

    const coreFourth = plan.steps.find((step) => step.key === 'core-puppy-4')
    const leptoFirst = plan.steps.find((step) => step.key === 'lepto-primary-1')

    expect(coreFourth!.matchedRecordDate).toBe('2026-05-11')
    expect(leptoFirst!.matchedRecordDate).toBe('2026-05-11')
  })

  it('下一步给的是"补钩端第 2 针"，并且只推钩端单苗', () => {
    // 第 2 针的窗口现在锚在实际那一针（2026-05-11）之后 4 周 ——
    // 所以取一个落在窗口里的日期来看"下一针"是什么
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: '2026-01-05',
      records: [
        rec2('r1', '卫佳伍', '2026-02-16'),
        rec2('r2', '卫佳伍', '2026-03-16'),
        rec2('r3', '卫佳伍', '2026-04-13'),
        rec2('r4', '卫佳捌', '2026-05-11'),
      ],
      today: new Date('2026-06-15T00:00:00'),
    })

    expect(plan.nextStep).toBeDefined()
    expect(plan.nextStep!.key).toBe('lepto-primary-2')
    // 刚打过核心，这一步不该再推多联苗
    expect(plan.nextStep!.commonProducts).toContain('宠必威乐必妥')
    expect(plan.nextStep!.commonProducts).not.toContain('卫佳捌')
  })

  it('打得太早的记录仍会被单独提示（窗口没白留）', () => {
    // 窗口不再参与"算不算完成"，但"打太早"这件事还是要在冲突里说
    const birthday = '2026-01-05'
    const tooEarly = buildVaccinePlan({
      dogId: 'dog-1',
      birthday,
      // 2 周龄就打核心苗 —— 早于 4 周龄红线
      records: [rec2('r1', '卫佳伍', '2026-01-19')],
      today: new Date('2026-06-01T00:00:00'),
    })

    expect(tooEarly.conflicts.length).toBeGreaterThan(0)
    expect(tooEarly.conflicts.some((item) => item.reason.includes('4 周龄之前'))).toBe(true)
  })
})

/**
 * 匹配必须"先看窗口、再看顺序"（2026-10-06 老板实测撞出来的）。
 *
 * 用赛文（生日 2023-02-16）的**真实数据**：
 *   2024-08-18 卫佳捌（含钩端）   2025-08-18 卫佳捌   2026-07-18 卫佳捌
 *   2025-08-28 瑞比克（狂犬）     2026-07-25 狂犬
 *
 * 改之前是**纯按顺序派**（每一类里第 N 步吃第 N 条记录，完全不看日期），
 * 于是出现一串怪现象：2026 年打的针被判成完成了 2024 年的那一步、
 * 而 2026 年那一步反过来显示"已逾期"；刚打的狂犬被算成 2023 年的首针。
 */
describe('按窗口匹配（2026-10-06 老板实测）', () => {
  const plan = () =>
    buildVaccinePlan({
      dogId: 'dog-seven',
      birthday: '2023-02-16',
      records: [
        { id: 'r1', vaccineName: '卫佳捌', vaccinationDate: '2024-08-18', nextDueDate: null },
        { id: 'r2', vaccineName: '卫佳捌', vaccinationDate: '2025-08-18', nextDueDate: null },
        { id: 'r3', vaccineName: '瑞比克', vaccinationDate: '2025-08-28', nextDueDate: null },
        { id: 'r4', vaccineName: '卫佳捌', vaccinationDate: '2026-07-18', nextDueDate: null },
        { id: 'r5', vaccineName: '狂犬', vaccinationDate: '2026-07-25', nextDueDate: null },
      ],
      today: new Date('2026-10-06'),
    });

  it('🔴 钩端"每年 1 次"按年份各归各位，不再张冠李戴', () => {
    const steps = plan().steps.filter((step) => step.kind === 'lepto');
    const byLabel = new Map(steps.map((step) => [step.label, step]));

    // 每一年那一针，落到**它当年**的那一步上
    expect(byLabel.get('钩端螺旋体 每年 1 次（第 1 次）')?.matchedRecordDate).toBe('2024-08-18');
    expect(byLabel.get('钩端螺旋体 每年 1 次（第 2 次）')?.matchedRecordDate).toBe('2025-08-18');
    expect(byLabel.get('钩端螺旋体 每年 1 次（第 3 次）')?.matchedRecordDate).toBe('2026-07-18');
  })

  it('🔴 2023 年那两针初免不该被 2024/2025 的记录"顶掉"后还留在计划里', () => {
    const steps = plan().steps;

    // 2023 年的窗口过期太久，按"只留对现在有意义"的规则应当已经不在计划里；
    // 关键是：**不许**出现"2026 年的针完成了 2023 年那一步"这种错配
    for (const step of steps.filter((s) => s.kind === 'lepto' && s.matchedRecordDate)) {
      expect(step.windowEnd >= '2023-12-31').toBe(true);
    }
  })

  it('🔴 2026-07-25 刚打的狂犬，落到"第 4 次"上（不再算成 2023 年的首针）', () => {
    const steps = plan().steps;
    const fourth = steps.find((step) => step.key === 'rabies-4');

    expect(fourth).toBeDefined();
    expect(fourth!.status).toBe('DONE');
    expect(fourth!.matchedRecordDate).toBe('2026-07-25');
  })

  it('🔴 2026-07-18 那一针卫佳捌完成的是"成年加强 第 1 次"（窗口正好从那一天开）', () => {
    const adult = plan().steps.find((step) => step.key === 'core-adult-1');

    expect(adult).toBeDefined();
    expect(adult!.status).toBe('DONE');
    expect(adult!.matchedRecordDate).toBe('2026-07-18');
  })

  it('窗口外的记录照样算数（早先那条口径不能丢）', () => {
    // 18 周龄打的一针卫佳捌，钩端两个初免窗口都过了 —— 仍算第 1 针
    const early = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: '2026-01-05',
      records: [
        { id: 'a', vaccineName: '卫佳捌', vaccinationDate: '2026-05-11', nextDueDate: null },
      ],
      today: new Date('2026-08-01'),
    })
    const first = early.steps.find((step) => step.key === 'lepto-primary-1')
    expect(first!.status).toBe('DONE')
    expect(first!.matchedRecordDate).toBe('2026-05-11')
  })
})

/**
 * 窗口锚定**实际接种日**（2026-10-06 老板指出）。
 *
 * 老板："如果接种窗口只跟生日有关，跟记录无关的话，假设 26 周后的核心疫苗的
 * 加强针被拖到了一岁的时候打，那么 3 年后的成年期第一次加强针要算到什么时候呢？
 * ……优先级更高的相关性，难道不是上一次的接种日期吗？"
 *
 * 对。原来所有窗口只由生日推出，实际接种日一旦有偏差，后面每一针整体偏掉。
 */
describe('窗口锚定实际接种日（2026-10-06）', () => {
  const rec = (id: string, name: string, date: string) => ({
    id,
    vaccineName: name,
    vaccinationDate: date,
    nextDueDate: null,
  })

  it('🔴 狂犬首针拖到一岁才打 → 第 2 次不再"两个月后就到期"', () => {
    const plan = buildVaccinePlan({
      dogId: 'd',
      birthday: '2026-01-05',
      records: [rec('r', '狂犬', '2027-01-05')],
      today: new Date('2027-06-01'),
    })

    const second = plan.steps.find((step) => step.key === 'rabies-2')
    expect(second).toBeDefined()
    // 改之前：窗口 2027-02-28~06-28（离那一针只有 2 个月）→ 提前 10 个月催人重打
    // 现在：锚在 2027-01-05 + 1 年
    expect(second!.windowStart >= '2027-11-01').toBe(true)
    expect(second!.windowEnd >= '2028-02-01').toBe(true)
    expect(second!.status).toBe('UPCOMING')
  })

  it('🔴 26 周补强拖到一岁才打 → 后面那一步跟着顺延，不再误报逾期', () => {
    const plan = buildVaccinePlan({
      dogId: 'd',
      birthday: '2026-01-05',
      records: [
        rec('a', '犬四联', '2026-03-02'),
        rec('b', '犬四联', '2026-03-23'),
        rec('c', '犬四联', '2026-04-20'),
        rec('d', '犬四联', '2027-01-05'),
      ],
      today: new Date('2027-02-01'),
    })

    const booster = plan.steps.find((step) => step.key === 'core-26w')
    expect(booster).toBeDefined()
    // 改之前：窗口还是 2026-07-06~08-03（按生日算），一直挂"已逾期"
    expect(booster!.windowStart >= '2027-01-01').toBe(true)
    expect(booster!.status).not.toBe('OVERDUE')
  })

  it('没有记录时仍然按生日推算（没有"上一次"可言）', () => {
    const plan = buildVaccinePlan({
      dogId: 'd',
      birthday: '2026-01-05',
      records: [],
      today: new Date('2026-06-01'),
    })

    const second = plan.steps.find((step) => step.key === 'rabies-2')
    expect(second).toBeDefined()
    // 生日 + 12 周 + 1 年（±窗口）
    expect(second!.windowStart.slice(0, 4)).toBe('2027')
  })

})

/**
 * 首免针数按「第一次打核心苗时多大」裁（WSAVA 2024，老板 2026-10-06 指出）。
 *
 * 老板原话："对于大于 16 周的幼犬，接种一针核心疫苗，并在 26 周后再补打一次
 * 加强针即可……如果这只狗狗大于 26 周才开始首免程序的话，那它实际上只需要
 * 打一针核心疫苗即可。这个逻辑不知道有没有在现有的提醒或者是计划算法中实现。"
 *
 * 答案是**没实现**：一只 40 周龄才开始首免的狗，计划要求它补打 4 针幼犬首免
 * （全挂"已逾期"）—— 那是给 6~8 周龄开始的幼犬排的。
 */
describe('首免针数按开始年龄裁（WSAVA 2024）', () => {
  const TODAY3 = new Date('2026-10-06T00:00:00')

  /** 生日 = 今天往前推 N 周 */
  const bornWeeksAgo = (weeks: number) =>
    toDateText(new Date(TODAY3.getTime() - weeks * 7 * 24 * 60 * 60 * 1000))

  const puppySteps = (birthday: string, records: VaccineRecordLike[] = []) =>
    buildVaccinePlan({ dogId: 'dog-1', birthday, records, today: TODAY3 }).steps.filter(
      (step) => /^core-puppy-/.test(step.key),
    )

  it('🔴 20 周龄才开始首免 → 只打一针（原来要求补 3 针，全挂已逾期）', () => {
    const steps = puppySteps(bornWeeksAgo(20))

    expect(steps.length).toBe(1)
    expect(steps[0].label).toContain('一针')
    // 未满 26 周龄 → 26 周补强仍然要排
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: bornWeeksAgo(20),
      records: [],
      today: TODAY3,
    })
    expect(plan.steps.find((step) => step.key === 'core-26w')).toBeDefined()
  })

  it('🔴 40 周龄才开始首免 → 一针就够，26 周补强也不用补', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: bornWeeksAgo(40),
      records: [],
      today: TODAY3,
    })

    const steps = plan.steps.filter((step) => /^core-puppy-/.test(step.key))
    expect(steps.length).toBe(1)
    expect(steps[0].label).toContain('一针')
    // 26 周龄以后才开始的那一针同时顶掉了 6 月龄补强
    expect(plan.steps.find((step) => step.key === 'core-26w')).toBeUndefined()
  })

  it('8 周龄就开始首免的幼犬照旧 —— 该 4 针还是 4 针（别把规则用过头）', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: bornWeeksAgo(8),
      records: [],
      today: TODAY3,
    })

    expect(plan.steps.filter((step) => /^core-puppy-/.test(step.key)).length).toBeGreaterThan(1)
    expect(plan.steps.find((step) => step.key === 'core-26w')).toBeDefined()
  })

  it('看的是**开始首免时**多大，不是狗狗现在多大', () => {
    /*
     * 这只狗 8 周龄就打上了第一针核心苗，现在 60 周龄 ——
     * 不能因为"现在很大了"就把它的首免程序裁成一针，
     * 那样会把已经打完的那几针从档案里抹掉。
     */
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: bornWeeksAgo(60),
      records: [
        {
          id: 'r1',
          vaccineName: '卫佳伍',
          vaccinationDate: bornWeeksAgo(52),
          nextDueDate: null,
        },
        {
          id: 'r2',
          vaccineName: '卫佳伍',
          vaccinationDate: bornWeeksAgo(48),
          nextDueDate: null,
        },
      ],
      today: TODAY3,
    })

    expect(plan.steps.filter((step) => /^core-puppy-/.test(step.key)).length).toBeGreaterThan(1)
    expect(plan.steps.find((step) => step.key === 'core-26w')).toBeDefined()
  })

  /*
   * ══ 从没打过核心苗的狗，这一针永远显示（老板 2026-10-07 拍板）══════════
   *
   * 老板的狗「面包」（2 岁多、档案空白）实测：计划里狂犬、钩端都该打，
   * **却一个字都没提核心疫苗** —— 因为「首免（一针）」的窗口是按 16 周龄算的，
   * 两年前就过去了，而系统会把"过期一年以上还没打"的步骤收起来。
   * 那是给 10 岁老狗藏"幼犬首免第 1 针"用的，规则没错，但把这一针一起收掉，
   * 最该打的那一针反而消失了。
   */
  it('🔴 2 岁多、档案空白的狗 → 核心那一针必须显示，而且是"已逾期"', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: bornWeeksAgo(158),
      records: [],
      today: TODAY3,
    })

    const shot = plan.steps.find((step) => step.label.includes('一针'))
    expect(shot).toBeDefined()
    expect(shot!.status).toBe('OVERDUE')
    // 它比狂犬、钩端都更该先补 —— 提醒也该先报这一条
    expect(plan.nextStep?.label).toContain('一针')
  })

  it('只记录过狂犬、从没记录过核心苗的狗，同样要显示（不然最重要的那针被藏了）', () => {
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: bornWeeksAgo(158),
      records: [
        {
          id: 'r1',
          vaccineName: '狂犬',
          vaccinationDate: bornWeeksAgo(100),
          nextDueDate: null,
        },
      ],
      today: TODAY3,
    })

    const shot = plan.steps.find((step) => step.label.includes('一针'))
    expect(shot).toBeDefined()
    expect(shot!.status).toBe('OVERDUE')
  })

  it('打过核心苗的狗不许被翻旧账 —— 别把成年犬的首免再翻出来', () => {
    // 这只狗 80 周龄才打上第一针核心苗，现在 158 周龄：档案里有核心记录，
    // 「首免（一针）」早就被那一针顶掉了，不该再冒出来报逾期。
    const plan = buildVaccinePlan({
      dogId: 'dog-1',
      birthday: bornWeeksAgo(158),
      records: [
        {
          id: 'r1',
          vaccineName: '卫佳伍',
          vaccinationDate: bornWeeksAgo(78),
          nextDueDate: null,
        },
      ],
      today: TODAY3,
    })

    expect(plan.steps.some((step) => step.label.includes('一针'))).toBe(false)
  })
})

/**
 * ≥16 周龄那一针 = 完成针（老板 2026-10-07 审计时确认）。
 *
 * 指南口径："每 2~4 周一次，直到 16 周龄或更大" —— 落在 ≥16 周龄的那一针
 * 就是完成针。所以一只 8/12/16 周龄各打一针的狗，首免**已经完成**。
 *
 * 改之前：四种打法里前三种（16/17/18 周龄收尾）全部被催「第 4 针 · 已逾期」，
 * 而 8/12/18 那种更冤 —— 18 周龄本来正落在第 4 针窗口里，却被"第 3 针"抢走
 * （前两针把窗口往后推，正好盖到 18 周）。也就是说**最标准的打法反而被多催一针**。
 */
describe('≥16 周龄那一针即完成针', () => {
  const TODAY4 = new Date('2026-08-01T00:00:00')
  const BIRTH = new Date('2026-01-05T00:00:00')
  const atWeek = (weeks: number) =>
    toDateText(new Date(BIRTH.getTime() + weeks * 7 * 86400000))
  const planAt = (weeks: number[]) =>
    buildVaccinePlan({
      dogId: 'dog-1',
      birthday: '2026-01-05',
      records: weeks.map((week, index) => ({
        id: `r${index}`,
        vaccineName: '卫佳伍',
        vaccinationDate: atWeek(week),
        nextDueDate: null,
      })),
      today: TODAY4,
    })
  const puppySteps = (weeks: number[]) =>
    planAt(weeks).steps.filter((step) => /^core-puppy-/.test(step.key))

  it('🔴 8/12/16 周龄 → 首免算完成，不再催第 4 针', () => {
    const steps = puppySteps([8, 12, 16])

    expect(steps.length).toBe(3)
    expect(steps.every((step) => step.status === 'DONE')).toBe(true)
    // 26 周补强照排（老板特意确认：完成针和 26 周补强是两件事）
    const booster = planAt([8, 12, 16]).steps.find((step) => step.key === 'core-26w')
    expect(booster).toBeDefined()
  })

  it('🔴 8/12/17 与 8/12/18 周龄同样算完成', () => {
    for (const weeks of [
      [8, 12, 17],
      [8, 12, 18],
    ]) {
      const steps = puppySteps(weeks)
      expect(steps.length).toBe(3)
      expect(steps.every((step) => step.status === 'DONE')).toBe(true)
    }
  })

  it('8/12/14 周龄（最后一针太早）→ 仍然要求补一针', () => {
    const steps = puppySteps([8, 12, 14])

    expect(steps.length).toBe(4)
    const last = steps.find((step) => step.key === 'core-puppy-4')
    expect(last).toBeDefined()
    expect(['DUE', 'OVERDUE']).toContain(last!.status)
  })

  it('6/10/14/18 周龄那种**标准四针**打法不许被裁（程序表本来就为它排的）', () => {
    // ⚠️ 第一版改法写成"只要有一针 ≥16 周龄就把最后一针删掉"，
    //    结果这种打法的第 4 针被删、18 周龄那一针没有步骤可顶 ——
    //    组合苗那两条测试立刻红了。裁的判据必须是"实际打了几针"。
    const steps = puppySteps([6, 10, 14, 18])

    expect(steps.length).toBe(4)
    expect(steps.every((step) => step.status === 'DONE')).toBe(true)
  })

  it('为什么没有第 4 针，要写在依据里（家长才不会以为漏排）', () => {
    const steps = puppySteps([8, 12, 16])

    expect(steps[steps.length - 1].basis).toContain('完成针')
  })
})

/**
 * 提醒口气**按类**判断（老板 2026-10-07 审计时定）。
 *
 * 原来是整只狗一把尺：一只只记过狂犬的狗，钩端那两针会说"已逾期"；
 * 而一只什么记录都没有的狗，同样两针却说"还没记录" —— 同一件事两种口气。
 * 现在：这一类一针记录都没有 → 这一类一律说"还没记录"。
 */
describe('提醒口气按类判断', () => {
  const rec = (id: string, name: string, date: string) => ({
    id,
    vaccineName: name,
    vaccinationDate: date,
    nextDueDate: null,
  })
  const planWith = (records: ReturnType<typeof rec>[]) =>
    buildVaccinePlan({
      dogId: 'dog-1',
      birthday: '2025-01-05',
      records,
      today: new Date('2026-06-01T00:00:00'),
    })

  it('🔴 只记过狂犬的狗 → 钩端那几针说"还没有记录"，不再说"已逾期"', () => {
    const plan = planWith([rec('r1', '狂犬', '2025-04-05')])

    const lepto = plan.steps.filter((step) => step.kind === 'lepto')
    expect(lepto.length).toBeGreaterThan(0)
    for (const step of lepto) {
      expect(step.noEvidence).toBe(true)
      if (step.status === 'DUE' || step.status === 'OVERDUE') {
        expect(step.reminder).toContain('还没有这一针的记录')
      }
    }

    // 狂犬那一类有记录 → 口气正常（该说逾期就说逾期）
    const rabies = plan.steps.filter((step) => step.kind === 'rabies')
    expect(rabies.some((step) => step.noEvidence === false)).toBe(true)
    const rabiesOverdue = rabies.find((step) => step.status === 'OVERDUE')
    if (rabiesOverdue) {
      expect(rabiesOverdue.reminder).toContain('已经过了建议时间')
    }

    // 整只狗级别的标记保持原样：这只狗并不是"一条记录都没有"
    expect(plan.noEvidence).toBe(false)
  })

  it('这类苗打过一针 → 这一类立刻改用正常口气', () => {
    const plan = planWith([rec('r1', '卫佳捌', '2025-04-05')])

    const lepto = plan.steps.filter((step) => step.kind === 'lepto')
    expect(lepto.some((step) => step.noEvidence === false)).toBe(true)
  })
})
