import {
  classifyVaccineKinds,
  recordCoversStep,
} from '../../../src/domain/health/immunization-schedule';
import { normalizeDrafts } from '../../../src/application/health/health-report-extraction.service';
import {
  findProductByText,
  suggestProductsForPartialName,
} from '../../../src/domain/health/vaccine-products';

/**
 * 疫苗本的归类**一律查我们自己的产品表**（2026-10-06 老板拍板）。
 *
 * 老板原话："AI 只负责认产品，分类永远由兽医审过的表定义。"
 *
 * 背景：疫苗本那段提示词里原来写着"归类由你来判"，AI 真的判了 ——
 * 而且判错了：「宠必威® 幼犬保」被当成 core（核心疫苗），
 * 它其实是 core_early（早期核心疫苗，4 周龄那一针抢跑，接种周期完全不同）。
 * 分类直接决定"这一针算哪一步、隔多久再打"，判错就把免疫计划带偏。
 *
 * 这组测试锁两件事：
 *   ① 草稿里的 kinds 来自产品表，**不管 AI 回了什么**
 *   ② 表里认不出来的 → 空数组（老实承认，交回顾客），绝不猜成核心苗
 */
describe('疫苗本 · 归类一律查产品表（2026-10-06）', () => {
  const bookWith = (vaccineName: string, aiKinds?: unknown) => ({
    drafts: [
      {
        vaccineName,
        ...(aiKinds === undefined ? {} : { kinds: aiKinds }),
        vaccinationDate: '2026-05-10',
        nextDueDate: '',
        notes: '',
      },
    ],
  });

  it('🔴 AI 说核心疫苗也没用 —— 幼犬保按产品表是早期核心疫苗', () => {
    const drafts = normalizeDrafts(
      'VACCINE_BOOK',
      // AI 当年就是这么回的：判成了普通核心疫苗
      bookWith('宠必威® 幼犬保', ['core']),
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0].kinds).toEqual(['core_early']);
  });

  it('带 ® 和不带 ® 的写法都认得出（归一化在 domain 层）', () => {
    for (const name of ['宠必威® 幼犬保', '宠必威幼犬保', '幼犬保']) {
      expect(normalizeDrafts('VACCINE_BOOK', bookWith(name))[0].kinds).toEqual([
        'core_early',
      ]);
    }
  });

  it('组合苗按真实成分带出好几类（卫佳捌 = 核心 + 钩端）', () => {
    const drafts = normalizeDrafts('VACCINE_BOOK', bookWith('卫佳捌'));

    expect(drafts[0].kinds).toContain('core');
    expect(drafts[0].kinds).toContain('lepto');
  });

  it('表里没有、也没有对应病名的 → 空数组，绝不猜成核心苗', () => {
    // 驱虫药「拜宠清」根本不是疫苗。老提示词让 AI 填 other，
    // 新口径下它属于"我们认不出来" → 空数组 → 界面请顾客自己选
    const drafts = normalizeDrafts('VACCINE_BOOK', bookWith('拜宠清'));

    expect(drafts[0].kinds).toEqual([]);
    expect(drafts[0].kinds).not.toContain('core');
  });

  it('自由文本仍然按病名/联数判（六联、犬瘟热这类手写写法）', () => {
    expect(normalizeDrafts('VACCINE_BOOK', bookWith('六联'))[0].kinds).toContain('core');
    expect(normalizeDrafts('VACCINE_BOOK', bookWith('狂犬疫苗'))[0].kinds).toContain('rabies');
  });

  it('AI 瞎填的归类字段被完全忽略（哪怕填了个合法值）', () => {
    const drafts = normalizeDrafts(
      'VACCINE_BOOK',
      bookWith('拜宠清', ['core']),
    );

    // 如果还把 AI 的话当回事，这里就会是 ['core'] —— 那正是要杜绝的
    expect(drafts[0].kinds).toEqual([]);
  });

  it('草稿字段本身照旧（名字/日期/备注一个不少）', () => {
    const drafts = normalizeDrafts('VACCINE_BOOK', bookWith('犬四联'));

    expect(drafts[0]).toMatchObject({
      vaccineName: '犬四联',
      vaccinationDate: '2026-05-10',
      nextDueDate: '',
      notes: '',
    });
  });
});

/**
 * 提示词层面：不能再让模型判分类。
 */
