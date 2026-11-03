# 待上生产的数据库变更清单（12 项）

- 日期：2026-09-21
- 背景：`feature/web-recipe-designer` 这批在途工作带了 12 个数据库变更（补剂商城 / 成品漏斗埋点 / 配方角标 / 订单重做 / 生命阶段留痕）。
- 现状：**本地开发库已全部应用**（`prisma migrate status` → Database schema is up to date，共 137 个 migration）。
- 风险：**生产库尚未执行**。生产是靠部署时手动跑 `prisma migrate deploy`，不是自动的。
- 结论：**全部 12 项都是"只加不删"**（新建表、加字段、加索引、新建枚举类型），没有删表、删字段、改字段类型。执行风险低，但**必须先于或同时于新代码上线**。

---

## 一、不执行会怎样（按功能分组）

### A 组 · 补剂商城（8 项）— 影响最大

| # | Migration | 做了什么 |
|---|---|---|
| 1 | `20260918000000_add_supplement_retail_fields` | `ingredient` 加 5 个字段（物理形态、是否可零售、保质期月数、储存条件、开封后可用天数），新建枚举类型 `IngredientPhysicalForm` |
| 2 | `20260918010000_add_supplement_shop_config` | 新建 `supplement_shop_config`（补剂商城配置） |
| 3 | `20260918020000_add_supplement_order` | 新建 `supplement_order` + `supplement_order_item` |
| 4 | `20260918030000_add_supplement_order_aftersale` | `supplement_order` 加售后字段（类型/原因/时间） |
| 5 | `20260918040000_add_supplement_label_fields` | 分装标签：`supplement_order_item` 加储存条件、配置表加标签品牌名 |
| 6 | `20260918050000_add_supplement_refund_fields` | `supplement_order` 加 8 个退款字段 |
| 7 | `20260918060000_add_desiccant_notice` | 配置表加"标签是否印干燥剂提示"开关 |
| 8 | `20260918070000_add_oil_shelf_life` | `ingredient` 加"是否油基"、配置表加油品保质期月数 |

**不执行的后果**：补剂商城整个功能不可用 —— 小程序补剂下单页、补剂订单页，以及后台补剂商城的四个页面都会因为表/字段不存在直接报错。

### B 组 · 成品漏斗埋点（1 项）

| # | Migration | 做了什么 |
|---|---|---|
| 9 | `20260918080000_add_product_funnel_event` | 新建 `product_funnel_event` |

**不执行的后果**：漏斗埋点全部写不进去（服务端会吞掉异常只打日志，所以**不会报错、但数据永远是空的**）。
⚠️ **本次「狗狗档案引导逻辑」改造也依赖这张表** —— 我新加的「建档」漏斗事件（开始建档 / 建档完成 / 中途放弃）就是写到这里。这张表不上，这次改造的度量部分等于白做。

### C 组 · 配方封面角标（1 项）

| # | Migration | 做了什么 |
|---|---|---|
| 10 | `20260918090000_add_recipe_series_cover_badge` | 新建 `recipe_series_cover_badge` |

**不执行的后果**：食谱封面角标功能失效。

### D 组 · 订单重做（1 项）

| # | Migration | 做了什么 |
|---|---|---|
| 11 | `20260918100000_add_order_remake_link` | `order` 加 `remake_from_order_id`（记录"这一单重做自哪一单"） |

**不执行的后果**：订单重做关联写入失败。

### E 组 · 生命阶段留痕（1 项）

| # | Migration | 做了什么 |
|---|---|---|
| 12 | `20260918110000_add_life_stage_acknowledgement` | 新建 `life_stage_acknowledgement` |

**不执行的后果**：用户在食谱详情页确认"生命阶段不匹配但继续"时写入失败。

---

## 二、风险评级

| 维度 | 结论 |
|---|---|
| 是否有删除操作 | **无**。没有 `DROP TABLE` / `DROP COLUMN` / 改字段类型 |
| 数据丢失风险 | **无**。只新增，不改动既有数据 |
| 锁表风险 | 低。`ADD COLUMN` 带默认值的表（`supplement_shop_config`、`ingredient`）体量都很小 |
| 可重跑 | 是。`prisma migrate deploy` 只应用未执行过的，幂等 |
| 执行顺序 | 由目录名前缀保证，不需要人工排序 |

---

## 三、执行步骤（建议由负责上线的人在服务器上执行）

1. **先备份生产数据库**（这一步不能省）。
2. 在服务器后端目录执行：
   ```
   npx prisma migrate deploy
   ```
3. 确认结果：
   ```
   npx prisma migrate status
   ```
   应显示 `Database schema is up to date!`。
4. 抽查 5 张新表是否创建成功：
   `supplement_shop_config`、`supplement_order`、`supplement_order_item`、`product_funnel_event`、`recipe_series_cover_badge`、`life_stage_acknowledgement`
5. **再部署新代码**（先库后码，或同批进行）。

---

## 四、如果必须回滚

因为全部是"只加"，回滚需要手写反向 SQL（删表 / 删列），**有误删数据风险**。

更安全的做法：**只回滚代码，保留新增的表和字段**。空的表和没人读的字段不会影响旧代码运行。

---

## 五、附：本地已应用的证据

```
$ cd backend && npx prisma migrate status
137 migrations found in prisma/migrations
Database schema is up to date!
```
