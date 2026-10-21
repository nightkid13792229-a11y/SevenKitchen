<template>
  <view class="custom-recipe-page">
    <!-- 顶部 Banner（2026-10-04 老板调整）：
         身份块参照健康管理页的 hero-card，并把原来独占一个版面的「选择狗狗」
         融进来 —— 顾客一进页面先看到"这是给谁定制"，而不是先答一道选择题。

         多只狗时整块用 <picker> 包住（连头像一起可点），只有一只时不包：
         点了也只会弹出同一个选项，白让顾客以为有得换（健康管理页同一套口径）。 -->
    <view id="custom-dog" class="hero-card">
      <picker
        v-if="dogOptions.length > 1"
        class="hero-card__identity"
        mode="selector"
        :range="dogOptions"
        range-key="name"
        :value="dogPickerIndex"
        @change="onDogChange"
      >
        <view class="hero-card__identity-inner">
          <image class="hero-card__avatar" :src="dogAvatarSrc" mode="aspectFill" />
          <view class="hero-card__name-block">
            <!--
              标题按状态给话（2026-10-18）：
              未登录 / 读取中 / 0 只狗 / 多只狗未选，四种说法由 heroTitle 统一给，
              不再在各处写死"请选择狗狗"。

              ⚠️ **不新增说明块** —— 2026-10-05 老板明确说过
              "不要那块「先选一下要给哪只狗狗定制」的说明，Banner 上的选择器本身就是引导"。
            -->
            <text class="hero-card__title">{{ heroTitle }}</text>
            <text v-if="dogHeroLine" class="hero-card__line">{{ dogHeroLine }}</text>
            <text class="hero-card__switch">
              {{ selectedDog ? '切换 ▼' : '点这里选 ▼' }}
            </text>
          </view>
        </view>
      </picker>

      <view v-else class="hero-card__identity">
        <view class="hero-card__identity-inner">
          <image class="hero-card__avatar" :src="dogAvatarSrc" mode="aspectFill" />
          <view class="hero-card__name-block">
            <text class="hero-card__title">{{ heroTitle }}</text>
            <text v-if="dogHeroLine" class="hero-card__line">{{ dogHeroLine }}</text>
          </view>
        </view>
      </view>

      <!-- 2026-10-18 老板验收时定：顶部不再显示生命阶段 / 体况评分 / 活动量。
           体况与活动量改在下方「狗狗信息缺失，请先确认」块里确认，
           生命阶段由生日自动推算，不在页面上重复。 -->
    </view>

    <!-- 待付款单提醒（2026-10-04 新增）。
         口径是**不限制下单张数**（顾客养多只狗可以分别定制），所以这里只提醒
         "别忘了付这一单"，绝不做成"先付完才能再下单"的阻断。 -->
    <view v-if="pendingOrder && !pendingOrderExpired" class="pending-banner">
      <view class="pending-banner__head">
        <text class="pending-banner__title">你有一张待付款的定制单</text>
        <text v-if="pendingOrderRemainingText" class="pending-banner__time">{{ pendingOrderRemainingText }}</text>
      </view>
      <text class="pending-banner__desc">
        超时未支付，订单会自动取消。定制张数不限，你也可以继续提交新的定制单。
      </text>
      <view class="pending-banner__actions">
        <button
          class="pending-banner__btn primary"
          :disabled="pendingPaying"
          @tap="continuePayPending"
        >{{ pendingPaying ? '处理中…' : '继续支付' }}</button>
        <button class="pending-banner__btn" @tap="viewPendingOrder">查看订单</button>
      </view>
    </view>

    <!-- 身份与档案状态。
         狗狗选择器已经并入上面的 Banner，这里只剩下"这一单能不能开始"的几件事。
         未登录 / 正在读取 / 没有档案这三种状态卡必须都留着（且互斥），
         它们各自对应完全不同的下一步动作。

         2026-10-05 老板指出：狗狗 Banner 与「1 体重管理」之间有一片白块。
         根因就是这张卡**常驻**渲染 —— 在"已登录 + 有档案 + 门槛已确认 + 没有计划"
         这个最常见的正常状态下，它下面五个分支一条都不成立，
         只剩内边距与白底，看上去就是一条空白。所以整张卡改成按内容出现。 -->
    <view v-if="showStatusSection" id="custom-status" class="section">
      <!-- 体重管理计划（阶段 D1）：进行中/维持期/已暂停都带出。
           计划是顾客当下真正在执行的方案，定制时必须看得见 ——
           否则他定的减重计划在定制页完全没有体现，等于白定。
           2026-10-19：暂停的计划只展示、不锁方向；状态由右侧 badge 说明。 -->
      <view v-if="selectedPlan" class="plan-banner">
        <view class="plan-banner__head">
          <text class="plan-banner__title">
            {{ selectedPlan.direction === 'LOSS' ? '减重计划' : '增重计划' }}
          </text>
          <text class="plan-banner__badge">{{ planStatusLabel }}</text>
        </view>
        <view class="plan-banner__rows">
          <text class="plan-banner__row">
            目标体重 {{ selectedPlan.targetWeightKg }}kg
            <template v-if="selectedPlan.remainingKg > 0">（还差 {{ selectedPlan.remainingKg }}kg）</template>
          </text>
          <text v-if="selectedPlan.status !== 'PAUSED'" class="plan-banner__row">
            当前每日能量 {{ selectedPlan.currentKcal }} kcal
          </text>
        </view>
        <text class="plan-banner__hint">
          {{ selectedPlan.status === 'PAUSED'
            ? '计划已暂停，期间按正常维持量喂；可在健康管理中恢复。'
            : '下面的每日能量已经按这个计划算好了。' }}
        </text>
      </view>

      <!-- 定制门槛：这几项必须由顾客亲自确认过。
           老档案不追溯，因此在这里就地补确认 —— 只在"真的要用到"的时候问。

           2026-10-18 老板验收时定：顶部不再重复这三项，
           文案精简为「狗狗信息缺失，请先确认：」+「影响食谱的设计」。 -->
      <view v-if="gateBlocked" class="gate-card">
        <text class="gate-card__title">狗狗信息缺失，请先确认：</text>
        <text class="gate-card__desc">影响食谱的设计</text>

        <!-- 体况评分（阶段 C6）：已确认过就只读展示，未确认就地做 4 个动作题。
             不再让顾客估「几分」—— 与建档页保持同一套判据。 -->
        <view v-if="gateBcsAlreadyConfirmed" class="gate-row">
          <text class="gate-row__label">体况评分<text class="gate-row__value gate-row__value--done">（{{ getBCSText(selectedDog.bcsScore) }} · 已确认）</text></text>
        </view>

        <view v-else class="gate-bcs">
          <view class="gate-row">
            <text class="gate-row__label">体况评分<text class="gate-row__value" :class="{ 'gate-row__value--done': gateEffectiveBcs !== null }">（{{ gateEffectiveBcs === null ? '待确认' : `${gateEffectiveBcs} 分 · ${gateBcsResultLabel}` }}）</text></text>
          </view>
          <text class="bcs-banner">回答以下问题，确认狗狗的体态健康！</text>

          <view
            v-for="question in gateBcsQuestions"
            :key="question.key"
            class="bcs-question"
          >
            <image
              v-if="question.image"
              class="bcs-question__image"
              :src="question.image"
              mode="widthFix"
            />
            <text class="bcs-question__title">{{ question.title }}</text>
            <view class="bcs-question__options">
              <view
                v-for="option in question.options"
                :key="option.label"
                class="bcs-question__option"
                :class="{ active: gateBcsAnswers[question.key] === option.bcs }"
                @tap="selectGateBcsAnswer(question.key, option.bcs)"
              >{{ option.label }}</view>
            </view>
          </view>
        </view>

        <view class="gate-row">
          <text class="gate-row__label">活动量</text>
          <picker
            mode="selector"
            :range="gateActivityOptions.map(item => item.label)"
            :value="gateActivityIndex"
            @change="onGateActivityChange"
          >
            <view class="gate-row__value">{{ gateActivityOptions[gateActivityIndex]?.label || '请选择' }}</view>
          </picker>
        </view>

        <view class="gate-row">
          <text class="gate-row__label">每日餐数</text>
          <picker
            mode="selector"
            :range="gateMealOptions.map(item => `${item} 餐/天`)"
            :value="gateMealIndex"
            @change="onGateMealChange"
          >
            <view class="gate-row__value">{{ gateDraft.mealsPerDay }} 餐/天</view>
          </picker>
        </view>

        <button
          class="gate-confirm-btn"
          :disabled="gateSaving || gateBcsPending"
          @tap="confirmGate"
        >{{ gateBcsPending ? '请先做完上面的体况问题' : (gateSaving ? '保存中…' : '确认并继续') }}</button>
      </view>

      <!-- 未登录：这里要区分"没登录"和"没有狗狗档案"。
           原先未登录时读不到档案，页面直接落到下面的"还没有狗狗档案"空态，
           顾客会被引导去建档，建到一半才发现其实还得先登录。
           这两个状态要分开说，顾客才知道下一步该做什么。 -->
      <view v-if="needLogin" class="login-hint">
        <text class="login-hint-title">请先登录</text>
        <text class="login-hint-desc">登录后我们才能读取毛孩子的档案，按它的体重和身体状况来定制。</text>
        <button class="login-hint-btn" @tap="goToLogin">去登录</button>
      </view>

      <!-- 正在读取档案：档案是异步读的，请求还没回来就先说"还没有狗狗档案"是误报 ——
           一位明明有 3 只狗的顾客会被这句话引导去重复建档。加载态与空态必须分开。 -->
      <view v-else-if="dogsLoading" class="no-dog-hint">
        <text class="no-dog-hint-title">正在读取狗狗档案…</text>
        <text class="no-dog-hint-desc">马上就好，读完就能选要定制的狗狗了。</text>
      </view>

      <!-- 读取失败：网络/后端异常也会让 dogOptions 为空。
           不能把它当成"没有档案"——有狗的用户会被引导去重复建档。
           这里只给重试，不给建档入口。 -->
      <view v-else-if="dogsLoadFailed" class="no-dog-hint">
        <text class="no-dog-hint-title">狗狗档案没读出来</text>
        <text class="no-dog-hint-desc">网络或服务暂时不可用，先重试一次；不用重新建档，避免出现重复档案。</text>
        <button class="no-dog-hint-btn" @tap="loadDogs">重试</button>
      </view>

      <!-- 无档案时的引导：原先只弹一句 toast，页面上没有任何建档入口，提交按钮永久不可用 -->
      <view v-else-if="dogOptions.length === 0" class="no-dog-hint">
        <text class="no-dog-hint-title">还没有狗狗档案</text>
        <text class="no-dog-hint-desc">专属食谱需要先有狗狗档案，我们才能按它的体重和身体状况来定制。</text>
        <button class="no-dog-hint-btn" @tap="goToCreateDog">创建狗狗档案</button>
      </view>
    </view>

    <!-- 第一步：体重管理（2026-10-05 老板要求：标题由"定制目标"改为"体重管理"，
         并删掉标题下方重复的"体重管理"四个字） -->
    <view v-if="hasSelectedDog" class="required-legend">
      带 <text class="intake-required">*</text> 的为必填项，未标 * 的为选填
    </view>
    <view v-if="hasSelectedDog" id="custom-weight" class="section">
      <view class="section-title">
        <text class="step-number">1</text>
        <text class="title-text">体重管理</text>
      </view>

      <!-- 2026-10-19 老板定稿：
           ① 三选一（减重/维持/增重），不再按体况限制选项，选择权交给家长
           ② 建议文案放在三选一下方：
              「狗狗名」的体态「偏胖/理想/偏瘦」，我们建议「方向」
           ③ 不再从定制页引导制定体重计划；
              只有已有进行中/维持期计划时才给一个查看入口 -->
      <view class="goal-group">
        <!-- 已有进行中/维持期计划：方向以计划为准，只给查看入口 -->
        <button
          v-if="hasOpenPlan"
          class="plan-entry-btn"
          @tap="goToWeightGoalPlan()"
        >查看体重管理计划</button>

        <template v-else>
          <view class="goal-ask">
            <text class="goal-ask__question">想帮它减重、维持，还是增重？<text class="intake-required">*</text></text>
            <view class="goal-ask__options">
              <text
                v-for="option in weightGoalOptions"
                :key="option.value"
                class="goal-ask__option"
                :class="{ 'goal-ask__option--on': weightGoalChoice === option.value }"
                @tap="chooseWeightGoal(option.value)"
              >{{ option.label }}</text>
            </view>
          </view>

          <!-- 建议只是建议：放在三选一下方，不限制顾客选哪个方向 -->
          <view v-if="bcsAdviceText" class="advice-line">
            <text class="advice-line__text">{{ bcsAdviceText }}</text>
          </view>
        </template>
      </view>
    </view>

    <!-- 第二步：过敏信息
         这一块原来嵌在「需要健康管理」勾选里，现在常驻显示：
         过敏是定制食谱的硬信息（喂错可能出事），不该等顾客先勾一个框才出现。
         疾病史不再在定制页录入 —— 健康管理页才是它的入口。

         2026-10-05 老板要求：先问一句「小家伙是否对部分食物过敏？」——
         不过敏的狗狗家长直接跳过，不必面对一整块用不上的录入界面。
         （标题上的「（可选）」后来按老板要求去掉了；答"没有"下面也不再多写说明。） -->
    <view v-if="hasSelectedDog" id="custom-allergy" class="section">
      <view class="section-title">
        <text class="step-number">2</text>
        <text class="title-text">过敏信息</text>
      </view>

      <view class="health-item">
        <view class="goal-ask">
          <text class="goal-ask__question">小家伙是否对部分食物过敏？<text class="intake-required">*</text></text>
          <view class="goal-ask__options">
            <text
              class="goal-ask__option"
              :class="{ 'goal-ask__option--on': hasFoodAllergy === true }"
              @tap="answerFoodAllergy(true)"
            >有过敏</text>
            <text
              class="goal-ask__option"
              :class="{ 'goal-ask__option--on': hasFoodAllergy === false }"
              @tap="answerFoodAllergy(false)"
            >没有过敏</text>
          </view>
        </view>

        <template v-if="hasFoodAllergy === true">
          <!-- "这些是从档案带出来的"：不说明的话，顾客会以为是上次在这页填的 -->
          <text v-if="healthPrefillHint" class="health-prefill-hint">{{ healthPrefillHint }}</text>

          <!-- 2026-10-19：过敏原改为纯文本 + 报告 AI 回填。
               顾客自己写、报告识别结果都进这一段；营养师在后台看原文。
               快捷标签和全局词表不再出现在顾客侧。 -->
          <view class="allergy-text">
            <text class="allergy-text__label">过敏食物（不能吃的）<text class="intake-required">*</text></text>
            <textarea
              v-model="formData.allergyText"
              class="allergy-text__input"
              placeholder="例如：鸡肉、牛肉、鹿肉"
              maxlength="500"
              auto-height
              :focus="allergyTextFocused"
              @blur="allergyTextFocused = false"
            />
            <text class="allergy-text__hint">
              多个用顿号分开；不确定的也可以写上。
            </text>
          </view>

          <!-- 拍检测报告自动读（2026-10-04 从健康管理搬来）。
               老板："将过敏源的记录放到定制食谱流程中。"
               :key 绑狗 ID：换狗时必须整个重挂载，否则"上一只狗扫描出来的
               候选过敏原"会留在新狗的单子上等着被确认。 -->
          <AllergyScanBlock
            v-if="formData.dogId"
            :key="formData.dogId"
            :dog-id="formData.dogId"
            @scanned="onAllergensScanned"
            @draft="onAllergyReportDraft"
          />

          <!-- 2026-10-19：本次上传的报告先存草稿，付款成功后才写狗狗档案。
               所以在“历史报告”上面单独列一块，避免家长以为已经进档案了。 -->
          <view v-if="formData.reportDrafts.length > 0" class="allergy-reports allergy-reports--draft">
            <text class="allergy-reports__title">
              本次上传的报告
            </text>
            <view
              v-for="(report, index) in formData.reportDrafts"
              :key="`draft-${index}`"
              class="allergy-reports__item"
            >
              <view class="allergy-reports__thumbs">
                <view
                  v-for="url in report.attachments"
                  :key="url"
                  class="allergy-reports__thumb-wrap"
                >
                  <image
                    v-if="isImageAttachment(url)"
                    class="allergy-reports__thumb"
                    :src="url"
                    mode="aspectFill"
                    @tap="previewAllergyReport(report)"
                  />
                  <view
                    v-else
                    class="allergy-reports__doc"
                    @tap="previewAllergyReport(report)"
                  >
                    <text class="allergy-reports__doc-badge">{{ attachmentFileLabel(url) }}</text>
                    <text class="allergy-reports__doc-label">检测报告</text>
                  </view>
                  <text
                    class="allergy-reports__thumb-remove"
                    @tap.stop="removeDraftReportImage(index, url)"
                  >×</text>
                </view>
              </view>
              <view class="allergy-reports__row">
                <view class="allergy-reports__main">
                  <text class="allergy-reports__name">
                    {{ report.testDate || '未填日期' }} · {{ reportTestMethodLabel(report.testMethod) }}
                  </text>
                  <text class="allergy-reports__meta">{{ draftReportPageText(report) }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 已传过的检测报告：原件不再"读完就丢"，这里给**小预览窗口**
               （2026-10-05 老板要求：上传之后在上传按钮下方能看到报告照片）。
               一次选的多张照片是同一份报告的多页 → 存成一份、多张附件，
               所以份数与张数都写出来，不然家长会以为另一张丢了。
               点图片看大图；删除要弹窗确认（删的是报告原件，
               已经记下的过敏信息不受影响 —— 后端也是这个语义）。 -->
          <view v-if="allergyReports.length > 0" class="allergy-reports">
            <text class="allergy-reports__title">
              档案里的历史报告（{{ allergyReports.length }} 份 / {{ allergyReportPageCount }} 个附件）
            </text>
            <view
              v-for="report in allergyReports"
              :key="report.id"
              class="allergy-reports__item"
            >
              <view class="allergy-reports__thumbs">
                <!-- 每张照片右上角一个叉，**只删这一张**（2026-10-05 老板要求）：
                     原来是整份一起删的按钮，而"一份报告"常常就是家长眼里的
                     "两张报告照片"，一删全没。 -->
                <view
                  v-for="url in report.attachments"
                  :key="url"
                  class="allergy-reports__thumb-wrap"
                >
                  <image
                    v-if="isImageAttachment(url)"
                    class="allergy-reports__thumb"
                    :src="url"
                    mode="aspectFill"
                    @tap="previewAllergyReport(report)"
                  />
                  <view
                    v-else
                    class="allergy-reports__doc"
                    @tap="previewAllergyReport(report)"
                  >
                    <text class="allergy-reports__doc-badge">{{ attachmentFileLabel(url) }}</text>
                    <text class="allergy-reports__doc-label">检测报告</text>
                  </view>
                  <text
                    class="allergy-reports__thumb-remove"
                    @tap.stop="removeReportImage(report, url)"
                  >×</text>
                </view>
              </view>
              <view class="allergy-reports__row">
                <view class="allergy-reports__main">
                  <text class="allergy-reports__name">
                    {{ report.testDate || '未填日期' }} · {{ reportTestMethodLabel(report.testMethod) }}
                  </text>
                  <text class="allergy-reports__meta">{{ allergyReportPageText(report) }}</text>
                </view>
              </view>
            </view>
          </view>
        </template>

      </view>
    </view>

    <!-- 第三步：健康档案（只读确认，2026-10-19 补需求 2.3.3）
         不在这里录入，也不在这里逐条打勾；顾客只需要确认“是不是最近这一次”，
         不对就点整块去健康管理补填/修改。 -->
    <view v-if="hasSelectedDog" id="custom-health" class="section">
      <view class="section-title">
        <text class="step-number">3</text>
        <text class="title-text">健康档案</text>
      </view>

      <view class="health-archive" @tap="goToHealthProfile">
        <view v-if="healthSummaryLoading" class="health-archive__empty-row">
          <text class="health-archive__text">正在读取健康档案…</text>
        </view>
        <view v-else-if="healthSummaryLoadFailed" class="health-archive__empty-row">
          <text class="health-archive__text">健康档案暂时读取失败</text>
          <text class="health-archive__link">去健康管理查看 ›</text>
        </view>
        <template v-else-if="recentVisit || recentCheckup">
          <view v-if="recentVisit" class="health-archive__row">
            <text class="health-archive__label">最近就诊</text>
            <text class="health-archive__text">
              {{ formatHealthRecordDate(recentVisit.visitDate) }} {{ recentVisit.diagnosis }}
            </text>
            <text class="health-archive__arrow">›</text>
          </view>
          <view v-if="recentCheckup" class="health-archive__row">
            <text class="health-archive__label">最近体检</text>
            <text class="health-archive__text">
              {{ formatHealthRecordDate(recentCheckup.checkupDate) }} {{ recentCheckup.checkupType }}
            </text>
            <text class="health-archive__arrow">›</text>
          </view>
        </template>
        <view v-else class="health-archive__empty-row">
          <text class="health-archive__text">没有任何就诊和体检记录</text>
          <text class="health-archive__link">去补填 ›</text>
        </view>
      </view>
    </view>

    <!--
      第四步：饲喂历史（必填）+ 最近肠胃（选填）
      2026-10-18 按需求 2.3.4「第二段：补充（只问档案里没有的）」重做。

      原来的「饮食偏好（爱吃的/忌口的）」按 2026-10-17 V6 决定**拿掉** ——
      老板原话："饮食偏好这个板块我个人判断是一个低频的需求"。
      而且生产上 4625 只狗填了 0 只，拿掉不丢信息。

      换成这里两段，因为它们是**营养师真正需要的**：
        · 现在喂的是什么粮 → 决定过渡方案怎么写（"第 1 周按 7:3 混原来的粮"）
        · 最近肠胃怎么样 → 软便/便秘/呕吐是最常见的换粮诱因
    -->
    <view v-if="hasSelectedDog" id="custom-intake" class="section">
      <view class="section-title">
        <text class="step-number">4</text>
        <text class="title-text">饲喂历史</text>
      </view>

      <view class="intake-block">
        <text class="intake-question">现在主要喂什么<text class="intake-required">*</text></text>
        <view class="intake-options">
          <text
            v-for="opt in currentFoodOptions"
            :key="opt.code"
            class="intake-option"
            :class="{ 'intake-option--on': formData.currentFoodMain === opt.code }"
            @tap="selectCurrentFood(opt.code)"
          >{{ opt.label }}</text>
        </view>
        <text
          v-if="formData.currentFoodMain === 'OTHER'"
          class="intake-other-label"
        >补充说明<text class="intake-required">*</text></text>
        <input
          v-if="formData.currentFoodMain === 'OTHER'"
          v-model="formData.currentFoodOther"
          class="intake-input"
          :focus="currentFoodOtherFocused"
          placeholder="请补充主要喂的是什么"
          maxlength="120"
          @blur="currentFoodOtherFocused = false"
        />
      </view>

      <view class="intake-block">
        <text class="intake-question">定制原因<text class="intake-required">*</text></text>
        <view class="intake-options">
          <text
            v-for="opt in changeReasonOptions"
            :key="opt.code"
            class="intake-option"
            :class="{ 'intake-option--on': formData.changeReasons.includes(opt.code) }"
            @tap="toggleChangeReason(opt.code)"
          >{{ opt.label }}</text>
        </view>
        <!-- 选「其他」才出现输入框：不选就不占版面 -->
        <text
          v-if="formData.changeReasons.includes('OTHER')"
          class="intake-other-label"
        >补充说明<text class="intake-required">*</text></text>
        <input
          v-if="formData.changeReasons.includes('OTHER')"
          v-model="formData.changeReasonOther"
          class="intake-input"
          :focus="changeReasonOtherFocused"
          placeholder="说说具体是什么原因"
          maxlength="120"
          @blur="changeReasonOtherFocused = false"
        />
      </view>

      <view class="intake-block">
        <text class="intake-question">最近肠胃怎么样（可选）</text>
        <view class="intake-options">
          <text
            v-for="opt in stomachOptions"
            :key="opt.code"
            class="intake-option"
            :class="{ 'intake-option--on': formData.stomachConditions.includes(opt.code) }"
            @tap="toggleStomach(opt.code)"
          >{{ opt.label }}</text>
        </view>
        <text
          v-if="formData.stomachConditions.includes('OTHER')"
          class="intake-other-label"
        >补充说明<text class="intake-required">*</text></text>
        <input
          v-if="formData.stomachConditions.includes('OTHER')"
          v-model="formData.stomachOther"
          class="intake-input"
          :focus="stomachOtherFocused"
          placeholder="请补充具体肠胃情况"
          maxlength="120"
          @blur="stomachOtherFocused = false"
        />
      </view>
    </view>

    <!-- 第四步：备注（可选）
         老板口径：这是给营养师看的备注，不影响价格与热量计算，
         所以从"定制目标"里独立出来，放在饮食偏好之后。 -->
    <view v-if="hasSelectedDog" id="custom-notes" class="section">
      <view class="section-title">
        <text class="step-number">5</text>
        <text class="title-text">备注（可选）</text>
      </view>
      <textarea
        v-model="formData.additionalNotes"
        class="notes-input"
        placeholder="例如：它最近在换粮、吃某种药、不爱嚼硬的，或你有其它想让营养师知道的"
        maxlength="500"
      />

      <!-- 附件（可选）：检测报告、化验单的照片。
           2026-10-05 老板要求：这个入口**改小**，并与张数说明并排 ——
           原先它是一行独立的金色文字、下面再跟一行"每次最多 9 张"，
           在一张表单里显得比提交还显眼。 -->
      <view class="attachment-section">
        <view class="attachment-header">
          <text class="attachment-hint">最多 {{ maxAttachmentCount }} 个附件</text>
          <text v-if="canAddAttachment" class="attachment-add" @tap="pickAttachmentEntry">
            {{ attachmentUploading ? '上传中…' : '上传资料（可选）' }}
          </text>
          <text v-else class="attachment-limit">已传满 {{ maxAttachmentCount }} 个附件</text>
        </view>
        <view v-if="formData.attachmentUrls.length > 0" class="attachment-grid">
          <view
            v-for="(url, index) in formData.attachmentUrls"
            :key="url"
            class="attachment-thumb-wrap"
          >
            <image
              v-if="isImageAttachment(url)"
              class="attachment-thumb"
              :src="url"
              mode="aspectFill"
              @tap="previewAttachment(url)"
            />
            <view v-else class="attachment-doc" @tap="previewAttachment(url)">
              <text class="attachment-doc-badge">{{ attachmentFileLabel(url) }}</text>
              <text class="attachment-doc-label">资料</text>
            </view>
            <text
              class="attachment-thumb-remove"
              @tap.stop="removeAttachment(index)"
            >×</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 2026-10-19 老板确认：
         预计交付日期只在订单确认页展示，定制页不再显示。
         定制页底部只保留定制费说明和「确认信息」按钮。 -->

    <!-- 底部确认条（2026-10-19 老板确认）
         ① 按钮不默认置灰：随时可点，点击后才校验；缺什么提示并滚到对应板块
         ② 按钮只负责“确认信息 → 订单确认页”，这里不创建订单、不付款
         ③ 金额只出现一次：放在说明里，按钮不显示金额 -->
    <!--
      用 cover-view 而不是普通 view/button：
      微信的 textarea 是原生组件，滚动到固定栏下方时会盖在普通 fixed 元素上，
      导致底栏和按钮看起来半透明。cover-view 才能真正压在原生输入框之上。
    -->
    <cover-view v-if="hasSelectedDog" class="submit-section">
      <cover-view class="submit-btn" @tap="goToOrderConfirm">
        {{ navigatingToConfirm ? '正在进入…' : '确认订单' }}
      </cover-view>
    </cover-view>
  </view>
</template>

<script setup lang="ts">
import { useOptionSet } from '@/utils/option-set'
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import {
  fetchMyOrders,
  fetchDogHealthSummary,
  uploadCustomRecipeDraftAttachment,
} from '@/api/custom-recipe';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { getToken, request } from '@/utils/api';
import { dogApi } from '@/api/dogs';
import AllergyScanBlock from '@/components/custom-recipe/AllergyScanBlock.vue';
import { runCustomRecipePayment } from '@/utils/custom-recipe-payment';
import {
  formatAmount,
  formatRemainingMinutes,
  isPaymentExpired,
  resolvePaymentDeadlineAt,
} from '@/utils/custom-recipe-order';
import { navigateToDogCreate } from '@/utils/dog-profile-entry';
import { getStoredUser } from '@/utils/account';
import {
  clearCustomRecipeDraft,
  isCustomRecipeDraftExpired,
  loadCustomRecipeDraft,
  retainCustomRecipeChoicesAfterPayment,
  saveCustomRecipeDraft,
  type CustomRecipeReportDraft,
} from '@/utils/custom-recipe-draft';
import { refreshCustomRecipeDraftMedia } from '@/utils/custom-recipe-media';
import { resolveDogAvatarSrc } from '@/utils/dog-avatar';
import {
  calculateDogAgeText,
  resolveDogBreedName,
} from '@/utils/dog-profile-overview';
import {
  weightGoalPlanApi,
  getPlanStatusLabel,
  type WeightGoalPlanView,
} from '@/api/weight-goal-plan';
import {
  getBcsLabel,
  BCS_QUESTIONS,
  applyBcsScoreMap,
  resolveBcsFromAnswers,
} from '@/utils/bcs-questionnaire';

// 状态定义
const dogOptions = ref<any[]>([]);
const selectedDog = ref<any>(null);
/** 「再次定制」带进来的狗：首次加载后优先选中它 */
const preferredDogId = ref('');
let preferredDogApplied = false;

/**
 * 狗狗档案是否还在读。
 *
 * 初始为 true：请求还没回来之前页面必须先说"正在读取"，
 * 而不是先亮出"还没有狗狗档案"这个空态。
 */
const dogsLoading = ref(true);

/**
 * 狗狗档案读取失败（网络 / 后端异常）。
 *
 * 必须和"真的没有档案"分开：读取失败时页面若显示"还没有狗狗档案 +
 * 创建狗狗档案"，有狗的用户会被引导去重复建档。
 * 只有**成功读到 0 只狗**才显示建档引导。
 */
const dogsLoadFailed = ref(false);

/**
 * 当前狗狗的体重管理计划（阶段 D1）。
 *
 * 进行中/维持期/已暂停都带出来 —— 计划是顾客当下真正在执行的方案，
 * 定制页必须看得见，否则他定的减重计划在这里完全没有体现。
 * 2026-10-19：暂停的计划只展示，不锁方向。
 */
const selectedPlan = ref<WeightGoalPlanView | null>(null);
const planStatusLabel = computed(() =>
  selectedPlan.value ? getPlanStatusLabel(selectedPlan.value.status) : '',
);

/**
 * 第一步的方向选择：减重 / 维持 / 增重（2026-10-05 老板第三批要求）。
 *
 * 2026-10-19 调整：不再按体况限制选项，选择权交给家长；
 * 体况建议只作为建议显示（bcsAdviceText），不是限制。
 * null = 还没选（提交按钮为灰）。
 */
type WeightGoalChoice = 'LOSS' | 'MAINTAIN' | 'GAIN';

const weightGoalChoice = ref<WeightGoalChoice | null>(null);

const weightGoalOptions: Array<{ value: WeightGoalChoice; label: string }> = [
  { value: 'LOSS', label: '减重' },
  { value: 'MAINTAIN', label: '维持' },
  { value: 'GAIN', label: '增重' },
];

/** 选方向：选了就重算交给营养师的目标；不再有体况限制 */
function chooseWeightGoal(value: WeightGoalChoice) {
  weightGoalChoice.value = value;
  syncGoalWithPlan();
}

/**
 * 狗狗选定了没有。没选定时四个板块整块不展示（2026-10-05 老板第三批第 1 条）：
 * 未登录 / 还没有档案 / 档案还在读的时候，表单是空的，摆出来只会让人以为要填。
 * 提交按钮同理 —— 没有狗可提交，留着只会点出一句"请选择狗狗"。
 */
const hasSelectedDog = computed(() => Boolean(formData.value.dogId));


/**
 * 第二步先问的那一句：小家伙是否对部分食物过敏？（2026-10-05 老板要求）
 *
 * 三态：null = 还没答（按钮不可提交）、true = 有过敏、false = 没有过敏。
 * 对食物不过敏的狗狗（多数）家长答一句"没有"就能跳过整块录入界面 ——
 * 原来一进来就是快选标签 + 手输 + 上传报告，看着像"必须填"。
 */
const hasFoodAllergy = ref<boolean | null>(null);

/**
 * 从档案带出来的过敏文本（2026-10-19）。
 *
 * 只用于显示「这些是从档案带出的」提示；顾客改过之后提示仍然成立，
 * 因为内容确实是从档案带来的。
 */
const prefilledAllergyText = ref('');

/** 旧草稿/误点恢复：过敏文本为空时，从档案或已带出的文本补一次 */
function fillAllergyFromArchiveIfEmpty() {
  if (formData.value.allergyText.trim()) return;
  const archiveText =
    prefilledAllergyText.value.trim() ||
    (Array.isArray(healthSummary.value?.allergies)
      ? healthSummary.value!.allergies.join('、')
      : '');
  if (!archiveText) return;
  formData.value.allergyText = archiveText;
  if (Array.isArray(healthSummary.value?.allergies)) {
    formData.value.allergies = [...healthSummary.value.allergies];
  }
}

/** 答题。答"有"展开录入界面；答"没有"只留一句说明 */
function answerFoodAllergy(hasAllergy: boolean) {
  hasFoodAllergy.value = hasAllergy;
  /**
   * 2026-10-19：只切换选择，不清空文本/报告。
   *
   * 顾客可能误点，清空后再点回「有过敏」就丢内容；
   * 最终「没有过敏」时由订单确认页在提交 payload 里强制过滤，
   * 报告草稿也在订单创建成功后清理，而不是在这里销毁。
   */
  if (hasAllergy) {
    // 旧版本在切「没有过敏」时把文本清空过，切回来时补一次
    fillAllergyFromArchiveIfEmpty();
  }
}

/**
 * 已上传报告的"张数"。
 *
 * 一次选的多张照片属于**同一份报告的多页**（存成一份、多张附件），
 * 所以只报份数会让家长以为另一张丢了（老板 2026-10-05 的反馈）。
 */
const allergyReportPageCount = computed(() =>
  allergyReports.value.reduce(
    (total, report) =>
      total + (Array.isArray(report.attachments) ? report.attachments.length : 0),
    0,
  ),
);

/**
 * 删除报告里**某一张**照片（2026-10-05 老板要求）。
 *
 * 两种情形：
 *   · 这份报告还有别的照片 → 只把这一张从附件里去掉（PUT 更新附件，
 *     结论与过敏记录一个字都不动）
 *   · 这是最后一张 → 整份报告一起删掉（没有原件的报告没有留存意义），
 *     删报告**不会**连带删过敏记录（后端语义：依据没了，结论仍成立）
 * 两种都要弹窗确认，并把"过敏信息不受影响"写清楚。
 */
function removeReportImage(report: Record<string, any>, url: string) {
  const dogId = formData.value.dogId;
  if (!dogId) return;

  const images = (Array.isArray(report.attachments) ? report.attachments : []).filter(Boolean);
  const isLastImage = images.length <= 1;

  uni.showModal({
    title: isLastImage ? '删除这张照片？' : '删除这张照片？',
    content: isLastImage
      ? '这是这份报告的最后一张原件，删除后整份报告记录也会一并移除。已经记下的过敏信息不受影响。'
      : `这张照片会从报告原件里移除（还剩 ${images.length - 1} 张）。已经记下的过敏信息不受影响。`,
    confirmText: '删除',
    confirmColor: '#a8622a',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        if (isLastImage) {
          await dogApi.allergyReports.remove(dogId, report.id);
        } else {
          await dogApi.allergyReports.update(dogId, report.id, {
            attachments: images.filter((item: string) => item !== url),
          });
        }
        await loadAllergyReports(dogId);
        uni.showToast({ title: '已删除', icon: 'none' });
      } catch (error: any) {
        uni.showToast({ title: error?.message || '删除失败，请重试', icon: 'none' });
      }
    },
  });
}

