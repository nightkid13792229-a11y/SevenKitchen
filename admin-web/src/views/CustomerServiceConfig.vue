<template>
  <div class="platform-config-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <div>
            <h3>客服配置</h3>
            <p>配置微信客服、企业微信接待、订单卡片和小程序悬浮客服入口。</p>
          </div>
          <el-tag :type="form.enabled ? 'success' : 'info'">
            {{ form.enabled ? '已启用' : '未启用' }}
          </el-tag>
        </div>
      </template>

      <el-alert
        title="建议使用微信客服 + 企业微信接待。客服人员在企业微信回复客户，SevenKitchen 后台负责订单、售后、退款和差价处理。"
        type="info"
        show-icon
        :closable="false"
        class="config-alert"
      />
      <el-alert
        v-if="form.enabled && !customerServiceReady"
        :title="`客服还不能上线：${missingRequiredLabels.join('、') || '配置未完整'}`"
        type="warning"
        show-icon
        :closable="false"
        class="config-alert"
      />
      <el-alert
        v-else-if="form.enabled"
        title="客服参数已填写完整。部署后请到企业微信后台验证回调 URL，并用真实小程序发起一次咨询。"
        type="success"
        show-icon
        :closable="false"
        class="config-alert"
      />

      <el-form
        v-loading="loading"
        :model="form"
        label-width="180px"
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
          <div class="field-help">启用后，新版小程序会使用微信客服原生入口；关闭时只显示未启用提示或备用客服链接。</div>
        </el-form-item>

        <el-form-item label="客服承载方式">
          <el-select v-model="form.provider" class="field-control">
            <el-option label="微信客服 + 企业微信接待" value="WECHAT_CUSTOMER_SERVICE" />
            <el-option label="自建客服接口预留" value="CUSTOM" />
          </el-select>
          <div class="field-help">推荐第一项：客户在小程序发起咨询，客服人员在企业微信电脑端或手机端回复。</div>
        </el-form-item>

        <el-form-item label="企业 ID / CorpID">
          <el-input v-model="form.corpId" class="field-control" placeholder="ww..." clearable autocomplete="off" />
          <div class="field-help">获取位置：企业微信管理后台 -> 我的企业 -> 企业信息 -> 企业 ID。</div>
        </el-form-item>

        <el-form-item label="客服账号 open_kfid">
          <el-input v-model="form.openKfid" class="field-control" placeholder="例如 wkxxxxxxxx" clearable autocomplete="off" />
          <div class="field-help">获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> 客服账号，也可通过微信客服 API 查询。</div>
        </el-form-item>

        <el-form-item label="客服入口 URL">
          <el-input v-model="form.customerServiceUrl" class="field-control" placeholder="微信客服接入链接，备用入口" clearable autocomplete="off" />
          <div class="field-help">获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> 客服账号 -> 接入链接。微信原生客服正常时，小程序优先使用 open-type=contact。</div>
        </el-form-item>

        <el-form-item label="回调 URL">
          <div class="field-row">
            <el-input class="field-control" :model-value="recommendedCallbackUrl" readonly />
            <el-button @click="copyCallbackUrl">复制</el-button>
          </div>
          <div class="field-help">第二阶段回调接口上线后，将这个地址复制到企业微信微信客服的接收事件服务器配置中。</div>
        </el-form-item>

        <el-form-item label="上线检查">
          <div class="checklist">
            <el-tag
              v-for="item in readinessItems"
              :key="item.key"
              :type="item.ready ? 'success' : 'warning'"
              effect="plain"
            >
              {{ item.ready ? '已填' : '缺少' }}：{{ item.label }}
            </el-tag>
          </div>
          <div class="field-help">全部显示“已填”后，客服代码侧才算可以进入真实联调。</div>
        </el-form-item>

        <el-divider content-position="left">回调安全参数</el-divider>

        <el-form-item label="客服 Secret">
          <el-input v-model="secretForm.customerServiceSecret" class="field-control" type="password" show-password placeholder="留空表示不修改" autocomplete="new-password" />
          <div class="field-help">获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> API 接口配置。当前状态：{{ config?.customerServiceSecretConfigured ? '已配置' : '未配置' }}。</div>
        </el-form-item>

        <el-form-item label="回调 Token">
          <el-input v-model="secretForm.token" class="field-control" type="password" show-password placeholder="留空表示不修改" autocomplete="new-password" />
          <div class="field-help">获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> 接收事件服务器配置。当前状态：{{ config?.tokenConfigured ? '已配置' : '未配置' }}。</div>
        </el-form-item>

        <el-form-item label="EncodingAESKey">
          <el-input v-model="secretForm.encodingAesKey" class="field-control" type="password" show-password placeholder="留空表示不修改" autocomplete="new-password" />
          <div class="field-help">获取位置：企业微信管理后台 -> 应用管理 -> 微信客服 -> 接收事件服务器配置。当前状态：{{ config?.encodingAesKeyConfigured ? '已配置' : '未配置' }}。</div>
        </el-form-item>

        <el-divider content-position="left">小程序卡片</el-divider>

        <el-form-item label="订单卡片标题">
          <el-input v-model="form.orderCardTitleTemplate" class="field-control" placeholder="订单 {orderNo}" autocomplete="off" />
          <div class="field-help">客户从订单详情联系客服时使用。可用变量：{orderNo}、{orderId}。</div>
        </el-form-item>

        <el-form-item label="订单卡片路径">
          <el-input v-model="form.orderCardPathTemplate" class="field-control" placeholder="/pages/order-detail/index?id={orderId}" autocomplete="off" />
          <div class="field-help">必须是新版小程序订单详情路径。用于让客服识别客户咨询的是哪一单。</div>
        </el-form-item>

        <el-form-item label="商品卡片标题">
          <el-input v-model="form.productCardTitleTemplate" class="field-control" placeholder="咨询商品 {productName}" autocomplete="off" />
          <div class="field-help">客户从食谱/商品详情联系客服时使用。可用变量：{productName}、{productId}。</div>
        </el-form-item>

        <el-form-item label="商品卡片路径">
          <el-input v-model="form.productCardPathTemplate" class="field-control" placeholder="/pages/recipe-detail/index?recipeId={productId}" autocomplete="off" />
          <div class="field-help">用于商品咨询，客服可通过小程序卡片回到对应商品详情。</div>
        </el-form-item>

        <el-form-item label="普通咨询标题">
          <el-input v-model="form.defaultCardTitleTemplate" class="field-control" placeholder="SevenKitchen 客服咨询" autocomplete="off" />
          <div class="field-help">客户从非订单、非商品页面联系客服时使用。</div>
        </el-form-item>

        <el-form-item label="普通咨询路径">
          <el-input v-model="form.defaultCardPathTemplate" class="field-control" placeholder="/pages/home/index" autocomplete="off" />
          <div class="field-help">普通咨询默认打开的小程序页面。</div>
        </el-form-item>

        <el-divider content-position="left">悬浮按钮</el-divider>

        <el-form-item label="启用悬浮按钮">
          <el-switch v-model="form.floatingButtonEnabled" />
          <div class="field-help">启用后，新版小程序已接入页面会显示悬浮客服按钮。订单页带订单信息，商品页带商品信息。</div>
        </el-form-item>

        <el-form-item label="按钮文字">
          <el-input v-model="form.floatingButtonText" class="field-control short" maxlength="6" show-word-limit placeholder="客服" />
          <div class="field-help">显示在悬浮按钮下方，建议 2 到 4 个字。</div>
        </el-form-item>

        <el-form-item label="按钮图片 URL（可手填）">
          <el-input v-model="form.floatingButtonIconUrl" class="field-control" placeholder="https://.../customer-service.png" clearable />
          <div class="field-help">可直接粘贴图片链接；更推荐使用下方上传入口，上传后会自动保存。未填写时使用默认 CS 标记。</div>
        </el-form-item>

        <el-form-item label="客服按钮图片上传">
          <div class="icon-upload-panel">
            <div v-if="form.floatingButtonIconUrl" class="icon-preview-card">
              <el-image
                class="icon-preview-image"
                :src="form.floatingButtonIconUrl"
                fit="cover"
                :preview-src-list="[form.floatingButtonIconUrl]"
              />
              <div class="icon-preview-meta">
                <div class="icon-preview-title">当前客服按钮图片</div>
                <div class="icon-url-text">{{ form.floatingButtonIconUrl }}</div>
                <div class="icon-preview-actions">
                  <el-button type="primary" :loading="iconUploading" @click="openCustomerServiceIconPicker">
                    重新上传
                  </el-button>
                  <el-button :disabled="iconUploading" @click="clearCustomerServiceIcon">
                    清除图片
                  </el-button>
                </div>
              </div>
            </div>
            <div v-else class="icon-empty-card">
              <div class="icon-empty-symbol">CS</div>
              <div>
                <div class="icon-preview-title">未上传图片时，小程序显示默认客服文字按钮</div>
                <el-button type="primary" :loading="iconUploading" @click="openCustomerServiceIconPicker">
                  上传图片
                </el-button>
              </div>
            </div>
            <input
              ref="customerServiceIconInput"
              class="hidden-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              @change="handleCustomerServiceIconSelected"
            />
          </div>
          <div class="field-help">
            建议上传正方形透明 PNG，推荐 96×96 或 128×128 px；最大 1MB。也支持 JPG、WebP。上传成功后会自动保存到客服配置。
          </div>
        </el-form-item>

        <el-form-item label="按钮大小">
          <div class="inline-control">
            <el-input-number v-model="form.floatingButtonSize" :min="44" :max="88" :step="2" controls-position="right" />
            <span class="unit">px</span>
          </div>
          <div class="field-help">控制悬浮按钮直径，建议 52 到 64。</div>
        </el-form-item>

        <el-form-item label="按钮位置">
          <el-select v-model="form.floatingButtonPosition" class="field-control short">
            <el-option label="右下角" value="RIGHT_BOTTOM" />
            <el-option label="左下角" value="LEFT_BOTTOM" />
          </el-select>
          <div class="field-help">默认右下角，避免遮挡底部主要支付/下单按钮时可切换到左下角。</div>
        </el-form-item>

        <el-form-item label="底部距离">
          <div class="inline-control">
            <el-input-number v-model="form.floatingButtonBottom" :min="0" :max="360" :step="4" controls-position="right" />
            <span class="unit">px</span>
          </div>
          <div class="field-help">距离屏幕底部的像素。订单页底部有操作栏，建议保持 120 以上。</div>
        </el-form-item>

        <el-form-item label="侧边距离">
          <div class="inline-control">
            <el-input-number v-model="form.floatingButtonRight" :min="0" :max="120" :step="2" controls-position="right" />
            <span class="unit">px</span>
          </div>
          <div class="field-help">距离左侧或右侧的像素，取决于按钮位置。</div>
        </el-form-item>

        <el-form-item label="按钮风格">
          <el-select v-model="form.floatingButtonStyle" class="field-control short">
            <el-option label="浅色" value="LIGHT" />
            <el-option label="深色" value="DARK" />
          </el-select>
          <div class="field-help">浅色更适合商城页面，深色用于图片背景较复杂的页面。</div>
        </el-form-item>

        <el-divider content-position="left">订单详情展示文案</el-divider>

        <el-form-item label="欢迎语/客服提示">
          <el-input v-model="form.welcomeMessage" class="field-control" type="textarea" :rows="3" placeholder="您好，客服已收到您的咨询，请稍等。" />
          <div class="field-help">显示在新版小程序订单详情页的客服提示区域。</div>
        </el-form-item>

        <el-form-item label="配送说明">
          <el-input v-model="form.orderDetailDeliveryNote" class="field-control" type="textarea" :rows="3" placeholder="默认顺丰冷链/特快配送，制作完成急冻后发出。" />
          <div class="field-help">显示位置：新版小程序订单详情 -> 商家说明 -> 配送说明。</div>
        </el-form-item>

        <el-form-item label="售后说明">
          <el-input v-model="form.orderDetailAftersaleNote" class="field-control" type="textarea" :rows="3" placeholder="如需退款、重做或反馈问题，可在订单详情页售后区域提交申请。" />
          <div class="field-help">显示位置：新版小程序订单详情 -> 商家说明 -> 售后说明。</div>
        </el-form-item>

        <el-form-item label="商家补充说明">
          <el-input v-model="form.orderDetailMerchantNote" class="field-control" type="textarea" :rows="3" placeholder="例如：现做鲜食会按排期制作，急单请先联系客服确认。" />
          <div class="field-help">选填。填写后显示在订单详情页。</div>
        </el-form-item>

        <el-divider content-position="left">后续分配策略</el-divider>

        <el-form-item label="自动分配客服">
          <el-switch v-model="form.autoAssignEnabled" />
          <div class="field-help">预留配置。真正分配逻辑将在客服回调和会话工作台阶段实现。</div>
        </el-form-item>

        <el-form-item label="同客户优先原客服">
          <el-switch v-model="form.sameCustomerPriority" />
          <div class="field-help">预留配置。客户重复咨询时优先提示原接待人。</div>
        </el-form-item>

        <el-form-item label="客服响应超时">
          <div class="inline-control">
            <el-input-number v-model="form.serviceTimeoutMinutes" :min="1" :max="1440" :step="1" controls-position="right" />
            <span class="unit">分钟</span>
          </div>
          <div class="field-help">预留配置。超过该时间未处理时，后续可在客服工作台显示超时标记。</div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveConfig">保存配置</el-button>
          <el-button @click="loadConfig">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  platformConfigApi,
  type CustomerServiceConfig,
  type CustomerServiceConfigUpdate,
} from '@/api/platformConfig';

