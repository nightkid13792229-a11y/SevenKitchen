<template>
  <div class="recipe-form-page">
    <el-page-header @back="handleBack" class="page-header">
      <template #content>
        {{ isReadOnly ? '查看食谱' : (isEdit ? '编辑食谱' : '新建食谱') }}
      </template>
    </el-page-header>

    <el-card v-loading="loading" class="form-card">
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        :disabled="isReadOnly"
        label-width="140px"
        @submit.prevent="handleSubmit"
      >
        <!-- Basic Info -->
        <div class="form-section">
          <h3 class="section-title">基础信息</h3>

          <el-form-item label="食谱名称" prop="name">
            <el-input
              v-model="form.name"
              placeholder="请输入食谱名称"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="封面图" prop="coverImageUrl">
            <div class="image-upload">
              <el-upload
                class="cover-uploader"
                :show-file-list="false"
                :before-upload="handleCoverUpload"
                accept="image/*"
              >
                <img v-if="form.coverImageUrl" :src="form.coverImageUrl" class="cover-image" />
                <div v-else class="upload-placeholder">
                  <el-icon><Plus /></el-icon>
                  <span>上传封面</span>
                </div>
              </el-upload>
              <div v-if="form.coverImageUrl" class="image-actions">
                <el-button size="small" type="danger" @click="removeCoverImage">
                  删除
                </el-button>
              </div>
            </div>
            <div class="upload-tips">
              <el-icon color="#909399"><InfoFilled /></el-icon>
              <span>图片要求：16:9比例，文件大小≤200KB</span>
            </div>
          </el-form-item>

          <el-form-item label="封面标题">
            <el-input
              v-model="form.coverTitle"
              placeholder="显示在封面左上角，最多20个字符"
              maxlength="20"
              show-word-limit
            />
            <div style="margin-top: 8px; color: #909399; font-size: 12px">
              💡 提示：标题会显示在食谱封面图片的左上角，小程序用户可见
            </div>
          </el-form-item>

          <el-form-item label="详情图集">
            <div class="detail-images-upload">
              <div class="image-list">
                <div
                  v-for="(image, index) in form.detailImages"
                  :key="index"
                  class="image-item"
                >
                  <el-image :src="image" fit="cover" class="detail-image" />
                  <div class="image-mask">
                    <el-icon @click="removeDetailImage(index)"><Delete /></el-icon>
                  </div>
                </div>
              </div>
              <el-upload
                :show-file-list="false"
                :before-upload="handleDetailImageUpload"
                accept="image/*"
                class="upload-btn"
              >
                <div class="upload-placeholder-small">
                  <el-icon><Plus /></el-icon>
                </div>
              </el-upload>
            </div>
          </el-form-item>

          <el-form-item label="视频链接">
            <el-input
              v-model="form.videoUrl"
              placeholder="请输入视频链接（可选）"
            />
          </el-form-item>

          <el-form-item label="食谱描述">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="4"
              placeholder="请输入食谱描述"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="设计来源">
            <!-- View mode: display as text -->
            <div v-if="isReadOnly" style="padding: 0 11px; color: #606266;">
              {{ form.designSource || '-' }}
            </div>
            <!-- Edit mode: display as select -->
            <div v-else style="display: flex; gap: 8px">
              <el-select
                v-model="form.designSource"
                placeholder="请选择设计来源"
                style="flex: 1"
                clearable
                filterable
                allow-create
              >
                <el-option
                  v-for="source in designSources"
                  :key="source.id"
                  :label="source.name"
                  :value="source.name"
                />
              </el-select>
              <el-button @click="showDesignSourceDialog">管理</el-button>
            </div>
            <div v-if="!isReadOnly" style="margin-top: 8px; color: #909399; font-size: 12px">
              💡 提示：可从列表选择，或手动输入新的设计来源
            </div>
          </el-form-item>

          <el-form-item label="食谱状态">
            <el-select v-model="form.status" placeholder="请选择食谱状态" style="width: 100%">
              <el-option label="草稿" :value="RecipeStatus.DRAFT" />
              <el-option label="公开食谱" :value="RecipeStatus.PUBLIC" />
              <el-option label="私密定制" :value="RecipeStatus.PRIVATE_CUSTOM" />
            </el-select>
            <div style="margin-top: 8px; color: #909399; font-size: 12px">
              💡 提示：
              <br />• 草稿：仅管理员可见，可继续编辑
              <br />• 公开食谱：所有用户可见，可用于生成订单
              <br />• 私密定制：仅对特定用户可见的定制食谱
            </div>
          </el-form-item>
        </div>

        <!-- Ingredients -->
        <div class="form-section">
          <h3 class="section-title">原料清单</h3>

          <div class="ingredients-section">
            <div class="ingredients-header">
              <h3>已选原料</h3>
              <el-button type="primary" :icon="Plus" @click="showAddIngredientDialog">
                添加原料
              </el-button>
            </div>

            <el-card v-if="form.items && form.items.length > 0" shadow="never">
              <!-- Table Header -->
              <div class="ingredients-table-header">
                <div class="header-cell header-drag" v-if="!isReadOnly"></div>
                <div class="header-cell">原料名称</div>
                <div class="header-cell">类型</div>
                <div class="header-cell">制备方法</div>
                <div class="header-cell">示例重量</div>
                <div class="header-cell">占比</div>
                <div class="header-cell nutrient-target-header">营养目标</div>
                <div class="header-cell">操作</div>
              </div>

              <!-- Draggable Items -->
              <VueDraggable
                v-model="form.items"
                item-key="ingredientId"
                handle=".drag-handle"
                :animation="150"
                ghost-class="sortable-ghost"
                chosen-class="sortable-chosen"
                drag-class="sortable-drag"
                :disabled="isReadOnly"
              >
                <template #item="{ element: item, index }">
                  <div class="ingredient-row">
                    <div class="row-cell row-drag" v-if="!isReadOnly">
                      <span class="drag-handle">⋮⋮</span>
                    </div>
                    <div class="row-cell ingredient-name">{{ item.ingredientName }}</div>
                    <div class="row-cell ingredient-type">
                      <el-tag :type="getTypeTagType(item.ingredientType)" size="small">
                        {{ IngredientTypeLabels[item.ingredientType] || item.ingredientType }}
                      </el-tag>
                    </div>
                    <div class="row-cell preparation-method">
                      {{ formatPreparationMethods(item.preparationMethod) }}
                    </div>
                    <div class="row-cell example-weight">
                      <span v-if="item.exampleWeight !== undefined && item.exampleWeight !== null">
                        {{ item.exampleWeight }}{{ getBaseUnitLabel(item.ingredient) }}
                      </span>
                      <span v-else>-</span>
                    </div>
                    <div class="row-cell ratio-percent">
                      <span v-if="item.ingredientType === 'FOOD' && item.ratioPercent !== undefined && item.ratioPercent !== null">
                        {{ item.ratioPercent.toFixed(2) }}%
                      </span>
                      <span v-else>-</span>
                    </div>
                    <div class="row-cell nutrient-target">
                      <span v-if="item.nutrientTargetKey">
                        {{ formatNutrientTarget(item) }}
                      </span>
                      <span v-else>-</span>
                    </div>
                    <div class="row-cell row-buttons">
                      <el-button type="primary" size="small" link @click="editIngredient(item, index)">
                        编辑
                      </el-button>
                      <el-divider direction="vertical" />
                      <el-button type="danger" size="small" link @click="removeIngredient(index)">
                        删除
                      </el-button>
                    </div>
                  </div>
                </template>
              </VueDraggable>
            </el-card>

            <el-card v-else shadow="never">
              <el-empty description="暂无原料，请点击上方按钮添加" :image-size="80" />
            </el-card>
          </div>
        </div>

        <!-- Nutrition Info -->
        <div class="form-section">
          <h3 class="section-title">营养信息</h3>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="营养标准" prop="nutritionStandard">
                <el-select v-model="form.nutritionStandard" placeholder="请选择营养标准" style="width: 100%">
                  <el-option label="NRC 2006" :value="NutritionStandard.NRC_2006" />
                  <el-option label="FEDIAF 2021" :value="NutritionStandard.FEDIAF_2021" />
                  <el-option label="FEDIAF 2024" :value="NutritionStandard.FEDIAF_2024" />
                  <el-option label="AAFCO 2022" :value="NutritionStandard.AAFCO_2022" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="能量密度" prop="energyDensityKcalPerKg">
                <el-input-number
                  v-model="form.energyDensityKcalPerKg"
                  :min="0"
                  :max="10000"
                  :precision="0"
                  placeholder="请输入能量密度"
                  style="width: calc(100% - 70px)"
                />
                <span class="unit-label">kcal/kg</span>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="蛋白质 (DM%)">
                <el-input-number
                  v-model="nutritionData.protein_dm_pct"
                  :min="0"
                  :max="100"
                  :precision="2"
                  placeholder="蛋白质"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="脂肪 (DM%)">
                <el-input-number
                  v-model="nutritionData.fat_dm_pct"
                  :min="0"
                  :max="100"
                  :precision="2"
                  placeholder="脂肪"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="灰分 (DM%)">
                <el-input-number
                  v-model="nutritionData.ash_dm_pct"
                  :min="0"
                  :max="100"
                  :precision="2"
                  placeholder="灰分"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="含水量 (%)">
                <el-input-number
                  v-model="nutritionData.moisture_pct"
                  :min="0"
                  :max="100"
                  :precision="2"
                  placeholder="含水量"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="膳食纤维 (DM%)">
                <el-input-number
                  v-model="nutritionData.fiber_dm_pct"
                  :min="0"
                  :max="100"
                  :precision="2"
                  placeholder="膳食纤维"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="碳水 (DM%)">
                <el-input-number
                  v-model="nutritionData.carbs_dm_pct"
                  :min="0"
                  :max="100"
                  :precision="2"
                  placeholder="碳水"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="钙磷比">
                <el-input-number
                  v-model="nutritionData.ca_p_ratio"
                  :min="0"
                  :max="5"
                  :precision="2"
                  placeholder="钙磷比"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- Target Audience -->
        <div class="form-section">
          <h3 class="section-title">目标受众</h3>

          <el-form-item label="适用生命阶段">
            <el-checkbox-group v-model="form.applicableLifeStages">
              <el-checkbox
                v-for="option in lifeStageOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>

          <el-form-item label="健康标签">
            <div style="display: flex; gap: 8px; margin-bottom: 8px">
              <el-checkbox-group v-model="form.targetHealthTags" style="flex: 1">
                <el-checkbox
                  v-for="option in healthTagOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </el-checkbox>
              </el-checkbox-group>
              <el-button @click="showHealthTagDialog">管理</el-button>
            </div>
            <div style="color: #909399; font-size: 12px">
              💡 提示：点击"管理"按钮可以添加、编辑或删除健康标签
            </div>
          </el-form-item>
        </div>

        <!-- Production Info -->
        <div class="form-section">
          <h3 class="section-title">生产信息</h3>

          <el-form-item label="生产损耗率">
            <el-input-number
              v-model="form.productionLossRate"
              :min="0"
              :max="50"
              :precision="2"
              placeholder="生产损耗率"
            />
            <span class="form-item-tip">举例：如果生产损耗率为7%，这里需要填1.07。</span>
          </el-form-item>

          <el-form-item label="工时 (小时)">
            <el-input-number
              v-model="form.batchLaborHours"
              :min="0"
              :max="24"
              :precision="1"
              placeholder="工时"
            />
          </el-form-item>

          <el-form-item label="烹饪步骤">
            <el-input
              v-model="form.productionSteps"
              type="textarea"
              :rows="6"
              placeholder="请输入烹饪步骤"
              maxlength="2000"
              show-word-limit
            />
          </el-form-item>
        </div>

        <!-- Actions -->
        <el-form-item>
          <!-- View Mode: Show Edit button -->
          <template v-if="isReadOnly">
            <el-button
              type="primary"
              :disabled="false"
              @click="handleEnterEditMode"
            >
              编辑
            </el-button>
            <el-button :disabled="false" @click="handleBack">返回</el-button>
          </template>

          <!-- Edit/Create Mode: Show Save buttons -->
          <template v-else>
            <el-button
              type="primary"
              :loading="submitting"
              :disabled="false"
              @click="handleSubmit"
            >
              {{ isEdit ? '保存更新' : '创建食谱' }}
            </el-button>
            <el-button :disabled="false" @click="handleSaveDraft">保存草稿</el-button>
            <el-button :disabled="false" @click="handleBack">取消</el-button>
          </template>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Add/Edit Ingredient Dialog -->
    <el-dialog
      v-model="ingredientDialogVisible"
      :title="editingIngredientIndex >= 0 ? '编辑原料' : '添加原料'"
      width="600px"
      @close="resetIngredientForm"
    >
      <el-form :model="ingredientForm" label-width="120px">
        <el-form-item label="原料" required>
          <el-select
            v-model="ingredientForm.ingredientId"
            placeholder="请选择原料"
            filterable
            :disabled="editingIngredientIndex >= 0"
            style="width: 100%"
          >
            <el-option
              v-for="ingredient in availableIngredients"
              :key="ingredient.id"
              :label="ingredient.name"
              :value="ingredient.id"
            >
              <div style="display: flex; flex-direction: column; gap: 4px">
                <div style="display: flex; align-items: center; gap: 8px">
                  <span style="font-weight: 500">{{ ingredient.name }}</span>
                  <span v-if="ingredient.brand" style="color: #909399; font-size: 12px">
                    {{ ingredient.brand }}
                  </span>
                  <span v-if="ingredient.productModel" style="color: #909399; font-size: 12px">
                    {{ ingredient.productModel }}
                  </span>
                </div>
                <div style="display: flex; gap: 16px; font-size: 12px; color: #67c23a">
                  <span v-if="ingredient.purchaseChannel">
                    📍 {{ ingredient.purchaseChannel }}
                  </span>
                  <span>
                    💰 ¥{{ ingredient.effectivePricePerPurchaseUnit ?? ingredient.currentPricePerPurchaseUnit }}/{{ ingredient.purchaseUnit }}
                  </span>
                  <span style="color: #909399">
                    {{ IngredientTypeLabels[ingredient.type] || ingredient.type }}
                  </span>
                </div>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="制备方法">
          <el-input
            v-model="ingredientForm.preparationMethodText"
            type="textarea"
            :rows="3"
            placeholder="直接输入制备方法文案，如：去皮、蒸熟后压泥"
          />

          <div style="margin-top: 8px">
            <div style="font-size: 12px; color: #909399; margin-bottom: 6px">历史制备方法</div>
            <el-skeleton
              v-if="ingredientPreparationMethodHistoryLoading"
              :rows="1"
              animated
            />
            <div
              v-else-if="ingredientPreparationMethodHistory.length > 0"
              class="tag-list"
            >
              <el-tag
                v-for="history in ingredientPreparationMethodHistory"
                :key="history.text"
                class="tag-item"
                type="info"
                @click="appendPreparationMethodText(history.text)"
              >
                {{ history.text }}
              </el-tag>
            </div>
            <el-empty v-else description="暂无历史制备方法" :image-size="40" />
          </div>
        </el-form-item>

        <!-- 食材类型：显示示例重量输入框，占比改为自动计算显示 -->
        <template v-if="ingredientForm.ingredientId && selectedIngredient && selectedIngredient.type === 'FOOD'">
          <el-form-item label="示例重量" required>
            <el-input-number
              v-model="ingredientForm.exampleWeight"
              :min="0"
              :precision="2"
              :step="10"
              placeholder="请输入示例重量"
              style="width: calc(100% - 100px)"
            />
            <span style="margin-left: 8px; color: #606266; font-size: 14px">
              {{ getBaseUnitLabel(selectedIngredient) }}
            </span>
            <div style="color: #909399; font-size: 12px; margin-top: 4px">
              💡 输入该食材的示例重量，用于计算占比
            </div>
          </el-form-item>

          <el-form-item label="占比">
            <div style="padding: 0 11px; color: #606266; font-size: 14px">
              {{ calculatedRatioPercent !== null ? calculatedRatioPercent.toFixed(2) + '%' : '-' }}
            </div>
            <div style="color: #909399; font-size: 12px; margin-top: 4px">
              💡 占比根据所有食材类型的示例重量自动计算
            </div>
          </el-form-item>
        </template>

        <!-- 补剂类型：显示营养目标 -->
        <template v-if="ingredientForm.ingredientId && selectedIngredient && selectedIngredient.type === 'SUPPLEMENT'">
          <el-divider content-position="left">营养目标</el-divider>

          <el-form-item label="营养素">
            <el-select
              v-model="ingredientForm.nutrientTargetKey"
              placeholder="请选择营养素"
              style="width: 100%"
              clearable
            >
              <el-option
                v-for="(label, key) in availableNutrients"
                :key="key"
                :label="label"
                :value="key"
              />
            </el-select>
            <div style="color: #909399; font-size: 12px; margin-top: 4px">
              💡 补剂类型需设置营养目标，表示该补剂在食谱中的目标含量
            </div>
          </el-form-item>

          <el-form-item label="目标值">
            <el-input-number
              v-model="ingredientForm.nutrientTargetValue"
              :min="0"
              :precision="2"
              :disabled="!ingredientForm.nutrientTargetKey"
              placeholder="目标数值"
              style="width: 100%"
            />
            <div style="display: flex; align-items: center; margin-top: 8px;">
              <span v-if="nutrientUnit" style="margin-right: 12px; color: #909399; font-size: 12px">
                单位: {{ nutrientUnit }}
              </span>
              <span style="color: #606266; font-size: 12px">
                💡 设置该补剂在食谱中的目标含量（例如：每1000g食谱含钙1200mg）
              </span>
            </div>
          </el-form-item>
        </template>
      </el-form>

      <template #footer>
        <el-button @click="ingredientDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveIngredient">确定</el-button>
      </template>
    </el-dialog>

    <!-- Design Source Management Dialog -->
    <el-dialog
      v-model="designSourceDialogVisible"
      title="管理设计来源"
      width="600px"
    >
      <div style="margin-bottom: 16px">
        <el-input
          v-model="newDesignSourceName"
          placeholder="输入新的设计来源名称"
          style="width: calc(100% - 80px); margin-right: 8px"
          @keyup.enter="addDesignSource"
        />
        <el-button type="primary" @click="addDesignSource">添加</el-button>
      </div>

      <el-table :data="designSources" style="width: 100%" border>
        <el-table-column prop="name" label="名称" />
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button
              size="small"
              @click="editDesignSource(row)"
            >
              编辑
            </el-button>
            <el-button
              size="small"
              type="danger"
              @click="deleteDesignSource(row.id)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="designSourceDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- Health Tag Management Dialog -->
    <el-dialog
      v-model="healthTagDialogVisible"
      title="管理健康标签"
      width="600px"
    >
      <div style="margin-bottom: 16px">
        <el-input
          v-model="newHealthTagName"
          placeholder="输入新的健康标签名称"
          style="width: calc(100% - 80px); margin-right: 8px"
          @keyup.enter="addHealthTag"
        />
        <el-button type="primary" @click="addHealthTag">添加</el-button>
      </div>

      <el-table :data="healthTags" style="width: 100%" border>
        <el-table-column prop="name" label="名称" />
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button size="small" @click="editHealthTag(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteHealthTag(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="healthTagDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules, UploadProps } from 'element-plus';
import { Plus, Delete, InfoFilled } from '@element-plus/icons-vue';
import VueDraggable from 'vuedraggable';
import { recipeApi } from '@/api/recipes';
import { recipeHealthTagApi } from '@/api/recipeHealthTags';
import { inventoryApi } from '@/api';
import { IngredientTypeLabels } from '@/types/ingredient';
import {
  RecipeStatus,
  NutritionStandard,
  type RecipeForm,
  type RecipeItem,
  type NutritionDetailedData,
  type IngredientPreparationMethodHistoryItem,
} from '@/types/recipe';

