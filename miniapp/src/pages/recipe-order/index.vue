<template>
  <view class="recipe-order-page">
    <!-- 食谱基本信息 -->
    <view class="recipe-header">
      <view class="recipe-cover-wrapper">
        <image
          v-if="recipe.coverImageUrl"
          :src="normalizeImageUrl(recipe.coverImageUrl)"
          class="recipe-cover"
          mode="aspectFill"
        />
      </view>
      <view class="recipe-info">
        <text class="recipe-name">{{ recipe.name }}</text>
        <view class="recipe-tags">
          <text
            v-for="stage in recipe.applicableLifeStages"
            :key="stage"
            class="tag life-stage-tag"
          >
            {{ getLifeStageLabel(stage) }}
          </text>
          <text
            v-for="tag in recipe.targetHealthTags"
            :key="tag"
            class="tag health-tag"
          >
            {{ getHealthTagLabel(tag) }}
          </text>
        </view>
      </view>
    </view>

    <!-- 选择狗狗 -->
    <view class="section dog-section">
      <view class="section-title">
        <text class="title-text">选择狗狗</text>
        <text class="required">*</text>
      </view>

      <view v-if="dogs.length === 0" class="empty-dogs">
        <text class="empty-text">暂无狗狗档案</text>
        <button class="btn-create-dog" @tap="goToCreateDog">创建狗狗档案</button>
      </view>

      <picker v-else mode="selector" :range="dogPickerOptions" range-key="label" @change="onDogPickerChange">
        <view class="dog-picker">
          <text v-if="!selectedDog" class="picker-placeholder">请选择狗狗</text>
          <view v-else class="dog-selected">
            <text class="dog-emoji">🐶</text>
            <text class="dog-text">{{ selectedDog?.name || '-' }} | {{ selectedDog?.breedName || '-' }} | {{ selectedDog?.currentWeightKg || '-' }}kg | {{ selectedDog?.mealsPerDay || '-' }}餐/天</text>
            <text class="picker-arrow">▼</text>
          </view>
        </view>
      </picker>
    </view>

    <!-- 生命阶段不匹配警告 -->
    <view v-if="!isLifeStageMatch && selectedDog && showWarning" class="warning-card">
      <view class="warning-header">
        <text class="warning-icon">⚠️</text>
        <text class="warning-title">生命阶段不匹配</text>
      </view>
      <text class="warning-text">
        该食谱适用于"{{ getLifeStageLabel(recipe.applicableLifeStages[0]) }}"，
        您选择的狗狗"{{ selectedDog.name }}"是"{{ getDogLifeStageLabel(selectedDog) }}"阶段，
        可能不太适合。
      </text>
      <text class="warning-text">
        建议选择其他食谱。
      </text>
      <button class="btn-continue" @tap="dismissWarning">
        我已知晓，仍要继续
      </button>
    </view>

    <!-- 饭量参考 -->
    <view class="section feeding-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">饭量参考</text>
      </view>

      <view class="feeding-info">
        <view class="feeding-item">
          <text class="feeding-label">每日饭量</text>
          <text class="feeding-value">{{ Math.round(displayDailyIntakeG) }}g/天</text>
        </view>
        <view class="feeding-item">
          <text class="feeding-label">每餐饭量</text>
          <text class="feeding-value">{{ Math.round(perMealG) }}g/餐</text>
        </view>
      </view>

      <!-- 计算说明 -->
      <view class="calculation-explanation">
        <view class="explanation-header" @tap="toggleCalculationDetails">
          <view class="explanation-title-row">
            <text class="explanation-title">饭量计算过程</text>
            <text class="toggle-icon">{{ showCalculationDetails ? '▲' : '▼' }}</text>
          </view>
        </view>

        <view v-if="showCalculationDetails && dogCalcResult" class="explanation-content">
          <!-- 计算卡片 -->
          <view class="calc-cards">

            <!-- ① 每日能量需求 -->
            <view class="calc-card">
              <text class="card-title">每日能量需求 (DER)</text>
              <view class="calc-result">
                <text class="result-value">{{ Math.round(dogCalcResult.totalDer || 0) }} kcal/天</text>
              </view>
            </view>

            <!-- ② 每日零食能量 -->
            <view class="calc-card">
              <text class="card-title">每日零食能量</text>
              <view v-if="dogCalcResult.treatDeduction > 0" class="calc-result">
                <text class="result-value">{{ Math.round(dogCalcResult.treatDeduction) }} kcal/天</text>
                <text v-if="dogCalcResult.isTreatCapped" class="result-warning">⚠️ 已触发10%安全上限</text>
              </view>
              <view v-else class="calc-result">
                <text class="result-note">未配置零食</text>
              </view>
            </view>

            <!-- ③ 每日鲜食能量 -->
            <view class="calc-card">
              <text class="card-title">每日鲜食能量</text>
              <view class="calc-result">
                <text class="result-value">{{ Math.round(dogCalcResult.finalFoodKcal) }} kcal/天</text>
              </view>
            </view>

            <!-- ④ 每日饭量 -->
            <view class="calc-card highlight">
              <text class="card-title">每日饭量</text>
              <view class="formula-box">
                <text class="formula-text">每日饭量 = (鲜食能量 ÷ 食谱能量密度) × 1000</text>
              </view>
              <view class="step-data">
                <view class="data-item">
                  <text class="data-label">食谱能量密度：</text>
                  <text class="data-value">{{ recipe.energyDensityKcalPerKg }} kcal/kg</text>
                </view>
              </view>
              <view class="calc-result final">
                <text class="result-value highlight">{{ Math.round(dogCalcResult.dailyIntakeG) }} g/天</text>
              </view>
            </view>

            <!-- ⑤ 每餐饭量 -->
            <view class="calc-card highlight">
              <text class="card-title">每餐饭量</text>
              <view class="formula-box">
                <text class="formula-text">每餐饭量 = 每日饭量 ÷ 每日餐数</text>
              </view>
              <view class="step-data">
                <view class="data-item">
                  <text class="data-label">每日餐数：</text>
                  <text class="data-value">{{ selectedDog.mealsPerDay }} 餐/天</text>
                </view>
              </view>
              <view class="calc-result final">
                <text class="result-value highlight">{{ Math.round(perMealG) }} g/餐</text>
              </view>
            </view>

          </view>
        </view>
      </view>
    </view>

    <!-- 订购周期 -->
    <view class="section cycle-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">订购周期</text>
        <text class="required">*</text>
      </view>

      <view class="cycle-options">
        <view
          v-for="days in ORDER_CYCLE_OPTIONS"
          :key="days"
          class="cycle-option"
          :class="{ active: selectedCycleDays === days }"
          @tap="selectCycle(days)"
        >
          <text class="cycle-text">{{ days }}天</text>
        </view>
      </view>
    </view>

    <!-- 自定义分装 -->
    <view class="section package-plan-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">自定义分装</text>
        <button class="btn-add-row" @tap="addPackagePlanRow">添加</button>
      </view>

      <view class="package-plan-list">
        <view
          v-for="(row, index) in packagePlan"
          :key="index"
          class="package-plan-row"
        >
          <view class="package-input-group">
            <text class="package-input-label">每袋</text>
            <input
              class="package-input"
              type="number"
              :value="row.packageSpecG"
              @input="updatePackagePlanRow(index, 'packageSpecG', $event.detail.value)"
            />
            <text class="package-input-unit">g</text>
          </view>
          <view class="package-input-group">
            <text class="package-input-label">袋数</text>
            <input
              class="package-input"
              type="number"
              :value="row.packageCount"
              @input="updatePackagePlanRow(index, 'packageCount', $event.detail.value)"
            />
            <text class="package-input-unit">袋</text>
          </view>
          <button
            class="btn-remove-row"
            :disabled="packagePlan.length <= 1"
            @tap="removePackagePlanRow(index)"
          >
            删除
          </button>
        </view>
      </view>

      <view class="total-summary package-summary">
        <view class="summary-item">
          <text class="summary-label">总净重</text>
          <text class="summary-value">{{ Math.round(totalGrams) }}g</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">总袋数</text>
          <text class="summary-value">{{ totalPackages }}袋</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">预计喂食</text>
          <text class="summary-value">{{ estimatedFeedDays }}天</text>
        </view>
      </view>

      <view v-if="!minimumOrderMet" class="min-order-warning">
        <text class="warning-icon">⚠️</text>
        <text class="warning-text">订单净重不足1000克，最低订购量为1000克</text>
      </view>

      <!-- 保质期说明 -->
      <view class="shelf-life-notice">
        <view class="notice-title" @tap="toggleShelfLife">
          <text class="notice-title-text">📅 保质期说明</text>
          <text class="toggle-icon">{{ showShelfLife ? '▲' : '▼' }}</text>
        </view>
        <view v-if="showShelfLife" class="notice-content">
          <view class="notice-item">
            <text class="notice-dot">🧊</text>
            <text class="notice-text">-18℃冷冻保存保质期6个月，建议3个月内吃完</text>
          </view>
          <view class="notice-item">
            <text class="notice-dot">❄️</text>
            <text class="notice-text">0-5℃冷藏保存保质期3天，建议当天吃完</text>
          </view>
          <view class="notice-item">
            <text class="notice-dot">⏱️</text>
            <text class="notice-text">开袋后，建议3小时内吃完</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 原料采购方案 -->
    <view class="section source-plan-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">原料采购方案</text>
      </view>

      <view class="source-plan-options">
        <view
          v-for="option in SOURCE_PLAN_OPTIONS"
          :key="option.code"
          class="source-plan-option"
          :class="{ active: selectedSourcePlan === option.code }"
          @tap="selectSourcePlan(option.code)"
        >
          <view class="source-plan-main">
            <text class="source-plan-name">{{ option.label }}</text>
            <text class="source-plan-desc">{{ option.description }}</text>
          </view>
          <text class="source-plan-check" v-if="selectedSourcePlan === option.code">✓</text>
        </view>
      </view>
    </view>

    <!-- 产品介绍 -->
    <view class="section product-intro-section">
      <image
        class="product-intro-image"
        src="/static/share-recipe.png"
        mode="widthFix"
      />
    </view>

    <!-- 原料清单 -->
    <view class="section ingredients-section">
      <view class="section-title clickable" @tap="toggleIngredientDetails">
        <text class="title-text">原料清单</text>
        <text class="toggle-icon">{{ showIngredientDetails ? '▲' : '▼' }}</text>
      </view>

      <view v-if="showIngredientDetails" class="ingredients-content">
        <!-- 食材类 -->
        <view v-if="foodIngredients.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">食材类</view>
          <view class="ingredient-header">
            <text class="ingredient-header-item">原料名称</text>
            <text class="ingredient-header-item">品牌</text>
            <text class="ingredient-header-item">采购渠道</text>
            <text class="ingredient-header-item">用量</text>
          </view>
          <view v-for="(ingredient, idx) in foodIngredients" :key="'food-' + idx" class="ingredient-row">
            <text class="ingredient-item">{{ ingredient.name }}</text>
            <text class="ingredient-item">{{ ingredient.brand || '-' }}</text>
            <text class="ingredient-item">{{ ingredient.purchaseChannel || '-' }}</text>
            <text class="ingredient-item">
              {{ Math.round((ingredient.netAmount ?? ingredient.amount) * 1000) }}{{ ingredient.displayUnit || ingredient.unit }}
            </text>
          </view>
        </view>

        <!-- 补剂类 -->
        <view v-if="supplementIngredients.length > 0" class="ingredient-group">
          <view class="ingredient-category-title">补剂类</view>
          <view class="ingredient-header">
            <text class="ingredient-header-item">原料名称</text>
            <text class="ingredient-header-item">品牌</text>
            <text class="ingredient-header-item">采购渠道</text>
            <text class="ingredient-header-item">用量</text>
          </view>
          <view v-for="(ingredient, idx) in supplementIngredients" :key="'supplement-' + idx" class="ingredient-row">
            <text class="ingredient-item">{{ ingredient.name }}</text>
            <text class="ingredient-item">{{ ingredient.brand || '-' }}</text>
            <text class="ingredient-item">{{ ingredient.purchaseChannel || '-' }}</text>
            <text class="ingredient-item">
              {{ (ingredient.netAmount ?? ingredient.amount).toFixed(1) }}{{ ingredient.displayUnit || ingredient.unit }}
            </text>
          </view>
        </view>

        <!-- 无数据提示 -->
        <view v-if="foodIngredients.length === 0 && supplementIngredients.length === 0" class="no-ingredients">
          <text class="no-data-text">暂无原料数据</text>
        </view>
      </view>
    </view>

    <!-- 制作要求 - 暂时隐藏 -->
    <view class="section requirements-section" v-if="false">
      <view class="section-title">
        <text class="title-text">制作要求</text>
      </view>

      <!-- 第一组：口感选择 -->
      <view class="requirement-group preparation-group">
        <view class="option-row">
          <view
            class="option-card"
            :class="{ active: preparationMethod === 'CHOPPED' }"
            @tap="selectPreparationMethod('CHOPPED')"
          >
            <text class="option-name">打碎</text>
            <text class="option-tip">更易消化</text>
          </view>
          <view
            class="option-card"
            :class="{ active: preparationMethod === 'DICED' }"
            @tap="selectPreparationMethod('DICED')"
          >
            <text class="option-name">切丁</text>
            <text class="option-tip">帮助咀嚼</text>
          </view>
        </view>
      </view>

      <!-- 第二组：烹饪方式 -->
      <view class="requirement-group cooking-group">
        <view class="option-row">
          <view
            class="option-card option-card-large"
            :class="{ active: cookingMethod === 'RAW' }"
            @tap="selectCookingMethod('RAW')"
          >
            <text class="option-name">生</text>
            <view class="option-tips">
              <text class="option-tip-highlight">喂食前须加热</text>
              <text class="option-tip">加热前无需提前解冻</text>
            </view>
          </view>
          <view
            class="option-card option-card-large"
            :class="{ active: cookingMethod === 'COOKED' }"
            @tap="selectCookingMethod('COOKED')"
          >
            <text class="option-name">预加热</text>
            <view class="option-tips">
              <text class="option-tip">低温预煮</text>
              <text class="option-tip">可提前解冻后放入微波炉加热</text>
              <text class="option-tip-warning">二次加热营养损失更大</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 包装及说明 -->
    <view class="section package-info-section">
      <view class="section-title">
        <text class="title-text">包装及说明</text>
      </view>

      <view class="package-info-row">
        <!-- 左侧：包装示例图片 -->
        <view class="package-example-card">
          <text class="example-title">包装示例</text>
          <view class="example-image-container">
            <image
              v-if="globalConfig.packageExampleImageUrl"
              :src="globalConfig.packageExampleImageUrl"
              class="example-image"
              mode="aspectFill"
            />
            <view v-else class="example-placeholder">
              <text class="placeholder-icon">📦</text>
              <text class="placeholder-text">包装示例图</text>
            </view>
          </view>
        </view>

        <!-- 右侧：包装规格及配送服务 -->
        <view class="package-info-right">
          <!-- 包装说明 -->
          <view class="package-detail-card">
            <view class="detail-title">
              <text class="title-icon">📦</text>
              <text class="title-text">包装规格</text>
            </view>
            <view class="detail-content">
              <text class="detail-text">每餐独立食品真空袋</text>
            </view>
          </view>

          <!-- 快递服务说明 -->
          <view class="shipping-service-card">
            <view class="detail-title">
              <text class="title-icon">🚚</text>
              <text class="title-text">配送服务</text>
            </view>
            <view class="shipping-company">
              <image
                v-if="globalConfig.shippingCompanyLogoUrl"
                :src="globalConfig.shippingCompanyLogoUrl"
                class="shipping-logo-image"
                mode="aspectFit"
              />
              <text v-else class="shipping-logo">SF</text>
              <text class="shipping-name">顺丰生鲜特快</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 价格 -->
    <view class="section price-section" v-if="selectedDog && selectedCycleDays && pricePreview">
      <view class="section-title">
        <text class="title-text">价格</text>
      </view>

      <view class="price-card">
        <view class="price-item">
          <text class="price-label">总金额</text>
          <text class="price-value total">¥{{ pricePreview.amountTotal.toFixed(2) }}</text>
        </view>
        <view class="price-item">
          <text class="price-label">每日预估</text>
          <text class="price-value">¥{{ pricePerDay.toFixed(1) }}/天</text>
        </view>
      </view>
    </view>

    <!-- 价格明细（仅管理员可见） -->
    <view class="section price-breakdown-section" v-if="isAdminUser && selectedDog && selectedCycleDays && pricePreview && pricePreview.pricingBreakdown">
      <view class="section-title" @tap="togglePriceBreakdown">
        <view class="title-row">
          <text class="title-text">💰 价格计算明细</text>
          <text class="toggle-icon">{{ showPriceBreakdown ? '▲' : '▼' }}</text>
        </view>
        <text class="subtitle">点击查看/隐藏详细计算过程</text>
      </view>

      <view v-if="showPriceBreakdown" class="breakdown-content">
        <!-- 原料成本详情 -->
        <view class="breakdown-group">
          <view class="breakdown-group-title clickable" @tap="toggleIngredientDetails">
            <text>📦 原料成本</text>
            <text class="toggle-icon-small">{{ showIngredientDetails ? '▲' : '▼' }}</text>
          </view>
          <view class="breakdown-item summary">
            <text class="breakdown-label">小计</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.costIngredients.toFixed(2) }}</text>
          </view>
          <view v-if="showIngredientDetails && pricePreview.pricingBreakdown.ingredientDetails" class="detail-list">
            <view v-for="(item, index) in pricePreview.pricingBreakdown.ingredientDetails" :key="index" class="detail-item">
              <view class="detail-header">
                <text class="detail-name">{{ item.name }}</text>
                <text class="detail-type">{{ item.type === 'FOOD' ? '食材' : '补剂' }}</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">用量：</text>
                <text class="detail-value">{{ item.amount.toFixed(3) }} {{ item.unit }}</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">单价：</text>
                <text class="detail-value">¥{{ item.unitCost.toFixed(4) }}/{{ item.unit }}</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">成本：</text>
                <text class="detail-value highlight">¥{{ item.cost.toFixed(2) }}</text>
              </view>
              <view class="detail-calculation">{{ item.calculation }}</view>
            </view>
          </view>
        </view>

        <!-- 人工成本详情 -->
        <view class="breakdown-group">
          <view class="breakdown-group-title clickable" @tap="toggleLaborDetails">
            <text>👨‍🍳 人工成本</text>
            <text class="toggle-icon-small">{{ showLaborDetails ? '▲' : '▼' }}</text>
          </view>
          <view class="breakdown-item summary">
            <text class="breakdown-label">小计</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.costLabor.toFixed(2) }}</text>
          </view>
          <view v-if="showLaborDetails && pricePreview.pricingBreakdown.laborDetails" class="detail-box">
            <view class="detail-row">
              <text class="detail-label">标准批次产量：</text>
              <text class="detail-value">{{ pricePreview.pricingBreakdown.laborDetails.standardBatchOutputKg.toFixed(3) }} kg</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">标准人工成本/kg：</text>
              <text class="detail-value">¥{{ pricePreview.pricingBreakdown.laborDetails.standardLaborCostPerKg.toFixed(4) }}</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">投料重量：</text>
              <text class="detail-value">{{ pricePreview.pricingBreakdown.laborDetails.rawInputWeightKg.toFixed(3) }} kg</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">总成本：</text>
              <text class="detail-value highlight">¥{{ pricePreview.pricingBreakdown.laborDetails.totalCost.toFixed(2) }}</text>
            </view>
            <view class="detail-calculation">{{ pricePreview.pricingBreakdown.laborDetails.calculation }}</view>
          </view>
        </view>

        <!-- 间接成本详情 -->
        <view class="breakdown-group">
          <view class="breakdown-group-title clickable" @tap="toggleOverheadDetails">
            <text>🏭 间接成本</text>
            <text class="toggle-icon-small">{{ showOverheadDetails ? '▲' : '▼' }}</text>
          </view>
          <view class="breakdown-item summary">
            <text class="breakdown-label">小计</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.costOverhead.toFixed(2) }}</text>
          </view>
          <view v-if="showOverheadDetails && pricePreview.pricingBreakdown.overheadDetails" class="detail-box">
            <view class="detail-row">
              <text class="detail-label">间接成本/kg：</text>
              <text class="detail-value">¥{{ pricePreview.pricingBreakdown.overheadDetails.overheadCostPerKg.toFixed(4) }}</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">投料重量：</text>
              <text class="detail-value">{{ pricePreview.pricingBreakdown.overheadDetails.rawInputWeightKg.toFixed(3) }} kg</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">总成本：</text>
              <text class="detail-value highlight">¥{{ pricePreview.pricingBreakdown.overheadDetails.totalCost.toFixed(2) }}</text>
            </view>
            <view class="detail-calculation">{{ pricePreview.pricingBreakdown.overheadDetails.calculation }}</view>
          </view>
        </view>

        <!-- 包材成本详情 -->
        <view class="breakdown-group">
          <view class="breakdown-group-title clickable" @tap="togglePackagingDetails">
            <text>📦 包材成本</text>
            <text class="toggle-icon-small">{{ showPackagingDetails ? '▲' : '▼' }}</text>
          </view>
          <view class="breakdown-item summary">
            <text class="breakdown-label">小计</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.costPackaging.toFixed(2) }}</text>
          </view>
          <view v-if="showPackagingDetails && pricePreview.pricingBreakdown.packagingDetails" class="detail-box">
            <!-- 每袋包装 -->
            <view class="detail-subtitle">每袋包装</view>
            <view class="detail-row">
              <text class="detail-label">真空袋：</text>
              <text class="detail-value">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.vacuumBagName }}</text>
              <text class="detail-spec">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.vacuumBagSpec }}</text>
              <text class="detail-count">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.vacuumBagsCount || totalPackages }}个</text>
              <text class="detail-cost">¥{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.vacuumBagTotalCost.toFixed(2) }}</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">标签：</text>
              <text class="detail-value">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.labelName }}</text>
              <text class="detail-spec">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.labelSpec }}</text>
              <text class="detail-count">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.labelsCount || totalPackages }}个</text>
              <text class="detail-cost">¥{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.labelTotalCost.toFixed(2) }}</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">小计：</text>
              <text class="detail-value highlight">¥{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.totalCost.toFixed(2) }}</text>
            </view>
            <view class="detail-calculation">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables.calculation }}</view>

            <!-- 快递包装 -->
            <view class="detail-subtitle">快递包装</view>
            <view v-for="(container, idx) in pricePreview.pricingBreakdown.packagingDetails.shippingContainers" :key="idx" class="detail-item-nested">
              <view class="detail-row">
                <text class="detail-label">纸箱：</text>
                <text class="detail-value">{{ container.boxName }}</text>
                <text class="detail-spec">{{ container.boxSpec }}</text>
                <text class="detail-count">{{ container.boxesCount || 1 }}个</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">保温袋：</text>
                <text class="detail-value">{{ container.thermalBagName }}</text>
                <text class="detail-spec">{{ container.thermalBagSpec }}</text>
                <text class="detail-count">{{ container.thermalBagsCount || 1 }}个</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">冰袋数量：</text>
                <text class="detail-value">{{ container.icePacks }}个</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">小计：</text>
                <text class="detail-value highlight">¥{{ container.totalCost.toFixed(2) }}</text>
              </view>
              <view class="detail-calculation">{{ container.calculation }}</view>
            </view>
          </view>
        </view>

        <!-- 总成本汇总 -->
        <view class="breakdown-group">
          <view class="breakdown-group-title">成本汇总</view>
          <view class="breakdown-item total">
            <text class="breakdown-label">总成本</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.totalProductCost.toFixed(2) }}</text>
          </view>
        </view>

        <!-- 价格计算 -->
        <view class="breakdown-group">
          <view class="breakdown-group-title">价格计算</view>
          <view class="breakdown-item">
            <text class="breakdown-label">产品成本</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.totalProductCost.toFixed(2) }}</text>
          </view>
          <view class="breakdown-item">
            <text class="breakdown-label">毛利（50%）</text>
            <text class="breakdown-value highlight">+¥{{ (pricePreview.pricingBreakdown.productPrice - pricePreview.pricingBreakdown.totalProductCost).toFixed(2) }}</text>
          </view>
          <view class="breakdown-item total">
            <text class="breakdown-label">产品价格</text>
            <text class="breakdown-value">¥{{ pricePreview.pricingBreakdown.productPrice.toFixed(2) }}</text>
          </view>
        </view>

        <!-- 最终金额 -->
        <view class="breakdown-group final">
          <view class="breakdown-item final clickable" @tap="toggleWeightDetails">
            <text class="breakdown-label">物流重量</text>
            <text class="breakdown-value">{{ ((totalGrams + (pricePreview.pricingBreakdown?.weightPackagingG || 0)) / 1000).toFixed(2) }}kg</text>
            <text class="toggle-icon-small">{{ showWeightDetails ? '▲' : '▼' }}</text>
          </view>

          <!-- 物流重量详情 -->
          <view v-if="showWeightDetails && pricePreview.pricingBreakdown?.packagingDetails" class="detail-box" style="margin-top: 12px;">
            <view class="detail-subtitle">物流重量计算流程</view>

            <!-- 计算公式 -->
            <view class="detail-calculation">
              物流重量 = 总食品净重 + 包装材料总重量
            </view>

            <!-- 每袋包装重量 -->
            <view class="detail-subtitle" style="margin-top: 16rpx;">每袋包装材料</view>
            <view class="detail-row">
              <text class="detail-label">真空袋：</text>
              <text class="detail-value">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables?.vacuumBagName || '-' }}</text>
              <text class="detail-spec">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables?.vacuumBagSpec || '' }}</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">产品标签：</text>
              <text class="detail-value">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables?.labelName || '-' }}</text>
              <text class="detail-spec">{{ pricePreview.pricingBreakdown.packagingDetails.perPackConsumables?.labelSpec || '' }}</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">每袋包装重量：</text>
              <text class="detail-value">{{ (pricePreview.pricingBreakdown.packagingDetails.perPackConsumables?.weightPerPack || 0).toFixed(0) }}g</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">总袋数：</text>
              <text class="detail-value">{{ totalPackages }}袋</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">小计：</text>
              <text class="detail-value highlight">{{ ((pricePreview.pricingBreakdown.packagingDetails.perPackConsumables?.weightPerPack || 0) * totalPackages).toFixed(0) }}g</text>
            </view>

            <!-- 快递包装重量 -->
            <view class="detail-subtitle" style="margin-top: 16rpx;">快递包装材料</view>
            <view v-for="(container, idx) in pricePreview.pricingBreakdown.packagingDetails.shippingContainers" :key="idx" class="detail-item-nested">
              <view class="detail-row">
                <text class="detail-label">泡沫箱：</text>
                <text class="detail-value">{{ container.boxName || '-' }}</text>
                <text class="detail-spec">{{ container.boxSpec || '' }}</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">保温袋：</text>
                <text class="detail-value">{{ container.thermalBagName || '-' }}</text>
                <text class="detail-spec">{{ container.thermalBagSpec || '' }}</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">冰袋数量：</text>
                <text class="detail-value">{{ container.icePacks || 0 }}个</text>
              </view>
              <view class="detail-row">
                <text class="detail-label">该包装重量：</text>
                <text class="detail-value highlight">{{ (container.weight || 0).toFixed(0) }}g</text>
              </view>
            </view>

            <!-- 物流总重量 -->
            <view class="detail-row" style="margin-top: 12rpx; padding-top: 12rpx; border-top: 1rpx dashed #d9d9d9;">
              <text class="detail-label">总食品净重：</text>
              <text class="detail-value">{{ Math.round(totalGrams) }}g</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">包装材料总重：</text>
              <text class="detail-value">{{ (pricePreview.pricingBreakdown.weightPackagingG || 0).toFixed(0) }}g</text>
            </view>
            <view class="detail-row">
              <text class="detail-label">物流总重量：</text>
              <text class="detail-value final">{{ ((totalGrams + (pricePreview.pricingBreakdown.weightPackagingG || 0))).toFixed(0) }}g = {{ ((totalGrams + (pricePreview.pricingBreakdown.weightPackagingG || 0)) / 1000).toFixed(2) }}kg</text>
            </view>
          </view>

          <view class="breakdown-item final">
            <text class="breakdown-label">运费</text>
            <text class="breakdown-value">¥{{ pricePreview.amountShipping.toFixed(2) }}</text>
          </view>
          <view class="breakdown-item final total">
            <text class="breakdown-label">最终金额</text>
            <text class="breakdown-value final">¥{{ pricePreview.amountTotal.toFixed(2) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部操作栏 -->
    <view class="bottom-bar">
      <view class="bottom-price">
        <text class="bottom-total">¥{{ pricePreview ? pricePreview.amountTotal.toFixed(2) : '--' }}</text>
        <text class="bottom-estimate">{{ pricePerDayText }}</text>
      </view>
      <button
        class="btn-buy-now"
        :disabled="!canBuyNow"
        @tap="buyNow"
      >
        立即下单
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { request } from '../../utils/api'
import { normalizeImageUrl } from '../../utils/config'
import {
  DEFAULT_ORDER_CYCLE_DAYS,
  ORDER_CYCLE_OPTIONS,
  SOURCE_PLAN_OPTIONS,
  buildDefaultPackagePlan,
  estimateFeedDays,
  getPackagePlanTotal,
  getSourcePlanLabel,
  isMinimumOrderMet,
  type IngredientSourcePlanCode,
  type PackagePlanItem,
} from '../../utils/order-package-plan'

interface Dog {
  id: string
  name: string
  breedName?: string
  breedId?: string
  currentWeightKg: number
  mealsPerDay: number
  birthday?: string
  ageText?: string
  lifeStageOverride?: string
}

interface Recipe {
  id: string
  name: string
  description?: string
  coverImageUrl?: string
  energyDensityKcalPerKg: number
  applicableLifeStages?: string[]
  targetHealthTags?: string[]
}

interface Breed {
  id: string
  name: string
  adultAgeMonths: number
  seniorAgeYears?: number
}

interface CalcResult {
  rer?: number
  totalDer?: number
  finalFoodKcal?: number
  treatDeduction?: number
  isTreatCapped?: boolean
  dailyIntakeG?: number
  calcDetails?: {
    weightKg: number
    ageMonths: number
    sizeClass: string
    lifeStage: string
    stageFactor: number
    bcsMultiplier: number
    isNeutered: boolean
    activityLevel: string
    treatMode: string
    treatLevel?: string
    treatPercentage?: number
  }
}

interface PricePreview {
  amountProduct: number
  amountShipping: number
  amountTotal: number
  pricingBreakdown?: {
    costIngredients: number
    costPackaging: number
    costLabor: number
    costOverhead: number
    totalProductCost: number
    productPrice: number
    weightPackagingG?: number
    ingredientDetails?: IngredientCostItem[]
    packagingDetails?: PackagingCostDetail
    laborDetails?: LaborCostDetail
    overheadDetails?: OverheadCostDetail
  }
}

interface IngredientCostItem {
  name: string
  type: string
  amount: number
  unit: string
  unitCost: number
  cost: number
  calculation: string
  netAmount?: number  // 净需求（不含生产损耗和出肉率）
}

interface PackagingPerPackConsumables {
  vacuumBagName: string
  vacuumBagSpec: string  // 真空袋规格
  labelName: string
  labelSpec: string      // 标签规格
  vacuumBagCost: number
  labelCost: number
  totalCost: number
  weightPerPack: number  // 每袋包装重量
  calculation: string
  vacuumBagsCount: number  // 真空袋总数量
  labelsCount: number      // 标签总数量
}

interface PackagingShippingContainers {
  boxName: string
  boxSpec: string         // 泡沫箱规格
  thermalBagName: string
  thermalBagSpec: string  // 保温袋规格
  icePacks: number
  boxCost: number
  thermalBagCost: number
  icePackCost: number
  labelCost: number
  totalCost: number
  weight: number          // 该包装重量
  calculation: string
  boxesCount: number       // 泡沫箱数量
  thermalBagsCount: number // 保温袋数量
}

interface PackagingCostDetail {
  perPackConsumables: PackagingPerPackConsumables
  shippingContainers: PackagingShippingContainers[]
}

interface LaborCostDetail {
  standardBatchOutputKg: number
  standardLaborCostPerKg: number
  rawInputWeightKg: number
  totalCost: number
  calculation: string
}

interface OverheadCostDetail {
  overheadCostPerKg: number
  rawInputWeightKg: number
  totalCost: number
  calculation: string
}

interface GlobalConfig {
  packageExampleImageUrl?: string
  shippingCompanyLogoUrl?: string
}

// 制作要求枚举
type PreparationMethod = 'CHOPPED' | 'DICED'
type CookingMethod = 'RAW' | 'COOKED'

const recipeId = ref('')
const recipe = ref<Recipe>({
  id: '',
  name: '',
  energyDensityKcalPerKg: 0
})

const dogs = ref<Dog[]>([])
const breeds = ref<Breed[]>([])
const selectedDogId = ref('')
const selectedCycleDays = ref(DEFAULT_ORDER_CYCLE_DAYS)
const selectedSourcePlan = ref<IngredientSourcePlanCode>('MARKET_PREMIUM')
const packagePlan = ref<PackagePlanItem[]>([])
const packagePlanDogId = ref<string | null>(null)
const dogCalcResult = ref<CalcResult | null>(null)

// 生命阶段校验
const isLifeStageMatch = ref(true)
const showWarning = ref(true)
const pricePreview = ref<PricePreview | null>(null)
const pricingSnapshotId = ref<string | null>(null)  // ✅ 新增：快照ID
let pricingPreviewRequestSeq = 0
let dogCalcRequestSeq = 0
let pricePreviewDebounceTimer: ReturnType<typeof setTimeout> | null = null
const globalConfig = ref<GlobalConfig>({})

// 显示的每日饭量
const displayDailyIntakeG = ref(0)

// 制作要求（默认值：打碎、生）
const preparationMethod = ref<PreparationMethod | null>('CHOPPED')
const cookingMethod = ref<CookingMethod | null>('RAW')

// 价格明细展开状态
const showPriceBreakdown = ref(false)
const showIngredientDetails = ref(false)
const showLaborDetails = ref(false)
const showOverheadDetails = ref(false)
const showPackagingDetails = ref(false)

// 权限检查：只有管理员才能查看价格计算明细
const isAdminUser = computed(() => {
  const user = uni.getStorageSync('user')
  return user && user.role === 'ADMIN'
})

// 保质期说明展开状态
const showShelfLife = ref(false)

// 物流重量详情展开状态
const showWeightDetails = ref(false)

// 计算说明展开状态
const showCalculationDetails = ref(false)

// 健康标签UUID到名称的映射（动态加载）
const healthTagUuidLabelMap = ref<Record<string, string>>({})

// 选中的狗狗
const selectedDog = computed(() => {
  return dogs.value.find(d => d.id === selectedDogId.value)
})

// 狗狗选择器的选项（用于 picker）
const dogPickerOptions = computed(() => {
  return dogs.value.map(dog => ({
    id: dog.id,
    label: `${dog.name} | ${dog.breedName || '-'} | ${dog.currentWeightKg}kg | ${dog.mealsPerDay}餐/天`
  }))
})

const normalizedPackagePlan = computed(() =>
  packagePlan.value.map(row => normalizePackagePlanRow(row))
)
const isPackagePlanReadyForDog = computed(() =>
  Boolean(
    selectedDogId.value
    && packagePlanDogId.value === selectedDogId.value
    && normalizedPackagePlan.value.length > 0
    && displayDailyIntakeG.value > 0,
  )
)
const packagePlanTotal = computed(() => getPackagePlanTotal(normalizedPackagePlan.value))
const totalGrams = computed(() => packagePlanTotal.value.totalGrams)
const totalPackages = computed(() => packagePlanTotal.value.totalPackages)
const estimatedFeedDays = computed(() =>
  estimateFeedDays(totalGrams.value, displayDailyIntakeG.value),
)
const minimumOrderMet = computed(() => isMinimumOrderMet(totalGrams.value))
const sourcePlanLabel = computed(() => getSourcePlanLabel(selectedSourcePlan.value))
const perMealG = computed(() => {
  if (!displayDailyIntakeG.value || !selectedDog.value?.mealsPerDay) return 0
  return displayDailyIntakeG.value / selectedDog.value.mealsPerDay
})

const pricePerDay = computed(() => {
  const days = Number(estimatedFeedDays.value)
  if (!pricePreview.value || !Number.isFinite(days) || days <= 0) return 0
  return pricePreview.value.amountTotal / days
})
const pricePerDayText = computed(() => {
  const days = Number(estimatedFeedDays.value)
  if (!pricePreview.value || !Number.isFinite(days) || days <= 0) return '--/天'
  return `约 ¥${(pricePreview.value.amountTotal / days).toFixed(1)}/天`
})

// 是否可以立即购买
const canBuyNow = computed(() => {
  return Boolean(
    selectedDogId.value
    && selectedCycleDays.value
    && isPackagePlanReadyForDog.value
    && minimumOrderMet.value
    && pricePreview.value !== null
    && pricingSnapshotId.value !== null
    && displayDailyIntakeG.value > 0,
  )
})

function resetPricePreviewState() {
  pricePreview.value = null
  pricingSnapshotId.value = null
}

// 原料分组计算属性
const foodIngredients = computed(() => {
  if (!pricePreview.value?.pricingBreakdown?.ingredientDetails) return []
  return pricePreview.value.pricingBreakdown.ingredientDetails.filter(item => item.type === 'FOOD')
})

const supplementIngredients = computed(() => {
  if (!pricePreview.value?.pricingBreakdown?.ingredientDetails) return []
  return pricePreview.value.pricingBreakdown.ingredientDetails.filter(item => item.type === 'SUPPLEMENT')
})

const foodTotalWeight = computed(() => {
  return foodIngredients.value.reduce((sum, item) =>
    sum + ((item.netAmount ?? item.amount) * 1000), 0
  ).toFixed(3)
})

const foodCount = computed(() => {
  return foodIngredients.value.length
})

// 自动配置参数（从订单详情页"再次购买"传递）
const autoConfigParams = ref<{
  dogId?: string
  packageCount?: number
  perMealG?: number
}>({})

onMounted(async () => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any

  recipeId.value = currentPage.options?.recipeId || ''

  // 解析自动配置参数
  if (currentPage.options?.autoConfig === 'true') {
    autoConfigParams.value = {
      dogId: currentPage.options?.dogId,
      packageCount: currentPage.options?.packageCount ? Number(currentPage.options.packageCount) : undefined,
      perMealG: currentPage.options?.perMealG ? Number(currentPage.options.perMealG) : undefined,
    }
  }

  if (recipeId.value) {
    // 必须先加载品种数据，因为狗狗生命阶段计算需要品种信息
    await loadBreeds()
    await loadHealthTagMapping()  // 加载健康标签映射
    await loadRecipeDetail()
    await loadDogs()
    loadGlobalConfig()
  }
})

onUnmounted(() => {
  clearPricePreviewDebounce()
})

async function loadBreeds() {
  console.log('[RecipeOrder] loadBreeds 开始')

  try {
    const res = await request({
      url: '/dogs/breeds',
      method: 'GET'
    })

    console.log('[RecipeOrder] loadBreeds API响应:', res)

    if (res.code === 0 && res.data) {
      breeds.value = res.data
      console.log('[RecipeOrder] 品种列表加载成功, 数量:', res.data.length)
    }
  } catch (error) {
    console.error('[RecipeOrder] Load breeds error:', error)
  }

  console.log('[RecipeOrder] loadBreeds 结束')
}

async function loadHealthTagMapping() {
  try {
    const res = await request({
      url: '/recipes/filter-options',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      // 建立健康标签UUID到label的映射
      const uuidMap: Record<string, string> = {}
      if (res.data.healthTags && Array.isArray(res.data.healthTags)) {
        res.data.healthTags.forEach((tag: any) => {
          if (tag.value && tag.label) {
            uuidMap[tag.value] = tag.label
          }
        })
      }
      healthTagUuidLabelMap.value = uuidMap
    }
  } catch (error) {
    console.error('[RecipeOrder] Load health tag mapping error:', error)
  }
}

async function loadRecipeDetail() {
  try {
    const res = await request({
      url: `/recipes/${recipeId.value}`,
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      recipe.value = res.data
    }
  } catch (error) {
    console.error('Load recipe error:', error)
  }
}

async function loadDogs() {
  try {
    const res = await request({
      url: '/dogs',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      dogs.value = res.data

      // 自动选中狗狗（优先使用自动配置参数中的 dogId）
      if (dogs.value.length > 0 && !selectedDogId.value) {
        if (autoConfigParams.value.dogId) {
          // 检查指定的 dogId 是否存在
          const dogExists = dogs.value.find(d => d.id === autoConfigParams.value.dogId)
          if (dogExists) {
            selectDog(autoConfigParams.value.dogId!)
          } else {
            // 如果指定的狗狗不存在，选中第一个
            selectDog(dogs.value[0].id)
          }
        } else {
          // 没有自动配置参数，选中第一个
          selectDog(dogs.value[0].id)
        }
      }
    }
  } catch (error) {
    console.error('Load dogs error:', error)
  }
}

function onDogPickerChange(e: any) {
  const index = e.detail.value
  const dog = dogs.value[index]
  if (dog) {
    selectDog(dog.id)
  }
}

// ========== 生命阶段校验逻辑 ==========

function checkLifeStageMatch() {
  console.log('[RecipeOrder] checkLifeStageMatch 开始')

  if (!selectedDog.value || !recipe.value) {
    console.log('[RecipeOrder] 缺少必要数据，跳过校验')
    return
  }

  const dogLifeStage = getDogLifeStage(selectedDog.value)
  const applicableStages = recipe.value.applicableLifeStages || []

  // 详细调试日志
  console.log('[RecipeOrder] 生命阶段校验详情:', {
    '狗狗名字': selectedDog.value.name,
    '狗狗生日': selectedDog.value.birthday,
    '狗狗品种ID': selectedDog.value.breedId,
    '生命阶段覆盖值': selectedDog.value.lifeStageOverride,
    '计算的狗狗生命阶段': dogLifeStage,
    '食谱适用生命阶段': applicableStages,
    '食谱名称': recipe.value.name,
    '检查结果': applicableStages.includes(dogLifeStage),
    'breeds列表长度': breeds.value.length,
    'breeds列表': breeds.value.map(b => ({ id: b.id, name: b.name, adultAgeMonths: b.adultAgeMonths }))
  })

  // 如果无法判断生命阶段（无品种信息），跳过警告
  if (dogLifeStage === null) {
    console.log('[RecipeOrder] 无法判断狗狗生命阶段（无品种信息），跳过警告')
    isLifeStageMatch.value = true
  } else {
    isLifeStageMatch.value = applicableStages.includes(dogLifeStage)
    console.log('[RecipeOrder] 校验结果:', isLifeStageMatch.value ? '匹配' : '不匹配')
  }

  // 每次切换狗狗时重置警告状态
  showWarning.value = true

  console.log('[RecipeOrder] 警告卡片显示条件:', {
    '!isLifeStageMatch': !isLifeStageMatch.value,
    'selectedDog': !!selectedDog.value,
    'showWarning': showWarning.value,
    '应该显示警告': !isLifeStageMatch.value && selectedDog.value && showWarning.value
  })
}

function getDogLifeStage(dog: Dog): string | null {
  console.log('[getDogLifeStage] 开始计算狗狗生命阶段:', dog.name)

  // 优先使用用户设置的覆盖值
  if (dog.lifeStageOverride && dog.lifeStageOverride !== 'NONE') {
    console.log('[getDogLifeStage] 使用用户设置的覆盖值:', dog.lifeStageOverride)
    return dog.lifeStageOverride
  }

  // 根据品种和年龄自动判断
  const birthday = new Date(dog.birthday)
  const now = new Date()

  const ageInDays = Math.floor((now.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24))
  const ageInMonths = Math.floor(ageInDays / 30.4375)
  const ageInYears = ageInMonths / 12.0

  console.log('[getDogLifeStage] 年龄计算:', {
    ageInDays,
    ageInMonths,
    ageInYears
  })

  // 在本地breeds列表中查找品种对象
  const breed = breeds.value.find(b => b.id === dog.breedId)

  if (!breed || !breed.adultAgeMonths) {
    console.log('[getDogLifeStage] 缺少完整的品种信息，返回null')
    return null
  }

  // 使用品种特定的标准
  const adultAgeMonths = breed.adultAgeMonths
  const seniorAgeYears = breed.seniorAgeYears || 7

  if (ageInMonths < adultAgeMonths) {
    return 'PUPPY'
  } else if (ageInYears >= seniorAgeYears) {
    return 'SENIOR'
  } else {
    return 'ADULT'
  }
}

function getDogLifeStageLabel(dog: Dog): string {
  const stage = getDogLifeStage(dog)

  if (stage === null) {
    return '未知'
  }

  const stageMap: Record<string, string> = {
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年犬',
  }
  return stageMap[stage] || stage
}

function getLifeStageLabel(stage: string): string {
  const stageMap: Record<string, string> = {
    'PUPPY': '幼犬',
    'ADULT': '成犬',
    'SENIOR': '老年犬',
  }
  return stageMap[stage] || stage
}

function getHealthTagLabel(tagOrUuid: string): string {
  // 优先使用动态映射（UUID -> label）
  if (healthTagUuidLabelMap.value[tagOrUuid]) {
    return healthTagUuidLabelMap.value[tagOrUuid]
  }

  // 兼容旧的枚举值（用于向后兼容）
  const enumMap: Record<string, string> = {
    'HEALTHY': '健康',
    'PICKY_EATER': '挑食',
    'SENSITIVE_STOMACH': '敏感胃',
    'PANCREATITIS_SUPPORT': '胰腺炎友好',
    'LOW_FAT': '低脂',
    'SKIN_COAT_CARE': '护肤',
  }

  if (enumMap[tagOrUuid]) {
    return enumMap[tagOrUuid]
  }

  return tagOrUuid
}

function dismissWarning() {
  showWarning.value = false
}

// ========== 结束：生命阶段校验逻辑 ==========

async function loadGlobalConfig() {
  try {
    const res = await request({
      url: '/global-config',
      method: 'GET'
    })
    if (res.code === 0 && res.data) {
      globalConfig.value = {
        packageExampleImageUrl: res.data.packageExampleImageUrl || '',
        shippingCompanyLogoUrl: res.data.shippingCompanyLogoUrl || ''
      }
    }
  } catch (error) {
    console.error('Load global config error:', error)
  }
}

function selectDog(dogId: string) {
  clearPricePreviewDebounce()
  pricingPreviewRequestSeq += 1
  selectedDogId.value = dogId
  packagePlan.value = []
  displayDailyIntakeG.value = 0
  dogCalcResult.value = null
  packagePlanDogId.value = null
  resetPricePreviewState()
  loadDogCalcResult(dogId)
  checkLifeStageMatch()  // 校验生命阶段
}

async function loadDogCalcResult(dogId: string) {
  const requestSeq = ++dogCalcRequestSeq
  console.log('========== [RecipeOrder] loadDogCalcResult 开始 ==========')
  console.log('[调用参数]', {
    dogId,
    recipeId: recipeId.value
  })
  console.log('[更新前]', {
    perMealG: perMealG.value,
    displayDailyIntakeG: displayDailyIntakeG.value
  })

  try {
    // 调用新的API：POST /dogs/:id/calc-for-recipe
    const res = await request({
      url: `/dogs/${dogId}/calc-for-recipe`,
      method: 'POST',
      data: {
        recipeId: recipeId.value
      }
    })

    if (res.code === 0 && res.data) {
      if (requestSeq !== dogCalcRequestSeq || dogId !== selectedDogId.value) {
        return
      }

      const result = res.data

      console.log('[API返回]', {
        perMealIntakeG: result.perMealIntakeG,
        dailyIntakeG: result.dailyIntakeG
      })

      // 保存计算结果 - 完整映射所有字段
      dogCalcResult.value = {
        rer: result.rer,
        totalDer: result.totalDer,
        finalFoodKcal: result.finalFoodKcal,
        treatDeduction: result.treatDeduction,
        isTreatCapped: result.isTreatCapped,
        dailyIntakeG: result.dailyIntakeG,
        calcDetails: result.calcDetails
      }

      // 重新计算每日饭量：每餐饭量 × 每日餐数
      displayDailyIntakeG.value = result.perMealIntakeG * (selectedDog.value?.mealsPerDay || 2)
      rebuildPackagePlan()

      console.log('[更新后]', {
        perMealG: perMealG.value,
        displayDailyIntakeG: displayDailyIntakeG.value,
        packagePlan: packagePlan.value
      })
      console.log('========== [RecipeOrder] loadDogCalcResult 结束 ==========')

      // 应用自动配置参数（如果有）
      applyAutoConfig()

      // 加载价格预览
      loadPricePreview()
    }
  } catch (error) {
    if (requestSeq !== dogCalcRequestSeq) {
      return
    }

    console.error('Load dog calc error:', error)

    // 显示错误提示
    uni.showToast({
      title: '饭量计算失败',
      icon: 'none'
    })
  }
}

// 应用自动配置参数
function applyAutoConfig() {
  const params = autoConfigParams.value

  if (params.perMealG && params.perMealG > 0) {
    displayDailyIntakeG.value = params.perMealG * (selectedDog.value?.mealsPerDay || 2)
    console.log('[AutoConfig] 已设置每餐饭量:', params.perMealG)
  }

  if (params.packageCount) {
    const mealsPerDay = selectedDog.value?.mealsPerDay || 2
    const cycleDays = Math.round(params.packageCount / mealsPerDay)
    if ((ORDER_CYCLE_OPTIONS as readonly number[]).includes(cycleDays)) {
      selectedCycleDays.value = cycleDays
      console.log('[AutoConfig] 已设置订购周期:', cycleDays, '天')
    }
  }

  rebuildPackagePlan()
}

function rebuildPackagePlan() {
  packagePlan.value = buildDefaultPackagePlan({
    dailyIntakeG: displayDailyIntakeG.value,
    mealsPerDay: selectedDog.value?.mealsPerDay || 2,
    days: selectedCycleDays.value,
  })
  packagePlanDogId.value = selectedDogId.value
}

function normalizePackagePlanRow(row: PackagePlanItem): PackagePlanItem {
  return {
    packageSpecG: Math.max(1, Math.floor(Number(row.packageSpecG) || 1)),
    packageCount: Math.max(1, Math.floor(Number(row.packageCount) || 1)),
  }
}

function clearPricePreviewDebounce() {
  if (pricePreviewDebounceTimer !== null) {
    clearTimeout(pricePreviewDebounceTimer)
    pricePreviewDebounceTimer = null
  }
}

function schedulePricePreview() {
  clearPricePreviewDebounce()
  pricePreviewDebounceTimer = setTimeout(() => {
    pricePreviewDebounceTimer = null
    loadPricePreview()
  }, 300)
}

function invalidatePackagePlanPricingPreview() {
  clearPricePreviewDebounce()
  pricingPreviewRequestSeq += 1
  resetPricePreviewState()
}

function addPackagePlanRow() {
  packagePlan.value = [
    ...packagePlan.value,
    {
      packageSpecG: Math.max(1, Math.round(perMealG.value || displayDailyIntakeG.value || 100)),
      packageCount: 1,
    },
  ]
  invalidatePackagePlanPricingPreview()
  schedulePricePreview()
}

function updatePackagePlanRow(index: number, field: keyof PackagePlanItem, value: string | number) {
  const nextValue = Math.max(1, Math.floor(Number(value) || 1))
  packagePlan.value = packagePlan.value.map((row, rowIndex) =>
    rowIndex === index ? { ...row, [field]: nextValue } : row
  )
  invalidatePackagePlanPricingPreview()
  schedulePricePreview()
}

function removePackagePlanRow(index: number) {
  if (packagePlan.value.length <= 1) {
    return
  }
  packagePlan.value = packagePlan.value.filter((_, rowIndex) => rowIndex !== index)
  invalidatePackagePlanPricingPreview()
  schedulePricePreview()
}

function selectSourcePlan(code: IngredientSourcePlanCode) {
  selectedSourcePlan.value = code
  loadPricePreview()
}

// 选择制作工艺
function selectPreparationMethod(method: PreparationMethod) {
  preparationMethod.value = method
  loadPricePreview()
}

// 选择烹饪工艺
function selectCookingMethod(method: CookingMethod) {
  cookingMethod.value = method
  loadPricePreview()
}

// 切换价格明细显示
function togglePriceBreakdown() {
  showPriceBreakdown.value = !showPriceBreakdown.value
}

// 切换原料成本详情
function toggleIngredientDetails() {
  showIngredientDetails.value = !showIngredientDetails.value
}

// 切换人工成本详情
function toggleLaborDetails() {
  showLaborDetails.value = !showLaborDetails.value
}

// 切换间接成本详情
function toggleOverheadDetails() {
  showOverheadDetails.value = !showOverheadDetails.value
}

// 切换包材成本详情
function togglePackagingDetails() {
  showPackagingDetails.value = !showPackagingDetails.value
}

// 切换计算说明
function toggleCalculationDetails() {
  showCalculationDetails.value = !showCalculationDetails.value
}

// 切换保质期说明
function toggleShelfLife() {
  showShelfLife.value = !showShelfLife.value
}

// 切换物流重量详情
function toggleWeightDetails() {
  showWeightDetails.value = !showWeightDetails.value
}

function selectCycle(days: number) {
  selectedCycleDays.value = days
  rebuildPackagePlan()
  loadPricePreview()
}

async function loadPricePreview() {
  const requestSeq = ++pricingPreviewRequestSeq
  resetPricePreviewState()

  if (!selectedDog.value || !isPackagePlanReadyForDog.value) return
  if (!minimumOrderMet.value) return

  try {
    const res = await request({
      url: '/orders/pricing/preview',
      method: 'POST',
      data: {
        dogId: selectedDogId.value,
        type: 'FRESH_FOOD',
        ingredientSourcePlan: selectedSourcePlan.value,
        items: [{
          recipeId: recipeId.value,
          packagePlan: normalizedPackagePlan.value,
          dailyIntakeG: displayDailyIntakeG.value,
          preparationMethod: preparationMethod.value || undefined,
          cookingMethod: cookingMethod.value || undefined,
        }]
      }
    })
    if (res.code === 0 && res.data) {
      if (requestSeq !== pricingPreviewRequestSeq) {
        return
      }

      pricePreview.value = {
        amountProduct: res.data.amountProduct || 0,
        amountShipping: res.data.amountShipping || 0,
        amountTotal: res.data.amountTotal || 0,
        pricingBreakdown: res.data.pricingBreakdown || undefined
      }
      // ✅ 保存快照ID
      pricingSnapshotId.value = res.data.snapshotId || null
      console.log('[Price Preview] Snapshot ID:', pricingSnapshotId.value)
    }
  } catch (error: any) {
    if (requestSeq !== pricingPreviewRequestSeq) {
      return
    }

    // 如果是订单净重不足的错误，不打印到控制台（避免大量红色日志）
    // 这是预期的业务逻辑验证，界面上已有警告提示
    if (!error?.message?.includes('订单净重不足')) {
      console.error('Load price preview error:', error)
    }

    // 订单净重不足时，清空价格预览
    resetPricePreviewState()
  }
}

async function buyNow() {
  if (!canBuyNow.value) return

  // ✅ 安全改进：使用快照ID而不是传递所有参数（防止价格篡改）
  if (!pricingSnapshotId.value) {
    uni.showToast({
      title: '价格预览未完成，请稍候',
      icon: 'none'
    })
    return
  }

  const orderConfig = {
    snapshotId: pricingSnapshotId.value,
    dogName: selectedDog.value?.name || '',
    breedName: selectedDog.value?.breedName || '',
    weightKg: selectedDog.value?.currentWeightKg || 0,
    mealsPerDay: selectedDog.value?.mealsPerDay || 2,
    dailyIntakeG: displayDailyIntakeG.value,
    estimatedFeedDays: estimatedFeedDays.value,
    recipeName: recipe.value.name,
    recipeCoverImage: recipe.value.coverImageUrl || '',
    packagePlan: normalizedPackagePlan.value,
    totalPackages: totalPackages.value,
    totalGrams: totalGrams.value,
    ingredientSourcePlan: selectedSourcePlan.value,
    ingredientSourcePlanLabel: sourcePlanLabel.value,
    preparationMethod: preparationMethod.value || 'CHOPPED',
    cookingMethod: cookingMethod.value || 'RAW',
    amountProduct: pricePreview.value?.amountProduct || 0,
    amountShipping: pricePreview.value?.amountShipping || 0,
    amountTotal: pricePreview.value?.amountTotal || 0,
  }

  uni.setStorageSync('direct_buy_order_config', orderConfig)

  uni.navigateTo({
    url: `/pages/checkout/index?mode=directBuy&snapshotId=${encodeURIComponent(pricingSnapshotId.value)}`
  })
}

function goToCreateDog() {
  uni.navigateTo({
    url: '/pages/dog-create/index'
  })
}
</script>

<style scoped>
.recipe-order-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

/* 食谱头部 */
.recipe-header {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.recipe-cover-wrapper {
  width: 100%;
  padding-bottom: 56.25%; /* 16:9 比例 */
  position: relative;
  margin-bottom: 20rpx;
}

.recipe-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 12rpx;
}

.recipe-info {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.recipe-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  line-height: 1.4;
  text-align: center;
}

.recipe-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  justify-content: center;
  margin-top: 12rpx;
}

.recipe-tags .tag {
  display: inline-block;
  padding: 6rpx 16rpx;
  border-radius: 6rpx;
  font-size: 22rpx;
}

.recipe-tags .life-stage-tag {
  background-color: #e3f2fd;
  color: #1976d2;
}

.recipe-tags .health-tag {
  background-color: #fff3e0;
  color: #f57c00;
}

/* 通用区块 */
.section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

/* 警告卡片 */
.warning-card {
  background-color: #fffbe6;
  border: 1rpx solid #ffe58f;
  border-radius: 12rpx;
  padding: 20rpx;
  margin-bottom: 20rpx;
}

.warning-header {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.warning-icon {
  font-size: 32rpx;
  margin-right: 8rpx;
}

.warning-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #856404;
}

.warning-text {
  font-size: 26rpx;
  color: #856404;
  line-height: 1.6;
  display: block;
  margin-bottom: 8rpx;
}

.btn-continue {
  width: 100%;
  margin-top: 16rpx;
  padding: 16rpx;
  background-color: #faad14;
  color: #fff;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;
}

.section-title {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.title-text {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  flex: 1;
}

.clickable {
  cursor: pointer;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
  margin-left: 8rpx;
}

.required {
  color: #ff4d4f;
  margin-left: 8rpx;
  font-size: 32rpx;
}

/* 狗狗选择 */
.empty-dogs {
  text-align: center;
  padding: 60rpx 0;
}

.empty-text {
  display: block;
  font-size: 28rpx;
  color: #999;
  margin-bottom: 30rpx;
}

.btn-create-dog {
  width: 240rpx;
  height: 70rpx;
  line-height: 70rpx;
  background-color: #1890ff;
  color: #fff;
  border-radius: 35rpx;
  font-size: 28rpx;
  border: none;
}

.dog-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
  background-color: #fff;
}

.picker-placeholder {
  font-size: 28rpx;
  color: #999;
}

.dog-selected {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 12rpx;
}

.dog-emoji {
  font-size: 32rpx;
}

.dog-text {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.picker-arrow {
  font-size: 24rpx;
  color: #999;
}

/* 预估喂食量 */
.feeding-section {
  border-top: 1rpx solid #e8e8e8;
}

.feeding-info {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.feeding-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.feeding-label {
  font-size: 28rpx;
  color: #666;
}

.feeding-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.feeding-value.readonly {
  color: #999;
}

.feeding-value-wrapper {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.feeding-edit-wrapper {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.feeding-input-small {
  width: 100rpx;
  height: 60rpx;
  text-align: center;
  border: 2rpx solid #1890ff;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  background-color: #fff;
}

.feeding-unit {
  font-size: 26rpx;
  color: #999;
}

.btn-edit {
  padding: 8rpx 20rpx;
  background-color: #fff;
  color: #1890ff;
  border: 2rpx solid #1890ff;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
}

.btn-reset {
  padding: 8rpx 20rpx;
  background-color: #fff;
  color: #ff9800;
  border: 2rpx solid #ff9800;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
}

.btn-save {
  padding: 8rpx 20rpx;
  background-color: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
}

.btn-cancel {
  padding: 8rpx 20rpx;
  background-color: #fff;
  color: #999;
  border: 2rpx solid #ddd;
  border-radius: 8rpx;
  font-size: 26rpx;
  line-height: 1.2;
}

/* 计算说明 */
.calculation-explanation {
  margin-top: 24rpx;
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  border: 2rpx solid #e8e8e8;
}

.explanation-header {
  cursor: pointer;
}

.explanation-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.explanation-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.explanation-content {
  margin-top: 20rpx;
}

.calc-cards {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.calc-card {
  padding: 20rpx;
  background-color: #fff;
  border-radius: 12rpx;
  border: 2rpx solid #e8e8e8;
}

.calc-card.highlight {
  border-color: #ffd591;
  background-color: #fffbf0;
}

.card-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
  display: block;
}

.formula-box {
  padding: 12rpx 16rpx;
  background-color: #f0f9ff;
  border-radius: 8rpx;
  border: 1rpx solid #bae7ff;
  margin-bottom: 12rpx;
}

.formula-text {
  font-size: 24rpx;
  color: #0050b3;
  font-family: 'Courier New', monospace;
  line-height: 1.5;
}

.step-data {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-bottom: 12rpx;
}

.data-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 24rpx;
}

.data-label {
  color: #666;
  min-width: 160rpx;
}

.data-value {
  color: #333;
  font-weight: 500;
}

.calc-result {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 12rpx 16rpx;
  background-color: #f6ffed;
  border-radius: 8rpx;
  border: 1rpx solid #b7eb8f;
}

.calc-result.final {
  background-color: #fff7e6;
  border-color: #ffd591;
}

.result-value {
  font-size: 28rpx;
  color: #333;
  font-weight: bold;
}

.result-value.highlight {
  color: #ff4d4f;
  font-size: 32rpx;
}

.result-note {
  font-size: 22rpx;
  color: #999;
  font-style: italic;
}

.result-warning {
  font-size: 22rpx;
  color: #ff4d4f;
  font-weight: bold;
}

/* 订购周期 */
.cycle-options {
  display: flex;
  gap: 12rpx;
}

.cycle-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 12rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
}

.cycle-option.active {
  border-color: #1890ff;
  background-color: #f0f9ff;
}

.cycle-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.cycle-desc {
  font-size: 24rpx;
  color: #999;
}

.total-summary {
  display: flex;
  justify-content: space-between;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
  gap: 24rpx;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.summary-label {
  font-size: 28rpx;
  color: #666;
}

.summary-value {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
}

.package-plan-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.package-plan-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.package-input-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.package-input-label,
.package-input-unit {
  font-size: 24rpx;
  color: #666;
  flex-shrink: 0;
}

.package-input {
  width: 120rpx;
  height: 60rpx;
  text-align: center;
  border: 2rpx solid #e8e8e8;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #333;
  background-color: #fff;
}

.btn-add-row {
  min-width: 112rpx;
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 20rpx;
  background-color: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 24rpx;
}

.btn-remove-row {
  min-width: 96rpx;
  height: 56rpx;
  line-height: 56rpx;
  padding: 0 16rpx;
  background-color: #fff;
  color: #ff4d4f;
  border: 2rpx solid #ffccc7;
  border-radius: 8rpx;
  font-size: 24rpx;
}

.btn-remove-row[disabled] {
  color: #bfbfbf;
  border-color: #f0f0f0;
}

.package-summary {
  margin-top: 20rpx;
}

.source-plan-options {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.source-plan-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
  background-color: #fff;
}

.source-plan-option.active {
  border-color: #1890ff;
  background-color: #f0f9ff;
}

.source-plan-main {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.source-plan-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.source-plan-desc {
  font-size: 24rpx;
  color: #666;
  line-height: 1.4;
}

.source-plan-check {
  font-size: 32rpx;
  color: #1890ff;
  font-weight: bold;
  margin-left: 16rpx;
}

.product-intro-section {
  padding: 0;
  overflow: hidden;
}

.product-intro-image {
  display: block;
  width: 100%;
}

.min-order-warning {
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff7e6;
  border: 2rpx solid #ffa940;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.warning-icon {
  font-size: 32rpx;
}

.warning-text {
  font-size: 26rpx;
  color: #d46b08;
  line-height: 1.4;
}

/* 保质期说明 */
.shelf-life-notice {
  margin-top: 20rpx;
  padding: 20rpx;
  background-color: #f0f9ff;
  border: 2rpx solid #91d5ff;
  border-radius: 12rpx;
}

.notice-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.notice-title-text {
  font-size: 28rpx;
  font-weight: bold;
  color: #0050b3;
}

.notice-content {
  margin-top: 12rpx;
}

.notice-item {
  display: flex;
  align-items: flex-start;
  gap: 8rpx;
  margin-bottom: 10rpx;
}

.notice-item:last-child {
  margin-bottom: 0;
}

.notice-dot {
  font-size: 24rpx;
  flex-shrink: 0;
  margin-top: 2rpx;
}

.notice-text {
  font-size: 24rpx;
  color: #333;
  line-height: 1.5;
  flex: 1;
}

/* 原料清单 */
.ingredients-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.ingredients-content {
  margin-top: 16rpx;
}

.no-ingredients {
  padding: 40rpx 0;
  text-align: center;
}

.no-data-text {
  color: #999;
  font-size: 28rpx;
}

/* 原料分组 */
.ingredient-group {
  margin-bottom: 32rpx;
}

.ingredient-group:last-child {
  margin-bottom: 0;
}

.ingredient-category-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #333;
  padding: 16rpx 0;
  border-bottom: 2rpx solid #f0f0f0;
  margin-bottom: 16rpx;
}

.ingredient-header {
  display: flex;
  padding: 12rpx 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  margin-bottom: 8rpx;
}

.ingredient-header-item {
  flex: 1;
  font-size: 26rpx;
  color: #666;
  text-align: center;
  font-weight: 500;
}

.ingredient-row {
  display: flex;
  padding: 16rpx;
  border-bottom: 1rpx solid #f5f5f5;
}

.ingredient-row:last-child {
  border-bottom: none;
}

.ingredient-item {
  flex: 1;
  font-size: 26rpx;
  color: #333;
  text-align: center;
  word-break: break-all;
}

.ingredient-summary-row {
  padding: 16rpx;
  background-color: #fff7e6;
  border-radius: 8rpx;
  margin-top: 12rpx;
  border-left: 4rpx solid #ff9800;
}

.summary-text {
  font-size: 28rpx;
  color: #ff9800;
  font-weight: 500;
}

/* 制作要求 */
.requirements-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.requirement-group {
  margin-bottom: 20rpx;
}

.requirement-group:last-child {
  margin-bottom: 0;
}

/* 第一组：口感选择 - 橙色主题 */
.preparation-group {
  padding: 20rpx;
  background-color: #fff7e6;
  border-radius: 12rpx;
  border: 2rpx solid #ffe7ba;
}

/* 第二组：烹饪方式 - 绿色主题 */
.cooking-group {
  padding: 20rpx;
  background-color: #f6ffed;
  border-radius: 12rpx;
  border: 2rpx solid #d9f7be;
}

.option-row {
  display: flex;
  gap: 16rpx;
}

.option-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 16rpx;
  border: 2rpx solid rgba(0, 0, 0, 0.1);
  border-radius: 12rpx;
  text-align: center;
  background-color: #fff;
  transition: all 0.3s;
}

.option-card-large {
  min-height: 180rpx;
  justify-content: center;
}

.option-name {
  font-size: 30rpx;
  color: #333;
  margin-bottom: 12rpx;
  font-weight: bold;
}

.option-tip {
  font-size: 22rpx;
  color: #666;
  line-height: 1.5;
}

.option-tips {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.option-tip-highlight {
  font-size: 22rpx;
  color: #ff4d4f;
  font-weight: bold;
  line-height: 1.5;
}

.option-tip-warning {
  font-size: 22rpx;
  color: #faad14;
  line-height: 1.5;
}

/* 第一组选中状态 - 橙色 */
.preparation-group .option-card.active {
  border-color: #fa8c16;
  background-color: #fff7e6;
}

.preparation-group .option-card.active .option-name {
  color: #fa8c16;
}

/* 第二组选中状态 - 绿色 */
.cooking-group .option-card.active {
  border-color: #52c41a;
  background-color: #f6ffed;
}

.cooking-group .option-card.active .option-name {
  color: #52c41a;
}

/* 包装及说明 */
.package-info-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.package-info-row {
  display: flex;
  gap: 20rpx;
}

/* 左侧：包装示例图片 */
.package-example-card {
  flex-shrink: 0;
  padding: 20rpx;
  background-color: #f0f9ff;
  border: 2rpx solid #91d5ff;
  border-radius: 12rpx;
}

.example-title {
  font-size: 26rpx;
  font-weight: bold;
  color: #0050b3;
  margin-bottom: 16rpx;
  display: block;
}

.example-image-container {
  width: 280rpx;
  height: 210rpx; /* 4:3 比例 */
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff;
  border-radius: 8rpx;
  overflow: hidden;
}

.example-image {
  width: 100%;
  height: 100%;
}

.example-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.placeholder-icon {
  font-size: 80rpx;
}

.placeholder-text {
  font-size: 24rpx;
  color: #999;
}

/* 右侧：包装规格及配送服务 */
.package-info-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.package-detail-card,
.shipping-service-card {
  flex: 1;
  padding: 20rpx;
  background-color: #f0f9ff;
  border: 2rpx solid #91d5ff;
  border-radius: 12rpx;
}

.package-detail-card:last-child,
.shipping-service-card:last-child {
  margin-bottom: 0;
}

.detail-title {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 12rpx;
}

.title-icon {
  font-size: 24rpx;
}

.title-text {
  font-size: 26rpx;
  font-weight: bold;
  color: #0050b3;
}

.detail-content {
  padding-left: 32rpx;
}

.detail-text {
  font-size: 24rpx;
  color: #333;
  line-height: 1.6;
}

.shipping-company {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;
  padding-left: 32rpx;
}

.shipping-logo {
  width: 60rpx;
  height: 60rpx;
  line-height: 60rpx;
  text-align: center;
  background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
  color: #fff;
  font-size: 24rpx;
  font-weight: bold;
  border-radius: 8rpx;
}

.shipping-logo-image {
  width: 60rpx;
  height: 60rpx;
  border-radius: 8rpx;
}

.shipping-name {
  font-size: 26rpx;
  font-weight: bold;
  color: #ff6b35;
}

/* 价格 */
.price-card {
  padding: 24rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.price-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #e8e8e8;
}

.price-item:last-child {
  border-bottom: none;
}

.price-label {
  font-size: 28rpx;
  color: #666;
}

.price-value {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.price-value.total {
  font-size: 36rpx;
  color: #ff4d4f;
}

/* 价格明细 */
.price-breakdown-section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
}

.price-breakdown-section .section-title {
  cursor: pointer;
}

.title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle-icon {
  font-size: 24rpx;
  color: #999;
}

.subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #999;
}

.breakdown-content {
  margin-top: 20rpx;
}

.breakdown-group {
  margin-bottom: 24rpx;
  padding: 20rpx;
  background-color: #f9f9f9;
  border-radius: 12rpx;
}

.breakdown-group:last-child {
  margin-bottom: 0;
}

.breakdown-group.final {
  background-color: #fff7e6;
  border: 2rpx solid #ffd591;
}

.breakdown-group-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 16rpx;
  padding-bottom: 12rpx;
  border-bottom: 1rpx solid #e8e8e8;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
}

.breakdown-item.total {
  padding-top: 16rpx;
  margin-top: 8rpx;
  border-top: 1rpx dashed #d9d9d9;
}

.breakdown-item.final {
  padding: 16rpx 0;
}

.breakdown-label {
  font-size: 26rpx;
  color: #666;
}

.breakdown-value {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
}

.breakdown-value.highlight {
  color: #ff4d4f;
}

.breakdown-value.final {
  font-size: 32rpx;
  font-weight: bold;
  color: #ff4d4f;
}

/* 详细展示样式 */
.clickable {
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toggle-icon-small {
  font-size: 20rpx;
  color: #999;
}

.breakdown-item.summary {
  background-color: #fff;
  padding: 12rpx 16rpx;
  border-radius: 8rpx;
  margin-bottom: 12rpx;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.detail-item {
  background-color: #fff;
  padding: 16rpx;
  border-radius: 8rpx;
  border-left: 4rpx solid #1890ff;
}

.detail-item-nested {
  background-color: #fafafa;
  padding: 12rpx;
  border-radius: 6rpx;
  border-left: 3rpx solid #faad14;
  margin-bottom: 12rpx;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}

.detail-name {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.detail-type {
  font-size: 22rpx;
  padding: 4rpx 12rpx;
  background-color: #e6f7ff;
  color: #1890ff;
  border-radius: 4rpx;
}

.detail-box {
  background-color: #fff;
  padding: 16rpx;
  border-radius: 8rpx;
  border-left: 4rpx solid #52c41a;
}

.detail-subtitle {
  font-size: 26rpx;
  font-weight: bold;
  color: #52c41a;
  margin: 16rpx 0 12rpx 0;
  padding-bottom: 8rpx;
  border-bottom: 1rpx dashed #d9d9d9;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 0;
}

.detail-label {
  font-size: 24rpx;
  color: #666;
}

.detail-value {
  font-size: 24rpx;
  color: #333;
}

.detail-value.highlight {
  color: #ff4d4f;
  font-weight: bold;
}

.detail-spec {
  font-size: 22rpx;
  color: #999;
  margin-left: 8rpx;
}

.detail-count {
  font-size: 22rpx;
  color: #52c41a;
  margin-left: 8rpx;
  font-weight: 500;
}

.detail-calculation {
  margin-top: 12rpx;
  padding: 12rpx;
  background-color: #f5f5f5;
  border-radius: 6rpx;
  font-size: 22rpx;
  color: #666;
  line-height: 1.6;
}

/* 底部操作栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
  z-index: 999;
}

.bottom-price {
  min-width: 220rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.bottom-total {
  font-size: 36rpx;
  font-weight: bold;
  color: #ff4d4f;
}

.bottom-estimate {
  font-size: 22rpx;
  color: #666;
}

.btn-buy-now {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  font-size: 28rpx;
  border: none;
  background-color: #1890ff;
  color: #fff;
}

.btn-buy-now[disabled] {
  background-color: #ccc;
  color: #999;
}

/* 原料清单样式 */
.ingredient-header {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 16rpx;
  background-color: #f5f5f5;
  border-radius: 8rpx;
  font-weight: bold;
  font-size: 26rpx;
  margin-bottom: 8rpx;
}

.ingredient-header-item {
  flex: 1;
  text-align: center;
  color: #333;
}

.ingredient-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 16rpx;
  border-bottom: 1rpx solid #f0f0f0;
  font-size: 26rpx;
}

.ingredient-row:last-child {
  border-bottom: none;
}

.ingredient-item {
  flex: 1;
  text-align: center;
  color: #666;
  word-break: break-all;
}

</style>
