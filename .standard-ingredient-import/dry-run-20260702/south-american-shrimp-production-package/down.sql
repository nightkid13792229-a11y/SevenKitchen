-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM nutrition_food_mapping WHERE id IN ('b8750796-28c7-44eb-a192-cec5437977de');
DELETE FROM nutrition_food WHERE id IN ('3a11ef71-44f1-4b74-8e10-9c28e6e6b259');
DELETE FROM ingredient WHERE id IN ('b60e08c5-73c0-4219-ba91-9afff5c5268f');
