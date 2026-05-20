<template>
  <div class="platform-config-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <div>
            <h3>客服配置</h3>
            <p>配置微信客服与企业微信接待参数，用于订单卡片和客服会话关联。</p>
          </div>
          <el-tag :type="form.enabled ? 'success' : 'info'">
            {{ form.enabled ? '已启用' : '未启用' }}
          </el-tag>
        </div>
      </template>

      <el-alert
        title="建议使用微信客服并交给企业微信接待；本系统负责保存订单与会话的关联参数。"
        type="info"
        show-icon
        :closable="false"
        class="config-alert"
      />

      <el-form
        v-loading="loading"
        :model="form"
        label-width="170px"
        label-position="left"
        class="config-form"
        autocomplete="off"
      >
        <div class="autofill-trap" aria-hidden="true">
          <input type="text" name="customer-service-username-trap" autocomplete="username" tabindex="-1" />
          <input type="password" name="customer-service-password-trap" autocomplete="current-password" tabindex="-1" />
        </div>

        <el-divider content-position="left">客服入口</el-divider>

        <el-form-item label="启用客服能力">
          <el-switch v-model="form.enabled" />
          <div class="field-help">后台运营开关：正式接入微信客服前保持关闭，配置验证通过后再启用。</div>
        </el-form-item>

        <el-form-item label="客服承载方式">
          <el-select v-model="form.provider" class="field-control">
            <el-option label="微信客服 + 企业微信接待" value="WECHAT_CUSTOMER_SERVICE" />
            <el-option label="仅预留自建客服接口" value="CUSTOM" />
          </el-select>
          <div class="field-help">推荐第一项：客服人员在企业微信电脑端或手机端回复客户。</div>
        </el-form-item>

        <el-form-item label="企业 ID / CorpID">
          <el-input
            v-model="form.corpId"
            class="field-control"
            placeholder="ww..."
            clearable
            autocomplete="off"
            name="sevenkitchen-cs-corp-id"
          />
          <div class="field-help">
            获取位置：企业微信管理后台 -> 我的企业 -> 企业信息 -> 企业 ID。
          </div>
        </el-form-item>

        <el-form-item label="客服账号 open_kfid">
          <el-input
            v-model="form.openKfid"
            class="field-control"
            placeholder="例如 wkxxxxxxxx"
            clearable
            autocomplete="off"
            name="sevenkitchen-cs-open-kfid"
          />
          <div class="field-help">
            获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> 客服账号，或通过微信客服 API 查询。
          </div>
        </el-form-item>

        <el-form-item label="客服入口 URL">
          <el-input
            v-model="form.customerServiceUrl"
            class="field-control"
            placeholder="微信客服入口链接"
            clearable
            autocomplete="off"
            name="sevenkitchen-cs-url"
          />
          <div class="field-help">
            获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> 客服账号 -> 接入链接。
          </div>
        </el-form-item>

        <el-divider content-position="left">回调安全参数</el-divider>

        <el-form-item label="客服 Secret">
          <el-input
            v-model="secretForm.customerServiceSecret"
            class="field-control"
            type="password"
            show-password
            placeholder="留空表示不修改"
            autocomplete="new-password"
            name="sevenkitchen-cs-secret"
          />
          <div class="field-help">
            获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> API 接口配置。
            当前状态：{{ config?.customerServiceSecretConfigured ? '已配置' : '未配置' }}。
          </div>
        </el-form-item>

        <el-form-item label="回调 Token">
          <el-input
            v-model="secretForm.token"
            class="field-control"
            type="password"
            show-password
            placeholder="留空表示不修改"
            autocomplete="new-password"
            name="sevenkitchen-cs-token"
          />
          <div class="field-help">
            获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> 接收事件服务器配置。
            当前状态：{{ config?.tokenConfigured ? '已配置' : '未配置' }}。
          </div>
        </el-form-item>

        <el-form-item label="EncodingAESKey">
          <el-input
            v-model="secretForm.encodingAesKey"
            class="field-control"
            type="password"
            show-password
            placeholder="留空表示不修改"
            autocomplete="new-password"
            name="sevenkitchen-cs-aes-key"
          />
          <div class="field-help">
            获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> 接收事件服务器配置。
            当前状态：{{ config?.encodingAesKeyConfigured ? '已配置' : '未配置' }}。
          </div>
        </el-form-item>

        <el-divider content-position="left">订单卡片与分配规则</el-divider>

        <el-form-item label="订单卡片标题">
          <el-input
            v-model="form.orderCardTitleTemplate"
            class="field-control"
            placeholder="订单 {orderNo}"
            autocomplete="off"
            name="sevenkitchen-cs-card-title"
          />
          <div class="field-help">可用变量：{orderNo}、{customerName}、{dogName}。</div>
        </el-form-item>

        <el-form-item label="订单卡片路径">
          <el-input
            v-model="form.orderCardPathTemplate"
            class="field-control"
            placeholder="/pages/orders/detail?id={orderId}"
            autocomplete="off"
            name="sevenkitchen-cs-card-path"
          />
          <div class="field-help">小程序订单详情页路径；客服会话用这个参数关联订单。</div>
        </el-form-item>

        <el-form-item label="欢迎语">
          <el-input
            v-model="form.welcomeMessage"
            class="field-control"
            type="textarea"
            :rows="3"
            placeholder="您好，客服已收到您的咨询，请稍等。"
            autocomplete="off"
            name="sevenkitchen-cs-welcome"
          />
          <div class="field-help">后台自定义文案：由管理员填写，显示给进入客服会话的客户。</div>
        </el-form-item>

        <el-divider content-position="left">订单详情页展示文案</el-divider>

        <el-form-item label="配送说明">
          <el-input
            v-model="form.orderDetailDeliveryNote"
            class="field-control"
            type="textarea"
            :rows="3"
            placeholder="默认顺丰冷链/特快配送，制作完成急冻后发出。"
            autocomplete="off"
            name="sevenkitchen-order-delivery-note"
          />
          <div class="field-help">显示位置：小程序订单详情页 -> 商家说明 -> 配送说明。</div>
        </el-form-item>

        <el-form-item label="售后说明">
          <el-input
            v-model="form.orderDetailAftersaleNote"
            class="field-control"
            type="textarea"
            :rows="3"
            placeholder="如需退款、重做或反馈问题，可在订单详情页售后区域提交申请。"
            autocomplete="off"
            name="sevenkitchen-order-aftersale-note"
          />
          <div class="field-help">显示位置：小程序订单详情页 -> 商家说明 -> 售后说明。</div>
        </el-form-item>

        <el-form-item label="商家补充说明">
          <el-input
            v-model="form.orderDetailMerchantNote"
            class="field-control"
            type="textarea"
            :rows="3"
            placeholder="例如：现做鲜食会按排期制作，急单请先联系客服确认。"
            autocomplete="off"
            name="sevenkitchen-order-merchant-note"
          />
          <div class="field-help">选填；填写后会作为“商家补充”显示在订单详情页。</div>
        </el-form-item>

        <el-form-item label="自动分配客服">
          <el-switch v-model="form.autoAssignEnabled" />
          <div class="field-help">后续接入会话分配接口时使用。</div>
        </el-form-item>

        <el-form-item label="同客户优先原客服">
          <el-switch v-model="form.sameCustomerPriority" />
          <div class="field-help">客户重复咨询时优先分配给上一次接待人员。</div>
        </el-form-item>

        <el-form-item label="客服响应超时">
          <div class="inline-control">
            <el-input-number
              v-model="form.serviceTimeoutMinutes"
              class="number-control"
              :min="1"
              :max="1440"
              :step="1"
              controls-position="right"
            />
            <span class="unit">分钟</span>
          </div>
          <div class="field-help">超过该时间未响应，后续可提醒主管或重新分配。</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveConfig">
            保存配置
          </el-button>
          <el-button @click="loadConfig">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  platformConfigApi,
  type CustomerServiceConfig,
  type CustomerServiceConfigUpdate,
} from '@/api/platformConfig';

