<template>
  <div class="platform-options-page">
    <div class="page-header">
      <div>
        <h2>选项字典</h2>
        <p class="page-desc">
          界面上那些<strong>下拉选项与状态中文</strong>都在这里维护。
          改一次，小程序与后台<strong>同时生效</strong>，不用发版 ——
          在此之前同一份中文在三个端各写一遍，加一个枚举要改六处。
        </p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" @click="reload">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="!isAdmin"
      type="warning"
      :closable="false"
      show-icon
      class="tip-alert"
      title="只能查看"
      :description="`${ADMIN_ONLY_TIP}。选项字典会影响小程序与后台的显示，只允许管理员修改。`"
    />

    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="tip-alert"
      title="两类选项的区别（这决定了能不能加/删）"
      description="「锁住的」是代码里有判断依赖的取值 —— 比如订单状态，代码里写着「已付款才能取消」，随手加一个值会让逻辑对不上，所以只能改它的中文与排序。「可增删的」是纯选项，随时可以加。"
    />

    <div class="layout">
      <!-- 左：选项集清单 -->
      <el-card shadow="never" class="set-list-card">
        <template #header>
          <span class="card-title">选项集</span>
        </template>
        <ul class="set-list">
          <li
            v-for="set in sets"
            :key="set.code"
            :class="['set-item', { 'set-item--active': set.code === activeCode }]"
            @click="selectSet(set.code)"
          >
            <div class="set-item__main">
              <span class="set-item__name">{{ set.name }}</span>
              <span class="set-item__code">{{ set.code }}</span>
            </div>
            <div class="set-item__meta">
              <el-tag
                size="small"
                :type="set.canAddOrRemove ? 'success' : 'info'"
                effect="plain"
              >
                {{ set.canAddOrRemove ? '可增删' : '锁住' }}
              </el-tag>
              <span class="set-item__count">{{ set.enabledCount }}/{{ set.itemCount }}</span>
            </div>
          </li>
        </ul>
      </el-card>

      <!-- 右：条目表 -->
      <el-card shadow="never" class="item-card" v-loading="detailLoading">
        <template #header>
          <div class="item-card__header">
            <div>
              <span class="card-title">{{ detail?.name || '——' }}</span>
              <span v-if="detail?.description" class="card-desc">{{ detail.description }}</span>
            </div>
            <div class="item-card__actions">
              <el-tooltip
                v-if="!canAddOrRemove"
                content="这个选项集的取值由代码定义，不能新增。如需新增请先改代码里的枚举"
                placement="bottom"
              >
                <span><el-button size="small" disabled>新增选项</el-button></span>
              </el-tooltip>
              <el-tooltip
                v-else-if="!isAdmin"
                :content="ADMIN_ONLY_TIP"
                placement="bottom"
              >
                <span><el-button size="small" disabled>新增选项</el-button></span>
              </el-tooltip>
              <el-button
                v-else
                size="small"
                type="primary"
                @click="openCreate"
              >
                新增选项
              </el-button>
            </div>
          </div>
        </template>

        <el-table :data="detail?.items || []" size="small" stripe>
          <el-table-column label="码" width="180">
            <template #default="{ row }">
              <code class="code-cell">{{ row.code }}</code>
            </template>
          </el-table-column>

          <el-table-column label="显示中文" min-width="130">
            <template #default="{ row }">
              <span :class="{ 'label-unset': row.label === row.code }">
                {{ row.label }}
              </span>
              <el-tooltip
                v-if="row.label === row.code"
                content="还没配中文，界面上会显示这串英文码"
                placement="top"
              >
                <span class="label-warn">⚠</span>
              </el-tooltip>
            </template>
          </el-table-column>

          <el-table-column label="说明" min-width="200">
            <template #default="{ row }">
              <span class="desc-cell">{{ row.description || '—' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="色调" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.tone" size="small" effect="plain">{{ row.tone }}</el-tag>
              <span v-else class="desc-cell">—</span>
            </template>
          </el-table-column>

          <el-table-column label="排序" width="80" prop="sortOrder" />

          <el-table-column label="启用" width="80">
            <template #default="{ row }">
              <el-tag v-if="row.enabled" size="small" type="success" effect="plain">启用</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">停用</el-tag>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-tooltip v-if="!isAdmin" :content="ADMIN_ONLY_TIP" placement="top">
                <span><el-button size="small" link disabled>编辑</el-button></span>
              </el-tooltip>
              <el-button v-else size="small" link type="primary" @click="openEdit(row)">编辑</el-button>

              <template v-if="canAddOrRemove">
                <el-tooltip v-if="!isAdmin" :content="ADMIN_ONLY_TIP" placement="top">
                  <span><el-button size="small" link disabled>删除</el-button></span>
                </el-tooltip>
                <el-button
                  v-else
                  size="small"
                  link
                  type="danger"
                  @click="handleDelete(row)"
                >
                  删除
                </el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <!-- 编辑 -->
    <el-dialog v-model="editVisible" title="编辑选项" width="520px">
      <el-form label-width="88px">
        <el-form-item label="码">
          <code class="code-cell">{{ editForm.code }}</code>
          <span class="form-hint">码是写进业务数据里的值，不能改</span>
        </el-form-item>
        <el-form-item label="显示中文">
          <el-input v-model="editForm.label" maxlength="64" show-word-limit />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="editForm.description" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="色调">
          <el-select v-model="editForm.tone" clearable placeholder="不设置">
            <el-option v-for="tone in tones" :key="tone" :label="tone" :value="tone" />
          </el-select>
          <span class="form-hint">决定界面上的颜色档位，不是具体颜色值</span>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="editForm.sortOrder" :min="0" :max="9999" />
          <span class="form-hint">数字越小越靠前</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editForm.enabled" />
          <span class="form-hint">停用后小程序不再显示它，但历史数据不受影响</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新增 -->
    <el-dialog v-model="createVisible" title="新增选项" width="460px">
      <el-form label-width="88px">
        <el-form-item label="码">
          <el-input v-model="createForm.code" placeholder="英文大写，例如 URGENT" />
          <span class="form-hint">写进业务数据里的值，建议英文大写；保存后不能改</span>
        </el-form-item>
        <el-form-item label="显示中文">
          <el-input v-model="createForm.label" maxlength="64" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="createForm.sortOrder" :min="0" :max="9999" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleCreate">新增</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  platformOptionsApi,
  type AdminPlatformOptionItem,
  type PlatformOptionSetDetail,
  type PlatformOptionSetSummary
} from '@/api/platformOptions'
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole'
import { toastApiError } from '@/utils/apiError'

const isAdmin = useIsAdmin()

const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)

