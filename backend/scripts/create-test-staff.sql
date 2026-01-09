-- 创建测试员工账号
-- 使用方法: psql postgresql://postgres:postgres@localhost:5432/sevenkitchen -f create-test-staff.sql

-- 厨房员工
INSERT INTO "user" (id, phone, nickname, role, status, "avatarUrl")
VALUES (
  'staff-kitchen-001',
  '13800001001',
  '厨房员工-张三',
  'STAFF',
  'ACTIVE',
  'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTL1'
)
ON CONFLICT (phone) DO NOTHING;

-- 采购员工
INSERT INTO "user" (id, phone, nickname, role, status, "avatarUrl")
VALUES (
  'staff-purchasing-001',
  '13800001002',
  '采购员工-李四',
  'STAFF',
  'ACTIVE',
  'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTL2'
)
ON CONFLICT (phone) DO NOTHING;

-- 配送员工
INSERT INTO "user" (id, phone, nickname, role, status, "avatarUrl")
VALUES (
  'staff-shipping-001',
  '13800001003',
  '配送员工-王五',
  'STAFF',
  'ACTIVE',
  'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTL3'
)
ON CONFLICT (phone) DO NOTHING;

-- 测试管理员
INSERT INTO "user" (id, phone, nickname, role, status, "avatarUrl")
VALUES (
  'admin-001',
  '13900000000',
  '系统管理员',
  'ADMIN',
  'ACTIVE',
  'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTL4'
)
ON CONFLICT (phone) DO NOTHING;

-- 查看创建的员工
SELECT id, phone, nickname, role, status, created_at
FROM "user"
WHERE role IN ('STAFF', 'ADMIN')
ORDER BY created_at DESC;
