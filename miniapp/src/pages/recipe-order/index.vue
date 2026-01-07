<template>
  <view class="recipe-order-page">
    <!-- 食谱基本信息 -->
    <view class="recipe-header">
      <view class="recipe-cover-wrapper">
        <image
          v-if="recipe.coverImageUrl"
          :src="recipe.coverImageUrl"
          class="recipe-cover"
          mode="aspectFill"
        />
      </view>
      <view class="recipe-info">
        <text class="recipe-name">{{ recipe.name }}</text>
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

    <!-- 确定饭量 -->
    <view class="section feeding-section" v-if="selectedDog">
      <view class="section-title">
        <text class="title-text">确定饭量</text>
      </view>

      <view class="feeding-info">
        <view class="feeding-item">
          <text class="feeding-label">每日饭量</text>
          <text class="feeding-value readonly">{{ Math.round(displayDailyIntakeG) }}g/天</text>
        </view>
        <view class="feeding-item">
          <text class="feeding-label">每餐饭量</text>

          <!-- 只读模式 -->
          <view v-if="!isEditingPerMeal" class="feeding-value-wrapper">
            <text class="feeding-value">{{ Math.round(perMealG) }}g/餐</text>
            <button class="btn-edit" @tap="startEditPerMeal">修改</button>
            <button v-if="isPerMealModified" class="btn-reset" @tap="resetPerMeal">重置</button>
          </view>

          <!-- 编辑模式 -->
          <view v-else class="feeding-edit-wrapper">
            <input
              class="feeding-input-small"
              type="number"
              v-model="tempPerMealG"
              @input="onTempPerMealChange"
            />
            <text class="feeding-unit">g/餐</text>
            <button class="btn-save" @tap="savePerMeal">确定</button>
            <button class="btn-cancel" @tap="cancelEditPerMeal">取消</button>
          </view>
        </view>
      </view>

      <!-- 计算说明 - 仅在未手动修改每餐饭量时显示 -->
      <view v-if="!isPerMealModified" class="calculation-explanation">
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
    <view class="section cycle-section">
      <view class="section-title">
        <text class="title-text">订购周期</text>
        <text class="required">*</text>
      </view>

      <view class="cycle-and-custom-row">
        <view class="cycle-options">
          <view
            v-for="option in cycleOptions"
            :key="option.days"
            class="cycle-option"
            :class="{ active: selectedCycleDays === option.days }"
            @tap="selectCycle(option.days)"
          >
            <text class="cycle-text">{{ option.days }}天</text>
          </view>
        </view>

        <!-- 自选天数 -->
        <view class="custom-cycle-inline">
          <text class="custom-label">自选</text>
          <input
            class="custom-input-white"
            type="number"
            v-model="customDays"
            placeholder="1-90"
          />
          <text class="custom-unit">天</text>
          <button class="btn-confirm-custom" @tap="confirmCustomDays">确定</button>
        </view>
      </view>

      <!-- 总袋数和总净重 -->
      <view class="total-summary">
        <view class="summary-item">
          <text class="summary-label">总袋数：</text>
          <text class="summary-value">{{ totalPackages }}袋（{{ selectedDog?.mealsPerDay || '-' }}餐/天）</text>
        </view>
        <view class="summary-item">
          <text class="summary-label">总净重：</text>
          <text class="summary-value">{{ Math.round(totalGrams) }}g</text>
        </view>
      </view>

      <!-- 最低订购量提醒 -->
      <view v-if="totalGrams < 1000" class="min-order-warning">
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
              {{ ingredient.amount.toFixed(1) }}{{ ingredient.displayUnit || ingredient.unit }}
            </text>
          </view>
        </view>

        <!-- 无数据提示 -->
        <view v-if="foodIngredients.length === 0 && supplementIngredients.length === 0" class="no-ingredients">
          <text class="no-data-text">暂无原料数据</text>
        </view>
      </view>
    </view>

    <!-- 制作要求 -->
    <view class="section requirements-section" v-if="selectedDog">
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
          <text class="price-label">每餐价格</text>
          <text class="price-value">¥{{ pricePerMeal.toFixed(1) }}/餐</text>
        </view>
      </view>
    </view>

    <!-- 价格明细 -->
    <view class="section price-breakdown-section" v-if="selectedDog && selectedCycleDays && pricePreview && pricePreview.pricingBreakdown">
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
import { ref, computed, onMounted } from 'vue'
import { request } from '../../utils/api'