// Enum option type
interface EnumOption {
  value: string;
  label: string;
}

const router = useRouter();
const route = useRoute();

const recipeId = computed(() => route.params.id as string | undefined);
const isEdit = computed(() => !!recipeId.value);
const isReadOnly = computed(() => route.query.mode === 'view');

// Form data
const formRef = ref<FormInstance>();
const loading = ref(false);
const submitting = ref(false);

const form = reactive<RecipeForm>({
  name: '',
  coverImageUrl: undefined,
  coverTitle: undefined,
  detailImages: [],
  videoUrl: undefined,
  description: undefined,
  designSource: undefined,
  nutritionStandard: NutritionStandard.FEDIAF_2021,
  energyDensityKcalPerKg: 1500,
  items: [],
  productionLossRate: 1.07,
  batchLaborHours: 2,
  productionSteps: undefined,
  applicableLifeStages: [],
  targetHealthTags: [],
  status: RecipeStatus.DRAFT,
});

const nutritionData = reactive<NutritionDetailedData>({
  moisture_pct: 70,
  protein_dm_pct: 25,
  fat_dm_pct: 15,
  fiber_dm_pct: 3,
  ash_dm_pct: 7,
  carbs_dm_pct: 50,
  ca_p_ratio: 1.2,
  energy_density_kcal_per_kg: 1500,
});

