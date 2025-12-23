# 200品种数据库导入 - 准备完成

## 📦 已创建的文件

| 文件 | 路径 | 说明 |
|------|------|------|
| Seed脚本 | `prisma/seed-dog-breeds-200.ts` | 包含200个品种的完整seed脚本 |
| 执行指南 | `prisma/SEED_EXECUTION_GUIDE.md` | 详细的10步执行流程 |
| 验证脚本 | `prisma/verify-breeds.sql` | SQL验证脚本，导入后使用 |

## 📊 数据概览

### 数据来源
- **主要来源**: AKC (American Kennel Club) - 体重数据
- **分类标准**: AAHA (American Animal Hospital Association) - 体型/年龄标准
- **中文翻译**: 参考CKU常用品种名称

### 品种数量分布

| 体型分类 | 数量 | 体重范围 | 成熟月龄 | 老龄年龄 |
|---------|------|----------|----------|----------|
| **SMALL** (小型) | ~85种 | < 10kg | 10个月 | 11年 |
| **MEDIUM** (中型) | ~60种 | 10-25kg | 12个月 | 10年 |
| **LARGE** (大型) | ~40种 | 25-45kg | 18个月 | 8年 |
| **GIANT** (巨型) | ~15种 | > 45kg | 24个月 | 7年 |

### Top 20 常见品种（按中国常见度排序）

```
1.  拉布拉多 (Labrador Retriever)          - LARGE   - 31.8kg
2.  泰迪 (Toy Poodle)                       - SMALL   - 2.3kg
3.  贵宾犬 (Miniature Poodle)               - SMALL   - 6.8kg
4.  贵宾犬 (Standard Poodle)                - LARGE   - 22.7kg
5.  金毛 (Golden Retriever)                 - LARGE   - 29.5kg
6.  比熊 (Bichon Frise)                     - SMALL   - 5.4kg
7.  哈士奇 (Siberian Husky)                 - MEDIUM  - 22.7kg
8.  德牧 (German Shepherd Dog)              - LARGE   - 34.0kg
9.  边牧 (Border Collie)                    - MEDIUM  - 20.4kg
10. 柯基 (Pembroke Welsh Corgi)             - SMALL   - 11.3kg
11. 萨摩耶 (Samoyed)                        - MEDIUM  - 22.7kg
12. 法国斗牛犬 (French Bulldog)             - SMALL   - 11.3kg
13. 吉娃娃 (Chihuahua)                      - SMALL   - 1.8kg
14. 博美 (Pomeranian)                       - SMALL   - 2.3kg
15. 雪纳瑞 (Miniature Schnauzer)            - SMALL   - 6.8kg
16. 约克夏 (Yorkshire Terrier)              - SMALL   - 3.2kg
17. 马尔济斯 (Maltese)                      - SMALL   - 3.2kg
18. 腊肠犬 (Dachshund)                      - SMALL   - 9.1kg
19. 阿拉斯加 (Alaskan Malamute)             - LARGE   - 38.6kg
20. 杜宾 (Doberman Pinscher)                - LARGE   - 40.8kg
```

## 🔄 导入策略

**采用增量导入策略**（推荐）：
- 现有脚本包含`findUnique`检查，不会重复创建已存在的品种
- 如需完全替换，先手动执行`TRUNCATE`再运行seed脚本

## 📋 执行步骤概览

```bash
# 1. 备份数据库
pg_dump -U postgres sevenkitchen > backup.sql

# 2. 上传seed脚本到服务器
scp seed-dog-breeds-200.ts root@1.14.3.2:/opt/sevenkitchen/SevenKitchen/backend/prisma/

# 3. 执行seed脚本
cd /opt/sevenkitchen/SevenKitchen/backend
npx ts-node prisma/seed-dog-breeds-200.ts

# 4. 验证导入结果
psql -U postgres -d sevenkitchen -f verify-breeds.sql
```

## ✅ 导入后验证清单

- [ ] 数据库中品种总数 = 200
- [ ] 各体型分类数量分布合理
- [ ] AAHA标准合规性100%
- [ ] 无null必填字段
- [ ] 无异常体重值（<1kg或>100kg）
- [ ] 前端品种选择器显示200个选项
- [ ] 选择品种后，体型自动匹配正确
- [ ] 体型覆盖功能正常工作

## 🧪 测试方案

### 测试用例1: 体型自动匹配

| 选择的品种 | 预期自动匹配的体型 |
|-----------|------------------|
| 吉娃娃 | SMALL |
| 柯基 | SMALL |
| 边牧 | MEDIUM |
| 金毛 | LARGE |
| 大丹犬 | GIANT |

### 测试用例2: 体型覆盖功能

1. 选择"拉布拉多" → 系统自动匹配LARGE
2. 手动选择体型覆盖为"SMALL" → 优先级高于品种判断
3. 点击"试算喂食建议" → 使用SMALL的成熟月龄（10个月）

### 测试用例3: RER/DER计算验证

- **测试品种**: 吉娃娃 (2kg, 3个月, 雄性, 未绝育)
- **预期RER**: `70 × (2)^0.75 = 118 kcal/天`
- **预期DER**: `118 × 1.8 (幼犬系数) = 212 kcal/天`

## 🔄 回滚方案

### 方案1: 数据库恢复
```bash
psql -U postgres -d sevenkitchen < backup.sql
```

### 方案2: 手动删除新导入品种
```sql
DELETE FROM "DogBreed" WHERE id > 'last-existing-id';
```

### 方案3: 使用原seed脚本
```bash
npx ts-node prisma/seed-dog-breeds.backup.ts
```

## 📞 执行前确认

请确认以下事项后再执行导入：

1. **执行时间**: 选择低峰时段执行
2. **备份确认**: 已创建数据库备份
3. **测试环境**: 建议先在测试环境验证
4. **回滚准备**: 了解回滚流程
5. **前端验证**: 准备好测试前端品种选择器

## 📚 相关文档

- [AAHA 2023 Life Stage Guidelines](https://www.aaha.org/aaha-guidelines/life-stage)
- [AKC Breed Weight Chart](https://www.akc.org/expert-advice/nutrition/feeding-large-breed-puppies/)
- [FEDIAF 2021 Nutrition Guidelines](https://www.fediaf.org/)

---

## 🎯 下一步行动

**等待您的确认后执行以下操作：**

1. ⏸️ **暂停** - 等待您审核seed脚本内容
2. ✅ **确认** - 确认数据格式、命名、分类标准无误
3. 📦 **执行** - 按照执行指南导入数据库
4. 🧪 **测试** - 验证前端功能是否正常

---

**文档创建时间**: 2025-12-23
**准备状态**: ✅ 就绪，等待执行确认
