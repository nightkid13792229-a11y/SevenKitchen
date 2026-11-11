# 知识库 v3 · 食谱 Agent 接线说明

**日期**：2026-11-12
**范围**：只改 Web 食谱设计 Agent 的调用侧；知识库 v3 的 4 实体 / 3 工具 / 数据不变。
**代码**：`backend/src/application/recipe-designer/agent/` + `deepseek-tools-chat.ts`

---

## 一、接了什么

| 能力 | 实现 |
|---|---|
| 3 个知识库工具 | `AGENT_TOOLS` 追加 `kb_catalog` / `kb_find` / `kb_read`（共 10 个工具） |
| 调用 | `executeTool` 走 `executeKnowledgeTool(gateway, name, args)`；成功 `ok(data, summary)`，失败 `fail(code,message)` |
| 页图 | `kb_read` 的 `imageBase64` 从工具结果里摘掉，单独拼成一条 `user` 消息，用 `image_url` data URL 送进模型；每张图前带“第 pN 页 文档id/pN”标签 |
| 模型不支持图片 | 调用失败且消息里有图片时，去掉 image parts、保留文本并加“（页图已省略，按页文本回答）”，重试一次；再失败才报错 |
| 引用 | 提示词要求最终回答写 `[文档id/页码]`，如 `[sacn5-chapters-SACN5-37/p22]`；数值必须来自读到的页 |
| 0 命中 | 提示词明确：`kb_find` 0 命中只表示这组词没命中，不等于知识库没有；查不到就说查不到 |

---

## 二、为什么这样接

- **工具层只做“包一层”**：知识库服务已经做了参数校验/错误归一；Agent 只负责把结果包成 `ToolOutcome`，不重新判断相关性。
- **页图走 user 消息，不走 tool 消息**：Chat Completions 的 tool 消息 content 是字符串；把 data URL 放 JSON 里模型看不见。单独一条 user 消息是标准的多模态传法。
- **base64 不落库**：`recordTool` 存的是去掉 base64 的 outcome，只保留 `imagePath`/`imageMime`；避免每次工具调用把 0.5–1 MB 图片写进会话表。
- **回退是安全阀**：当前生产模型是 `deepseek-v4-pro`，是否接受 `image_url` 未在生产实测；不接受时自动退回纯文本，不会让整次会话失败。
- **不新增结论/摘要/分级**：summary 只有“文档 N 份 / 命中 N 页 p.. / 读到 N 页 p..”，不总结临床内容。

---

## 三、验证

- `npm test -- tests/application/recipe-designer tests/application/knowledge-v3`：42 suites / 650 tests 全绿；
- `npx tsc --noEmit`：332 个既有错误（与当前基线一致），接线文件 0 错误；
- `PORT=3015 npm run start:check`：Nest 启动/DI/健康检查通过（先跑了一次 `npx prisma generate`，否则 Prisma Client 会缺新模型）；
- 生产未跑真实 Agent 会话：需要一条真实草稿 + 模型调用，建议上线后在后台设计器里试一次“CKD 2 期磷目标”，确认页图是否被模型接受；若被拒，日志会有一条“去掉页图后重试”，回答仍按页文本给出。

---

## 四、已知限制

1. **引用只是文本**：后台消息里显示 `[文档id/p22]`，还没有点击跳原页/引用面板；这是 Web 展示层的后续工作。
2. **图片数量**：`kb_read` 最多 5 张/次，全部转 data URL；如果模型/网关限制请求体，回退逻辑会去掉图片。
3. **历史不回灌**：Agent 历史仍只存用户/助手文本；跨轮引用需要模型重新 `kb_read`，不保留上一轮图片。
4. **没有 Agent A/B**：本次只接工具，没有测“调用次数下降”；结构基准仍是 `kb:v3:bench` 的 reference caller，不是模型调用次数。

---

## 五、回滚

- 代码回滚：去掉 `AGENT_TOOLS` 里的 3 个 KB 定义、`ToolExecutionContext.knowledge`、`RecipeAgentService` 的 gateway 注入与图片桥即可；知识库服务和数据不受影响。
- 图片回退：不需要改代码；模型拒绝时会自动 strip。
- 生产数据：本次不改 `kb_*` 表，回滚只回代码。
