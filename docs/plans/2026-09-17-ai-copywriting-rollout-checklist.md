# AI 合规卖点功能 · 生产落地清单

> 生成日期：2026-09-17
> 上游设计：`docs/plans/2026-09-17-ai-recipe-copywriting-design.md`
> 状态：**代码已全部就绪并通过本地验证，等待部署窗口**

---

## 一、当前状态

| 项 | 状态 |
|----|------|
| 后端代码（字段 / AI 服务 / 接口 / 低脂校验 / 筛选接口过滤） | ✅ 本地完成，测试全绿 |
| admin-web（AI 生成按钮 + 预览弹窗 + 卖点字段） | ✅ 构建与测试通过 |
| 合规标签词表 seed 脚本 | ✅ 已写，本地验证通过 |
| **生产部署** | ⏳ 待执行（生产跟 `main` 分支） |
| **生产词表 seed** | ⏳ 待执行（**必须在部署之后**） |
| 后台配置 AI 模型 | ⏳ 待执行 |
| 详情页展示卖点（阶段四） | ⏳ 未开工 |

---

## 二、⚠️ 执行顺序不可颠倒

**必须先部署后端、再 seed 词表。**
原因：`filter-options` 接口在新代码里才会过滤「分组标签」与「0 关联标签」。
若先 seed 词表（38 个新标签，多数暂无食谱关联），线上筛选器会立刻冒出 40 个
"点了没结果"的空筛选项 —— 这一点已在 2026-09-17 实测踩坑并回滚过一次。

---

## 三、执行步骤

### 步骤 0 · 备份（不可跳过）

```bash
# 服务器上执行（或使用既有备份脚本）
ssh -i ~/.ssh/claude_deploy root@1.14.3.2
cd /opt/sevenkitchen/SevenKitchen/backend
python3 - <<'EOF'   # 解析 .env 中的 DATABASE_URL 并 pg_dump（避免密码进入命令行历史）
...
EOF
```

**验收**：备份文件大小合理、含 `PostgreSQL database dump complete` 结尾标记。

> 参考：上次备份 `sevenkitchen_pre_health_tag_fix_20260917_011705.sql`（1108 MB / 88 张表）。

### 步骤 1 · 部署后端

```bash
bash backend/scripts/remote_deploy_v2.sh
```

**验收**：
- `systemctl is-active sevenkitchen-backend` → `active`
- 服务日志无启动错误

### 步骤 2 · 部署后立即验证筛选接口未回退

```bash
curl -s https://api.sevenkitchen.cloud/api/v1/recipes/filter-options \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(len(d['healthTags']), [t['label'] for t in d['healthTags']])"
```

**期望**：3 个标签（`挑食友好 / 易消化 / 低脂`）。

### 步骤 3 · 应用数据库迁移

```bash
ssh -i ~/.ssh/claude_deploy root@1.14.3.2 \
  'cd /opt/sevenkitchen/SevenKitchen/backend && \
   export DATABASE_URL="$(grep -m1 ^DATABASE_URL .env | cut -d= -f2- | tr -d \"\\\"\")" && \
   npx prisma migrate deploy && npx prisma generate'
```

**验收**：`recipe.selling_point` 列存在。

### 步骤 4 · Seed 合规标签词表

```bash
# 4.1 先预演，确认「将新建 5 个分组 + 35 个标签 + 归位 3 个既有标签」
npx ts-node -r tsconfig-paths/register prisma/seed-health-tag-vocabulary.ts

# 4.2 预演无误后落库
npx ts-node -r tsconfig-paths/register prisma/seed-health-tag-vocabulary.ts --apply
```

**验收**：
- 标签总数 43（5 分组 + 38 标签）
- **再次调用 `filter-options`，健康标签仍只返回 3 个** ← 关键回归点
  （词表标签关联为 0，应被新逻辑过滤掉）

### 步骤 5 · 后台配置 AI 模型

1. 进入后台「Agent 配置」
2. 找到用途 **食谱文案生成（`RECIPE_COPYWRITING`）**，填写模型与密钥
3. 未配置时：食谱编辑页的「AI 生成卖点与说明」按钮会置灰并提示

### 步骤 6 · 端到端冒烟测试

1. 打开任一食谱编辑页 → 点「AI 生成卖点与说明」
2. 核对：
   - 卖点为**一句话**（≤40 字），说明为客观描述
   - 推荐标签**全部来自词表**（含三文鱼 / 含红薯 / 成犬维持 / 符合 FEDIAF 2025…）
   - 文案中**不出现**疾病名、功效承诺（肾/肝/关节/抗炎/改善/预防…）
3. 点「采纳」→ 表单填入 → **仍需人工点击保存**（不自动发布）
4. 故意构造一个违规提示词场景（或在测试环境改提示词），确认命中禁用词时**报错会指出命中的词**

### 步骤 7 · 低脂门槛回归

1. 找一个湿基脂肪超标的食谱（如「藜麦南瓜生蚝鸡腿牛肉」约 7.45%）
2. 尝试勾选「低脂」并保存 → **应被拦截**，报错包含具体数值与门槛
3. 找一个达标的（如「燕麦鳕鱼猪肉」约 3.23%）→ 应可正常保存

---

## 四、回滚方案

| 场景 | 回滚动作 |
|------|---------|
| 部署后接口异常 | `git revert` 对应提交 → 重新部署 |
| 词表 seed 后筛选器出现空标签 | 执行 `prisma/revert-health-tag-vocabulary.ts --apply`（会删除无关联标签并解除父子关系） |
| 数据异常 | 用步骤 0 的备份恢复 |

> 回滚脚本细节：先删子标签 → 解除保留标签（低脂/易消化/挑食友好）的父子关系 → 再删分组，
> 否则会被 `recipe_health_tag_parent_id_fkey` 外键挡住（已实测）。

---

## 五、上线后待办

1. **存量食谱补卖点**：242 个食谱（92 公开 / 25 草稿 / 125 定制）可逐个用 AI 生成
2. **存量食谱补标签**：词表标签目前关联为 0，可用 AI 推荐 + 人工确认逐步补上
3. **详情页展示卖点**（阶段四）：在食谱详情页标题下方展示 `sellingPoint`
4. **`低脂` 漂移监控**：配方变更后脂肪会变；已有保存/发布拦截，但建议定期巡检

---

## 六、涉及文件

| 文件 | 作用 |
|------|------|
| `backend/prisma/seed-health-tag-vocabulary.ts` | 词表 seed（幂等、默认预演） |
| `backend/prisma/revert-health-tag-vocabulary.ts` | 词表回滚 |
| `backend/prisma/apply-health-tag-compliance.ts` | 上一次的违规标签清理（已执行） |
| `backend/prisma/migrations/20260917000000_add_recipe_selling_point/` | sellingPoint 迁移 |
| `backend/src/application/recipe-designer/recipe-copywriting*.ts` | AI 文案服务与合规校验 |
| `admin-web/src/views/Recipes/RecipeForm.vue` | 后台生成/预览/采纳界面 |
