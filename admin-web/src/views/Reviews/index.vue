<template>
  <div class="reviews-page">
    <div class="page-header">
      <div>
        <h2>评价管理</h2>
        <p>管理食谱详情页展示的评分与用户留言。</p>
      </div>
      <el-button type="primary" @click="openCreateDialog">新增评价</el-button>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索食谱、用户或评价内容"
          clearable
          style="width: 320px"
          @keyup.enter="loadReviews"
          @clear="loadReviews"
        />
        <el-button @click="loadReviews">搜索</el-button>
      </div>

      <el-table :data="reviews" v-loading="loading" stripe>
        <el-table-column label="食谱" min-width="180">
          <template #default="{ row }">{{ row.recipe?.name || row.recipeId }}</template>
        </el-table-column>
        <el-table-column label="用户" width="160">
          <template #default="{ row }">{{ row.user?.nickname || row.user?.phone || row.userId }}</template>
        </el-table-column>
        <el-table-column label="评分" width="150">
          <template #default="{ row }">
            易做 {{ row.ratingEase }} / 性价比 {{ row.ratingValue }} / 口味 {{ row.ratingTaste }}
          </template>
        </el-table-column>
        <el-table-column prop="content" label="留言" min-width="240" show-overflow-tooltip />
        <el-table-column prop="source" label="来源" width="110" />
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="deleteReview(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        class="pagination"
        @current-change="loadReviews"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" title="新增评价" width="520px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="食谱ID" required>
          <el-input v-model="form.recipeId" placeholder="填写食谱 UUID 或业务 recipeId" />
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input v-model="form.userId" placeholder="可选，默认当前管理员账号" />
        </el-form-item>
        <el-form-item label="评分">
          <div class="rating-row">
            <span>易做</span>
            <el-rate v-model="form.ratingEase" />
          </div>
          <div class="rating-row">
            <span>性价比</span>
            <el-rate v-model="form.ratingValue" />
          </div>
          <div class="rating-row">
            <span>口味</span>
            <el-rate v-model="form.ratingTaste" />
          </div>
        </el-form-item>
        <el-form-item label="留言" required>
          <el-input v-model="form.content" type="textarea" :rows="4" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReview">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { reviewApi, type AdminReview } from '@/api/reviews'

const reviews = ref<AdminReview[]>([])
const loading = ref(false)
const submitting = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const dialogVisible = ref(false)

const form = reactive({
  recipeId: '',
  userId: '',
  ratingEase: 5,
  ratingValue: 5,
  ratingTaste: 5,
  content: '',
})

onMounted(loadReviews)

function formatTime(value?: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

async function loadReviews() {
  loading.value = true
  try {
    const data = await reviewApi.listAdmin({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    })
    reviews.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function openCreateDialog() {
  Object.assign(form, {
    recipeId: '',
    userId: '',
    ratingEase: 5,
    ratingValue: 5,
    ratingTaste: 5,
    content: '',
  })
  dialogVisible.value = true
}

async function submitReview() {
  if (!form.recipeId.trim() || !form.content.trim()) {
    ElMessage.warning('请填写食谱ID和留言')
    return
  }

  submitting.value = true
  try {
    await reviewApi.createAdmin({
      recipeId: form.recipeId.trim(),
      userId: form.userId.trim() || undefined,
      ratingEase: form.ratingEase,
      ratingValue: form.ratingValue,
      ratingTaste: form.ratingTaste,
      content: form.content.trim(),
    })
    ElMessage.success('评价已新增')
    dialogVisible.value = false
    await loadReviews()
  } finally {
    submitting.value = false
  }
}

async function deleteReview(row: AdminReview) {
  await ElMessageBox.confirm('确认删除这条评价？', '删除评价', { type: 'warning' })
  await reviewApi.deleteAdmin(row.id)
  ElMessage.success('已删除')
  await loadReviews()
}
</script>

<style scoped>
.reviews-page {
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.page-header h2 {
  margin: 0 0 6px;
}

.page-header p {
  margin: 0;
  color: #606266;
}

.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.pagination {
  justify-content: flex-end;
  margin-top: 18px;
}

.rating-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.rating-row span {
  width: 56px;
  color: #606266;
}
</style>