function attachmentExtension(url: unknown): string {
  const raw = String(url || '');
  const extMatch = raw.match(/[?&]ext=([a-z0-9]+)/i);
  if (extMatch) return `.${extMatch[1].toLowerCase()}`;
  const path = raw.split('?')[0].split('#')[0].toLowerCase();
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot) : '';
}

function isImageAttachment(url: unknown): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.heif'].includes(
    attachmentExtension(url),
  );
}

function isDocumentAttachment(url: unknown): boolean {
  return ['.pdf', '.doc', '.docx'].includes(attachmentExtension(url));
}

function attachmentFileLabel(url: unknown): string {
  const ext = attachmentExtension(url);
  if (ext === '.pdf') return 'PDF';
  if (ext === '.doc' || ext === '.docx') return 'Word';
  return '文件';
}

function allergyReportPageText(report: Record<string, any>): string {
  const attachments = Array.isArray(report.attachments) ? report.attachments : [];
  const pages = attachments.length;
  const results = Number(report.resultCount || 0);
  const unit = attachments.some(isDocumentAttachment) ? '个文件' : '张照片';
  const parts = [`${pages} ${unit}`];
  if (results > 0) parts.push(`${results} 项结论`);
  return parts.join(' · ');
}

/** 草稿报告的“张数 / 结论数” */
function draftReportPageText(report: Record<string, any>): string {
  const attachments = Array.isArray(report.attachments) ? report.attachments : [];
  const pages = attachments.length;
  const results = Array.isArray(report.results) ? report.results.length : 0;
  const unit = attachments.some(isDocumentAttachment) ? '个文件' : '张照片';
  const parts = [`${pages} ${unit}`];
  if (results > 0) parts.push(`${results} 项结论`);
  return parts.join(' · ');
}

