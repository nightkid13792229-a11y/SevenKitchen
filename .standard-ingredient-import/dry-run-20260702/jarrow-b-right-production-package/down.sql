-- SevenKitchen standard ingredient package rollback
-- Scope: records listed in the package manifest only

DELETE FROM ingredient WHERE id IN ('814a9199-f944-4c8f-b651-61f6e4eea765');
