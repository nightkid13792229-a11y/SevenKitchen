<template>
  <div class="custom-recipe-orders">
    <div class="page-header">
      <h1>定制食谱订单</h1>
      <!-- 口径 2：改定制费/产能只允许管理员。菜单对所有登录者可见，
           所以入口不消失而是置灰并说明原因，客服才不会以为是系统坏了 -->
      <el-tooltip
        v-if="isAdmin"
        content="定制费 / 交付周期 / 接单上限"
        placement="bottom"
      >
        <el-button @click="goToConfig">食谱定制设置</el-button>
      </el-tooltip>
      <el-tooltip v-else :content="`${ADMIN_ONLY_TIP}：食谱定制设置`" placement="bottom">
        <span><el-button disabled>食谱定制设置</el-button></span>
      </el-tooltip>
    </div>

    <!--
      两档待办（2026-10-18 改）。

      原来是四张统计卡：待付款 / 制作中 / 已交付 / 收入。
      老板定了"只保留待交付 / 待售后"：

        · **待付款不是待办** —— 那是顾客没付，超时会自动关单；
          需要兜底时去下面的「状态」筛选里找
        · **收入是报表数字** —— 不属于"我今天要做什么"

      点卡片 = 直接筛到对应的队列，不让人再去下拉框里找一遍。
    -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="12">
        <el-card
          class="stat-card stat-card--todo"
          :class="{ 'stat-card--active': filters.status === 'IN_PROGRESS' }"
          @click="focusTodoQueue('IN_PROGRESS')"
        >
          <div class="stat-content">
            <div class="stat-icon progress">🔨</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.inProgress }}</div>
              <div class="stat-label">待交付</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card
          class="stat-card stat-card--todo stat-card--warn"
          :class="{ 'stat-card--active': filters.status === 'AFTERSALE' }"
          @click="focusTodoQueue('AFTERSALE')"
        >
          <div class="stat-content">
            <div class="stat-icon aftersale">🔧</div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.pendingAftersale }}</div>
              <div class="stat-label">待售后</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选器 -->
    <el-card class="filter-card">
      <el-form :inline="true" :model="filters" class="filter-form">
        <el-form-item label="状态">
          <!--
            状态选项来自**选项字典**（2026-10-16 批次 3.3）。
            此前这里是写死的六行 —— 后端加「已完成」时这里没跟上，
            而且加一档就要改前端。
          -->
          <el-select v-model="filters.status" placeholder="全部" clearable @change="loadOrders">
            <el-option label="全部" value=""></el-option>
            <el-option
              v-for="item in statusItems"
              :key="item.code"
              :label="item.label"
              :value="item.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <!-- 赠送单要能单独捞出来（2026-10-30）：按月看「送了几份」
               不能靠金额是 0 去猜，退款单也会是 0 -->
          <el-select v-model="filters.gift" placeholder="全部" @change="handleGiftFilterChange">
            <el-option label="全部" value=""></el-option>
            <el-option label="赠送单" value="true"></el-option>
            <el-option label="正常单" value="false"></el-option>
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
            <!-- 文案与色调都来自选项字典（后端下发） -->
            <el-tag :type="statusTone(row.status) || undefined">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">
            ¥{{ row.amount }}
            <el-tag v-if="row.isGift" type="success" size="small" effect="plain">
              赠送
            </el-tag>
            <div v-if="row.isGift" class="gift-reason">
              {{ getGiftReasonLabel(row.giftReason) }}
            </div>
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
            <!--
              按钮由**后端下发**（`renderable.actions`，2026-10-16 批次 5.6）。

              此前这里是写死的状态判断（`row.status === 'PENDING_PAYMENT'` /
              `'PAID'` / `'DELIVERED'`）。最直接的后果：
              **订单一变成「已完成」，「查看食谱」就消失了** ——
              顾客点完「确认收到」，老板反而看不到交付了哪份食谱。

              这与顾客端那个 bug、以及详情页那个 bug **是同一个成因**：
              判定散在前端，改一处漏一处。
            -->
            <el-button
              v-for="action in rowActions(row)"
              :key="action.code"
              link
              :type="actionButtonType(action)"
              @click="runRowAction(row, action)"
            >
              {{ action.label }}
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
  CUSTOM_RECIPE_GOAL_SET,
  CUSTOM_RECIPE_STATUS_SET,
  useOptionSet,
} from '@/composables/useOptionSet';
import { getEstimatedDeliveryInfo } from '@/utils/customRecipe';
import { getGiftReasonLabel } from '@/utils/assistedOrder';
import { toastApiError } from '@/utils/apiError';

const router = useRouter();

/**
 * 状态中文与色调来自**选项字典**（2026-10-16 批次 3.3）。
 *
 * 此前是本地那一份 `CUSTOM_RECIPE_STATUS_META` —— 后端加「已完成」时
 * 它没跟上，顾客确认收到后**老板在后台看到的是英文 `COMPLETED`**。
 * 这跟 2026-10-04 加「已取消」时漏了两处半是同一个毛病：
 * **只要中文还有第二份拷贝，就一定会再漏一次。**
 */
/**
 * ⚠️ **解构**出来，不要留成对象属性 ——
 * 模板里只有**顶层**的 ref 会自动解包，`statusOptions.items` 这种
 * 嵌套的不会；而项目守卫又明令模板里不许写 `.value`
 * （2026-10-14 老板报过"按钮点不动"，根因就是模板里写了 `.value`）。
 * 解构是同时满足这两条的唯一写法。
 */
const {
  items: statusItems,
  ensure: ensureStatusOptions,
  labelOf: statusLabel,
  toneOf: statusTone,
} = useOptionSet(CUSTOM_RECIPE_STATUS_SET);

