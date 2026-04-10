# SevenKitchen 项目规则

## 角色识别

- `backend/` → Backend开发者
- `miniapp/` → MiniApp开发者
- `admin-web/` → AdminWeb开发者

**只修改自己负责的模块，不要跨模块修改代码。**

## 核心规则

1. **修改前先读文档**：必读 `docs/DATABASE_NAMING_CONVENTIONS.md`
2. **禁止直接操作数据库**：必须通过Prisma migration
3. **禁止"想象"字段名**：先查文档确认
4. **测试通过后再提交**

## MiniApp 协作硬规则

1. **凡是修改 `miniapp/` 下的代码，在结束前至少执行一种可验证流程**：
   - 联调预览：`cd miniapp && npm run preview`
   - 发布构建：`cd miniapp && npm run build:mp-weixin`
2. **执行成功后，必须明确告知用户微信开发者工具应打开的目录**：
   - `npm run preview` → `miniapp/dist/dev/mp-weixin`
   - `npm run build:mp-weixin` → `miniapp/dist/build/mp-weixin`
3. **如果预览或构建失败，必须明确告知失败原因**，不能让用户自己猜测是不是没编译、目录不对或输出没更新
4. **凡是小程序本地开发默认 API 地址，都以** `http://127.0.0.1:3000/api/v1` **为准**，除非用户明确要求切换

## 本地后端协作硬规则

1. **启动前先检查本地后端是否已可用**：`cd backend && npm run start:check`
2. **需要启动本地后端时，统一使用** `cd backend && npm run start:dev`
3. **如果本地后端已经健康运行，必须优先复用，而不是再启动第二个**
4. **如果当前线程需要切换到另一份 worktree 的后端代码，必须先停止旧进程，再在目标 worktree 重新执行** `cd backend && npm run start:dev`

## 必读文档

| 优先级 | 文档 | 用途 |
|--------|------|------|
| 最高 | docs/DATABASE_NAMING_CONVENTIONS.md | 字段命名规范 |
| 高 | docs/07_Core_Architecture.md | 核心架构 |
| 高 | docs/05_API_Specs.md | API接口定义 |

## 沟通规范

用户是非技术人员，回答时：
- 用业务语言描述，不用技术术语
- 用步骤列表说明流程
- 不展示代码（除非用户要求）
