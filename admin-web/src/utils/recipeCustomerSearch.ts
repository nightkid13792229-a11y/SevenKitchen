/**
 * 「私密定制食谱」填客户时的搜索（2026-10-15 老板报的"搜不到客户"）。
 *
 * 老板的实况（线上 nginx 日志 02:29~02:30，关键词是按顺序试的）：
 *   ① 输入「烟花」—— 那是**狗的名字** —— 一条也搜不出来；
 *   ② 输入 juiccy / juicc（记忆里的客户名，拼错了）—— 也是空的；
 *   于是卡在"不填客户就不能选狗"这一步，食谱存不下去。
 *
 * 原因：这个下拉框只查客户表（昵称 / 手机号），**不查狗**。
 * 可业务上员工记住的往往是"这锅是给烟花做的"，不是主人的手机号；
 * 而主人昵称又常常是微信名（Juicy Zhang 这种），拼写没把握。
 *
 * 后台其实早就有"按狗名搜狗、顺带返回主人昵称与手机号"的接口（/admin/dogs?search=），
 * 这里把它接进来：**狗名命中 → 直接把狗主人作为候选**，并在选项上标出命中的狗名 ——
 * 两位客户各有一只叫"烟花"的狗时，员工能靠手机号/狗名认出是哪一只，不会选错人。
 */

export interface CustomerSearchUser {
  id: string
  nickname?: string | null
  phone?: string | null
  status?: string | null
}

export interface CustomerSearchDog {
  id: string
  name: string
  ownerId?: string | null
  ownerNickname?: string | null
  ownerPhone?: string | null
}

export interface CustomerOption {
  id: string
  nickname?: string | null
  phone?: string | null
  status?: string | null
  /** 本次搜索命中的、这位客户名下的狗狗（用于确认"是不是那只狗"） */
  matchedDogNames: string[]
}

/**
 * 把「按客户搜」与「按狗搜」两批结果合成一份候选列表。
 *
 * 顺序：**按狗名命中的排前面**（员工输狗名时，这就是他要找的人），
 * 后面接按客户名/手机号命中的，各自保持接口返回顺序，按客户 id 去重。
 * 同一人两边都命中时，昵称/手机号/状态以**客户表**为准（更权威），命中的狗名保留。
 */
export function mergeCustomerOptions(
  users: CustomerSearchUser[] | undefined | null,
  dogs: CustomerSearchDog[] | undefined | null
): CustomerOption[] {
  const byId = new Map<string, CustomerOption>()
  const fromDogs: CustomerOption[] = []
  const fromUsers: CustomerOption[] = []

  for (const dog of dogs ?? []) {
    const ownerId = (dog?.ownerId || '').trim()
    if (!ownerId) continue
    let option = byId.get(ownerId)
    if (!option) {
      option = {
        id: ownerId,
        nickname: dog.ownerNickname ?? null,
        phone: dog.ownerPhone ?? null,
        status: null,
        matchedDogNames: [],
      }
      byId.set(ownerId, option)
      fromDogs.push(option)
    }
    const dogName = (dog.name || '').trim()
    if (dogName && !option.matchedDogNames.includes(dogName)) {
      option.matchedDogNames.push(dogName)
    }
  }

  for (const user of users ?? []) {
    const id = (user?.id || '').trim()
    if (!id) continue
    const existing = byId.get(id)
    if (existing) {
      // 客户表更权威：有值就覆盖（狗表只有昵称/手机号，没有状态）
      if (user.nickname) existing.nickname = user.nickname
      if (user.phone) existing.phone = user.phone
      if (user.status) existing.status = user.status
      continue
    }
    const option: CustomerOption = {
      id,
      nickname: user.nickname ?? null,
      phone: user.phone ?? null,
      status: user.status ?? null,
      matchedDogNames: [],
    }
    byId.set(id, option)
    fromUsers.push(option)
  }

  return [...fromDogs, ...fromUsers]
}

/** 下拉选项文案：昵称 · 手机号 · 🐶命中的狗名（已停用的账号单独标注） */
export function customerOptionLabel(option: CustomerOption): string {
  const parts: string[] = [option.nickname?.trim() || '未命名客户']
  const phone = option.phone?.trim()
  if (phone) parts.push(phone)
  if (option.matchedDogNames.length > 0) {
    parts.push(`🐶${option.matchedDogNames.join('、')}`)
  }
  const label = parts.join(' · ')
  return option.status && option.status !== 'ACTIVE' ? `${label}（已停用）` : label
}

/**
 * 关键词是不是在"找狗"。
 *
 * 纯数字（手机号/订单号）按客户搜就够了，不必再去查狗 —— 少一次请求。
 */
export function shouldSearchDogs(keyword: string): boolean {
  const trimmed = (keyword || '').trim()
  if (!trimmed) return false
  return !/^\d+$/.test(trimmed)
}