const loading = ref(false);
const saving = ref(false);
const config = ref<CustomerServiceConfig | null>(null);

const form = reactive({
  enabled: false,
  provider: 'WECHAT_CUSTOMER_SERVICE',
  corpId: '',
  openKfid: '',
  customerServiceUrl: '',
  orderCardTitleTemplate: '订单 {orderNo}',
  orderCardPathTemplate: '/pages/order-detail/index?id={orderId}',
  welcomeMessage: '',
  orderDetailDeliveryNote: '',
  orderDetailAftersaleNote: '',
  orderDetailMerchantNote: '',
  autoAssignEnabled: true,
  sameCustomerPriority: true,
  serviceTimeoutMinutes: 10,
});

const secretForm = reactive({
  customerServiceSecret: '',
  token: '',
  encodingAesKey: '',
});

const applyConfig = (data: CustomerServiceConfig) => {
  config.value = data;
  form.enabled = data.enabled;
  form.provider = data.provider;
  form.corpId = data.corpId || '';
  form.openKfid = data.openKfid || '';
  form.customerServiceUrl = data.customerServiceUrl || '';
  form.orderCardTitleTemplate = data.orderCardTitleTemplate;
  form.orderCardPathTemplate = data.orderCardPathTemplate;
  form.welcomeMessage = data.welcomeMessage || '';
  form.orderDetailDeliveryNote = data.orderDetailDeliveryNote || '';
  form.orderDetailAftersaleNote = data.orderDetailAftersaleNote || '';
  form.orderDetailMerchantNote = data.orderDetailMerchantNote || '';
  form.autoAssignEnabled = data.autoAssignEnabled;
  form.sameCustomerPriority = data.sameCustomerPriority;
  form.serviceTimeoutMinutes = data.serviceTimeoutMinutes;
  secretForm.customerServiceSecret = '';
  secretForm.token = '';
  secretForm.encodingAesKey = '';
};

