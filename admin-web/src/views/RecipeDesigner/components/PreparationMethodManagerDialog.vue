<template>
  <el-dialog
    :model-value="modelValue"
    title="预处理方式管理"
    width="680px"
    top="10vh"
    append-to-body
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    @update:model-value="onVisibleChange"
  >
    <div class="preparation-manager">
      <div class="manager-intro">
        维护原料预处理方式字典。新增 / 改名 / 删除后，当前配方的预处理下拉框会立即刷新；
        已选用的旧值不会被自动清空。
      </div>

      <el-alert
        v-if="loadError"
        class="manager-error"
        type="error"
        :closable="false"
        show-icon
        title="预处理方式加载失败"
        :description="loadError"
      />
      <el-button
        v-if="loadError"
        class="manager-retry"
        size="small"
        :loading="loading"
        @click="loadMethods()"
      >重新加载</el-button>

      <div class="manager-form">
        <el-input
          v-model="form.name"
          class="form-name"
          maxlength="50"
          placeholder="名称（必填）"
          :disabled="saving"
          @keyup.enter="submitForm"
        />
        <el-input
          v-model="form.description"
          class="form-description"
          maxlength="200"
          placeholder="说明（可选）"
          :disabled="saving"
          @keyup.enter="submitForm"
        />
        <el-input-number
          v-model="form.sort"
          class="form-sort"
          :min="0"
          :precision="0"
          :controls="false"
          :disabled="saving"
          placeholder="排序"
        />
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!canSubmit"
          @click="submitForm"
        >
          {{ editingId ? "保存修改" : "新增" }}
        </el-button>
        <el-button v-if="editingId" :disabled="saving" @click="resetForm">
          取消编辑
        </el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="methods"
        size="small"
        stripe
        class="manager-table"
        empty-text="暂无预处理方式，先在上方新增"
      >
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="说明" min-width="180">
          <template #default="{ row }">
            <span :class="{ 'cell-empty': !row.description }">
              {{ row.description || "—" }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="sort" label="排序" width="76" align="center" />
        <el-table-column label="操作" width="132" align="right">
          <template #default="{ row }">
            <el-button
              size="small"
              text
              type="primary"
              :disabled="saving"
              @click="startEdit(row)"
            >编辑</el-button>
            <el-button
              size="small"
              text
              type="danger"
              :disabled="saving"
              @click="deleteMethod(row)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="manager-tip">
        删除后，已使用该方式的原料仍保留原值；如需更换，请在配方明细里重新选择。
      </div>
    </div>

    <template #footer>
      <el-button :disabled="saving" @click="onVisibleChange(false)">
        关闭
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  preparationMethodApi,
  type PreparationMethod,
} from "@/api/preparationMethods";

interface Props {
  modelValue: boolean;
}

interface Emits {
  (e: "update:modelValue", value: boolean): void;
  /** 字典发生变更后回传最新完整列表，供编辑器本地合并 */
  (e: "changed", methods: PreparationMethod[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const methods = ref<PreparationMethod[]>([]);
const loading = ref(false);
const saving = ref(false);
const loadError = ref("");
const editingId = ref<string | null>(null);

const form = reactive({
  name: "",
  description: "",
  sort: 0,
});

const canSubmit = computed(
  () => Boolean(form.name.trim()) && !saving.value && !loading.value,
);

function nextSortValue(): number {
  if (methods.value.length === 0) {
    return 0;
  }
  return (
    Math.max(...methods.value.map((method) => Number(method.sort ?? 0))) + 1
  );
}

function resetForm() {
  editingId.value = null;
  form.name = "";
  form.description = "";
  form.sort = nextSortValue();
}

function sortMethods(list: PreparationMethod[]): PreparationMethod[] {
  return [...list].sort((left, right) => {
    const sortDiff = Number(left.sort ?? 0) - Number(right.sort ?? 0);
    if (sortDiff !== 0) {
      return sortDiff;
    }
    return String(left.name ?? "").localeCompare(String(right.name ?? ""), "zh-Hans-CN");
  });
}

async function loadMethods(notify = false) {
  loading.value = true;
  loadError.value = "";
  try {
    const list = await preparationMethodApi.list();
    methods.value = sortMethods(Array.isArray(list) ? list : []);
    if (notify) {
      emit("changed", methods.value.map((method) => ({ ...method })));
    }
  } catch (error) {
    loadError.value =
      error instanceof Error && error.message
        ? error.message
        : "请检查网络或稍后重试";
  } finally {
    loading.value = false;
  }
}

function startEdit(method: PreparationMethod) {
  editingId.value = method.id;
  form.name = method.name;
  form.description = method.description ?? "";
  form.sort = Number(method.sort ?? 0);
}

async function submitForm() {
  if (!canSubmit.value) {
    return;
  }

  const name = form.name.trim();
  if (!name) {
    ElMessage.warning("请填写预处理方式名称");
    return;
  }

  const description = form.description.trim() || null;
  const sort = Number.isFinite(form.sort) ? Math.max(0, form.sort) : 0;

  saving.value = true;
  try {
    if (editingId.value) {
      await preparationMethodApi.update(editingId.value, {
        name,
        description,
        sort,
      });
      ElMessage.success("预处理方式已更新");
    } else {
      await preparationMethodApi.create({ name, description, sort });
      ElMessage.success("预处理方式已新增");
    }
    await loadMethods(true);
    resetForm();
  } catch {
    // 错误提示由接口拦截器统一处理；保留表单内容供用户修改
  } finally {
    saving.value = false;
  }
}

async function deleteMethod(method: PreparationMethod) {
  try {
    await ElMessageBox.confirm(
      `确认删除预处理方式「${method.name}」？已使用该方式的原料不会被清空。`,
      "删除预处理方式",
      {
        type: "warning",
        confirmButtonText: "删除",
        cancelButtonText: "取消",
      },
    );
  } catch {
    return;
  }

  saving.value = true;
  try {
    await preparationMethodApi.delete(method.id);
    if (editingId.value === method.id) {
      resetForm();
    }
    ElMessage.success("预处理方式已删除");
    await loadMethods(true);
  } catch {
    // 错误提示由接口拦截器统一处理
  } finally {
    saving.value = false;
  }
}

function onVisibleChange(value: boolean) {
  if (!value && saving.value) {
    return;
  }
  emit("update:modelValue", value);
}

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) {
      return;
    }
    resetForm();
    void loadMethods();
  },
  { immediate: true },
);
</script>

<style scoped>
.preparation-manager {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.manager-intro {
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}

.manager-error {
  align-items: center;
}

.manager-retry {
  align-self: flex-start;
}

.manager-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.form-name {
  width: 150px;
}

.form-description {
  flex: 1 1 180px;
  min-width: 150px;
}

.form-sort {
  width: 72px;
}

.manager-table {
  width: 100%;
}

.cell-empty {
  color: #c0c4cc;
}

.manager-tip {
  font-size: 12px;
  line-height: 1.6;
  color: #909399;
}
</style>