/** 口径 2：只有管理员能改食谱定制设置，入口对客服置灰 */
const isAdmin = useIsAdmin();

/** 跳到独立的「食谱定制设置」页（定制费 / 交付周期 / 接单上限） */
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
  pendingAftersale: 0,
});

/**
 * 点待办卡 = 直接筛到那个队列（2026-10-18）。
 *
 * 再点一次取消筛选 —— 否则点了"待交付"之后，想回全部还得去下拉框里找。
 */
function focusTodoQueue(status: string) {
  filters.status = filters.status === status ? '' : status;
  pagination.page = 1;
  void loadOrders();
}

const filters = reactive({
  status: '',
  search: '',
  /** '' = 全部；'true' = 只看赠送单；'false' = 只看正常单 */
  gift: '',
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
  // 状态与目标的中文都来自选项字典：与订单列表并行加载，不阻塞列表
  ensureStatusOptions();
  ensureGoalOptions();
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
    if (filters.gift === 'true') params.isGift = true;
    if (filters.gift === 'false') params.isGift = false;
    if (dateRange.value && dateRange.value.length === 2) {
      params.dateFrom = dateRange.value[0];
      params.dateTo = dateRange.value[1];
    }

    const data = await customRecipeApi.listOrders(params);
    orders.value = data?.orders || [];
    pagination.total = data?.total || 0;
  } catch (error) {
    toastApiError(error, '加载订单列表失败', (message) => ElMessage.error(message));
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

const handleGiftFilterChange = () => {
  pagination.page = 1;
  loadOrders();
};

const resetFilters = () => {
  filters.status = '';
  filters.search = '';
  filters.gift = '';
  dateRange.value = [];
  pagination.page = 1;
  loadOrders();
  loadStatistics();
};

const viewDetail = (orderId: string) => {
  currentOrderId.value = orderId;
  detailDrawerVisible.value = true;
};

/**
 * 行内按钮（2026-10-16 批次 5.6）—— **由后端契约驱动**。
 *
 * ⚠️ 这里**不判断"这单该显示哪些按钮"**。那是业务判定，
 * 由后端 `renderable.actions` 下发；前端只做 code → 处理函数的映射。
 *
 * 老后端不返回契约时兜底成空的（只留"查看"）——
 * **不回退到写死的状态判断**，那正是这一批要修掉的东西。
 */
interface RowAction {
  code: string;
  label: string;
  enabled: boolean;
  disabledReason?: string | null;
  style?: string | null;
}

const rowActions = (row: CustomRecipeOrderDetail): RowAction[] => {
  const actions = (row as any).renderable?.actions;
  return Array.isArray(actions) ? (actions as RowAction[]) : [];
};

/** 后端的 style 是语义档位，映射成 Element 的 type 是纯呈现 */
const actionButtonType = (action: RowAction) => {
  switch (action.style) {
    case 'primary':
      return 'success';
    case 'danger':
      return 'danger';
    default:
      return 'primary';
  }
};

/** code → 处理函数。**这是前端唯一该做的事** */
const runRowAction = (row: CustomRecipeOrderDetail, action: RowAction) => {
  if (!action.enabled) {
    // 不能点时把原因说出来，而不是静默无反应
    if (action.disabledReason) ElMessage.info(action.disabledReason);
    return;
  }
  switch (action.code) {
    case 'CONFIRM_PAYMENT':
      void confirmPayment(row);
      return;
    case 'ACCEPT_ORDER':
      void startProcessing(row);
      return;
    case 'DELIVER':
    case 'DESIGN':
    case 'RESOLVE_AFTERSALE':
      /**
       * 这几个都要在详情页做 —— 列表里没有足够上下文。
       * 尤其「交付」：得先看到喂食量与采购清单才好确认交出去的是对的。
       */
      viewDetail(row.orderId);
      return;
    default:
      viewDetail(row.orderId);
  }
};

const confirmPayment = async (order: CustomRecipeOrderDetail) => {
  try {
    await ElMessageBox.confirm(`确认订单 ${order.orderId} 已付款？`, '确认付款');

    await customRecipeApi.confirmPayment(order.orderId);
    ElMessage.success('付款已确认');
    loadOrders();
    loadStatistics();
  } catch (error) {
    toastApiError(error, '确认付款失败', (message) => ElMessage.error(message));
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
    toastApiError(error, '开始制作失败', (message) => ElMessage.error(message));
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

/**
 * 定制目标的中文来自**选项字典**（2026-10-16 批次 5.1）。
 *
 * 此前是这里写死的一份 map，详情页与设计器侧栏各还有一份 ——
 * 三份共 12 处。后端加目标时改一处漏两处是必然的。
 */
const { ensure: ensureGoalOptions, labelOf: goalLabel } = useOptionSet(
  CUSTOM_RECIPE_GOAL_SET,
);

const getGoalText = (goal: string) => {
  if (!goal) return '';
  // 查不到时如实显示原始码 —— 后台是给自己人看的，看到原始码才知道"后端加了新目标"
  return goalLabel(goal) || goal;
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

/* 赠送单：金额旁边标原因，避免「¥0」被当成异常 */
.gift-reason {
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
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

/* ===== 两档待办卡（2026-10-18）===== */
.stat-card--todo {
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.stat-card--todo:hover {
  border-color: #c7d2fe;
}

.stat-card--active {
  border-color: #3b5bdb;
  box-shadow: 0 0 0 1px #3b5bdb inset;
}

.stat-card--warn .stat-icon.aftersale {
  background: #fee2e2;
  color: #991b1b;
}
</style>

