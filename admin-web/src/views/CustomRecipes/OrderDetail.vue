<template>
  <div class="order-detail" v-loading="loading">
    <div v-if="order" class="detail-container">
      <!-- 左侧：订单信息 -->
      <div class="order-info-section">
        <h3>订单信息</h3>

        <div class="info-group">
          <div class="info-item">
            <label>订单号</label>
            <span>{{ order.orderId }}</span>
          </div>
          <div class="info-item">
            <label>状态</label>
            <el-tag :type="getStatusType(order.status)">
              {{ getStatusText(order.status) }}
            </el-tag>
          </div>
          <div class="info-item">
            <label>提交时间</label>
            <span>{{ formatDateTime(order.createdAt) }}</span>
          </div>
          <div class="info-item" v-if="order.paymentConfirmedAt">
            <label>付款确认</label>
            <span>{{ formatDateTime(order.paymentConfirmedAt) }}</span>
          </div>
          <div class="info-item" v-if="order.deliveredAt">
            <label>交付时间</label>
            <span>{{ formatDateTime(order.deliveredAt) }}</span>
          </div>
        </div>

        <el-divider />

        <h3>客户信息</h3>
        <div class="info-group">
          <div class="info-item">
            <label>姓名</label>
            <span>{{ order.customer?.nickname }}</span>
          </div>
          <div class="info-item">
            <label>微信</label>
            <span>{{ order.customer?.wechatOpenid || '未绑定' }}</span>
          </div>
          <div class="info-item">
            <label>手机</label>
            <span>{{ order.customer?.phone || '未填写' }}</span>
          </div>
        </div>

        <el-divider />

        <h3>狗狗信息</h3>
        <div class="info-group">
          <div class="info-item">
            <label>名字</label>
            <span>{{ order.dog?.name }}</span>
          </div>
          <div class="info-item">
            <label>年龄</label>
            <span>{{ calculateAge(order.dog?.birthday) }}</span>
          </div>
          <div class="info-item">
            <label>当前体重</label>
            <span>{{ order.dog?.currentWeightKg }}kg</span>
          </div>
          <div class="info-item">
            <label>体况评分</label>
            <span>{{ order.dog?.bcsScore }}/9</span>
          </div>
          <div class="info-item">
            <label>活动量</label>
            <span>{{ getActivityLevelText(order.dog?.activityLevel) }}</span>
          </div>
        </div>

        <el-divider />

        <h3>定制信息</h3>
        <div class="info-group">
          <div class="info-item">
            <label>定制目标</label>
            <span>{{ getGoalText(order.targetGoal) }}</span>
          </div>
          <div class="info-item">
            <label>预约日期</label>
            <span>{{ formatDate(order.scheduledDate) }}</span>
          </div>
          <div class="info-item" v-if="order.estimatedDeliveryDate">
            <label>预计交付</label>
            <span>{{ formatDate(order.estimatedDeliveryDate) }}</span>
          </div>
          <div class="info-item">
            <label>金额</label>
            <span class="amount">¥{{ order.amount }}</span>
          </div>
        </div>

        <el-divider />

        <h3>健康信息</h3>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="过敏史">
            <el-tag
              v-for="(allergen, index) in order.allergies"
              :key="index"
              type="danger"
              size="small"
              style="margin-right: 5px;"
            >
              {{ allergen }}
            </el-tag>
            <span v-if="order.allergies.length === 0" class="empty-text">无</span>
          </el-descriptions-item>
          <el-descriptions-item label="疾病史">
            <el-tag
              v-for="(condition, index) in order.medicalConditions"
              :key="index"
              type="warning"
              size="small"
              style="margin-right: 5px;"
            >
              {{ condition }}
            </el-tag>
            <span v-if="order.medicalConditions.length === 0" class="empty-text">无</span>
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="order.additionalNotes" class="notes-section">
          <label>补充说明</label>
          <p>{{ order.additionalNotes }}</p>
        </div>

        <el-divider />

        <h3>饮食偏好</h3>
        <div class="info-group">
          <div class="info-item full-width">
            <label>喜欢的食材</label>
            <div class="tags">
              <el-tag
                v-for="(item, index) in order.preferredIngredients"
                :key="index"
                type="success"
              >
                {{ item }}
              </el-tag>
              <span v-if="order.preferredIngredients.length === 0" class="empty-text">无特殊偏好</span>
            </div>
          </div>
          <div class="info-item full-width">
            <label>不吃的食材</label>
            <div class="tags">
              <el-tag
                v-for="(item, index) in order.dislikedIngredients"
                :key="index"
                type="info"
              >
                {{ item }}
              </el-tag>
              <span v-if="order.dislikedIngredients.length === 0" class="empty-text">无</span>
            </div>
          </div>
        </div>

        <el-divider />

        <h3>附件</h3>
        <div class="attachments-list">
          <div
            v-for="attachment in order.attachmentsRecords"
            :key="attachment.id"
            class="attachment-item"
          >
            <el-icon><Document /></el-icon>
            <span class="file-name">{{ attachment.fileName }}</span>
            <el-button link type="primary" @click="downloadFile(attachment)">
              下载
            </el-button>
            <el-button link type="danger" @click="deleteAttachment(attachment.id)">
              删除
            </el-button>
          </div>
          <div v-if="!order.attachmentsRecords || order.attachmentsRecords.length === 0" class="empty-text">
            无附件
          </div>
        </div>

        <el-divider />

        <h3>操作</h3>
        <div class="action-buttons">
          <el-button
            v-if="order.status === 'PENDING_PAYMENT'"
            type="success"
            @click="confirmPayment"
          >
            确认付款
          </el-button>
          <el-button
            v-if="order.status === 'PAID'"
            type="primary"
            @click="startProcessing"
          >
            开始制作
          </el-button>
          <el-button @click="contactCustomer">联系客户</el-button>
        </div>
      </div>

      <!-- 右侧：创建食谱 -->
      <div class="recipe-creation-section" v-if="order.status === 'PAID' || order.status === 'IN_PROGRESS'">
        <h3>创建定制食谱</h3>

        <el-form :model="recipeForm" label-width="120px">
          <el-form-item label="食谱名称">
            <el-input v-model="recipeForm.name" placeholder="为狗狗专属定制的食谱" />
          </el-form-item>

          <el-form-item label="描述">
            <el-input
              v-model="recipeForm.description"
              type="textarea"
              :rows="3"
              placeholder="食谱描述"
            />
          </el-form-item>

          <el-form-item label="封面图片">
            <el-upload
              class="cover-uploader"
              action="/api/v1/admin/upload"
              :headers="uploadHeaders"
              :show-file-list="false"
              :on-success="handleCoverSuccess"
            >
              <img v-if="recipeForm.coverImageUrl" :src="recipeForm.coverImageUrl" class="cover-image" />
              <el-icon v-else class="cover-uploader-icon"><Plus /></el-icon>
            </el-upload>
          </el-form-item>

          <el-form-item label="营养标准">
            <el-select v-model="recipeForm.nutritionStandard">
              <el-option label="FEDIAF 2021" value="FEDIAF_2021" />
              <el-option label="AAFCO 2019" value="AAFCO_2019" />
              <el-option label="国标 GB/T 31216" value="GB_T_31216" />
            </el-select>
          </el-form-item>

          <el-divider content-position="left">营养目标</el-divider>

          <el-form-item label="蛋白质">
            <el-input-number v-model="recipeForm.proteinPercent" :min="0" :max="50" />
            <span style="margin-left: 10px">%</span>
          </el-form-item>

          <el-form-item label="脂肪">
            <el-input-number v-model="recipeForm.fatPercent" :min="0" :max="30" />
            <span style="margin-left: 10px">%</span>
          </el-form-item>

          <el-form-item label="碳水">
            <el-input-number v-model="recipeForm.carbohydratePercent" :min="0" :max="80" />
            <span style="margin-left: 10px">%</span>
          </el-form-item>

          <el-form-item label="能量密度">
            <el-input-number v-model="recipeForm.energyDensityKcalPerKg" :min="0" :max="10000" />
            <span style="margin-left: 10px">kcal/kg</span>
          </el-form-item>

          <el-divider content-position="left">配方设计</el-divider>

          <el-form-item>
            <template #label>
              <span>食材列表</span>
              <el-button size="small" @click="addIngredient" style="margin-left: 10px">
                + 添加食材
              </el-button>
            </template>
            <div class="ingredients-list">
              <div
                v-for="(item, index) in recipeForm.items"
                :key="index"
                class="ingredient-item"
              >
                <el-input
                  v-model="item.ingredientId"
                  placeholder="食材ID"
                  style="width: 200px"
                />
                <el-input
                  v-model="item.preparationMethod"
                  placeholder="制备方法"
                  style="width: 150px"
                />
                <el-input-number
                  v-model="item.ratioPercent"
                  :min="0"
                  :max="100"
                  :precision="1"
                  style="width: 120px"
                />
                <span>%</span>
                <el-button type="danger" link @click="removeIngredient(index)">
                  删除
                </el-button>
              </div>
            </div>
          </el-form-item>

          <el-divider content-position="left">制作说明</el-divider>

          <el-form-item label="制作步骤">
            <el-input
              v-model="recipeForm.productionSteps"
              type="textarea"
              :rows="5"
              placeholder="详细的制作步骤说明"
            />
          </el-form-item>

          <el-divider content-position="left">营养报告</el-divider>

          <el-form-item label="营养报告">
            <el-upload
              action="/api/v1/admin/upload"
              :headers="uploadHeaders"
              :show-file-list="false"
              :on-success="handleReportSuccess"
            >
              <el-button type="primary" link>上传营养报告PDF</el-button>
            </el-upload>
            <span v-if="recipeForm.nutritionReportUrl" style="margin-left: 10px">
              已上传
            </span>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="submitRecipe" :loading="submitting">
              提交食谱并交付
            </el-button>
            <el-button @click="resetRecipeForm">重置</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 已完成的食谱信息 -->
      <div class="completed-recipe-section" v-if="order.status === 'DELIVERED' && order.recipe">
        <h3>已完成的食谱</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="食谱名称">
            {{ order.recipe.name }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag type="success">已交付</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="营养标准">
            {{ order.recipe.nutritionStandard }}
          </el-descriptions-item>
          <el-descriptions-item label="能量密度">
            {{ order.recipe.energyDensityKcalPerKg }} kcal/kg
          </el-descriptions-item>
        </el-descriptions>

        <div class="recipe-actions">
          <el-button type="primary" @click="viewRecipeFull">
            查看完整食谱
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Document, Plus } from '@element-plus/icons-vue';
import { legacyApi } from '@/api';

