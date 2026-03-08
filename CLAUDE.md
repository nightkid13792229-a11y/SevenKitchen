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
