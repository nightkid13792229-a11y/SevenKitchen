<template>
  <div class="label-print-page">
    <div class="toolbar no-print">
      <div>
        <h2>分装标签</h2>
        <p class="page-desc">
          订单 <strong>{{ data?.orderNo || '—' }}</strong> ·
          共 <strong>{{ data?.labels.length || 0 }}</strong> 张标签。
          点「打印标签」后用浏览器打印，A4 标签纸每页 21 张（3 列 × 7 行，60×40mm）。
        </p>
      </div>
      <div class="toolbar-actions">
        <el-button @click="goBack">返回</el-button>
        <el-button type="primary" :disabled="!data" @click="handlePrint">
          打印标签
        </el-button>
      </div>
    </div>

    <el-alert
      v-if="errorMessage"
      class="no-print"
      type="error"
      :title="errorMessage"
      show-icon
      :closable="false"
    />

    <div v-loading="loading" class="label-sheet">
      <div v-for="label in data?.labels || []" :key="label.labelId" class="label-card">
        <div class="label-brand">{{ data?.brandName }}</div>
        <div class="label-name">{{ label.productName }}</div>
        <div class="label-amount">
          {{ label.amountText }}<!--
            -- 加量后同一补剂会有多袋，标出第几袋，分装时好核对有没有漏贴
          --><span v-if="label.bagTotal > 1" class="label-bag">
            {{ label.bagIndex }}/{{ label.bagTotal }}</span>
        </div>
        <div class="label-divider"></div>
        <div class="label-row">
          <span class="label-key">分装日期</span>
          <span class="label-value">{{ label.packedDate }}</span>
        </div>
        <div class="label-row">
          <span class="label-key">有效期至</span>
          <span class="label-value strong">{{ label.expiryDate }}</span>
        </div>
        <div v-if="label.batchNo" class="label-row">
          <span class="label-key">批号</span>
          <span class="label-value">{{ label.batchNo }}</span>
        </div>
        <div class="label-row">
          <span class="label-key">储存</span>
          <span class="label-value">{{ label.storageCondition }}</span>
        </div>
        <div v-if="label.sourceProduct" class="label-row">
          <span class="label-key">原品</span>
          <span class="label-value">{{ label.sourceProduct }}</span>
        </div>
        <div v-if="label.sourceExpiryDate" class="label-row">
          <span class="label-key">原瓶效期</span>
          <span class="label-value">{{ label.sourceExpiryDate }}</span>
        </div>
        <div class="label-row">
          <span class="label-key">订单</span>
          <span class="label-value">
            {{ data?.orderNo }}<template v-if="data?.receiverName"> / {{ data?.receiverName }}</template>
          </span>
        </div>
        <div class="label-disclaimer">{{ label.disclaimer }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { supplementOrderApi, type SupplementOrderLabels } from '@/api/supplementShop';

const route = useRoute();
const router = useRouter();

const loading = ref(false);
const data = ref<SupplementOrderLabels | null>(null);
const errorMessage = ref('');

async function load() {
  const orderId = String(route.params.id || '');
  if (!orderId) {
    errorMessage.value = '缺少订单 ID';
    return;
  }

  loading.value = true;
  try {
    data.value = await supplementOrderApi.labels(orderId);
  } catch (error: any) {
    errorMessage.value = error?.message || '标签数据加载失败';
  } finally {
    loading.value = false;
  }
}

function handlePrint() {
  if (!data.value || data.value.labels.length === 0) {
    ElMessage.warning('没有可打印的标签');
    return;
  }
  window.print();
}

function goBack() {
  // 从「订单管理 → 补剂订单」标签进来的，要退回那个标签页；
  // 否则用户会落到另一条菜单路径上，得自己重新找一遍订单。
  if (route.query.from === 'orders') {
    router.push({ path: '/orders', query: { tab: 'supplement' } });
    return;
  }
  router.push('/supplement-shop/orders');
}

onMounted(load);
</script>

<style scoped>
.label-print-page {
  padding: 20px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.toolbar h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.page-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: #909399;
  max-width: 720px;
}

.toolbar-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.label-sheet {
  display: flex;
  flex-wrap: wrap;
  gap: 6mm;
  padding: 4mm;
  background: #f5f6f8;
  border-radius: 8px;
  min-height: 120px;
}

/* 60mm × 40mm 单张标签，A4 每页 3 列 × 7 行 */
.label-card {
  width: 60mm;
  height: 40mm;
  box-sizing: border-box;
  padding: 2mm 2.5mm;
  background: #ffffff;
  border: 0.2mm dashed #c0c4cc;
  overflow: hidden;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #000000;
  display: flex;
  flex-direction: column;
}

.label-brand {
  font-size: 6pt;
  color: #606266;
  letter-spacing: 0.2pt;
}

.label-name {
  font-size: 11pt;
  font-weight: 700;
  line-height: 1.15;
  margin-top: 0.5mm;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label-amount {
  font-size: 13pt;
  font-weight: 700;
  line-height: 1.1;
  margin-top: 0.3mm;
}

/* 加量后标出第几袋 / 共几袋，字号收小以免抢走用量的视觉重心 */
.label-bag {
  margin-left: 1mm;
  font-size: 9pt;
  font-weight: 400;
}

.label-divider {
  height: 0.2mm;
  background: #000000;
  margin: 1mm 0 0.8mm;
}

.label-row {
  display: flex;
  font-size: 6.5pt;
  line-height: 1.35;
}

.label-key {
  width: 12mm;
  flex-shrink: 0;
  color: #303133;
}

.label-value {
  flex: 1;
  color: #000000;
  word-break: break-all;
}

.label-value.strong {
  font-weight: 700;
}

.label-disclaimer {
  margin-top: auto;
  font-size: 6pt;
  color: #303133;
  border-top: 0.2mm solid #dcdfe6;
  padding-top: 0.6mm;
}
</style>

<!-- 打印规则用非 scoped 样式，才能隐藏后台的侧边栏与操作按钮 -->
<style>
@media print {
  @page {
    size: A4;
    margin: 5mm;
  }

  body,
  html {
    background: #ffffff !important;
  }

  .no-print,
  .el-aside,
  .el-header,
  .el-menu,
  .el-breadcrumb {
    display: none !important;
  }

  .el-main {
    padding: 0 !important;
    overflow: visible !important;
  }

  .label-print-page {
    padding: 0 !important;
  }

  .label-sheet {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    padding: 0;
    background: transparent;
    border-radius: 0;
    min-height: 0;
  }

  .label-card {
    /* 60×40mm 精确尺寸，网格对齐 A4 标签纸 */
    width: 60mm;
    height: 40mm;
    border: none;
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
</style>
