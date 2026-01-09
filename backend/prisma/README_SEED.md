# Dog Breed Seed Script

## 运行 Seed 脚本

在运行 seed 脚本之前，确保：
1. 数据库已创建并运行
2. Prisma migrations 已执行
3. `DATABASE_URL` 环境变量已设置

### 运行方式

```bash
# 方式1: 使用 ts-node 直接运行
cd backend
npx ts-node -r tsconfig-paths/register prisma/seed-dog-breeds.ts

# 方式2: 使用 tsx (如果已安装)
npx tsx prisma/seed-dog-breeds.ts
```

### Seed 数据

脚本会创建以下10种常见犬种：
- 拉布拉多 (LARGE)
- 泰迪 (SMALL)
- 金毛 (LARGE)
- 比熊 (SMALL)
- 哈士奇 (MEDIUM)
- 德牧 (LARGE)
- 边牧 (MEDIUM)
- 柯基 (SMALL)
- 萨摩耶 (MEDIUM)
- 大丹犬 (GIANT)

脚本是幂等的：如果品种已存在，会跳过创建。