// Ingredients data
const availableIngredients = ref<any[]>([]);
const ingredientDialogVisible = ref(false);
const editingIngredientIndex = ref(-1);
const ingredientForm = reactive({
  ingredientId: '',
  preparationMethodText: '',
  exampleWeight: undefined as number | undefined,
  ratioPercent: undefined as number | undefined,
  nutrientTargetKey: '',
  nutrientTargetValue: undefined as number | undefined,
});
const ingredientPreparationMethodHistory = ref<
  IngredientPreparationMethodHistoryItem[]
>([]);
const ingredientPreparationMethodHistoryLoading = ref(false);

// Computed properties for nutrient target fields
const selectedIngredient = computed(() => {
  return availableIngredients.value.find(
    (ing) => ing.id === ingredientForm.ingredientId
  );
});

const selectedIngredientIsSupplement = computed(() => {
  return selectedIngredient.value?.type === 'SUPPLEMENT';
});

const availableNutrients = computed(() => {
  if (!selectedIngredient.value || !selectedIngredientIsSupplement.value) {
    return {};
  }

  const activeNutrients = (selectedIngredient.value.properties as any)?.active_nutrients || {};

  const result: Record<string, string> = {};
  for (const [name, data] of Object.entries(activeNutrients)) {
    // 新格式: data = {value: number, unit: string}
    const nutrientValue = (data as any).value;
    const nutrientUnit = (data as any).unit;
    result[name] = `${name} (${nutrientValue} ${nutrientUnit} per ${selectedIngredient.value?.baseUnit || 'unit'})`;
  }

  return result;
});

