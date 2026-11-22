<template>
  <el-drawer
    v-model="visible"
    :size="'min(460px, 100%)'"
    :modal="false"
    :lock-scroll="false"
    :close-on-click-modal="false"
    class="agent-drawer"
    @open="handleOpen"
  >
    <template #header>
      <div class="agent-header">
        <span class="agent-header__title">AI 食谱设计</span>
        <el-tag v-if="session" size="small" :type="statusType" effect="plain">
          {{ statusLabel }}
        </el-tag>
        <el-tag v-if="session" size="small" effect="plain">
          {{ phaseLabel }}
        </el-tag>
        <el-button
          v-if="canRevert && session && !running"
          size="small"
          text
          :loading="reverting"
          @click="revertRun"
          >撤销本次 AI 运行</el-button
        >
      </div>
    </template>

    <div class="agent-body">
      <div ref="scrollRef" class="agent-messages" v-loading="loading">
        <el-empty
          v-if="!loading && visibleMessages.length === 0"
          :image-size="64"
          description="告诉它这份食谱是做什么的，它自己取数、自己评估。"
        />

        <div
          v-for="message in visibleMessages"
          :key="message.id"
          class="agent-row"
          :class="`agent-row--${message.role.toLowerCase()}`"
        >
          <template v-if="message.role === 'TOOL'">
            <details class="agent-tool">
              <summary>{{ message.toolName || "工具" }} · 执行记录</summary>
              <pre class="agent-tool__body">{{ message.content }}</pre>
            </details>
          </template>
          <template v-else>
            <span class="agent-who">{{
              message.role === "USER" ? "我" : "AI"
            }}</span>
            <div class="agent-bubble">
              {{ formatMessageContent(message.content) }}
            </div>
          </template>
        </div>

        <div v-if="session?.lastError" class="agent-error">
          {{ session.lastError }}
        </div>

        <div v-if="session?.plan" ref="planRef" class="agent-plan">
          <div class="agent-plan__title">
            营养方案{{ session.planConfirmedAt ? "（已确认）" : "（待确认）" }}
          </div>
          <div class="agent-plan__summary">{{ planSummary }}</div>
          <div class="agent-plan__section-title">
            数值约束（{{ session.plan.constraints.length }} 条）
          </div>
          <table
            v-if="session.plan.constraints.length"
            class="agent-plan__table"
          >
            <thead>
              <tr>
                <th>约束</th>
                <th>范围</th>
                <th>单位</th>
                <th>依据</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in session.plan.constraints" :key="item.key">
                <td>{{ item.label }}</td>
                <td>{{ formatRange(item.min, item.max) }}</td>
                <td>{{ item.unit }}</td>
                <td>
                  {{ item.source }}{{ item.basis ? ` · ${item.basis}` : "" }}
                  <el-tag
                    v-if="
                      item.citationId &&
                      unverifiedCitations.has(item.citationId)
                    "
                    size="small"
                    type="warning"
                    effect="plain"
                    >未核验</el-tag
                  >
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="agent-plan__table-note">
            没有需要加严的数值约束；通用营养项以营养评估为准。
          </div>
          <div
            v-if="session.plan.constraints.length"
            class="agent-plan__table-note"
          >
            只列疾病特异性、或比通用标准更严的项；蛋白、钙磷、微量元素等未加严的通用项，会在选材后按 FEDIAF 默认标准评估。
          </div>
          <div
            v-if="unverifiedCitations.size"
            class="agent-plan__table-note agent-plan__table-note--warn"
          >
            有 {{ unverifiedCitations.size }} 条引用未在本次知识库检索结果中核验；
            只提示，不阻断。
          </div>
          <template v-if="visiblePlanNonNutrient.length">
            <div class="agent-plan__section-title">
              非数值约束（{{ visiblePlanNonNutrient.length }} 条）
            </div>
            <table class="agent-plan__table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>要求</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in visiblePlanNonNutrient"
                  :key="item.key"
                >
                  <td>{{ item.label }}</td>
                  <td>{{ item.value }}{{ item.unit || "" }}</td>
                  <td>{{ item.note || "—" }}</td>
                </tr>
              </tbody>
            </table>
          </template>
          <div v-if="planRationale" class="agent-plan__rationale">
            <div class="agent-plan__rationale-title">理由与建议</div>
            <div
              class="agent-plan__rationale-text"
              :class="{ 'is-collapsed': !rationaleExpanded }"
            >
              {{ planRationale }}
            </div>
            <el-button
              v-if="planRationale.length > 600"
              size="small"
              text
              type="primary"
              @click="rationaleExpanded = !rationaleExpanded"
              >{{ rationaleExpanded ? "收起" : "展开全文" }}</el-button
            >
          </div>
          <div
            v-if="!session.planConfirmedAt"
            class="agent-plan__actions"
          >
            <el-button
              size="small"
              type="primary"
              :loading="deciding"
              @click="decidePlan('APPROVE')"
              >{{
                session.phase === "PLAN"
                  ? "确认方案，进入选材"
                  : "重新确认方案"
              }}</el-button
            >
            <el-button
              size="small"
              :loading="deciding"
              @click="decidePlan('CONTINUE')"
              >继续讨论</el-button
            >
          </div>
          <div class="agent-plan__hint">
            {{
              session.planConfirmedAt
                ? "方案已确认，正在进入选材阶段…"
                : session.phase === "PLAN"
                  ? "确认后进入选材阶段；有问题请直接回复要改的地方。"
                  : "方案已修订，待重新确认；确认后继续核对现有选材/配方。"
            }}
          </div>
        </div>

        <div v-if="session?.selection" class="agent-plan">
          <div class="agent-plan__title">
            食材候选{{
              session.selectionConfirmedAt ? "（已确认）" : "（待确认）"
            }}
          </div>
          <div class="agent-plan__summary">{{ session.selection.summary }}</div>
          <div v-if="hasOutsideSelection" class="agent-plan__actions">
            <el-button
              size="small"
              :loading="rematching"
              @click="rematchSelection"
              >重新匹配库外食材</el-button
            >
          </div>
          <table class="agent-plan__table">
            <thead>
              <tr>
                <th>选中</th>
                <th>食材类型</th>
                <th>名称</th>
                <th>理由</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in selectionFoodItems" :key="index">
                <td>
                  <el-checkbox
                    :model-value="selectionChecked.includes(item.name)"
                    :disabled="Boolean(session.selectionConfirmedAt)"
                    @change="toggleSelectionChecked(item.name, $event)"
                  />
                </td>
                <td>{{ item.foodCategory || "未分类" }}</td>
                <td>{{ item.name }}</td>
                <td>{{ item.reason }}</td>
                <td>
                  <div class="agent-selection-status">
                    <span>{{ dataStatusLabel(item.dataStatus) }}</span>
                    <el-button
                      v-if="item.dataStatus === 'MISSING'"
                      size="small"
                      text
                      type="primary"
                      @click="openIngredientCreation(item)"
                      >新增原料</el-button
                    >
                    <el-button
                      v-if="item.dataStatus === 'NEEDS_PROFILE'"
                      size="small"
                      text
                      type="primary"
                      @click="openIngredientProfile(item)"
                      >去补档案</el-button
                    >
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="agent-plan__table-note">
            只列食材；补剂等配方评估出营养缺口后，在配方编辑阶段再补。
          </div>
          <div class="agent-plan__coverage-title">CFCT 15 类覆盖</div>
          <table class="agent-plan__table agent-plan__coverage-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>候选数</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in cfctCoverage" :key="row.category">
                <td>{{ row.category }}</td>
                <td>{{ row.count }}</td>
                <td>{{ row.reason }}</td>
              </tr>
            </tbody>
          </table>
          <el-alert
            v-if="unavailableSelectionItems.length"
            class="agent-selection-block"
            type="error"
            :closable="false"
            show-icon
            :title="`有 ${unavailableSelectionItems.length} 项食材未匹配或营养档案不全`"
          >
            <template #default>
              <div>
                {{
                  unavailableSelectionItems
                    .map((item) => `${item.name}（${dataStatusLabel(item.dataStatus)}）`)
                    .join("、")
                }}
              </div>
              <div>
                勾选的食材未解决前不能保存，也不能进入配方编辑；不想要的可以先取消勾选。可以让 AI 判断同物异名，或先补原料/营养档案。
              </div>
            </template>
          </el-alert>

          <div
            v-if="session.phase === 'SELECT' && !session.selectionConfirmedAt"
            class="agent-plan__actions"
          >
            <el-button
              size="small"
              :loading="savingSelection"
              :disabled="
                selectionChecked.length === 0 ||
                unavailableCheckedSelectionItems.length > 0
              "
              @click="saveSelectionItems"
              >保存选中清单</el-button
            >
            <span v-if="selectionDirty" class="agent-plan__hint"
              >有未保存的勾选</span
            >
            <el-button
              size="small"
              type="primary"
              :loading="deciding"
              :disabled="
                selectionDirty || unavailableCheckedSelectionItems.length > 0
              "
              @click="decideSelection('APPROVE')"
              >确认选材，开始设计</el-button
            >
            <el-button
              size="small"
              :loading="deciding"
              @click="decideSelection('CONTINUE')"
              >继续讨论</el-button
            >
          </div>

          <div
            v-if="session.phase === 'SELECT' && !session.selectionConfirmedAt"
            class="agent-selection-add"
          >
            <el-input
              v-model="manualSelectionName"
              size="small"
              placeholder="清单里没有想要的食材？输入名称，让 AI 判断"
              maxlength="40"
              @keydown.enter.prevent="addSelectionByName"
            />
            <el-button
              size="small"
              type="primary"
              plain
              :disabled="!manualSelectionName.trim() || running"
              @click="addSelectionByName"
              >让 AI 判断并加入</el-button
            >
            <el-button
              v-if="unavailableSelectionItems.length"
              size="small"
              :disabled="running"
              @click="askModelToMatch"
              >让 AI 判断同物异名</el-button
            >
          </div>
          <div class="agent-plan__hint">
            {{
              session.selectionConfirmedAt
                ? "选材已确认；可在对话里继续调整配方。"
                : "确认后进入配方编辑阶段。"
            }}
          </div>
        </div>

        <div
          v-if="session?.supplementProposal?.items?.length"
          class="agent-plan agent-supplement"
        >
          <div class="agent-plan__title">补剂提案（待确认）</div>
          <div
            v-if="session.supplementProposal.summary"
            class="agent-plan__summary"
          >
            {{ session.supplementProposal.summary }}
          </div>
          <table class="agent-plan__table">
            <thead>
              <tr>
                <th>补剂</th>
                <th>克数</th>
                <th>补什么</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, index) in session.supplementProposal.items"
                :key="index"
              >
                <td>{{ item.name }}</td>
                <td>{{ item.weightG }} g</td>
                <td>{{ item.label || item.fieldPath }}</td>
                <td>{{ item.reason }}</td>
              </tr>
            </tbody>
          </table>
          <div class="agent-plan__actions">
            <el-button
              size="small"
              type="primary"
              :loading="decidingSupplement"
              @click="decideSupplement('ACCEPT')"
              >加入配方</el-button
            >
            <el-button
              size="small"
              :loading="decidingSupplement"
              @click="decideSupplement('DECLINE')"
              >不加</el-button
            >
          </div>
          <div class="agent-plan__hint">
            加入后才会写入配方；不点不会改变配方。
          </div>
        </div>

        <div v-if="pendingAsk" class="agent-plan agent-ask">
          <div class="agent-plan__title">AI 在等你的选择</div>
          <div class="agent-plan__summary">{{ pendingAsk.question }}</div>
          <div class="agent-plan__actions">
            <el-button
              v-for="option in pendingAsk.options"
              :key="option"
              size="small"
              @click="sendAskOption(option)"
              >{{ option }}</el-button
            >
          </div>
        </div>

        <div
          v-if="visiblePreparationChanges.length"
          class="agent-plan agent-prep"
        >
          <div class="agent-plan__title">预处理写法待确认</div>
          <div
            v-for="change in visiblePreparationChanges"
            :key="prepChangeKey(change)"
            class="agent-prep__row"
          >
            <div class="agent-prep__text">
              「{{ change.itemName }}」：{{
                change.source === "HISTORY" ? "历史" : "当前"
              }}
              <span class="agent-prep__value">{{ change.before }}</span>
              → 本次
              <span class="agent-prep__value">{{ change.after }}</span>
            </div>
            <div class="agent-plan__actions">
              <el-button
                size="small"
                type="primary"
                @click="applyPreparationChange(change, false)"
                >用新的</el-button
              >
              <el-button
                size="small"
                @click="applyPreparationChange(change, true)"
                >用旧的</el-button
              >
            </div>
          </div>
        </div>

        <div
          v-if="session?.status === 'COMPLETED'"
          class="agent-plan agent-complete"
        >
          <div class="agent-plan__title">设计完成</div>
          <div class="agent-plan__summary">
            配方已提交。{{
              finishReadiness
                ? `上线检查：阻断 ${finishReadiness.blockers?.length ?? 0} 项、提醒 ${finishReadiness.warnings?.length ?? 0} 项。`
                : "请打开上线检查确认是否可交付。"
            }}
          </div>
          <div
            v-if="finishReadiness?.blockers?.length"
            class="agent-plan__notes"
          >
            <div
              v-for="(blocker, index) in finishReadiness.blockers"
              :key="index"
            >
              · {{ blocker.message }}
            </div>
          </div>
          <div class="agent-plan__actions">
            <el-button
              size="small"
              type="primary"
              @click="emit('open-launch-readiness')"
              >打开上线检查</el-button
            >
          </div>
        </div>
      </div>

      <div class="agent-compose">
        <el-input
          v-model="input"
          type="textarea"
          :rows="3"
          resize="none"
          :disabled="sending || running"
          :placeholder="
            running ? 'AI 正在设计…' : '例如：做个鸭肉低脂的成犬主食'
          "
          @keydown.enter.exact.prevent="send"
        />
        <div class="agent-compose__actions">
          <span class="agent-hint">
            {{ running ? "正在运行" : "Enter 发送，Shift+Enter 换行" }}
          </span>
          <el-button
            v-if="running"
            size="small"
            type="danger"
            plain
            @click="stop"
            >停止</el-button
          >
          <el-button
            size="small"
            type="primary"
            :loading="sending"
            :disabled="!input.trim() || sending || running"
            @click="send"
            >发送</el-button
          >
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  recipeDesignerApi,
  type AgentMessage,
  type AgentSession,
} from "@/api/recipeDesigner";
import { CFCT_CLASS_OPTIONS } from "@/types/ingredient";
import {
  collectPreparationChanges,
  type PreparationChange,
} from "@/utils/recipeDesigner/preparationChanges";

