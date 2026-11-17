<template>
  <el-drawer
    :model-value="modelValue"
    :title="drawerTitle"
    size="620px"
    destroy-on-close
    class="dog-archive-drawer"
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <div v-loading="loading" class="dog-archive">
      <el-alert
        v-if="loadError"
        type="error"
        :title="loadError"
        :closable="false"
        show-icon
        class="dog-archive__alert"
      >
        <template #default>
          <el-button link type="primary" @click="load">重新加载</el-button>
        </template>
      </el-alert>

      <template v-if="overview">
        <!-- 基本资料：下单时最常用的几项，一眼看完 -->
        <el-descriptions :column="2" border size="small" class="dog-archive__basic">
          <el-descriptions-item label="品种">
            {{ overview.dog?.breedName || "品种未填写" }}
          </el-descriptions-item>
          <el-descriptions-item label="性别 / 绝育">
            {{ overview.dog?.gender || "—" }} ·
            {{ overview.dog?.isNeutered ? "已绝育" : "未绝育" }}
          </el-descriptions-item>
          <el-descriptions-item label="年龄">
            {{ overview.dog?.ageText || "年龄未填" }}
          </el-descriptions-item>
          <el-descriptions-item label="体重 / 体况">
            {{ overview.dog?.currentWeightKg ?? "—" }} kg · BCS
            {{ overview.dog?.bcsScore ?? "—" }}
          </el-descriptions-item>
          <el-descriptions-item label="每日餐数">
            {{ overview.dog?.mealsPerDay ?? "未填写" }}
          </el-descriptions-item>
          <el-descriptions-item label="活动量">
            {{ overview.dog?.activityLevelLabel || "未填写" }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 过敏：定制食谱的第一道红线，必须放在最前面 -->
        <section class="dog-archive__section">
          <div class="dog-archive__section-head">
            <span class="dog-archive__section-title">过敏</span>
            <span class="dog-archive__section-hint">
              顾客自己填的记录与上传的报告，结论照抄原文，不代表已确诊
            </span>
          </div>

          <div v-if="(overview.allergies || []).length" class="allergy-tags">
            <el-tag
              v-for="item in overview.allergies"
              :key="item.allergen"
              type="danger"
              effect="plain"
            >
              {{ item.allergen }}
            </el-tag>
          </div>
          <div v-else-if="!overview.dog?.allergyFoods" class="dog-archive__empty">
            还没有过敏记录
          </div>

          <!--
            档案里员工手填的过敏食物（2026-11-17）。
            与顾客填的结构化记录是两套并存的数据；只显示其中一套，
            抽屉会在"记录为空、但员工写过鸡肉牛肉"时显示"还没有过敏记录"，
            直接把员工引到"不过敏"的错误结论上。
          -->
          <div v-if="overview.dog?.allergyFoods" class="dog-archive__manual-allergy">
            <span class="dog-archive__manual-label">档案里记录的过敏食物</span>
            <span>{{ overview.dog.allergyFoods }}</span>
          </div>

          <div class="dog-archive__sub-title">
            过敏检测报告（{{ allergyReports.length }}）
          </div>
          <div v-if="allergyReports.length" class="allergy-reports">
            <div
              v-for="report in allergyReports"
              :key="report.id"
              class="allergy-report"
            >
              <div class="allergy-report__head">
                <el-tag size="small" type="danger" effect="plain">过敏检测</el-tag>
                <span class="allergy-report__date">
                  {{ report.testDate || "日期未填" }}
                </span>
                <span class="allergy-report__inst">
                  {{ report.institution || "机构未填" }}
                </span>
              </div>
              <div class="allergy-report__summary">
                {{ report.summary || "未填写结论" }}
              </div>
              <div v-if="report.attachments?.length" class="allergy-report__files">
                <template v-for="url in report.attachments" :key="url">
                  <el-image
                    v-if="isImageAttachment(url)"
                    :src="url"
                    :preview-src-list="imagesOf(report.attachments)"
                    :initial-index="imagesOf(report.attachments).indexOf(url)"
                    fit="cover"
                    class="attachment-thumb"
                  />
                  <a
                    v-else
                    class="attachment-file"
                    :href="url"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ attachmentKindLabel(attachmentKind(url)) }} · 打开原件
                  </a>
                </template>
              </div>
            </div>
          </div>
          <div v-else class="dog-archive__empty">顾客还没有上传过过敏检测报告</div>
        </section>

        <!-- 病史与还没结束的问题 -->
        <section class="dog-archive__section">
          <div class="dog-archive__section-head">
            <span class="dog-archive__section-title">病史</span>
          </div>
          <div class="dog-archive__text">
            {{ overview.dog?.medicalHistory || "档案里没有填写病史" }}
          </div>

          <template v-if="(overview.ongoingConditions || []).length">
            <div class="dog-archive__sub-title">还没结束的问题</div>
            <div
              v-for="item in overview.ongoingConditions"
              :key="item.id"
              class="record-row"
            >
              <span class="record-row__date">{{ item.date }}</span>
              <span class="record-row__main">{{ item.diagnosis }}</span>
              <el-tag size="small" effect="plain">{{ item.status }}</el-tag>
            </div>
          </template>
        </section>

        <!-- 最近就诊 / 体检：判断"最近有没有新情况" -->
        <section class="dog-archive__section">
          <div class="dog-archive__section-head">
            <span class="dog-archive__section-title">最近就诊</span>
          </div>
          <div v-if="(overview.recentVisits || []).length">
            <div
              v-for="item in overview.recentVisits"
              :key="item.id"
              class="record-row"
            >
              <span class="record-row__date">{{ item.date }}</span>
              <span class="record-row__main">{{ item.diagnosis }}</span>
              <span v-if="item.attachmentCount" class="record-row__flag">
                {{ item.attachmentCount }} 个附件
              </span>
            </div>
          </div>
          <div v-else class="dog-archive__empty">没有就诊记录</div>

          <div class="dog-archive__sub-title">最近体检</div>
          <div v-if="(overview.recentCheckups || []).length">
            <div
              v-for="item in overview.recentCheckups"
              :key="item.id"
              class="record-row"
            >
              <span class="record-row__date">{{ item.date }}</span>
              <span class="record-row__main">
                {{ item.findings || "未填写检查结论" }}
              </span>
              <span v-if="item.attachmentCount" class="record-row__flag">
                {{ item.attachmentCount }} 个附件
              </span>
            </div>
          </div>
          <div v-else class="dog-archive__empty">没有体检记录</div>
        </section>

        <!-- 报告原件：就诊 / 体检 / 过敏检测都在这里，点开看大图 -->
        <section class="dog-archive__section">
          <div class="dog-archive__section-head">
            <span class="dog-archive__section-title">
              报告原件（{{ attachments.length }}）
            </span>
            <span class="dog-archive__section-hint">点开可看大图</span>
          </div>
          <div v-if="attachments.length" class="attachments">
            <div
              v-for="(item, index) in attachments"
              :key="`${item.recordId}-${index}`"
              class="attachment"
            >
              <el-image
                v-if="isImageAttachment(item.url)"
                :src="item.url"
                :preview-src-list="attachmentUrls"
                :initial-index="attachmentUrls.indexOf(item.url)"
                fit="cover"
                class="attachment-thumb"
              />
              <a
                v-else
                class="attachment-file"
                :href="item.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ attachmentKindLabel(attachmentKind(item.url)) }} · 打开原件
              </a>
              <div class="attachment__meta">
                <el-tag size="small" :type="sourceTagType(item.source)">
                  {{ sourceLabel(item.source) }}
                </el-tag>
                <span class="attachment__date">{{ item.recordDate || "日期未填" }}</span>
              </div>
              <div class="attachment__label">{{ item.recordLabel }}</div>
            </div>
          </div>
          <div v-else class="dog-archive__empty">顾客还没有上传过报告</div>
        </section>
      </template>

      <el-empty
        v-else-if="!loading && !loadError"
        description="没有读到档案内容"
      />
    </div>

    <template #footer>
      <div class="dog-archive__footer">
        <span class="dog-archive__footer-hint">
          这里只读；要改档案或看 AI 分析，请打开完整健康档案
        </span>
        <el-button
          v-if="dogId"
          type="primary"
          plain
          @click="openFullArchive"
        >
          打开完整健康档案
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dogApi } from '@/api/dogs'
import {
  attachmentKind,
  attachmentKindLabel,
  isImageAttachment,
} from '@/utils/attachment'

