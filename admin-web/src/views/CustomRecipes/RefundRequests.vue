<template>
  <div class="refund-requests">
    <div class="page-header">
      <div>
        <h1>退款申请</h1>
        <p>已交付/制作中的订单需要人工审核；通过后会直接发起微信全额原路退款。</p>
      </div>
      <div class="header-actions">
        <el-switch
          v-model="includeHandled"
          active-text="含已处理"
          @change="load"
        />
        <el-button :loading="loading" @click="load">刷新</el-button>
      </div>
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="审核通过会立即发起微信退款，不能撤回。请先核对订单、原因和顾客说明。"
      class="tip"
    />

    <el-empty
      v-if="!loading && requests.length === 0"
      :description="includeHandled ? '还没有退款申请' : '没有待审核的退款申请'"
    />

    <el-table
      v-else
      :data="requests"
      v-loading="loading"
      stripe
      class="refund-table"
    >
      <el-table-column label="订单" min-width="210">
        <template #default="{ row }">
          <router-link
            class="order-link"
            :to="`/order-center?type=CUSTOM_RECIPE&orderId=${encodeURIComponent(row.orderId)}`"
          >
            {{ row.orderId }}
          </router-link>
          <div class="muted">{{ statusText(row.orderStatus) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="顾客 / 狗狗" min-width="150">
        <template #default="{ row }">
          <div>{{ row.customerName || '—' }}</div>
          <div class="muted">{{ row.customerPhone || '' }}</div>
          <div class="muted">🐕 {{ row.dogName || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="退款原因" min-width="230">
        <template #default="{ row }">
          <div class="reason">{{ row.reasonLabel }}</div>
          <div class="description">{{ row.description }}</div>
          <div v-if="row.photos?.length" class="photos">
            <el-image
              v-for="(photo, index) in row.photos"
              :key="index"
              :src="photo"
              :preview-src-list="row.photos"
              fit="cover"
              class="photo"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column label="申请退款" width="120" align="right">
        <template #default="{ row }">¥{{ formatAmount(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="150">
        <template #default="{ row }">
          <el-tag :type="tagType(row.status)">{{ row.statusLabel }}</el-tag>
          <div v-if="row.refundOutNo" class="muted refund-no">{{ row.refundOutNo }}</div>
        </template>
      </el-table-column>
      <el-table-column label="申请时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'PENDING' && isAdmin">
            <el-button size="small" type="primary" @click="openApprove(row)">
              通过并退款
            </el-button>
            <el-button size="small" @click="openReject(row)">驳回</el-button>
          </template>
          <span v-else-if="row.adminNote" class="muted note">{{ row.adminNote }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="approveVisible"
      title="通过退款申请"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="只支持全额退款，金额固定为订单实付；确认后立即调用微信原路退款，不能撤回。"
      />
      <el-alert
        v-if="activeRequest?.orderStatus === 'IN_PROGRESS'"
        type="success"
        :closable="false"
        show-icon
        title="制作中订单退款成功后，系统会自动停单并取消订单，无需再手工取消。"
        class="tip"
      />
      <div v-if="activeRequest" class="dialog-summary">
        <div><b>订单：</b>{{ activeRequest.orderId }}</div>
        <div><b>顾客：</b>{{ activeRequest.customerName || '—' }} / {{ activeRequest.dogName || '—' }}</div>
        <div><b>金额：</b>¥{{ formatAmount(activeRequest.amount) }}</div>
        <div><b>原因：</b>{{ activeRequest.reasonLabel }}</div>
        <div><b>说明：</b>{{ activeRequest.description }}</div>
      </div>
      <el-input
        v-model="approveNote"
        type="textarea"
        :rows="3"
        maxlength="300"
        show-word-limit
        placeholder="审核备注（选填，顾客可见）"
      />
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmApprove">
          确认并退款
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="rejectVisible"
      title="驳回退款申请"
      width="520px"
      :close-on-click-modal="false"
    >
      <p class="dialog-tip">驳回原因会展示给顾客，请写清楚为什么不能退。</p>
      <el-input
        v-model="rejectReason"
        type="textarea"
        :rows="4"
        maxlength="300"
        show-word-limit
        placeholder="请输入驳回原因"
      />
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="confirmReject">
          确认驳回
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  customRecipeApi,
  type AdminRefundRequest,
} from '@/api/customRecipe';
import { useIsAdmin } from '@/composables/useAdminRole';
import { getApiErrorMessage, toastApiError } from '@/utils/apiError';

const isAdmin = useIsAdmin();
const loading = ref(false);
const includeHandled = ref(false);
const requests = ref<AdminRefundRequest[]>([]);
const submitting = ref(false);

const approveVisible = ref(false);
const rejectVisible = ref(false);
const activeRequest = ref<AdminRefundRequest | null>(null);
const approveNote = ref('');
const rejectReason = ref('');

const load = async () => {
  loading.value = true;
  try {
    const data = await customRecipeApi.listRefundRequests(
      includeHandled.value ? undefined : { status: 'PENDING' },
    );
    requests.value = data?.items ?? [];
  } catch (error) {
    toastApiError(error, '加载退款申请失败', ElMessage);
  } finally {
    loading.value = false;
  }
};

const formatAmount = (value: number) => Number(value || 0).toFixed(2);
const formatTime = (value: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { hour12: false });
};

const statusText = (status: string | null) => {
  switch (status) {
    case 'PAID':
      return '已付款';
    case 'IN_PROGRESS':
      return '制作中';
    case 'DELIVERED':
      return '已交付';
    case 'COMPLETED':
      return '已完成';
    case 'CANCELLED':
      return '已取消';
    default:
      return status || '';
  }
};

const tagType = (status: string) => {
  switch (status) {
    case 'PENDING':
      return 'warning';
    case 'PROCESSING':
      return 'primary';
    case 'REFUNDED':
      return 'success';
    case 'REJECTED':
      return 'info';
    case 'FAILED':
      return 'danger';
    default:
      return 'info';
  }
};

const openApprove = (row: AdminRefundRequest) => {
  activeRequest.value = row;
  approveNote.value = '';
  approveVisible.value = true;
};

const openReject = (row: AdminRefundRequest) => {
  activeRequest.value = row;
  rejectReason.value = '';
  rejectVisible.value = true;
};

const confirmApprove = async () => {
  if (!activeRequest.value || submitting.value) return;
  submitting.value = true;
  try {
    await customRecipeApi.approveRefundRequest(activeRequest.value.id, {
      note: approveNote.value,
    });
    ElMessage.success('退款已发起');
    approveVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '退款失败，请稍后重试'));
  } finally {
    submitting.value = false;
  }
};

const confirmReject = async () => {
  if (!activeRequest.value || submitting.value) return;
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写驳回原因');
    return;
  }
  submitting.value = true;
  try {
    await customRecipeApi.rejectRefundRequest(activeRequest.value.id, {
      reason: rejectReason.value,
    });
    ElMessage.success('已驳回');
    rejectVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '驳回失败，请稍后重试'));
  } finally {
    submitting.value = false;
  }
};

onMounted(load);
</script>

<style scoped>
.refund-requests { padding: 20px; }
.page-header {
  display: flex; justify-content: space-between; gap: 20px; align-items: flex-start;
  margin-bottom: 16px;
}
.page-header h1 { margin: 0; font-size: 22px; }
.page-header p { margin: 6px 0 0; color: #8a7a63; font-size: 13px; }
.header-actions { display: flex; gap: 12px; align-items: center; }
.tip { margin-bottom: 14px; }
.refund-table { background: #fff; }
.order-link { color: #1e5b35; font-weight: 600; text-decoration: none; }
.muted { color: #8a7a63; font-size: 12px; margin-top: 4px; }
.reason { font-weight: 600; }
.description {
  margin-top: 4px; color: #5f5a4d; font-size: 12px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word;
}
.photos { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.photo { width: 42px; height: 42px; border-radius: 6px; }
.refund-no { font-size: 11px; }
.note { max-width: 180px; display: inline-block; }
.dialog-summary {
  margin: 14px 0; padding: 12px 14px; border-radius: 8px;
  background: #f7f8f2; color: #3c4a3d; font-size: 13px; line-height: 1.8;
}
.dialog-tip { margin: 0 0 12px; color: #8a7a63; font-size: 13px; }
</style>
