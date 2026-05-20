<template>
  <div class="platform-config-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <div>
            <h3>支付配置</h3>
            <p>微信支付参数由后台保存，密钥不会明文回显。</p>
          </div>
          <el-tag :type="form.enabled ? 'success' : 'info'">
            {{ form.enabled ? '已启用' : '未启用' }}
          </el-tag>
        </div>
      </template>

      <el-alert
        title="先完成参数配置，后续再接入正式下单、回调验签、退款和对账。"
        type="warning"
        show-icon
        :closable="false"
        class="config-alert"
      />

      <section class="callback-guide">
        <div class="guide-header">
          <div>
            <h4>微信支付商户后台填写参考</h4>
            <p>这些地址来自当前线上后端域名，复制到微信支付商户平台对应位置即可。</p>
          </div>
          <el-button type="primary" plain @click="fillRecommendedCallbacks">
            填入推荐回调地址
          </el-button>
        </div>

        <div class="guide-grid">
          <div class="guide-item">
            <span class="guide-label">服务器公网 IP</span>
            <el-input :model-value="serverPublicIp" readonly>
              <template #append>
                <el-button @click="copyText(serverPublicIp)">复制</el-button>
              </template>
            </el-input>
          </div>
          <div class="guide-item">
            <span class="guide-label">后端 API 域名</span>
            <el-input :model-value="publicApiOrigin" readonly>
              <template #append>
                <el-button @click="copyText(publicApiOrigin)">复制</el-button>
              </template>
            </el-input>
          </div>
          <div class="guide-item guide-item-wide">
            <span class="guide-label">支付结果通知 URL</span>
            <el-input :model-value="recommendedNotifyUrl" readonly>
              <template #append>
                <el-button @click="copyText(recommendedNotifyUrl)">复制</el-button>
              </template>
            </el-input>
            <p class="field-help">
              微信支付商户平台 -> 产品中心/JSAPI 支付相关配置 -> 支付结果通知地址。
            </p>
          </div>
          <div class="guide-item guide-item-wide">
            <span class="guide-label">退款结果通知 URL</span>
            <el-input :model-value="recommendedRefundNotifyUrl" readonly>
              <template #append>
                <el-button @click="copyText(recommendedRefundNotifyUrl)">复制</el-button>
              </template>
            </el-input>
            <p class="field-help">
              微信支付商户平台 -> 交易中心/退款通知配置。没有单独退款通知入口时，可先填到本页退款回调字段。
            </p>
          </div>
        </div>

        <el-alert
          title="注意：微信支付只接受公网 HTTPS 回调。服务器 IP 用于安全白名单或排查，不要把 IP 当作回调 URL。"
          type="info"
          show-icon
          :closable="false"
        />
      </section>

      <el-form
        v-loading="loading"
        :model="form"
        label-width="150px"
        label-position="left"
        class="config-form"
        autocomplete="off"
      >
        <div class="autofill-trap" aria-hidden="true">
          <input type="text" name="payment-username-trap" autocomplete="username" tabindex="-1" />
          <input type="password" name="payment-password-trap" autocomplete="current-password" tabindex="-1" />
        </div>

        <el-divider content-position="left">支付开关</el-divider>

        <el-form-item label="启用线上支付">
          <el-switch v-model="form.enabled" />
          <div class="field-help">正式上线前保持关闭；灰度验证通过后再启用。</div>
        </el-form-item>

        <el-form-item label="支付服务商">
          <el-select v-model="form.provider" class="field-control">
            <el-option label="微信支付" value="WECHAT_PAY" />
          </el-select>
          <div class="field-help">当前只规划微信支付；后续需要支付宝时再扩展。</div>
        </el-form-item>

        <el-form-item label="运行模式">
          <el-segmented
            v-model="form.mode"
            :options="[
              { label: '沙箱/测试', value: 'SANDBOX' },
              { label: '生产', value: 'PRODUCTION' },
            ]"
          />
          <div class="field-help">测试期选沙箱/测试；正式收款前切换为生产。</div>
        </el-form-item>

        <el-divider content-position="left">商户基础参数</el-divider>

        <el-form-item label="小程序 AppID">
          <el-input
            v-model="form.appId"
            class="field-control"
            placeholder="wx..."
            clearable
            autocomplete="off"
            name="sevenkitchen-payment-appid"
          />
          <div class="field-help">
            获取位置：微信公众平台 -> 设置与开发 -> 基本配置 -> AppID。
          </div>
        </el-form-item>

        <el-form-item label="微信支付商户号">
          <el-input
            v-model="form.mchId"
            class="field-control"
            placeholder="例如 1900000000"
            clearable
            autocomplete="off"
            name="sevenkitchen-payment-mchid"
          />
          <div class="field-help">
            获取位置：微信支付商户平台 -> 账户中心 -> 商户信息 -> 商户号。
          </div>
        </el-form-item>

        <el-form-item label="商户证书序列号">
          <el-input
            v-model="form.merchantSerialNumber"
            class="field-control"
            placeholder="API 证书序列号"
            clearable
            autocomplete="off"
            name="sevenkitchen-payment-serial"
          />
          <div class="field-help">
            获取位置：微信支付商户平台 -> 账户中心 -> API 安全 -> API 证书。
          </div>
        </el-form-item>

        <el-divider content-position="left">服务端密钥</el-divider>

        <el-form-item label="APIv3 Key">
          <el-input
            v-model="secretForm.apiV3Key"
            class="field-control"
            type="password"
            show-password
            placeholder="留空表示不修改"
            autocomplete="new-password"
            name="sevenkitchen-payment-apiv3-key"
          />
          <div class="field-help">
            获取位置：微信支付商户平台 -> 账户中心 -> API 安全 -> APIv3 密钥。
            当前状态：{{ config?.apiV3KeyConfigured ? '已配置' : '未配置' }}。
          </div>
        </el-form-item>

        <el-form-item label="商户私钥 PEM">
          <el-input
            v-model="secretForm.privateKeyPem"
            class="field-control"
            type="textarea"
            :rows="7"
            placeholder="留空表示不修改。粘贴 apiclient_key.pem 文件内容。"
            autocomplete="off"
            name="sevenkitchen-payment-private-key"
          />
          <div class="field-help">
            获取位置：下载微信支付 API 证书后，本地证书目录中的 apiclient_key.pem。
            当前状态：{{ config?.privateKeyConfigured ? '已配置' : '未配置' }}。
          </div>
        </el-form-item>

        <el-divider content-position="left">回调与风控</el-divider>

        <el-form-item label="支付回调地址">
          <el-input
            v-model="form.notifyUrl"
            class="field-control"
            placeholder="https://你的域名/api/v1/payments/wechat/notify"
            clearable
            autocomplete="off"
            name="sevenkitchen-payment-notify-url"
          />
          <div class="field-help">填写后端公网 HTTPS 地址；微信支付成功后会通知这里。</div>
        </el-form-item>

        <el-form-item label="退款回调地址">
          <el-input
            v-model="form.refundNotifyUrl"
            class="field-control"
            placeholder="https://你的域名/api/v1/refunds/wechat/notify"
            clearable
            autocomplete="off"
            name="sevenkitchen-refund-notify-url"
          />
          <div class="field-help">填写后端公网 HTTPS 地址；微信退款结果会通知这里。</div>
        </el-form-item>

        <el-form-item label="未支付自动关闭">
          <div class="inline-control auto-close-control">
            <el-switch v-model="form.autoCloseUnpaid" />
            <span class="inline-label">下单后</span>
            <el-input-number
              v-model="form.paymentTimeoutMinutes"
              class="number-control"
              :min="5"
              :max="1440"
              :step="5"
              controls-position="right"
              :disabled="!form.autoCloseUnpaid"
            />
            <span class="unit">分钟</span>
          </div>
          <div class="field-help">
            后台运营策略字段：建议 30 分钟。开启后，未支付订单超过该时间会自动关闭；小程序订单页应显示同一时间的支付倒计时。
          </div>
        </el-form-item>

        <el-form-item label="允许线上退款">
          <el-switch v-model="form.allowRefund" />
          <div class="field-help">正式接入退款前保持关闭；开启后仍建议走财务审核。</div>
        </el-form-item>

        <el-form-item label="退款需财务审核">
          <el-switch v-model="form.requireRefundReview" />
          <div class="field-help">建议开启，客服只发起售后，财务确认后退款。</div>
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
  type PaymentConfig,
  type PaymentConfigUpdate,
} from '@/api/platformConfig';

