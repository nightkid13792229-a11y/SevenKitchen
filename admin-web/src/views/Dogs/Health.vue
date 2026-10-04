<template>
  <div class="dog-health" v-loading="loading">
    <!-- 顶部：狗的基本信息 + 最近更新时间（老板第 25 条：让营养师一眼看出"有没有新东西"） -->
    <el-card shadow="never" class="header-card">
      <div class="header">
        <div class="header__main">
          <h2>{{ overview?.dog?.name || "健康档案" }}</h2>
          <div class="header__meta">
            <el-tag size="small" type="info">{{ overview?.dog?.breedName || "未知品种" }}</el-tag>
            <span>{{ overview?.dog?.gender }} · {{ overview?.dog?.isNeutered ? "已绝育" : "未绝育" }}</span>
            <span>{{ overview?.dog?.ageText }}</span>
            <span>{{ overview?.dog?.currentWeightKg }} kg · BCS {{ overview?.dog?.bcsScore }}</span>
          </div>
        </div>
        <div class="header__actions">
          <span class="updated">
            健康信息最近更新：{{ formatTime(overview?.lastHealthUpdatedAt) }}
          </span>
          <el-button size="small" @click="load">刷新</el-button>
        </div>
      </div>

      <div class="counts">
        <span>就诊 {{ overview?.counts?.visits || 0 }}</span>
        <span>体检 {{ overview?.counts?.checkups || 0 }}</span>
        <span>过敏 {{ overview?.counts?.allergies || 0 }}</span>
        <span>疫苗 {{ overview?.counts?.vaccines || 0 }}</span>
        <span>体重 {{ overview?.counts?.weights || 0 }}</span>
        <span class="counts__strong">报告原件 {{ overview?.counts?.attachments || 0 }}</span>
      </div>
    </el-card>

    <!-- 第 24 条：健康标签纠错 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-head">
          <span>健康标签</span>
          <span class="section-head__hint">
            系统从病历文字里自动猜出来的标签。猜错了在这里改 —— 改完会直接影响 AI 引用哪些知识条目。
          </span>
        </div>
      </template>

      <div class="tags">
        <el-tag
          v-for="tag in overview?.derivedTags || []"
          :key="`d-${tag}`"
          :type="overrides.removed.includes(tag) ? 'info' : 'success'"
          :effect="overrides.removed.includes(tag) ? 'plain' : 'light'"
          closable
          @close="removeTag(tag)"
        >
          {{ tag }}
        </el-tag>
        <el-tag
          v-for="tag in overrides.added"
          :key="`a-${tag}`"
          type="warning"
          closable
          @close="removeAddedTag(tag)"
        >
          {{ tag }}（人工加）
        </el-tag>
      </div>

      <div class="tag-actions">
        <el-select
          v-model="tagToAdd"
          filterable
          placeholder="从受控词表里选一个标签加上"
          size="small"
          style="width: 260px"
        >
          <el-option v-for="tag in addableTags" :key="tag" :label="tag" :value="tag" />
        </el-select>
        <el-button size="small" type="primary" @click="addTag">加上</el-button>
        <el-button size="small" @click="saveTags" :loading="savingTags">保存修正</el-button>
        <el-button size="small" text @click="resetTags">还原</el-button>
      </div>

      <div class="final-tags">
        <span class="final-tags__label">最终用于检索的标签：</span>
        <el-tag v-for="tag in effectiveTags" :key="`f-${tag}`" size="small" effect="plain">
          {{ tag }}
        </el-tag>
      </div>
    </el-card>

    <!-- 第 23 条：报告原件 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-head">
          <span>顾客上传的报告原件（{{ overview?.attachments?.length || 0 }}）</span>
          <span class="section-head__hint">点开可看大图；这些是顾客自己上传的，不是我们的资料库</span>
        </div>
      </template>

      <el-empty v-if="!overview?.attachments?.length" description="这位顾客还没有上传过报告" />
      <div v-else class="attachments">
        <div
          v-for="(item, index) in overview.attachments"
          :key="`${item.recordId}-${index}`"
          class="attachment"
        >
          <el-image
            :src="item.url"
            :preview-src-list="attachmentUrls"
            :initial-index="index"
            fit="cover"
            class="attachment__img"
          />
          <div class="attachment__meta">
            <el-tag size="small" :type="item.source === 'visit' ? 'warning' : 'success'">
              {{ item.source === "visit" ? "就诊" : "体检" }}
            </el-tag>
            <span class="attachment__date">{{ item.recordDate }}</span>
            <span class="attachment__label">{{ item.recordLabel }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 第 22 条：完整健康分析 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-head">
          <span>AI 健康分析</span>
          <span class="section-head__hint">
            结论只能来自知识库条目，每段都标了引用的条目编号。未审核条目对顾客不可见，但你能看到。
          </span>
        </div>
      </template>

      <el-alert
        v-if="overview?.analysis?.error"
        type="warning"
        :closable="false"
        :title="`分析生成失败：${overview.analysis.error}`"
        description="记录本身仍然可以看，分析可以稍后重试。"
      />

      <template v-else-if="overview?.analysis?.items?.length">
        <div v-for="item in overview.analysis.items" :key="item.section" class="analysis-item">
          <div class="analysis-item__title">{{ item.label }}</div>
          <div class="analysis-item__content">{{ item.content }}</div>
          <div v-if="item.citations?.length" class="analysis-item__cites">
            <span>依据</span>
            <el-tag v-for="cite in item.citations" :key="cite" size="small" effect="plain">
              {{ cite }}
            </el-tag>
          </div>
        </div>
      </template>

      <el-empty v-else description="还没有可展示的分析" />
    </el-card>

    <!-- 就诊前摘要（与顾客侧同一份数据） -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-head">
          <span>健康记录</span>
          <span class="section-head__hint">过敏 → 未结束的问题 → 就诊 → 体检 → 疫苗</span>
        </div>
      </template>

      <div class="record-block">
        <div class="record-block__title">过敏</div>
        <div v-if="!overview?.allergies?.length" class="record-empty">无</div>
        <el-tag v-for="item in overview?.allergies || []" :key="item.allergen" type="danger" class="allergy-tag">
          {{ item.allergen }}
        </el-tag>
      </div>

      <div class="record-block">
        <div class="record-block__title">还没结束的问题</div>
        <el-empty v-if="!overview?.ongoingConditions?.length" description="无" :image-size="40" />
        <div v-for="item in overview?.ongoingConditions || []" :key="item.id" class="record-row">
          <span class="record-row__date">{{ item.date }}</span>
          <span class="record-row__main">{{ item.diagnosis }}</span>
          <el-tag size="small">{{ item.status }}</el-tag>
        </div>
      </div>

      <div class="record-block">
        <div class="record-block__title">最近就诊</div>
        <el-empty v-if="!overview?.recentVisits?.length" description="无" :image-size="40" />
        <div v-for="item in overview?.recentVisits || []" :key="item.id" class="record-row">
          <span class="record-row__date">{{ item.date }}</span>
          <span class="record-row__main">{{ item.diagnosis }}</span>
          <span v-if="item.attachmentCount" class="record-row__flag">{{ item.attachmentCount }} 个附件</span>
        </div>
      </div>

      <div class="record-block">
        <div class="record-block__title">最近体检</div>
        <el-empty v-if="!overview?.recentCheckups?.length" description="无" :image-size="40" />
        <div v-for="item in overview?.recentCheckups || []" :key="item.id" class="record-row">
          <span class="record-row__date">{{ item.date }}</span>
          <span class="record-row__main">{{ item.findings || "未填写检查结论" }}</span>
          <span v-if="item.attachmentCount" class="record-row__flag">{{ item.attachmentCount }} 个附件</span>
        </div>
      </div>

      <div class="record-block">
        <div class="record-block__title">疫苗</div>
        <el-empty v-if="!overview?.vaccines?.latest?.length" description="无" :image-size="40" />
        <div v-for="item in overview?.vaccines?.latest || []" :key="item.id" class="record-row">
          <span class="record-row__date">{{ item.date }}</span>
          <span class="record-row__main">{{ item.name }}</span>
          <span v-if="item.nextDueDate" class="record-row__flag">下次 {{ item.nextDueDate }}</span>
        </div>
      </div>

      <div class="record-block">
        <div class="record-block__title">饮食偏好</div>
        <div class="record-line">
          <span class="record-line__label">爱吃</span>
          <span>{{ (overview?.dietPreferences?.liked || []).join("、") || overview?.diet?.preferredFoods || "无" }}</span>
        </div>
        <div class="record-line">
          <span class="record-line__label">不吃</span>
          <span>{{ (overview?.dietPreferences?.disliked || []).join("、") || overview?.diet?.pickyFoods || "无" }}</span>
        </div>
      </div>

      <div class="record-block">
        <div class="record-block__title">档案里的病史描述</div>
        <div class="record-empty">{{ overview?.dog?.medicalHistory || "无" }}</div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import { dogApi } from "@/api/dogs";
import {
  applyAddHealthTag,
  applyRemoveAddedHealthTag,
  applyRemoveHealthTag,
  buildEffectiveHealthTags,
  cloneHealthTagOverrides,
  formatHealthUpdatedAt,
  listAddableHealthTags,
  type HealthTagOverrides,
} from "@/utils/dogHealthTags";

/**
 * 营养师端 · 某只狗的完整健康档案（2026-10-01，第八期）。
 *
 * 老板第 22–25 条：
 *   22. 营养师要有一个独立页面看完整健康分析
 *   23. 顾客上传的报告原件后台要能看到
 *   24. 健康标签要能人工纠错
 *   25. 顾客改了健康信息要告知正在设计食谱的营养师
 *       → 顶部那行"健康信息最近更新"就是答案：进来一眼看到有没有新东西
 */
const route = useRoute();
const dogId = computed(() => String(route.params.id || ""));

const loading = ref(false);
const savingTags = ref(false);
const overview = ref<any>(null);

const overrides = ref<HealthTagOverrides>({ added: [], removed: [] });
const tagToAdd = ref("");

const attachmentUrls = computed(() =>
  (overview.value?.attachments || []).map((item: any) => item.url),
);

/** 可加的标签：词表里已有、且当前派生结果里没有的 */
const addableTags = computed(() =>
  listAddableHealthTags(
    overview.value?.vocabulary || [],
    overview.value?.derivedTags || [],
    overrides.value,
  ),
);

/** 最终用于检索的标签（派生 − 人工删除 + 人工添加） */
const effectiveTags = computed(() =>
  buildEffectiveHealthTags(overview.value?.derivedTags || [], overrides.value),
);

/** 顶部"健康信息最近更新"的展示格式；算法在 utils/dogHealthTags 里（有测试） */
const formatTime = formatHealthUpdatedAt;

async function load() {
  if (!dogId.value) return;
  loading.value = true;
  try {
    overview.value = await dogApi.getHealthOverview(dogId.value);
    overrides.value = cloneHealthTagOverrides(overview.value?.tagOverrides);
  } catch (error: any) {
    ElMessage.error(error?.message || "加载健康档案失败");
  } finally {
    loading.value = false;
  }
}

function removeTag(tag: string) {
  // 派生标签 → 记入"人工删除"；人工加的标签 → 撤销那次添加
  overrides.value = applyRemoveHealthTag(overrides.value, tag);
}

function removeAddedTag(tag: string) {
  overrides.value = applyRemoveAddedHealthTag(overrides.value, tag);
}

function addTag() {
  // 空输入不处理（与原来的行为一致）：没选标签时点"加上"不该清掉选择框
  if (!tagToAdd.value.trim()) {
    return;
  }
  overrides.value = applyAddHealthTag(overrides.value, tagToAdd.value);
  tagToAdd.value = "";
}

function resetTags() {
  overrides.value = cloneHealthTagOverrides(overview.value?.tagOverrides);
}

async function saveTags() {
  savingTags.value = true;
  try {
    const result = await dogApi.setHealthTags(dogId.value, {
      added: overrides.value.added,
      removed: overrides.value.removed,
    });
    overrides.value = cloneHealthTagOverrides(result?.overrides);
    ElMessage.success("已保存，下次生成配方会按新标签检索");
  } catch (error: any) {
    ElMessage.error(error?.message || "保存失败");
  } finally {
    savingTags.value = false;
  }
}

onMounted(load);
watch(dogId, load);
</script>

<style scoped>
.dog-health {
  padding: 16px;
}

.header-card,
.section-card {
  margin-bottom: 16px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header__main h2 {
  margin: 0 0 8px;
}

.header__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: #606266;
}

.header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.updated {
  font-size: 13px;
  color: #909399;
}

.counts {
  display: flex;
  gap: 18px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #ebeef5;
  font-size: 13px;
  color: #606266;
}

.counts__strong {
  color: #303133;
  font-weight: 600;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.section-head__hint {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 32px;
}

.tag-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.final-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed #ebeef5;
}

.final-tags__label {
  font-size: 13px;
  color: #909399;
}

.attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.attachment {
  width: 150px;
}

.attachment__img {
  width: 150px;
  height: 120px;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

.attachment__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  flex-wrap: wrap;
}

.attachment__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.analysis-item {
  padding: 14px 0;
  border-bottom: 1px solid #f2f6fc;
}

.analysis-item:last-child {
  border-bottom: none;
}

.analysis-item__title {
  font-weight: 600;
  color: #303133;
}

.analysis-item__content {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.8;
  color: #4a5a4a;
  white-space: pre-wrap;
}

.analysis-item__cites {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: #909399;
}

.record-block {
  margin-bottom: 18px;
}

.record-block__title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #303133;
}

.record-empty {
  font-size: 13px;
  color: #909399;
}

.record-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
}

.record-row__date {
  color: #909399;
  flex-shrink: 0;
}

.record-row__main {
  color: #303133;
}

.record-row__flag {
  color: #e6a23c;
}

.record-line {
  display: flex;
  gap: 10px;
  font-size: 13px;
  padding: 4px 0;
}

.record-line__label {
  color: #909399;
  flex-shrink: 0;
}

.allergy-tag {
  margin-right: 8px;
}
</style>
