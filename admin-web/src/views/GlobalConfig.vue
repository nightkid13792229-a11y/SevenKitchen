<template>
  <div class="global-config-page">
    <!-- Page Header -->
    <div class="page-header">
      <h2>全局配置管理</h2>
    </div>

    <!-- Configuration Form -->
    <el-card class="config-card">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="220px"
        v-loading="loading"
      >
        <el-divider content-position="left">定价配置</el-divider>

        <el-form-item label="人工时薪（元/小时）" prop="laborHourlyRate">
          <el-input-number
            v-model="form.laborHourlyRate"
            :min="0"
            :step="1"
            :precision="2"
            :controls="true"
            style="width: 300px"
          />
          <span class="form-tip">用于计算生产批次的人工成本</span>
        </el-form-item>

        <el-form-item label="目标利润率" prop="targetMargin">
          <el-input-number
            v-model="form.targetMargin"
            :min="0"
            :max="1"
            :step="0.01"
            :precision="2"
            :controls="true"
            style="width: 300px"
          />
          <span class="form-tip">例如: 0.4 表示40%利润率</span>
        </el-form-item>

        <el-form-item label="间接成本（元/kg）" prop="overheadCostPerKg">
          <el-input-number
            v-model="form.overheadCostPerKg"
            :min="0"
            :step="0.1"
            :precision="2"
            :controls="true"
            style="width: 300px"
          />
          <span class="form-tip">包括设备折旧、水电等间接成本</span>
        </el-form-item>

        <el-divider content-position="left">生产配置</el-divider>

        <el-form-item label="默认批次产能（克）" prop="defaultBatchCapacityG">
          <el-input-number
            v-model="form.defaultBatchCapacityG"
            :min="0"
            :step="100"
            :precision="0"
            :controls="true"
            style="width: 300px"
          />
          <span class="form-tip">单个生产批次的默认产能</span>
        </el-form-item>

        <el-form-item label="目标批次利用率" prop="targetBatchUtilization">
          <el-input-number
            v-model="form.targetBatchUtilization"
            :min="0"
            :max="1"
            :step="0.05"
            :precision="2"
            :controls="true"
            style="width: 300px"
          />
          <span class="form-tip">例如: 0.8 表示80%利用率</span>
        </el-form-item>

        <el-form-item label="补充剂损耗率" prop="supplementLossRate">
          <el-input-number
            v-model="form.supplementLossRate"
            :min="1"
            :step="0.01"
            :precision="3"
            :controls="true"
            style="width: 300px"
          />
          <span class="form-tip">例如: 1.05 表示5%损耗</span>
        </el-form-item>

        <el-divider content-position="left">订单配置</el-divider>

        <el-form-item label="最小订单重量（克）" prop="minOrderWeightG">
          <el-input-number
            v-model="form.minOrderWeightG"
            :min="100"
            :step="100"
            :precision="0"
            :controls="true"
            style="width: 300px"
          />
          <span class="form-tip">单个订单的最小重量要求</span>
        </el-form-item>

        <el-divider content-position="left">包材配置</el-divider>

        <el-form-item label="默认产品标签ID" prop="defaultProductLabelId">
          <el-input
            v-model="form.defaultProductLabelId"
            placeholder="输入产品标签SKU ID"
            style="width: 300px"
            clearable
          />
          <span class="form-tip">默认使用的产品标签包材</span>
        </el-form-item>

        <el-form-item label="默认冰袋ID" prop="defaultIcePackId">
          <el-input
            v-model="form.defaultIcePackId"
            placeholder="输入冰袋SKU ID"
            style="width: 300px"
            clearable
          />
          <span class="form-tip">默认使用的冰袋包材</span>
        </el-form-item>

        <el-form-item label="食品真空袋示例图" prop="packageExampleImageUrl">
          <div class="image-upload-container">
            <div v-if="form.packageExampleImageUrl" class="uploaded-image">
              <el-image
                :src="form.packageExampleImageUrl"
                fit="contain"
                style="width: 200px; height: 150px; border-radius: 4px; border: 1px solid #dcdfe6;"
                :preview-src-list="[form.packageExampleImageUrl]"
              />
              <el-button type="danger" size="small" @click="handleRemovePackageImage" style="margin-top: 8px">
                删除图片
              </el-button>
            </div>
            <div v-else class="upload-placeholder">
              <el-icon :size="40" color="#dcdfe6"><Picture /></el-icon>
              <div class="upload-text">点击上传示例图</div>
              <el-button type="primary" size="small" @click="handleUploadPackageImage">
                选择图片
              </el-button>
            </div>
          </div>
          <div class="form-tip">建议尺寸：800×600px，支持jpg、png格式，大小不超过2MB</div>
        </el-form-item>

        <el-divider content-position="left">运费模板管理</el-divider>

        <el-form-item label="默认运费模板" prop="defaultShippingTemplateId">
          <el-select
            v-model="form.defaultShippingTemplateId"
            placeholder="选择默认运费模板"
            style="width: 300px"
            clearable
          >
            <el-option
              v-for="template in shippingTemplates"
              :key="template.id"
              :label="template.name"
              :value="template.id"
            >
              <span>{{ template.name }}</span>
              <el-tag v-if="template.isActive" type="success" size="small" style="margin-left: 8px">激活</el-tag>
            </el-option>
          </el-select>
          <span class="form-tip">选择默认使用的运费模板</span>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" plain @click="showShippingTemplateDialog">
            管理运费模板
          </el-button>
        </el-form-item>

        <el-divider content-position="left">配送管理</el-divider>

        <el-form-item label="快递公司logo" prop="shippingCompanyLogoUrl">
          <div class="image-upload-container">
            <div v-if="form.shippingCompanyLogoUrl" class="uploaded-image">
              <el-image
                :src="form.shippingCompanyLogoUrl"
                fit="contain"
                style="width: 200px; height: 150px; border-radius: 4px; border: 1px solid #dcdfe6;"
                :preview-src-list="[form.shippingCompanyLogoUrl]"
              />
              <el-button type="danger" size="small" @click="handleRemoveShippingLogo" style="margin-top: 8px">
                删除图片
              </el-button>
            </div>
            <div v-else class="upload-placeholder">
              <el-icon :size="40" color="#dcdfe6"><Picture /></el-icon>
              <div class="upload-text">点击上传logo</div>
              <el-button type="primary" size="small" @click="handleUploadShippingLogo">
                选择图片
              </el-button>
            </div>
          </div>
          <div class="form-tip">建议尺寸：200×200px，支持jpg、png格式，大小不超过2MB</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="saving">
            保存配置
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 运费模板管理对话框 -->
    <el-dialog
      v-model="shippingTemplateDialogVisible"
      title="运费模板管理"
      width="900px"
      @close="handleDialogClose"
    >
      <div class="template-manager">
        <!-- 模板列表 -->
        <div class="template-list">
          <el-button type="primary" size="small" @click="handleCreateTemplate" style="margin-bottom: 16px">
            新建模板
          </el-button>

          <el-table :data="shippingTemplates" v-loading="templatesLoading" border>
            <el-table-column prop="name" label="模板名称" width="150" />
            <el-table-column label="首重" width="120">
              <template #default="{ row }">
                {{ row.baseWeightKg }}kg / {{ row.baseFee }}元
              </template>
            </el-table-column>
            <el-table-column label="续重" width="120">
              <template #default="{ row }">
                {{ row.stepWeightKg }}kg / {{ row.stepFee }}元
              </template>
            </el-table-column>
            <el-table-column label="增值服务费" width="100">
              <template #default="{ row }">
                {{ row.vasFeePerOrder }}元/单
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
                  {{ row.isActive ? '激活' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="220">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleEditTemplate(row)">编辑</el-button>
                <el-button link type="success" size="small" @click="handleActivateTemplate(row)" :disabled="row.isActive">激活</el-button>
                <el-button link type="primary" size="small" @click="handlePreviewTemplate(row)">预览</el-button>
                <el-button link type="danger" size="small" @click="handleDeleteTemplate(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 编辑/创建表单 -->
        <div v-if="editingTemplate" class="template-form" style="margin-top: 24px">
          <el-divider content-position="left">{{ editingTemplate.id ? '编辑模板' : '新建模板' }}</el-divider>
          <el-form :model="editingTemplate" label-width="140px">
            <el-form-item label="模板名称">
              <el-input v-model="editingTemplate.name" placeholder="输入模板名称" style="width: 300px" />
            </el-form-item>
            <el-form-item label="首重重量（kg）">
              <el-input-number v-model="editingTemplate.baseWeightKg" :min="0.1" :step="0.1" :precision="1" style="width: 200px" />
            </el-form-item>
            <el-form-item label="首重费用（元）">
              <el-input-number v-model="editingTemplate.baseFee" :min="0" :step="1" :precision="2" style="width: 200px" />
            </el-form-item>
            <el-form-item label="续重单位（kg）">
              <el-input-number v-model="editingTemplate.stepWeightKg" :min="0.1" :step="0.1" :precision="1" style="width: 200px" />
            </el-form-item>
            <el-form-item label="续重费用（元）">
              <el-input-number v-model="editingTemplate.stepFee" :min="0" :step="1" :precision="2" style="width: 200px" />
            </el-form-item>
            <el-form-item label="增值服务费（元/单）">
              <el-input-number v-model="editingTemplate.vasFeePerOrder" :min="0" :step="1" :precision="2" style="width: 200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSaveTemplate" :loading="savingTemplate">保存模板</el-button>
              <el-button @click="editingTemplate = null">取消</el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 运费预览 -->
        <div v-if="previewResult" class="fee-preview" style="margin-top: 24px">
          <el-divider content-position="left">运费计算预览</el-divider>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="计算结果">{{ previewResult.amountShipping }} 元</el-descriptions-item>
            <el-descriptions-item label="计费规则">{{ previewResult.ruleAppliedDescription }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-dialog>

    <!-- 运费预览对话框 -->
    <el-dialog v-model="previewDialogVisible" title="运费计算预览" width="500px">
      <el-form label-width="120px">
        <el-form-item label="重量（克）">
          <el-input-number v-model="previewWeight" :min="100" :step="100" :precision="0" style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleCalculatePreview">计算</el-button>
        </el-form-item>
      </el-form>
      <div v-if="previewResult" class="preview-result">
        <el-divider content-position="left">计算结果</el-divider>
        <el-alert :title="`${previewResult.amountShipping} 元`" type="success" :closable="false" />
        <p style="margin-top: 12px; color: #606266;">{{ previewResult.ruleAppliedDescription }}</p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import { globalConfigApi, type GlobalConfig } from '@/api/globalConfig'
import { shippingTemplateApi, type ShippingTemplate, type CreateShippingTemplateDto, type ShippingFeeResult } from '@/api/shippingTemplates'

const formRef = ref<FormInstance>()
const loading = ref(false)
const saving = ref(false)

// 运费模板相关状态
const shippingTemplates = ref<ShippingTemplate[]>([])
const templatesLoading = ref(false)
const shippingTemplateDialogVisible = ref(false)
const editingTemplate = ref<CreateShippingTemplateDto | null>(null)
const savingTemplate = ref(false)
const previewDialogVisible = ref(false)
const previewWeight = ref(1000)
const previewResult = ref<ShippingFeeResult | null>(null)
const currentPreviewTemplateId = ref<string | null>(null)

const form = ref<GlobalConfig>({
  id: 'singleton',
  laborHourlyRate: 30.0,
  minOrderWeightG: 1000,
  defaultBatchCapacityG: 5000,
  targetMargin: 0.4,
  overheadCostPerKg: 2.0,
  targetBatchUtilization: 0.8,
  supplementLossRate: 1.05,
  defaultProductLabelId: null,
  defaultIcePackId: null,
  defaultShippingTemplateId: null,
  packageExampleImageUrl: null,
  shippingCompanyLogoUrl: null,
})

const rules: FormRules = {
  laborHourlyRate: [
    { required: true, message: '请输入人工时薪', trigger: 'blur' },
    { type: 'number', min: 0, message: '不能小于0', trigger: 'blur' },
  ],
  targetMargin: [
    { required: true, message: '请输入目标利润率', trigger: 'blur' },
    { type: 'number', min: 0, max: 1, message: '范围0-1之间', trigger: 'blur' },
  ],
  overheadCostPerKg: [
    { required: true, message: '请输入间接成本', trigger: 'blur' },
    { type: 'number', min: 0, message: '不能小于0', trigger: 'blur' },
  ],
  defaultBatchCapacityG: [
    { required: true, message: '请输入默认批次产能', trigger: 'blur' },
    { type: 'number', min: 0, message: '不能小于0', trigger: 'blur' },
  ],
  targetBatchUtilization: [
    { required: true, message: '请输入目标批次利用率', trigger: 'blur' },
    { type: 'number', min: 0, max: 1, message: '范围0-1之间', trigger: 'blur' },
  ],
  supplementLossRate: [
    { required: true, message: '请输入补充剂损耗率', trigger: 'blur' },
    { type: 'number', min: 1, message: '不能小于1', trigger: 'blur' },
  ],
  minOrderWeightG: [
    { required: true, message: '请输入最小订单重量', trigger: 'blur' },
    { type: 'number', min: 100, message: '不能小于100克', trigger: 'blur' },
  ],
}

// Load configuration
const loadConfig = async () => {
  loading.value = true
  try {
    const data = await globalConfigApi.get()
    form.value = data
  } catch (error) {
    ElMessage.error('加载配置失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

// Save configuration
const handleSubmit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    saving.value = true
    try {
      await globalConfigApi.update(form.value)
      ElMessage.success('配置保存成功')
      await loadConfig()
    } catch (error) {
      ElMessage.error('保存配置失败')
      console.error(error)
    } finally {
      saving.value = false
    }
  })
}

// Reset form
const handleReset = () => {
  loadConfig()
  ElMessage.info('已重置为服务器配置')
}

// 上传食品真空袋示例图
const handleUploadPackageImage = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png'
  input.max = 2 * 1024 * 1024 // 2MB

  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    // 验证文件大小
    if (file.size > 2 * 1024 * 1024) {
      ElMessage.error('图片大小不能超过2MB')
      return
    }

    // 验证文件类型
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      ElMessage.error('只支持JPG和PNG格式')
      return
    }

    try {
      // 使用 globalConfigApi 上传（带认证）
      const result = await globalConfigApi.uploadPackageImage(file)

      // 上传成功后，先更新表单，然后自动保存到数据库
      form.value.packageExampleImageUrl = result.url

      // 自动保存到全局配置
      await globalConfigApi.update({ packageExampleImageUrl: result.url })

      ElMessage.success('图片上传并保存成功')
    } catch (error: any) {
      console.error('Upload error:', error)
      ElMessage.error(error.message || '上传失败')
    }
  }

  input.click()
}

