<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="1280px"
    top="4vh"
    destroy-on-close
    :close-on-click-modal="false"
  >
    <template v-if="ingredient">
      <div class="dialog-header">
        <div>
          <div class="dialog-name">{{ ingredient.name }}</div>
          <div class="dialog-desc">
            {{ dialogDescription }}
          </div>
        </div>
        <div class="dialog-tags">
          <el-tag
            :type="
              ingredient.type === IngredientType.SUPPLEMENT
                ? 'warning'
                : 'success'
            "
          >
            {{
              ingredient.type === IngredientType.SUPPLEMENT ? "补剂" : "食材"
            }}
          </el-tag>
          <el-tag effect="plain">{{ baseUnitLabel }}</el-tag>
        </div>
      </div>

      <section class="profile-manager">
        <div class="profile-manager-header">
          <div>
            <h3>营养档案</h3>
            <p>{{ profileSummaryText }}</p>
          </div>
          <div class="profile-manager-actions">
            <el-button
              v-if="canUseAgentProfileDraft"
              size="small"
              type="primary"
              :loading="agentProfileDraftLoading"
              @click="openAgentProfileDraftDrawer"
            >
              Agent 添加档案
            </el-button>
            <el-button
              size="small"
              type="primary"
              plain
              @click="openCreateProfileDialog"
            >
              新增空白档案
            </el-button>
            <div class="profile-manager-stats">
              <el-tag v-if="primaryMapping" type="success" effect="plain">
                主档案：{{ formatProfileTitle(primaryMapping) }}
              </el-tag>
              <el-tag v-if="profileMappings.length" type="info" effect="plain">
                {{ profileMappings.length }} 个档案
              </el-tag>
            </div>
          </div>
        </div>

        <el-alert
          v-if="!profileMappings.length"
          type="warning"
          :closable="false"
          show-icon
          title="暂无已入库营养档案"
        >
          当前仍使用标准原料上的兼容营养数据。后续建议通过营养档案标签页导入
          USDA/CFCT 或新增手工档案。
        </el-alert>

        <div v-else class="profile-workspace">
          <div class="profile-table-panel">
            <div class="section-heading">
              <div>
                <div class="section-title">档案列表</div>
                <div class="section-subtitle">选择后编辑该档案的营养数据。</div>
              </div>
            </div>

            <el-table
              class="profile-table"
              :data="profileMappings"
              row-key="id"
              border
              :row-class-name="getProfileRowClassName"
              @row-click="handleSelectMapping"
            >
              <el-table-column label="" width="54" align="center">
                <template #default="{ row }">
                  <button
                    type="button"
                    class="profile-select-dot"
                    :class="{ active: row.id === selectedMappingId }"
                    :aria-label="`选择 ${formatProfileTitle(row)} 档案`"
                    @click.stop="handleSelectMapping(row)"
                  />
                </template>
              </el-table-column>
              <el-table-column label="档位" width="116">
                <template #default="{ row }">
                  <el-tag v-if="row.isPrimary" type="success" effect="light"
                    >主档案</el-tag
                  >
                  <el-tag v-else type="info" effect="plain">次级档案</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="档案中文名" min-width="210">
                <template #default="{ row }">
                  <div class="table-title">
                    {{ formatProfileDisplayName(row) }}
                  </div>
                </template>
              </el-table-column>
              <el-table-column label="营养来源词条" min-width="260">
                <template #default="{ row }">
                  <div class="table-title">{{ formatFoodName(row) }}</div>
                  <div class="table-subtitle">{{ formatExternalId(row) }}</div>
                </template>
              </el-table-column>
              <el-table-column label="来源" width="110">
                <template #default="{ row }">
                  <el-tag size="small" type="info" effect="plain">
                    {{ formatSourceLabel(row) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="210" fixed="right">
                <template #default="{ row }">
                  <div class="profile-row-actions">
                    <el-button
                      v-if="!row.isPrimary"
                      size="small"
                      type="primary"
                      plain
                      :loading="settingPrimary && row.id === selectedMappingId"
                      :disabled="saving || !!deletingMappingId"
                      @click.stop="handleSetPrimaryProfile(row)"
                    >
                      设为主档案
                    </el-button>
                    <span v-else class="primary-row-note">默认使用</span>
                    <el-button
                      size="small"
                      type="danger"
                      link
                      :loading="deletingMappingId === row.id"
                      :disabled="
                        saving || settingPrimary || profileMappings.length <= 1
                      "
                      @click.stop="handleDeleteProfile(row)"
                    >
                      删除
                    </el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div v-if="selectedMapping" class="profile-current-panel">
            <div class="current-profile-header">
              <div>
                <div class="section-kicker">当前编辑档案</div>
                <div class="current-profile-title">
                  {{ formatProfileTitle(selectedMapping) }}
                </div>
                <div class="current-profile-subtitle">
                  {{ formatFoodName(selectedMapping) }}
                </div>
              </div>
              <div class="current-profile-actions">
                <el-tag v-if="selectedMapping.isPrimary" type="success"
                  >主档案</el-tag
                >
                <el-tag v-else effect="plain">次级档案</el-tag>
                <el-button
                  v-if="!selectedMapping.isPrimary"
                  type="primary"
                  plain
                  :loading="settingPrimary"
                  :disabled="saving"
                  @click="handleSetPrimaryProfile()"
                >
                  设为主档案
                </el-button>
              </div>
            </div>

            <dl class="profile-meta-grid">
              <div>
                <dt>状态</dt>
                <dd>
                  {{
                    selectedMapping.nutritionFood?.preparationStateLabel ||
                    selectedMapping.nutritionFood?.preparationState ||
                    "-"
                  }}
                </dd>
              </div>
              <div>
                <dt>可食部</dt>
                <dd>
                  {{ selectedMapping.nutritionFood?.ediblePortionLabel || "-" }}
                </dd>
              </div>
              <div>
                <dt>加工</dt>
                <dd>
                  {{ selectedMapping.nutritionFood?.processingLabel || "-" }}
                </dd>
              </div>
              <div>
                <dt>来源编号</dt>
                <dd>{{ formatExternalId(selectedMapping) }}</dd>
              </div>
            </dl>
          </div>

          <div class="profile-editor-section">
            <div class="section-heading">
              <div>
                <div class="section-title">编辑档案数据</div>
                <div class="section-subtitle">
                  {{
                    selectedMapping
                      ? formatExternalId(selectedMapping)
                      : "兼容营养数据"
                  }}
                </div>
              </div>
            </div>
            <IngredientNutritionEditor
              v-if="selectedMapping || !profileMappings.length"
              v-model="draftNutritionProfile"
              :ingredient-type="ingredient.type"
              :show-sample-state="shouldShowSampleState"
            />
          </div>
        </div>
      </section>
    </template>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">
        保存档案数据
      </el-button>
    </template>

    <el-dialog
      v-model="createProfileVisible"
      title="新增空白营养档案"
      width="560px"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-form class="create-profile-form" label-position="top" @submit.prevent>
        <el-form-item label="状态">
          <el-select
            v-model="newProfileForm.preparationState"
            class="full-width"
          >
            <el-option
              v-for="option in INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="可食部 / 规格">
          <el-input
            v-model="newProfileForm.ediblePortionLabel"
            maxlength="30"
            placeholder="如：标准可食部、带皮、去皮"
          />
        </el-form-item>
        <el-form-item label="加工">
          <el-input
            v-model="newProfileForm.processingLabel"
            maxlength="30"
            placeholder="如：未加工、水煮、蒸熟"
          />
        </el-form-item>
        <el-form-item label="版本备注">
          <el-input
            v-model="newProfileForm.versionNote"
            type="textarea"
            maxlength="1000"
            show-word-limit
            :rows="3"
            placeholder="说明该空白档案的用途和后续补数依据"
          />
        </el-form-item>
        <el-checkbox
          v-model="newProfileForm.makePrimary"
          :disabled="!profileMappings.length"
        >
          创建后设为主档案
        </el-checkbox>
      </el-form>

      <template #footer>
        <el-button @click="createProfileVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creatingProfile"
          @click="handleCreateBlankProfile"
        >
          创建档案
        </el-button>
      </template>
    </el-dialog>

    <IngredientNutritionWorkbenchDrawer
      v-model="agentProfileDraftVisible"
      title="Agent 添加营养档案草稿"
      mode="PROFILE_DRAFT"
      :ingredient="agentWorkbenchIngredient"
      :candidates="agentProfileDraftCandidates"
      :existing-profile-source-keys="mappedNutritionSourceKeys"
      :busy="agentProfileDraftBusy"
      :importing="agentProfileDraftImporting"
      :ranking-with-agent="agentProfileDraftRanking"
      :rejecting-candidate-id="agentProfileDraftRejectingId"
      :validating-candidate-id="agentProfileDraftValidatingId"
      :validation-results="agentProfileDraftValidationResults"
      @rank-with-agent="handleAgentProfileDraftRank"
      @validate-nutrition="handleAgentProfileDraftValidateNutrition"
      @save="handleAgentProfileDraftSave"
      @reject-candidate="handleAgentProfileDraftRejectCandidate"
      @import-usda="handleAgentProfileDraftImportUsda"
      @rematch="handleAgentProfileDraftRematch"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { ingredientApi, nutritionFoodApi } from "@/api/ingredients";
import nutritionGovernanceApi from "@/api/nutritionGovernance";
import { INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS } from "@/constants/ingredientNutrition";
import {
  BaseUnitLabels,
  type IngredientForm,
  IngredientType,
  type Ingredient,
  type NutritionFoodMapping,
  type NutritionProfile,
  type NutritionSampleState,
} from "@/types/ingredient";
import type {
  ApplyIngredientCandidateConfigurationPayload,
  CandidateNutritionValidationWithAgentResult,
  IngredientNutritionCandidateListItem,
  NutritionGovernanceIngredientSummary,
} from "@/types/nutritionGovernance";
import { createEmptyIngredientNutritionFormValue } from "@/utils/ingredientNutrition";
import IngredientNutritionWorkbenchDrawer from "@/views/NutritionGovernance/components/IngredientNutritionWorkbenchDrawer.vue";
import IngredientNutritionEditor from "./IngredientNutritionEditor.vue";

interface Props {
  modelValue: boolean;
  ingredient: Ingredient | null;
}

interface Emits {
  (e: "update:modelValue", value: boolean): void;
  (e: "saved"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const saving = ref(false);
const settingPrimary = ref(false);
const creatingProfile = ref(false);
const deletingMappingId = ref("");
const createProfileVisible = ref(false);
const agentProfileDraftVisible = ref(false);
const agentProfileDraftLoading = ref(false);
const agentProfileDraftRanking = ref(false);
const agentProfileDraftSaving = ref(false);
const agentProfileDraftImporting = ref(false);
const agentProfileDraftRejectingId = ref("");
const agentProfileDraftValidatingId = ref("");
const agentProfileDraftCandidates = ref<IngredientNutritionCandidateListItem[]>(
  [],
);
const agentProfileDraftValidationResults = ref<
  Record<string, CandidateNutritionValidationWithAgentResult>
>({});
const selectedMappingId = ref("");
const draftNutritionProfile = ref<NutritionProfile | null>(null);
const newProfileForm = ref({
  preparationState: "RAW" as NutritionSampleState,
  ediblePortionLabel: "标准可食部",
  processingLabel: "未加工",
  versionNote: "手工新增空白档案，请补充营养数据和字段来源。",
  makePrimary: false,
});

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value),
});

const profileMappings = computed<NutritionFoodMapping[]>(() =>
  [...(props.ingredient?.nutritionFoodMappings || [])].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    return formatProfileTitle(left).localeCompare(
      formatProfileTitle(right),
      "zh-Hans-CN",
    );
  }),
);