describe('疫苗本 · 提示词不再让 AI 判分类（2026-10-06）', () => {
  function readService() {
    // 提示词是模块内常量，这里读源码确认口径（与其它提示词断言同一路子）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    const path = require('path');
    return fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../src/application/health/health-report-extraction.service.ts',
      ),
      'utf-8',
    );
  }

  it('疫苗本提示词里不再出现"由你来判"', () => {
    const source = readService();

    expect(source).not.toContain('归类（kinds 字段）—— 2026-10-05 老板拍板：**由你来判**');
    expect(source).toContain('★ 归类（kinds 字段）—— **不用你管**');
    // 也不许再把 kinds 写进输出示例（写了模型就会填）
    expect(source).not.toContain('"vaccineName": "犬四联", "kinds": ["core"]');
  });

  it('草稿映射里用的是产品表那条函数，不是 AI 给的字段', () => {
    const source = readService();

    expect(source).toContain('kinds: classifyVaccineKinds(vaccineName)');
    expect(source).not.toContain('normalizeKinds(item?.kinds)');
    // 那个只服务于"信 AI 判定"的闭集校验函数已经删掉
    expect(source).not.toContain('export function normalizeKinds');
  });

  it('domain 那条分类函数仍然是唯一一份定义', () => {
    // 同一个名字，产品表说了算
    expect(classifyVaccineKinds('宠必威® 幼犬保')).toEqual(['core_early']);
    expect(classifyVaccineKinds('拜宠清')).toEqual([]);
  });
});

/**
 * 认到"具体是哪一支"（2026-10-06 老板实测）。
 *
 * 老板发来一张截图：瓶签写「卫佳® Vanguard® Plus 5/CV-L」，
 * 问"为什么没有把图中的这一个疫苗判定为卫佳伍呢？"
 *
 * 查下来：**它就不是卫佳伍**。
 *   · 卫佳捌 = Vanguard Plus 5/CV-L（含冠状病毒 + 钩端螺旋体，八联），别名 vanguard plus 5-cvl
 *   · 卫佳伍 = Vanguard Plus 5（不带 CV-L），分类只有 core
 * 分类给出的 core + lepto 正说明后端认的是**卫佳捌** —— 判对了。
 * 缺的只是"把规范名显示出来"，所以加了 productName。
 */
describe('疫苗本 · 认出具体是哪一支产品（2026-10-06）', () => {
  const BOTTLE = '卫佳® Vanguard® Plus 5/CV-L';

  it('🔴 带 CV-L 的瓶签归「卫佳捌」，不能掉到「卫佳伍」上', () => {
    const product = findProductByText(BOTTLE);

    expect(product).toBeTruthy();
    expect(product?.name).toBe('卫佳捌');
    expect(product?.name).not.toBe('卫佳伍');
  });

  it('不带 CV-L 的才归「卫佳伍」', () => {
    expect(findProductByText('Vanguard Plus 5')?.name).toBe('卫佳伍');
    expect(findProductByText('卫佳伍')?.name).toBe('卫佳伍');
  });

  it('这一支的成分确实含钩端螺旋体（所以分类是 core + lepto）', () => {
    const product = findProductByText(BOTTLE);

    expect(product?.kinds).toContain('core');
    expect(product?.kinds).toContain('lepto');
  });

  it('识别草稿里带上规范名，认不出来就是空串（绝不硬塞）', () => {
    const recognized = normalizeDrafts('VACCINE_BOOK', {
      drafts: [{ vaccineName: BOTTLE, vaccinationDate: '2026-07-18' }],
    });
    expect(recognized[0].vaccineName).toBe(BOTTLE); // 原文照旧留着
    expect(recognized[0].productName).toBe('卫佳捌'); // 规范名另给一个字段

    const unknown = normalizeDrafts('VACCINE_BOOK', {
      drafts: [{ vaccineName: '某某某牌疫苗', vaccinationDate: '2026-07-18' }],
    });
    expect(unknown[0].productName).toBe('');
  });

  it('分类与规范名出自同一份匹配（不会一个认卫佳捌、一个认卫佳伍）', () => {
    const drafts = normalizeDrafts('VACCINE_BOOK', {
      drafts: [{ vaccineName: BOTTLE, vaccinationDate: '2026-07-18' }],
    });

    expect(drafts[0].productName).toBe('卫佳捌');
    expect(drafts[0].kinds).toEqual(findProductByText(BOTTLE)?.kinds);
  });
});

/**
 * 副流感不是核心疫苗（2026-10-06 老板指出并核实）。
 *
 * WSAVA 2024 的口径：犬的核心疫苗只有三支 —— 犬瘟病毒、腺病毒、细小病毒；
 * **副流感属于非核心**（和博德特氏菌一起归在"犬窝咳"那一类，按生活方式评估）。
 * 来源：WSAVA 2024 guidelines（Squires et al., JSAP 65(5):277–316），
 * 见 RSPCA 知识库对该指南的转述。
 *
 * 以前把副流感算核心的后果很实际：一支"副流感单苗"能顶掉核心苗的某一针，
 * 我们从此不再提醒那一针 —— 和当年把驱虫药当核心苗是同一类错误。
 */
describe('分类口径 · 副流感改回非核心（2026-10-06）', () => {
  it('🔴 副流感不再算核心疫苗', () => {
    const kinds = classifyVaccineKinds('犬副流感');

    expect(kinds).not.toContain('core');
    expect(kinds).toContain('other');
  });

  it('犬窝咳 / 副流感 / 博德特 都归"其他（非核心）"，不影响计划', () => {
    for (const name of ['犬窝咳', '副流感单苗', '博德特氏菌苗']) {
      expect(classifyVaccineKinds(name)).toContain('other');
    }
  });

  it('但联苗仍然算核心（联苗按惯例覆盖那三种核心病）', () => {
    for (const name of ['犬四联', '犬八联', '卫佳伍', '六联']) {
      expect(classifyVaccineKinds(name)).toContain('core');
    }
  });

  it('犬瘟 / 细小 / 腺病毒 单拎出来仍然算核心', () => {
    for (const name of ['犬瘟热', '细小病毒', '犬腺病毒']) {
      expect(classifyVaccineKinds(name)).toContain('core');
    }
  });
});

