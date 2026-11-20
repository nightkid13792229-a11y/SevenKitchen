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
          <div class="agent-plan__summary">{{ session.plan.summary }}</div>
          <div v-if="session.plan.mealsPerDay" class="agent-plan__meta">
            每日 {{ session.plan.mealsPerDay }} 餐
          </div>
          <table class="agent-plan__table">
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
                </td>
              </tr>
            </tbody>
          </table>
          <div class="agent-plan__table-note">
            仅列疾病特异性、或比 FEDIAF 2025
            默认评估更严的约束；通用项以营养评估为准。
          </div>
          <div v-if="session.plan.rationale" class="agent-plan__rationale">
            <div class="agent-plan__rationale-title">理由与建议</div>
            <div>{{ session.plan.rationale }}</div>
          </div>
          <div
            v-if="session.plan.nonNutrient?.length"
            class="agent-plan__notes"
          >
            <div v-for="item in session.plan.nonNutrient" :key="item.key">
              {{ item.label }}：{{ item.value }}{{ item.unit || "" }}
            </div>
          </div>
          <div
            v-if="session.phase === 'PLAN' && !session.planConfirmedAt"
            class="agent-plan__actions"
          >
            <el-button
              size="small"
              type="primary"
              :loading="deciding"
              @click="decidePlan('APPROVE')"
              >确认方案，进入选材</el-button
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
                : "确认后进入选材阶段；有问题请直接回复要改的地方。"
            }}
          </div>
        </div>

        <div v-if="session?.selection" class="agent-plan">
          <div class="agent-plan__title">
            选材候选{{
              session.selectionConfirmedAt ? "（已确认）" : "（待确认）"
            }}
          </div>
          <div class="agent-plan__summary">{{ session.selection.summary }}</div>
          <table class="agent-plan__table">
            <thead>
              <tr>
                <th>类型</th>
                <th>名称</th>
                <th>理由</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in session.selection.items" :key="index">
                <td>{{ item.kind === "FOOD" ? "食材" : "补剂" }}</td>
                <td>{{ item.name }}</td>
                <td>{{ item.reason }}</td>
                <td>{{ dataStatusLabel(item.dataStatus) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="agent-plan__actions">
            <el-button
              size="small"
              type="primary"
              :loading="deciding"
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
          <div class="agent-plan__hint">
            确认后发一条消息，进入配方编辑阶段。
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
import { computed, nextTick, ref, watch } from "vue";
import {
  recipeDesignerApi,
  type AgentMessage,
  type AgentSession,
} from "@/api/recipeDesigner";

const props = defineProps<{ modelValue: boolean; draftId: string }>();
const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "draft-changed"): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const session = ref<AgentSession | null>(null);
const messages = ref<AgentMessage[]>([]);
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
  if (status === "FAILED") return "失败";
  if (status === "STOPPED") return "已停止";
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
  try {
    await recipeDesignerApi.startAgentRun(props.draftId, text);
    input.value = "";
    await loadSession();
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

async function decideSelection(decision: "APPROVE" | "CONTINUE") {
  if (!session.value || deciding.value) return;
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
.agent-plan__rationale {
  font-size: 12px;
  line-height: 1.6;
  color: #303133;
  margin-bottom: 8px;
  white-space: pre-wrap;
}
.agent-plan__rationale-title {
  font-weight: 600;
  margin-bottom: 2px;
}
.agent-plan__table-note {
  font-size: 12px;
  color: #909399;
  margin: -2px 0 8px;
  line-height: 1.5;
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