const mappedNutritionSourceKeys = computed(() =>
  profileMappings.value.flatMap((mapping) =>
    expandProfileSourceKey(mapping.nutritionFood?.externalId),
  ),
);

const primaryMapping = computed(
  () => profileMappings.value.find((mapping) => mapping.isPrimary) || null,
);

const selectedMapping = computed(
  () =>
    profileMappings.value.find(
      (mapping) => mapping.id === selectedMappingId.value,
    ) || null,
);

const dialogTitle = computed(() =>
  props.ingredient
    ? `营养档案管理器 · ${props.ingredient.name}`
    : "营养档案管理器",
);

const baseUnitLabel = computed(() =>
  props.ingredient
    ? BaseUnitLabels[props.ingredient.baseUnit] || props.ingredient.baseUnit
    : "",
);

const dialogDescription = computed(() => {
  if (!props.ingredient) {
    return "";
  }

  if (props.ingredient.type === IngredientType.SUPPLEMENT) {
    return "补剂的主档案会影响补剂默认浓度、食谱营养目标、定价预览和 DIY 制作单中的默认添加量。";
  }

  return "标准原料可以挂多个具体营养档案；食谱编辑和上传时可选择具体档案，不选则使用主档案。";
});

const profileSummaryText = computed(() => {
  if (!profileMappings.value.length) {
    return "当前使用标准原料上的兼容营养数据。";
  }

  return "食谱编辑和上传时未指定具体档案，则默认使用主档案。";
});