// 删除食品真空袋示例图
const handleRemovePackageImage = () => {
  ElMessageBox.confirm('确定要删除这张图片吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    form.value.packageExampleImageUrl = null
    ElMessage.success('已删除')
  }).catch(() => {
    // 用户取消
  })
}

// 上传快递公司logo
const handleUploadShippingLogo = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/jpeg,image/png'
  input.max = 2 * 1024 * 1024 // 2MB

  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return

    // 验证文件大小
    if (file.size > 2 * 1024 * 1024) {
      ElMessage.error('图片大小不能超过2MB')
      return
    }

    // 验证文件类型
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      ElMessage.error('只支持JPG和PNG格式')
      return
    }

    try {
      // 使用 globalConfigApi 上传（带认证）
      const result = await globalConfigApi.uploadShippingLogo(file)

      // 上传成功后，先更新表单，然后自动保存到数据库
      form.value.shippingCompanyLogoUrl = result.url

      // 自动保存到全局配置
      await globalConfigApi.update({ shippingCompanyLogoUrl: result.url })

      ElMessage.success('logo上传并保存成功')
    } catch (error: any) {
      console.error('Upload error:', error)
      ElMessage.error(error.message || '上传失败')
    }
  }

  input.click()
}

// 删除快递公司logo
const handleRemoveShippingLogo = () => {
  ElMessageBox.confirm('确定要删除这张图片吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    form.value.shippingCompanyLogoUrl = null
    ElMessage.success('已删除')
  }).catch(() => {
    // 用户取消
  })
}

