-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM nutrition_food_mapping WHERE id IN ('832de39e-2661-4898-b4a1-857669cd0b90');
DELETE FROM nutrition_food WHERE id IN ('98f0055d-8048-4284-8d4a-0f01478a9bdd');
DELETE FROM ingredient WHERE id IN ('65c2b45f-bae2-47e8-a7e1-7aa3c347dd4b');