const loading = ref(false);
const saving = ref(false);
const iconUploading = ref(false);
const config = ref<CustomerServiceConfig | null>(null);
const customerServiceIconInput = ref<HTMLInputElement | null>(null);

const form = reactive({
  enabled: false,
  provider: 'WECHAT_CUSTOMER_SERVICE',
  corpId: '',
  openKfid: '',
  customerServiceUrl: '',
  orderCardTitleTemplate: '订单 {orderNo}',
  orderCardPathTemplate: '/pages/order-detail/index?id={orderId}',
  productCardTitleTemplate: '咨询商品 {productName}',
  productCardPathTemplate: '/pages/recipe-detail/index?recipeId={productId}',
  defaultCardTitleTemplate: 'SevenKitchen 客服咨询',
  defaultCardPathTemplate: '/pages/home/index',
  welcomeMessage: '',
  orderDetailDeliveryNote: '',
  orderDetailAftersaleNote: '',
  orderDetailMerchantNote: '',
  floatingButtonEnabled: true,
  floatingButtonText: '客服',
  floatingButtonIconUrl: '',
  floatingButtonSize: 56,
  floatingButtonPosition: 'RIGHT_BOTTOM',
  floatingButtonBottom: 128,
  floatingButtonRight: 18,
  floatingButtonStyle: 'LIGHT',
  autoAssignEnabled: true,
  sameCustomerPriority: true,
  serviceTimeoutMinutes: 10,
});