const shouldShowSampleState = computed(
  () =>
    props.ingredient?.type === IngredientType.SUPPLEMENT ||
    !selectedMapping.value,
);

const newProfileStateLabel = computed(
  () =>
    INGREDIENT_NUTRITION_SAMPLE_STATE_OPTIONS.find(
      (option) => option.value === newProfileForm.value.preparationState,
    )?.label || newProfileForm.value.preparationState,
);

const shouldCreateAsPrimary = computed(
  () => !profileMappings.value.length || newProfileForm.value.makePrimary,
);

const canUseAgentProfileDraft = computed(
  () => props.ingredient?.type === IngredientType.FOOD,
);

const agentWorkbenchIngredient =
  computed<NutritionGovernanceIngredientSummary | null>(() => {
    if (!props.ingredient) return null;

    return {
      id: props.ingredient.id,
      name: props.ingredient.name,
      type: props.ingredient.type,
      nutritionProfile: props.ingredient.nutritionProfile,
    };
  });

const agentProfileDraftBusy = computed(
  () =>
    agentProfileDraftLoading.value ||
    agentProfileDraftRanking.value ||
    agentProfileDraftSaving.value ||
    agentProfileDraftImporting.value ||
    Boolean(
      agentProfileDraftRejectingId.value ||
        agentProfileDraftValidatingId.value,
    ),
);

