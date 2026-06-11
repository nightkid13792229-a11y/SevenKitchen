UPDATE "ingredient"
SET
  "type" = 'SUPPLEMENT'::"IngredientType",
  "updated_at" = CURRENT_TIMESTAMP
WHERE "type" = 'FOOD'::"IngredientType"
  AND (
    ("name" = '洋车前子壳粉' AND "brand" = 'NOW FOODS' AND "product_model" = '340g/瓶')
    OR ("name" = '纤维素粉' AND "brand" = 'Nutricology' AND "product_model" = '250克/罐')
    OR ("name" = '菊粉' AND "brand" = 'NOW FOODS' AND "product_model" = '227 克（8 盎司）/瓶')
  );
