import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
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

    it('上限提示按单位换算（200 公斤 = 400 斤）', () => {
      expect(getWeightRangeHint('KG')).toContain('200')
      expect(getWeightRangeHint('JIN')).toContain('400')
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

    it('换算比例只定义在 weight-unit 里', () => {
      const files = [
        'src/utils/weight-unit.ts',
        'src/pages/dog-create/index.vue',
        'src/pages/dog-profile-overview/index.vue',
        'src/utils/weight-management.ts',
        'src/utils/health-records.ts',
      ]

      for (const file of files) {
        const source = readSource(file)
        const definesRatio =
          /KG_PER_JIN\s*=/.test(source) || /JIN_PER_KG\s*=/.test(source)
        expect(definesRatio).toBe(file === 'src/utils/weight-unit.ts')
      }
    })

    it('换算函数只被两个页面的输入框调用，不得出现在计算或数据层', () => {
      const consumers = [
        'src/pages/dog-create/index.vue',
        'src/pages/dog-profile-overview/index.vue',
      ]

      // 每个页面只应有 2 处**调用**：输入事件 + 切换单位时把旧单位固化成公斤
      for (const file of consumers) {
        const source = readSource(file)
        const callCount = (source.match(/parseWeightInputToKg\(/g) || []).length
        expect(callCount).toBe(2)
      }

      // 计算层与数据层不得出现这个函数（它们只该见到公斤）
      for (const file of [
        'src/utils/weight-management.ts',
        'src/utils/health-records.ts',
        'src/utils/dog-profile-form.ts',
      ]) {
        expect(readSource(file)).not.toContain('parseWeightInputToKg')
      }
    })
  })
})
