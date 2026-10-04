import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf-8')

const PAGE = 'src/pages/weight-goal-plan/index.vue'
const API = 'src/api/weight-goal-plan.ts'
const CARD = 'src/components/dog-profile/WeightManagementSection.vue'

/**
 * 体重管理计划 · 顾客端（阶段 B2）
 *
 * 老板原话：不只是给用户一个记录体重的工具，而是真真正正能指导用户
 * 通过饮食增减重的可执行方案。
 *
 * 这组测试锁住三件事：
 *   1. 页面/接口真的通了（别又是「页面写好了但没登记路由」那种断电状态）
 *   2. 前端**不重复实现任何算法** —— 能量、速率、安全边界一律由后端下发
 *   3. 几条老板定的护栏在界面上真的生效
 */
describe('体重管理计划 · 接线', () => {
  it('页面已在 pages.json 注册（否则点进去是死链）', () => {
    const pagesJson = read('src/pages.json')
    expect(pagesJson).toContain('pages/weight-goal-plan/index')
  })

  it('页面文件存在且走统一的 request 封装', () => {
    expect(existsSync(resolve(process.cwd(), PAGE))).toBe(true)
    const api = read(API)
    expect(api).toContain("from '../utils/api'")
    // 不得绕过统一封装直接 uni.request（会绕过 {code,message,data} 解包）
    expect(api).not.toContain('uni.request(')
  })

  it('接口路径与后端控制器一致', () => {
    const api = read(API)
    for (const path of [
      '/weight-goal-plan/suggestion',
      '/weight-goal-plan/adjustments',
      '/weight-goal-plan/target',
      '/weight-goal-plan/intensity',
      '/weight-goal-plan/resume',
      '/weight-goal-plan/cancel',
    ]) {
      expect(api).toContain(path)
    }
  })

  it('体重管理区挂着计划卡片与入口', () => {
    const card = read(CARD)
    expect(card).toContain('weightGoalPlanApi')
    expect(card).toContain('plan-card')
    expect(card).toContain('设定体重目标')
    // 记完体重必须刷新计划 —— 后端会在那一步按实测速率自动校正力度
    expect(card).toContain('await loadPlan()')
  })
})

describe('体重管理计划 · 前端不重复实现算法', () => {
  it('页面里不出现自己的能量/速率计算公式', () => {
    const page = read(PAGE)
    // 页面只做展示与回传；一旦开始自己算 RER / 校正，两边迟早对不上
    expect(page).not.toContain('** 0.75')
    expect(page).not.toContain('Math.pow')
    expect(page).not.toMatch(/\bRER\b\s*=/)
    expect(page).not.toMatch(/0\.6\s*\*/)
  })

  it('API 层是纯透传，不含业务规则', () => {
    const api = read(API)
    expect(api).not.toContain('** 0.75')
    expect(api).not.toMatch(/\bRER\b\s*=/)
  })

  it('文案函数只负责措辞，不参与决策', () => {
    const api = read(API)
    const describe = api.match(/export function describeRate[\s\S]*?\n\}/)?.[0] || ''
    expect(describe).not.toBe('')
    // 它只返回一句话和一个语气标记，不返回任何要落库/要回传的数值
    expect(describe).toContain("tone:")
    expect(describe).not.toContain('return { kcal')
  })
})

describe('体重管理计划 · 老板定的护栏', () => {
  it('BCS 4-5 是理想区间 → 不在页面上推销计划', () => {
    const card = read(CARD)
    const canOffer = card.match(/const canOfferPlan = computed[\s\S]*?\n\}\)/)?.[0] || ''
    expect(canOffer).not.toBe('')
    expect(canOffer).toContain('bcs >= 6 || bcs <= 3')
  })

  it('缺体重或体况分时先说清楚缺什么，而不是直接报错', () => {
    const card = read(CARD)
    expect(card).toContain('planBlockedReason')
    expect(card).toContain('还没有当前体重')
    expect(card).toContain('还没有确认体况评分')
  })

  it('增重方向先做站内排查，出现危险信号就提示就医', () => {
    const page = read(PAGE)
    expect(page).toContain('showScreening')
    expect(page).toContain('losing_weight')
    expect(page).toContain('poor_appetite')
    expect(page).toContain('vomiting_diarrhea')
    expect(page).toContain('建议先带狗狗去兽医看看')
    // 出现危险信号时不能继续进入方案
    expect(page).toContain('screeningResult.value.needsVet')
  })

  it('力度只能往更温和方向调', () => {
    const page = read(PAGE)
    expect(page).toContain('selectAdjustIntensity')
    expect(page).toContain('只能往更温和方向调')
    // 不可选的档位点了给提示，不静默失败
    expect(page).toContain('level.allowed')
  })

  /**
   * 2026-10-04 修正：增重方向的档位命名原先是「标准 / 温和 / 更温和」——
   * 那是减重的语义（系数越大掉秤越慢才叫更温和）。增重恰好相反：
   * 系数越大 = 热量越多 = 长肉越快，叫"更温和"会让人选到最快的一档。
   */
  it('增重档位命名与效果一致：标准 / 加快 / 更快', () => {
    const page = read(PAGE)
    expect(page).toContain("label: '加快'")
    expect(page).toContain("label: '更快'")
    // 减重方向仍保留"温和"的语义
    expect(page).toContain("label: '温和'")
    expect(page).toContain("label: '更温和'")
  })

  it('力度说明按方向分开写，不再把"掉秤"的文案套给增重', () => {
    const page = read(PAGE)
    expect(page).toContain('isLossDirection')
    expect(page).toContain('档位越高，长肉越快')
    expect(page).toContain('只能往更保守方向调')
  })

  it('目标体重完全自由，偏离 >30% 只提示不拦', () => {
    const page = read(PAGE)
    expect(page).toContain('targetHint')
    expect(page).toContain('相差超过 30%')
    // 提示而已 —— 按钮不能因此被禁用
    expect(page).toMatch(/:disabled="submitting \|\| !targetChanged"/)
  })

  it('达标后说明「这不是结束」，而不是显示已完成', () => {
    const card = read(CARD)
    expect(card).toContain('维持期')
    expect(card).toContain('这不是结束')
  })

  it('暂停时说明怎么恢复', () => {
    const card = read(CARD)
    expect(card).toContain('计划已暂停')
    expect(card).toContain('恢复计划')
  })

  it('结束/取消会说明后果（能量立刻恢复维持量）', () => {
    const card = read(CARD)
    const page = read(PAGE)
    expect(card).toContain('恢复成正常维持量')
    expect(page).toContain('恢复成正常维持量')
  })
})

describe('体重管理计划 · 体重单位', () => {
  it('目标体重支持斤/公斤切换，避免「斤当公斤」的老问题', () => {
    const page = read(PAGE)
    expect(page).toContain('parseWeightInputToKg')
    expect(page).toContain('formatWeightForInput')
    expect(page).toContain("type WeightUnit")
    // 内部一律存公斤：输入事件与单位切换都必须经过换算函数
    expect(page).toMatch(/targetWeightKg\.value = parseWeightInputToKg/)
    expect(page).toMatch(/const kg = parseWeightInputToKg/)
  })
})
