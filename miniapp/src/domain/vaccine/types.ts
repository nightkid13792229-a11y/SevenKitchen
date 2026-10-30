/**
 * ══ 疫苗板块 · 类型唯一来源（2026-10-15 重构）══════════════════════════════
 *
 * 技术方案《四、前端结构》第一条：`src/domain/vaccine/types.ts` 是**类型唯一来源**。
 *
 * 这一份对应的是**冻结的接口契约**（后端按同一份契约实现）：
 *   · `GET  /dogs/:dogId/vaccine-plan`      → `VaccinePlanResponse`
 *   · `GET  /dogs/:dogId/vaccines`          → `VaccineRecord[]`
 *   · `POST/PUT/DELETE …/vaccines[/:id]`    → `VaccineRecordPayload`
 *   · `GET/POST/PUT/DELETE …/antibody-tests`→ `AntibodyTest[]`
 *   · `GET  /dogs/vaccines/catalog`         → `VaccineCatalogResponse`
 *   · `PUT/DELETE …/vaccine-plan/decisions/:stepKey` → `VaccineDecisionPayload`
 *
 * ⚠️ 三条硬口径（需求 2026-10-15 定）写在这里，改动前先回头看：
 *   ① **前端不做任何计划推算** —— 窗口、状态、排序、"下一针"全部是后端算好下发的，
 *      所以 `VaccineStep` 里每一个字段都是**结果**，不是前端能拼出来的中间值；
 *   ② 记录入参**没有** `nextDueDate` / `status`，"这一针含哪些疫苗"之外的
 *      归类（`kinds`）**由后端算**，前端不许传；
 *   ③ 写操作成功后**重新拉一次计划接口**整屏重绘（技术方案 3.4），
 *      所以前端不需要（也不许）在本地改 `status` / 重排 `plan`。
 */

/** 层级：必打 / 强烈建议（需求四：可选那一层不进页面） */
export type VaccineLayer = 'MUST' | 'SUGGEST'

/** 步骤状态：已完成 / 待接种 / 还没到 / 尽快补种 */
export type VaccineStepStatus = 'DONE' | 'DUE' | 'UPCOMING' | 'OVERDUE'

/** 类别（后端下发的机器值；显示一律用 `kindLabel`） */
export type VaccineKind = 'core' | 'rabies' | 'lepto' | string

/**
 * 「这一针可以和 X 一起打」（需求 R11）。
 *
 * 提示本身就是录入入口：家长在这一块点「记录这一针」，
 * 选一支同时含两类的苗，两个类别同时完成。
 */
export interface VaccineCombo {
  /** 另一类的机器值 */
  withKind: VaccineKind
  /** 另一类的中文名（"钩端螺旋体"） */
  withLabel: string
  windowStart: string
  windowEnd: string
  /** 常见产品（技术方案 3.1：产品列表不再截断到 3 条） */
  products: string[]
  /** 一句话提示（后端给的原话） */
  hint: string
}

/**
 * 免疫计划里的一步。
 *
 * ⚠️ 这是**后端算好的结果**：`status` / `windowStart` / `windowEnd`
 * 都已经按免疫程序规格滚动过，前端只负责画出来。
 */
export interface VaccineStep {
  key: string
  kind: VaccineKind
  kindLabel: string
  /** 页面上写的字（"第 1 针" / "年度加强" / "补一针" / "26 周补强"） */
  label: string
  layer: VaccineLayer
  windowStart: string
  windowEnd: string
  /**
   * 一针未打、且该类第一步窗口已过时，后端把窗口挪到今天并**带出原窗口**
   * （需求 A.3 第 1 条）。界面上写"原建议时间 X ~ Y 已过"。
   */
  missedWindowStart?: string
  missedWindowEnd?: string
  status: VaccineStepStatus
  statusLabel: string
  /** 依据文案（展开时给家长看） */
  /** 类别**短名**（计划行那种窄位置用；长名会把行撑成两行） */
  kindShort?: string
  /** 卡片上那行**短话**（后端按程序表逐行下发；原型 B/F/I 卡上那句） */
  hint?: string
  /** 已完成步骤的实际接种日（B7/V13；页面显示它，不显示计划日） */
  matchedRecordDate?: string
  /** 这一针被抗体检测替代了（原型 F）：时间含义变成"下次评估" */
  titer?: {
    testedAt: string
    nextReviewAt: string
  }
  /** 展开时的**依据**（带指南引注的整段，比 hint 长得多） */
  basis?: string
  /** 这一项能不能用抗体检测替代（核心 = true；狂犬/钩端 = false） */
  titerable: boolean
  /** 常见产品 */
  products: string[]
  combo?: VaccineCombo
}

