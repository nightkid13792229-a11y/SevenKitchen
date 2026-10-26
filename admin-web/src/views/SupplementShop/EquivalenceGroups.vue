<template>
  <div class="equivalence-page">
    <div class="page-header">
      <div>
        <h2>补剂等价组</h2>
        <p class="page-desc">
          把可以互相替代的补剂原料归成一组（<strong>营养素 × 形态/来源</strong>）。
          组审核通过并打开总开关后，DIY 制作单才会用它推荐替代；
          跨组不换，未审核不参与。
        </p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="reload">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建等价组</el-button>
      </div>
    </div>

    <div class="summary-row">
      <el-card shadow="never" class="summary-card">
        <div class="summary-value">{{ summary.total }}</div>
        <div class="summary-label">等价组总数</div>
      </el-card>
      <el-card shadow="never" class="summary-card highlight-ok">
        <div class="summary-value">{{ summary.approved }}</div>
        <div class="summary-label">已审核通过</div>
      </el-card>
      <el-card shadow="never" class="summary-card">
        <div class="summary-value">{{ summary.pending }}</div>
        <div class="summary-label">待审核</div>
      </el-card>
      <el-card shadow="never" class="summary-card">
        <div class="summary-value">{{ summary.draft }}</div>
        <div class="summary-label">草稿</div>
      </el-card>
      <el-card shadow="never" class="summary-card highlight-warn">
        <div class="summary-value">{{ summary.ungrouped }}</div>
        <div class="summary-label">未归组补剂</div>
      </el-card>
      <el-card shadow="never" class="summary-card">
        <div class="summary-value">{{ summary.singleton }}</div>
        <div class="summary-label">单成员组（不能替换）</div>
      </el-card>
    </div>

    <el-tabs v-model="activeTab" class="equivalence-tabs">
      <el-tab-pane label="组列表" name="groups">
        <div class="filter-bar">
          <el-select
            v-model="filters.status"
            placeholder="状态"
            clearable
            style="width: 160px"
            @change="loadGroups"
          >
            <el-option label="草稿" value="DRAFT" />
            <el-option label="待审核" value="PENDING_REVIEW" />
            <el-option label="已通过" value="APPROVED" />
            <el-option label="已停用" value="DISABLED" />
          </el-select>
          <el-input
            v-model="filters.keyword"
            placeholder="搜索组名/编码"
            clearable
            style="width: 260px"
            @keyup.enter="loadGroups"
            @clear="loadGroups"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button @click="loadGroups">查询</el-button>
        </div>

        <el-card shadow="never" v-loading="loading">
          <el-table :data="groups" stripe style="width: 100%">
            <el-table-column label="等价组" min-width="220">
              <template #default="{ row }">
                <div class="group-name">{{ row.name }}</div>
                <div class="group-code">{{ row.code }}</div>
              </template>
            </el-table-column>
            <el-table-column label="营养素" width="150">
              <template #default="{ row }">
                {{ row.nutrientLabel }}
                <span class="unit">({{ row.nutrientUnit }})</span>
              </template>
            </el-table-column>
            <el-table-column label="形态/来源" width="120">
              <template #default="{ row }">{{ row.formCategory || '-' }}</template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)" size="small" effect="plain">
                  {{ statusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="成员" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.memberCount > 1 ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.memberCount }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="引用食谱" width="100" align="center">
              <template #default="{ row }">{{ row.usedByRecipeCount }}</template>
            </el-table-column>
            <el-table-column label="更新时间" width="170">
              <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="260" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row.id)">详情</el-button>
                <el-button link type="primary" @click="openEdit(row.id)">编辑</el-button>
                <el-button
                  v-if="row.status === 'DRAFT'"
                  link
                  type="warning"
                  @click="handleSubmit(row)"
                >提交审核</el-button>
                <el-button
                  v-if="row.status === 'PENDING_REVIEW'"
                  link
                  type="success"
                  @click="handleApprove(row, '')"
                >通过</el-button>
                <el-button
                  v-if="row.status === 'PENDING_REVIEW'"
                  link
                  type="danger"
                  @click="handleReject(row)"
                >驳回</el-button>
                <el-button
                  v-if="row.status === 'APPROVED'"
                  link
                  type="danger"
                  @click="handleDisable(row)"
                >停用</el-button>
                <el-button
                  v-if="row.status === 'DISABLED'"
                  link
                  type="warning"
                  @click="handleEnable(row)"
                >重新编辑</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pagination-row">
            <el-pagination
              v-model:current-page="pagination.page"
              v-model:page-size="pagination.pageSize"
              :total="pagination.total"
              :page-sizes="[10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              @current-change="loadGroups"
              @size-change="loadGroups"
            />
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="未分组原料" name="ungrouped">
        <div class="filter-bar">
          <el-input
            v-model="ungroupedKeyword"
            placeholder="搜索原料名称/品牌/规格"
            clearable
            style="width: 300px"
            @keyup.enter="loadUngrouped"
            @clear="loadUngrouped"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button @click="loadUngrouped">查询</el-button>
          <div class="spacer" />
          <el-select
            v-model="assignGroupId"
            placeholder="选择要归入的组"
            filterable
            style="width: 260px"
          >
            <el-option
              v-for="group in allGroups"
              :key="group.id"
              :label="`${group.name}（${group.nutrientLabel}）`"
              :value="group.id"
            />
          </el-select>
          <el-button
            type="primary"
            :disabled="ungroupedSelection.length === 0 || !assignGroupId"
            @click="handleAssign"
          >
            归入选中（{{ ungroupedSelection.length }}）
          </el-button>
          <el-button @click="exportUngrouped">导出 CSV</el-button>
        </div>
        <el-card shadow="never" v-loading="ungroupedLoading">
          <el-table
            :data="ungrouped"
            stripe
            style="width: 100%"
            @selection-change="(rows: any[]) => (ungroupedSelection = rows)"
          >
            <el-table-column type="selection" width="46" />
            <el-table-column label="原料" min-width="200">
              <template #default="{ row }">
                <div class="group-name">{{ row.name }}</div>
                <div class="group-code">
                  {{ [row.brand, row.productModel].filter(Boolean).join(' · ') || '无品牌/规格' }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="形态" width="90">
              <template #default="{ row }">{{ formLabel(row.physicalForm) }}</template>
            </el-table-column>
            <el-table-column label="计量单位" width="100">
              <template #default="{ row }">
                {{ row.unitDisplayLabel || row.purchaseUnit || row.baseUnit }}
              </template>
            </el-table-column>
            <el-table-column label="可 DIY" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.diyEnabled ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.diyEnabled ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="可售卖" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="row.supplementRetailEnabled ? 'success' : 'info'" size="small" effect="plain">
                  {{ row.supplementRetailEnabled ? '是' : '否' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="被食谱使用" width="110" align="center">
              <template #default="{ row }">{{ row._count?.recipeItems ?? 0 }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- 新建/编辑组 -->
    <el-dialog
      v-model="formVisible"
      :title="form.id ? '编辑等价组' : '新建等价组'"
      width="760px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form :model="form" label-width="110px">
        <el-form-item label="营养素来源">
          <el-radio-group v-model="form.mode">
            <el-radio-button label="standard">标准营养素</el-radio-button>
            <el-radio-button label="custom">自定义成分</el-radio-button>
          </el-radio-group>
          <div class="form-tip">
            标准营养素用于钙/锌/碘/维生素等；关节、益生菌等用自定义成分（名称 + 单位）。
          </div>
        </el-form-item>

        <template v-if="form.mode === 'standard'">
          <el-form-item label="目标营养素" required>
            <el-select
              v-model="form.nutrientKey"
              filterable
              placeholder="选择营养素"
              style="width: 100%"
              @change="onStandardNutrientChange"
            >
              <el-option
                v-for="option in nutrientOptions"
                :key="option.value"
                :label="`${option.label}（${option.unit}）`"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="成分名称" required>
            <el-input v-model="form.customLabel" placeholder="如：氨糖、软骨素、益生菌" maxlength="50" />
          </el-form-item>
          <el-form-item label="成分单位" required>
            <el-input v-model="form.customUnit" placeholder="如：mg、CFU、亿CFU" maxlength="20" />
          </el-form-item>
        </template>

        <el-form-item label="组名称" required>
          <el-input v-model="form.name" placeholder="如：钙 · 矿物盐" maxlength="100" />
        </el-form-item>
        <el-form-item label="组编码" required>
          <el-input
            v-model="form.code"
            placeholder="大写字母/数字/下划线，如 CALCIUM_MINERAL_SALT"
            maxlength="64"
          />
          <div class="form-tip">唯一编码，创建后不建议改。</div>
        </el-form-item>
        <el-form-item label="形态/来源">
          <el-input v-model="form.formCategory" placeholder="如：矿物盐、骨源、螯合、天然、复方" maxlength="50" />
        </el-form-item>
        <el-form-item label="组定义/边界">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="2"
            placeholder="这个组包含什么、不包含什么；什么情况下不能换"
          />
        </el-form-item>
        <el-form-item label="分组依据">
          <el-input
            v-model="form.rationale"
            type="textarea"
            :rows="2"
            placeholder="为什么这些原料可以互换；边界依据"
          />
        </el-form-item>
        <el-form-item label="依据链接">
          <el-input
            v-model="form.evidenceText"
            type="textarea"
            :rows="3"
            placeholder="每行一条：NRC / FEDIAF / AAFCO / EFSA / 同行评审 / 兽医营养教材，附可点开链接"
          />
          <div class="form-tip">审核通过前至少要填 1 条。</div>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="detailVisible" size="72%" :title="detail?.name || '等价组详情'">
      <div v-if="detail" v-loading="detailLoading" class="detail-body">
        <div class="detail-head">
          <el-tag :type="statusType(detail.status)" effect="plain">
            {{ statusLabel(detail.status) }}
          </el-tag>
          <span class="detail-code">{{ detail.code }}</span>
          <span class="detail-nutrient">
            {{ detail.nutrientLabel }}（{{ detail.nutrientUnit }}）
          </span>
          <span class="detail-form">{{ detail.formCategory || '未填形态/来源' }}</span>
          <div class="spacer" />
          <el-button size="small" @click="openEdit(detail.id)">编辑</el-button>
          <el-button
            v-if="detail.status === 'DRAFT'"
            size="small"
            type="warning"
            @click="handleSubmit(detail)"
          >提交审核</el-button>
          <el-button
            v-if="detail.status === 'PENDING_REVIEW'"
            size="small"
            type="success"
            @click="handleApproveDetail"
          >通过</el-button>
          <el-button
            v-if="detail.status === 'PENDING_REVIEW'"
            size="small"
            type="danger"
            @click="handleReject(detail)"
          >驳回</el-button>
          <el-button
            v-if="detail.status === 'APPROVED'"
            size="small"
            type="danger"
            @click="handleDisable(detail)"
          >停用</el-button>
          <el-button
            v-if="detail.status === 'DISABLED'"
            size="small"
            type="warning"
            @click="handleEnable(detail)"
          >重新编辑</el-button>
        </div>

        <el-descriptions :column="2" border size="small" class="detail-desc">
          <el-descriptions-item label="组定义">{{ detail.description || '-' }}</el-descriptions-item>
          <el-descriptions-item label="分组依据">{{ detail.rationale || '-' }}</el-descriptions-item>
          <el-descriptions-item label="审核人">{{ detail.reviewedBy || '-' }}</el-descriptions-item>
          <el-descriptions-item label="审核时间">{{ formatTime(detail.reviewedAt) }}</el-descriptions-item>
          <el-descriptions-item label="审核说明">{{ detail.reviewNote || '-' }}</el-descriptions-item>
          <el-descriptions-item label="引用食谱">{{ detail.usedByRecipeCount }} 道</el-descriptions-item>
          <el-descriptions-item label="依据链接" :span="2">
            <div v-if="(detail.evidenceUrls || []).length === 0" class="muted">未填写（不能通过审核）</div>
            <ul v-else class="evidence-list">
              <li v-for="(url, index) in detail.evidenceUrls" :key="index">
                <a :href="url" target="_blank" rel="noreferrer">{{ url }}</a>
              </li>
            </ul>
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="detail.approvalErrors.length > 0"
          type="warning"
          :closable="false"
          class="approval-alert"
          title="审核前还有这些问题"
        >
          <ul class="error-list">
            <li v-for="(error, index) in detail.approvalErrors" :key="index">{{ error }}</li>
          </ul>
        </el-alert>

        <div class="members-head">
          <h4>成员（{{ detail.memberCount }}）</h4>
          <div class="spacer" />
          <el-select
            v-model="memberToAdd"
            placeholder="选择未归组补剂"
            filterable
            multiple
            collapse-tags
            style="width: 340px"
          >
            <el-option
              v-for="item in ungrouped"
              :key="item.id"
              :label="`${item.name}${item.brand ? ' · ' + item.brand : ''}`"
              :value="item.id"
            />
          </el-select>
          <el-button
            type="primary"
            size="small"
            :disabled="memberToAdd.length === 0"
            @click="handleAddMembers"
          >加入</el-button>
        </div>

        <el-table :data="detail.members" size="small" stripe>
          <el-table-column label="原料" min-width="180">
            <template #default="{ row }">
              <span>{{ row.name }}</span>
              <el-tag
                v-if="row.id === detail.referenceIngredientId"
                size="small"
                type="success"
                effect="plain"
                class="ref-tag"
              >参考原料</el-tag>
              <div class="group-code">{{ [row.brand, row.productModel].filter(Boolean).join(' · ') }}</div>
            </template>
          </el-table-column>
          <el-table-column label="形态" width="90">
            <template #default="{ row }">{{ formLabel(row.physicalForm) }}</template>
          </el-table-column>
          <el-table-column label="单位" width="80">
            <template #default="{ row }">{{ row.unitDisplayLabel || row.purchaseUnit }}</template>
          </el-table-column>
          <el-table-column label="有效成分浓度" width="160">
            <template #default="{ row }">
              <span v-if="row.concentration">
                {{ row.concentration.value }} {{ row.concentration.unit }} / {{ row.unitDisplayLabel || row.baseUnit }}
              </span>
              <el-tag v-else type="warning" size="small" effect="plain">
                {{ row.concentrationStatus === 'UNIT_MISMATCH' ? `单位不符（${row.actualUnit || '?'}）` : '缺浓度' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="可 DIY / 可售" width="120" align="center">
            <template #default="{ row }">
              {{ row.diyEnabled ? 'DIY' : '—' }} / {{ row.supplementRetailEnabled ? '售' : '—' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ row }">
              <el-button link type="danger" size="small" @click="handleRemoveMember(row)">移出</el-button>
            </template>
          </el-table-column>
        </el-table>

        <h4 class="audit-title">变更记录</h4>
        <el-timeline class="audit-timeline">
          <el-timeline-item
            v-for="log in detail.auditLogs"
            :key="log.id"
            :timestamp="formatTime(log.createdAt)"
            placement="top"
          >
            <div class="audit-line">
              <el-tag size="small" effect="plain">{{ actionLabel(log.action) }}</el-tag>
              <span class="muted">{{ log.operatorName || log.operatorId || '系统' }}</span>
            </div>
            <pre v-if="log.changes" class="audit-json">{{ prettyJson(log.changes) }}</pre>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import {
  DERIVED_NUTRITION_FIELD_CATALOG,
  NUTRITION_FIELD_CATALOG,
} from '@/utils/recipeDesigner/nutritionFieldCatalog';
import {
  supplementEquivalenceApi,
  type EquivalenceGroupDetail,
  type EquivalenceGroupStatus,
  type EquivalenceGroupSummary,
  type UngroupedIngredient,
} from '@/api/supplementEquivalence';

const activeTab = ref('groups');
const loading = ref(false);
const saving = ref(false);
const detailLoading = ref(false);
const ungroupedLoading = ref(false);

const summary = reactive({
  total: 0,
  approved: 0,
  pending: 0,
  draft: 0,
  disabled: 0,
  ungrouped: 0,
  singleton: 0,
});

const filters = reactive({ status: '', keyword: '' });
const pagination = reactive({ page: 1, pageSize: 20, total: 0 });
const groups = ref<EquivalenceGroupSummary[]>([]);
const allGroups = ref<EquivalenceGroupSummary[]>([]);

const ungrouped = ref<UngroupedIngredient[]>([]);
const ungroupedKeyword = ref('');
const ungroupedSelection = ref<UngroupedIngredient[]>([]);
const assignGroupId = ref('');

const detailVisible = ref(false);
const detail = ref<EquivalenceGroupDetail | null>(null);
const memberToAdd = ref<string[]>([]);

const formVisible = ref(false);
const form = reactive({
  id: '',
  mode: 'standard' as 'standard' | 'custom',
  nutrientKey: '',
  customLabel: '',
  customUnit: '',
  name: '',
  code: '',
  formCategory: '',
  description: '',
  rationale: '',
  evidenceText: '',
  sortOrder: 0,
});

const nutrientOptions = computed(() => [
  ...NUTRITION_FIELD_CATALOG.map((field) => ({
    value: field.fieldPath,
    label: field.label,
    unit: field.unit,
  })),
  ...DERIVED_NUTRITION_FIELD_CATALOG.map((field) => ({
    value: field.fieldPath,
    label: field.label,
    unit: field.unit,
  })),
]);

function statusLabel(status: string) {
  return {
    DRAFT: '草稿',
    PENDING_REVIEW: '待审核',
    APPROVED: '已通过',
    DISABLED: '已停用',
  }[status] || status;
}

function statusType(status: string) {
  return ({
    DRAFT: 'info',
    PENDING_REVIEW: 'warning',
    APPROVED: 'success',
    DISABLED: 'danger',
  } as Record<string, 'info' | 'warning' | 'success' | 'danger'>)[status] || 'info';
}

function actionLabel(action: string) {
  return {
    CREATE: '创建',
    UPDATE: '修改',
    STATUS_CHANGE: '状态变更',
    MEMBER_ADD: '加入成员',
    MEMBER_REMOVE: '移出成员',
  }[action] || action;
}

function formLabel(value: string | null) {
  return {
    POWDER: '粉剂',
    TABLET: '片剂',
    CAPSULE: '胶囊',
    LIQUID: '液体',
  }[value || ''] || '-';
}

function formatTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeCustomName(value: string) {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function evidenceList() {
  return form.evidenceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function loadSummary() {
  try {
    Object.assign(summary, await supplementEquivalenceApi.summary());
  } catch (error: any) {
    ElMessage.error(error?.message || '读取统计失败');
  }
}

async function loadGroups() {
  loading.value = true;
  try {
    const result = await supplementEquivalenceApi.listGroups({
      status: filters.status || undefined,
      keyword: filters.keyword || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    groups.value = result.items;
    pagination.total = result.total;
  } catch (error: any) {
    ElMessage.error(error?.message || '读取等价组失败');
  } finally {
    loading.value = false;
  }
}

async function loadAllGroups() {
  try {
    const result = await supplementEquivalenceApi.listGroups({ pageSize: 100 });
    allGroups.value = result.items;
  } catch {
    // 归组下拉失败不阻塞列表
  }
}

async function loadUngrouped() {
  ungroupedLoading.value = true;
  try {
    ungrouped.value = await supplementEquivalenceApi.listUngrouped(
      ungroupedKeyword.value || undefined,
    );
  } catch (error: any) {
    ElMessage.error(error?.message || '读取未分组原料失败');
  } finally {
    ungroupedLoading.value = false;
  }
}

async function reload() {
  await Promise.all([loadSummary(), loadGroups(), loadAllGroups(), loadUngrouped()]);
}

function resetForm() {
  form.id = '';
  form.mode = 'standard';
  form.nutrientKey = '';
  form.customLabel = '';
  form.customUnit = '';
  form.name = '';
  form.code = '';
  form.formCategory = '';
  form.description = '';
  form.rationale = '';
  form.evidenceText = '';
  form.sortOrder = 0;
}

function openCreate() {
  resetForm();
  formVisible.value = true;
}

function onStandardNutrientChange(value: string) {
  const option = nutrientOptions.value.find((item) => item.value === value);
  if (!option) return;
  if (!form.code) {
    form.code = value.replace(/[.]/g, '_').toUpperCase();
  }
  if (!form.name) {
    form.name = form.formCategory
      ? `${option.label} · ${form.formCategory}`
      : option.label;
  }
}

async function openEdit(id: string) {
  try {
    const group = await supplementEquivalenceApi.getGroup(id);
    resetForm();
    form.id = group.id;
    form.mode = group.nutrientKey.startsWith('custom:') ? 'custom' : 'standard';
    form.nutrientKey = group.nutrientKey;
    form.customLabel = group.nutrientKey.startsWith('custom:')
      ? group.nutrientLabel
      : '';
    form.customUnit = group.nutrientKey.startsWith('custom:')
      ? group.nutrientUnit
      : '';
    form.name = group.name;
    form.code = group.code;
    form.formCategory = group.formCategory || '';
    form.description = group.description || '';
    form.rationale = group.rationale || '';
    form.evidenceText = (group.evidenceUrls || []).join('\n');
    form.sortOrder = group.sortOrder;
    formVisible.value = true;
  } catch (error: any) {
    ElMessage.error(error?.message || '读取组详情失败');
  }
}

async function handleSave() {
  const nutrientKey =
    form.mode === 'custom'
      ? `custom:${normalizeCustomName(form.customLabel)}`
      : form.nutrientKey;
  const nutrientOption = nutrientOptions.value.find(
    (item) => item.value === nutrientKey,
  );
  const nutrientLabel =
    form.mode === 'custom' ? form.customLabel.trim() : nutrientOption?.label || '';
  const nutrientUnit =
    form.mode === 'custom' ? form.customUnit.trim() : nutrientOption?.unit || '';

  if (!nutrientKey || !nutrientLabel || !nutrientUnit) {
    ElMessage.warning('请先选择/填写目标营养素和单位');
    return;
  }
  if (!form.name.trim() || !form.code.trim()) {
    ElMessage.warning('组名称和编码不能为空');
    return;
  }

  const payload = {
    code: form.code.trim(),
    name: form.name.trim(),
    nutrientKey,
    nutrientLabel,
    nutrientUnit,
    formCategory: form.formCategory.trim() || null,
    description: form.description.trim() || null,
    rationale: form.rationale.trim() || null,
    evidenceUrls: evidenceList(),
    sortOrder: form.sortOrder,
  };

  saving.value = true;
  try {
    if (form.id) {
      await supplementEquivalenceApi.updateGroup(form.id, payload);
      ElMessage.success('已保存；如果原来是已通过，会退回草稿重新审核');
    } else {
      await supplementEquivalenceApi.createGroup(payload);
      ElMessage.success('已创建草稿');
    }
    formVisible.value = false;
    await reload();
    if (detailVisible.value && detail.value?.id === form.id) {
      await openDetail(form.id);
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function openDetail(id: string) {
  detailVisible.value = true;
  detailLoading.value = true;
  memberToAdd.value = [];
  try {
    detail.value = await supplementEquivalenceApi.getGroup(id);
  } catch (error: any) {
    ElMessage.error(error?.message || '读取组详情失败');
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

async function refreshDetail(id: string) {
  if (!detailVisible.value || detail.value?.id !== id) return;
  detail.value = await supplementEquivalenceApi.getGroup(id);
}

async function handleSubmit(row: { id: string }) {
  try {
    await supplementEquivalenceApi.submitGroup(row.id);
    ElMessage.success('已提交审核');
    await reload();
    await refreshDetail(row.id);
  } catch (error: any) {
    ElMessage.error(error?.message || '提交失败');
  }
}

async function handleApprove(row: { id: string }, note?: string) {
  let reviewNote = note ?? '';
  if (note === undefined) {
    try {
      const result = await ElMessageBox.prompt(
        '审核说明（可选，会留在变更记录里）',
        '通过审核',
        { confirmButtonText: '通过', cancelButtonText: '取消', inputType: 'textarea' },
      );
      reviewNote = result.value || '';
    } catch {
      return;
    }
  }
  try {
    await supplementEquivalenceApi.reviewGroup(row.id, {
      status: 'APPROVED',
      reviewNote,
    });
    ElMessage.success('已通过审核，可以打开总开关使用');
    await reload();
    await refreshDetail(row.id);
  } catch (error: any) {
    ElMessage.error(error?.message || '审核失败');
  }
}

async function handleApproveDetail() {
  if (!detail.value) return;
  await handleApprove(detail.value);
}

async function handleReject(row: { id: string }) {
  try {
    const result = await ElMessageBox.prompt(
      '驳回原因（会留在变更记录里）',
      '驳回',
      { confirmButtonText: '驳回', cancelButtonText: '取消', inputType: 'textarea' },
    );
    await supplementEquivalenceApi.reviewGroup(row.id, {
      status: 'DRAFT',
      reviewNote: result.value || '',
    });
    ElMessage.success('已驳回，退回草稿');
    await reload();
    await refreshDetail(row.id);
  } catch (error: any) {
    if (error === 'cancel') return;
    ElMessage.error(error?.message || '驳回失败');
  }
}

async function handleDisable(row: { id: string }) {
  try {
    await ElMessageBox.confirm(
      '停用后该组不再参与替代推荐；可以再点“重新编辑”回到草稿。',
      '停用等价组',
      { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' },
    );
    await supplementEquivalenceApi.reviewGroup(row.id, { status: 'DISABLED' });
    ElMessage.success('已停用');
    await reload();
    await refreshDetail(row.id);
  } catch (error: any) {
    if (error === 'cancel') return;
    ElMessage.error(error?.message || '停用失败');
  }
}

async function handleEnable(row: { id: string }) {
  try {
    await supplementEquivalenceApi.reviewGroup(row.id, { status: 'DRAFT' });
    ElMessage.success('已回到草稿，修改后重新提交审核');
    await reload();
    await refreshDetail(row.id);
  } catch (error: any) {
    ElMessage.error(error?.message || '操作失败');
  }
}

async function handleAddMembers() {
  if (!detail.value || memberToAdd.value.length === 0) return;
  try {
    detail.value = await supplementEquivalenceApi.addMembers(
      detail.value.id,
      memberToAdd.value,
    );
    memberToAdd.value = [];
    ElMessage.success('已加入');
    await reload();
  } catch (error: any) {
    ElMessage.error(error?.message || '加入失败');
  }
}

async function handleRemoveMember(member: { id: string; name: string }) {
  if (!detail.value) return;
  try {
    await ElMessageBox.confirm(
      `把「${member.name}」移出该组？已通过的组会退回草稿。`,
      '移出成员',
      { type: 'warning', confirmButtonText: '移出', cancelButtonText: '取消' },
    );
    detail.value = await supplementEquivalenceApi.removeMember(
      detail.value.id,
      member.id,
    );
    ElMessage.success('已移出');
    await reload();
  } catch (error: any) {
    if (error === 'cancel') return;
    ElMessage.error(error?.message || '移出失败');
  }
}

async function handleAssign() {
  if (!assignGroupId.value || ungroupedSelection.value.length === 0) return;
  try {
    const result = await supplementEquivalenceApi.assign(
      ungroupedSelection.value.map((row) => row.id),
      assignGroupId.value,
    );
    ElMessage.success(
      `已归组 ${result.moved} 个${result.skipped ? `，跳过 ${result.skipped} 个` : ''}`,
    );
    ungroupedSelection.value = [];
    await reload();
  } catch (error: any) {
    ElMessage.error(error?.message || '归组失败');
  }
}

function exportUngrouped() {
  const rows = ungroupedSelection.value.length
    ? ungroupedSelection.value
    : ungrouped.value;
  if (rows.length === 0) {
    ElMessage.warning('没有可导出的原料');
    return;
  }
  const header = [
    '原料名称',
    '品牌',
    '规格',
    '形态',
    '计量单位',
    '可DIY',
    '可售卖',
    '被食谱使用',
  ];
  const lines = rows.map((row) =>
    [
      row.name,
      row.brand || '',
      row.productModel || '',
      formLabel(row.physicalForm),
      row.unitDisplayLabel || row.purchaseUnit || row.baseUnit,
      row.diyEnabled ? '是' : '否',
      row.supplementRetailEnabled ? '是' : '否',
      row._count?.recipeItems ?? 0,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(','),
  );
  const blob = new Blob(['\uFEFF' + [header.join(','), ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `补剂未分组原料-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

onMounted(reload);
</script>

<style scoped>
.equivalence-page {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0 0 6px;
}
.page-desc {
  margin: 0;
  max-width: 880px;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.summary-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}
.summary-card {
  text-align: center;
}
.summary-value {
  font-size: 24px;
  font-weight: 600;
}
.summary-label {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
}
.highlight-ok .summary-value {
  color: #67c23a;
}
.highlight-warn .summary-value {
  color: #e6a23c;
}
.filter-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.spacer {
  flex: 1;
}
.group-name {
  font-weight: 500;
}
.group-code {
  color: #909399;
  font-size: 12px;
}
.unit {
  color: #909399;
  font-size: 12px;
}
.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.form-tip {
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
  margin-top: 4px;
}
.detail-body {
  padding: 0 8px 24px;
}
.detail-head {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.detail-code,
.detail-nutrient,
.detail-form {
  color: #606266;
  font-size: 13px;
}
.detail-form {
  color: #909399;
}
.detail-desc {
  margin-bottom: 16px;
}
.evidence-list {
  margin: 0;
  padding-left: 18px;
  word-break: break-all;
}
.approval-alert {
  margin-bottom: 16px;
}
.error-list {
  margin: 6px 0 0;
  padding-left: 18px;
}
.members-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.members-head h4 {
  margin: 0;
}
.ref-tag {
  margin-left: 8px;
}
.audit-title {
  margin: 24px 0 12px;
}
.audit-timeline {
  padding-left: 4px;
}
.audit-line {
  display: flex;
  gap: 8px;
  align-items: center;
}
.audit-json {
  margin: 6px 0 0;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
}
.muted {
  color: #909399;
  font-size: 12px;
}
</style>