const nutrientUnit = computed(() => {
  if (!ingredientForm.nutrientTargetKey || !selectedIngredient.value) {
    return '';
  }

  // 从 active_nutrients 对象中获取单位（新格式）
  const activeNutrients = (selectedIngredient.value.properties as any)?.active_nutrients || {};
  const nutrientData = activeNutrients[ingredientForm.nutrientTargetKey];

  if (nutrientData && typeof nutrientData === 'object') {
    return (nutrientData as any).unit || '';
  }

  return '';
});

const appendPreparationMethodText = (historyText: string) => {
  const next = historyText.trim();
  if (!next) return;

  const current = ingredientForm.preparationMethodText.trim();
  if (!current) {
    ingredientForm.preparationMethodText = next;
    return;
  }

  const currentSegments = current
    .split(/[、,，]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (currentSegments.some((segment) => segment === next) || current === next) {
    return;
  }

  ingredientForm.preparationMethodText = `${current.replace(/[、,，\s]*$/, '')}、${next}`;
};

watch(
  () => ingredientForm.ingredientId,
  async (ingredientId) => {
    const ingredient = availableIngredients.value.find(
      (item) => item.id === ingredientId,
    );

    if (ingredient && ingredient.type !== 'SUPPLEMENT') {
      ingredientForm.nutrientTargetKey = '';
      ingredientForm.nutrientTargetValue = undefined;
    }

    ingredientPreparationMethodHistory.value = [];
    if (!ingredientId) {
      return;
    }

    ingredientPreparationMethodHistoryLoading.value = true;
    try {
      const history =
        (await recipeApi.getIngredientPreparationMethodHistory(ingredientId)) ||
        [];
      if (ingredientForm.ingredientId === ingredientId) {
        ingredientPreparationMethodHistory.value = history;
      }
    } catch (error: any) {
      ElMessage.error(error.message || '加载历史制备方法失败');
    } finally {
      ingredientPreparationMethodHistoryLoading.value = false;
    }
  },
);

// 计算当前编辑食材的占比
const calculatedRatioPercent = computed(() => {
  if (!ingredientForm.exampleWeight || ingredientForm.exampleWeight <= 0) {
    return null;
  }

  // 获取所有FOOD类型的食材示例重量
  const foodItems = (form.items || []).filter(
    (item: any) => item.ingredientType === 'FOOD' && item.exampleWeight !== undefined && item.exampleWeight !== null
  );

  // 计算总重量（包括当前正在编辑的食材）
  let totalWeight = 0;
  foodItems.forEach((item: any) => {
    // 如果是正在编辑的食材，使用表单中的值
    if (item.ingredientId === ingredientForm.ingredientId) {
      totalWeight += ingredientForm.exampleWeight || 0;
    } else {
      totalWeight += item.exampleWeight || 0;
    }
  });

  // 如果总重量为0，返回null
  if (totalWeight === 0) {
    return null;
  }

  // 计算占比
  return (ingredientForm.exampleWeight / totalWeight) * 100;
});

// 获取基准单位标签
const getBaseUnitLabel = (ingredient: any) => {
  if (!ingredient) return '';

  // First check if baseUnit is directly available
  if (ingredient.baseUnit) {
    const unitMap: Record<string, string> = {
      'G': 'g',
      'ML': 'ml',
      'PCS': '个'
    };
    return unitMap[ingredient.baseUnit] || ingredient.baseUnit;
  }

  // Fallback: infer unit from ingredient type
  if (ingredient.type === 'FOOD') {
    return 'g';
  } else if (ingredient.type === 'SUPPLEMENT') {
    // Supplements often use different units, check properties or default
    return 'g'; // Default to grams, can be refined
  }

  return '';
};

// 监听示例重量变化，自动更新占比
watch(() => ingredientForm.exampleWeight, (newWeight) => {
  if (newWeight !== undefined && newWeight !== null) {
    ingredientForm.ratioPercent = calculatedRatioPercent.value || undefined;
  }
});

// Metadata (enum options)
const lifeStageOptions = ref<EnumOption[]>([]);
const healthTagOptions = ref<EnumOption[]>([]);

// Design source management
const designSources = ref<Array<{ id: string; name: string }>>([]);
const designSourceDialogVisible = ref(false);
const newDesignSourceName = ref('');

// Health tag management
const healthTags = ref<Array<{ id: string; name: string }>>([]);
const healthTagDialogVisible = ref(false);
const newHealthTagName = ref('');

// Helper function to map health tags to enum options
const updateHealthTagOptions = (healthTagsData: any[]) => {
  // Now using UUIDs directly from database, no hardcoded enum mapping
  healthTagOptions.value = (healthTagsData || [])
    .map((tag: any) => ({
      value: tag.id, // Use UUID directly
      label: tag.name,
    }));
  healthTags.value = healthTagsData || [];
};

// Form rules
const rules: FormRules = {
  name: [{ required: true, message: '请输入食谱名称', trigger: 'blur' }],
  nutritionStandard: [{ required: true, message: '请选择营养标准', trigger: 'change' }],
  energyDensityKcalPerKg: [{ required: true, message: '请输入能量密度', trigger: 'blur' }],
};

// Methods
const loadRecipeDetail = async () => {
  if (!recipeId.value) return;

  loading.value = true;
  try {
    // Response interceptor already extracts data, so response is the actual recipe data
    const detail = await recipeApi.getDetail(recipeId.value);

    Object.assign(form, {
      name: detail.name,
      coverImageUrl: detail.coverImageUrl,
      coverTitle: detail.coverTitle,
      detailImages: detail.detailImages || [],
      videoUrl: detail.videoUrl,
      description: detail.description,
      designSource: detail.designSource,
      nutritionStandard: detail.nutritionStandard,
      energyDensityKcalPerKg: detail.energyDensityKcalPerKg,
      productionLossRate: detail.productionLossRate,
      batchLaborHours: detail.batchLaborHours,
      productionSteps: detail.productionSteps,
      applicableLifeStages: detail.applicableLifeStages,
      targetHealthTags: detail.targetHealthTags,
      status: detail.status,
      items: detail.items || [],
    });

    // 预填充营养素单位信息到 items
    if (form.items && form.items.length > 0) {
      form.items = form.items.map((item: any) => {
        if (item.nutrientTargetKey && item.ingredient?.properties?.active_nutrients) {
          const nutrientData = item.ingredient.properties.active_nutrients[item.nutrientTargetKey];
          if (nutrientData && typeof nutrientData === 'object') {
            item._nutrientUnit = nutrientData.unit || '';
          }
        }
        return item;
      });
    }

    if (detail.nutritionDetailedData) {
      Object.assign(nutritionData, detail.nutritionDetailedData);
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载食谱详情失败');
  } finally {
    loading.value = false;
  }
};

const handleCoverUpload: UploadProps['beforeUpload'] = async (file) => {
  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    ElMessage.error('只能上传图片文件');
    return false;
  }

  // Check file size (200KB = 200 * 1024 bytes)
  const maxSize = 200 * 1024;
  if (file.size > maxSize) {
    ElMessage.error(`图片大小不能超过 200KB（当前大小：${(file.size / 1024).toFixed(2)} KB）`);
    return false;
  }

  // Check image aspect ratio (16:9)
  const ratio = await checkImageAspectRatio(file);
  if (!ratio.valid) {
    ElMessage.error(`图片比例必须为 16:9（当前比例：${ratio.currentRatio}）`);
    return false;
  }

  try {
    const result = await recipeApi.uploadImage(file);
    form.coverImageUrl = result.url;
    ElMessage.success('上传成功');
  } catch (error: any) {
    ElMessage.error(error.message || '上传失败');
  }

  return false;
};

// Helper function to check image aspect ratio
const checkImageAspectRatio = (file: File): Promise<{ valid: boolean; currentRatio: string }> => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      const ratio = width / height;
      const targetRatio = 16 / 9;

      // Allow 5% tolerance
      const tolerance = 0.05;
      const isValid = Math.abs(ratio - targetRatio) <= tolerance;

      resolve({
        valid: isValid,
        currentRatio: `${width}:${height}`
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: true, currentRatio: 'unknown' }); // Allow upload if we can't check
    };

    img.src = url;
  });
};

