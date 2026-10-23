-- 数据库层兜底：同一订单的有效设计槽位不能超过 recipe_quantity。
-- 先锁订单行，再数槽位，避免两个并发创建同时通过。
CREATE OR REPLACE FUNCTION enforce_order_design_capacity()
RETURNS trigger AS $$
DECLARE
  max_quantity integer;
  active_count integer;
BEGIN
  IF NEW.status = 'REMOVED' THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM "custom_recipe_order"
  WHERE id = NEW.order_id
  FOR UPDATE;

  SELECT recipe_quantity INTO max_quantity
  FROM "custom_recipe_order"
  WHERE id = NEW.order_id;

  SELECT count(*) INTO active_count
  FROM "order_recipe_design"
  WHERE order_id = NEW.order_id
    AND status <> 'REMOVED'
    AND id <> NEW.id;

  IF max_quantity IS NOT NULL
     AND max_quantity > 0
     AND active_count >= max_quantity THEN
    RAISE EXCEPTION '订单份数已满（最多 % 份），不能继续添加设计', max_quantity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_design_capacity_guard ON "order_recipe_design";
CREATE TRIGGER order_design_capacity_guard
BEFORE INSERT OR UPDATE OF status, order_id ON "order_recipe_design"
FOR EACH ROW EXECUTE FUNCTION enforce_order_design_capacity();
