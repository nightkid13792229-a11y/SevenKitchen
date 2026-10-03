<template>
  <!-- 化验数据的分块展示（2026-10-02 老板提的排版问题）。
       一次化验常常是好几张单子（生化 / 血细胞检测报告单 / CRP），
       原来所有行都是同一个样式，报告名和数值混在一起 ——
       老板原话："生化、CRP 这些，连标题和正文都是一模一样的"。 -->
  <view class="lab">
    <template v-for="(block, blockIndex) in blocks" :key="`${block.title}-${blockIndex}`">
      <view v-if="block.title" class="lab__title">
        <text class="lab__title-text">{{ block.title }}</text>
        <text class="lab__title-count">{{ blockCount(block) }} 项</text>
      </view>
      <view v-for="(row, rowIndex) in block.rows" :key="`${row.name}-${rowIndex}`" class="lab__row">
        <text class="lab__name">{{ row.name }}</text>
        <text class="lab__value">
          {{ row.value
          }}<text
            v-if="row.flag"
            class="lab__flag"
            :class="{ 'lab__flag--alert': row.flag === '偏高' || row.flag === '偏低' || row.flag === '高' || row.flag === '低' }"
          >（{{ row.flag }}）</text>
        </text>
      </view>
    </template>

    <view v-if="canExpand" class="lab__toggle" @tap="expanded = !expanded">
      <text class="lab__toggle-text">
        {{ expanded ? '收起' : `展开全部 ${totalRows} 项` }}
      </text>
    </view>
    <text v-else-if="props.collapsible && flaggedCount > 0" class="lab__summary">
      共 {{ totalRows }} 项，上面是报告标了偏高/偏低的 {{ flaggedCount }} 项
    </text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { dedupeLabValues } from '../../utils/health-records'

/**
 * 化验数据排版（2026-10-02）。
 *
 * 输入是一段纯文本（AI 抄下来的化验单，逐项一行、每张单子以报告名开头）：
 *
 *   生化
 *   白蛋白(ALB) 36.1 g/L
 *   丙氨酸氨基转移酶(ALT) 144 U/L（偏高）
 *   血细胞检测报告单
 *   白细胞数目(WBC) 7.31 10^9/L
 *
 * 输出分三层的排版：
 *   · **报告名**（生化 / 血细胞检测报告单 / CRP）—— 单独一行、带底色的小标题
 *   · **项目名** 与 **数值** —— 左右两栏，数值右对齐，方便逐行扫
 *   · **偏高/偏低**标记 —— 报告自己标的，用颜色点出来（我们不判断，只照抄）
 *
 * 为什么不在文本框里做：这是只读展示，编辑仍然用多行输入框（见父组件）。
 */
const props = withDefaults(defineProps<{
  text?: string | null
  /**
   * 默认折叠（2026-10-02 老板：化验那一栏 45 行，占的行数太多）。
   * 折叠时只显示「报告名 + 项数 + 报告标了偏高/偏低的那些行」，
   * 其余点「展开全部」再看 —— 家长真正要核对的就是异常项。
   * 识别确认卡片上不折叠（那一步就是逐项核对）。
   */
  collapsible?: boolean
}>(), { collapsible: false })

const expanded = ref(false)

interface LabRow {
  name: string
  value: string
  flag: string
}
interface LabBlock {
  title: string
  rows: LabRow[]
  /** 这份报告一共几项（折叠时只显示异常项，但数量要报**总量**） */
  total: number
}

/** 报告名判定：整行没有数字、也不是"项目 数值"的形状，且不长 */
function isTitleLine(line: string): boolean {
  if (line.length > 24) return false
  // 带数字的几乎都是数值行（10^9/L、0.4 % 之类）
  return !/\d/.test(line)
}

/** 把「项目 数值 单位（偏高）」拆成三段；拆不出来就整行当数值 */
function parseRow(line: string): LabRow {
  const flagMatch = line.match(/[（(](偏高|偏低|高|低|正常)[）)]\s*$/)
  const flag = flagMatch ? flagMatch[1] : ''
  const body = flagMatch ? line.slice(0, flagMatch.index).trim() : line

  // 项目名与数值之间用空白分隔：第一个"数字/符号开头"的片段起算数值
  const valueMatch = body.match(/\s(?=[<>≤≥]?[-+]?[\d.])/)
  if (!valueMatch || valueMatch.index === undefined) {
    return { name: '', value: body, flag }
  }

  const name = body.slice(0, valueMatch.index).trim()
  const value = body.slice(valueMatch.index).trim()
  if (!name) {
    return { name: '', value: body, flag }
  }

  return { name, value, flag }
}