watch(
  () => props.ingredient,
  (ingredient) => {
    const mappings = ingredient?.nutritionFoodMappings || [];
    selectedMappingId.value =
      mappings.find((mapping) => mapping.isPrimary)?.id ||
      mappings[0]?.id ||
      "";
    applySelectedProfile();
  },
  { immediate: true },
);

watch(selectedMappingId, () => {
  applySelectedProfile();
});

function applySelectedProfile() {
  const mapping = selectedMapping.value;
  const profile =
    mapping?.nutritionFood?.nutritionData ||
    props.ingredient?.nutritionProfile ||
    null;

  draftNutritionProfile.value = profile
    ? JSON.parse(JSON.stringify(profile))
    : null;
}

function formatProfileTitle(mapping: NutritionFoodMapping) {
  const nutritionFood = mapping.nutritionFood;
  const parts = [
    nutritionFood?.preparationStateLabel || nutritionFood?.preparationState,
    nutritionFood?.ediblePortionLabel,
    nutritionFood?.processingLabel,
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : nutritionFood?.name || "未命名档案";
}

function formatProfileDisplayName(mapping: NutritionFoodMapping) {
  return (
    mapping.nutritionFood?.displayNameZh ||
    formatProfileTitle(mapping)
  );
}

function formatFoodName(mapping: NutritionFoodMapping) {
  return (
    mapping.nutritionFood?.nameEn ||
    mapping.nutritionFood?.name ||
    mapping.nutritionFoodId
  );
}

function formatExternalId(mapping: NutritionFoodMapping) {
  return mapping.nutritionFood?.externalId || mapping.nutritionFoodId || "-";
}

function formatSourceLabel(mapping: NutritionFoodMapping) {
  return mapping.nutritionFood?.dataSource || "未知";
}

function expandProfileSourceKey(externalId?: string | null): string[] {
  const key = externalId?.trim();
  if (!key) return [];

  const keys = new Set([key]);
  const sourceMatch = key.match(/^([A-Z]+):(.+)$/);
  if (sourceMatch?.[2]) {
    keys.add(sourceMatch[2].trim());
  }
  if (/^\d+$/.test(key)) {
    keys.add(`USDA:${key}`);
  }

  return [...keys].filter(Boolean);
}

function handleSelectMapping(mapping: NutritionFoodMapping) {
  selectedMappingId.value = mapping.id;
}

function getProfileRowClassName({ row }: { row: NutritionFoodMapping }) {
  return row.id === selectedMappingId.value ? "is-selected-profile-row" : "";
}

function resetNewProfileForm() {
  newProfileForm.value = {
    preparationState: "RAW",
    ediblePortionLabel: "标准可食部",
    processingLabel: "未加工",
    versionNote: "手工新增空白档案，请补充营养数据和字段来源。",
    makePrimary: !profileMappings.value.length,
  };
}

function openCreateProfileDialog() {
  resetNewProfileForm();
  createProfileVisible.value = true;
}

async function openAgentProfileDraftDrawer() {
  if (!props.ingredient?.id) return;

  if (!canUseAgentProfileDraft.value) {
    ElMessage.warning("Agent 添加档案暂只支持食材原料。");
    return;
  }

  agentProfileDraftVisible.value = true;
  agentProfileDraftValidationResults.value = {};
  await reloadAgentProfileDraftCandidates();
}

async function reloadAgentProfileDraftCandidates() {
  if (!props.ingredient?.id) return;

  agentProfileDraftLoading.value = true;
  try {
    const candidates = await nutritionGovernanceApi.listCandidates({
      ingredientId: props.ingredient.id,
    });
    agentProfileDraftCandidates.value = candidates.filter(
      (candidate) => candidate.ingredientId === props.ingredient?.id,
    );
  } catch (error: any) {
    ElMessage.error(error?.message || "营养候选加载失败");
  } finally {
    agentProfileDraftLoading.value = false;
  }
}

function buildBlankNutritionProfile(): NutritionProfile {
  const profile = createEmptyIngredientNutritionFormValue();

  profile.meta.sampleState = newProfileForm.value.preparationState;
  profile.meta.sourceType = "MANUAL";
  profile.meta.sourceKind = "MANUAL_ESTIMATE";
  profile.meta.sourceCode = "MANUAL_ESTIMATE";
  profile.meta.sourceProvider = "手工录入";
  profile.meta.sourceTitle = props.ingredient
    ? `${props.ingredient.name} 手工空白营养档案`
    : "手工空白营养档案";
  profile.meta.confidenceLevel = "LOW";
  profile.meta.versionNote =
    newProfileForm.value.versionNote.trim() ||
    "手工新增空白档案，请补充营养数据和字段来源。";

  return profile;
}

function buildBlankNutritionFoodName(createdAt: number) {
  const ingredientName = props.ingredient?.name || "未命名原料";
  const parts = [
    newProfileStateLabel.value,
    newProfileForm.value.ediblePortionLabel.trim(),
    newProfileForm.value.processingLabel.trim(),
  ].filter(Boolean);

  return `${ingredientName} 手工档案 ${parts.join(" / ") || "空白"} ${createdAt}`;
}

async function handleCreateBlankProfile() {
  if (!props.ingredient?.id) return;

  creatingProfile.value = true;
  try {
    const createdAt = Date.now();
    const nutritionFood = await nutritionFoodApi.create({
      name: buildBlankNutritionFoodName(createdAt),
      nameEn: null,
      category:
        props.ingredient.type === IngredientType.SUPPLEMENT
          ? "SUPPLEMENT"
          : "OTHER",
      dataSource: "MANUAL",
      preparationState: newProfileForm.value.preparationState,
      preparationStateLabel: newProfileStateLabel.value,
      ediblePortionLabel:
        newProfileForm.value.ediblePortionLabel.trim() || "标准可食部",
      processingLabel: newProfileForm.value.processingLabel.trim() || "未加工",
      externalId: `MANUAL:${props.ingredient.id}:${createdAt}`,
      nutritionData: buildBlankNutritionProfile(),
      notes: "手工新增空白营养档案",
    });

    await nutritionFoodApi.createMapping(nutritionFood.id, {
      ingredientId: props.ingredient.id,
      isPrimary: shouldCreateAsPrimary.value,
      yieldRate: 1,
      notes: "手工新增空白营养档案",
    });

    createProfileVisible.value = false;
    ElMessage.success("空白营养档案已创建");
    emit("saved");
  } catch (error: any) {
    ElMessage.error(error?.message || "创建营养档案失败");
  } finally {
    creatingProfile.value = false;
  }
}

async function handleAgentProfileDraftRank(payload: {
  ingredientId: string;
  reviewerRequirement: string;
  onlineWhitelistSearch?: boolean;
}) {
  if (!payload.ingredientId || agentProfileDraftRanking.value) return;

  agentProfileDraftRanking.value = true;
  try {
    const rankedCandidates =
      await nutritionGovernanceApi.rankFoodCandidatesWithAgent({
        ingredientId: payload.ingredientId,
        reviewerRequirement: payload.reviewerRequirement || null,
        onlineWhitelistSearch: payload.onlineWhitelistSearch,
      });
    agentProfileDraftCandidates.value = rankedCandidates.filter(
      (candidate) => candidate.ingredientId === payload.ingredientId,
    );
    ElMessage.success("已生成候选草稿并完成 Agent 排序");
  } catch (error: any) {
    ElMessage.error(error?.message || "Agent 生成档案草稿失败");
  } finally {
    agentProfileDraftRanking.value = false;
  }
}

async function handleAgentProfileDraftValidateNutrition(
  candidate: IngredientNutritionCandidateListItem,
) {
  if (agentProfileDraftValidatingId.value) return;

  agentProfileDraftValidatingId.value = candidate.id;
  try {
    const result =
      await nutritionGovernanceApi.validateCandidateNutritionWithAgent(
        candidate.id,
      );
    agentProfileDraftValidationResults.value = {
      ...agentProfileDraftValidationResults.value,
      [candidate.id]: result,
    };
    ElMessage.success("营养数据校验完成");
  } catch (error: any) {
    ElMessage.error(error?.message || "营养数据校验失败");
  } finally {
    agentProfileDraftValidatingId.value = "";
  }
}

async function handleAgentProfileDraftImportUsda(payload: {
  ingredientId: string;
  fdcId: string;
}) {
  const nextFdcId = payload.fdcId.trim();
  if (!payload.ingredientId || !nextFdcId || agentProfileDraftImporting.value) {
    return;
  }

  agentProfileDraftImporting.value = true;
  try {
    await nutritionGovernanceApi.importUsdaSource(nextFdcId, payload.ingredientId);
    await reloadAgentProfileDraftCandidates();
    ElMessage.success("USDA 候选草稿已导入");
  } catch (error: any) {
    ElMessage.error(error?.message || "USDA 候选导入失败");
  } finally {
    agentProfileDraftImporting.value = false;
  }
}

async function handleAgentProfileDraftRematch(ingredientId: string) {
  if (!ingredientId || agentProfileDraftLoading.value) return;

  agentProfileDraftLoading.value = true;
  try {
    await nutritionGovernanceApi.generateFoodCandidates(ingredientId);
    const candidates = await nutritionGovernanceApi.listCandidates({
      ingredientId,
    });
    agentProfileDraftCandidates.value = candidates;
    ElMessage.success("已重新生成候选草稿");
  } catch (error: any) {
    ElMessage.error(error?.message || "候选草稿重新生成失败");
  } finally {
    agentProfileDraftLoading.value = false;
  }
}

async function handleAgentProfileDraftRejectCandidate(
  candidate: IngredientNutritionCandidateListItem,
) {
  if (agentProfileDraftRejectingId.value) return;

  const foodName =
    candidate.sourceRecord?.foodName ||
    candidate.sourceRecord?.sourceTitle ||
    "该候选";

  try {
    await ElMessageBox.confirm(
      `确认拒绝「${foodName}」吗？拒绝后不会写入该标准原料的营养档案。`,
      "拒绝候选草稿",
      {
        type: "warning",
        confirmButtonText: "确认拒绝",
        cancelButtonText: "取消",
      },
    );
  } catch {
    return;
  }

  agentProfileDraftRejectingId.value = candidate.id;
  try {
    await nutritionGovernanceApi.rejectCandidate(candidate.id);
    await reloadAgentProfileDraftCandidates();
    ElMessage.success("候选草稿已拒绝");
  } catch (error: any) {
    ElMessage.error(error?.message || "候选草稿拒绝失败");
  } finally {
    agentProfileDraftRejectingId.value = "";
  }
}

async function handleAgentProfileDraftSave(
  payload: ApplyIngredientCandidateConfigurationPayload,
) {
  if (!props.ingredient?.id || agentProfileDraftSaving.value) return;

  const primaryEntry = payload.entries.find(
    (entry) => entry.mappingRole === "PRIMARY",
  );

  agentProfileDraftSaving.value = true;
  try {
    await ElMessageBox.confirm(
      `确认将 ${payload.entries.length} 个候选草稿写入「${props.ingredient.name}」的营养档案吗？${
        primaryEntry ? "其中一个会成为默认主档案。" : ""
      }`,
      "确认入库营养档案",
      {
        type: "warning",
        confirmButtonText: "确认入库",
        cancelButtonText: "取消",
      },
    );
  } catch {
    agentProfileDraftSaving.value = false;
    return;
  }

  try {
    await nutritionGovernanceApi.applyIngredientCandidateConfiguration(payload);
    ElMessage.success("营养档案已入库");
    agentProfileDraftVisible.value = false;
    agentProfileDraftCandidates.value = [];
    agentProfileDraftValidationResults.value = {};
    emit("saved");
  } catch (error: any) {
    ElMessage.error(error?.message || "营养档案入库失败");
  } finally {
    agentProfileDraftSaving.value = false;
  }
}

async function handleDeleteProfile(mapping: NutritionFoodMapping) {
  if (!props.ingredient?.id) return;

  if (profileMappings.value.length <= 1) {
    ElMessage.warning("不能删除唯一营养档案，请先新增其他档案。");
    return;
  }

  const description = mapping.isPrimary
    ? "当前档案是主档案。删除后，系统会自动将另一个档案设为主档案，并同步更新标准原料的兼容营养数据。"
    : "删除后，该档案将不再挂在当前标准原料下；来源数据库记录仍会保留。";

  try {
    await ElMessageBox.confirm(description, "删除营养档案", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      confirmButtonClass: "el-button--danger",
    });
  } catch {
    return;
  }

  deletingMappingId.value = mapping.id;
  try {
    await nutritionFoodApi.removeMapping(
      mapping.nutritionFoodId,
      props.ingredient.id,
    );
    ElMessage.success("营养档案已删除");
    emit("saved");
  } catch (error: any) {
    ElMessage.error(error?.message || "删除营养档案失败");
  } finally {
    deletingMappingId.value = "";
  }
}

