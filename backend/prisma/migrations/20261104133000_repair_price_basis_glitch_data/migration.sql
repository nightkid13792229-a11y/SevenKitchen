-- 价格口径事故（2026-11-04）的残留数据清理
--
-- 一、订单 SK20261104-004 的成本快照
--   下单时间 13:29，早于 15:43 的小米单价修复，快照里小米仍是 38.30 元/g：
--   小米一行成本 7,273.54 元，导致 11/5 的采购预估被抬到 7,350.57 元。
--   这里按修正后的算价口径（最近一次采购价 0.01665 元/g）重算该单：
--     小米成本 7,273.54 → 3.16
--     原料成本 7,295.88 → 25.50
--     商品成本 7,315.55 → 45.17
--     商品金额 14,631.10 → 90.34（维持原 2 倍加价率）
--     订单金额 14,668.57 → 127.81（+ 运费 37.47）
--   ⚠️ 实收金额（amount_total = 160.00）是客服改价的结果，不动，改价记录仍在 admin_remark。
--
-- 二、两条小米采购记录的入库数量
--   2026-02-25 / 2026-03-24 两条记录把「克数」又乘了一次采购商品换算比例（2300），
--   入库数量被记成 2,760,000g / 6,900,000g（2.76 吨 / 6.9 吨）；
--   实际是 1,200g / 3,000g（19.80 元 / 49.95 元，约 16.5 元/kg）。

UPDATE "order" o
SET pricing_breakdown_snapshot = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              o.pricing_breakdown_snapshot,
              '{ingredientDetails}',
              (
                SELECT jsonb_agg(
                  CASE
                    WHEN item->>'name' = '小米'
                      THEN jsonb_set(
                             jsonb_set(
                               jsonb_set(item, '{unitCost}', '0.01665'::jsonb),
                               '{cost}', '3.161997292418772'::jsonb
                             ),
                             '{calculation}',
                             to_jsonb(
                               '净需求0.181kg ÷ 出成率1 × 损耗率1.05 = 毛需求0.190kg × 0.0167元/g = 3.16元'::text
                             )
                           )
                    ELSE item
                  END
                  ORDER BY ord
                )
                FROM jsonb_array_elements(
                       o.pricing_breakdown_snapshot->'ingredientDetails'
                     ) WITH ORDINALITY AS t(item, ord)
              )
            ),
            '{costIngredients}', '25.499384374452045'::jsonb
          ),
          '{totalProductCost}', '45.170056596674264'::jsonb
        ),
        '{productPrice}', '90.34011319334851'::jsonb
      ),
      '{totalPrice}', '127.81'::jsonb
    )
WHERE o.order_no = 'SK20261104-004'
  AND o.pricing_breakdown_snapshot @> '{"ingredientDetails":[{"name":"小米","unitCost":38.3}]}'::jsonb;

UPDATE purchase_record
SET
  actual_base_quantity = 1200,
  updated_at = CURRENT_TIMESTAMP
WHERE id = '478e01cc-f29b-4f7d-b6dd-fbf119bc8d8c'
  AND actual_base_quantity = 2760000;

UPDATE purchase_record
SET
  actual_base_quantity = 3000,
  updated_at = CURRENT_TIMESTAMP
WHERE id = '09ed509d-7441-484f-b43c-330b5d65573c'
  AND actual_base_quantity = 6900000;