const loading = ref(false);
const saving = ref(false);
const config = ref<PaymentConfig | null>(null);
const serverPublicIp = '1.14.3.2';
const publicApiOrigin = 'https://api.sevenkitchen.cloud';
const recommendedNotifyUrl = `${publicApiOrigin}/api/v1/payments/wechat/notify`;
const recommendedRefundNotifyUrl = `${publicApiOrigin}/api/v1/payments/wechat/refund-notify`;

const form = reactive({
  enabled: false,
  provider: 'WECHAT_PAY',
  mode: 'SANDBOX',
  appId: '',
  mchId: '',
  merchantSerialNumber: '',
  notifyUrl: '',
  refundNotifyUrl: '',
  paymentTimeoutMinutes: 30,
  autoCloseUnpaid: true,
  allowRefund: false,
  requireRefundReview: true,
});

const secretForm = reactive({
  apiV3Key: '',
  privateKeyPem: '',
});

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选中复制');
  }
};

const fillRecommendedCallbacks = () => {
  form.notifyUrl = recommendedNotifyUrl;
  form.refundNotifyUrl = recommendedRefundNotifyUrl;
  ElMessage.success('已填入推荐回调地址，保存后生效');
};

const applyConfig = (data: PaymentConfig) => {
  config.value = data;
  form.enabled = data.enabled;
  form.provider = data.provider;
  form.mode = data.mode;
  form.appId = data.appId || '';
  form.mchId = data.mchId || '';
  form.merchantSerialNumber = data.merchantSerialNumber || '';
  form.notifyUrl = data.notifyUrl || '';
  form.refundNotifyUrl = data.refundNotifyUrl || '';
  form.paymentTimeoutMinutes = data.paymentTimeoutMinutes;
  form.autoCloseUnpaid = data.autoCloseUnpaid;
  form.allowRefund = data.allowRefund;
  form.requireRefundReview = data.requireRefundReview;
  secretForm.apiV3Key = '';
  secretForm.privateKeyPem = '';
};