/** 已被家长设为"不做"的一项（需求 R5：忽略覆盖 E 类） */
export interface VaccineIgnoredStep {
  /** 步骤标识 —— 恢复（DELETE 决定）要用它 */
  key: string
  kindLabel: string
  label: string
  /** NOT_NOW（推迟 30 天）/ STOPPED（长期停） */
  reason: string
  /** NOT_NOW 的 30 天到期日；STOPPED 为空 */
  snoozeUntil?: string | null
}

/** 主接口：一次给全（技术方案 3.1） */
export interface VaccinePlanResponse {
  dogId: string
  birthday: string
  ageWeeks: number
  /** 下一针；没有任何待办时为 null（"暂无需要接种的项目"） */
  next: VaccineStep | null
  /** 免疫计划，**已按时间从近到远排好**（排序在后端） */
  plan: VaccineStep[]
  ignored: {
    count: number
    items: VaccineIgnoredStep[]
  }
  /** 一句话节奏："之后：狂犬与钩端每年一次，核心疫苗每 3 年一次" */
  rhythm: string
  /** 有几条记录待核对（R7：待核对不算数） */
  pendingReview: number
  /** 冲突提示（保留字段，界面按条数展示） */
  conflicts: VaccineConflict[]
  /*
   * ⚠️ 2026-10-16 自检 V39：这里原来还有一个 `noRecordAtAll`
   *    （后端算了、前端从不读 —— 记录区那条空态是记录列表自己说的），已删。
   */
}

/**
 * 一条"为什么不作数"的说明（后端算的）。
 *
 * 例：接种日期还没到 / 比狗狗生日还早 / 打在 4 周龄之前 / 狂犬两针间隔不足一年 /
 * 抗体检测在 20 周龄前做 / 离上一针不满 4 周。
 *
 * ⚠️ 2026-10-16：这些原来**只在后端算、前端没显示** —— 家长记了一条未来日期的记录，
 *    只会觉得"记了没反应"。现在跟着记录一起显示（记录行下面一行 + 点开看建议）。
 */
export interface VaccineConflict {
  kind?: string
  /** 哪一条记录（接种记录或抗体检测的 id） */
  recordId?: string
  recordDate?: string
  vaccineName?: string
  /** 一句话：为什么不作数 */
  reason?: string
  /** 该怎么办 */
  suggestion?: string
}

/** 一条接种记录（GET /dogs/:dogId/vaccines 的条目） */
export interface VaccineRecord {
  id: string
  vaccineName: string
  vaccinationDate: string
  notes?: string | null
  /** 疫苗本原件（R10：整本只展示一次、可预览；删记录不删原件） */
  attachments?: string[]
  /** 这一针含哪些病种（机器值） */
  components?: string[]
  /** 病种中文名（顾客看的就是它） */
  componentLabels?: string[]
  /** 这条记录能顶哪几类（**后端算的，前端不传**） */
  kinds?: string[]
  kindLabels?: string[]
  /** 名称有没有被人工核对过（R7：待核对不算数） */
  productVerified?: boolean
  /** 这条记录是**什么时候录进来的**（附件区要显示"上传时间"） */
  createdAt?: string
}

/**
 * 记录入参。
 *
 * ⚠️ 与旧版的三处不同（技术方案 3.2，破坏性改）：
 *   ① 不再有 `nextDueDate`（需求：疫苗本上写的下次到期日整个不用）
 *   ② 不再有 `status`（记录都是"已经打过"这一种事实）
 *   ③ 不再传 `kinds`（后端按 `components` / 名字字面算）
 */
export interface VaccineRecordPayload {
  vaccineName: string
  vaccinationDate: string
  notes?: string | null
  attachments?: string[]
  /** 家长勾的"含哪些疫苗"（病种）—— 归不了类时靠它，由后端推类别 */
  components?: string[]
  productVerified?: boolean
}

