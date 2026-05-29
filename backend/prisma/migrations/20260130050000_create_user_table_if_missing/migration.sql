DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
        CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserStatus') THEN
        CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BANNED');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "user" (
    "id" TEXT NOT NULL,
    "phone" VARCHAR(20),
    "wechat_openid" VARCHAR(100),
    "nickname" VARCHAR(100),
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "avatar_url" TEXT,
    "last_login_at" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "wechat_unionid" VARCHAR(100),
    "password" VARCHAR(255),
    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_phone_key" ON "user" ("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "user_wechat_openid_key" ON "user" ("wechat_openid");
CREATE UNIQUE INDEX IF NOT EXISTS "user_wechat_unionid_key" ON "user" ("wechat_unionid");
CREATE INDEX IF NOT EXISTS "user_wechat_openid_idx" ON "user" ("wechat_openid");
CREATE INDEX IF NOT EXISTS "user_phone_idx" ON "user" ("phone");