/**
 * 删除本次上传报告里的**某一张**照片（2026-10-19 恢复老板熟悉的删除方式）。
 *
 * 和已入档案的历史报告一致：
 *   · 还有别的照片 → 只把这一张从报告里去掉，并清理这张的 COS 文件
 *   · 这是最后一张 → 整份草稿一起移除
 * 已经填进文本框的过敏食物不受影响。
 */
function removeDraftReportImage(reportIndex: number, url: string) {
  const report = formData.value.reportDrafts[reportIndex];
  if (!report) return;

  const images = Array.isArray(report.attachments) ? report.attachments : [];
  const imageIndex = images.indexOf(url);
  if (imageIndex < 0) return;

  const isLastImage = images.length <= 1;
  const key = Array.isArray(report.attachmentKeys)
    ? String(report.attachmentKeys[imageIndex] || '')
    : '';

  uni.showModal({
    title: '删除这张照片？',
    content: isLastImage
      ? '这是这份报告的最后一张原件，删除后整份报告也会一并移除。已经填进文本框的过敏食物不受影响。'
      : `这张照片会从报告原件里移除（还剩 ${images.length - 1} 张）。已经填进文本框的过敏食物不受影响。`,
    confirmText: '删除',
    confirmColor: '#a8622a',
    success: async (res) => {
      if (!res.confirm) return;

      if (isLastImage) {
        formData.value.reportDrafts.splice(reportIndex, 1);
        await cleanupDraftReportFiles([report]);
      } else {
        report.attachments = images.filter((item) => item !== url);
        report.attachmentKeys = (report.attachmentKeys || []).filter(
          (_, index) => index !== imageIndex,
        );
        if (key) {
          await deleteDraftReportFileKeys([key]);
        }
      }

      uni.showToast({ title: '已删除', icon: 'none' });
    },
  });
}

/**
 * 定制方向：计划（进行中/维持期）优先；否则用顾客三选一。
 *
 * 2026-10-19：不再按体况限制顾客的选择，选择权交给家长；
 * 暂停的计划不锁方向（hasOpenPlan 不含 PAUSED），由顾客重新选。
 * 取值顺序固定为「计划 > 顾客三选一」：
 *   ① 进行中/维持期 → 计划说了算：减重计划 → LOSE_WEIGHT，
 *      增重计划 → GAIN_WEIGHT，维持期 → MAINTAIN
 *   ② 其它（没有计划 / 已暂停）→ 按顾客选的方向
 *   ③ 还没选 → 空字符串（确认时由校验拦住）
 */
/** BCS 4-5 是理想区间，按"维持"处理（后端在同样区间里不给增减重建议） */
const BCS_MAINTAIN_GOAL = 'MAINTAIN';

function resolveTargetGoal(): string {
  const plan = selectedPlan.value;
  if (plan) {
    if (plan.status === 'ACTIVE') {
      return plan.direction === 'LOSS' ? 'LOSE_WEIGHT' : 'GAIN_WEIGHT';
    }
    if (plan.status === 'MAINTENANCE') return BCS_MAINTAIN_GOAL;
  }

  if (weightGoalChoice.value === 'LOSS') return 'LOSE_WEIGHT';
  if (weightGoalChoice.value === 'GAIN') return 'GAIN_WEIGHT';
  if (weightGoalChoice.value === 'MAINTAIN') return BCS_MAINTAIN_GOAL;
  // 还没选：不给方向（确认时校验会提示先选一个）
  return '';
}

/**
 * 把表单里的方向对齐到「计划 > 顾客三选一」。
 *
 * 每次会影响方向的输入变化（选狗、读到计划、补确认完体况）后都要调一次。
 */
function syncGoalWithPlan() {
  formData.value.targetGoal = resolveTargetGoal();
}

async function loadSelectedPlan(dogId: string) {
  selectedPlan.value = null;
  if (!dogId) return;
  try {
    const res = await weightGoalPlanApi.current(dogId);
    // 慢响应保护：连点切换狗狗时，上一只的响应可能后到，
    // 不能让它把当前这只狗的计划覆盖掉（医疗/用量信息串狗是安全事件）
    if (formData.value.dogId !== dogId) return;
    selectedPlan.value = res.code === 0 ? (res.data ?? null) : null;
    // 方向跟计划走，放在赋值之后、慢响应保护之内
    syncGoalWithPlan();
  } catch {
    // 读不到计划不该挡住定制流程：方向退回让顾客自己选
    selectedPlan.value = null;
    syncGoalWithPlan();
  }
}

/**
 * Banner 里的头像。
 *
 * 与爱犬概览页、健康管理页共用同一个解析函数：没上传头像时给统一默认头像，
 * 不在这里各写一份兜底逻辑。
 */
const dogAvatarSrc = computed(() => resolveDogAvatarSrc(selectedDog.value?.avatarUrl));

/** 选择器要定位到当前这只狗；找不到就落回第一只（宁可少点一次，不猜） */
const dogPickerIndex = computed(() =>
  Math.max(0, dogOptions.value.findIndex((dog) => dog.value === formData.value.dogId)),
);

/** Banner 那一行小字里的体重：不是有效数字就不显示这一项，不写"未知"占位 */
function formatHeroWeight(value: unknown): string {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return '';
  return Number.isInteger(weight) ? `${weight}kg` : `${weight.toFixed(1)}kg`;
}

/**
 * Banner 里名字下面那行小字：品种 · 月龄 · 体重。
 *
 * 每次渲染都从 selectedDog 现算，**不用** dogOptions 里那份拼好的 label：
 * 2026-09-28 真实缺陷 —— 确认定制门槛后会把 PUT 响应合并进 selectedDog，
 * 那份响应当时漏了 breedName，于是品种显示成"未知品种"，
 * 而选择器用的是早先拼好的字符串、还显示着正确品种，同一屏自相矛盾。
 * 派生出来的文字不可能出现两份互相打架的品种。
 */
const dogHeroLine = computed(() => {
  const dog = selectedDog.value;
  if (!dog) return '';
  return [
    resolveDogBreedName(dog),
    calculateDogAgeText(dog.birthday),
    formatHeroWeight(dog.currentWeightKg),
  ]
    .filter(Boolean)
    .join(' · ');
});

/**
 * 计划是否锁方向：只有进行中 / 维持期。
 *
 * PAUSED 不算：暂停期间按正常维持量，这一单应由顾客重新选。
 * 若把 PAUSED 算进来，resolveTargetGoal 算不出方向，提交按钮会卡死。
 * 计划横幅仍会展示暂停计划（selectedPlan 不受影响）。
 */
const hasOpenPlan = computed(() => {
  const plan = selectedPlan.value;
  if (!plan) return false;
  return ['ACTIVE', 'MAINTENANCE'].includes(String(plan.status));
});

/**
 * 打开体重管理计划页（只有已有进行中/维持期计划时才有入口）。
 *
 * mode=adjust：有计划的狗再走 create，后端 createPlan 会抛
 * 「这只狗狗已经有一个进行中的计划了」，顾客点了按钮只看到一句报错。
 * 暂停的计划不从定制页进；这个页面只提示可在健康管理中恢复。
 */
const goToWeightGoalPlan = () => {
  const dogId = formData.value.dogId;
  if (!dogId) {
    uni.showToast({ title: '请先选择要定制的狗狗', icon: 'none' });
    return;
  }
  const query = [`dogId=${encodeURIComponent(dogId)}`];
  if (hasOpenPlan.value) {
    query.push('mode=adjust');
  }
  uni.navigateTo({
    url: `/pages/weight-goal-plan/index?${query.join('&')}`,
  });
};

/** 未登录标记：与"已登录但还没有狗狗档案"是两个不同的状态，提示语和下一步动作都不一样 */
const needLogin = ref(false);

/**
 * Banner 标题：未登录 / 读取中 / 读取失败 / 真的没有档案 / 有狗未选，各有各的说法。
 *
 * 2026-10-18 修：无狗时原先写死「请选择狗狗」，可这块点不动 ——
 * 明明没有狗可选，却摆一句"请选择"，和下方的建档引导打架。
 * 现在按状态给话：没登录说"登录后选择"，读取中说"正在读取"，
 * 读取失败说"没读出来"（不能写成"还没有档案"），真的 0 只狗才说"还没有狗狗档案"，
 * 只有多只狗未选时才说"请选择（共 N 只）"。
 */
const heroTitle = computed(() => {
  if (selectedDog.value) return selectedDog.value.name || '狗狗';
  if (needLogin.value) return '登录后选择狗狗';
  if (dogsLoading.value) return '正在读取狗狗档案…';
  // 读取失败不能写成"还没有档案"——那正是这次要修的错误归因
  if (dogsLoadFailed.value) return '狗狗档案没读出来';
  if (dogOptions.value.length === 0) return '还没有狗狗档案';
  return `请选择狗狗（共 ${dogOptions.value.length} 只）`;
});

/**
 * 排期口径（2026-10-04 拍板）：顾客**不选日期**，前端也不传日期。
 *
 * 排期由后端"从今天起找最近的可接单工作日"（当天约满或遇公众假期顺延）决定，
 * 下单响应与订单接口会带回 scheduledDate / estimatedDeliveryDate。
 * 这里原先有一个取"今天"的函数，把当天当作顾客选的预约日期塞进 scheduledDate ——
 * 后端的 CreateOrderDTO 已把它改为「可选且不再采信」，所以整块删掉：
 * 前端不猜日期，顾客看到的日期一律来自后端。
 */