const allBlocks = computed<LabBlock[]>(() => {
  /**
   * 展示前先去重（2026-10-03）。
   *
   * 老板截图里同一份「生化」列了三遍：那是**去重上线之前**存下来的记录，
   * 同一张报告拍了两张照片，两份内容被并排堆在一起。
   * 新记录在合并时就会去重，老记录靠这一步兜底 —— 只影响显示，
   * 不动数据库里的原文；家长在这条记录上任何一次自动保存都会把干净的版本落回去。
   */
  const lines = dedupeLabValues(String(props.text || ''))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const result: LabBlock[] = []
  let current: LabBlock = { title: '', rows: [], total: 0 }

  for (const line of lines) {
    if (isTitleLine(line)) {
      if (current.title || current.rows.length > 0) {
        result.push(current)
      }
      current = { title: line, rows: [], total: 0 }
      continue
    }
    current.rows.push(parseRow(line))
  }

  if (current.title || current.rows.length > 0) {
    result.push({ ...current, total: current.rows.length })
  }

  return result
})

/**
 * 每份报告几项。
 *
 * ⚠️ 2026-10-02 老板实测：折叠之后这里报的是"精简后还剩几项"（生化 2 项），
 * 看着像这份报告只有 2 项 —— 数量统计必须报**总量**（生化 19 项）。
 */
function blockCount(block: LabBlock): number {
  return block.total || block.rows.length
}

/** 折叠时每份报告里"报告自己标了偏高/偏低"的行 */
function flaggedRows(block: LabBlock): LabRow[] {
  return block.rows.filter((row) => row.flag && !['正常', '高', '低'].includes(row.flag))
}

const totalRows = computed(() =>
  allBlocks.value.reduce((sum, block) => sum + blockCount(block), 0),
)

/** 展示用：折叠时只留报告名 + 异常项 */
const blocks = computed<LabBlock[]>(() => {
  if (!props.collapsible || expanded.value) {
    return allBlocks.value
  }
  return allBlocks.value.map((block) => ({
    title: block.title,
    rows: flaggedRows(block),
    total: block.rows.length,
  }))
})

const canExpand = computed(() => props.collapsible && totalRows.value > flaggedCount.value)

const flaggedCount = computed(() =>
  allBlocks.value.reduce((sum, block) => sum + flaggedRows(block).length, 0),
)
</script>

<style scoped lang="scss">
.lab {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

/* 报告名：整行小标题，和项目行明显区分开 */
.lab__title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12rpx;
  margin-top: 16rpx;
  padding: 8rpx 14rpx;
  border-radius: 10rpx;
  background: #f1f4ea;
  border-left: 6rpx solid #9db08f;
}

.lab__title:first-child {
  margin-top: 0;
}

.lab__title-text {
  font-size: 24rpx;
  font-weight: 700;
  color: #3c5641;
}

.lab__title-count {
  margin-left: 12rpx;
  font-size: 21rpx;
  font-weight: 500;
  color: #7d8a7d;
}

.lab__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 20rpx;
  padding: 8rpx 2rpx;
  border-bottom: 1rpx solid #f4f6ef;
}

.lab__name {
  flex: 1;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.lab__value {
  flex-shrink: 0;
  max-width: 52%;
  text-align: right;
  font-size: 25rpx;
  line-height: 1.5;
  color: #26261f;
  font-weight: 600;
}

.lab__toggle {
  margin-top: 14rpx;
  padding: 10rpx 0;
  text-align: center;
  border-radius: 12rpx;
  background: #f6f8f2;
}

.lab__toggle-text {
  font-size: 23rpx;
  color: #4e6b52;
}

.lab__summary {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #7d8a7d;
}

/* 报告自己标的标记：只有真的偏了才用暖色，"正常"保持中性 —— 我们不做判断，只是照抄 */
.lab__flag {
  color: #7d8a7d;
}

.lab__flag--alert {
  color: #c1663a;
}
</style>
