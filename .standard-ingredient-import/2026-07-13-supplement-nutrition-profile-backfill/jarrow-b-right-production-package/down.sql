-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM nutrition_food_mapping WHERE id IN ('5f801ab8-ec67-4316-82a4-7b1300337d9f');
DELETE FROM nutrition_food WHERE id IN ('33c1552b-1f0c-49b1-9867-5307790ba32b');
