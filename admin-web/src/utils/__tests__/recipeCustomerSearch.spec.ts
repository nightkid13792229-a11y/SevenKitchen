import { describe, expect, it } from 'vitest'
import {
  customerOptionLabel,
  mergeCustomerOptions,
  shouldSearchDogs,
  type CustomerOption,
  type CustomerSearchDog,
  type CustomerSearchUser,
} from '../recipeCustomerSearch'

/**
 * 2026-10-15 老板报的「私密定制食谱填客户时搜不到人」回归。
 *
 * 实况（线上 nginx 日志 02:29~02:30）：老板在客户框里输入「烟花」（狗的名字）→ 0 条；
 * 又输入 juiccy / juicc（记忆里的客户名，拼错）→ 0 条；卡在"不填客户就不能选狗"。
 * 而线上确实有一位 Juicy Zhang（18616332107）名下有只狗叫「烟花」——
 * 只是这个下拉框从来不查狗，所以按狗名搜永远搜不到。
 *
 * 这组测试锁住：
 *   ① 按狗名命中 → 狗主人出现在候选里（这是本 bug 的核心）
 *   ② 同一个人被"客户搜索"和"狗搜索"同时命中 → 只出现一次，且保留命中的狗名
 *   ③ 昵称/手机号/状态以客户表为准（狗表没有状态），狗名不会被覆盖掉
 *   ④ 两位客户各有一只同名狗时，选项文案能区分（手机号 + 狗名都在）
 *   ⑤ 纯数字（手机号）不去查狗，省一次请求
 */
const juicy: CustomerSearchUser = {
  id: 'u-juicy',
  nickname: 'Juicy Zhang',
  phone: '18616332107',
  status: 'ACTIVE',
}
const merged: CustomerSearchUser = {
  id: 'u-merged',
  nickname: 'Juicy Zhang(已合并)',
  phone: null,
  status: 'INACTIVE',
}
const boss: CustomerSearchUser = {
  id: 'u-boss',
  nickname: 'seven爸爸',
  phone: '18628258025',
  status: 'ACTIVE',
}

const dogYanhuaOfJuicy: CustomerSearchDog = {
  id: 'd-1',
  name: '烟花',
  ownerId: 'u-juicy',
  ownerNickname: 'Juicy Zhang',
  ownerPhone: '18616332107',
}
const dogYanhuaOfBoss: CustomerSearchDog = {
  id: 'd-2',
  name: '烟花',
  ownerId: 'u-boss',
  ownerNickname: 'seven爸爸',
  ownerPhone: '18628258025',
}

/** 取第 n 个候选（tsconfig 开了 noUncheckedIndexedAccess，直接 [0] 会被判可能为 undefined） */
function at(options: CustomerOption[], index = 0): CustomerOption {
  const option = options[index]
  if (!option) throw new Error(`候选列表里没有第 ${index + 1} 项`)
  return option
}

describe('私密定制食谱：按狗名也能找到客户', () => {
  it('搜「烟花」：即使客户表一个人都没匹配上，狗主人也要出现在候选里', () => {
    const options = mergeCustomerOptions([], [dogYanhuaOfJuicy])

    expect(options).toHaveLength(1)
    expect(at(options).id).toBe('u-juicy')
    expect(at(options).nickname).toBe('Juicy Zhang')
    expect(at(options).phone).toBe('18616332107')
    expect(at(options).matchedDogNames).toEqual(['烟花'])
  })

  it('两位客户各有一只叫「烟花」的狗：两个人都出现，选项文案能区分', () => {
    const options = mergeCustomerOptions([], [dogYanhuaOfJuicy, dogYanhuaOfBoss])

    expect(options.map((o) => o.id)).toEqual(['u-juicy', 'u-boss'])
    expect(customerOptionLabel(at(options))).toBe(
      'Juicy Zhang · 18616332107 · 🐶烟花'
    )
    expect(customerOptionLabel(at(options, 1))).toBe('seven爸爸 · 18628258025 · 🐶烟花')
  })

  it('同一个人两边都命中：只出现一次，保留狗名，昵称/状态以客户表为准', () => {
    // 老板实际遇到的组合：搜「juicy」命中两个客户账号，其中一个账号名下没有狗
    const options = mergeCustomerOptions([juicy, merged], [dogYanhuaOfJuicy])

    expect(options).toHaveLength(2)
    // 按狗名命中的排前面，且不重复
    expect(options.map((o) => o.id)).toEqual(['u-juicy', 'u-merged'])
    // 客户表里没有狗的人不会被塞进狗名
    expect(at(options, 1).matchedDogNames).toEqual([])
    expect(customerOptionLabel(at(options, 1))).toBe(
      'Juicy Zhang(已合并)（已停用）'
    )
  })

  it('狗表里没有状态字段：合并后用客户表的状态覆盖，狗名不会被冲掉', () => {
    const option = at(mergeCustomerOptions([juicy], [dogYanhuaOfJuicy]))

    expect(option.status).toBe('ACTIVE')
    expect(option.matchedDogNames).toEqual(['烟花'])
    expect(customerOptionLabel(option)).toBe('Juicy Zhang · 18616332107 · 🐶烟花')
  })

  it('只有客户命中时，文案与旧版一致（不额外加狗名）', () => {
    const options = mergeCustomerOptions([juicy], [])

    expect(customerOptionLabel(at(options))).toBe('Juicy Zhang · 18616332107')
  })

  it('昵称和手机号都没有的账号也不会显示成空白项', () => {
    const options = mergeCustomerOptions(
      [{ id: 'u-empty', nickname: null, phone: null, status: 'ACTIVE' }],
      []
    )

    expect(customerOptionLabel(at(options))).toBe('未命名客户')
  })

  it('没有主人的狗（脏数据）直接跳过，不产生空选项', () => {
    const options = mergeCustomerOptions(
      [],
      [{ id: 'd-x', name: '烟花', ownerId: null }]
    )

    expect(options).toEqual([])
  })

  it('纯数字关键词（手机号）不去查狗，少一次请求', () => {
    expect(shouldSearchDogs('18616332107')).toBe(false)
    expect(shouldSearchDogs('186')).toBe(false)
    expect(shouldSearchDogs('烟花')).toBe(true)
    expect(shouldSearchDogs('juicy')).toBe(true)
    expect(shouldSearchDogs('')).toBe(false)
    expect(shouldSearchDogs('   ')).toBe(false)
  })
})