const sets = ref<PlatformOptionSetSummary[]>([])
/** 色彩档位由后端给 —— 前端不写死一份清单 */
const tones = ref<string[]>([])
const activeCode = ref('')
const detail = ref<PlatformOptionSetDetail | null>(null)

const canAddOrRemove = computed(() => {
  return sets.value.find((set) => set.code === activeCode.value)?.canAddOrRemove ?? false
})

const editVisible = ref(false)
const createVisible = ref(false)

const editForm = reactive({
  code: '',
  label: '',
  description: '',
  tone: '' as string,
  sortOrder: 0,
  enabled: true
})

const createForm = reactive({
  code: '',
  label: '',
  sortOrder: 100
})

async function loadSets() {
  loading.value = true
  try {
    const data = await platformOptionsApi.listSets()
    sets.value = data.sets
    tones.value = data.tones
    const firstSet = sets.value[0]
    if (!activeCode.value && firstSet) {
      activeCode.value = firstSet.code
    }
  } catch (error) {
    toastApiError(error, '选项集加载失败', (m) => ElMessage.error(m))
  } finally {
    loading.value = false
  }
}

async function loadDetail() {
  if (!activeCode.value) return
  detailLoading.value = true
  try {
    detail.value = await platformOptionsApi.getSet(activeCode.value)
  } catch (error) {
    toastApiError(error, '选项加载失败', (m) => ElMessage.error(m))
    detail.value = null
  } finally {
    detailLoading.value = false
  }
}