const props = defineProps<{
  orderId: string;
}>();

const emit = defineEmits(['refresh', 'close']);

const API_BASE = '/admin/custom-recipe';
const uploadHeaders = (() => {
  const token = localStorage.getItem('admin_token');
  return token ? { Authorization: `Bearer ${token}` } : { 'X-Customer-Id': 'admin-system' };
})();

// 状态
const loading = ref(false);
const submitting = ref(false);
const order = ref<any>(null);

const recipeForm = reactive({
  name: '',
  description: '',
  coverImageUrl: '',
  nutritionStandard: 'FEDIAF_2021',
  proteinPercent: 18,
  fatPercent: 8,
  carbohydratePercent: 45,
  energyDensityKcalPerKg: 3200,
  items: [] as any[],
  productionSteps: '',
  nutritionReportUrl: '',
});

// 生命周期
onMounted(() => {
  loadOrderDetail();
});

watch(() => props.orderId, () => {
  loadOrderDetail();
});

// 方法
const loadOrderDetail = async () => {
  loading.value = true;
  try {
    order.value = await legacyApi.get(`${API_BASE}/orders/${props.orderId}`);
  } catch (error) {
    ElMessage.error('加载订单详情失败');
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const confirmPayment = async () => {
  try {
    await ElMessageBox.confirm('确认该订单已付款？', '确认付款');

    await legacyApi.patch(`${API_BASE}/orders/${order.value.orderId}/confirm-payment`);
    ElMessage.success('付款已确认');
    emit('refresh');
    loadOrderDetail();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败');
    }
  }
};

const startProcessing = async () => {
  try {
    await ElMessageBox.confirm('开始制作该订单？', '开始制作');

    await legacyApi.patch(
      `${API_BASE}/orders/${order.value.orderId}/status`,
      { status: 'IN_PROGRESS' },
    );
    ElMessage.success('已开始制作');
    emit('refresh');
    loadOrderDetail();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败');
    }
  }
};