const formData = ref({
  dogId: '',
  targetGoal: '',
  allergies: [] as string[],
  /**
   * 过敏原自由文本（2026-10-19）。
   *
   * 顾客只填这一段；报告 AI 识别的结果也回填到这里。
   * 订单保存原文快照，设计器显示原文。
   */
  allergyText: '',
  /**
   * 本单上传的检测报告草稿（2026-10-19）。
   *
   * 付款前只在页面/订单里暂存；付款成功后才转成狗狗档案里的正式报告。
   */
  reportDrafts: [] as CustomRecipeReportDraft[],
  /**
   * 2026-10-18：需求 2.3.4「第二段：补充（只问档案里没有的）」。
   *
   * `currentFoodMain` 必填 —— 交付物要写「第 1 周按 7:3 混原来的粮」，
   * 但"原来的粮"是什么营养师不知道，没有它过渡方案只能写套话。
   */
  currentFoodMain: '',
  currentFoodOther: '',
  changeReasons: [] as string[],
  changeReasonOther: '',
  stomachConditions: [] as string[],
  stomachOther: '',
  preferredIngredients: [] as string[],
  dislikedIngredients: [] as string[],
  additionalNotes: '',
  attachmentUrls: [] as string[],
  /** 与 attachmentUrls 一一对应的 COS key，用于删除时清理文件 */
  attachmentKeys: [] as string[],
  // 顾客是否要求这一单写回狗狗档案（2026-10-19：改为付款成功后才写）。
  // 后端是**只增不删**，不会删掉档案里已有的记录。
  syncToHealthProfile: true,
});

/**
 * 本地草稿（2026-10-19）。
 *
 * 老板确认：草稿先放手机本地。
 * 进入页面时：有草稿读草稿（包括“清空后”的空草稿）；没草稿才从档案预填。
 * 这样清空/修改/删报告在离开再回来时都还在，不会被档案旧值“复活”。
 */
const draftHydrating = ref(false);
/** 订单已提交成功后不再写本地草稿（页面即将 redirect） */
const draftDisabled = ref(false);
/** 防止 A 狗的慢响应 finally 把 B 狗的草稿保存状态改掉 */
const dogLoadToken = ref(0);
let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;

function getDraftCustomerId(): string {
  /**
   * 2026-10-19 修：登录页此前只存 `user` 对象，没有单独存 `userId`，
   * 所以 `uni.getStorageSync('userId')` 一直是空 —— 本地草稿从来没保存成功，
   * 清空后返回再进来又从档案预填，看起来像清空白清了。
   * 现在优先读 userId；老登录态从 user.id 兜底。
   */
  const direct = String(uni.getStorageSync('userId') || '').trim();
  if (direct) return direct;
  const user = getStoredUser();
  return String(user?.id || user?.userId || '').trim();
}

function scheduleDraftSave() {
  if (draftDisabled.value || draftHydrating.value) return;
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    flushDraftNow();
  }, 200);
}

function flushDraftNow() {
  if (draftSaveTimer) {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
  }
  if (draftDisabled.value || draftHydrating.value) return;

  const dogId = String(formData.value.dogId || '').trim();
  const customerId = getDraftCustomerId();
  if (!dogId || !customerId) return;

  saveCustomRecipeDraft(customerId, dogId, {
    form: JSON.parse(JSON.stringify(formData.value)),
    hasFoodAllergy: hasFoodAllergy.value,
    weightGoalChoice: weightGoalChoice.value,
    prefilledAllergyText: prefilledAllergyText.value,
  });
}

/** 换狗时把这一单的表单清成新狗的空表单（草稿按狗隔离） */
function resetOrderFormForDog(dogId: string) {
  formData.value = {
    dogId,
    targetGoal: '',
    allergies: [],
    allergyText: '',
    reportDrafts: [],
    currentFoodMain: '',
    currentFoodOther: '',
    changeReasons: [],
    changeReasonOther: '',
    stomachConditions: [],
    stomachOther: '',
    preferredIngredients: [],
    dislikedIngredients: [],
    additionalNotes: '',
    attachmentUrls: [],
    attachmentKeys: [],
    syncToHealthProfile: true,
  };
  weightGoalChoice.value = null;
  hasFoodAllergy.value = null;
  prefilledAllergyText.value = '';
}

function applyCustomRecipeDraft(draft: ReturnType<typeof loadCustomRecipeDraft>) {
  if (!draft?.form) return;
  Object.assign(formData.value, draft.form, { dogId: draft.dogId });
  if (!Array.isArray(formData.value.reportDrafts)) {
    formData.value.reportDrafts = [];
  }
  hasFoodAllergy.value = draft.hasFoodAllergy;
  weightGoalChoice.value = draft.weightGoalChoice;
  prefilledAllergyText.value = draft.prefilledAllergyText || '';
}

/** 清掉草稿里已经上传到 COS、但最终没进订单的报告文件 */
async function deleteDraftReportFileKeys(keys: string[]) {
  for (const key of keys || []) {
    const value = String(key || '').trim();
    if (!value) continue;
    await dogApi.deleteHealthAttachment('allergy', value).catch((error) => {
      console.warn('[CustomRecipe] 清理草稿报告文件失败:', value, error);
    });
  }
}

async function cleanupDraftReportFiles(reports: CustomRecipeReportDraft[]) {
  const keys: string[] = [];
  for (const report of reports || []) {
    for (const key of report?.attachmentKeys || []) {
      const value = String(key || '').trim();
      if (value) keys.push(value);
    }
  }
  await deleteDraftReportFileKeys(keys);
}

// 任何输入变化都写本地草稿；页面关闭前再兜底一次
watch(
  [formData, hasFoodAllergy, weightGoalChoice, prefilledAllergyText],
  () => scheduleDraftSave(),
  { deep: true },
);
onUnmounted(() => {
  if (paymentClockTimer) {
    clearInterval(paymentClockTimer);
    paymentClockTimer = null;
  }
  flushDraftNow();
});

/**
 * 需求 2.3.4 的三组选项（2026-10-18）。
 *
 * **都来自后端选项字典** —— 项目硬规矩：选项不写在前端。
 * 加一种喂法（比如"冻干"）只要后台加一条，前端不用改。
 */
/** 「其他」输入框的焦点（选中 Other 后自动弹出键盘，2026-10-19） */
const currentFoodOtherFocused = ref(false);
const changeReasonOtherFocused = ref(false);
const stomachOtherFocused = ref(false);

function focusCurrentFoodOther() {
  currentFoodOtherFocused.value = false;
  void nextTick(() => {
    currentFoodOtherFocused.value = true;
  });
}

function focusChangeReasonOther() {
  changeReasonOtherFocused.value = false;
  void nextTick(() => {
    changeReasonOtherFocused.value = true;
  });
}

function focusStomachOther() {
  stomachOtherFocused.value = false;
  void nextTick(() => {
    stomachOtherFocused.value = true;
  });
}

const {
  items: currentFoodOptions,
  ensure: ensureCurrentFoodOptions,
} = useOptionSet('custom_recipe_current_food');
const {
  items: changeReasonOptions,
  ensure: ensureChangeReasonOptions,
} = useOptionSet('custom_recipe_change_reason');
const { items: stomachOptions, ensure: ensureStomachOptions } = useOptionSet(
  'custom_recipe_stomach',
);

/** 单选当前食物；选「其他」时自动聚焦输入框 */
function selectCurrentFood(code: string) {
  formData.value.currentFoodMain = code;
  if (code === 'OTHER') {
    focusCurrentFoodOther();
    return;
  }
  formData.value.currentFoodOther = '';
  currentFoodOtherFocused.value = false;
}

/** 多选切换（定制原因） */
function toggleChangeReason(code: string) {
  const selected = formData.value.changeReasons.includes(code);
  const list = formData.value.changeReasons;
  formData.value.changeReasons = selected
    ? list.filter((item) => item !== code)
    : [...list, code];

  if (code === 'OTHER') {
    if (selected) {
      // 取消「其他」时把手填内容也清掉，避免留下看不见的旧值跟着提交
      formData.value.changeReasonOther = '';
      changeReasonOtherFocused.value = false;
    } else {
      focusChangeReasonOther();
    }
  }
}

/** 多选切换（肠胃情况）；选「其他」时自动聚焦输入框 */
function toggleStomach(code: string) {
  const selected = formData.value.stomachConditions.includes(code);
  const list = formData.value.stomachConditions;
  formData.value.stomachConditions = selected
    ? list.filter((item) => item !== code)
    : [...list, code];

  if (code === 'OTHER') {
    if (selected) {
      formData.value.stomachOther = '';
      stomachOtherFocused.value = false;
    } else {
      focusStomachOther();
    }
  }
}

/**
 * 档案已有信息（老板拍板的决策 3：定制页是档案的第二个填写入口）。
 *
 * 后端早就有一个汇总接口（过敏/疾病/最近体检/体重趋势），2026-09-28 又补上了
 * 疫苗与口味偏好 —— 但前端此前**从未调用过**，所以顾客每次都要从零手打。
 */
const healthSummary = ref<any>(null);
const healthSummaryLoading = ref(false);
const healthSummaryLoadFailed = ref(false);

/** 健康档案只读块：只取最近一条，不展示状态（需求 2.3.3） */
const recentVisit = computed(() => {
  const visits = healthSummary.value?.recentVisits;
  return Array.isArray(visits) && visits.length > 0 ? visits[0] : null;
});
const recentCheckup = computed(() => {
  const checkups = healthSummary.value?.recentCheckups;
  return Array.isArray(checkups) && checkups.length > 0 ? checkups[0] : null;
});

