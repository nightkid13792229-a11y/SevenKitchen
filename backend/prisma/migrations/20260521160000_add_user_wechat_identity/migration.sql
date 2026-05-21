CREATE TABLE "user_wechat_identity" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "app_id" VARCHAR(80) NOT NULL,
    "openid" VARCHAR(100) NOT NULL,
    "unionid" VARCHAR(100),
    "session_key" VARCHAR(255),
    "last_login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_wechat_identity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_wechat_identity_app_id_openid_key" ON "user_wechat_identity"("app_id", "openid");
CREATE INDEX "user_wechat_identity_user_id_idx" ON "user_wechat_identity"("user_id");
CREATE INDEX "user_wechat_identity_unionid_idx" ON "user_wechat_identity"("unionid");

ALTER TABLE "user_wechat_identity"
ADD CONSTRAINT "user_wechat_identity_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