const contactCustomer = () => {
  const wechat = order.value.customer?.wechatOpenid;
  const phone = order.value.customer?.phone;

  ElMessageBox.alert(
    `微信：${wechat || '未绑定'}\n手机：${phone || '未填写'}`,
    '客户联系方式'
  );
};

const addIngredient = () => {
  recipeForm.items.push({
    ingredientId: '',
    preparationMethod: '',
    ratioPercent: 0,
  });
};

const removeIngredient = (index: number) => {
  recipeForm.items.splice(index, 1);
};

const handleCoverSuccess = (response: any) => {
  if (response.code === 200) {
    recipeForm.coverImageUrl = response.data.url;
    ElMessage.success('封面上传成功');
  }
};

const handleReportSuccess = (response: any) => {
  if (response.code === 200) {
    recipeForm.nutritionReportUrl = response.data.url;
    ElMessage.success('营养报告上传成功');
  }
};

const submitRecipe = async () => {
  try {
    await ElMessageBox.confirm('确认提交食谱并标记为已交付？', '提交确认');

    submitting.value = true;

    const data = {
      name: recipeForm.name,
      description: recipeForm.description,
      coverImageUrl: recipeForm.coverImageUrl,
      nutritionTarget: {
        protein_percent: recipeForm.proteinPercent,
        fat_percent: recipeForm.fatPercent,
        carbohydrate_percent: recipeForm.carbohydratePercent,
        energy_density_kcal_per_kg: recipeForm.energyDensityKcalPerKg,
      },
      items: recipeForm.items,
      productionSteps: recipeForm.productionSteps,
      nutritionReportUrl: recipeForm.nutritionReportUrl,
    };

    await legacyApi.post(
      `${API_BASE}/orders/${order.value.orderId}/create-recipe`,
      data,
    );
    ElMessage.success('食谱已创建并交付');
    emit('refresh');
    emit('close');
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('提交失败');
      console.error(error);
    }
  } finally {
    submitting.value = false;
  }
};

