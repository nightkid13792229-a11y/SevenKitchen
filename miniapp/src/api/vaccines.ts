/**
 * ══ 疫苗板块 · 接口封装（2026-10-15 从 `api/dogs.ts` 里拆出来）══════════════
 *
 * 技术方案《四、前端结构》第一条：`src/api/vaccines.ts` 负责
 * 记录 / 抗体检测 / 目录 / 归类 / 计划 / 决定这六件事。
 *
 * ⚠️ 契约是**冻结**的（后端按同一份契约实现），三条硬口径：
 *   ① `GET /dogs/:dogId/vaccine-plan` **一次给全** —— 下一针、计划、忽略、节奏、
 *      待核对条数都在里面；前端不再自己拼第二份（技术方案 3.1）；
 *   ② 记录入参**没有** `nextDueDate` / `status`，也**不许传** `kinds`
 *      （后端按病种/名字算，技术方案 3.2）；
 *   ③ 计划接口**没有 `audience` 参数**（老版本那个参数后端本来就是 `void`，已删）。
 *
 * 写操作成功后由调用方（`VaccineTab`）**重新拉一次计划接口**整屏重绘 ——
 * 接口层不缓存、不在本地改结果（技术方案 3.4）。
 */

import { request } from '../utils/api'
import type {
  AntibodyTest,
  AntibodyTestPayload,
  VaccineCatalogResponse,
  VaccineDecisionPayload,
  VaccinePlanResponse,
  VaccineRecord,
  VaccineRecordPayload,
} from '../domain/vaccine/types'

/**
 * 列表响应的读取（契约里 `data` 就是数组；同时容忍 `{ records: [] }` 这种老形状）。
 *
 * 为什么容忍：这个接口老版本返回的是 `{ total, records }`，
 * 万一某一端先上/后上，页面不该整块空掉 —— 空列表和"真的没有记录"
 * 在界面上是两种说法（需求 R13：加载失败 ≠ 没有记录）。
 */
function readList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  const recordList = (data as { records?: unknown } | null | undefined)?.records
  return Array.isArray(recordList) ? (recordList as T[]) : []
}

/**
 * ⚠️ 记录与抗体检测的删除方法一律叫 `remove`（`delete` 是 JS 关键字，
 *    写成对象方法名在某些压缩器下会被搅乱 —— 这个项目的既有约定）。
 */
export const vaccineApi = {
  /**
   * 主接口：免疫计划 + 下一针 + 忽略 + 节奏 + 待核对条数。
   *
   * `suppressErrorToast`：这一页自己会画"没加载出来 + 重新加载"（需求 R13），
   * 不需要再叠一个两秒就消失的 toast。
   */
  plan: (dogId: string) =>
    request<VaccinePlanResponse>({
      url: `/dogs/${dogId}/vaccine-plan`,
      method: 'GET',
      suppressErrorToast: true,
    }),

  /** 接种记录（字段：id / vaccineName / vaccinationDate / notes / attachments / …） */
  records: {
    list: async (dogId: string): Promise<VaccineRecord[]> =>
      readList<VaccineRecord>(
        (
          await request<unknown>({
            url: `/dogs/${dogId}/vaccines`,
            method: 'GET',
            suppressErrorToast: true,
          })
        ).data,
      ),
    create: (dogId: string, data: VaccineRecordPayload) =>
      request<unknown>({ url: `/dogs/${dogId}/vaccines`, method: 'POST', data }),
    update: (dogId: string, recordId: string, data: Partial<VaccineRecordPayload>) =>
      request<unknown>({
        url: `/dogs/${dogId}/vaccines/${encodeURIComponent(recordId)}`,
        method: 'PUT',
        data,
      }),
    remove: (dogId: string, recordId: string) =>
      request<unknown>({
        url: `/dogs/${dogId}/vaccines/${encodeURIComponent(recordId)}`,
        method: 'DELETE',
      }),
  },

  /**
   * 抗体检测（新增的四个接口）。
   *
   * ⚠️ `targets=RABIES` **不影响计划**，只作为出行/出入境证明记录 ——
   *    所以界面上它跟接种记录并排显示，但不改变"下一针"。
   */
  antibodyTests: {
    list: async (dogId: string): Promise<AntibodyTest[]> =>
      readList<AntibodyTest>(
        (
          await request<unknown>({
            url: `/dogs/${dogId}/antibody-tests`,
            method: 'GET',
            suppressErrorToast: true,
          })
        ).data,
      ),
    create: (dogId: string, data: AntibodyTestPayload) =>
      request<unknown>({ url: `/dogs/${dogId}/antibody-tests`, method: 'POST', data }),
    update: (dogId: string, testId: string, data: Partial<AntibodyTestPayload>) =>
      request<unknown>({
        url: `/dogs/${dogId}/antibody-tests/${encodeURIComponent(testId)}`,
        method: 'PUT',
        data,
      }),
    remove: (dogId: string, testId: string) =>
      request<unknown>({
        url: `/dogs/${dogId}/antibody-tests/${encodeURIComponent(testId)}`,
        method: 'DELETE',
      }),
  },

  /**
   * 疫苗名称库 + 病种/类别词表 + 产品库（路径不变）。
   *
   * ⚠️ 路径是 `vaccines/catalog`（**两段**），别改成一段的 `vaccine-catalog` ——
   *    那会被 DogsController 的 `@Get(':id')` 当成 dogId 吃掉（踩过一次）。
   */
  catalog: () =>
    request<VaccineCatalogResponse>({
      url: '/dogs/vaccines/catalog',
      method: 'GET',
      suppressErrorToast: true,
    }),

  /** 边打字边判归类（归类只有后端一份，前端不猜） */
  classify: (name: string) =>
    request<{ kinds?: string[]; kindLabels?: string[]; components?: string[] }>({
      url: `/dogs/vaccines/classify?name=${encodeURIComponent(name)}`,
      method: 'GET',
      suppressErrorToast: true,
    }),

  /**
   * 把某一步设为不做（忽略）。
   *
   * `decision=SKIP` + `reason`：`NOT_NOW`（这次先不打）/ `STOPPED`（不再接种了）——
   * 两个选项**行为一致**，区别只是把"为什么"记下来（需求 R5）。
   */
  setDecision: (dogId: string, stepKey: string, payload: VaccineDecisionPayload) =>
    request<unknown>({
      url: `/dogs/${dogId}/vaccine-plan/decisions/${encodeURIComponent(stepKey)}`,
      method: 'PUT',
      data: payload,
    }),

  /** 恢复（把某一步的"不做"撤掉） */
  clearDecision: (dogId: string, stepKey: string) =>
    request<unknown>({
      url: `/dogs/${dogId}/vaccine-plan/decisions/${encodeURIComponent(stepKey)}`,
      method: 'DELETE',
    }),
}
