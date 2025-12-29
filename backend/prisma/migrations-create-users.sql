-- 为所有现有的 customer_id 和 owner_id 创建 User 记录
-- 这个脚本会在第一次启动时由后端自动执行

-- Step 1: 为所有 order 中的 customer_id 创建 User 记录
INSERT INTO "user" (id, phone, wechat_openid, nickname, role, created_at, updated_at)
SELECT DISTINCT
    o.customer_id,
    NULL::varchar(20),
    NULL::varchar(100),
    '用户' as nickname,
    'CUSTOMER'::"UserRole" as role,
    NOW() as created_at,
    NOW() as updated_at
FROM "order" o
WHERE NOT EXISTS (
    SELECT 1 FROM "user" u WHERE u.id = o.customer_id
)
ON CONFLICT (id) DO NOTHING;

-- Step 2: 为所有 dog 中的 owner_id 创建 User 记录（如果还不存在）
INSERT INTO "user" (id, phone, wechat_openid, nickname, role, created_at, updated_at)
SELECT DISTINCT
    d.owner_id,
    NULL::varchar(20),
    NULL::varchar(100),
    '用户' as nickname,
    'CUSTOMER'::"UserRole" as role,
    NOW() as created_at,
    NOW() as updated_at
FROM dog d
WHERE NOT EXISTS (
    SELECT 1 FROM "user" u WHERE u.id = d.owner_id
)
ON CONFLICT (id) DO NOTHING;

-- Step 3: 为所有 address 中的 user_id 创建 User 记录（如果还不存在）
INSERT INTO "user" (id, phone, wechat_openid, nickname, role, created_at, updated_at)
SELECT DISTINCT
    a.user_id,
    NULL::varchar(20),
    NULL::varchar(100),
    '用户' as nickname,
    'CUSTOMER'::"UserRole" as role,
    NOW() as created_at,
    NOW() as updated_at
FROM address a
WHERE NOT EXISTS (
    SELECT 1 FROM "user" u WHERE u.id = a.user_id
)
ON CONFLICT (id) DO NOTHING;
