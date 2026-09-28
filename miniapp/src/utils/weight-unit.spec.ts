import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MAX_WEIGHT_KG,
  formatWeightEcho,
  formatWeightForInput,
  getWeightRangeHint,
  getWeightUnitLabel,
  parseWeightInputToKg,
} from './weight-unit'

/**
 * 体重单位换算（2026-09-27）
 *
 * 背景：体重输入框原先屏幕上不写单位，国内顾客按「斤」填会被当成「公斤」，
 * 热量直接翻倍或严重不足 —— 而体重是算量与报价的入口。
 * 这组测试锁住「内部一律公斤、只在输入层换算」这个约定。
 */
describe('weight unit conversion', () => {
  describe('parseWeightInputToKg（输入框 → 内部存储）', () => {
    it('公斤模式原值保留', () => {
      expect(parseWeightInputToKg('12.5', 'KG')).toBe('12.5')
    })

    it('斤模式换算成公斤（1 斤 = 0.5 公斤）', () => {
      // 顾客按斤填 25，必须存成 12.5 公斤，否则热量会翻倍
      expect(parseWeightInputToKg('25', 'JIN')).toBe('12.5')
    })

    it('斤模式支持小数', () => {
      expect(parseWeightInputToKg('11.4', 'JIN')).toBe('5.7')
    })

    it('空输入返回空字符串，交给既有校验去提示', () => {
      expect(parseWeightInputToKg('', 'KG')).toBe('')
      expect(parseWeightInputToKg('   ', 'JIN')).toBe('')
      expect(parseWeightInputToKg(null, 'KG')).toBe('')
      expect(parseWeightInputToKg(undefined, 'JIN')).toBe('')
    })

    it('非数字输入返回空字符串，而不是 NaN', () => {
      expect(parseWeightInputToKg('abc', 'KG')).toBe('')
      expect(parseWeightInputToKg('12kg', 'JIN')).toBe('')
    })

    it('顾客正在输入的中间态（如 "12."）不会崩', () => {
      // "12." 在 Number() 下是合法的 12
      expect(parseWeightInputToKg('12.', 'KG')).toBe('12')
    })
  })

  describe('formatWeightForInput（内部存储 → 输入框）', () => {
    it('公斤模式原值展示', () => {
      expect(formatWeightForInput('12.5', 'KG')).toBe('12.5')
    })

    it('斤模式换算后展示', () => {
      expect(formatWeightForInput('12.5', 'JIN')).toBe('25')
    })

    it('去掉多余的小数位与尾随 0', () => {
      expect(formatWeightForInput('12.50', 'KG')).toBe('12.5')
      expect(formatWeightForInput('25.00', 'JIN')).toBe('50')
    })

    it('空值返回空字符串', () => {
      expect(formatWeightForInput('', 'KG')).toBe('')
      expect(formatWeightForInput(null, 'JIN')).toBe('')
    })

    it('可解析的数字会被规范化（含正在输入的中间态）', () => {
      // "12." 在 Number() 下就是 12，这里做的是"格式化已存值"，
      // 而不是保留顾客的按键序列 —— 防打字被打断由页面的本地输入文本负责。
      expect(formatWeightForInput('12.', 'KG')).toBe('12')
    })

    it('真正无法解析的内容原样返回，避免把输入抹掉', () => {
      expect(formatWeightForInput('abc', 'JIN')).toBe('abc')
    })
  })

  describe('单位往返不丢精度', () => {
    it('公斤 → 斤 → 公斤 保持一致', () => {
      for (const kg of ['2.5', '5.7', '12.5', '30', '45.25']) {
        const jin = formatWeightForInput(kg, 'JIN')
        expect(parseWeightInputToKg(jin, 'JIN')).toBe(kg)
      }
    })
  })

  describe('提示文案跟随单位', () => {
    it('单位标签正确', () => {
      expect(getWeightUnitLabel('KG')).toBe('公斤')
      expect(getWeightUnitLabel('JIN')).toBe('斤')
    })

    it('上限提示按单位换算（130 公斤 = 260 斤）', () => {
      // 2026-09-28：上限从 200 收紧到 130（历史上最重的犬只约 155 kg）
      expect(MAX_WEIGHT_KG).toBe(130)
      expect(getWeightRangeHint('KG')).toContain('130')
      expect(getWeightRangeHint('JIN')).toContain('260')
    })

  })

  /**
   * 「斤」不得渗进数据层（2026-09-27 老板依据此结论决定保留双单位）
   *
   * 安全性不来自"到处都写换算"，而来自**换算点只有一个**：
   * 顾客可能在输入框里填斤，但输入事件会立刻把它换算成公斤存入表单；
   * 之后的热量计算、体重记录、定价与后台全部只见到公斤。
   * 换算点越少，出错的机会越少 —— 这组测试把这个不变式锁住。
   */
  describe('换算点唯一性（守护）', () => {
    const readSource = (relativePath: string) =>
      readFileSync(resolve(process.cwd(), relativePath), 'utf-8')

    /**
     * 允许出现换算的**输入口**（2026-09-27：健康页也统一后共 3 处）。
     * 只有这三处能拿到"顾客可能填斤"的原始输入。
     */
    const INPUT_SURFACES = [
      'src/pages/dog-create/index.vue',
      'src/pages/dog-profile-overview/index.vue',
      'src/components/dog-profile/WeightManagementSection.vue',
    ]

    it('换算比例只定义在 weight-unit 里', () => {
      const files = [
        'src/utils/weight-unit.ts',
        ...INPUT_SURFACES,
        'src/utils/weight-management.ts',
        'src/utils/health-records.ts',
        'src/utils/dog-profile-form.ts',
      ]

      for (const file of files) {
        const source = readSource(file)
        const definesRatio =
          /KG_PER_JIN\s*=/.test(source) || /JIN_PER_KG\s*=/.test(source)
        expect(definesRatio).toBe(file === 'src/utils/weight-unit.ts')
      }
    })

    it('换算函数只出现在三个输入口，且每个 2 处调用', () => {
      for (const file of INPUT_SURFACES) {
        const source = readSource(file)
        const callCount = (source.match(/parseWeightInputToKg\(/g) || []).length
        // 输入事件 + 切换单位时把旧单位固化成公斤
        expect(callCount).toBe(2)
      }
    })

    it('计算层与数据层不得出现换算函数（它们只该见到公斤）', () => {
      for (const file of [
        'src/utils/weight-management.ts',
        'src/utils/health-records.ts',
        'src/utils/dog-profile-form.ts',
      ]) {
        expect(readSource(file)).not.toContain('parseWeightInputToKg')
      }
    })

    it('三个体重输入口都提供了单位切换，行为一致', () => {
      for (const file of INPUT_SURFACES) {
        const source = readSource(file)
        expect(source).toContain('weight-unit-toggle')
        expect(source).toContain('weightUnitOptions')
      }
    })
  })
})

describe('formatWeightEcho（双向单位回显）', () => {
  // 这是唯一保留的体重提示：只做客观的单位换算，不做任何合理性判断
  // （2026-09-28 老板决定：不要给错误的提醒）。
  it('当前显示公斤时回显斤', () => {
    expect(formatWeightEcho(21.5, 'KG')).toBe('= 43 斤')
  })

  it('当前显示斤时回显公斤', () => {
    expect(formatWeightEcho(21.5, 'JIN')).toBe('= 21.5 公斤')
  })

  it('空值或非法值不显示', () => {
    expect(formatWeightEcho('', 'KG')).toBe('')
    expect(formatWeightEcho(null, 'KG')).toBe('')
    expect(formatWeightEcho(0, 'KG')).toBe('')
  })
})