const handleDetailImageUpload: UploadProps['beforeUpload'] = async (file) => {
  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    ElMessage.error('只能上传图片文件');
    return false;
  }

  const isLt5M = file.size / 1024 / 1024 < 5;
  if (!isLt5M) {
    ElMessage.error('图片大小不能超过 5MB');
    return false;
  }

  try {
    const result = await recipeApi.uploadImage(file);
    form.detailImages!.push(result.url);
    ElMessage.success('上传成功');
  } catch (error: any) {
    ElMessage.error(error.message || '上传失败');
  }

  return false;
};

const removeDetailImage = async (index: number) => {
  const imageUrl = form.detailImages?.[index];
  if (!imageUrl) {
    return;
  }

  // 从URL中提取key (格式: https://bucket.cos.region.myqcloud.com/recipes/timestamp-random.ext)
  const match = imageUrl.match(/\/recipes\/(.+)$/);
  if (match) {
    const key = `recipes/${match[1]}`;

    try {
      await recipeApi.deleteImage(key);
      ElMessage.success('图片已删除');
    } catch (error: any) {
      ElMessage.error(error.message || '删除失败');
      return; // 如果删除失败，不从列表中移除
    }
  }

  form.detailImages!.splice(index, 1);
};

const removeCoverImage = async () => {
  if (!form.coverImageUrl) return;

  // 从URL中提取key
  const match = form.coverImageUrl.match(/\/recipes\/(.+)$/);
  if (match) {
    const key = `recipes/${match[1]}`;

    try {
      await recipeApi.deleteImage(key);
      ElMessage.success('图片已删除');
    } catch (error: any) {
      ElMessage.error(error.message || '删除失败');
      return; // 如果删除失败，不删除
    }
  }

  form.coverImageUrl = undefined;
};