interface Dog {
  id: string
  name: string
  breedName?: string
  currentWeightKg: number
  mealsPerDay: number
  birthday?: string
  ageText?: string
}

interface Recipe {
  id: string
  name: string
  description?: string
  coverImageUrl?: string
  energyDensityKcalPerKg: number
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
const selectedDogId = ref('')
const selectedCycleDays = ref(7)
const customDays = ref('')
const dogCalcResult = ref<CalcResult | null>(null)
const pricePreview = ref<PricePreview | null>(null)
const pricingSnapshotId = ref<string | null>(null)  // ✅ 新增：快照ID
const perMealG = ref(0)
const globalConfig = ref<GlobalConfig>({})

// 系统原始计算的每餐饭量（用于重置）
const systemCalculatedPerMealG = ref(0)

// 显示的每日饭量（可根据手动修改的每餐饭量倒推计算）
const displayDailyIntakeG = ref(0)

// 每餐饭量编辑状态
const isEditingPerMeal = ref(false)
const tempPerMealG = ref('')

// 每餐饭量是否被手动修改过
const isPerMealModified = ref(false)

// 制作要求（默认值：打碎、生）
const preparationMethod = ref<PreparationMethod | null>('CHOPPED')
const cookingMethod = ref<CookingMethod | null>('RAW')

// 价格明细展开状态
const showPriceBreakdown = ref(false)
const showIngredientDetails = ref(false)
const showLaborDetails = ref(false)
const showOverheadDetails = ref(false)
const showPackagingDetails = ref(false)

// 保质期说明展开状态
const showShelfLife = ref(false)

// 物流重量详情展开状态
const showWeightDetails = ref(false)

// 计算说明展开状态
const showCalculationDetails = ref(false)

// 周期选项
const cycleOptions = [
  { days: 7, packageCount: 14 },
  { days: 15, packageCount: 30 },
  { days: 30, packageCount: 60 }
]

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

// 每日饭量（只读，用于计算参考）
const dailyIntakeG = computed(() => {
  // 基于每餐饭量计算每日饭量，而不是使用后端返回的dailyIntakeG
  if (!perMealG.value || !selectedDog.value) return 0
  return perMealG.value * selectedDog.value.mealsPerDay
})

// 总重量（克）
const totalGrams = computed(() => {
  return displayDailyIntakeG.value * selectedCycleDays.value
})

// 总袋数
const totalPackages = computed(() => {
  if (!selectedDog.value) return 0
  return selectedDog.value.mealsPerDay * selectedCycleDays.value
})

// 每餐价格
const pricePerMeal = computed(() => {
  if (!pricePreview.value || !totalPackages.value) return 0
  return pricePreview.value.amountTotal / totalPackages.value
})

// 是否可以立即购买
const canBuyNow = computed(() => {
  return selectedDogId.value && selectedCycleDays.value && pricePreview.value !== null && perMealG.value > 0
})

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

onMounted(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1] as any

  recipeId.value = currentPage.options?.recipeId || ''

  if (recipeId.value) {
    loadRecipeDetail()
    loadDogs()
    loadGlobalConfig()
  }
})

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

      // 自动选中第一个狗狗
      if (dogs.value.length > 0 && !selectedDogId.value) {
        selectDog(dogs.value[0].id)
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
  selectedDogId.value = dogId
  loadDogCalcResult(dogId)
}