/**
 * 代客下单 · 狗狗档案抽屉（2026-11-16）
 *
 * 老板原话：「我在代客下单的时候，可能还需要查看这只狗狗的档案资料，
 * 包括健康档案、健康档案里的附件，比如体检报告、过敏检测报告。」
 *
 * ## 为什么不直接把「健康档案」页面嵌进来
 *
 * 那个页面带 AI 分析（要十几秒）、带健康标签纠错（可写），
 * 嵌进下单流程既慢又会让人误操作。这里只放**下单时要看的**只读内容：
 * 基本资料 → 过敏（含检测报告）→ 病史 → 最近就诊/体检 → 报告原件。
 *
 * 需要完整档案（AI 分析、改标签）时点底部按钮新开标签页，
 * 这样下单页已填的内容不会丢。
 */
const props = defineProps<{
  modelValue: boolean
  dogId: string
  dogName?: string
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const loading = ref(false)
const loadError = ref('')
const overview = ref<any>(null)

const drawerTitle = computed(() =>
  props.dogName ? `${props.dogName} · 档案` : '狗狗档案',
)

const allergyReports = computed<any[]>(() => overview.value?.allergyReports || [])
const attachments = computed<any[]>(() => overview.value?.attachments || [])
const attachmentUrls = computed(() =>
  attachments.value.filter((item: any) => isImageAttachment(item.url)).map((item: any) => item.url),
)

/** 一组附件里可以走图片预览的那些（PDF/Word 不进预览列表） */
function imagesOf(urls: unknown): string[] {
  return (Array.isArray(urls) ? urls : []).filter((url) =>
    isImageAttachment(url),
  )
}

function sourceLabel(source: unknown): string {
  const value = String(source || '')
  if (value === 'visit') return '就诊'
  if (value === 'allergy') return '过敏检测'
  return '体检'
}

function sourceTagType(source: unknown): 'warning' | 'danger' | 'success' {
  const value = String(source || '')
  if (value === 'visit') return 'warning'
  if (value === 'allergy') return 'danger'
  return 'success'
}

/** 请求序号：换狗/关掉重开时，旧响应不能覆盖新狗的档案 */
let requestSeq = 0

async function load() {
  const dogId = props.dogId
  if (!dogId) return

  const seq = ++requestSeq
  loading.value = true
  loadError.value = ''
  /**
   * 先清空：换狗时如果继续显示上一只狗的过敏/病史（哪怕遮罩还在），
   * 员工扫一眼就会把它当成新狗的资料 —— 医疗信息看错狗是真的会出事。
   */
  overview.value = null

  try {
    // includeAnalysis=false：抽屉要秒开，AI 分析留给完整档案页
    const data = await dogApi.getHealthOverview(dogId, false)
    if (seq !== requestSeq || props.dogId !== dogId) return
    overview.value = data
  } catch (error: any) {
    if (seq !== requestSeq || props.dogId !== dogId) return
    overview.value = null
    loadError.value = error?.message || '加载狗狗档案失败，请重试'
  } finally {
    if (seq === requestSeq) {
      loading.value = false
    }
  }
}

function openFullArchive() {
  if (!props.dogId) return
  window.open(
    `/dogs/${encodeURIComponent(props.dogId)}/health`,
    '_blank',
    'noopener',
  )
}

/**
 * 打开 或 换狗 → 都重新读。
 *
 * 合成一个 watcher 的原因：`openDogArchive` 会先改 dogId 再改 visible，
 * 两个独立 watcher 会在同一 tick 各触发一次（同一只狗读两遍），
 * 而且在"开着抽屉直接换狗"时两次请求的先后没有保证。
 */
watch(
  [() => props.modelValue, () => props.dogId],
  ([visible]) => {
    if (visible && props.dogId) {
      void load()
    }
    if (!visible) {
      // 关掉就作废飞行中的请求，避免关掉后又被旧响应改回内容
      requestSeq += 1
    }
  },
)
</script>

<style scoped>
.dog-archive {
  min-height: 200px;
  padding-bottom: 12px;
}

.dog-archive__alert {
  margin-bottom: 12px;
}

.dog-archive__basic {
  margin-bottom: 4px;
}

.dog-archive__section {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid #ebeef5;
}

.dog-archive__section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.dog-archive__section-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.dog-archive__section-hint {
  font-size: 12px;
  color: #909399;
}

.dog-archive__sub-title {
  margin: 12px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.dog-archive__text {
  font-size: 14px;
  color: #303133;
  white-space: pre-wrap;
}

.dog-archive__empty {
  font-size: 13px;
  color: #909399;
}

.dog-archive__manual-allergy {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fdf6ec;
  font-size: 13px;
  color: #b88230;
}

.dog-archive__manual-label {
  color: #909399;
  flex-shrink: 0;
}

.attachment-file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 150px;
  height: 40px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  color: #409eff;
  font-size: 13px;
  text-decoration: none;
}

.attachment-file:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

.allergy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.allergy-reports {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.allergy-report {
  padding: 10px 12px;
  border: 1px solid #fde2e2;
  border-radius: 8px;
  background: #fffafa;
}

.allergy-report__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #909399;
}

.allergy-report__summary {
  margin-top: 6px;
  font-size: 14px;
  color: #303133;
}

.allergy-report__files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.record-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed #f2f3f5;
}

.record-row__date {
  color: #909399;
  min-width: 86px;
}

.record-row__main {
  flex: 1;
  color: #303133;
}

.record-row__flag {
  color: #e6a23c;
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.attachment {
  width: 150px;
}

.attachment-thumb {
  width: 150px;
  height: 110px;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

.attachment__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.attachment__date {
  font-size: 12px;
  color: #909399;
}

.attachment__label {
  margin-top: 2px;
  font-size: 12px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dog-archive__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dog-archive__footer-hint {
  font-size: 12px;
  color: #909399;
}
</style>