const handleSubmit = async () => {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    submitting.value = true;
    try {
      // Combine nutrition data into form
      const submitData: RecipeForm = {
        ...form,
        nutritionDetailedData: { ...nutritionData },
      };

      // Debug: Log items with preparation methods before submit
      console.log('[RecipeForm] handleSubmit - Items with prep methods:');
      submitData.items?.forEach((item: any, index: number) => {
        console.log(`  Item ${index}: ${item.ingredientName}, prepMethod: ${item.preparationMethod}`);
      });

      if (isEdit.value) {
        await recipeApi.update(recipeId.value!, submitData);
        ElMessage.success('更新成功');
      } else {
        await recipeApi.create(submitData);
        ElMessage.success('创建成功');
      }

      router.push('/recipes');
    } catch (error: any) {
      ElMessage.error(error.message || '操作失败');
    } finally {
      submitting.value = false;
    }
  });
};

const handleSaveDraft = async () => {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    submitting.value = true;
    try {
      const submitData: RecipeForm = {
        ...form,
        nutritionDetailedData: { ...nutritionData },
        status: RecipeStatus.DRAFT,
      };

      if (isEdit.value) {
        await recipeApi.update(recipeId.value!, submitData);
        ElMessage.success('草稿保存成功');
      } else {
        await recipeApi.create(submitData);
        ElMessage.success('草稿创建成功');
      }

      router.push('/recipes');
    } catch (error: any) {
      ElMessage.error(error.message || '保存失败');
    } finally {
      submitting.value = false;
    }
  });
};

const handleBack = () => {
  router.back();
};

const handleEnterEditMode = () => {
  // Remove mode query parameter to enter edit mode
  router.push({
    path: route.path,
    query: {},
  });
};

// Ingredients management
const loadAvailableIngredients = async () => {
  try {
    const response = await inventoryApi.list();
    availableIngredients.value = response || [];
  } catch (error: any) {
    ElMessage.error(error.message || '加载原料列表失败');
  }
};

// Metadata loading
const loadMetadata = async () => {
  try {
    const [lifeStages, healthTagsData, designSourcesData] = await Promise.all([
      recipeApi.getLifeStages(),
      recipeHealthTagApi.list(),
      recipeApi.getDesignSources(),
    ]);
    lifeStageOptions.value = lifeStages || [];
    updateHealthTagOptions(healthTagsData || []);
    designSources.value = designSourcesData || [];
  } catch (error: any) {
    ElMessage.error(error.message || '加载元数据失败');
  }
};

// Design source management
const showDesignSourceDialog = async () => {
  designSourceDialogVisible.value = true;
  // Reload design sources to get latest data
  try {
    const response = await recipeApi.getDesignSources();
    designSources.value = response || [];
  } catch (error: any) {
    ElMessage.error(error.message || '加载设计来源列表失败');
  }
};

const addDesignSource = async () => {
  if (!newDesignSourceName.value.trim()) {
    ElMessage.warning('请输入设计来源名称');
    return;
  }

  try {
    await recipeApi.createDesignSource({ name: newDesignSourceName.value.trim() });
    ElMessage.success('添加成功');
    newDesignSourceName.value = '';

    // Reload design sources
    const response = await recipeApi.getDesignSources();
    designSources.value = response || [];
  } catch (error: any) {
    ElMessage.error(error.message || '添加失败');
  }
};

const editDesignSource = async (row: { id: string; name: string }) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的名称', '编辑设计来源', {
      inputValue: row.name,
      inputPattern: /.+/,
      inputErrorMessage: '名称不能为空',
    });

    if (value) {
      await recipeApi.updateDesignSource(row.id, { name: value.trim() });
      ElMessage.success('更新成功');

      // Reload design sources
      const response = await recipeApi.getDesignSources();
      designSources.value = response || [];
    }
  } catch (error: any) {
    // User cancelled the prompt
    if (error !== 'cancel') {
      ElMessage.error(error.message || '更新失败');
    }
  }
};

const deleteDesignSource = async (id: string) => {
  try {
    await ElMessageBox.confirm('确认删除该设计来源？', '提示', {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    });

    await recipeApi.deleteDesignSource(id);
    ElMessage.success('删除成功');

    // Reload design sources
    const response = await recipeApi.getDesignSources();
    designSources.value = response || [];
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
};

// Health tag management
const showHealthTagDialog = async () => {
  healthTagDialogVisible.value = true;
  try {
    const response = await recipeHealthTagApi.list();
    healthTags.value = response || [];
  } catch (error: any) {
    ElMessage.error(error.message || '加载健康标签列表失败');
  }
};

const addHealthTag = async () => {
  if (!newHealthTagName.value.trim()) {
    ElMessage.warning('请输入健康标签名称');
    return;
  }

  try {
    await recipeHealthTagApi.create({ name: newHealthTagName.value.trim() });
    ElMessage.success('添加成功');
    newHealthTagName.value = '';

    // Reload health tags
    const healthTagsData = await recipeHealthTagApi.list();
    updateHealthTagOptions(healthTagsData || []);
  } catch (error: any) {
    ElMessage.error(error.message || '添加失败');
  }
};

const editHealthTag = async (row: { id: string; name: string }) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入新的名称', '编辑健康标签', {
      inputValue: row.name,
      inputPattern: /.+/,
      inputErrorMessage: '名称不能为空',
    });

    if (value) {
      await recipeHealthTagApi.update(row.id, { name: value.trim() });
      ElMessage.success('更新成功');

      // Reload health tags
      const healthTagsData = await recipeHealthTagApi.list();
      updateHealthTagOptions(healthTagsData || []);
    }
  } catch (error: any) {
    // User cancelled the prompt
    if (error !== 'cancel') {
      ElMessage.error(error.message || '更新失败');
    }
  }
};