async function loadDogCalcResult(dogId: string) {
  console.log('========== [RecipeOrder] loadDogCalcResult 开始 ==========')
  console.log('[调用参数]', {
    dogId,
    recipeId: recipeId.value
  })
  console.log('[更新前]', {
    perMealG: perMealG.value,
    isPerMealModified: isPerMealModified.value,
    systemCalculatedPerMealG: systemCalculatedPerMealG.value,
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

      // 初始化每餐饭量（后端已计算）
      perMealG.value = result.perMealIntakeG
      systemCalculatedPerMealG.value = result.perMealIntakeG

      // 重新计算每日饭量：每餐饭量 × 每日餐数
      displayDailyIntakeG.value = result.perMealIntakeG * (selectedDog.value?.mealsPerDay || 2)

      // 重置修改标记
      isPerMealModified.value = false

      console.log('[更新后]', {
        perMealG: perMealG.value,
        displayDailyIntakeG: displayDailyIntakeG.value,
        isPerMealModified: isPerMealModified.value,
        systemCalculatedPerMealG: systemCalculatedPerMealG.value
      })
      console.log('========== [RecipeOrder] loadDogCalcResult 结束 ==========')

      // 加载价格预览
      loadPricePreview()
    }
  } catch (error) {
    console.error('Load dog calc error:', error)

    // 显示错误提示
    uni.showToast({
      title: '饭量计算失败',
      icon: 'none'
    })
  }
}

function onPerMealChange() {
  // 每餐饭量改变时，需要重新计算价格（已废弃，保留兼容）
  loadPricePreview()
}

// 开始编辑每餐饭量
function startEditPerMeal() {
  tempPerMealG.value = String(Math.round(perMealG.value))
  isEditingPerMeal.value = true
}

// 保存每餐饭量
function savePerMeal() {
  const newPerMeal = parseInt(tempPerMealG.value)
  if (!isNaN(newPerMeal) && newPerMeal > 0 && selectedDog.value) {
    console.log('========== [RecipeOrder] savePerMeal 开始 ==========')
    console.log('[保存前]', {
      perMealG: perMealG.value,
      isPerMealModified: isPerMealModified.value,
      tempPerMealG: tempPerMealG.value,
      newPerMeal
    })

    perMealG.value = newPerMeal

    // 倒推计算每日饭量
    displayDailyIntakeG.value = newPerMeal * selectedDog.value.mealsPerDay

    // 标记已修改
    isPerMealModified.value = true

    console.log('[保存后]', {
      perMealG: perMealG.value,
      displayDailyIntakeG: displayDailyIntakeG.value,
      isPerMealModified: isPerMealModified.value,
      systemCalculatedPerMealG: systemCalculatedPerMealG.value
    })
    console.log('========== [RecipeOrder] savePerMeal 结束 ==========')

    // 重新计算价格
    loadPricePreview()
  }
  isEditingPerMeal.value = false
}

// 取消编辑每餐饭量
function cancelEditPerMeal() {
  isEditingPerMeal.value = false
  tempPerMealG.value = ''
}

// 重置每餐饭量为系统计算值
function resetPerMeal() {
  if (systemCalculatedPerMealG.value > 0 && selectedDog.value) {
    perMealG.value = systemCalculatedPerMealG.value

    // 恢复每日饭量为系统计算值
    displayDailyIntakeG.value = dailyIntakeG.value

    // 清除修改标记
    isPerMealModified.value = false

    // 重新计算价格
    loadPricePreview()

    uni.showToast({
      title: '已重置为系统推荐值',
      icon: 'success'
    })
  }
}

// 编辑时的临时输入变化
function onTempPerMealChange() {
  // 仅用于验证，不触发价格计算
  const val = parseInt(tempPerMealG.value)
  if (isNaN(val) || val <= 0) {
    // 可以添加错误提示
  }
}

// 选择制作工艺
function selectPreparationMethod(method: PreparationMethod) {
  preparationMethod.value = method
}

// 选择烹饪工艺
function selectCookingMethod(method: CookingMethod) {
  cookingMethod.value = method
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
  customDays.value = '' // 清空自选天数
  loadPricePreview()
}