// 运费模板管理相关函数
const loadShippingTemplates = async () => {
  templatesLoading.value = true
  try {
    shippingTemplates.value = await shippingTemplateApi.list()
  } catch (error) {
    ElMessage.error('加载运费模板失败')
    console.error(error)
  } finally {
    templatesLoading.value = false
  }
}

const showShippingTemplateDialog = () => {
  shippingTemplateDialogVisible.value = true
  loadShippingTemplates()
}

const handleDialogClose = () => {
  editingTemplate.value = null
  previewResult.value = null
}

const handleCreateTemplate = () => {
  editingTemplate.value = {
    name: '',
    baseWeightKg: 1.0,
    baseFee: 10,
    stepWeightKg: 1.0,
    stepFee: 5,
    vasFeePerOrder: 2,
    isActive: false,
  }
}

const handleEditTemplate = (template: ShippingTemplate) => {
  editingTemplate.value = {
    name: template.name,
    baseWeightKg: template.baseWeightKg,
    baseFee: template.baseFee,
    stepWeightKg: template.stepWeightKg,
    stepFee: template.stepFee,
    vasFeePerOrder: template.vasFeePerOrder,
    isActive: template.isActive,
  }
}

const handleSaveTemplate = async () => {
  if (!editingTemplate.value) return

  savingTemplate.value = true
  try {
    if (editingTemplate.value.id) {
      await shippingTemplateApi.update(editingTemplate.value.id, editingTemplate.value)
    } else {
      await shippingTemplateApi.create(editingTemplate.value as CreateShippingTemplateDto)
    }
    ElMessage.success('模板保存成功')
    editingTemplate.value = null
    await loadShippingTemplates()
  } catch (error) {
    ElMessage.error('保存模板失败')
    console.error(error)
  } finally {
    savingTemplate.value = false
  }
}