const loadConfig = async () => {
  loading.value = true;
  try {
    applyConfig(await platformConfigApi.getPayment());
  } catch (error: any) {
    ElMessage.error(error.message || '加载支付配置失败');
  } finally {
    loading.value = false;
  }
};

const saveConfig = async () => {
  saving.value = true;
  try {
    const payload: PaymentConfigUpdate = {
      ...form,
      appId: form.appId || null,
      mchId: form.mchId || null,
      merchantSerialNumber: form.merchantSerialNumber || null,
      notifyUrl: form.notifyUrl || null,
      refundNotifyUrl: form.refundNotifyUrl || null,
    };

    if (secretForm.apiV3Key.trim()) {
      payload.apiV3Key = secretForm.apiV3Key.trim();
    }
    if (secretForm.privateKeyPem.trim()) {
      payload.privateKeyPem = secretForm.privateKeyPem.trim();
    }

    applyConfig(await platformConfigApi.updatePayment(payload));
    ElMessage.success('支付配置已保存');
  } catch (error: any) {
    ElMessage.error(error.message || '保存支付配置失败');
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

.callback-guide {
  margin-bottom: 22px;
  padding: 16px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #f8fbff;
}

.guide-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.guide-header h4 {
  margin: 0 0 6px;
  color: #1f2937;
  font-size: 16px;
}

.guide-header p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
  line-height: 1.6;
}

.guide-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.guide-item {
  min-width: 0;
}

.guide-item-wide {
  grid-column: 1 / -1;
}

.guide-label {
  display: block;
  margin-bottom: 6px;
  color: #374151;
  font-size: 13px;
  font-weight: 600;
}

.config-form {
  max-width: 900px;
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

.auto-close-control {
  flex-wrap: wrap;
}

.number-control {
  width: 180px;
}

.unit {
  color: #6b7280;
}

.inline-label {
  color: #374151;
  white-space: nowrap;
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

  .guide-header {
    flex-direction: column;
  }

  .guide-grid {
    grid-template-columns: 1fr;
  }
}
</style>
