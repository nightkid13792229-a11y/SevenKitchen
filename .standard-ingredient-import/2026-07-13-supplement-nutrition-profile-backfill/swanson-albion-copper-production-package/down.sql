-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM nutrition_food_mapping WHERE id IN ('d4dc01bf-d96f-4958-91d6-be82ca7f7983');
DELETE FROM nutrition_food WHERE id IN ('dcd4ec98-e1e0-47ad-a67b-381118e12d65');