const loadConfig = async () => {
  loading.value = true;
  try {
    applyConfig(await platformConfigApi.getCustomerService());
  } catch (error: any) {
    ElMessage.error(error.message || '加载客服配置失败');
  } finally {
    loading.value = false;
  }
};

const saveConfig = async () => {
  saving.value = true;
  try {
    const payload: CustomerServiceConfigUpdate = {
      ...form,
      corpId: form.corpId || null,
      openKfid: form.openKfid || null,
      customerServiceUrl: form.customerServiceUrl || null,
      welcomeMessage: form.welcomeMessage || null,
      orderDetailDeliveryNote: form.orderDetailDeliveryNote || null,
      orderDetailAftersaleNote: form.orderDetailAftersaleNote || null,
      orderDetailMerchantNote: form.orderDetailMerchantNote || null,
    };

    if (secretForm.customerServiceSecret.trim()) {
      payload.customerServiceSecret = secretForm.customerServiceSecret.trim();
    }
    if (secretForm.token.trim()) {
      payload.token = secretForm.token.trim();
    }
    if (secretForm.encodingAesKey.trim()) {
      payload.encodingAesKey = secretForm.encodingAesKey.trim();
    }

    applyConfig(await platformConfigApi.updateCustomerService(payload));
    ElMessage.success('客服配置已保存');
  } catch (error: any) {
    ElMessage.error(error.message || '保存客服配置失败');
  } finally {
    saving.value = false;
  }
};

onMounted(loadConfig);
</script>

<style scoped>
.platform-config-page {
  max-width: 1080px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.card-header h3 {
  margin: 0 0 6px;
  font-size: 18px;
}

.card-header p,
.field-help {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.config-alert {
  margin-bottom: 20px;
}

.config-form {
  max-width: 920px;
}

.config-form :deep(.el-form-item__content) {
  align-items: flex-start;
}

.field-control {
  width: 620px;
  max-width: 100%;
}

.field-help {
  flex: 0 0 100%;
  margin-top: 6px;
}

.inline-control {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.number-control {
  width: 180px;
}

.unit {
  color: #6b7280;
}

.autofill-trap {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

@media (max-width: 768px) {
  .platform-config-page {
    max-width: none;
  }

  .config-form {
    max-width: none;
  }

  .field-control,
  .number-control {
    width: 100%;
  }

  .inline-control {
    width: 100%;
  }
}
</style>
