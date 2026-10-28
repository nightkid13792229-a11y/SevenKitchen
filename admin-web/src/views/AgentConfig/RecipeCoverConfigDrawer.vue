<template>
  <el-drawer
    v-model="visible"
    title="AI 食谱封面配置"
    size="620px"
    :close-on-click-modal="false"
  >
    <div v-loading="loading" class="cover-config">
      <p class="hint">
        DeepSeek 负责把配方食材写成摄影提示词，Seedream 5.0 Pro 负责生图。
        两项都启用并保存 Key，且提示词非空时，两个页面的 AI 生成按钮才可用。
        生成一张约 0.2 元。
      </p>

      <h3>DeepSeek（写提示词）</h3>
      <el-form label-width="110px">
        <el-form-item label="启用">
          <el-switch v-model="form.deepseek.enabled" />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="form.deepseek.baseUrl" placeholder="https://api.deepseek.com" />
        </el-form-item>
        <el-form-item label="模型">
          <el-input v-model="form.deepseek.model" placeholder="deepseek-flash" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="form.deepseek.apiKey"
            type="password"
            show-password
            autocomplete="off"
            :placeholder="keyPlaceholder(config?.deepseek)"
          />
        </el-form-item>
      </el-form>

      <h3>Seedream（生图）</h3>
      <el-form label-width="110px">
        <el-form-item label="启用">
          <el-switch v-model="form.ark.enabled" />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="form.ark.baseUrl" placeholder="https://ark.cn-beijing.volces.com/api/v3" />
        </el-form-item>
        <el-form-item label="模型">
          <el-input v-model="form.ark.model" placeholder="doubao-seedream-5-0-pro-260628" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="form.ark.apiKey"
            type="password"
            show-password
            autocomplete="off"
            :placeholder="keyPlaceholder(config?.ark)"
          />
        </el-form-item>
      </el-form>

      <h3>系统提示词</h3>
      <el-form label-width="110px">
        <el-form-item label="DeepSeek">
          <el-input
            v-model="form.promptTemplate"
            type="textarea"
            :rows="10"
            placeholder="给 DeepSeek 的系统提示词"
          />
        </el-form-item>
      </el-form>

      <div class="actions">
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button @click="visible = false">取消</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { nutritionGovernanceApi } from '@/api/nutritionGovernance'
import type {
  RecipeCoverConfig,
  RecipeCoverProviderSettings,
  UpdateRecipeCoverConfigPayload
} from '@/types/nutritionGovernance'

const visible = defineModel<boolean>({ default: false })
const emit = defineEmits<{ (e: 'saved'): void }>()

const loading = ref(false)
const saving = ref(false)
const config = ref<RecipeCoverConfig | null>(null)
const form = reactive<UpdateRecipeCoverConfigPayload>({
  deepseek: {
    enabled: false,
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    apiKey: ''
  },
  ark: {
    enabled: false,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seedream-5-0-pro-260628',
    apiKey: ''
  },
  promptTemplate: ''
})

function keyPlaceholder(settings?: RecipeCoverProviderSettings) {
  return settings?.apiKeyLast4
    ? `已保存（末四位 ${settings.apiKeyLast4}），留空不修改`
    : '粘贴 API Key'
}

async function load() {
  loading.value = true
  try {
    const data = await nutritionGovernanceApi.getRecipeCoverConfig()
    config.value = data
    form.deepseek = {
      enabled: data.deepseek.enabled,
      baseUrl: data.deepseek.baseUrl,
      model: data.deepseek.model,
      apiKey: ''
    }
    form.ark = {
      enabled: data.ark.enabled,
      baseUrl: data.ark.baseUrl,
      model: data.ark.model,
      apiKey: ''
    }
    form.promptTemplate = data.promptTemplate
  } catch (error: any) {
    ElMessage.error(error?.message || '加载 AI 食谱封面配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = await nutritionGovernanceApi.updateRecipeCoverConfig({
      deepseek: { ...form.deepseek },
      ark: { ...form.ark },
      promptTemplate: form.promptTemplate
    })
    config.value = data
    ElMessage.success('AI 食谱封面配置已保存')
    emit('saved')
    visible.value = false
  } catch (error: any) {
    ElMessage.error(error?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

watch(visible, (value) => {
  if (value) void load()
})
</script>

<style scoped>
.cover-config {
  padding: 0 4px 24px;
}
.hint {
  margin: 0 0 18px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  color: #606266;
  font-size: 12.5px;
  line-height: 1.6;
}
h3 {
  margin: 22px 0 10px;
  font-size: 14px;
  color: #303133;
}
.actions {
  margin-top: 20px;
}
</style>