/**
 * 名字没读全要诚实说（2026-10-06 老板实测）。
 *
 * 老板："并不完全保证能识别出卫佳8，有可能它还是识别出卫佳，
 * 并没有识别出8这个字。如果不能完全有把握的识别出来，能不能诚实的
 * 告诉用户呢？"
 */
describe('识别 · 名字没读全时给候选（2026-10-06）', () => {
  it('🔴 只读到「卫佳」→ 给出卫佳系列的三支', () => {
    const names = suggestProductsForPartialName('卫佳').map((p) => p.name);

    expect(names).toContain('卫佳伍');
    expect(names).toContain('卫佳捌');
    expect(names).toContain('卫佳细');
  });

  it('读全了就不给候选（没什么要提醒的）', () => {
    expect(suggestProductsForPartialName('卫佳捌')).toEqual([]);
  });

  it('英文名读了一半也给候选', () => {
    const names = suggestProductsForPartialName('Vanguard').map((p) => p.name);
    expect(names.length).toBeGreaterThan(0);
  });

  it('太短的前缀不给（一两个字会命中一大堆，反而误导）', () => {
    expect(suggestProductsForPartialName('卫')).toEqual([]);
    expect(suggestProductsForPartialName('')).toEqual([]);
  });

  it('草稿里带上候选；认全了就是空数组', () => {
    const partial = normalizeDrafts('VACCINE_BOOK', {
      drafts: [{ vaccineName: '卫佳', vaccinationDate: '2026-07-18' }],
    });
    expect(partial[0].productName).toBe('');
    expect(partial[0].nameSuggestions).toContain('卫佳捌');

    const full = normalizeDrafts('VACCINE_BOOK', {
      drafts: [{ vaccineName: '卫佳捌', vaccinationDate: '2026-07-18' }],
    });
    expect(full[0].productName).toBe('卫佳捌');
    expect(full[0].nameSuggestions).toEqual([]);
  });
});

/**
 * "能不能顶掉核心首免"的判据，也按三支核心病（2026-10-06）。
 *
 * 这里原来要求把**四种**病名写全（含副流感）。WSAVA 2024 里核心只有
 * 犬瘟、腺病毒、细小三支，副流感属非核心 —— 所以"病名写全"的判据改三种。
 */
describe('核心覆盖 · 三种核心病写全即可（2026-10-06）', () => {
  it('🔴 犬瘟 + 细小 + 腺病毒 = 顶得上核心首免（不再要求副流感）', () => {
    expect(recordCoversStep('犬瘟热 细小病毒 腺病毒', 'core')).toBe(true);
  });

  it('🔴 只有犬瘟 + 细小 + 副流感（缺腺病毒）→ 顶不上核心首免', () => {
    expect(recordCoversStep('犬瘟 细小 副流感', 'core')).toBe(false);
  });

  it('四联及以上仍然算（手写记录里第三/四联是什么我们不知道，宁可多提醒）', () => {
    expect(recordCoversStep('犬四联', 'core')).toBe(true);
    expect(recordCoversStep('犬八联', 'core')).toBe(true);
  });

  it('三联的手写记录顶不上 —— 多提醒一次比误判成已完成好', () => {
    expect(recordCoversStep('犬三联', 'core')).toBe(false);
  });
});

/**
 * 真实疫苗本上抄下来的写法要认得出（2026-10-09 老板实测带出来的）。
 *
 * 他本子上那支「宠必威锐必威」被模型读成了「英特威® 优免康」——
 * 产品是**对的那一支**（英特威/默沙东的优免康），只是品牌前缀被模型写成了
 * 另一个品牌名（英特威 vs 宠必威，这俩确实容易串）。
 *
 * 这件事的后果不只是显示名难看：**计划那边是靠名字反推"这一针顶哪一类"的**，
 * 名字查不到库里就等于这一针白打了 —— 实测赛文那条 2023-08-09 的优免康记录
 * 就是这么被漏掉的（核心疫苗仍然显示"该打了"）。
 * 所以"带错品牌前缀也要认得出"是必须的。
 */
describe('疫苗本 · 带错品牌前缀也要认得出（2026-10-09）', () => {
  it('「英特威® 优免康」要认到宠必威优免康（且含 core）', () => {
    const product = findProductByText('英特威® 优免康');

    expect(product).toBeTruthy();
    expect(product?.name).toContain('优免康');
    expect(product?.kinds).toContain('core');
  })

  it('只写商品名（优免康）也认得出', () => {
    expect(findProductByText('优免康')?.name).toContain('优免康')
  })
})