const resetRecipeForm = () => {
  Object.assign(recipeForm, {
    name: '',
    description: '',
    coverImageUrl: '',
    nutritionStandard: 'FEDIAF_2021',
    proteinPercent: 18,
    fatPercent: 8,
    carbohydratePercent: 45,
    energyDensityKcalPerKg: 3200,
    items: [],
    productionSteps: '',
    nutritionReportUrl: '',
  });
};

const viewRecipeFull = () => {
  window.open(`/recipes/${order.value.recipeId}`, '_blank');
};

const downloadFile = (attachment: any) => {
  window.open(attachment.fileUrl, '_blank');
};

const deleteAttachment = async (attachmentId: string) => {
  try {
    await ElMessageBox.confirm('确认删除该附件？', '确认删除');

    await legacyApi.delete(`${API_BASE}/attachments/${attachmentId}`);
    ElMessage.success('附件已删除');
    loadOrderDetail();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败');
    }
  }
};

// 工具函数
const formatDate = (date: string) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatDateTime = (date: string) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${formatDate(date)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const calculateAge = (birthday: string) => {
  if (!birthday) return '-';
  const birth = new Date(birthday);
  const now = new Date();
  const age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    return age - 1;
  }
  return age;
};

const getActivityLevelText = (level: string) => {
  const map: Record<string, string> = {
    RESTING: '休息期',
    LOW: '低活动',
    NORMAL: '正常',
    HIGH: '高活动',
    WORKING: '工作犬',
  };
  return map[level] || level;
};

const getGoalText = (goal: string) => {
  const map: Record<string, string> = {
    MAINTAIN: '维持体重',
    GAIN_WEIGHT: '增重',
    LOSE_WEIGHT: '减重',
    HEALTH_SUPPORT: '健康管理',
  };
  return map[goal] || goal;
};

const getStatusText = (status: string) => {
  const map: Record<string, string> = {
    PENDING_PAYMENT: '待付款',
    PAID: '已付款',
    IN_PROGRESS: '制作中',
    DELIVERED: '已交付',
  };
  return map[status] || status;
};

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    PENDING_PAYMENT: 'warning',
    PAID: '',
    IN_PROGRESS: 'primary',
    DELIVERED: 'success',
  };
  return map[status] || 'info';
};
</script>

<style scoped>
.order-detail {
  padding: 20px;
}

.detail-container {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 30px;
}

.order-info-section,
.recipe-creation-section,
.completed-recipe-section {
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
}

h3 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 18px;
  color: #333;
}

.info-group {
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 14px;
}

.info-item.full-width {
  flex-direction: column;
  align-items: flex-start;
}

.info-item label {
  font-weight: 500;
  color: #666;
}

.info-item span {
  color: #333;
}

.info-item .amount {
  color: #f56c6c;
  font-weight: bold;
  font-size: 18px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.empty-text {
  color: #999;
}

.notes-section {
  margin-top: 20px;
}

.notes-section label {
  display: block;
  font-weight: 500;
  color: #666;
  margin-bottom: 10px;
}

.notes-section p {
  background: #fff;
  padding: 15px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.attachments-list {
  margin-top: 20px;
}

.attachment-item {
  display: flex;
  align-items: center;
  padding: 10px;
  background: #fff;
  border-radius: 4px;
  margin-bottom: 10px;
}

.file-name {
  flex: 1;
  margin: 0 15px;
  font-size: 14px;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.ingredients-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ingredient-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cover-uploader {
  text-align: center;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
}

.cover-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 200px;
  height: 200px;
  line-height: 200px;
}

.cover-image {
  width: 200px;
  height: 200px;
  display: block;
}

.recipe-actions {
  margin-top: 20px;
}
</style>
