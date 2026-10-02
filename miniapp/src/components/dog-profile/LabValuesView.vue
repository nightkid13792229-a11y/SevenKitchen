<template>
  <!-- 化验数据的分块展示（2026-10-02 老板提的排版问题）。
       一次化验常常是好几张单子（生化 / 血细胞检测报告单 / CRP），
       原来所有行都是同一个样式，报告名和数值混在一起 ——
       老板原话："生化、CRP 这些，连标题和正文都是一模一样的"。 -->
  <view class="lab">
    <template v-for="(block, blockIndex) in blocks" :key="`${block.title}-${blockIndex}`">
      <view v-if="block.title" class="lab__title">
        <text class="lab__title-text">{{ block.title }}</text>
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
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

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
const props = defineProps<{ text?: string | null }>()

interface LabRow {
  name: string
  value: string
  flag: string
}
interface LabBlock {
  title: string
  rows: LabRow[]
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

const blocks = computed<LabBlock[]>(() => {
  const lines = String(props.text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const result: LabBlock[] = []
  let current: LabBlock = { title: '', rows: [] }

  for (const line of lines) {
    if (isTitleLine(line)) {
      if (current.title || current.rows.length > 0) {
        result.push(current)
      }
      current = { title: line, rows: [] }
      continue
    }
    current.rows.push(parseRow(line))
  }

  if (current.title || current.rows.length > 0) {
    result.push(current)
  }

  return result
})
</script>

<style scoped lang="scss">
.lab {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}

/* 报告名：整行小标题，和项目行明显区分开 */
.lab__title {
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

/* 报告自己标的标记：只有真的偏了才用暖色，"正常"保持中性 —— 我们不做判断，只是照抄 */
.lab__flag {
  color: #7d8a7d;
}

.lab__flag--alert {
  color: #c1663a;
}
</style>
