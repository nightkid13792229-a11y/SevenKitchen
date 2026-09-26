<template>
  <div class="custom-recipe-config-page">
    <div class="page-header">
      <div>
        <h2>食谱定制设置</h2>
        <p class="page-desc">
          定制费与<strong>可抵扣金额</strong>是两个独立参数：顾客付多少钱、其中多少钱能抵成品货款，
          在这里分开配置，<strong>不用改代码</strong>。交付周期与每日接单上限也从这里调。
        </p>
      </div>
      <div class="header-actions">
        <el-button type="primary" :loading="saving" @click="handleSave">保存配置</el-button>
        <span v-if="saveError" class="save-error">{{ saveError }}</span>
      </div>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="snapshot-alert"
      title="改价只影响之后提交的订单"
      description="顾客提交定制单时，当时的定制费与可抵扣金额会快照进订单。已经提交或已付款的顾客，额度不会被后台调价改动。"
    />

    <el-card shadow="never" v-loading="loading">
      <el-form :model="form" label-width="200px">
        <el-divider content-position="left">价格</el-divider>

        <el-form-item label="定制费（元）">
          <el-input-number
            v-model="form.feeAmount"
            :min="0"
            :max="100000"
            :step="10"
            :precision="2"
            style="width: 200px"
            @change="handleFeeChange"
          />
          <span class="form-tip">顾客提交定制单时支付的金额</span>
        </el-form-item>

        <el-form-item label="可抵扣金额（元）">
          <el-input-number
            v-model="form.creditAmount"
            :min="0"
            :max="form.feeAmount"
            :step="10"
            :precision="2"
            style="width: 200px"
          />
          <span class="form-tip">
            定制费中可用于抵扣成品货款的额度，<strong>不得超过定制费</strong>。
            设为 0 表示定制费不抵货款；设为与定制费相同表示"定制免费"。
          </span>
        </el-form-item>

        <el-divider content-position="left">产能与交付</el-divider>

        <el-form-item label="交付周期（工作日）">
          <el-input-number
            v-model="form.deliveryWorkDays"
            :min="1"
            :max="60"
            :step="1"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">从预约日起算，遇公众假期自动顺延</span>
        </el-form-item>

        <el-form-item label="每日接单上限">
          <el-input-number
            v-model="form.dailyCapacity"
            :min="1"
            :max="200"
            :step="1"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">同一天约满后，顾客提交会提示"该日期已约满"</span>
        </el-form-item>

        <el-divider content-position="left">支付</el-divider>

        <el-form-item label="支付超时（分钟）">
          <el-input-number
            v-model="form.paymentTimeoutMinutes"
            :min="0"
            :max="1440"
            :step="5"
            :precision="0"
            style="width: 200px"
          />
          <span class="form-tip">
            超时未付款的定制订单会自动关闭，释放当天的排期名额；0 表示不自动关单
          </span>
        </el-form-item>
      </el-form>

      <div v-if="updatedAt" class="updated-at">上次更新时间：{{ updatedAt }}</div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/api';

const API_BASE = '/admin/custom-recipe';

const loading = ref(false);
const saving = ref(false);
const saveError = ref('');
const updatedAt = ref('');

const form = reactive({
  feeAmount: 300,
  creditAmount: 300,
  deliveryWorkDays: 3,
  dailyCapacity: 4,
  paymentTimeoutMinutes: 30,
});

/**
 * 定制费调低时，可抵扣金额必须跟着降下来 ——
 * 否则保存会被后端拒绝（抵扣不得超过定制费），
 * 用户只会看到"保存失败"，却不知道是哪个字段的问题。
 */
const handleFeeChange = (value: number | undefined) => {
  const fee = Number(value || 0);
  if (form.creditAmount > fee) {
    form.creditAmount = fee;
  }
};

const loadConfig = async () => {
  loading.value = true;
  saveError.value = '';
  try {
    const data: any = await api.get(`${API_BASE}/config`);
    form.feeAmount = Number(data?.feeAmount ?? 300);
    form.creditAmount = Number(data?.creditAmount ?? 300);
    form.deliveryWorkDays = Number(data?.deliveryWorkDays ?? 3);
    form.dailyCapacity = Number(data?.dailyCapacity ?? 4);
    form.paymentTimeoutMinutes = Number(data?.paymentTimeoutMinutes ?? 30);
    updatedAt.value = data?.updatedAt
      ? new Date(data.updatedAt).toLocaleString()
      : '';
  } catch (error) {
    saveError.value = '读取配置失败，请刷新重试';
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const handleSave = async () => {
  saveError.value = '';

  if (form.creditAmount > form.feeAmount) {
    saveError.value = '可抵扣金额不能超过定制费';
    return;
  }

  saving.value = true;
  try {
    const data: any = await api.put(`${API_BASE}/config`, { ...form });
    ElMessage.success('配置已保存，新提交的订单立即生效');
    updatedAt.value = data?.updatedAt
      ? new Date(data.updatedAt).toLocaleString()
      : '';
  } catch (error: any) {
    // 保存失败必须显式显示：否则用户只看到按钮转圈、值没变，以为是自己没点保存
    saveError.value = error?.message || '保存失败，请重试';
    ElMessage.error(saveError.value);
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  loadConfig();
});
</script>

<style scoped>
.custom-recipe-config-page {
  padding: 20px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.page-desc {
  margin: 0;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.7;
  color: #6b7280;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.save-error {
  font-size: 13px;
  color: #d92d20;
}

.snapshot-alert {
  margin-bottom: 16px;
}

.form-tip {
  margin-left: 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #909399;
}

.updated-at {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
}
</style>
