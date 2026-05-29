ALTER TABLE "customer_service_config"
ADD COLUMN IF NOT EXISTS "product_card_title_template" VARCHAR(120) NOT NULL DEFAULT '咨询商品 {productName}',
ADD COLUMN IF NOT EXISTS "product_card_path_template" VARCHAR(300) NOT NULL DEFAULT '/pages/recipe-detail/index?recipeId={productId}',
ADD COLUMN IF NOT EXISTS "default_card_title_template" VARCHAR(120) NOT NULL DEFAULT 'SevenKitchen 客服咨询',
ADD COLUMN IF NOT EXISTS "default_card_path_template" VARCHAR(300) NOT NULL DEFAULT '/pages/home/index',
ADD COLUMN IF NOT EXISTS "floating_button_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "floating_button_text" VARCHAR(20) NOT NULL DEFAULT '客服',
ADD COLUMN IF NOT EXISTS "floating_button_icon_url" VARCHAR(500),
ADD COLUMN IF NOT EXISTS "floating_button_size" INTEGER NOT NULL DEFAULT 56,
ADD COLUMN IF NOT EXISTS "floating_button_position" VARCHAR(30) NOT NULL DEFAULT 'RIGHT_BOTTOM',
ADD COLUMN IF NOT EXISTS "floating_button_bottom" INTEGER NOT NULL DEFAULT 128,
ADD COLUMN IF NOT EXISTS "floating_button_right" INTEGER NOT NULL DEFAULT 18,
ADD COLUMN IF NOT EXISTS "floating_button_style" VARCHAR(30) NOT NULL DEFAULT 'LIGHT';
