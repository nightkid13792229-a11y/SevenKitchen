-- 补齐制备方法口径词：熟重 / 干重
-- 背景：营养档案状态决定称重口径（熟档案→按熟后重量称、干制品→按干重称），
-- 但受控词表里原本只有「生重」，导致系统生成的默认文案永远写「生重」。

INSERT INTO "preparation_method" ("id", "name", "description", "sort", "created_at", "updated_at")
VALUES (gen_random_uuid(), '熟重', '按煮熟后的重量称量（与熟制营养档案配套）', 0, now(), now())
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "preparation_method" ("id", "name", "description", "sort", "created_at", "updated_at")
VALUES (gen_random_uuid(), '干重', '按干重称量（与干制营养档案配套）', 0, now(), now())
ON CONFLICT ("name") DO NOTHING;
