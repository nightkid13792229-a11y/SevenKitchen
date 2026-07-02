-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM ingredient WHERE id IN ('69cf7ec3-e39c-4367-8994-46db8e6a9946');