const secretForm = reactive({
  customerServiceSecret: '',
  token: '',
  encodingAesKey: '',
});

const recommendedCallbackUrl = computed(() => {
  return `${window.location.origin}/api/v1/customer-service/wechat/callback`;
});

const readinessItems = computed(() => [
  {
    key: 'corpId',
    label: '企业 ID / CorpID',
    ready: Boolean(form.corpId.trim()),
  },
  {
    key: 'openKfid',
    label: '客服账号 open_kfid',
    ready: Boolean(form.openKfid.trim()),
  },
  {
    key: 'customerServiceUrl',
    label: '客服入口 URL',
    ready: Boolean(form.customerServiceUrl.trim()),
  },
]);

const missingRequiredLabels = computed(() =>
  readinessItems.value.filter((item) => !item.ready).map((item) => item.label),
);

const customerServiceReady = computed(() =>
  readinessItems.value.every((item) => item.ready),
);

const applyConfig = (data: CustomerServiceConfig) => {
  config.value = data;
  form.enabled = data.enabled;
  form.provider = data.provider;
  form.corpId = data.corpId || '';
  form.openKfid = data.openKfid || '';
  form.customerServiceUrl = data.customerServiceUrl || '';
  form.orderCardTitleTemplate = data.orderCardTitleTemplate || '订单 {orderNo}';
  form.orderCardPathTemplate = data.orderCardPathTemplate || '/pages/order-detail/index?id={orderId}';
  form.productCardTitleTemplate = data.productCardTitleTemplate || '咨询商品 {productName}';
  form.productCardPathTemplate = data.productCardPathTemplate || '/pages/recipe-detail/index?recipeId={productId}';
  form.defaultCardTitleTemplate = data.defaultCardTitleTemplate || 'SevenKitchen 客服咨询';
  form.defaultCardPathTemplate = data.defaultCardPathTemplate || '/pages/home/index';
  form.welcomeMessage = data.welcomeMessage || '';
  form.orderDetailDeliveryNote = data.orderDetailDeliveryNote || '';
  form.orderDetailAftersaleNote = data.orderDetailAftersaleNote || '';
  form.orderDetailMerchantNote = data.orderDetailMerchantNote || '';
  form.floatingButtonEnabled = data.floatingButtonEnabled;
  form.floatingButtonText = data.floatingButtonText || '客服';
  form.floatingButtonIconUrl = data.floatingButtonIconUrl || '';
  form.floatingButtonSize = data.floatingButtonSize || 56;
  form.floatingButtonPosition = data.floatingButtonPosition || 'RIGHT_BOTTOM';
  form.floatingButtonBottom = data.floatingButtonBottom ?? 128;
  form.floatingButtonRight = data.floatingButtonRight ?? 18;
  form.floatingButtonStyle = data.floatingButtonStyle || 'LIGHT';
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
      floatingButtonIconUrl: form.floatingButtonIconUrl || null,
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
    ElMessage.success(
      customerServiceReady.value
        ? '客服配置已保存，参数已完整'
        : '客服配置已保存，请继续补齐上线检查项',
    );
  } catch (error: any) {
    ElMessage.error(error.message || '保存客服配置失败');
  } finally {
    saving.value = false;
  }
};

