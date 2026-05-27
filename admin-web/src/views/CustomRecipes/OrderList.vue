<template>
  <div class="custom-recipe-orders">
    <div class="page-header">
      <h1>定制食谱订单</h1>
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
              <div class="stat-label">本月收入</div>
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
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="80">
          <template #default="{ row }">
            ¥{{ row.amount }}
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
import { ElMessage, ElMessageBox } from 'element-plus';
import { legacyApi } from '@/api';

const API_BASE = '/admin/custom-recipe';

// 状态
const loading = ref(false);
const orders = ref<any[]>([]);
const statistics = ref({
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

    const data: any = await legacyApi.get(`${API_BASE}/orders`, { params });
    orders.value = data.orders || [];
    pagination.total = data.total || 0;
  } catch (error) {
    ElMessage.error('加载订单失败');
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

    statistics.value = await legacyApi.get(`${API_BASE}/statistics`, { params });
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

const confirmPayment = async (order: any) => {
  try {
    await ElMessageBox.confirm(`确认订单 ${order.orderId} 已付款？`, '确认付款');

    await legacyApi.patch(`${API_BASE}/orders/${order.orderId}/confirm-payment`);
    ElMessage.success('付款已确认');
    loadOrders();
    loadStatistics();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败');
    }
  }
};

const startProcessing = async (order: any) => {
  try {
    await ElMessageBox.confirm(`开始制作订单 ${order.orderId}？`, '开始制作');

    await legacyApi.patch(
      `${API_BASE}/orders/${order.orderId}/status`,
      { status: 'IN_PROGRESS' },
    );
    ElMessage.success('已开始制作');
    loadOrders();
    loadStatistics();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('操作失败');
    }
  }
};

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
.custom-recipe-orders {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
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
</style>

<script lang="ts">
import OrderDetail from './OrderDetail.vue';

export default {
  components: {
    OrderDetail,
  },
};
</script>