/** 抗体检测的项目（狂犬能记录、不影响计划、不主动提示） */
export type AntibodyTarget = 'CORE' | 'RABIES'

/** 结果：合格 / 不合格 / 报告没给结论（界面写「未判读」） */
export type AntibodyResult = 'PASS' | 'FAIL' | 'UNKNOWN'

/** 一条抗体检测记录 */
export interface AntibodyTest {
  id: string
  testedAt: string
  targets: AntibodyTarget[]
  result: AntibodyResult
  value?: string | null
  unit?: string | null
  /** 下次评估时间（合格时后端算：检测日 + 3 年） */
  nextReviewAt?: string | null
  attachments?: string[]
}

export interface AntibodyTestPayload {
  testedAt: string
  targets: AntibodyTarget[]
  result: AntibodyResult
  value?: string | null
  unit?: string | null
  nextReviewAt?: string | null
  attachments?: string[]
  /** 这次检测是**什么时候录进来的**（附件区要显示"上传时间"） */
  createdAt?: string
}

/** 产品库里的一个产品（只有对外字段下发给前端） */
export interface VaccineCatalogProduct {
  name: string
  /** 含哪些病种（机器值） */
  components: string[]
  manufacturer?: string
  /** 是否参与推荐 */
  recommendable?: boolean
}

/** 病种 / 类别的下拉词表（`catalog` 接口下发的那一份） */
export interface VaccineCatalogOption {
  value: string
  label: string
}

/** 目录接口（技术方案 3.2：产品只下发对外字段） */
export interface VaccineCatalogResponse {
  /** 病种词表 */
  components?: VaccineCatalogOption[]
  /** 类别词表 */
  kinds?: VaccineCatalogOption[]
  /** 产品库 */
  products?: VaccineCatalogProduct[]
}

/** 顾客对某一步的决定（忽略 = SKIP + 原因） */
export interface VaccineDecisionPayload {
  decision: 'ACCEPT' | 'DEFER' | 'SKIP'
  /**
   * 这次先不打（NOT_NOW）/ 不再接种了（STOPPED）。
   * 两个选项**行为一致**（都是不再提醒这一针），区别只是把"为什么"记下来。
   */
  reason?: 'NOT_NOW' | 'STOPPED'
}

/**
 * 记录区里的一行 —— 接种记录与抗体检测**合并成同一个列表**渲染
 * （技术方案 3.2：`GET /dogs/:id/records` 返回两类条目合并）。
 *
 * 这里在前端合成，只是"把两份数据摆进同一个列表"（渲染），
 * **没有任何计划推算** —— 顺序按日期倒序，与计划无关。
 */
export type VaccineTimelineEntry =
  | { type: 'record'; id: string; date: string; record: VaccineRecord }
  | { type: 'test'; id: string; date: string; test: AntibodyTest }

/**
 * 识别结果里待确认的一行（`ScanConfirm` 用）。
 *
 * ⚠️ 只有**名称 + 日期**两项是给家长看的（需求 R12：品牌、批号、下次到期日一律不要）。
 *    `attachments` 是这一批照片的原件（R10 疫苗本原件要留档），**不出现在两列里**；
 *    `needsReview` / `reason` 决定这一行要不要核对（技术方案 3.3 的三条判据）。
 */
export interface VaccineScanRow {
  /** 本地行标识（识别结果没有 id） */
  key: string
  name: string
  date: string
  /** 这一行要不要核对（狂犬一律 / 名字认不出 / 日期可疑） */
  needsReview: boolean
  /** 给家长看的一句话：为什么要核对 */
  reason: string
  /** 家长已经点过「我已对照本子核对」 */
  verified: boolean
  /** 这一批照片原件（跟着记录一起保存；不显示在这一页） */
  attachments?: string[]
  /**
   * 这一条**没存上**的原因（存上了就没有）。
   *
   * ⚠️ 2026-10-16 老板："一次识别出多条记录时，现在的报错很难让用户第一时间
   *    定位到哪一条记错了。" —— 所以错误不再只弹一句 toast，而是**挂在那一行上**：
   *    那一行标红、下面写清原因，并给「补全这一条」的出路。
   */
  error?: string
}