async function handleSetPrimaryProfile(mapping?: NutritionFoodMapping) {
  const targetMapping = mapping || selectedMapping.value;
  if (!props.ingredient?.id || !targetMapping) return;

  selectedMappingId.value = targetMapping.id;

  settingPrimary.value = true;
  try {
    await nutritionFoodApi.updateMapping(
      targetMapping.nutritionFoodId,
      props.ingredient.id,
      { isPrimary: true },
    );
    ElMessage.success("主档案已更新");
    emit("saved");
  } catch (error: any) {
    ElMessage.error(error?.message || "设置主档案失败");
  } finally {
    settingPrimary.value = false;
  }
}

async function handleSave() {
  if (!props.ingredient?.id) {
    return;
  }

  saving.value = true;

  try {
    if (selectedMapping.value) {
      await nutritionFoodApi.update(selectedMapping.value.nutritionFoodId, {
        nutritionData: draftNutritionProfile.value,
      });
      ElMessage.success("营养档案已保存");
      emit("saved");
      return;
    }

    const payload: Partial<IngredientForm> = {
      nutritionProfile: draftNutritionProfile.value,
    };
    await ingredientApi.update(props.ingredient.id, payload);
    ElMessage.success("兼容营养数据已保存");
    emit("saved");
  } catch (error: any) {
    ElMessage.error(error?.message || "保存营养档案失败");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.dialog-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.dialog-desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}

.dialog-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-manager-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.profile-manager-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.profile-manager-header p {
  margin: 6px 0 0;
  color: #606266;
  font-size: 13px;
}

.profile-manager,
.profile-workspace {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-manager-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.profile-manager-stats {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-table-panel,
.profile-current-panel,
.profile-editor-section {
  border: 1px solid #e4e7ed;
  background: #fff;
  border-radius: 6px;
  padding: 14px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-title {
  font-weight: 600;
  color: #303133;
}

.section-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.section-kicker {
  margin-bottom: 4px;
  font-size: 12px;
  color: #909399;
}

.profile-table {
  width: 100%;
}

.table-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  line-height: 1.45;
}

.table-subtitle {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.profile-select-dot {
  width: 18px;
  height: 18px;
  border: 1px solid #c0c4cc;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
  position: relative;
}

.profile-select-dot.active {
  border-color: #409eff;
}

.profile-select-dot.active::after {
  content: "";
  position: absolute;
  top: 4px;
  left: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #409eff;
}

.primary-row-note {
  color: #67c23a;
  font-size: 13px;
  font-weight: 600;
}

.profile-row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.current-profile-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.current-profile-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.current-profile-subtitle {
  margin-top: 4px;
  font-size: 13px;
  color: #606266;
}

.current-profile-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.profile-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0 0;
}

.profile-meta-grid div {
  min-width: 0;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafafa;
  padding: 10px 12px;
}

.profile-meta-grid dt {
  margin: 0 0 4px;
  font-size: 12px;
  color: #909399;
}

.profile-meta-grid dd {
  margin: 0;
  font-size: 13px;
  color: #606266;
  overflow-wrap: anywhere;
}

:deep(.profile-table .is-selected-profile-row > td) {
  background: #f5f9ff;
}

:deep(.profile-table .el-table__row) {
  cursor: pointer;
}

.create-profile-form {
  display: grid;
  gap: 2px;
}

.full-width {
  width: 100%;
}

@media (max-width: 960px) {
  .dialog-header,
  .profile-manager-header,
  .current-profile-header {
    flex-direction: column;
  }

  .profile-manager-actions,
  .profile-manager-stats,
  .current-profile-actions {
    justify-content: flex-start;
  }

  .profile-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