const validateCustomerServiceIcon = (file: File) => {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    ElMessage.error('仅支持 PNG、JPG、WebP 格式图片');
    return false;
  }

  if (file.size > 1 * 1024 * 1024) {
    ElMessage.error('客服按钮图片不能超过 1MB');
    return false;
  }

  return true;
};

const openCustomerServiceIconPicker = () => {
  customerServiceIconInput.value?.click();
};

const handleCustomerServiceIconSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !validateCustomerServiceIcon(file)) return;

  iconUploading.value = true;
  try {
    const result = await platformConfigApi.uploadCustomerServiceIcon(file);
    form.floatingButtonIconUrl = result.url;
    applyConfig(
      await platformConfigApi.updateCustomerService({
        floatingButtonIconUrl: result.url,
      }),
    );
    ElMessage.success('客服按钮图片已上传并保存');
  } catch (error: any) {
    ElMessage.error(error.message || '客服按钮图片上传失败');
  } finally {
    iconUploading.value = false;
  }
};

const clearCustomerServiceIcon = async () => {
  try {
    await ElMessageBox.confirm(
      '清除后小程序将显示默认客服文字按钮，确定继续吗？',
      '清除客服按钮图片',
      {
        confirmButtonText: '清除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  iconUploading.value = true;
  try {
    form.floatingButtonIconUrl = '';
    applyConfig(
      await platformConfigApi.updateCustomerService({
        floatingButtonIconUrl: null,
      }),
    );
    ElMessage.success('客服按钮图片已清除');
  } catch (error: any) {
    ElMessage.error(error.message || '清除客服按钮图片失败');
  } finally {
    iconUploading.value = false;
  }
};

const copyCallbackUrl = async () => {
  try {
    await navigator.clipboard.writeText(recommendedCallbackUrl.value);
    ElMessage.success('回调 URL 已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选中回调 URL');
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

.field-control.short {
  width: 260px;
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

.field-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
}

.checklist {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
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

.icon-upload-panel {
  width: 620px;
  max-width: 100%;
}

.icon-preview-card,
.icon-empty-card {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 14px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fafafa;
}

.icon-preview-image,
.icon-empty-symbol {
  flex: 0 0 auto;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 3px solid #ffffff;
  background: #ffffff;
  box-shadow: 0 8px 22px rgba(31, 41, 55, 0.18);
  overflow: hidden;
}

.icon-empty-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9a4f12;
  font-weight: 800;
  box-shadow: 0 8px 22px rgba(31, 41, 55, 0.12);
}

.icon-preview-meta {
  min-width: 0;
  flex: 1;
}

.icon-preview-title {
  margin-bottom: 8px;
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
}

.icon-url-text {
  margin-bottom: 10px;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.icon-preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hidden-file-input {
  display: none;
}

@media (max-width: 768px) {
  .platform-config-page,
  .config-form {
    max-width: none;
  }

  .field-control,
  .field-control.short,
  .inline-control {
    width: 100%;
  }
}
</style>