const props = defineProps<{ modelValue: boolean; draftId: string }>();
const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "draft-changed"): void;
  (event: "open-launch-readiness"): void;
  (event: "running-changed", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const session = ref<AgentSession | null>(null);
const messages = ref<AgentMessage[]>([]);
/** 旧选材可能含补剂；选材卡不展示补剂。 */
const selectionFoodItems = computed(() =>
  (session.value?.selection?.items ?? []).filter(
    (item) => item.kind !== "SUPPLEMENT",
  ),
);
const hasOutsideSelection = computed(() =>
  selectionFoodItems.value.some((item) => item.dataStatus === "MISSING"),
);
const unavailableSelectionItems = computed(() =>
  selectionFoodItems.value.filter((item) => item.dataStatus !== "AVAILABLE"),
);
const unavailableCheckedSelectionItems = computed(() =>
  selectionFoodItems.value.filter(
    (item) =>
      selectionChecked.value.includes(item.name) &&
      item.dataStatus !== "AVAILABLE",
  ),
);
const manualSelectionName = ref("");
const selectionChecked = ref<string[]>([]);
const savingSelection = ref(false);
const selectionDirty = computed(() => {
  const current = [...selectionChecked.value].sort();
  const all = selectionFoodItems.value.map((item) => item.name).sort();
  return current.length !== all.length || current.some((name, i) => name !== all[i]);
});

watch(
  () => session.value?.selection,
  (selection) => {
    selectionChecked.value = (selection?.items ?? [])
      .filter((item) => item.kind !== "SUPPLEMENT")
      .map((item) => item.name);
  },
  { immediate: true },
);

function toggleSelectionChecked(name: string, checked: unknown) {
  const set = new Set(selectionChecked.value);
  if (Boolean(checked)) set.add(name);
  else set.delete(name);
  selectionChecked.value = [...set];
}

function addSelectionByName() {
  const name = manualSelectionName.value.trim();
  if (!name || running.value) return;
  manualSelectionName.value = "";
  input.value =
    `请把「${name}」加入选材候选。先用你的知识判断它和库里的同物异名/标准名，` +
    "可以调用 match_food_name 查候选；确认后用 propose_selection 重新提交。不要用其他食材替代。";
  void send();
}

function askModelToMatch() {
  const names = unavailableSelectionItems.value.map((item) => item.name);
  if (names.length === 0 || running.value) return;
  input.value =
    `请用你的知识判断以下食材的同物异名/标准名，并用 match_food_name 查库：${names.join("、")}。` +
    "确认后用库内标准名重新提交 propose_selection；不要用其他食材替代。";
  void send();
}

async function saveSelectionItems() {
  if (!session.value || savingSelection.value) return;
  if (selectionChecked.value.length === 0) {
    ElMessage.warning("至少要保留一条选材");
    return;
  }
  if (unavailableCheckedSelectionItems.value.length > 0) {
    ElMessage.warning("勾选的食材里还有未匹配或档案不全的，不能保存");
    return;
  }
  savingSelection.value = true;
  try {
    const selection = await recipeDesignerApi.updateAgentSelectionItems(
      props.draftId,
      selectionChecked.value,
    );
    session.value = { ...session.value, selection };
    ElMessage.success("已保存选中清单");
  } catch {
    // API 拦截器提示
  } finally {
    savingSelection.value = false;
  }
}
const MEDICATION_PATTERN =
  /用药|药物|处方|服药|口服|注射|抗生素|止痛药|激素/i;

function stripMedicationText(text: string) {
  return text
    .split(/(?<=[。；;！？!?\n])/)
    .filter((sentence) => !MEDICATION_PATTERN.test(sentence))
    .join("")
    .trim();
}

const planSummary = computed(() =>
  stripMedicationText(session.value?.plan?.summary ?? ""),
);
const planRationale = computed(() =>
  stripMedicationText(session.value?.plan?.rationale ?? ""),
);
const rationaleExpanded = ref(false);
const unverifiedCitations = computed(
  () => new Set(session.value?.citationAudit?.unverified ?? []),
);
const visiblePlanNonNutrient = computed(() =>
  (session.value?.plan?.nonNutrient ?? []).filter(
    (item) =>
      !MEDICATION_PATTERN.test(
        `${item.key ?? ""} ${item.label ?? ""} ${item.value ?? ""}`,
      ),
  ),
);

function normalizeCfctCategory(value?: string | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const exact = CFCT_CLASS_OPTIONS.find((category) => category === text);
  if (exact) return exact;
  return (
    CFCT_CLASS_OPTIONS.find(
      (category) => text.includes(category) || category.includes(text),
    ) ?? null
  );
}

const cfctCoverage = computed(() =>
  CFCT_CLASS_OPTIONS.map((category) => {
    const confirmed = Boolean(session.value?.selectionConfirmedAt);
    const count = selectionFoodItems.value.filter(
      (item) => normalizeCfctCategory(item.foodCategory) === category,
    ).length;
    const skipped = session.value?.selection?.skippedCategories?.find(
      (item) => normalizeCfctCategory(item.category) === category,
    )?.reason;
    return {
      category,
      count,
      reason:
        skipped || (count >= 2 ? "已覆盖" : count === 1 ? "不足2个" : "未列"),
    };
  }),
);
/** 已经点过“用新的/用旧的”的变更，不再重复显示。 */
const dismissedPrepChanges = ref<string[]>([]);

/** 累计整段对话的预处理变更；不能只取最后一条 edit_recipe。 */
const preparationChanges = computed<PreparationChange[]>(() =>
  collectPreparationChanges(messages.value),
);

const finishReadiness = computed<{
  ready?: boolean;
  blockers?: Array<{ message?: string }>;
  warnings?: Array<{ message?: string }>;
} | null>(() => {
  const finishMessages = messages.value.filter(
    (message) => message.role === "TOOL" && message.toolName === "finish",
  );
  const last = finishMessages[finishMessages.length - 1];
  if (!last) return null;
  try {
    const parsed = JSON.parse(last.content);
    return parsed?.data?.readiness ?? null;
  } catch {
    return null;
  }
});

function prepChangeKey(change: PreparationChange): string {
  return `${change.itemId}|${change.before}|${change.after}`;
}

const visiblePreparationChanges = computed(() =>
  preparationChanges.value.filter(
    (change) => !dismissedPrepChanges.value.includes(prepChangeKey(change)),
  ),
);

async function applyPreparationChange(
  change: PreparationChange,
  useOld: boolean,
): Promise<void> {
  if (useOld) {
    await recipeDesignerApi.updateItem(change.itemId, {
      preparationMethod: change.before,
    });
    emit("draft-changed");
  }
  dismissedPrepChanges.value = [
    ...dismissedPrepChanges.value,
    prepChangeKey(change),
  ];
}

/** 方案/选材已经用卡片展示，旧的摘要文字隐藏，避免重复。 */
const visibleMessages = computed(() =>
  messages.value.filter(
    (message) =>
      !(
        message.role === "ASSISTANT" &&
        (message.content.startsWith("【方案待确认】") ||
          message.content.startsWith("【选材待确认】"))
      ),
  ),
);
const input = ref("");
const sending = ref(false);
const deciding = ref(false);
const decidingSupplement = ref(false);
const canRevert = ref(false);
const reverting = ref(false);

const pendingAsk = computed<{ question: string; options: string[] } | null>(
  () => {
    if (running.value) return null;
    let lastUserIndex = -1;
    messages.value.forEach((message, index) => {
      if (message.role === "USER") lastUserIndex = index;
    });
    const after = messages.value.slice(lastUserIndex + 1);
    const ask = after
      .filter((message) => message.role === "TOOL" && message.toolName === "ask")
      .pop();
    if (!ask) return null;
    try {
      const data = JSON.parse(ask.content)?.data;
      const options = Array.isArray(data?.options)
        ? data.options.map((option: unknown) => String(option)).filter(Boolean)
        : [];
      if (options.length === 0) return null;
      return { question: String(data?.question ?? ""), options };
    } catch {
      return null;
    }
  },
);

function sendAskOption(option: string) {
  input.value = option;
  void send();
}
const rematching = ref(false);
const loading = ref(false);
const scrollRef = ref<HTMLElement | null>(null);
const planRef = ref<HTMLElement | null>(null);
const previousPlanSummary = ref<string | null>(null);
let timer: number | null = null;
let lastEditMessageId: string | null = null;
const previousStatus = ref<string | null>(null);

const running = computed(() => session.value?.status === "RUNNING");
const statusLabel = computed(() => {
  const status = session.value?.status;
  if (status === "RUNNING") return "运行中";
  if (status === "WAITING_USER") return "等你回答";
  if (status === "COMPLETED") return "已完成";
  if (status === "FAILED") return "失败";
  if (status === "STOPPED") return "已停止";
  if (status === "INTERRUPTED") return "已中断";
  return "已结束";
});
const phaseLabel = computed(() => {
  const phase = session.value?.phase;
  if (phase === "PLAN") return "方案确认";
  if (phase === "SELECT") return "选材";
  if (phase === "DESIGN") return "配方编辑";
  return "";
});

const statusType = computed(() => {
  const status = session.value?.status;
  if (status === "RUNNING") return "primary";
  if (status === "FAILED") return "danger";
  if (status === "WAITING_USER") return "warning";
  return "info";
});

async function loadSession() {
  if (!props.draftId) return;
  const result = await recipeDesignerApi.getAgentSession(props.draftId);
  session.value = result?.session ?? null;
  messages.value = result?.messages ?? [];
  await nextTick();
  if (session.value?.phase === "PLAN" && session.value.plan && planRef.value) {
    // 方案卡在消息流末尾；滚到卡片顶部，先看到数值约束表。
    planRef.value.scrollIntoView({ block: "start" });
  } else {
    scrollToBottom();
  }
  syncTimer();

  // Agent 改了草稿后，编辑器右侧的原料/总重不会自动更新；
  // 每出现一条新的 edit_recipe 执行记录，或本轮运行结束，通知父组件重载草稿。
  const edits = messages.value.filter(
    (message) => message.toolName === "edit_recipe",
  );
  const lastEdit = edits[edits.length - 1];
  if (lastEdit && lastEdit.id !== lastEditMessageId) {
    lastEditMessageId = lastEdit.id;
    emit("draft-changed");
  }

  const status = session.value?.status ?? null;
  if (previousStatus.value === "RUNNING" && status !== "RUNNING") {
    emit("draft-changed");
  }
  previousStatus.value = status;
}

function syncTimer() {
  if (running.value && timer === null) {
    timer = window.setInterval(() => void loadSession(), 1500);
  }
  if (!running.value && timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

async function send() {
  const text = input.value.trim();
  if (!text || sending.value || running.value) return;
  sending.value = true;
  // 先乐观显示用户消息；接口慢或刷新失败时，至少不会“发了没反应”。
  const optimisticId = `temp-${Date.now()}`;
  messages.value.push({
    id: optimisticId,
    seq: Number.MAX_SAFE_INTEGER,
    role: "USER",
    content: text,
    createdAt: new Date().toISOString(),
  });
  input.value = "";
  await nextTick();
  scrollToBottom();
  try {
    await recipeDesignerApi.startAgentRun(props.draftId, text);
    await loadSession();
  } catch {
    // 发送失败：撤回乐观消息，把文字放回输入框，用户不用重打。
    messages.value = messages.value.filter(
      (message) => message.id !== optimisticId,
    );
    input.value = text;
  } finally {
    sending.value = false;
  }
}

function formatRange(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `≥${min}`;
  if (max !== null) return `≤${max}`;
  return "—";
}

function dataStatusLabel(status: string): string {
  if (status === "MISSING") return "原料库没有";
  if (status === "NEEDS_PROFILE") return "营养档案不全";
  return "可用";
}

function openIngredientCreation(item: { name: string }) {
  const url = `/ingredients/ai-agent?line=FOOD&name=${encodeURIComponent(item.name)}`;
  window.open(url, "_blank", "noopener");
}

function openIngredientProfile(item: { name: string }) {
  const url = `/ingredients?keyword=${encodeURIComponent(item.name)}`;
  window.open(url, "_blank", "noopener");
}

async function rematchSelection() {
  if (!session.value || rematching.value) return;
  rematching.value = true;
  try {
    const selection = await recipeDesignerApi.rematchAgentSelection(
      props.draftId,
    );
    session.value = { ...session.value, selection };
  } finally {
    rematching.value = false;
  }
}

async function decidePlan(decision: "APPROVE" | "CONTINUE") {
  if (!session.value || deciding.value) return;
  deciding.value = true;
  try {
    await recipeDesignerApi.confirmAgentPlan(props.draftId, decision);
    await loadSession();
  } finally {
    deciding.value = false;
  }
}

async function revertRun() {
  if (!session.value || reverting.value) return;
  try {
    await ElMessageBox.confirm(
      "撤销本次 AI 运行？配方会回到这次运行前的状态；运行后你手动改过的内容不会被覆盖。",
      "撤销本次 AI 运行",
      {
        type: "warning",
        confirmButtonText: "撤销",
        cancelButtonText: "取消",
      },
    );
  } catch {
    return;
  }
  reverting.value = true;
  try {
    await recipeDesignerApi.revertAgentRun(session.value.id);
    ElMessage.success("已撤销本次 AI 运行");
    emit("draft-changed");
    await loadSession();
  } catch {
    // API 拦截器提示
  } finally {
    reverting.value = false;
  }
}

async function decideSupplement(decision: "ACCEPT" | "DECLINE") {
  if (!session.value || decidingSupplement.value) return;
  decidingSupplement.value = true;
  try {
    const result = await recipeDesignerApi.decideAgentSupplement(
      props.draftId,
      decision,
    );
    if (decision === "ACCEPT") {
      ElMessage.success(`已加入 ${result.accepted} 项补剂`);
      emit("draft-changed");
    } else {
      ElMessage.success("已忽略补剂提案");
    }
    await loadSession();
  } catch {
    // API 拦截器提示
  } finally {
    decidingSupplement.value = false;
  }
}

async function decideSelection(decision: "APPROVE" | "CONTINUE") {
  if (!session.value || deciding.value) return;
  if (decision === "APPROVE" && selectionDirty.value) {
    ElMessage.warning("请先保存选中清单");
    return;
  }
  if (
    decision === "APPROVE" &&
    unavailableCheckedSelectionItems.value.length > 0
  ) {
    ElMessage.warning("勾选的食材里还有未匹配或档案不全的，不能确认选材");
    return;
  }
  deciding.value = true;
  try {
    await recipeDesignerApi.confirmAgentSelection(props.draftId, decision);
    await loadSession();
  } finally {
    deciding.value = false;
  }
}

async function stop() {
  if (!session.value) return;
  await recipeDesignerApi.stopAgentRun(session.value.id);
  await loadSession();
}

function handleOpen() {
  void loadSession();
}

function scrollToBottom() {
  const element = scrollRef.value;
  if (element) element.scrollTop = element.scrollHeight;
}

function formatMessageContent(content: string) {
  // 旧消息里写的是“上方”，但方案卡实际在消息流末尾；统一改成中性说法。
  return content.replace("见上方方案卡表格", "见方案卡表格");
}

watch(
  () => props.draftId,
  () => {
    if (props.modelValue) void loadSession();
  },
);

watch(
  running,
  (value) => emit("running-changed", value),
  { immediate: true },
);

onBeforeUnmount(() => {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
});

watch(
  () => props.modelValue,
  (value) => {
    if (!value && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  },
);
</script>

<style scoped>
.agent-selection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.agent-header__title {
  font-weight: 600;
}
.agent-body {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}
.agent-row {
  margin-bottom: 12px;
}
.agent-row--user {
  text-align: right;
}
.agent-who {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.agent-bubble {
  display: inline-block;
  max-width: 92%;
  padding: 8px 10px;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--el-fill-color-light);
  text-align: left;
}
.agent-row--user .agent-bubble {
  background: var(--el-color-primary-light-9);
}
.agent-tool {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.agent-tool__body {
  max-height: 160px;
  overflow: auto;
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.agent-plan {
  margin: 8px 0 12px;
  padding: 10px 12px;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fafafa;
}
.agent-plan__title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}
.agent-prep {
  border-color: #f3d19e;
  background: #fdf6ec;
}
.agent-complete {
  border-color: #b3e19d;
  background: #f0f9eb;
}
.agent-plan__table-note--warn {
  color: #e6a23c;
}
.agent-supplement {
  border-color: #a0cfff;
  background: #ecf5ff;
}
.agent-ask {
  border-color: #d3d4d6;
  background: #f4f4f5;
}
.agent-selection-block {
  margin: 6px 0 8px;
}
.agent-selection-add {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 6px;
  flex-wrap: wrap;
}

.agent-prep__row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.agent-prep__text {
  font-size: 12px;
  line-height: 1.6;
}
.agent-prep__value {
  padding: 1px 4px;
  border-radius: 3px;
  background: #fff;
  font-family: monospace;
}
.agent-plan__summary {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  margin-bottom: 6px;
}
.agent-plan__meta {
  font-size: 12px;
  color: #606266;
  margin-bottom: 8px;
}
.agent-plan__section-title {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
  margin: 10px 0 4px;
}
.agent-plan__rationale {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-left: 3px solid #dcdfe6;
  border-radius: 4px;
  background: #fafafa;
}
.agent-plan__rationale-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.agent-plan__rationale-text {
  font-size: 13px;
  line-height: 1.8;
  color: #606266;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.agent-plan__rationale-text.is-collapsed {
  max-height: 180px;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, #000 70%, transparent);
}
.agent-plan__table-note {
  font-size: 12px;
  color: #909399;
  margin: -2px 0 8px;
  line-height: 1.5;
}
.agent-plan__coverage-title {
  font-size: 12px;
  font-weight: 600;
  margin: 8px 0 4px;
}
.agent-plan__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-bottom: 8px;
}
.agent-plan__table th,
.agent-plan__table td {
  border: 1px solid #ebeef5;
  padding: 4px 6px;
  text-align: left;
  vertical-align: top;
}
.agent-plan__table th {
  background: #f5f7fa;
  font-weight: 600;
}
.agent-plan__notes {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  margin-bottom: 8px;
}
.agent-plan__actions {
  display: flex;
  gap: 8px;
}
.agent-plan__hint {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
}
.agent-error {
  margin: 0 0 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
.agent-compose {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 10px;
}
.agent-compose__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}
.agent-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