/** 健康档案日期按 09-20 显示（文档示例口径） */
function formatHealthRecordDate(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    const match = text.match(/^\d{4}-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : text;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/** 打开健康管理补填/修改；返回时 onShow 只刷新这一块，不动草稿 */
function goToHealthProfile() {
  const dogId = String(formData.value.dogId || '').trim();
  if (!dogId) return;
  uni.navigateTo({
    url: `/pages/dog-profile-health/index?dogId=${encodeURIComponent(dogId)}&from=custom_recipe`,
  });
}

/** 只刷新健康汇总，不重置表单/草稿（需求 2.3.8） */
async function refreshHealthSummary(dogId: string) {
  if (!dogId) return;
  try {
    const summary = await fetchDogHealthSummary(dogId);
    if (!summary) return;
    if (String(formData.value.dogId || '') !== dogId) return;
    healthSummary.value = summary;
    healthSummaryLoadFailed.value = false;
  } catch (error) {
    // 刷新失败保留旧内容；没有旧内容时提示读取失败，不冒充“没有记录”
    console.warn('[CustomRecipe] 刷新健康档案失败:', error);
    if (!healthSummary.value) healthSummaryLoadFailed.value = true;
  }
}

/** 过敏文本输入框焦点（校验失败时定位用） */
const allergyTextFocused = ref(false);

/** 附件上传中 */
const attachmentUploading = ref(false);

/**
 * 附件最多张数。
 *
 * 后端一个订单能存多条 COS 地址，但顾客一次上传一堆照片也没人看得完，
 * 而且"最多几张"必须提前说清 —— 传满才知道传不进去是最差的体验。
 */
const maxAttachmentCount = 9;

const canAddAttachment = computed(
  () =>
    !attachmentUploading.value &&
    formData.value.attachmentUrls.length < maxAttachmentCount,
);

// 后台「食谱定制设置」的公开部分（定制费 / 交付工作日数）
const recipeConfig = ref<{
  feeAmount: number;
  deliveryWorkDays: number;
  /**
   * 支付超时分钟数（0 = 不自动关单）。
   *
   * 口径来自后台「食谱定制设置」，公开配置接口下发；
   * 接口还没下发这个字段时按 0 处理 —— 此时页面不显示任何时限文案，
   * 绝不自己编一个默认超时。
   */
  paymentTimeoutMinutes: number;
  /** 订阅消息模板 ID；后台未配置时为 null（小程序据此跳过订阅申请） */
  orderNotifyTemplateId: string | null;
} | null>(null);

// 计算属性
/**
 * 定制门槛（老板决策 1 + U3）。
 *
 * 这四项在表单里都有兜底值，所以"有值"不代表顾客选过：
 *   · 体况评分、活动量 —— 原先建档案时被系统预填（生产 76% 等于默认值 5）
 *   · 每日餐数 —— 直接决定制作单的每包克重与包数
 * 因此门槛按**顾客是否亲自确认过**判定，而不是"有没有值"。
 * 未确认的在这里就地补确认（老板决定：老档案不追溯，进定制页时才要求补）。
 */
const gateUnconfirmed = computed(() => {
  const dog = selectedDog.value;
  if (!dog) return [] as string[];

  const missing: string[] = [];
  if (!dog.bcsScoreConfirmed) missing.push('体况评分');
  if (!dog.activityLevelConfirmed) missing.push('活动量');
  if (!dog.mealsPerDayConfirmed) missing.push('每日餐数');
  return missing;
});

const gateBlocked = computed(
  () => Boolean(selectedDog.value) && gateUnconfirmed.value.length > 0,
);

/** 补确认用的草稿值：默认沿用档案里的现值，顾客可以直接确认或改动 */
const gateDraft = ref({ activityLevel: 'LOW', mealsPerDay: '2' });
const gateSaving = ref(false);

// ========== 体况引导（阶段 C6）：与建档页共用同一套 4 动作问卷 ==========
//
// 2026-09-29 修正：这里原来是一个「1-9 分」选择器 —— 正是阶段 C1 废掉的做法。
// C1 改问卷的全部理由是「顾客看不懂 9 选 1，所以生产库 99.98% 从未确认过」，
// 而定制页恰恰是顾客**第一次真正被问到体况**的地方（老档案不追溯，
// 进定制页才要求补确认）。两处不一致，等于把废掉的老问题又端了上来。
const gateBcsAnswers = ref<Record<string, number>>({});

/** 档案里已确认过体况 → 只读展示，不重复问 */
const gateBcsAlreadyConfirmed = computed(() =>
  Boolean(selectedDog.value?.bcsScoreConfirmed),
);

const gateBcsQuestions = BCS_QUESTIONS;

const gateBcsResult = computed(() =>
  resolveBcsFromAnswers({
    answers: gateBcsAnswers.value,
    questions: gateBcsQuestions,
  }),
);

/**
 * 该犬种的体况分下限（深胸细腰型犬，如灵缇）。
 * 名单与数值来自数据库犬种表，随狗的档案接口下发。
 */
const gateBcsScoreMap = computed(
  () => selectedDog.value?.bcsScoreMap ?? null,
);

/** 最终生效的体况分 = 算出的分与犬种下限取较大者 */
const gateEffectiveBcs = computed(() =>
  applyBcsScoreMap(
    gateBcsResult.value.bcs,
    gateBcsScoreMap.value,
    gateBcsQuestions[0].options,
  ),
);

const gateBcsResultLabel = computed(() =>
  gateEffectiveBcs.value === null ? '' : getBcsLabel(gateEffectiveBcs.value),
);

/** 必答题还没答完 → 按钮不可用（与建档页同一套判据） */
const gateBcsPending = computed(
  () => !gateBcsAlreadyConfirmed.value && gateBcsResult.value.bcs === null,
);

function selectGateBcsAnswer(questionKey: string, bcs: number) {
  gateBcsAnswers.value = { ...gateBcsAnswers.value, [questionKey]: bcs };
}
// ========== 体况引导结束 ==========

const gateActivityOptions = [
  { value: 'RESTING', label: '休息静养' },
  { value: 'LOW', label: '城市日常（多数城市犬）' },
  { value: 'NORMAL', label: '规律运动' },
  { value: 'HIGH', label: '高活动' },
  { value: 'WORKING', label: '工作犬' },
];
const gateMealOptions = ['1', '2', '3', '4', '5'];

const gateActivityIndex = computed(() =>
  Math.max(0, gateActivityOptions.findIndex((item) => item.value === gateDraft.value.activityLevel)),
);
const gateMealIndex = computed(() =>
  Math.max(0, gateMealOptions.indexOf(gateDraft.value.mealsPerDay)),
);

function syncGateDraftFromDog(dog: any) {
  gateDraft.value = {
    activityLevel: String(dog?.activityLevel || 'LOW'),
    mealsPerDay: String(dog?.mealsPerDay || '2'),
  };
  // 换了一只狗就要重答，不能把上一只的答案带过来
  gateBcsAnswers.value = {};
}

function onGateActivityChange(event: any) {
  gateDraft.value.activityLevel = gateActivityOptions[event.detail.value]?.value || 'LOW';
}

function onGateMealChange(event: any) {
  gateDraft.value.mealsPerDay = gateMealOptions[event.detail.value] || '2';
}

/**
 * 提交补确认。
 *
 * 只有顾客在这里点了按钮，才会带上 *Confirmed: true —— 这正是门槛的判据。
 * 只提交这几项，不动档案的其它内容。
 */
const confirmGate = async () => {
  if (!selectedDog.value || gateSaving.value) return;

  // 体况分来自 4 个动作题（与建档页同一套换算），不再让顾客自己估分数。
  // 已确认过的狗沿用档案里的值，不重复问。
  const bcsScore = gateBcsAlreadyConfirmed.value
    ? Number(selectedDog.value.bcsScore) || 5
    : gateBcsResult.value.bcs;

  if (bcsScore === null || bcsScore === undefined) {
    uni.showToast({ title: '请先做完体况的动作题', icon: 'none' });
    return;
  }

  gateSaving.value = true;

  try {
    uni.showLoading({ title: '保存中...' });
    const res: any = await request({
      url: `/dogs/${selectedDog.value.value}`,
      method: 'PUT',
      data: {
        bcsScore,
        activityLevel: gateDraft.value.activityLevel,
        mealsPerDay: Number(gateDraft.value.mealsPerDay) || 2,
        bcsScoreConfirmed: true,
        activityLevelConfirmed: true,
        mealsPerDayConfirmed: true,
      },
    });
    uni.hideLoading();

    const updated = res?.data?.profile;
    if (updated) {
      // 只合并这一颗按钮真的改过的东西（体况评分 / 活动量 / 每日餐数 + 三项确认）。
      //
      // 2026-09-28 真实缺陷：这里原先写的是 `{...selectedDog, ...updated}`，
      // 整体覆盖。服务端 PUT 响应当时漏回 breedName（null），
      // 于是确认完门槛，品种就从"柯基"变成"未知品种"。
      // 门槛只碰这三个字段，就不该让响应里其它字段顺手改写页面上的信息。
      selectedDog.value = {
        ...selectedDog.value,
        bcsScore: updated.bcsScore ?? selectedDog.value.bcsScore,
        activityLevel: updated.activityLevel ?? selectedDog.value.activityLevel,
        mealsPerDay: updated.mealsPerDay ?? selectedDog.value.mealsPerDay,
        bcsScoreConfirmed: true,
        activityLevelConfirmed: true,
        mealsPerDayConfirmed: true,
      };
      syncGateDraftFromDog(selectedDog.value);
      // 体况刚被顾客改过：没有计划时方向就是按体况定的，这里必须跟着变，
      // 否则页面上还写着按上一个体况算出来的方向
      syncGoalWithPlan();
    }
    uni.showToast({ title: '已确认，可以继续定制', icon: 'none' });
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({ title: error?.message || '保存失败，请重试', icon: 'none' });
  } finally {
    gateSaving.value = false;
  }
};

/**
 * 「状态区」这一整张卡要不要出现（2026-10-05 老板指出的白块）。
 *
 * 这张卡原先常驻渲染，可它下面五个分支（计划横幅 / 门槛卡 / 未登录 / 读取中 / 无档案）
 * 在"已登录 + 有档案 + 门槛已确认 + 没有计划"这个最常见的正常状态下**一条都不成立**，
 * 于是只剩内边距与白底 —— 就是 Banner 与「1 体重管理」之间那片白。
 * 现在按内容出现，没内容就不占版面。
 */
const showStatusSection = computed(
  () =>
    Boolean(selectedPlan.value) ||
    gateBlocked.value ||
    needLogin.value ||
    dogsLoading.value ||
    dogsLoadFailed.value ||
    dogOptions.value.length === 0,
);

/**
 * 体态建议（2026-10-19 老板更正）。
 *
 * 格式：「狗狗名」的体态「偏胖/理想/偏瘦」，我们建议「方向」。
 * 不用"体况评分 / 评分刻度"等专业术语；只作为建议放在三选一下方。
 */
const bcsAdviceText = computed(() => {
  const dog = selectedDog.value;
  const bcs = Number(dog?.bcsScore);
  if (!Number.isFinite(bcs) || bcs <= 0) return '';

  const name = String(dog?.name || '狗狗').trim() || '狗狗';
  if (bcs >= 6) return `${name}的体态偏胖，我们建议减重。`;
  if (bcs <= 3) return `${name}的体态偏瘦，我们建议增重。`;
  return `${name}的体态理想，我们建议维持。`;
});

const preferencePrefillHint = computed(() => {
  const preferred = formData.value.preferredIngredients.length;
  const disliked = formData.value.dislikedIngredients.length;
  if (preferred === 0 && disliked === 0) return '';
  return '已从档案带出你上次填过的口味，可以直接修改。两项都可以留空。';
});

/**
 * 「这些过敏信息是从档案带出的」（2026-10-19 改为文本提示）。
 *
 * 定制页现在是纯文本，不再逐项比对；只要还没被顾客清空，
 * 这句提示就成立。
 */
const healthPrefillHint = computed(() => {
  const prefilled = prefilledAllergyText.value.trim();
  if (!prefilled) return '';
  const current = formData.value.allergyText.trim();
  if (!current) return '';
  // 顾客把档案带来的内容整个换掉后，就不再说“从档案带出”
  if (!current.includes(prefilled)) return '';
  return '已从档案带出过敏信息，可以直接修改或补充。';
});


/**
 * 按钮只讲"下一步要付多少钱"。
 *
 * 原来写「提交定制订单 ¥300」：金额出现在"提交"这个词后面，顾客很容易理解成
 * "点下去就是付 300"。改成「下一步：支付 ¥300」，把"提交"和"付款"分成两步说清。
 *
 * 2026-10-18：按需求 2.3.5 改成「支付 ¥300」——
 * 金额**只出现这一次**（上方告知条里不再重复写金额），
 * 而"这钱包含什么"由上方那条说明负责，按钮只管"要付多少"。
 */
// ==================== 待付款单提醒 ====================

/**
 * 已有的待付款单（只用于提醒，不阻断下单）。
 *
 * 口径：不限制下单张数 —— 顾客养多只狗可以分别定制，所以这里**不能**做成
 * "先付完这一单才能再下单"。只提示"别忘了付"并给两个入口。
 */
const pendingOrder = ref<{ orderId: string; deadlineAt: number | null } | null>(
  null,
);
const pendingPaying = ref(false);
/** 到点隐藏待付款提醒，不等后台定时关单 */
const nowTick = ref(Date.now());
let paymentClockTimer: ReturnType<typeof setInterval> | null = null;
const pendingOrderExpired = computed(() =>
  isPaymentExpired(pendingOrder.value?.deadlineAt ?? null, nowTick.value),
);

/** 剩余时间文案；拿不到截止时间就整段不显示，不猜 */
const pendingOrderRemainingText = computed(() => {
  const deadlineAt = pendingOrder.value?.deadlineAt;
  if (!deadlineAt) return '';
  const remaining = formatRemainingMinutes(deadlineAt, nowTick.value);
  return remaining ? `还剩 ${remaining}` : '已超过支付时限';
});

/**
 * 配置只读一次：待付款提醒要用配置里的支付超时估算剩余时间，
 * 用同一个 promise 兜住，避免 onLoad 与 onShow 各打一次请求。
 */
let recipeConfigPromise: Promise<void> | null = null;
function ensureRecipeConfig(): Promise<void> {
  if (!recipeConfigPromise) {
    recipeConfigPromise = loadRecipeConfig();
  }
  return recipeConfigPromise;
}

const loadPendingOrder = async () => {
  // 未登录时 /my-orders 必然 401，静默跳过即可
  if (!getToken()) {
    pendingOrder.value = null;
    return;
  }

  await ensureRecipeConfig();

  try {
    const data = await fetchMyOrders({
      status: 'PENDING_PAYMENT',
      page: 1,
      pageSize: 1,
    });

    /**
     * ⚠️ 2026-10-16：抽 API 层时这里漏改了 —— `fetchMyOrders` 已经把 code 判过、
     * 直接返回 `data`，不再有 `res.code`。是**架构守卫**（用了却没声明的名字）
     * 把它抓出来的：真机上这一行会直接崩。
     */
    const first = Array.isArray(data?.orders) ? data.orders[0] : null;
    if (!first?.orderId) {
      pendingOrder.value = null;
      return;
    }

    pendingOrder.value = {
      orderId: String(first.orderId),
      // 优先用后端下发的 paymentDeadlineAt，没有才用下单时间 + 配置超时估算
      deadlineAt: resolvePaymentDeadlineAt({
        paymentDeadlineAt: first.paymentDeadlineAt ?? null,
        createdAt: first.createdAt ?? null,
        paymentTimeoutMinutes: recipeConfig.value?.paymentTimeoutMinutes ?? 0,
      }),
    };
  } catch (error) {
    // 提醒读不到不影响下单：不打扰顾客，也不弹错
    console.warn('[CustomRecipe] 读取待付款订单失败:', error);
    pendingOrder.value = null;
  }
};

/** 继续支付：与订单列表页保持同一条路径（在线支付优先，通道不可用再转人工） */
const continuePayPending = async () => {
  const orderId = pendingOrder.value?.orderId;
  if (!orderId || pendingPaying.value) return;

  if (pendingOrderExpired.value) {
    pendingOrder.value = null;
    uni.showToast({ title: '支付已超时，订单已关闭', icon: 'none' });
    void loadPendingOrder();
    return;
  }

  pendingPaying.value = true;
  try {
    const outcome = await runCustomRecipePayment(orderId);

    if (outcome === 'PAID') {
      /**
       * 2026-10-21：付款成功才清草稿。
       * 未付款/取消支付时保留，下次进入可以继续接着填。
       */
      retainCustomRecipeChoicesAfterPayment(
        getDraftCustomerId(),
        formData.value.dogId,
      );
      uni.showToast({ title: '支付成功', icon: 'success' });
      await loadPendingOrder();
      return;
    }
    if (outcome === 'CANCELLED') {
      uni.showToast({ title: '已取消支付，可稍后再付', icon: 'none' });
      return;
    }
    if (outcome === 'CLOSED') {
      uni.showToast({ title: '订单已关闭，请重新提交定制', icon: 'none' });
      await loadPendingOrder();
      return;
    }
    uni.showToast({ title: '支付未完成，可稍后重试', icon: 'none' });
  } finally {
    pendingPaying.value = false;
  }
};

const viewPendingOrder = () => {
  const orderId = pendingOrder.value?.orderId;
  if (!orderId) return;
  uni.navigateTo({
    url: `/pages/custom-recipe/order-detail?orderId=${encodeURIComponent(orderId)}`,
  });
};

// 生命周期
onLoad((options: any) => {
  const dogId = String(options?.dogId || '').trim();
  if (dogId) preferredDogId.value = dogId;
  loadDogs();
  void ensureRecipeConfig();
});

/**
 * 从建档页返回时本页不会重新挂载，之前 onLoad 只跑一次，
 * 导致用户自己建好档再回到本页，狗狗列表仍然是空的、提交按钮仍然点不动。
 *
 * 待付款提醒也在这里重查：付完款或取消订单后返回本页，提示要立刻消失。
 */
onShow(() => {
  if (!dogOptions.value.length) {
    void loadDogs();
  }
  void loadPendingOrder();
  // 从健康管理补填回来：只刷新健康档案块，不覆盖顾客已填的草稿（需求 2.3.8）
  if (formData.value.dogId) {
    void refreshHealthSummary(formData.value.dogId);
  }
});

/**
 * 返回首页/切到别的 tab 时页面可能只是隐藏、不一定卸载。
 * 在 onHide 里同步落一次草稿，保证“清空后马上返回”也不会丢。
 */
onHide(() => flushDraftNow());

// 统一的建档入口（带来源埋点，建档成功后回到本页）
const goToCreateDog = () => {
  navigateToDogCreate({ source: 'custom_recipe' });
};

/**
 * 去登录。登录成功后由登录页跳回本页（沿用全站统一的 redirect 约定），
 * 本页会重新 onLoad，拿到 token 后再读档案，顾客不用自己找回来。
 */
const goToLogin = () => {
  const redirect = '/pages/custom-recipe/index';
  uni.navigateTo({
    url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}`,
  });
};

/**
 * 判断是不是"未登录/登录过期"导致的失败。
 * request() 对 401 统一 reject 一个 message 为 'Authentication required' 的错误，
 * 并会顺手清掉本地 token。
 */
const isAuthError = (error: any) => {
  const message = String(error?.message || error || '');
  return message.includes('Authentication required') || message.includes('401');
};

// 方法

/**
 * 读取后台「食谱定制设置」的公开部分。
 * 读不到不影响下单：价格由后端在下单时按同一份配置落库，
 * 前端这里只负责把顾客看到的价格与服务端保持一致。
 */
const loadRecipeConfig = async () => {
  try {
    const res: any = await request({
      url: '/custom-recipe-config',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });
    if (res.code === 0 && res.data) {
      recipeConfig.value = {
        feeAmount: Number(res.data.feeAmount) || 0,
        deliveryWorkDays: Number(res.data.deliveryWorkDays) || 0,
        // 支付超时（0 = 不自动关单）。接口还没下发时按 0 处理：
        // 页面会跳过时限文案，而不是自己编一个默认超时出来。
        paymentTimeoutMinutes: Number(res.data.paymentTimeoutMinutes) || 0,
        orderNotifyTemplateId: res.data.orderNotifyTemplateId
          ? String(res.data.orderNotifyTemplateId)
          : null,
      };
    }
  } catch (error) {
    console.warn('[CustomRecipe] 读取定制配置失败，按默认口径展示:', error);
  }
};

const loadDogs = async () => {
  // 未登录时不发这次请求：
  // 1) /dogs 必然 401，页面会同时弹"请先登录"和"网络错误"两条互相打架的提示；
  // 2) 请求失败会让页面误落到"还没有狗狗档案"空态，把顾客引向建档这条错路。
  if (!getToken()) {
    needLogin.value = true;
    dogOptions.value = [];
    selectedDog.value = null;
    dogsLoadFailed.value = false;
    dogsLoading.value = false;
    return;
  }

  // 每次读档案都先回到加载态：否则从建档页返回重新拉取时，
  // 列表还没回来又会先闪一下"还没有狗狗档案"
  dogsLoading.value = true;
  // 重试时先退出上次的失败态；本次成功/失败会重新决定
  dogsLoadFailed.value = false;

  try {
    // 统一走 utils/api 的 request：它按全站统一响应结构 {code,message,data} 解包，
    // 不再自己判断 code，避免"接口返回结构一变就静默失效"。
    // suppressErrorToast：错误提示由本页按失败原因自己给，避免出现两条重复/矛盾的 toast。
    const res: any = await request({
      url: '/dogs',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    });

    if (res.code === 0 && res.data) {
      needLogin.value = false;
      dogsLoadFailed.value = false;
      const dogs = Array.isArray(res.data) ? res.data : [];

      dogOptions.value = dogs.map((dog: any) => ({
        // 先铺开接口数据，再覆盖 value/label —— 顺序反了的话，
        // 接口哪天回了同名字段就会把选择器的 value/label 覆盖掉
        ...dog,
        value: dog.id,
        label: `${dog.name} - ${dog.breedName || '未知品种'}`,
      }));

      /**
       * 默认选哪只狗（2026-10-18 按需求 2.3.8 补齐）。
       *
       * 需求原文：
       *   | 多只狗 | 默认选**上次定制的那只**（一只狗直接自动选） |
       *
       * ⚠️ 此前**只处理了一只狗的情况**：多只狗时什么都不选。
       * 而这一页几乎所有内容都是 `v-if="selectedDog"` ——
       * 于是养了几十只狗的顾客进来看到的是**近乎空白的一页**，
       * 只有一个"请选择狗狗"，根本不知道要先点它。
       *
       * 现在的优先级：
       *   ① 只有一只狗 → 直接选它
       *   ② 上次定制过 → 选那只狗（需求明确要求）
       *   ③ 上次在别处选过 → 用本地记住的那只
       *   ④ 都没有 → 不替顾客选，但**把"请先选一只狗狗"说得更明显**
       */
      if (!preferredDogApplied && preferredDogId.value) {
        const index = dogOptions.value.findIndex(
          (dog) => String(dog.value || dog.id) === preferredDogId.value,
        );
        if (index >= 0) {
          preferredDogApplied = true;
          onDogChange({ detail: { value: index } });
        }
      }

      if (!formData.value.dogId) {
        if (dogOptions.value.length === 1) {
          onDogChange({ detail: { value: 0 } });
        } else {
          void selectDefaultDog(dogOptions.value);
        }
      }

      // 无档案时不再弹 toast：页面上已有明确的空态与建档入口，避免重复打扰
    }
  } catch (error) {
    // 登录过期：request() 已清掉本地 token，这里把页面切到"请先登录"，
    // 不能报"网络错误"——那会让顾客以为是自己网络的问题，排查方向完全错了。
    if (isAuthError(error)) {
      needLogin.value = true;
      dogOptions.value = [];
      selectedDog.value = null;
      dogsLoadFailed.value = false;
      uni.showToast({
        title: '登录已过期，请重新登录',
        icon: 'none',
        duration: 2000,
      });
      return;
    }

    console.error('加载狗狗列表异常:', error);
    /**
     * 读取失败 ≠ 没有档案（2026-10-18）。
     *
     * 只有页面上本来就没有狗时才切到"读取失败"卡；
     * 已经有狗时保留旧数据，只弹一次 toast —— 不能因为一次刷新失败
     * 就把顾客的狗列表清空、或把他引去"创建狗狗档案"重复建档。
     */
    if (dogOptions.value.length === 0) {
      dogsLoadFailed.value = true;
    }
    uni.showToast({
      title: '网络错误，请检查后端服务',
      icon: 'none',
      duration: 2000,
    });
  } finally {
    // 无论成功失败都要退出加载态：卡在"正在读取"上，顾客没有任何重试入口
    dogsLoading.value = false;
  }
};

/**
 * 多只狗时选一个默认的（2026-10-18 · 需求 2.3.8）。
 *
 * 优先级：**上次定制的那只** → 本地记住的那只 → 都不选。
 *
 * 为什么第 ① 项要查订单而不是本地 storage：
 * `uni.getStorageSync('dogId')` 记的是"上次在**任何页面**选过的那只"，
 * 可能是健康管理页随手点的；而需求要的是"**上次定制**的那只"。
 */
async function selectDefaultDog(dogs: any[]) {
  const trySelect = (dogId?: string | null) => {
    const id = String(dogId || '').trim();
    if (!id) return false;
    const index = dogs.findIndex((dog) => String(dog.value || dog.id) === id);
    if (index < 0) return false;
    onDogChange({ detail: { value: index } });
    return true;
  };

  // ① 上次定制的那只
  if (getToken()) {
    try {
      const data = await fetchMyOrders({ page: 1, pageSize: 1 });
      const lastDogId = data?.orders?.[0]?.dog?.id;
      if (trySelect(lastDogId)) return;
    } catch {
      // 查不到就往下走 —— 这只是"替顾客少点一次"，失败不该影响页面
    }
  }

  // ② 上次在别处选过的那只
  if (trySelect(String(uni.getStorageSync('dogId') || ''))) return;

  /**
   * ③ 都没有：**不替顾客选**。
   *
   * 几十只狗里随便挑一只，等于替他把单下给了错的狗 ——
   * 那比"没选"严重得多。所以留空，并让页面把"先选一只"说得更显眼
   * （见 `needPickDog`）。
   */
}

const onDogChange = (e: any) => {
  // 换狗前先把上一只狗的草稿落盘（防抖还没触发时尤其重要）
  flushDraftNow();
  const index = e.detail.value;
  selectedDog.value = dogOptions.value[index];
  formData.value.dogId = selectedDog.value.value;
  // 换狗先按新狗的体况定一次方向：后面计划读回来了会再对齐一次（计划优先），
  // 这样在计划返回之前，页面上写的方向也不会是上一只狗的
  syncGoalWithPlan();
  // 补确认的草稿值默认沿用档案现值，顾客可以直接确认或改动
  syncGateDraftFromDog(selectedDog.value);
  void loadDogArchiveInfo(selectedDog.value.value);
  void loadSelectedPlan(selectedDog.value.value);
  // 过敏信息块要显示"已上传的检测报告"（2026-10-04 从健康管理搬来）
  void loadAllergyReports(selectedDog.value.value);
};

/** 顿号/逗号分隔的口味文本 → 标签数组 */
function splitFoodText(raw: unknown): string[] {
  return String(raw || '')
    .split(/[,，、;；\n\r]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 合并档案文本与档案里的结构化过敏原（2026-10-19）。
 *
 * 档案可能同时有：
 *   · allergyFoods —— 以前/员工写的自由文本
 *   · allergies —— 结构化记录（老数据/概览页添加）
 * 两者都要给顾客看到；相同的部分不重复拼。
 */
function mergeAllergyText(left: string, right: string): string {
  const a = String(left || '').trim();
  const b = String(right || '').trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a}；${b}`;
}

/**
 * 带出档案已有信息（决策 3）。
 *
 * 只**预填**，不覆盖顾客已经改过的东西：
 * 重复进入或换狗时以最新一次档案内容为准（顾客此时通常还没开始填）。
 *
 * 2026-10-04 数据安全修复（换狗隔离）：
 * 原先这几项只在读取**成功后**才赋值，读取失败时只清了 healthSummary ——
 * 于是上一只狗的过敏会留在新狗的单子上，还会被"一定要存档"写回
 * **新狗的档案**。过敏是医疗信息，串狗可能直接导致喂错东西。
 * 现在改成"先清空，再按新狗档案填充"：读失败就保持为空，宁可让顾客重填一遍。
 */
const loadDogArchiveInfo = async (dogId: string) => {
  if (!dogId) return;

  const token = ++dogLoadToken.value;
  draftHydrating.value = true;

  // ① 先清空上一只狗带出来的一切（含扫描出来的候选过敏原所在的报告列表）
  //    这一步必须在任何异步请求之前：读档案慢时也不能让上一只狗的医疗数据
  //    留在新狗的表单里。草稿按“顾客 + 狗”隔离，换狗就是一张新单。
  resetOrderFormForDog(dogId);
  healthSummary.value = null;
  allergyReports.value = [];

  // 再读本地草稿：有草稿（包括“清空后的空草稿”）就以草稿为准
  let draft: ReturnType<typeof loadCustomRecipeDraft> = null;
  const customerId = getDraftCustomerId();
  if (customerId) {
    draft = loadCustomRecipeDraft(customerId, dogId);
    if (draft && isCustomRecipeDraftExpired(draft)) {
      await cleanupDraftReportFiles(draft.form?.reportDrafts || []);
      await deleteDraftReportFileKeys(draft.form?.attachmentKeys || []);
      clearCustomRecipeDraft(customerId, dogId);
      draft = null;
    }
  }

  // 草稿是这一单的当前输入；先恢复，后面的档案读取只补 gate/calc，不再覆盖它
  if (draft) {
    applyCustomRecipeDraft(draft);
    formData.value.dogId = dogId;
    // 后端重启后旧媒体 token 会失效；用草稿里的 key 换新预览 URL
    await refreshCustomRecipeDraftMedia(formData.value);
  }

  healthSummaryLoading.value = true;
  let summaryLoaded = false;
  try {
    /** 同时取狗狗详情：它带回 calcResult（每日热量与克数），
     *  列表接口里没有这两个数，而"选了目标要给具体数字"需要它们。 */
    const [summary, detailRes] = await Promise.all([
      fetchDogHealthSummary(dogId),
      dogApi.detail(dogId).catch(() => null) as any,
    ]);

    if (!summary) {
      throw new Error('读取档案失败');
    }

    // ② 慢响应保护：等待期间顾客又换了狗，这份档案就不再是当前这只的，
    //    直接丢弃 —— 否则 A 狗的过敏会被填到 B 狗的单子上
    if (formData.value.dogId !== dogId) return;

    const calc = detailRes?.data?.calcResult;
    if (calc) {
      selectedDog.value = {
        ...selectedDog.value,
        targetFoodKcal: calc.finalFoodKcal,
        // 有计划时后端已按计划能量算好（阶段 D2）；
        // 没有食谱时还会给一个按已上架食谱中位数估算的克数
        estimatedDailyIntakeG: calc.estimatedDailyIntakeG,
        dailyIntakeG: calc.dailyIntakeG,
        energySource: calc.energySource,
      };
    }

    /**
     * ⚠️ 2026-10-16：抽 API 层时这里漏改了 —— `fetchDogHealthSummary`
     * 已经把 code 判过、直接返回 data（取不到时是 null，上面已经拦过）。
     * 是**架构守卫**抓出来的：真机上 `res` 不存在会直接崩。
     */
    healthSummary.value = summary;
    healthSummaryLoadFailed.value = false;
    summaryLoaded = true;

    const summaryAllergies = Array.isArray(summary.allergies)
      ? [...summary.allergies]
      : [];
    // 2026-10-19：档案里的自由文本 + 结构化记录都带出来，合并成一段文本
    const profileText = String(
      detailRes?.data?.profile?.allergyFoods ||
        selectedDog.value?.allergyFoods ||
        '',
    ).trim();
    const archiveAllergyText = mergeAllergyText(
      profileText,
      summaryAllergies.join('、'),
    );

    if (!draft) {
      formData.value.allergies = summaryAllergies;
      formData.value.allergyText = archiveAllergyText;
      prefilledAllergyText.value = formData.value.allergyText;
      // 档案里已经有过敏信息 → 这一问默认答"有过敏"（本来就是事实，
      // 让家长再答一遍反而是多一道题）；档案里没有就保持未答，等他选
      if (formData.value.allergyText || summaryAllergies.length > 0) {
        hasFoodAllergy.value = true;
      }
      // 过敏可能刚从档案带出来，方向要跟着它算的体况对齐一次
      syncGoalWithPlan();
      // 口味偏好：档案里的两个字段（2026-09-27 才在「健康管理」页有了入口）
      formData.value.preferredIngredients = splitFoodText(summary.preferredFoods);
      formData.value.dislikedIngredients = splitFoodText(summary.pickyFoods);
    } else if (
      /**
       * 旧版本/旧草稿自愈（2026-10-19）：
       * 草稿里已经选了「有过敏」，但过敏食物为空，也没有“从档案带出”的记录，
       * 而档案里实际有过敏记录 —— 这通常是旧版草稿留下的半空状态。
       * 只在“文本确实为空、且用户没有从档案带出过”时补，绝不覆盖用户自己填的内容。
       */
      hasFoodAllergy.value === true &&
      !formData.value.allergyText.trim() &&
      archiveAllergyText
    ) {
      formData.value.allergies = summaryAllergies;
      formData.value.allergyText = archiveAllergyText;
      prefilledAllergyText.value = archiveAllergyText;
    }
  } catch (error) {
    // 读不到档案不能挡住定制：保持草稿 / 清空后的状态，让顾客自己填
    console.warn('[CustomRecipe] 读取档案信息失败:', error);
    healthSummary.value = null;
    healthSummaryLoadFailed.value = true;
  } finally {
    if (token !== dogLoadToken.value) return;
    healthSummaryLoading.value = false;
    draftHydrating.value = false;
    // 读档案失败且没有草稿时不要落一份空草稿，否则下次进来也不会再从档案预填
    if (summaryLoaded || draft) {
      flushDraftNow();
    }
  }
};

/**
 * 上传资料（可选）。
 *
 * 2026-10-19：和过敏报告一样，一个入口 + 底部抽屉分「照片 / PDF、Word」；
 * 但备注附件是**订单附件**，不做 AI 识别，也不写狗狗档案。
 * 照片从相册选，文档从微信聊天选；文件名/类型只用于预览展示。
 */
function pickAttachmentEntry() {
  if (attachmentUploading.value) return;
  if (formData.value.attachmentUrls.length >= maxAttachmentCount) {
    uni.showToast({ title: `最多上传 ${maxAttachmentCount} 个附件`, icon: 'none' });
    return;
  }

  uni.showActionSheet({
    itemList: ['照片（从相册选）', 'PDF / Word 文档（从微信聊天选）'],
    success: (res) => {
      if (res.tapIndex === 0) {
        void pickAttachmentPhotos();
      } else if (res.tapIndex === 1) {
        void pickAttachmentDocument();
      }
    },
  });
}

/**
 * 批量上传备注附件。
 *
 * 微信一次可以选多张/多个文件；服务端仍是一文件一接口，
 * 所以这里按顺序上传，总数仍受 maxAttachmentCount 限制。
 */
async function uploadNoteAttachments(
  files: Array<{ path: string; size?: number }>,
) {
  if (!files.length) return;
  const remaining = maxAttachmentCount - formData.value.attachmentUrls.length;
  if (remaining <= 0) {
    uni.showToast({ title: `最多上传 ${maxAttachmentCount} 个附件`, icon: 'none' });
    return;
  }

  const accepted = files.filter((file) => Boolean(file.path)).slice(0, remaining);
  if (!accepted.length) return;

  attachmentUploading.value = true;
  let success = 0;
  let failed = 0;
  let tooLarge = 0;

  uni.showLoading({ title: '上传中…' });
  try {
    for (const file of accepted) {
      if (Number(file.size) > 10 * 1024 * 1024) {
        tooLarge += 1;
        continue;
      }
      try {
        const uploaded = await uploadCustomRecipeDraftAttachment(file.path);
        const url = String(uploaded?.url || '').trim();
        if (!url) throw new Error('上传失败，请重试');
        const key = String(uploaded?.key || '').trim();
        formData.value.attachmentUrls = [...formData.value.attachmentUrls, url];
        formData.value.attachmentKeys = [...formData.value.attachmentKeys, key];
        success += 1;
      } catch (error) {
        console.warn('[CustomRecipe] 备注附件上传失败:', error);
        failed += 1;
      }
    }
  } finally {
    attachmentUploading.value = false;
    uni.hideLoading();
  }

  if (failed || tooLarge) {
    const parts = [];
    if (success) parts.push(`已上传 ${success} 个`);
    if (failed) parts.push(`${failed} 个上传失败`);
    if (tooLarge) parts.push(`${tooLarge} 个超过 10MB`);
    uni.showToast({ title: parts.join('，'), icon: 'none', duration: 3000 });
  } else if (success > 0) {
    uni.showToast({ title: `已上传 ${success} 个`, icon: 'none' });
  }
}

async function pickAttachmentPhotos() {
  const remaining = maxAttachmentCount - formData.value.attachmentUrls.length;
  if (remaining <= 0) {
    uni.showToast({ title: `最多上传 ${maxAttachmentCount} 个附件`, icon: 'none' });
    return;
  }

  let chosen: any = null;
  try {
    chosen = await new Promise((resolve, reject) => {
      uni.chooseImage({
        // 一次最多选到剩余名额（微信相册单次上限 9）
        count: Math.min(remaining, 9),
        sizeType: ['compressed'],
        sourceType: ['album'],
        success: resolve,
        fail: reject,
      });
    });
  } catch {
    return;
  }

  const paths: string[] = Array.isArray(chosen?.tempFilePaths)
    ? chosen.tempFilePaths
    : [];
  const files = paths.map((path, index) => ({
    path,
    size: Number(chosen?.tempFiles?.[index]?.size) || 0,
  }));
  await uploadNoteAttachments(files);
}

async function pickAttachmentDocument() {
  const choose = (uni as unknown as {
    chooseMessageFile?: (options: any) => void;
  }).chooseMessageFile;
  if (typeof choose !== 'function') {
    uni.showToast({
      title: '请先把文件发到微信聊天（文件传输助手也行），再从聊天里选',
      icon: 'none',
      duration: 3000,
    });
    return;
  }

  const remaining = maxAttachmentCount - formData.value.attachmentUrls.length;
  if (remaining <= 0) {
    uni.showToast({ title: `最多上传 ${maxAttachmentCount} 个附件`, icon: 'none' });
    return;
  }

  const picked = await new Promise<Array<{ path: string; size: number }>>(
    (resolve) => {
      choose({
        count: remaining,
        type: 'file',
        extension: ['pdf', 'doc', 'docx'],
        success: (res: any) => {
          const files = (res?.tempFiles || [])
            .map((file: any) => ({
              path: String(file.path || ''),
              size: Number(file.size) || 0,
            }))
            .filter((file: { path: string }) => Boolean(file.path));
          resolve(files);
        },
        fail: () => resolve([]),
      });
    },
  );

  await uploadNoteAttachments(picked);
}

const removeAttachment = (index: number) => {
  const url = formData.value.attachmentUrls[index];
  if (!url) return;
  const key = String(formData.value.attachmentKeys[index] || '').trim();
  formData.value.attachmentUrls.splice(index, 1);
  formData.value.attachmentKeys.splice(index, 1);
  if (key) {
    void deleteDraftReportFileKeys([key]);
  }
};

/** 预览：图片看大图；PDF/Word 用微信文档查看器打开 */
async function previewAttachment(url: string) {
  if (!url) return;
  if (isImageAttachment(url)) {
    uni.previewImage({ urls: [url] });
    return;
  }
  await openDocumentAttachment(url);
}

onMounted(() => {
  // 支付截止时间到点后，前端立即收起待付款入口，不依赖后台定时任务
  paymentClockTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 15000);
  // 2026-10-18：需求 2.3.4 的三组选项
  void ensureCurrentFoodOptions();
  void ensureChangeReasonOptions();
  void ensureStomachOptions();
});

/**
 * 过敏原检测报告（2026-10-04 从健康管理搬来）。
 *
 * 报告是独立实体：检测日期 / 方式 / 原件 / 识别原文。
 * 这里只做"翻得出来" —— 原件挂在报告上，家长随时点开看。
 */
const allergyReports = ref<Array<Record<string, any>>>([]);

async function loadAllergyReports(dogId: string) {
  if (!dogId) {
    allergyReports.value = [];
    return;
  }
  try {
    const res: any = await dogApi.allergyReports.list(dogId);
    if (res?.code !== 0) return;
    allergyReports.value = Array.isArray(res?.data?.reports) ? res.data.reports : [];
    /**
     * 档案里有历史报告 → 这一问默认答"有过敏"。
     *
     * 为什么：答"没有过敏"会把整块录入界面（含已上传报告的预览）收起来。
     * 一只狗要是报告都传过了、却因为"档案里没有过敏记录"（例如报告全是阴性、
     * 或下单还没提交）落在未作答状态，家长就再也看不到自己传过的原件了。
     * 只在"还没作答"时兜底，不覆盖家长已经明确选过的答案。
     */
    if (allergyReports.value.length > 0 && hasFoodAllergy.value === null) {
      hasFoodAllergy.value = true;
    }
  } catch {
    // 报告读不到不能挡住下单 —— 过敏信息与其余步骤都还能用
    allergyReports.value = [];
  }
}

/** 报告先作为这一单的草稿存下来（2026-10-19：付款后才写狗狗档案） */
function onAllergyReportDraft(draft: CustomRecipeReportDraft) {
  if (!draft) return;
  formData.value.reportDrafts.push({
    attachments: [...(draft.attachments || [])],
    attachmentKeys: [...(draft.attachmentKeys || [])],
    testDate: draft.testDate || null,
    testMethod: draft.testMethod || 'UNKNOWN',
    ocrText: draft.ocrText || null,
    summary: draft.summary || null,
    results: (draft.results || []).map((item) => ({
      allergen: String(item?.allergen || '').trim(),
      level: String(item?.level || 'UNKNOWN'),
    })),
  });
}

/** 扫描确认后的过敏原并进这一单的文本（去重，已在文本里的跳过） */
function onAllergensScanned(payload: { allergens?: string[] }) {
  const list = Array.isArray(payload?.allergens) ? payload.allergens : [];
  const existingText = formData.value.allergyText.trim();
  const additions: string[] = [];
  for (const name of list) {
    const value = String(name || '').trim();
    if (!value) continue;
    // 结构化数组留给老记录/概览页；文本是这一单的主口径
    if (!formData.value.allergies.includes(value)) {
      formData.value.allergies.push(value);
    }
    if (!existingText.includes(value) && !additions.includes(value)) {
      additions.push(value);
    }
  }
  if (additions.length > 0) {
    formData.value.allergyText = [existingText, additions.join('、')]
      .filter(Boolean)
      .join('、');
  }
  uni.showToast({
    title:
      additions.length > 0
        ? `已把 ${additions.length} 项填进过敏文本，请核对`
        : '这些过敏原已经在过敏文本里了',
    icon: 'none',
  });
}

const ALLERGY_TEST_METHOD_LABELS: Record<string, string> = {
  SERUM: '血清检测',
  INTRADERMAL: '皮内试验',
  ELIMINATION: '排除性饮食',
  OTHER: '其它方式',
  UNKNOWN: '检测方式未记录',
};

function reportTestMethodLabel(value: unknown) {
  return ALLERGY_TEST_METHOD_LABELS[String(value || 'UNKNOWN').toUpperCase()] || '检测方式未记录';
}

/** 点开报告：预览原件（多页时一起给，可左右翻） */
async function openDocumentAttachment(url: string) {
  uni.showLoading({ title: '打开中…' });
  try {
    const downloadRes: any = await new Promise((resolve, reject) => {
      uni.downloadFile({ url, success: resolve, fail: reject });
    });
    if (downloadRes.statusCode !== 200 || !downloadRes.tempFilePath) {
      throw new Error('文件下载失败');
    }
    await new Promise((resolve, reject) => {
      uni.openDocument({
        filePath: downloadRes.tempFilePath,
        showMenu: true,
        success: resolve,
        fail: reject,
      });
    });
    uni.hideLoading();
  } catch (error: any) {
    uni.hideLoading();
    uni.showToast({
      title: error?.message || '暂时无法打开该文件',
      icon: 'none',
    });
  }
}

async function previewAllergyReport(report: Record<string, any>) {
  const urls = (Array.isArray(report?.attachments) ? report.attachments : [])
    .map((item: unknown) => String(item || '').trim())
    .filter(Boolean);
  if (urls.length === 0) {
    uni.showToast({ title: '这份报告没有留存原件', icon: 'none' });
    return;
  }

  if (urls.every(isImageAttachment)) {
    uni.previewImage({ urls, current: urls[0] });
    return;
  }

  const documentUrl = urls.find(isDocumentAttachment) || urls[0];
  await openDocumentAttachment(documentUrl);
}


const addPreferredIngredient = () => {
  uni.showModal({
    title: '添加喜欢的食材',
    editable: true,
    placeholderText: '请输入食材名称',
    success: (res) => {
      if (res.confirm && res.content) {
        formData.value.preferredIngredients.push(res.content);
      }
    },
  });
};

const removePreferredIngredient = (index: number) => {
  formData.value.preferredIngredients.splice(index, 1);
};

const addDislikedIngredient = () => {
  uni.showModal({
    title: '添加不吃的食材',
    editable: true,
    placeholderText: '请输入食材名称',
    success: (res) => {
      if (res.confirm && res.content) {
        formData.value.dislikedIngredients.push(res.content);
      }
    },
  });
};

const removeDislikedIngredient = (index: number) => {
  formData.value.dislikedIngredients.splice(index, 1);
};

type IntakeValidationFocus =
  | 'allergy'
  | 'currentFoodOther'
  | 'changeReasonOther'
  | 'stomachOther'
  | null;

interface CustomRecipeValidationResult {
  valid: boolean;
  title?: string;
  selector?: string;
  focus?: IntakeValidationFocus;
}

/** 防重复进入确认页；不是“未填完就置灰”，按钮始终可点。 */
const navigatingToConfirm = ref(false);

/**
 * 提交前校验（2026-10-19 老板确认）。
 *
 * 按钮不置灰：点了才校验。缺什么返回“提示 + 要滚到的板块 + 要聚焦的输入框”，
 * 不再只弹一句“请完善信息”。
 */
function validateCustomRecipeForm(): CustomRecipeValidationResult {
  if (!hasSelectedDog.value) {
    return { valid: false, title: '请选择要定制的狗狗', selector: '#custom-dog' };
  }
  if (needLogin.value) {
    return { valid: false, title: '请先登录', selector: '#custom-dog' };
  }
  if (gateBlocked.value) {
    return {
      valid: false,
      title: '请先确认上面的体况评分、活动量与每日餐数',
      selector: '#custom-status',
    };
  }
  if (!hasOpenPlan.value && weightGoalChoice.value === null) {
    return {
      valid: false,
      title: '请先选择：减重、维持还是增重',
      selector: '#custom-weight',
    };
  }
  if (!formData.value.targetGoal) {
    return {
      valid: false,
      title: '请先选择：减重、维持还是增重',
      selector: '#custom-weight',
    };
  }
  if (hasFoodAllergy.value === null) {
    return {
      valid: false,
      title: '请先回答：小家伙是否对部分食物过敏',
      selector: '#custom-allergy',
    };
  }
  if (
    hasFoodAllergy.value === true &&
    !formData.value.allergyText.trim()
  ) {
    return {
      valid: false,
      title: '还差：过敏食物',
      selector: '#custom-allergy',
      focus: 'allergy',
    };
  }
  if (!formData.value.currentFoodMain) {
    return {
      valid: false,
      title: '还差：现在主要喂什么',
      selector: '#custom-intake',
    };
  }
  if (
    formData.value.currentFoodMain === 'OTHER' &&
    !formData.value.currentFoodOther.trim()
  ) {
    return {
      valid: false,
      title: '还差：现在主要喂什么的补充说明',
      selector: '#custom-intake',
      focus: 'currentFoodOther',
    };
  }
  if (formData.value.changeReasons.length === 0) {
    return {
      valid: false,
      title: '还差：定制原因',
      selector: '#custom-intake',
    };
  }
  if (
    formData.value.changeReasons.includes('OTHER') &&
    !formData.value.changeReasonOther.trim()
  ) {
    return {
      valid: false,
      title: '选了「其他」，请补一句具体原因',
      selector: '#custom-intake',
      focus: 'changeReasonOther',
    };
  }
  if (
    formData.value.stomachConditions.includes('OTHER') &&
    !formData.value.stomachOther.trim()
  ) {
    return {
      valid: false,
      title: '还差：肠胃情况的补充说明',
      selector: '#custom-intake',
      focus: 'stomachOther',
    };
  }
  return { valid: true };
}

function scrollToCustomSection(selector?: string) {
  if (!selector) return;
  uni.pageScrollTo({ selector, duration: 300 });
}

function focusValidationTarget(focus?: IntakeValidationFocus) {
  if (!focus) return;
  void nextTick(() => {
    if (focus === 'allergy') {
      allergyTextFocused.value = false;
      void nextTick(() => {
        allergyTextFocused.value = true;
      });
      return;
    }
    if (focus === 'currentFoodOther') {
      focusCurrentFoodOther();
      return;
    }
    if (focus === 'changeReasonOther') {
      focusChangeReasonOther();
      return;
    }
    if (focus === 'stomachOther') {
      focusStomachOther();
    }
  });
}

/**
 * 自定义页按钮：只校验并进入订单确认页，**不创建订单、不付款**。
 * 订单确认页的「提交订单」才真正下单（2026-10-19 老板确认）。
 */
function goToOrderConfirm() {
  if (navigatingToConfirm.value) return;
  if (draftHydrating.value) {
    uni.showToast({ title: '正在读取档案，请稍候', icon: 'none' });
    return;
  }
  const result = validateCustomRecipeForm();
  if (!result.valid) {
    uni.showToast({ title: result.title || '请先完善信息', icon: 'none' });
    scrollToCustomSection(result.selector);
    focusValidationTarget(result.focus);
    return;
  }

  const dogId = String(formData.value.dogId || '').trim();
  if (!dogId) {
    uni.showToast({ title: '请选择要定制的狗狗', icon: 'none' });
    return;
  }

  // 确认页会读本地草稿；先把当前输入落盘，避免竞态
  flushDraftNow();
  navigatingToConfirm.value = true;
  uni.navigateTo({
    url: `/pages/custom-recipe/confirm?dogId=${encodeURIComponent(dogId)}`,
    complete: () => {
      navigatingToConfirm.value = false;
    },
  });
}

// 辅助函数
const getBCSText = (bcsScore: number) => {
  if (!bcsScore) return '未评估';

  if (bcsScore <= 3) {
    return `${bcsScore}/9 偏瘦`;
  } else if (bcsScore >= 6) {
    return `${bcsScore}/9 偏胖`;
  } else {
    return `${bcsScore}/9 标准`;
  }
};
</script>

<style scoped>
/* ==========================================================
   食谱定制 · 提交需求
   视觉规范对齐新版设计（深墨绿 + 金 + 米绿底），
   色值统一取 App.vue 的 --sk-* 变量，不再使用旧版橙红。
   ========================================================== */

.custom-recipe-page {
  min-height: 100vh;
  padding: 24rpx 24rpx 200rpx;
  background: var(--sk-bg, #f0f3e9);
}

/* ---------- 顶部 Banner（身份块 + 选狗） ---------- */
/* 与健康管理页 hero-card 同一套视觉，但名字下面只放一行「品种 · 月龄 · 体重」 */
.hero-card {
  padding: 32rpx;
  margin-bottom: 24rpx;
  border-radius: var(--sk-radius-card, 28rpx);
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border: 1rpx solid rgba(216, 188, 133, 0.5);
  box-shadow: 0 18rpx 36rpx rgba(27, 92, 64, 0.18);
}

.hero-card__identity {
  display: block;
}

/* 2026-10-18 老板验收时定：顶部不再显示生命阶段 / 体况评分 / 活动量，三格样式一并删除。 */

.hero-card__identity-inner {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.hero-card__avatar {
  flex: none;
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: rgba(243, 237, 221, 0.14);
  border: 2rpx solid rgba(216, 188, 133, 0.55);
}

.hero-card__name-block {
  /*
   * ⚠️ 只写 min-width: 0 不够（2026-10-09 老板报的 bug：名字太长会压到右侧信息上）。
   * 原因：这一块在 flex 行里没有"可收缩"的约束，它按**内容宽度**撑开 ✗，
   * 于是里面的名字不会触发省略号，直接盖到右边的年龄/性别/品种/体重上。
   * 三件事一起做才有效：flex: 1（占满可用宽度）+ min-width: 0（允许收缩）+ overflow: hidden。
   */
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.hero-card__title {
  display: block;
  /* 省略号真正生效的关键：这一行的 align-items 是 flex-start，
     标题按内容宽度排 —— 不封顶就不会收缩（2026-10-09 修）*/
  max-width: 100%;
  font-size: 42rpx;
  font-weight: 800;
  /* 名字过长时省略，不要把右边的"切换"挤没了 */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-card__line {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: rgba(243, 237, 221, 0.78);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.hero-card__switch {
  display: inline-block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.82);
  border-bottom: 1rpx solid rgba(255, 255, 255, 0.5);
}


/* ---------- 区块 ---------- */
.section {
  padding: 28rpx;
  margin-bottom: 24rpx;
  background: var(--sk-surface, #fbfcf7);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(30, 46, 36, 0.05);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 24rpx;
}

.step-number {
  width: 44rpx;
  height: 44rpx;
  line-height: 44rpx;
  text-align: center;
  background: linear-gradient(135deg, #d8bc85 0%, #b08d4f 100%);
  color: #1e3a2f;
  border-radius: 999rpx;
  font-size: 26rpx;
  font-weight: 700;
  flex-shrink: 0;
}

.title-text {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
  letter-spacing: 2rpx;
}

/* "未登录"与"无档案"是两种空态，共用一套视觉，避免两处样式各自漂移 */
/* 定制门槛补确认卡片 */
.gate-card {
  margin-top: 20rpx;
  padding: 26rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
  border-radius: var(--sk-radius-card, 28rpx);
}

.gate-card__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.gate-card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.7;
  color: #8a6f3d;
}

.gate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-top: 20rpx;
  padding: 16rpx 20rpx;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 12rpx;
}

.gate-row__label {
  flex: 0 0 auto;
  font-size: 26rpx;
  color: #6b6653;
}

.gate-row__value {
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
}

/* 体况评分（阶段 C6）：未确认时就地做 4 个动作题，不再让顾客估分数 */
.gate-bcs {
  margin-top: 20rpx;
  padding: 2rpx 20rpx 20rpx;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 12rpx;
}
.gate-bcs .gate-row {
  margin-top: 16rpx;
  padding: 16rpx 0 0;
  background: transparent;
  border: none;
}
.gate-row__value--done {
  color: #1a7f37;
}
/* 长毛犬 / 特殊犬种提示 —— 与建档页同一套文案 */
/* 4 个动作题 —— 与建档页同一套交互，配色贴合定制页的暖色调 */
.bcs-question {
  margin-top: 22rpx;
}
.bcs-banner {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #46564d;
  line-height: 1.6;
}

.bcs-question__image {
  display: block;
  width: 100%;
  margin-bottom: 16rpx;
  border-radius: 16rpx;
}

.bcs-question__title {
  display: block;
  font-size: 27rpx;
  color: #26261f;
  font-weight: 700;
  line-height: 1.5;
}

.bcs-question__options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}
.bcs-question__option {
  padding: 14rpx 22rpx;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
  font-size: 25rpx;
  color: #46564d;
  background: #ffffff;
}
.bcs-question__option.active {
  border-color: #1e3a2f;
  background-color: #eef4ea;
  color: #1e3a2f;
  font-weight: 700;
}

.gate-confirm-btn {
  margin-top: 24rpx;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 27rpx;
  font-weight: 600;
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border-radius: 999rpx;
}

.gate-confirm-btn::after {
  border: none;
}

.gate-confirm-btn[disabled] {
  opacity: 0.6;
}

.no-dog-hint,
.login-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 40rpx 26rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.no-dog-hint-title,
.login-hint-title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--sk-ink, #26261f);
}

.no-dog-hint-desc,
.login-hint-desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-2, #6b6653);
  text-align: center;
}

.no-dog-hint-btn,
.login-hint-btn {
  margin-top: 10rpx;
  padding: 0 44rpx;
  height: 72rpx;
  line-height: 72rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
}

.no-dog-hint-btn::after,
.login-hint-btn::after {
  border: none;
}

.dog-info-card {
  margin-top: 20rpx;
  padding: 22rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border-radius: var(--sk-radius-badge, 12rpx);
}

.info-row {
  display: flex;
  margin-bottom: 12rpx;
  font-size: 28rpx;
}

.info-row:last-child {
  margin-bottom: 0;
}

.label {
  width: 160rpx;
  color: var(--sk-ink-2, #6b6653);
}

.value {
  flex: 1;
  color: var(--sk-ink, #26261f);
}

/* ---------- 定制目标 ---------- */
.goal-group {
  margin-bottom: 30rpx;
}


/* 方向由系统定，页面上只展示结论 + 一个去计划页的按钮 */
.plan-entry-btn {
  margin-top: 20rpx;
  height: 80rpx;
  line-height: 80rpx;
  /* 有进行中的计划时它是 <button>、没计划时是 <view> ——
     view 默认左对齐，文案会贴到最左边（老板截图反馈），所以这里统一居中 */
  text-align: center;
  font-size: 27rpx;
  font-weight: 600;
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border-radius: 999rpx;
}

.plan-entry-btn::after {
  border: none;
}

/* ===== 体重管理那一问（2026-10-05 老板要求先问一句） ===== */
.goal-ask {
  padding: 20rpx 22rpx;
  border-radius: 16rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border: 1rpx solid var(--sk-line, #e3e6d4);
}

.goal-ask__question {
  display: block;
  font-size: 27rpx;
  color: var(--sk-ink, #26261f);
}

.goal-ask__options {
  display: flex;
  gap: 18rpx;
  margin-top: 16rpx;
}

.goal-ask__option {
  flex: 1;
  padding: 14rpx 0;
  text-align: center;
  font-size: 26rpx;
  color: var(--sk-ink-2, #6b6653);
  background: #ffffff;
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: 999rpx;
}

/* 选中态：与过敏快选同一套口径 —— 只靠高亮，不加勾 */
.goal-ask__option--on {
  color: #ffffff;
  background: var(--sk-primary, #1e3a2f);
  border-color: var(--sk-primary, #1e3a2f);
}

.goal-ask__note {
  display: block;
  margin-top: 16rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-2, #6b6653);
}

/* ===== 体况建议（2026-10-19 起放在三选一下方） ===== */
.advice-line {
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 14rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
}

.advice-line__text {
  font-size: 24rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

/* ===== 选中目标后的具体数字（老板问题 1） ===== */




/* ===== 从档案带出的说明 ===== */
.health-prefill-hint,
.preference-prefill-hint {
  display: block;
  margin-bottom: 16rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

/* ===== 备注（可选） ===== */

/* ===== 附件（可选） ===== */
.attachment-section {
  margin-top: 24rpx;
}

.attachment-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}


/* 上传资料入口（2026-10-05 老板要求改小）：
   与「+ 添加」同一档小圆角按钮，跟张数说明并排，不再独占一行 */
.attachment-add {
  flex: 0 0 auto;
  padding: 6rpx 18rpx;
  font-size: 23rpx;
  color: var(--sk-gold, #b08d4f);
  border: 1rpx solid rgba(176, 141, 79, 0.6);
  border-radius: 999rpx;
}

/* 传满时的占位文案：比让按钮消失更好，顾客知道"是满了"而不是"坏了" */
.attachment-limit {
  flex: 0 0 auto;
  font-size: 24rpx;
  color: var(--sk-ink-3, #968f6d);
}

.attachment-hint {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 23rpx;
  line-height: 1.6;
  color: var(--sk-ink-3, #968f6d);
}

.attachment-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.attachment-thumb-wrap {
  position: relative;
  width: 140rpx;
  height: 140rpx;
}

.attachment-thumb {
  width: 140rpx;
  height: 140rpx;
  border-radius: 12rpx;
  background: #f2f1ec;
  border: 1rpx solid #e3e6d4;
}

.attachment-doc {
  width: 140rpx;
  height: 140rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  border-radius: 12rpx;
  background: #f2f1ec;
  border: 1rpx solid #e3e6d4;
}

.attachment-doc-badge {
  font-size: 26rpx;
  font-weight: 700;
  color: #8a6b3f;
}

.attachment-doc-label {
  font-size: 20rpx;
  color: #8a7a63;
}

.attachment-thumb-remove {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 36rpx;
  text-align: center;
  font-size: 30rpx;
  color: #ffffff;
  background: rgba(38, 38, 31, 0.72);
  border-radius: 50%;
}

.attachment-empty {
  display: block;
  margin-top: 12rpx;
  font-size: 23rpx;
  color: #968f6d;
}

.health-archive {
  padding: 18rpx 20rpx;
  border-radius: 14rpx;
  background: #f7f9f1;
  border: 1rpx solid #e3e6d4;
}

.health-archive__row,
.health-archive__empty-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  min-height: 48rpx;
}

.health-archive__row + .health-archive__row {
  margin-top: 12rpx;
}

.health-archive__label {
  flex: 0 0 auto;
  font-size: 24rpx;
  color: #8a7a63;
}

.health-archive__text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 26rpx;
  color: #26261f;
}

.health-archive__arrow,
.health-archive__link {
  flex: 0 0 auto;
  font-size: 26rpx;
  color: var(--sk-gold, #b08d4f);
}

.health-item {
  margin-bottom: 22rpx;
}

.health-item:last-child {
  margin-bottom: 0;
}

/* 过敏原自由文本（2026-10-19） */
.allergy-text {
  margin-top: 20rpx;
  margin-bottom: 16rpx;
}

.allergy-text__label {
  display: block;
  margin-bottom: 12rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: #3f3222;
}

.allergy-text__input {
  width: 100%;
  min-height: 150rpx;
  padding: 20rpx;
  font-size: 26rpx;
  line-height: 1.6;
  background: #ffffff;
  border: 1rpx solid #e3e6d4;
  border-radius: 14rpx;
  box-sizing: border-box;
}

.allergy-text__hint {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #968f6d;
}

/* 已上传的检测报告（2026-10-04 从健康管理搬来） */
.allergy-reports {
  margin-top: 16rpx;
  padding-top: 14rpx;
  border-top: 1rpx dashed #e6e1d7;
}

.allergy-reports__title {
  display: block;
  font-size: 24rpx;
  color: #8a7a63;
}

/* 报告的小预览窗口（2026-10-05 老板要求）：点开看大图，右侧可删（弹窗确认） */
.allergy-reports__thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.allergy-reports__thumb {
  width: 140rpx;
  height: 140rpx;
  border-radius: 12rpx;
  background: #f2f1ec;
  border: 1rpx solid #e3e6d4;
}

/* PDF / Word 文档没有缩略图，用文档卡片代替 */
.allergy-reports__doc {
  width: 140rpx;
  height: 140rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  border-radius: 12rpx;
  background: #f2f1ec;
  border: 1rpx solid #e3e6d4;
}

.allergy-reports__doc-badge {
  font-size: 26rpx;
  font-weight: 700;
  color: #8a6b3f;
}

.allergy-reports__doc-label {
  font-size: 20rpx;
  color: #8a7a63;
}

.allergy-reports__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 12rpx;
}

/* 缩略图右上角的叉：只删这一张 */
.allergy-reports__thumb-wrap {
  position: relative;
  width: 140rpx;
  height: 140rpx;
}

.allergy-reports__thumb-remove {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 36rpx;
  text-align: center;
  font-size: 30rpx;
  color: #ffffff;
  background: rgba(38, 38, 31, 0.72);
  border-radius: 50%;
}

.allergy-reports__main {
  min-width: 0;
}

.allergy-reports__meta {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8a7a63;
}

.allergy-reports__item {
  /* 上下两段：上面是原件缩略图，下面是日期/结论数与删除
     （左右分栏的话两张缩略图就把文字挤没了） */
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin-top: 14rpx;
  padding: 18rpx;
  border-radius: 14rpx;
  background: #faf8f4;
}

.allergy-reports__name {
  font-size: 24rpx;
  color: #4a4235;
}

.allergy-reports__action {
  flex: none;
  font-size: 24rpx;
  color: #8a6b3f;
}

/* 本次上传、还没付款的报告草稿 */
.allergy-reports--draft {
  margin-top: 16rpx;
  padding: 16rpx;
  background: #fffdf6;
  border: 1rpx dashed #e8ded0;
  border-radius: 14rpx;
}

/* 手动添加入口/常见标签已下线（2026-10-19 改为文本框） */

.notes-input {
  width: 100%;
  min-height: 150rpx;
  margin-top: 20rpx;
  padding: 22rpx;
  font-size: 28rpx;
  background: var(--sk-primary-tint, #eef3ea);
  border: 1rpx solid var(--sk-line, #e3e6d4);
  border-radius: var(--sk-radius-badge, 12rpx);
  box-sizing: border-box;
}

/* ---------- 饮食偏好 ---------- */
.preference-section {
  margin-bottom: 24rpx;
}

.preference-title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 28rpx;
  color: var(--sk-ink-2, #6b6653);
}

/* ---------- 待付款单提醒（首页顶部） ---------- */
.pending-banner {
  padding: 26rpx 28rpx;
  margin-bottom: 24rpx;
  background: #f6efe0;
  border: 1rpx solid rgba(176, 141, 79, 0.55);
  border-radius: var(--sk-radius-card, 28rpx);
  box-shadow: 0 8rpx 28rpx rgba(176, 141, 79, 0.16);
}

.pending-banner__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.pending-banner__title {
  font-size: 30rpx;
  font-weight: 700;
  color: #8a6d2f;
}

.pending-banner__time {
  flex: 0 0 auto;
  font-size: 26rpx;
  font-weight: 700;
  color: #b03a2e;
}

.pending-banner__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: var(--sk-ink-2, #6b6653);
}

.pending-banner__actions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.pending-banner__btn {
  flex: 1;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 27rpx;
  font-weight: 600;
  color: var(--sk-ink-2, #6b6653);
  background: transparent;
  border: 1rpx solid rgba(176, 141, 79, 0.6);
  border-radius: 999rpx;
}

.pending-banner__btn.primary {
  color: var(--sk-gold-soft, #f6efe0);
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
}

/* ---------- 底部提交 ---------- */
.submit-section {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: var(--sk-surface, #fbfcf7);
  border-top: 1rpx solid var(--sk-line, #e3e6d4);
  box-shadow: 0 -2rpx 16rpx rgba(30, 46, 36, 0.06);
}

.submit-btn {
  display: block;
  width: 100%;
  height: 88rpx;
  line-height: 86rpx;
  padding: 0;
  box-sizing: border-box;
  font-size: 30rpx;
  font-weight: 700;
  color: var(--sk-gold-soft, #f6efe0);
  background: #1e3a2f;
  border: 1rpx solid var(--sk-gold-bright, #d8bc85);
  border-radius: 999rpx;
  letter-spacing: 1rpx;
  text-align: center;
}



.submit-btn[disabled] {
  color: #cfd4c8;
  background: #d8dccf;
  border-color: #d8dccf;
}

/* ===== 体重管理计划横幅（阶段 D1）===== */
.plan-banner {
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #eef4ea;
  border: 1rpx solid #d8e3cf;
}

.plan-banner__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.plan-banner__title {
  font-size: 27rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.plan-banner__badge {
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 600;
  background: #ffffff;
  color: #1e3a2f;
}

.plan-banner__rows {
  margin-top: 12rpx;
}

.plan-banner__row {
  display: block;
  font-size: 24rpx;
  line-height: 1.7;
  color: #46564d;
}

.plan-banner__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #6b7a70;
}

/* ===== 需求 2.3.4：它现在吃什么 / 肠胃（2026-10-18）===== */
.intake-block {
  margin-bottom: 28rpx;
}

.intake-block:last-child {
  margin-bottom: 0;
}

.intake-question {
  display: block;
  font-size: 26rpx;
  color: #3f3222;
  font-weight: 700;
  margin-bottom: 16rpx;
}

.required-legend {
  margin: 0 24rpx 12rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #8a7a63;
}

.intake-other-label {
  display: block;
  margin: 14rpx 0 8rpx;
  font-size: 22rpx;
  color: #6b6653;
}

.intake-required {
  color: #c2410c;
  margin-left: 6rpx;
}

.intake-options {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.intake-option {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid #e8ded0;
  background: #fff;
  font-size: 25rpx;
  color: #6e5f4b;
}

.intake-option--on {
  border-color: #b45309;
  background: #fff3e6;
  color: #b45309;
  font-weight: 700;
}

.intake-input {
  margin-top: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 14rpx;
  border: 2rpx solid #e8ded0;
  background: #fffdf9;
  font-size: 25rpx;
}

/* ===== 需求 2.3.5：下单前告知（2026-10-18）===== */
</style>