const deleteHealthTag = async (id: string) => {
  try {
    await ElMessageBox.confirm('确认删除该健康标签？', '提示', {
      type: 'warning',
      confirmButtonText: '确认',
      cancelButtonText: '取消',
    });

    await recipeHealthTagApi.delete(id);
    ElMessage.success('删除成功');

    // Reload health tags
    const healthTagsData = await recipeHealthTagApi.list();
    updateHealthTagOptions(healthTagsData || []);
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
};

const showAddIngredientDialog = () => {
  editingIngredientIndex.value = -1;
  resetIngredientForm();
  ingredientDialogVisible.value = true;
};

const resetIngredientForm = () => {
  ingredientForm.ingredientId = '';
  ingredientForm.preparationMethodText = '';
  ingredientForm.exampleWeight = undefined;
  ingredientForm.ratioPercent = undefined;
  ingredientForm.nutrientTargetKey = '';
  ingredientForm.nutrientTargetValue = undefined;
  ingredientPreparationMethodHistory.value = [];
  ingredientPreparationMethodHistoryLoading.value = false;
};

const saveIngredient = () => {
  // Validate
  if (!ingredientForm.ingredientId) {
    ElMessage.warning('请选择原料');
    return;
  }

  // Find ingredient info
  const ingredient = availableIngredients.value.find(
    (ing) => ing.id === ingredientForm.ingredientId
  );

  if (!ingredient) {
    ElMessage.error('未找到原料信息');
    return;
  }

  // 根据原料类型进行验证
  if (ingredient.type === 'FOOD') {
    if (ingredientForm.exampleWeight === undefined || ingredientForm.exampleWeight <= 0) {
      ElMessage.warning('食材类型请输入示例重量');
      return;
    }
  }

  if (ingredient.type === 'SUPPLEMENT' && !ingredientForm.nutrientTargetKey) {
    ElMessage.warning('补剂类型请设置营养目标');
    return;
  }

  // Create item object - 根据原料类型保存相应字段
  const item: RecipeItem = {
    id: editingIngredientIndex.value >= 0
      ? (form.items![editingIngredientIndex.value]?.id || '')
      : '',
    ingredientId: ingredientForm.ingredientId,
    ingredientName: ingredient.name,
    ingredientType: ingredient.type,
    preparationMethod:
      ingredientForm.preparationMethodText.trim() || undefined,
    // 食材类型：保存示例重量和占比
    ...(ingredient.type === 'FOOD' && {
      exampleWeight: ingredientForm.exampleWeight,
      ratioPercent: ingredientForm.ratioPercent,
      nutrientTargetKey: undefined,
      nutrientTargetValue: undefined,
    }),
    // 补剂类型：保存营养目标
    ...(ingredient.type === 'SUPPLEMENT' && {
      exampleWeight: undefined,
      ratioPercent: undefined,
      nutrientTargetKey: ingredientForm.nutrientTargetKey || undefined,
      nutrientTargetValue: ingredientForm.nutrientTargetValue || undefined,
    }),
  };

  // ===== 新增代码：预填充营养素单位和ingredient对象 =====
  if (ingredient.type === 'SUPPLEMENT' && ingredientForm.nutrientTargetKey) {
    const activeNutrients = (ingredient.properties as any)?.active_nutrients || {};
    const nutrientData = activeNutrients[ingredientForm.nutrientTargetKey];
    if (nutrientData && typeof nutrientData === 'object') {
      (item as any)._nutrientUnit = (nutrientData as any).unit || '';
    }

    // 同时嵌入完整的ingredient对象，确保properties可用
    (item as any).ingredient = ingredient;
  }
  // ===== 新增代码结束 =====

  if (!form.items) {
    form.items = [];
  }

  if (editingIngredientIndex.value >= 0) {
    // Update existing
    form.items[editingIngredientIndex.value] = item;
    // 重新计算所有FOOD类型的占比
    recalculateAllRatios();
    ElMessage.success('原料更新成功');
  } else {
    // Add new
    form.items.push(item);
    // 重新计算所有FOOD类型的占比
    recalculateAllRatios();
    ElMessage.success('原料添加成功');
  }

  ingredientDialogVisible.value = false;
};

// 重新计算所有FOOD类型食材的占比
const recalculateAllRatios = () => {
  const items = form.items || [];
  const foodItems = items.filter(
    (item: any) => item.ingredientType === 'FOOD' && item.exampleWeight !== undefined && item.exampleWeight !== null
  );

  const totalWeight = foodItems.reduce((sum: number, item: any) => sum + (item.exampleWeight || 0), 0);

  if (totalWeight > 0) {
    items.forEach((item: any) => {
      if (item.ingredientType === 'FOOD' && item.exampleWeight) {
        item.ratioPercent = (item.exampleWeight / totalWeight) * 100;
      }
    });
  }
};

const editIngredient = (row: RecipeItem, index: number) => {
  editingIngredientIndex.value = index;
  ingredientForm.ingredientId = row.ingredientId;
  ingredientForm.preparationMethodText = row.preparationMethod || '';
  ingredientForm.exampleWeight = row.exampleWeight;
  ingredientForm.ratioPercent = row.ratioPercent;
  ingredientForm.nutrientTargetKey = row.nutrientTargetKey || '';
  ingredientForm.nutrientTargetValue = row.nutrientTargetValue;
  ingredientDialogVisible.value = true;
};

const removeIngredient = (index: number) => {
  form.items!.splice(index, 1);
  ElMessage.success('原料删除成功');
};

// Format nutrient target for display
const formatNutrientTarget = (row: any) => {
  const key = row.nutrientTargetKey;
  const value = row.nutrientTargetValue;

  if (!key || value === undefined) return '-';

  // 策略1: 优先使用预填充的单位
  let unit = row._nutrientUnit || '';

  // 策略2: 从 row.ingredient.properties 获取
  if (!unit && row.ingredient?.properties?.active_nutrients) {
    const activeNutrients = (row.ingredient.properties as any).active_nutrients || {};
    const nutrientData = activeNutrients[key];
    if (nutrientData && typeof nutrientData === 'object') {
      unit = (nutrientData as any).unit || '';
    }
  }

  // 策略3: 从 availableIngredients 中查找（新增）
  if (!unit) {
    const ingredient = availableIngredients.value.find(
      (ing) => ing.id === row.ingredientId
    );
    if (ingredient?.properties?.active_nutrients) {
      const activeNutrients = (ingredient.properties as any).active_nutrients || {};
      const nutrientData = activeNutrients[key];
      if (nutrientData && typeof nutrientData === 'object') {
        unit = (nutrientData as any).unit || '';
      }
    }
  }

  return `${key}: ${value}${unit}`;
};

// Format preparation methods for display
const formatPreparationMethods = (preparationMethod: string | undefined) => {
  return preparationMethod?.trim() || '-';
};

// Get tag type for ingredient type
const getTypeTagType = (type: string) => {
  const typeMap: Record<string, any> = {
    FOOD: 'success',
    SUPPLEMENT: 'warning',
    PACKAGING: 'info'
  };
  return typeMap[type] || '';
};

// Lifecycle
onMounted(async () => {
  loadMetadata();
  loadAvailableIngredients();
  if (isEdit.value) {
    await loadRecipeDetail();
  }
});
</script>

<style scoped>
.recipe-form-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.form-card {
  max-width: 1200px;
  margin: 0 auto;
}

.form-section {
  margin-bottom: 40px;
  padding-bottom: 30px;
  border-bottom: 1px solid #eee;
}

.form-section:last-child {
  border-bottom: none;
}

.section-title {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.ingredients-section {
  width: 100%;
}

.ingredients-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.ingredients-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.image-upload {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.cover-uploader {
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.3s;
}

.cover-uploader:hover {
  border-color: #409eff;
}

.cover-image {
  width: 320px;
  height: 180px;
  display: block;
  object-fit: cover;
}

.upload-placeholder {
  width: 320px;
  height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8c939d;
  font-size: 14px;
}

.upload-tips {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #909399;
}

.upload-placeholder .el-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

.image-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-images-upload {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.image-list {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.image-item {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 4px;
  overflow: hidden;
  cursor: move;
}

.detail-image {
  width: 100%;
  height: 100%;
}

.image-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: none;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
}

.image-item:hover .image-mask {
  display: flex;
}

.upload-btn {
  width: 120px;
  height: 120px;
}

.upload-placeholder-small {
  width: 100%;
  height: 100%;
  border: 1px dashed #d9d9d9;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8c939d;
  font-size: 24px;
  cursor: pointer;
}

.upload-placeholder-small:hover {
  border-color: #409eff;
  color: #409eff;
}

.unit-label {
  margin-left: 8px;
  color: #909399;
  font-size: 14px;
}

/* Tag selector styles for preparation methods */
.tag-selector-wrapper {
  width: 100%;
}

.tag-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  max-height: 120px;
  overflow-y: auto;
  padding: 8px;
  background-color: #f5f7fa;
  border-radius: 8px;
}

.tag-item {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 14px;
}

.empty-tags-state {
  padding: 20px;
  text-align: center;
}

/* Drag handle styles */
.drag-handle {
  cursor: move !important;
  color: #909399;
  font-size: 16px;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  user-select: none;
  padding: 4px;
  pointer-events: auto !important;  /* Ensure pointer events are captured */
  touch-action: none;  /* Prevent default touch actions */
  min-width: 24px;
  min-height: 24px;
  position: relative;
  z-index: 10;
}

.drag-handle:hover {
  color: #409eff;
  transform: scale(1.2);
}

.drag-handle:active {
  cursor: grabbing !important;
}

/* Ingredients Table Header */
.ingredients-table-header {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  background-color: #f5f7fa;
  border-bottom: 1px solid #ebeef5;
  font-weight: 600;
  color: #606266;
  font-size: 14px;
}

.header-cell {
  flex-shrink: 0;
  padding: 0 8px;
}

.header-cell:first-child {
  width: 50px;
  justify-content: center;
  display: flex;
}

.header-cell:nth-child(2) {
  width: 180px;
}

.header-cell:nth-child(3) {
  width: 120px;
  justify-content: center;
  display: flex;
}

.header-cell:nth-child(4) {
  width: 150px;
}

.header-cell:nth-child(5) {
  width: 120px;
  justify-content: flex-end;
  display: flex;
}

.header-cell:nth-child(6) {
  width: 120px;
  justify-content: flex-end;
  display: flex;
}

.header-cell:nth-child(7) {
  width: 200px;
}

/* 营养目标列增加左边距 */
.nutrient-target-header {
  padding-left: 16px !important;
}

.row-cell.nutrient-target {
  padding-left: 16px !important;
}

.header-cell:nth-child(8) {
  flex: 1;
  justify-content: center;
  display: flex;
  min-width: 150px;
}

/* Ingredient Row */
.ingredient-row {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  border-bottom: 1px solid #ebeef5;
  transition: background-color 0.2s;
  cursor: default;
}

.ingredient-row:hover {
  background-color: #f5f7fa;
}

.row-cell {
  flex-shrink: 0;
  padding: 0 8px;
  display: flex;
  align-items: center;
  font-size: 14px;
}

.row-cell:first-child {
  width: 50px;
  justify-content: center;
}

.row-cell:nth-child(2) {
  width: 180px;
  font-weight: 500;
}

.row-cell:nth-child(3) {
  width: 120px;
  justify-content: center;
}

.row-cell:nth-child(4) {
  width: 150px;
}

.row-cell:nth-child(5) {
  width: 120px;
  justify-content: flex-end;
}

.row-cell:nth-child(6) {
  width: 120px;
  justify-content: flex-end;
}

.row-cell:nth-child(7) {
  width: 200px;
}

.row-cell:nth-child(8) {
  flex: 1;
  justify-content: center;
  gap: 8px;
  min-width: 150px;
}

/* Drag Handle */
.drag-handle {
  cursor: grab;
  color: #909399;
  font-size: 18px;
  display: inline-block;
  user-select: none;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.drag-handle:hover {
  color: #409eff;
  background-color: #ecf5ff;
}

.drag-handle:active {
  cursor: grabbing;
}

/* Sortable styles */
.sortable-ghost {
  opacity: 0.4;
  background-color: #f0f9ff !important;
}

.sortable-chosen {
  background-color: #e1f3ff !important;
}

.sortable-drag {
  opacity: 0.9;
  background-color: #d1e9ff !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

/* Form item tip */
.form-item-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}

/* Draggable item for preparation methods dialog */
.draggable-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 8px;
  background-color: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  transition: all 0.2s;
}

.draggable-item:hover {
  border-color: #c0c4cc;
}

.draggable-item .drag-handle {
  margin-right: 12px;
}

.draggable-item .item-name {
  flex: 1;
  font-size: 14px;
  color: #606266;
}

.draggable-item .item-actions {
  display: flex;
  gap: 8px;
}

/* Ghost class for VueDraggable */
.ghost {
  opacity: 0.5;
  background-color: #f0f9ff !important;
  border: 1px dashed #409eff !important;
}

/* Preparation methods selection sections */
.selected-methods-section,
.unselected-methods-section {
  margin-bottom: 12px;
}

.section-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}

.selected-tag {
  cursor: default;
}

/* Draggable tag list */
.draggable-tag-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.draggable-tag-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tag-drag-handle {
  cursor: grab;
  color: #909399;
  font-size: 14px;
  padding: 2px;
  border-radius: 4px;
  transition: all 0.2s;
}

.tag-drag-handle:hover {
  color: #409eff;
  background-color: #ecf5ff;
}

.tag-drag-handle:active {
  cursor: grabbing;
}
</style>
