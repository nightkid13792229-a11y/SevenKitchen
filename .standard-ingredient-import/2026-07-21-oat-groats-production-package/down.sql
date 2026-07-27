-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM nutrition_food_mapping WHERE id IN ('16bf0aec-9237-4458-885a-27d25bc390f8');
DELETE FROM nutrition_food WHERE id IN ('6852c161-55b9-4b36-a8d3-283ae19315f2');
DELETE FROM ingredient WHERE id IN ('fcd93c98-3500-4c89-afe3-1bce83afa092');