function confirmCustomDays() {
  const days = Number(customDays.value)

  // 检查是否为数字
  if (isNaN(days)) {
    uni.showToast({
      title: '请输入有效的天数',
      icon: 'none'
    })
    return
  }

  // 检查是否为整数
  if (!Number.isInteger(days)) {
    uni.showToast({
      title: '天数必须是整数',
      icon: 'none'
    })
    return
  }

  // 检查范围
  if (days < 1 || days > 90) {
    uni.showToast({
      title: '请输入1-90之间的天数',
      icon: 'none'
    })
    return
  }

  selectedCycleDays.value = days
  loadPricePreview()
}

async function loadPricePreview() {
  if (!selectedDogId.value || !selectedCycleDays.value || !perMealG.value) return

  const totalG = totalGrams.value
  const pkgCount = totalPackages.value
  const pkgSpecG = perMealG.value

  try {
    const res = await request({
      url: '/orders/pricing/preview',
      method: 'POST',
      data: {
        dogId: selectedDogId.value,
        type: 'FRESH_FOOD',
        items: [{
          recipeId: recipeId.value,
          quantityG: totalG,
          packageCount: pkgCount,
          packageSpecG: pkgSpecG,
          cycleDays: selectedCycleDays.value,
          dailyIntakeG: displayDailyIntakeG.value,
          preparationMethod: preparationMethod.value || undefined,
          cookingMethod: cookingMethod.value || undefined,
        }]
      }
    })
    if (res.code === 0 && res.data) {
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
    // 如果是订单净重不足的错误，不打印到控制台（避免大量红色日志）
    // 这是预期的业务逻辑验证，界面上已有警告提示
    if (!error?.message?.includes('订单净重不足')) {
      console.error('Load price preview error:', error)
    }

    // 订单净重不足时，清空价格预览
    pricePreview.value = null
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

  const params = {
    mode: 'directBuy',
    snapshotId: pricingSnapshotId.value,  // ✅ 使用快照ID
    // 保留最少必要参数用于页面显示（不用于价格计算）
    dogName: selectedDog.value?.name || '',
    recipeName: recipe.value.name,
    recipeCoverImage: recipe.value.coverImageUrl || '',
    // ✅ 新增：配置信息参数（用于订单确认页展示）
    breedName: selectedDog.value?.breedName || '',
    weightKg: selectedDog.value?.currentWeightKg || 0,
    mealsPerDay: selectedDog.value?.mealsPerDay || 2,
    perMealG: perMealG.value,
    totalPackages: totalPackages.value,
    cycleDays: selectedCycleDays.value,
    totalGrams: totalGrams.value,
    preparationMethod: preparationMethod.value || 'CHOPPED',
    cookingMethod: cookingMethod.value || 'RAW',
    // ✅ 添加价格信息用于显示（实际价格以快照为准）
    amountProduct: pricePreview.value?.amountProduct || 0,
    amountShipping: pricePreview.value?.amountShipping || 0,
    amountTotal: pricePreview.value?.amountTotal || 0,
  }

  // 将参数编码到URL中
  const queryString = Object.keys(params)
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&')

  uni.navigateTo({
    url: `/pages/checkout/index?${queryString}`
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
}

.recipe-name {
  font-size: 36rpx;
  font-weight: bold;
  color: #333;
  line-height: 1.4;
}

/* 通用区块 */
.section {
  background-color: #fff;
  padding: 24rpx;
  margin-bottom: 20rpx;
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
.cycle-and-custom-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.cycle-options {
  display: flex;
  gap: 12rpx;
  flex: 1;
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

.custom-cycle-inline {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 20rpx 16rpx;
  background-color: #fff;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
}

.custom-label {
  font-size: 26rpx;
  color: #666;
}

.custom-input-white {
  width: 80rpx;
  height: 56rpx;
  text-align: center;
  border: 2rpx solid #e8e8e8;
  border-radius: 8rpx;
  font-size: 26rpx;
  color: #333;
  background-color: #fff;
}

.custom-unit {
  font-size: 24rpx;
  color: #999;
}

.btn-confirm-custom {
  padding: 8rpx 16rpx;
  background-color: #1890ff;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 24rpx;
  line-height: 1.2;
  margin-left: 8rpx;
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
  gap: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fff;
  border-top: 1rpx solid #e5e5e5;
}

.btn-buy-now {
  width: 100%;
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
