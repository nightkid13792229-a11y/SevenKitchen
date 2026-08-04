-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM nutrition_food_mapping WHERE id IN ('fdc251ca-c618-4049-8a56-44852d662831');
DELETE FROM nutrition_food WHERE id IN ('f9580744-389a-4c76-9103-93a8d9a77535');
DELETE FROM ingredient WHERE id IN ('1456a2f8-1016-48a1-b276-c51ca9df7d22');
