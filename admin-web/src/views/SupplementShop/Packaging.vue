<template>
  <div class="packaging-page">
    <div class="page-header">
      <div>
        <h2>补剂包材</h2>
        <p class="page-desc">
          只维护“哪种袋/标签/干燥剂”；包材主数据仍在原料管理里建 PACKAGING 档案。
          本轮只算需求量，不扣包材库存。
        </p>
      </div>
      <el-button type="primary" @click="openCreate">新增规则</el-button>
    </div>

    <el-card shadow="never">
      <el-table :data="rules" v-loading="loading" stripe>
        <el-table-column label="角色" width="100">
          <template #default="{ row }">{{ roleLabel(row.role) }}</template>
        </el-table-column>
        <el-table-column prop="ingredientName" label="包材" min-width="160" />
        <el-table-column label="形态" width="100">
          <template #default="{ row }">{{ row.physicalForm || '任意' }}</template>
        </el-table-column>
        <el-table-column label="单位匹配" width="110">
          <template #default="{ row }">{{ row.unitPattern || '任意' }}</template>
        </el-table-column>
        <el-table-column label="数量区间" width="150">
          <template #default="{ row }">
            {{ row.minAmount ?? '—' }} ~ {{ row.maxAmount ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="priority" label="优先级" width="80" />
        <el-table-column label="启用" width="80">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
              {{ row.enabled ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑包材规则' : '新增包材规则'" width="520px">
      <el-form label-width="100px">
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option label="分装袋" value="POUCH" />
            <el-option label="干燥剂" value="DESICCANT" />
            <el-option label="标签" value="LABEL" />
          </el-select>
        </el-form-item>
        <el-form-item label="包材档案">
          <el-select v-model="form.ingredientId" filterable style="width: 100%">
            <el-option
              v-for="item in ingredients"
              :key="item.id"
              :label="`${item.name}（${item.purchaseUnit}）`"
              :value="item.id"
            />
          </el-select>
          <div class="hint">没有可选项？先到「原料管理」建 PACKAGING 包材档案。</div>
        </el-form-item>
        <el-form-item label="形态">
          <el-select v-model="form.physicalForm" clearable placeholder="任意" style="width: 100%">
            <el-option label="粉剂" value="POWDER" />
            <el-option label="片剂" value="TABLET" />
            <el-option label="胶囊" value="CAPSULE" />
          </el-select>
        </el-form-item>
        <el-form-item label="单位匹配">
          <el-input v-model="form.unitPattern" placeholder="如 g / 平勺 / 片；留空=任意" />
        </el-form-item>
        <el-form-item label="最小量">
          <el-input-number v-model="form.minAmount" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="最大量">
          <el-input-number v-model="form.maxAmount" :min="0" :precision="2" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { supplementPackagingApi } from '@/api/supplementPackaging'
import type { PackagingIngredient, PackagingRule } from '@/api/supplementPackaging'

const loading = ref(false)
const saving = ref(false)
const rules = ref<PackagingRule[]>([])
const ingredients = ref<PackagingIngredient[]>([])
const dialogVisible = ref(false)

const form = reactive<Partial<PackagingRule>>({
  role: 'POUCH',
  ingredientId: '',
  physicalForm: null,
  unitPattern: '',
  minAmount: null,
  maxAmount: null,
  priority: 0,
  enabled: true,
  note: '',
})

function roleLabel(role: string) {
  return ({ POUCH: '分装袋', DESICCANT: '干燥剂', LABEL: '标签' } as Record<string, string>)[role] || role
}

async function load() {
  loading.value = true
  try {
    const [ruleRows, ingredientRows] = await Promise.all([
      supplementPackagingApi.listRules(),
      supplementPackagingApi.listIngredients(),
    ])
    rules.value = ruleRows
    ingredients.value = ingredientRows
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, {
    id: undefined,
    role: 'POUCH',
    ingredientId: '',
    physicalForm: null,
    unitPattern: '',
    minAmount: null,
    maxAmount: null,
    priority: 0,
    enabled: true,
    note: '',
  })
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: PackagingRule) {
  Object.assign(form, row)
  dialogVisible.value = true
}

async function save() {
  if (!form.ingredientId) {
    ElMessage.warning('请选择包材档案')
    return
  }
  saving.value = true
  try {
    await supplementPackagingApi.upsertRule({ ...form })
    ElMessage.success('已保存')
    dialogVisible.value = false
    await load()
  } finally {
    saving.value = false
  }
}

async function remove(row: PackagingRule) {
  await ElMessageBox.confirm(`删除「${row.ingredientName}」这条规则？`, '确认', { type: 'warning' })
  await supplementPackagingApi.deleteRule(row.id)
  ElMessage.success('已删除')
  await load()
}

onMounted(load)
</script>

<style scoped>
.packaging-page { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
.page-header h2 { margin: 0; font-size: 20px; }
.page-desc { margin: 6px 0 0; color: #909399; font-size: 13px; max-width: 760px; }
.hint { color: #909399; font-size: 12px; margin-top: 4px; }
</style>
