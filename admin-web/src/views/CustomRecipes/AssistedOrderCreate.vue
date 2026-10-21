<template>
  <div class="assisted-order-page">
    <div class="page-header">
      <div>
        <h2>代客下单</h2>
        <p class="subtitle">
          为已有账号顾客或无账号代客客户创建定制食谱订单。金额以服务端报价为准；
          线下收款只登记，不发起线上支付。
        </p>
      </div>
      <el-button @click="goBack">返回订单中心</el-button>
    </div>

    <el-alert
      v-if="!isAdmin"
      type="warning"
      :closable="false"
      show-icon
      title="代客下单需要管理员权限"
      description="当前账号可以查看页面，但不能创建顾客、狗狗或提交订单。请联系管理员操作。"
      class="page-alert"
    />

    <!-- 第一步：顾客与狗狗（合并选择） -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-header">
          <span class="step-badge">1</span>
          <span class="section-title">选择顾客与狗狗</span>
          <span class="section-hint">
            一张卡片同时选顾客和狗；内部账号会二次确认
          </span>
        </div>
      </template>

      <!-- 顶部已选身份：顾客 + 狗狗；「重新选择」整体重置 -->
      <div v-if="selectedIdentity" class="selected-identity">
        <div class="selected-identity__body">
          <div class="selected-identity__row">
            <span class="selected-identity__label">当前顾客</span>
            <span class="selected-identity__name">{{ selectedIdentity.customerName }}</span>
            <span class="selected-identity__phone">{{ selectedIdentity.customerPhone }}</span>
            <el-tag
              v-if="selectedIdentity.isInternal"
              size="small"
              type="danger"
              effect="dark"
            >
              {{ INTERNAL_CUSTOMER_ACCOUNT_BADGE }}
            </el-tag>
            <el-tag v-else size="small" type="success" effect="plain">真实顾客</el-tag>
          </div>
          <div class="selected-identity__row">
            <template v-if="selectedIdentity.dogId">
              <span class="selected-identity__label">已选狗狗</span>
              <span class="selected-identity__name">{{ selectedIdentity.dogName }}</span>
              <span class="selected-identity__meta">
                {{ selectedIdentity.dogBreedName }} · {{ selectedIdentity.dogAgeText }} ·
                {{ selectedIdentity.dogWeightText }}
              </span>
            </template>
            <span v-else class="selected-identity__empty">
              还没有选择狗狗，请在下方选择或新建
            </span>
          </div>
          <div v-if="selectedIdentity.isInternal" class="selected-identity__warn">
            这是内部账号，不是真实顾客，仅用于测试。
          </div>
        </div>
        <el-button plain @click="resetSelection">重新选择</el-button>
      </div>

      <el-radio-group v-model="customerMode" class="mode-row" @change="handleCustomerModeChange">
        <el-radio-button value="EXISTING">已有账号顾客</el-radio-button>
        <el-radio-button value="GUEST">代客客户（无账号）</el-radio-button>
      </el-radio-group>

      <template v-if="customerMode === 'EXISTING'">
        <div class="search-row">
          <el-input
            v-model="existingKeyword"
            clearable
            placeholder="姓名 / 手机号 / 狗名"
            class="search-input"
            @keyup.enter="searchExistingCustomers"
          />
          <el-button type="primary" :loading="existingSearching" @click="searchExistingCustomers">
            搜索顾客
          </el-button>
          <el-checkbox
            v-model="includeInternal"
            :disabled="!isAdmin"
            @change="handleIncludeInternalChange"
          >
            包含内部账号（仅管理员）
          </el-checkbox>
        </div>

        <div
          v-if="existingSearched && !existingSearching && existingResults.length === 0"
          class="empty-hint"
        >
          没有匹配的顾客。可以切换到「代客客户（无账号）」新建档案。
        </div>

        <div v-if="existingResults.length > 0" class="result-list">
          <div
            v-for="card in existingResults"
            :key="card.customerId"
            class="customer-option"
            :class="{ 'customer-option--on': selectedCustomer?.id === card.customerId }"
          >
            <div class="customer-main">
              {{ card.name }}
              <el-tag
                size="small"
                :type="card.isInternal ? 'danger' : 'success'"
                effect="plain"
              >
                {{ card.isInternal ? INTERNAL_CUSTOMER_ACCOUNT_BADGE : '真实顾客' }}
              </el-tag>
            </div>
            <div class="customer-meta">
              手机号：{{ card.phone || '未填写' }} · {{ card.dogs.length }} 只狗
            </div>
            <div v-if="card.dogs.length > 0" class="result-dogs">
              <div
                v-for="dog in card.dogs"
                :key="dog.id"
                class="result-dog"
                :class="{ 'result-dog--on': form.dogId === dog.id }"
                @click="selectCustomerDog(card, dog)"
              >
                <span class="result-dog__name">🐶 {{ dog.name }}</span>
                <span class="result-dog__meta">
                  {{ dog.breedName || '品种未填写' }} · {{ dog.ageText }} · {{ dog.weightText }}
                </span>
                <el-tag v-if="form.dogId === dog.id" size="small" type="primary">已选择</el-tag>
              </div>
            </div>
            <div v-else class="empty-hint small">这位顾客还没有狗狗档案</div>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="search-row">
          <el-input
            v-model="guestKeyword"
            clearable
            placeholder="姓名 / 手机号 / 微信"
            class="search-input"
            @keyup.enter="searchGuestCustomers"
          />
          <el-button type="primary" :loading="guestSearching" @click="searchGuestCustomers">
            搜索代客客户
          </el-button>
          <el-button :disabled="!isAdmin" @click="openGuestDialog">新建代客客户</el-button>
        </div>

        <div v-if="guestResults.length > 0" class="result-list">
          <div
            v-for="item in guestResults"
            :key="item.id"
            class="customer-option"
            :class="{ 'customer-option--on': selectedCustomer?.id === item.id }"
            @click="selectGuestCustomer(item)"
          >
            <div class="customer-main">
              {{ item.name || '未命名顾客' }}
              <el-tag size="small" type="warning" effect="plain">代客客户</el-tag>
            </div>
            <div class="customer-meta">
              手机号：{{ item.phone || '未填写' }} · {{ item.dogCount }} 只狗
              <span v-if="item.wechat"> · 微信：{{ item.wechat }}</span>
            </div>
          </div>
        </div>

        <template v-if="isGuestSelected">
          <div class="owner-banner">
            <span>当前顾客：{{ ownerSummary }}</span>
            <el-button
              type="primary"
              plain
              :disabled="!isAdmin"
              @click="openDogDialog"
            >
              新建狗狗档案
            </el-button>
          </div>

          <div v-loading="dogsLoading" class="dog-area">
            <el-alert
              v-if="dogsError"
              type="error"
              :title="dogsError"
              :closable="false"
              show-icon
              class="page-alert"
            >
              <template #default>
                <el-button link type="primary" @click="loadDogs">重新加载</el-button>
              </template>
            </el-alert>
            <div v-else-if="dogs.length > 0" class="dog-grid">
              <div
                v-for="dog in dogs"
                :key="dog.id"
                class="dog-card"
                :class="{ 'dog-card--on': form.dogId === dog.id }"
                @click="selectGuestDog(dog)"
              >
                <el-avatar :size="52" :src="dog.avatarUrl || undefined" class="dog-avatar">
                  🐶
                </el-avatar>
                <div class="dog-body">
                  <div class="dog-name">{{ dog.name }}</div>
                  <div class="dog-meta">
                    {{ dog.breedName || dog.customBreedName || '品种未填写' }} ·
                    {{ ageText(dog.birthday) }} ·
                    {{ weightText(dog.currentWeightKg) }}
                  </div>
                  <div class="dog-owner">主人：{{ ownerSummary }}</div>
                </div>
                <el-tag v-if="form.dogId === dog.id" size="small" type="primary">已选择</el-tag>
              </div>
            </div>
            <el-empty
              v-else
              description="这位代客客户还没有狗狗，请先新建档案"
            />
          </div>
        </template>
      </template>
    </el-card>

    <!-- 第二步：定制需求 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-header">
          <span class="step-badge">2</span>
          <span class="section-title">定制需求</span>
          <span class="section-hint">与顾客自助单同一套问卷，带 * 为必填</span>
        </div>
      </template>

      <el-alert
        v-if="intakeOptionsError"
        type="error"
        :title="intakeOptionsError"
        :closable="false"
        show-icon
        class="page-alert"
      />

      <el-form label-width="130px" :model="form" class="intake-form">
        <el-form-item label="健康管理方向" required>
          <el-radio-group v-model="form.targetGoal">
            <el-radio v-for="option in goalOptions" :key="option.code" :value="option.code">
              {{ option.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="份数" required>
          <el-input-number
            v-model="form.recipeQuantity"
            :min="1"
            :max="maxQuantity"
            :precision="0"
          />
          <span class="field-hint">1–{{ maxQuantity }} 份，每份独立设计</span>
          <span v-if="multiRecipeDisabled" class="field-warn">多份购买暂未开放，只能下 1 份</span>
        </el-form-item>

        <el-form-item label="主蛋白">
          <el-radio-group v-model="proteinMode">
            <el-radio-button value="DIETITIAN">营养师配</el-radio-button>
            <el-radio-button value="SELF">自己选</el-radio-button>
          </el-radio-group>
          <div v-if="proteinMode === 'DIETITIAN'" class="field-hint block-hint">
            不指定主蛋白，由营养师根据狗狗档案搭配 {{ form.recipeQuantity }} 种。
          </div>
          <div v-else class="protein-block">
            <el-checkbox-group v-model="form.requestedProteinCodes">
              <el-checkbox
                v-for="option in PROTEIN_OPTIONS"
                :key="option.code"
                :value="option.code"
              >
                {{ option.label }}
              </el-checkbox>
            </el-checkbox-group>
            <div
              v-if="form.requestedProteinCodes.length !== form.recipeQuantity"
              class="field-warn"
            >
              请选择恰好 {{ form.recipeQuantity }} 种主蛋白（已选
              {{ form.requestedProteinCodes.length }} 种）。
            </div>
          </div>
        </el-form-item>

        <el-form-item label="是否对食物过敏" required>
          <el-radio-group v-model="form.allergyStatus">
            <el-radio value="HAS_ALLERGY">有过敏</el-radio>
            <el-radio value="NO_ALLERGY">没有过敏</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="form.allergyStatus === 'HAS_ALLERGY'" label="过敏食物" required>
          <el-input
            v-model="form.allergyText"
            type="textarea"
            :rows="2"
            maxlength="1000"
            show-word-limit
            placeholder="例如：鸡肉、牛肉、鹿肉；多个用顿号分开"
          />
        </el-form-item>

        <el-form-item label="现在主要喂什么" required>
          <el-select
            v-model="form.currentFoodMain"
            clearable
            placeholder="请选择"
            style="width: 260px"
          >
            <el-option
              v-for="option in currentFoodOptions"
              :key="option.code"
              :label="option.label"
              :value="option.code"
            />
          </el-select>
          <el-input
            v-if="form.currentFoodMain === 'OTHER'"
            v-model="form.currentFoodOther"
            maxlength="120"
            placeholder="请补充现在主要喂的是什么"
            class="other-input"
          />
        </el-form-item>

        <el-form-item label="定制原因" required>
          <el-checkbox-group v-model="form.changeReasons">
            <el-checkbox
              v-for="option in changeReasonOptions"
              :key="option.code"
              :value="option.code"
            >
              {{ option.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="最近肠胃情况">
          <el-checkbox-group v-model="form.stomachConditions">
            <el-checkbox
              v-for="option in stomachOptions"
              :key="option.code"
              :value="option.code"
            >
              {{ option.label }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="备注">
          <el-input
            v-model="form.additionalNotes"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="给营养师的补充说明，例如换粮、用药、不爱嚼硬的"
          />
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 第三步：报价与收款 -->
    <el-card shadow="never" class="section-card">
      <template #header>
        <div class="section-header">
          <span class="step-badge">3</span>
          <span class="section-title">报价与收款</span>
          <span class="section-hint">应付金额只从服务端报价读取，页面不自行计算</span>
        </div>
      </template>

      <div v-loading="quoteLoading" class="quote-area">
        <el-alert
          v-if="quoteError"
          type="error"
          :title="quoteError"
          :closable="false"
          show-icon
        />
        <el-descriptions v-else-if="quote" :column="3" border>
          <el-descriptions-item label="原价">
            ¥{{ formatMoney(quote.originalAmount) }}
          </el-descriptions-item>
          <el-descriptions-item label="优惠">
            {{ formatDiscountRate(quote.discountRate) }}
            <span class="muted">（-¥{{ formatMoney(quote.discountAmount) }}）</span>
          </el-descriptions-item>
          <el-descriptions-item label="应付">
            <span class="payable">¥{{ formatMoney(quote.payableAmount) }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <div v-else class="empty-hint">正在获取服务端报价…</div>
      </div>

      <el-divider />

      <el-form label-width="130px" :model="form" class="payment-form">
        <el-form-item label="收款状态" required>
          <el-radio-group v-model="form.payment.collected">
            <el-radio :value="true">已收款</el-radio>
            <el-radio :value="false">未收款</el-radio>
          </el-radio-group>
          <span class="field-hint">未收款时订单进入待付款，之后可在订单中心确认收款</span>
        </el-form-item>

        <el-form-item label="收款方式" required>
          <el-select v-model="form.payment.channel" style="width: 240px">
            <el-option
              v-for="channel in ASSISTED_PAYMENT_CHANNELS"
              :key="channel.value"
              :label="channel.label"
              :value="channel.value"
            />
          </el-select>
          <span class="field-hint">只登记线下收款，不提供线上支付选项</span>
        </el-form-item>

        <el-form-item label="实收金额" required>
          <el-input-number
            v-model="form.payment.amount"
            :min="0"
            :precision="2"
            :step="1"
            @change="onActualAmountChange"
          />
          <span class="field-hint">默认等于服务端应付</span>
        </el-form-item>

        <el-form-item v-if="form.payment.collected" label="线下流水号/备注">
          <el-input
            v-model="form.payment.externalRef"
            maxlength="100"
            show-word-limit
            placeholder="选填，例如微信/支付宝转账单号"
            style="width: 360px"
          />
        </el-form-item>

        <el-form-item v-if="needsOverrideReason" label="实收差异原因" required>
          <el-input
            v-model="form.payment.overrideReason"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="实收与系统报价不一致时必须说明，例如抹零、老客户优惠"
          />
          <div class="field-warn block-hint">
            实收 ¥{{ formatMoney(form.payment.amount) }}，系统应付
            ¥{{ formatMoney(quote?.payableAmount) }}，请填写差异原因。
          </div>
        </el-form-item>
      </el-form>
    </el-card>

    <el-alert
      v-if="submitError"
      type="error"
      :title="submitError"
      :closable="false"
      show-icon
      class="submit-error"
    />

    <div class="footer-actions">
      <el-button @click="goBack">取消</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="submitOrder"
      >
        提交代客订单
      </el-button>
    </div>

    <!-- 新建代客客户 -->
    <el-dialog v-model="guestDialogVisible" title="新建代客客户" width="480px">
      <el-form ref="guestFormRef" :model="guestForm" :rules="guestRules" label-width="90px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="guestForm.name" maxlength="50" placeholder="顾客怎么称呼" />
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="guestForm.phone" maxlength="20" placeholder="选填，用于区分同名顾客" />
        </el-form-item>
        <el-form-item label="微信" prop="wechat">
          <el-input v-model="guestForm.wechat" maxlength="100" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="guestDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="guestSaving" @click="submitGuestCustomer">
          创建并选中
        </el-button>
      </template>
    </el-dialog>

    <!-- 给代客客户新建狗狗 -->
    <el-dialog v-model="dogDialogVisible" title="新建狗狗档案" width="720px">
      <el-form ref="dogFormRef" :model="dogForm" :rules="dogRules" label-width="110px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="名字" prop="name">
              <el-input v-model="dogForm.name" maxlength="30" placeholder="狗狗名字" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="品种" prop="breedId">
              <el-select v-model="dogForm.breedId" filterable placeholder="请选择" style="width: 100%">
                <el-option
                  v-for="breed in breeds"
                  :key="breed.id"
                  :label="breed.name"
                  :value="breed.id"
                />
                <el-option label="混血 / 不确定" :value="MIXED_BREED_VIRTUAL_ID" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item v-if="dogForm.breedId === MIXED_BREED_VIRTUAL_ID" label="自定义品种">
          <el-input v-model="dogForm.customBreedName" maxlength="50" placeholder="例如：田园犬" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="生日" prop="birthday">
              <el-date-picker
                v-model="dogForm.birthday"
                type="date"
                value-format="YYYY-MM-DD"
                placeholder="选择日期"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="性别" prop="gender">
              <el-radio-group v-model="dogForm.gender">
                <el-radio :value="DogGender.MALE">公</el-radio>
                <el-radio :value="DogGender.FEMALE">母</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="体重(kg)" prop="currentWeightKg">
              <el-input-number
                v-model="dogForm.currentWeightKg"
                :min="0.1"
                :max="130"
                :precision="1"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="体况评分" prop="bcsScore">
              <el-select v-model="dogForm.bcsScore" style="width: 100%">
                <el-option v-for="score in 9" :key="score" :label="String(score)" :value="score" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="活动量" prop="activityLevel">
              <el-select v-model="dogForm.activityLevel" style="width: 100%">
                <el-option
                  v-for="(label, value) in ActivityLevelLabels"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="生命阶段" prop="lifeStageOverride">
              <el-select v-model="dogForm.lifeStageOverride" style="width: 100%">
                <el-option
                  v-for="(label, value) in LifeStageLabels"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="体型分类">
              <el-select
                v-model="dogForm.sizeClassOverride"
                clearable
                placeholder="系统自动匹配"
                style="width: 100%"
              >
                <el-option
                  v-for="(label, value) in DogSizeLabels"
                  :key="value"
                  :label="label"
                  :value="value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="每日餐数">
              <el-input-number v-model="dogForm.mealsPerDay" :min="1" :max="6" :precision="0" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="是否绝育">
              <el-switch v-model="dogForm.isNeutered" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="既往病史">
          <el-input v-model="dogForm.medicalHistory" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dogDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dogSaving" @click="submitGuestDog">
          创建狗狗
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { customRecipeApi } from '@/api/customRecipe'
import type {
  AssistedPaymentChannel,
  CustomRecipeIntakeOptionSets,
  CustomRecipeQuote,
  GuestCustomerSearchItem,
} from '@/api/customRecipe'
import { dogApi } from '@/api/dogs'
import {
  ActivityLevel,
  ActivityLevelLabels,
  DogGender,
  DogSizeCategory,
  DogSizeLabels,
  LifeStageLabels,
  LifeStageOverride,
  MIXED_BREED_VIRTUAL_ID,
} from '@/types/dog'
import type { DogBreed, DogProfile } from '@/types/dog'
import { ADMIN_ONLY_TIP, useIsAdmin } from '@/composables/useAdminRole'
import { getApiErrorMessage, toastApiError } from '@/utils/apiError'
import { INTERNAL_CUSTOMER_ACCOUNT_BADGE } from '@/utils/customerRole'
import {
  ASSISTED_PAYMENT_CHANNELS,
  ASSISTED_TARGET_GOAL_CODES,
  PROTEIN_OPTIONS,
  buildAssistedOrderPayload,
  buildCustomerDogCards,
  buildSelectedIdentity,
  collectAssistedOrderIssues,
  describeCustomer,
  formatDiscountRate,
  formatDogAge,
  formatDogWeight,
  formatMoney,
  getPaymentValidationError,
  requiresInternalConfirmation,
  shouldSyncActualAmount,
} from '@/utils/assistedOrder'
import type {
  AssistedCustomerDogCard,
  AssistedDogSummary,
  AssistedOrderFormState,
  ProteinChoiceMode,
} from '@/utils/assistedOrder'

type CustomerMode = 'EXISTING' | 'GUEST'
type CustomerSource = 'EXISTING' | 'GUEST'

interface SelectedCustomer {
  id: string
  name: string
  phone: string | null
  source: CustomerSource
  role: string
  isInternal: boolean
  dogCount: number
}

const router = useRouter()
const isAdmin = useIsAdmin()

const customerMode = ref<CustomerMode>('EXISTING')
const existingKeyword = ref('')
const guestKeyword = ref('')
const existingResults = ref<AssistedCustomerDogCard[]>([])
const guestResults = ref<GuestCustomerSearchItem[]>([])
const existingSearching = ref(false)
const existingSearched = ref(false)
const guestSearching = ref(false)
/** 内部账号开关：默认关闭，只有管理员能用；打开后才搜 ADMIN / STAFF */
const includeInternal = ref(false)
const selectedCustomer = ref<SelectedCustomer | null>(null)
const selectedDog = ref<AssistedDogSummary | null>(null)

const dogs = ref<DogProfile[]>([])
const dogsLoading = ref(false)
const dogsError = ref('')
const breeds = ref<DogBreed[]>([])

const isGuestSelected = computed(() => selectedCustomer.value?.source === 'GUEST')
const ownerSummary = computed(() =>
  describeCustomer(selectedCustomer.value?.name, selectedCustomer.value?.phone),
)
/**
 * 顶部已选身份卡：顾客 + 狗狗一起展示。
 *
 * 只在选中顾客后出现；狗狗还没选（代客客户刚建档）时也显示顾客，
 * 提示继续选狗，不能让员工以为「点了顾客就等于选完」。
 */
const selectedIdentity = computed(() =>
  selectedCustomer.value
    ? buildSelectedIdentity(selectedCustomer.value, selectedDog.value)
    : null,
)

const configLoaded = ref(false)
const config = reactive({
  multiRecipeEnabled: true,
  maxRecipeQuantity: 5,
})

/**
 * 后台当前允许的份数。
 *
 * 多份开关关闭时只能 1 份（与后端同一口径）；配置没读到时先按业务
 * 硬上限 5 展示，但真正提交仍由后端拦。
 */
const maxQuantity = computed(() => {
  if (!configLoaded.value) return 5
  const configured = Number(config.maxRecipeQuantity)
  const cap =
    Number.isInteger(configured) && configured >= 1 && configured <= 5
      ? configured
      : 5
  return config.multiRecipeEnabled ? cap : 1
})
const multiRecipeDisabled = computed(
  () => configLoaded.value && !config.multiRecipeEnabled,
)

const form = reactive<AssistedOrderFormState>({
  customerId: '',
  dogId: '',
  targetGoal: '',
  recipeQuantity: 1,
  requestedProteinCodes: [],
  allergyStatus: '',
  allergyText: '',
  currentFoodMain: '',
  currentFoodOther: '',
  changeReasons: [],
  stomachConditions: [],
  additionalNotes: '',
  payment: {
    collected: true,
    channel: 'OFFLINE_WECHAT' as AssistedPaymentChannel,
    amount: 0,
    externalRef: '',
    overrideReason: '',
  },
})

const proteinMode = ref<ProteinChoiceMode>('DIETITIAN')

const intakeOptionSets = ref<CustomRecipeIntakeOptionSets>({})
const intakeOptionsError = ref('')

const goalOptions = computed(() =>
  (intakeOptionSets.value.custom_recipe_goal ?? []).filter((option) =>
    (ASSISTED_TARGET_GOAL_CODES as readonly string[]).includes(option.code),
  ),
)
const currentFoodOptions = computed(
  () => intakeOptionSets.value.custom_recipe_current_food ?? [],
)
const changeReasonOptions = computed(
  () => intakeOptionSets.value.custom_recipe_change_reason ?? [],
)
const stomachOptions = computed(
  () => intakeOptionSets.value.custom_recipe_stomach ?? [],
)

const quote = ref<CustomRecipeQuote | null>(null)
const quoteLoading = ref(false)
const quoteError = ref('')
const actualAmountTouched = ref(false)
let quoteRequestSeq = 0

const amountDifference = computed(() => {
  const payable = quote.value?.payableAmount
  const amount = Number(form.payment.amount)
  if (payable === null || payable === undefined || !Number.isFinite(amount)) {
    return null
  }
  return Math.round((amount - payable) * 100) / 100
})
const needsOverrideReason = computed(
  () => amountDifference.value !== null && amountDifference.value !== 0,
)
const paymentValidationError = computed(() =>
  getPaymentValidationError({
    collected: form.payment.collected,
    amount: form.payment.amount,
    payableAmount: quote.value?.payableAmount ?? null,
    overrideReason: form.payment.overrideReason,
  }),
)

const submitting = ref(false)
const submitError = ref('')
const canSubmit = computed(
  () =>
    isAdmin.value &&
    !submitting.value &&
    !quoteLoading.value &&
    quote.value !== null,
)

// ===== 顾客与狗狗合并搜索 =====

async function searchExistingCustomers() {
  const keyword = existingKeyword.value.trim()
  if (!keyword) {
    existingResults.value = []
    existingSearched.value = false
    ElMessage.warning('请输入姓名、手机号或狗名后再搜索')
    return
  }

  existingSearching.value = true
  try {
    const result = await customRecipeApi.searchAssistedCustomerDogs(
      keyword,
      includeInternal.value,
    )
    existingResults.value = buildCustomerDogCards(result?.items ?? [])
    existingSearched.value = true
  } catch (error) {
    existingResults.value = []
    existingSearched.value = true
    toastApiError(error, '搜索顾客失败', (message) => ElMessage.error(message))
  } finally {
    existingSearching.value = false
  }
}

/** 打开/关闭内部账号后，如果已经有关键词就立即重搜，避免结果与开关不一致 */
function handleIncludeInternalChange() {
  if (existingKeyword.value.trim()) {
    void searchExistingCustomers()
  }
}

async function searchGuestCustomers() {
  guestSearching.value = true
  try {
    const result = await customRecipeApi.searchGuestCustomers(
      guestKeyword.value.trim() || undefined,
    )
    guestResults.value = result?.items ?? []
  } catch (error) {
    guestResults.value = []
    toastApiError(error, '搜索代客客户失败', (message) => ElMessage.error(message))
  } finally {
    guestSearching.value = false
  }
}

/**
 * 点一只狗 = 同时选中它的主人和它自己。
 *
 * 内部账号（ADMIN / STAFF）在库里也是 User，搜索打开开关就能选到；
 * 但那不是真实顾客，必须弹窗确认，取消则什么都不改。
 */
async function selectCustomerDog(
  card: AssistedCustomerDogCard,
  dog: AssistedDogSummary,
) {
  if (requiresInternalConfirmation(card)) {
    try {
      await ElMessageBox.confirm(
        '这是内部账号，不是真实顾客，仅用于测试？',
        '内部账号确认',
        {
          confirmButtonText: '继续（仅用于测试）',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return
    }
  }

  selectedCustomer.value = {
    id: card.customerId,
    name: card.name,
    phone: card.phone,
    source: 'EXISTING',
    role: card.role,
    isInternal: card.isInternal,
    dogCount: card.dogs.length,
  }
  selectedDog.value = { ...dog }
  form.customerId = card.customerId
  form.dogId = dog.id
}

function selectGuestCustomer(item: GuestCustomerSearchItem) {
  selectedCustomer.value = {
    id: item.id,
    name: item.name || '未命名顾客',
    phone: item.phone || null,
    source: 'GUEST',
    role: 'CUSTOMER',
    isInternal: false,
    dogCount: Number(item.dogCount) || 0,
  }
  selectedDog.value = null
  form.customerId = item.id
  form.dogId = ''
  void loadDogs()
}

function resetSelection() {
  selectedCustomer.value = null
  selectedDog.value = null
  form.customerId = ''
  form.dogId = ''
  dogs.value = []
  dogsError.value = ''
}

function handleCustomerModeChange() {
  const expected: CustomerSource =
    customerMode.value === 'EXISTING' ? 'EXISTING' : 'GUEST'
  if (selectedCustomer.value && selectedCustomer.value.source !== expected) {
    resetSelection()
  }
}

// ===== 代客客户的狗狗（无账号顾客才需要单独建档）=====

async function loadDogs() {
  const customer = selectedCustomer.value
  if (!customer) {
    dogs.value = []
    return
  }

  dogsLoading.value = true
  dogsError.value = ''
  try {
    const result = await customRecipeApi.listCustomerDogs(customer.id)
    dogs.value = Array.isArray(result?.data) ? result.data : []
    const matched = dogs.value.find((dog) => dog.id === form.dogId)
    if (matched) {
      selectGuestDog(matched)
    } else {
      form.dogId = ''
      selectedDog.value = null
    }
    customer.dogCount = dogs.value.length
  } catch (error) {
    dogs.value = []
    dogsError.value = getApiErrorMessage(error, '加载狗狗档案失败，请重试')
    toastApiError(error, '加载狗狗档案失败', (message) => ElMessage.error(message))
  } finally {
    dogsLoading.value = false
  }
}

function selectGuestDog(dog: DogProfile) {
  // 只认 dog.id：狗名可能重复，绝不能按名字匹配
  selectedDog.value = {
    id: dog.id,
    name: dog.name,
    breedName: dog.breedName || dog.customBreedName || null,
    ageText: formatDogAge(dog.birthday),
    weightText: formatDogWeight(dog.currentWeightKg),
  }
  form.dogId = dog.id
}

function ageText(birthday?: string | null) {
  return formatDogAge(birthday)
}

function weightText(weight?: number | null) {
  return formatDogWeight(weight)
}

// ===== 选项字典 / 报价 =====

async function loadConfig() {
  try {
    const data = await customRecipeApi.getConfig()
    config.multiRecipeEnabled = data.multiRecipeEnabled !== false
    config.maxRecipeQuantity = Number(data.maxRecipeQuantity) || 5
    configLoaded.value = true
  } catch {
    // 配置读取失败不阻塞报价；提交时后端仍会按真实配置校验
    configLoaded.value = false
  }
}

async function loadIntakeOptions() {
  try {
    intakeOptionSets.value = await customRecipeApi.getIntakeOptionSets()
    intakeOptionsError.value = ''
  } catch (error) {
    intakeOptionSets.value = {}
    intakeOptionsError.value = getApiErrorMessage(error, '定制选项加载失败，请刷新重试')
  }
}

async function loadBreeds() {
  try {
    breeds.value = await dogApi.getBreeds()
  } catch (error) {
    toastApiError(error, '加载品种失败', (message) => ElMessage.error(message))
  }
}

function applyQuote(next: CustomRecipeQuote) {
  const previousPayable = quote.value?.payableAmount ?? null
  const syncAmount = shouldSyncActualAmount(
    form.payment.amount,
    previousPayable,
    actualAmountTouched.value,
  )
  quote.value = next
  if (syncAmount) {
    form.payment.amount = next.payableAmount
  }
}

async function refreshQuote() {
  const quantity = Number(form.recipeQuantity)
  if (!Number.isInteger(quantity) || quantity < 1) {
    quote.value = null
    return
  }

  const seq = ++quoteRequestSeq
  quoteLoading.value = true
  quoteError.value = ''
  try {
    const data = await customRecipeApi.getQuote(quantity)
    if (seq !== quoteRequestSeq) return
    applyQuote(data)
  } catch (error) {
    if (seq !== quoteRequestSeq) return
    quote.value = null
    quoteError.value = getApiErrorMessage(error, '获取服务端报价失败，请重试')
    toastApiError(error, '获取服务端报价失败', (message) => ElMessage.error(message))
  } finally {
    if (seq === quoteRequestSeq) {
      quoteLoading.value = false
    }
  }
}

function onActualAmountChange() {
  actualAmountTouched.value = true
}

watch(
  () => form.recipeQuantity,
  () => {
    void refreshQuote()
  },
)

watch(maxQuantity, (max) => {
  if (form.recipeQuantity > max) {
    form.recipeQuantity = max
  }
})

// ===== 新建代客客户 =====

const guestDialogVisible = ref(false)
const guestSaving = ref(false)
const guestFormRef = ref<FormInstance>()
const guestForm = reactive({ name: '', phone: '', wechat: '' })
const guestRules: FormRules = {
  name: [{ required: true, message: '请填写代客客户姓名', trigger: 'blur' }],
}

function openGuestDialog() {
  if (!isAdmin.value) {
    ElMessage.warning(ADMIN_ONLY_TIP)
    return
  }
  guestForm.name = ''
  guestForm.phone = ''
  guestForm.wechat = ''
  guestDialogVisible.value = true
}

async function submitGuestCustomer() {
  if (!guestFormRef.value) return
  try {
    await guestFormRef.value.validate()
  } catch {
    return
  }

  guestSaving.value = true
  try {
    const name = guestForm.name.trim()
    const result = await customRecipeApi.createGuestCustomer({
      name,
      phone: guestForm.phone.trim() || undefined,
      wechat: guestForm.wechat.trim() || undefined,
    })
    const item: GuestCustomerSearchItem = {
      id: result.customerId,
      name,
      phone: guestForm.phone.trim() || null,
      wechat: guestForm.wechat.trim() || null,
      dogCount: 0,
    }
    guestResults.value = [item, ...guestResults.value]
    selectedCustomer.value = {
      id: item.id,
      name: item.name,
      phone: item.phone ?? null,
      source: 'GUEST',
      role: 'CUSTOMER',
      isInternal: false,
      dogCount: 0,
    }
    selectedDog.value = null
    form.customerId = item.id
    form.dogId = ''
    dogs.value = []
    guestDialogVisible.value = false
    ElMessage.success('代客客户已创建，请继续新建或选择狗狗')
  } catch (error) {
    toastApiError(error, '新建代客客户失败', (message) => ElMessage.error(message))
  } finally {
    guestSaving.value = false
  }
}

// ===== 给代客客户建狗 =====

const dogDialogVisible = ref(false)
const dogSaving = ref(false)
const dogFormRef = ref<FormInstance>()
const dogForm = reactive({
  name: '',
  breedId: '',
  customBreedName: '',
  birthday: '',
  gender: DogGender.MALE,
  isNeutered: false,
  currentWeightKg: 10,
  bcsScore: 5,
  activityLevel: ActivityLevel.NORMAL,
  lifeStageOverride: LifeStageOverride.NONE,
  sizeClassOverride: null as DogSizeCategory | null,
  mealsPerDay: 2,
  medicalHistory: '',
})
const dogRules: FormRules = {
  name: [{ required: true, message: '请填写狗狗名字', trigger: 'blur' }],
  breedId: [{ required: true, message: '请选择品种', trigger: 'change' }],
  birthday: [{ required: true, message: '请选择生日', trigger: 'change' }],
  currentWeightKg: [{ required: true, message: '请填写体重', trigger: 'blur' }],
  bcsScore: [{ required: true, message: '请选择体况评分', trigger: 'change' }],
}

function openDogDialog() {
  if (!selectedCustomer.value || selectedCustomer.value.source !== 'GUEST') {
    ElMessage.warning('只有代客客户才能代建狗狗档案')
    return
  }
  if (!isAdmin.value) {
    ElMessage.warning(ADMIN_ONLY_TIP)
    return
  }
  dogForm.name = ''
  dogForm.breedId = ''
  dogForm.customBreedName = ''
  dogForm.birthday = ''
  dogForm.gender = DogGender.MALE
  dogForm.isNeutered = false
  dogForm.currentWeightKg = 10
  dogForm.bcsScore = 5
  dogForm.activityLevel = ActivityLevel.NORMAL
  dogForm.lifeStageOverride = LifeStageOverride.NONE
  dogForm.sizeClassOverride = null
  dogForm.mealsPerDay = 2
  dogForm.medicalHistory = ''
  dogDialogVisible.value = true
}

async function submitGuestDog() {
  const customer = selectedCustomer.value
  if (!customer || customer.source !== 'GUEST') {
    ElMessage.warning('请先选择一个代客客户')
    return
  }
  if (!dogFormRef.value) return
  try {
    await dogFormRef.value.validate()
  } catch {
    return
  }

  dogSaving.value = true
  try {
    const result = await customRecipeApi.createGuestDog(customer.id, {
      name: dogForm.name.trim(),
      breedId: dogForm.breedId,
      customBreedName: dogForm.customBreedName.trim() || null,
      birthday: dogForm.birthday,
      gender: dogForm.gender,
      isNeutered: dogForm.isNeutered,
      currentWeightKg: Number(dogForm.currentWeightKg),
      bcsScore: Number(dogForm.bcsScore),
      activityLevel: dogForm.activityLevel,
      lifeStageOverride: dogForm.lifeStageOverride,
      sizeClassOverride: dogForm.sizeClassOverride,
      mealsPerDay: Number(dogForm.mealsPerDay),
      medicalHistory: dogForm.medicalHistory.trim() || null,
    })
    dogDialogVisible.value = false
    await loadDogs()
    const created = dogs.value.find((dog) => dog.id === result.dogId)
    if (created) {
      selectGuestDog(created)
    }
    ElMessage.success('狗狗档案已创建，已自动选中')
  } catch (error) {
    toastApiError(error, '新建狗狗失败', (message) => ElMessage.error(message))
  } finally {
    dogSaving.value = false
  }
}

// ===== 提交 =====

async function submitOrder() {
  submitError.value = ''
  if (!isAdmin.value) {
    submitError.value = ADMIN_ONLY_TIP
    ElMessage.warning(ADMIN_ONLY_TIP)
    return
  }

  const issues = collectAssistedOrderIssues(form, {
    maxQuantity: maxQuantity.value,
    proteinMode: proteinMode.value,
    quotePayable: quote.value?.payableAmount ?? null,
  })
  if (issues.length > 0) {
    submitError.value = issues.join('；')
    ElMessage.error(issues[0])
    return
  }

  if (!quote.value) {
    submitError.value = '请先获取服务端报价'
    return
  }

  if (paymentValidationError.value) {
    submitError.value = paymentValidationError.value
    ElMessage.error(paymentValidationError.value)
    return
  }

  submitting.value = true
  try {
    const payload = buildAssistedOrderPayload(form, {
      proteinMode: proteinMode.value,
      quotePayable: quote.value.payableAmount,
    })
    const result = await customRecipeApi.createAssistedOrder(payload)
    const orderId = String(result?.orderId || result?.id || '').trim()
    if (!orderId) {
      throw new Error('订单已创建但未返回订单号，请到订单中心核对')
    }
    ElMessage.success(`代客订单 ${orderId} 已创建`)
    router.replace(
      `/order-center?type=CUSTOM_RECIPE&orderId=${encodeURIComponent(orderId)}`,
    )
  } catch (error) {
    submitError.value = getApiErrorMessage(error, '代客下单失败，请重试')
    toastApiError(error, '代客下单失败', (message) => ElMessage.error(message))
  } finally {
    submitting.value = false
  }
}

function goBack() {
  router.push('/order-center?type=CUSTOM_RECIPE')
}

onMounted(async () => {
  await Promise.allSettled([loadConfig(), loadIntakeOptions(), loadBreeds()])
  await refreshQuote()
})
</script>

<style scoped>
.assisted-order-page {
  padding: 16px;
  max-width: 1180px;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
.subtitle {
  margin: 6px 0 0;
  color: #909399;
  font-size: 13px;
  max-width: 760px;
  line-height: 1.5;
}
.page-alert {
  margin-bottom: 12px;
}
.section-card {
  margin-bottom: 14px;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.step-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 12px;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
}
.section-hint {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
.mode-row {
  margin-bottom: 12px;
}
.search-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.search-input {
  width: 320px;
}
.result-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.customer-option {
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.customer-option:hover {
  border-color: #409eff;
}
.customer-option--on {
  border-color: #409eff;
  background: #ecf5ff;
}
.customer-main {
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}
.customer-meta {
  color: #606266;
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.5;
}
.selected-identity {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #b3d8ff;
  background: #ecf5ff;
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 14px;
}
.selected-identity__body {
  flex: 1;
  min-width: 0;
}
.selected-identity__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  line-height: 1.8;
}
.selected-identity__label {
  color: #909399;
  font-size: 12px;
}
.selected-identity__name {
  color: #303133;
  font-weight: 600;
}
.selected-identity__phone,
.selected-identity__meta {
  color: #606266;
  font-size: 13px;
}
.selected-identity__empty {
  color: #e6a23c;
  font-size: 13px;
}
.selected-identity__warn {
  color: #f56c6c;
  font-size: 12px;
  margin-top: 2px;
}
.result-dogs {
  margin-top: 10px;
  display: grid;
  gap: 8px;
}
.result-dog {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 10px;
  transition: border-color 0.15s, background 0.15s;
}
.result-dog:hover {
  border-color: #409eff;
  background: #f5f9ff;
}
.result-dog--on {
  border-color: #409eff;
  background: #d9ecff;
}
.result-dog__name {
  font-weight: 600;
  color: #303133;
}
.result-dog__meta {
  color: #606266;
  font-size: 12px;
}
.empty-hint.small {
  padding: 6px 0;
  font-size: 12px;
}
.owner-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  color: #303133;
  font-size: 13px;
}
.dog-area {
  min-height: 80px;
}
.dog-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 10px;
}
.dog-card {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.dog-card:hover {
  border-color: #409eff;
}
.dog-card--on {
  border-color: #409eff;
  background: #ecf5ff;
}
.dog-avatar {
  background: #f0f2f5;
  flex-shrink: 0;
}
.dog-body {
  flex: 1;
  min-width: 0;
}
.dog-name {
  font-weight: 600;
  color: #303133;
}
.dog-meta,
.dog-owner {
  color: #606266;
  font-size: 12px;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dog-owner {
  color: #909399;
}
.empty-hint {
  color: #909399;
  font-size: 13px;
  padding: 10px 0;
}
.field-hint {
  color: #909399;
  font-size: 12px;
  margin-left: 10px;
}
.field-warn {
  color: #e6a23c;
  font-size: 12px;
  margin-left: 10px;
}
.block-hint {
  display: block;
  margin-left: 0;
  margin-top: 4px;
}
.protein-block {
  width: 100%;
}
.other-input {
  width: 320px;
  margin-left: 10px;
}
.intake-form .el-form-item,
.payment-form .el-form-item {
  margin-bottom: 18px;
}
.quote-area {
  min-height: 60px;
}
.payable {
  color: #f56c6c;
  font-size: 18px;
  font-weight: 600;
}
.muted {
  color: #909399;
  font-size: 12px;
}
.submit-error {
  margin-bottom: 12px;
}
.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-bottom: 24px;
}
</style>
