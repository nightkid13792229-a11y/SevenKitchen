<template>
  <div class="custom-recipe-orders">
    <div class="page-header">
      <h1>定制食谱订单</h1>
      <!-- 口径 2：改定制费/产能只允许管理员。菜单对所有登录者可见，
           所以入口不消失而是置灰并说明原因，客服才不会以为是系统坏了 -->
      <el-tooltip
        v-if="isAdmin"
        content="定制费 / 可抵扣金额 / 交付周期 / 接单上限"
        placement="bottom"
      >
        <el-button @click="goToConfig">食谱定制设置</el-button>
      </el-tooltip>
      <el-tooltip v-else :content="`${ADMIN_ONLY_TIP}：食谱定制设置`" placement="bottom">
        <span><el-button disabled>食谱定制设置</el-button></span>
      </el-tooltip>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon pending">💰</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.pendingPayment }}</div>
              <div class="stat-label">待付款</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon progress">🔨</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.inProgress }}</div>
              <div class="stat-label">制作中</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon delivered">✅</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.delivered }}</div>
              <div class="stat-label">已交付</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-icon revenue">💵</div>
            <div class="stat-info">
              <div class="stat-value">¥{{ statistics.totalRevenue }}</div>
              <!-- 口径：已收款（已付款/制作中/已交付）的定制费合计。
                   选定日期范围时按所选区间统计，不限日期时是累计 —— 所以标签不能再写"本月"。 -->
              <div class="stat-label">
                {{ dateRange && dateRange.length === 2 ? '区间收入' : '累计收入' }}
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选器 -->
    <el-card class="filter-card">
      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable @change="loadOrders">
            <el-option label="全部" value=""></el-option>
            <el-option label="待付款" value="PENDING_PAYMENT"></el-option>
            <el-option label="已付款" value="PAID"></el-option>
            <el-option label="制作中" value="IN_PROGRESS"></el-option>
            <el-option label="已交付" value="DELIVERED"></el-option>
            <el-option label="已取消" value="CANCELLED"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="handleDateRangeChange"
          />
        </el-form-item>
        <el-form-item label="搜索">
          <el-input
            v-model="filters.search"
            placeholder="订单号/狗狗名/客户名"
            clearable
            @clear="loadOrders"
          >
            <template #append>
              <el-button icon="Search" @click="loadOrders" />
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadOrders">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 订单表格 -->
    <el-card class="table-card">
      <el-table :data="orders" v-loading="loading" stripe>
        <el-table-column prop="orderId" label="订单号" width="150" />
        <el-table-column label="狗狗" width="120">
          <template #default="{ row }">
            {{ row.dog?.name }}
          </template>
        </el-table-column>
        <el-table-column label="客户" width="120">
          <template #default="{ row }">
            {{ row.customer?.nickname }}
          </template>
        </el-table-column>
        <el-table-column prop="targetGoal" label="目标" width="100">
          <template #default="{ row }">
            {{ getGoalText(row.targetGoal) }}
          </template>
        </el-table-column>
        <el-table-column prop="scheduledDate" label="预约日期" width="120">
          <template #default="{ row }">
            {{ formatDate(row.scheduledDate) }}
          </template>
        </el-table-column>
        <!-- 预计交付要能扫一眼看出"哪些已经晚了"：只有日期的话，
             员工得逐单心算，超期的单就沉在列表里没人催 -->
        <el-table-column label="预计交付" width="160">
          <template #default="{ row }">
            <div class="delivery-cell">
              <span :class="{ 'overdue-text': getDeliveryInfo(row).overdue }">
                {{ getDeliveryInfo(row).dateText || '未测算' }}
              </span>
              <el-tag
                v-if="getDeliveryInfo(row).overdue"
                type="danger"
                size="small"
              >
                {{ getDeliveryInfo(row).text }}
              </el-tag>
              <span v-else-if="getDeliveryInfo(row).text" class="countdown-text">
                {{ getDeliveryInfo(row).text }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <!-- 状态文案与详情页共用一份字典（constants/customRecipeOrder）：
                 两处各写一份的结果就是详情页漏了「已取消」，显示成英文 CANCELLED -->
            <el-tag :type="getCustomRecipeStatusTagType(row.status)">
              {{ getCustomRecipeStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="80">
          <template #default="{ row }">
            ¥{{ row.amount }}
          </template>
        </el-table-column>
        <el-table-column label="可抵扣余额" width="110">
          <template #default="{ row }">
            <span :class="{ 'credit-remaining': Number(row.creditRemaining) > 0 }">
              ¥{{ Number(row.creditRemaining || 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="200">
          <template #default="{ row }">
            <el-button link type="primary" @click="viewDetail(row.orderId)">
              查看
            </el-button>
            <el-button
              v-if="row.status === 'PENDING_PAYMENT'"
              link
              type="success"
              @click="confirmPayment(row)"
            >
              确认付款
            </el-button>
            <el-button
              v-if="row.status === 'PAID'"
              link
              type="warning"
              @click="startProcessing(row)"
            >
              开始制作
            </el-button>
            <el-button
              v-if="row.status === 'DELIVERED'"
              link
              type="info"
              @click="viewRecipe(row.recipeId)"
            >
              查看食谱
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadOrders"
          @current-change="loadOrders"
        />
      </div>
    </el-card>

    <!-- 订单详情抽屉 -->
    <el-drawer
      v-model="detailDrawerVisible"
      title="订单详情"
      size="70%"
      direction="rtl"
    >
      <OrderDetail
        v-if="detailDrawerVisible && currentOrderId"
        :order-id="currentOrderId"
        @refresh="loadOrders"
        @close="detailDrawerVisible = false"
      />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import OrderDetail from './OrderDetail.vue';
import { customRecipeApi } from '@/api/customRecipe';
import type {
  CustomRecipeOrderDetail,
  CustomRecipeStatistics,
} from '@/api/customRecipe';
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole';
import {
  getCustomRecipeStatusTagType,
  getCustomRecipeStatusText,
} from '@/constants/customRecipeOrder';
import { getEstimatedDeliveryInfo } from '@/utils/customRecipe';
import { getApiErrorMessage, isUserCancel } from '@/utils/apiError';

const router = useRouter();

/** 口径 2：只有管理员能改食谱定制设置，入口对客服置灰 */
const isAdmin = useIsAdmin();

/** 跳到独立的「食谱定制设置」页（定制费 / 可抵扣金额 / 交付周期 / 接单上限） */
const goToConfig = () => {
  router.push('/custom-recipes/config');
};

// 状态
const loading = ref(false);
const orders = ref<CustomRecipeOrderDetail[]>([]);
const statistics = ref<CustomRecipeStatistics>({
  pendingPayment: 0,
  inProgress: 0,
  delivered: 0,
  totalRevenue: 0,
});

const filters = reactive({
  status: '',
  search: '',
});

const dateRange = ref<any[]>([]);

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

const detailDrawerVisible = ref(false);
const currentOrderId = ref('');

// 生命周期
onMounted(() => {
  loadOrders();
  loadStatistics();
});

// 方法
const loadOrders = async () => {
  loading.value = true;
  try {
    const params: any = {
      page: pagination.page,
      pageSize: pagination.pageSize,
    };

    if (filters.status) params.status = filters.status;
    if (filters.search) params.search = filters.search;
    if (dateRange.value && dateRange.value.length === 2) {
      params.dateFrom = dateRange.value[0];
      params.dateTo = dateRange.value[1];
    }

    const data = await customRecipeApi.listOrders(params);
    orders.value = data?.orders || [];
    pagination.total = data?.total || 0;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '加载订单列表失败'));
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const loadStatistics = async () => {
  try {
    const params: any = {};
    if (dateRange.value && dateRange.value.length === 2) {
      params.dateFrom = dateRange.value[0];
      params.dateTo = dateRange.value[1];
    }

    statistics.value = await customRecipeApi.getStatistics(params);
  } catch (error) {
    console.error('加载统计失败', error);
  }
};

const handleDateRangeChange = () => {
  pagination.page = 1;
  loadOrders();
  loadStatistics();
};

const resetFilters = () => {
  filters.status = '';
  filters.search = '';
  dateRange.value = [];
  pagination.page = 1;
  loadOrders();
  loadStatistics();
};

const viewDetail = (orderId: string) => {
  currentOrderId.value = orderId;
  detailDrawerVisible.value = true;
};

const confirmPayment = async (order: CustomRecipeOrderDetail) => {
  try {
    await ElMessageBox.confirm(`确认订单 ${order.orderId} 已付款？`, '确认付款');

    await customRecipeApi.confirmPayment(order.orderId);
    ElMessage.success('付款已确认');
    loadOrders();
    loadStatistics();
  } catch (error) {
    if (!isUserCancel(error)) {
      ElMessage.error(getApiErrorMessage(error, '确认付款失败'));
    }
  }
};

const startProcessing = async (order: CustomRecipeOrderDetail) => {
  try {
    await ElMessageBox.confirm(`开始制作订单 ${order.orderId}？`, '开始制作');

    await customRecipeApi.updateStatus(order.orderId, 'IN_PROGRESS');
    ElMessage.success('已开始制作');
    loadOrders();
    loadStatistics();
  } catch (error) {
    if (!isUserCancel(error)) {
      ElMessage.error(getApiErrorMessage(error, '开始制作失败'));
    }
  }
};

/** 列表行 -> 预计交付倒计时（超期高亮；已交付/已取消的不再标红） */
const getDeliveryInfo = (order: CustomRecipeOrderDetail) =>
  getEstimatedDeliveryInfo(order.estimatedDeliveryDate, order.status);

const viewRecipe = (recipeId: string) => {
  window.open(`/recipes/${recipeId}`, '_blank');
};

const formatDate = (date: string) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const formatDateTime = (date: string) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
</script>

<style scoped>
.custom-recipe-orders {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.credit-remaining {
  color: #b08d4f;
  font-weight: 600;
}

.page-header h1 {
  margin: 0;
  font-size: 28px;
  color: #333;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  cursor: default;
}

.stat-content {
  display: flex;
  align-items: center;
}

.stat-icon {
  font-size: 40px;
  margin-right: 15px;
}

.stat-icon.pending {
  filter: grayscale(0.2);
}

.stat-icon.progress {
  filter: grayscale(0.2);
}

.stat-icon.delivered {
  filter: grayscale(0.2);
}

.stat-icon.revenue {
  filter: grayscale(0.2);
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #333;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 14px;
  color: #999;
}

.filter-card {
  margin-bottom: 20px;
}

.filter-form {
  margin-bottom: 0;
}

.table-card {
  margin-bottom: 20px;
}

.pagination {
  margin-top: 20px;
  text-align: right;
}

/* 预计交付：超期的日期本身就要红，不能只靠一个小标签 */
.delivery-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.overdue-text {
  color: #f56c6c;
  font-weight: 600;
}

.countdown-text {
  font-size: 12px;
  color: #909399;
}
</style>