const handleDeleteTemplate = async (template: ShippingTemplate) => {
  try {
    await ElMessageBox.confirm('确定要删除该运费模板吗？', '提示', { type: 'warning' })
    await shippingTemplateApi.delete(template.id)
    ElMessage.success('模板删除成功')
    await loadShippingTemplates()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除模板失败')
      console.error(error)
    }
  }
}

const handleActivateTemplate = async (template: ShippingTemplate) => {
  try {
    await shippingTemplateApi.activate(template.id)
    ElMessage.success('模板激活成功')
    await loadShippingTemplates()
  } catch (error) {
    ElMessage.error('激活模板失败')
    console.error(error)
  }
}

const handlePreviewTemplate = (template: ShippingTemplate) => {
  currentPreviewTemplateId.value = template.id
  previewWeight.value = 1000
  previewResult.value = null
  previewDialogVisible.value = true
}

const handleCalculatePreview = async () => {
  if (!currentPreviewTemplateId.value) return

  try {
    previewResult.value = await shippingTemplateApi.preview({
      templateId: currentPreviewTemplateId.value,
      totalWeightG: previewWeight.value,
    })
  } catch (error) {
    ElMessage.error('计算预览失败')
    console.error(error)
  }
}

onMounted(() => {
  loadConfig()
  loadShippingTemplates()
})
</script>

<style scoped>
.global-config-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.config-card {
  max-width: 900px;
}

.form-tip {
  margin-left: 12px;
  font-size: 13px;
  color: #909399;
}

:deep(.el-divider__text) {
  font-weight: 600;
  color: #409eff;
}

/* 图片上传样式 */
.image-upload-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.uploaded-image {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
  border: 2px dashed #dcdfe6;
  border-radius: 6px;
  background-color: #fafafa;
  width: 200px;
}

.upload-text {
  font-size: 14px;
  color: #909399;
}
</style>
