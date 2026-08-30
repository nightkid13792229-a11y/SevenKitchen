<template>
  <div class="gauge-panel">
    <div class="gauge-title">关键比例仪表</div>
    <div v-if="gauges.length === 0" class="gauge-empty">暂无比例数据（加载评估后显示）</div>
    <div v-for="gauge in gauges" :key="gauge.key" class="gauge-block">
      <div class="gauge-head">
        <span class="gauge-name">{{ gauge.title }}</span>
        <span v-if="gauge.statusText" class="gauge-status" :class="'gauge-status-' + gauge.statusClass">{{ gauge.statusText }}</span>
      </div>
      <div class="gauge-canvas">
        <svg :viewBox="viewBox" class="gauge-svg">
          <!-- 背景弧 -->
          <path :d="arcPath(gauge.scaleMin, gauge.scaleMax, gauge)" class="gauge-arc-bg" />
          <!-- 分区弧 -->
          <path
            v-for="(zone, index) in gauge.zones"
            :key="index"
            :d="arcPath(zone.from, zone.to, gauge)"
            class="gauge-arc-zone"
            :class="'gauge-zone-' + zone.className"
          />
          <!-- 刻度端点 -->
          <text :x="pointX(gauge.scaleMin, gauge)" :y="pointY(gauge.scaleMin, gauge) + 14" class="gauge-scale-text">{{ formatScale(gauge.scaleMin) }}</text>
          <text :x="pointX(gauge.scaleMax, gauge)" :y="pointY(gauge.scaleMax, gauge) + 14" class="gauge-scale-text" text-anchor="end">{{ formatScale(gauge.scaleMax) }}</text>
          <!-- 指针 -->
          <g :transform="`rotate(${needleAngle(gauge)}, ${centerX}, ${centerY})`" class="gauge-needle-group">
            <line :x1="centerX" :y1="centerY" :x2="centerX" :y2="centerY - needleLength" class="gauge-needle" />
          </g>
          <circle :cx="centerX" :cy="centerY" r="4.5" class="gauge-hub" />
          <!-- 当前值（表盘内底部，距圆心适中） -->
          <text :x="centerX" :y="centerY + 30" class="gauge-value-inner" text-anchor="middle">
            {{ gauge.valueText }}<tspan class="gauge-value-unit-inner"> :1</tspan>
          </text>
        </svg>
      </div>
      <div class="gauge-range">
        <span>{{ gauge.rangeText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DesignRecipeAssessmentResult, GroupedAssessmentEntry } from '@/utils/recipeDesigner/assessment'

const props = defineProps<{
  assessment: DesignRecipeAssessmentResult | null
}>()

const centerX = 100
const centerY = 120
const radius = 82
const needleLength = 66
const viewBox = '0 0 200 160'

interface GaugeZone {
  from: number
  to: number
  className: string
}

interface GaugeSpec {
  key: string
  title: string
  entry: GroupedAssessmentEntry | null
  currentValue: number | null
  statusClass: string
  statusText: string
  scaleMin: number
  scaleMax: number
  zones: GaugeZone[]
  rangeText: string
  valueText: string
}

/** 值 → 表盘角度比例（0=左端，1=右端） */
function frac(value: number, gauge: GaugeSpec): number {
  const span = gauge.scaleMax - gauge.scaleMin
  if (span <= 0) return 0
  return Math.min(Math.max((value - gauge.scaleMin) / span, 0), 1)
}

function polarX(gauge: GaugeSpec, f: number): number {
  return centerX + radius * Math.cos(Math.PI - f * Math.PI)
}

function polarY(gauge: GaugeSpec, f: number): number {
  return centerY - radius * Math.sin(Math.PI - f * Math.PI)
}

/** 一段弧线路径（按值域 [from, to]） */
function arcPath(from: number, to: number, gauge: GaugeSpec): string {
  const f1 = frac(from, gauge)
  const f2 = frac(to, gauge)
  const x1 = polarX(gauge, f1)
  const y1 = polarY(gauge, f1)
  const x2 = polarX(gauge, f2)
  const y2 = polarY(gauge, f2)
  const largeArc = Math.abs(f2 - f1) > 0.5 ? 1 : 0
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

function pointX(value: number, gauge: GaugeSpec): number {
  return polarX(gauge, frac(value, gauge))
}

function pointY(value: number, gauge: GaugeSpec): number {
  return polarY(gauge, frac(value, gauge))
}

/** 指针旋转角：0% → -90°（指向左端），100% → +90°（指向右端） */
function needleAngle(gauge: GaugeSpec): number {
  if (gauge.currentValue == null) return -90
  return frac(gauge.currentValue, gauge) * 180 - 90
}

function formatScale(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function statusClassOf(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'DEFICIENT':
      return 'deficient'
    case 'EXCESS':
      return 'excess'
    case 'COMPLIANT':
      return 'compliant'
    case 'MISSING_DATA':
      return 'missing'
    default:
      return 'info'
  }
}

function statusTextOf(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'DEFICIENT':
      return '低于下限'
    case 'EXCESS':
      return '超过上限'
    case 'COMPLIANT':
      return '达标'
    case 'MISSING_DATA':
      return '数据缺失'
    default:
      return '参考'
  }
}

function buildGauges(assessment: DesignRecipeAssessmentResult | null): GaugeSpec[] {
  if (!assessment) return []
  const grouped = (assessment.groupedEntries ?? []) as GroupedAssessmentEntry[]
  const findEntry = (key: string) => grouped.find((entry) => entry.nutrientKey === key) ?? null

  const gauges: GaugeSpec[] = []

  // 钙磷比：FEDIAF 标准 1~2:1
  const caP = findEntry('calciumPhosphorusRatio')
  gauges.push({
    key: 'calciumPhosphorusRatio',
    title: '钙磷比',
    entry: caP,
    currentValue: caP?.currentValue ?? null,
    statusClass: caP ? statusClassOf(String(caP.status || '')) : 'missing',
    statusText: caP ? statusTextOf(String(caP.status || '')) : '无数据',
    scaleMin: 0,
    scaleMax: 2.5,
    zones: [
      { from: 0, to: 1, className: 'deficient' },
      { from: 1, to: 2, className: 'compliant' },
      { from: 2, to: 2.5, className: 'excess' }
    ],
    rangeText: '标准 1.0 ~ 2.0 : 1',
    valueText: caP?.currentValue != null ? Number(caP.currentValue).toFixed(2) : '—'
  })

  // Omega-6:Omega-3：行业参考 2~5:1（无 FEDIAF 标准，不标注上下限）
  const omega = findEntry('omega6Omega3Ratio')
  gauges.push({
    key: 'omega6Omega3Ratio',
    title: 'Omega-6 : Omega-3',
    entry: omega,
    currentValue: omega?.currentValue ?? null,
    statusClass: omega ? statusClassOf(String(omega.status || '')) : 'missing',
    statusText: '',
    scaleMin: 0,
    scaleMax: 8,
    zones: [
      { from: 0, to: 2, className: 'deficient' },
      { from: 2, to: 5, className: 'compliant' },
      { from: 5, to: 8, className: 'excess' }
    ],
    rangeText: '参考 2.0 ~ 5.0 : 1',
    valueText: omega?.currentValue != null ? Number(omega.currentValue).toFixed(2) : '—'
  })

  return gauges
}

const gauges = computed(() => buildGauges(props.assessment))
</script>

<style scoped>
.gauge-panel {
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
}
.gauge-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}
.gauge-empty {
  color: #909399;
  font-size: 12px;
  text-align: center;
  padding: 30px 0;
}
.gauge-block {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px 8px 8px;
  margin-bottom: 10px;
  background: #fff;
}
.gauge-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}
.gauge-name {
  font-size: 13px;
  font-weight: 500;
}
.gauge-status {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1.4;
}
.gauge-status-compliant {
  color: #67c23a;
  background: #f0f9eb;
}
.gauge-status-deficient {
  color: #f56c6c;
  background: #fef0f0;
}
.gauge-status-excess {
  color: #e6a23c;
  background: #fdf6ec;
}
.gauge-status-missing {
  color: #909399;
  background: #f4f4f5;
}
.gauge-status-info {
  color: #409eff;
  background: #ecf5ff;
}
.gauge-canvas {
  position: relative;
}
.gauge-svg {
  display: block;
  width: 100%;
}
.gauge-arc-bg {
  fill: none;
  stroke: #f0f2f5;
  stroke-width: 12;
  stroke-linecap: butt;
}
.gauge-arc-zone {
  fill: none;
  stroke-width: 12;
  stroke-linecap: butt;
  transition: stroke 0.2s;
}
.gauge-zone-deficient {
  stroke: #f56c6c;
}
.gauge-zone-compliant {
  stroke: #67c23a;
}
.gauge-zone-excess {
  stroke: #e6a23c;
}
.gauge-scale-text {
  font-size: 9px;
  fill: #909399;
}
/* 上下限标注：显眼 */
.gauge-bound {
  font-size: 12px;
  font-weight: 700;
}
.gauge-bound-min {
  fill: #f56c6c;
}
.gauge-bound-max {
  fill: #e6a23c;
}
.gauge-needle {
  stroke: #303133;
  stroke-width: 2.5;
  stroke-linecap: round;
  transition: transform 0.3s;
}
.gauge-hub {
  fill: #303133;
}
/* 当前值：表盘内底部，距圆心适中 */
.gauge-value-inner {
  font-size: 19px;
  font-weight: 700;
  fill: #303133;
}
.gauge-value-unit-inner {
  font-size: 12px;
  fill: #909399;
  font-weight: 400;
}
.gauge-range {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: #909399;
}
</style>