async function reload() {
  await loadSets()
  await loadDetail()
}

async function selectSet(code: string) {
  if (code === activeCode.value) return
  activeCode.value = code
  await loadDetail()
}

function openEdit(row: AdminPlatformOptionItem) {
  editForm.code = row.code
  editForm.label = row.label
  editForm.description = row.description || ''
  editForm.tone = row.tone || ''
  editForm.sortOrder = row.sortOrder
  editForm.enabled = row.enabled
  editVisible.value = true
}

async function handleSaveEdit() {
  if (!editForm.label.trim()) {
    ElMessage.warning('显示中文不能为空')
    return
  }
  saving.value = true
  try {
    await platformOptionsApi.updateItem(activeCode.value, editForm.code, {
      label: editForm.label.trim(),
      description: editForm.description || null,
      tone: editForm.tone || null,
      sortOrder: editForm.sortOrder,
      enabled: editForm.enabled
    })
    ElMessage.success('已保存，小程序与后台会同时生效')
    editVisible.value = false
    await reload()
  } catch (error) {
    toastApiError(error, '保存失败', (m) => ElMessage.error(m))
  } finally {
    saving.value = false
  }
}

function openCreate() {
  createForm.code = ''
  createForm.label = ''
  createForm.sortOrder = 100
  createVisible.value = true
}

async function handleCreate() {
  if (!createForm.code.trim() || !createForm.label.trim()) {
    ElMessage.warning('码与显示中文都要填')
    return
  }
  saving.value = true
  try {
    await platformOptionsApi.createItem(activeCode.value, {
      code: createForm.code.trim().toUpperCase(),
      label: createForm.label.trim(),
      sortOrder: createForm.sortOrder
    })
    ElMessage.success('已新增')
    createVisible.value = false
    await reload()
  } catch (error) {
    toastApiError(error, '新增失败', (m) => ElMessage.error(m))
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: AdminPlatformOptionItem) {
  try {
    /**
     * 删之前把话说明白：删掉字典行**不会**删掉业务数据里已经用了这个码的记录，
     * 只会让那些记录查不到中文。所以更稳的做法是「停用」。
     */
    await ElMessageBox.confirm(
      `删除「${row.label}」后，已经用到这个码的历史数据不会消失，` +
        `但界面上会显示英文码。如果只是不想再让人选它，建议改成「停用」。`,
      '确认删除？',
      { type: 'warning', confirmButtonText: '仍然删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  try {
    await platformOptionsApi.deleteItem(activeCode.value, row.code)
    ElMessage.success('已删除')
    await reload()
  } catch (error) {
    toastApiError(error, '删除失败', (m) => ElMessage.error(m))
  }
}

onMounted(async () => {
  await loadSets()
  await loadDetail()
})
</script>

<style scoped>
.platform-options-page {
  padding: 20px 24px 40px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

.page-desc {
  margin: 0;
  max-width: 860px;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

.tip-alert {
  margin-bottom: 12px;
}

.layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  align-items: start;
}

.card-title {
  font-weight: 600;
}

.card-desc {
  margin-left: 10px;
  font-size: 12px;
  color: #9ca3af;
}

.set-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.set-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.set-item:hover {
  background: #f5f7fa;
}

.set-item--active {
  background: #ecf5ff;
}

.set-item__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.set-item__name {
  font-size: 14px;
  font-weight: 600;
}

.set-item__code {
  font-size: 11px;
  color: #9ca3af;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.set-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.set-item__count {
  font-size: 12px;
  color: #9ca3af;
}

.item-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.item-card__actions {
  display: flex;
  gap: 8px;
}

.code-cell {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
}

.desc-cell {
  font-size: 12px;
  color: #9ca3af;
}

.label-unset {
  color: #d97706;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.label-warn {
  margin-left: 4px;
  cursor: help;
}

.form-hint {
  margin-left: 10px;
  font-size: 12px;
  color: #9ca3af;
}
</style>
