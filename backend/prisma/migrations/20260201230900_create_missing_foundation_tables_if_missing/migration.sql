DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GrowthCurveType') THEN
        CREATE TYPE "GrowthCurveType" AS ENUM ('STANDARD', 'SLOW', 'VERY_SLOW');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IngredientType') THEN
        CREATE TYPE "IngredientType" AS ENUM ('FOOD', 'SUPPLEMENT', 'PACKAGING');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BaseUnit') THEN
        CREATE TYPE "BaseUnit" AS ENUM ('G', 'ML', 'PCS');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VaccineStatus') THEN
        CREATE TYPE "VaccineStatus" AS ENUM ('COMPLETED', 'SCHEDULED', 'OVERDUE');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MedicalStatus') THEN
        CREATE TYPE "MedicalStatus" AS ENUM ('TREATING', 'RECOVERED', 'CHRONIC');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "dog_breed" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size_category" "DogSizeCategory" NOT NULL,
    "growth_curve_type" "GrowthCurveType" NOT NULL,
    "adult_age_months" INTEGER NOT NULL,
    "senior_age_years" INTEGER NOT NULL,
    "average_adult_weight_kg" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "dog_breed_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "dog_breed_size_category_idx" ON "dog_breed" ("size_category");

CREATE TABLE IF NOT EXISTS "ingredient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "IngredientType" NOT NULL,
    "brand" VARCHAR(100),
    "product_model" VARCHAR(100),
    "purchase_channel" VARCHAR(200),
    "notes" TEXT,
    "base_unit" "BaseUnit" NOT NULL,
    "unit_display_label" VARCHAR(50),
    "purchase_unit" VARCHAR(50) NOT NULL,
    "purchase_to_base_ratio" DOUBLE PRECISION NOT NULL,
    "current_price_per_purchase_unit" DECIMAL(10,2) NOT NULL,
    "weight_g" DOUBLE PRECISION,
    "max_capacity_g" DOUBLE PRECISION,
    "properties" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ingredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_name_brand_product_model_key"
    ON "ingredient" ("name", "brand", "product_model");
CREATE INDEX IF NOT EXISTS "ingredient_type_idx" ON "ingredient" ("type");
CREATE INDEX IF NOT EXISTS "ingredient_name_idx" ON "ingredient" ("name");

CREATE TABLE IF NOT EXISTS "ingredient_tag" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ingredient_tag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ingredient_tag_parent_id_idx" ON "ingredient_tag" ("parent_id");
CREATE INDEX IF NOT EXISTS "ingredient_tag_sort_idx" ON "ingredient_tag" ("sort");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ingredient_tag_parent_id_fkey'
    ) THEN
        ALTER TABLE "ingredient_tag"
            ADD CONSTRAINT "ingredient_tag_parent_id_fkey"
            FOREIGN KEY ("parent_id") REFERENCES "ingredient_tag"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ingredient_tag_assignment" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingredient_tag_assignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_tag_assignment_ingredient_id_tag_id_key"
    ON "ingredient_tag_assignment" ("ingredient_id", "tag_id");
CREATE INDEX IF NOT EXISTS "ingredient_tag_assignment_ingredient_id_idx"
    ON "ingredient_tag_assignment" ("ingredient_id");
CREATE INDEX IF NOT EXISTS "ingredient_tag_assignment_tag_id_idx"
    ON "ingredient_tag_assignment" ("tag_id");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ingredient_tag_assignment_ingredient_id_fkey'
    ) THEN
        ALTER TABLE "ingredient_tag_assignment"
            ADD CONSTRAINT "ingredient_tag_assignment_ingredient_id_fkey"
            FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ingredient_tag_assignment_tag_id_fkey'
    ) THEN
        ALTER TABLE "ingredient_tag_assignment"
            ADD CONSTRAINT "ingredient_tag_assignment_tag_id_fkey"
            FOREIGN KEY ("tag_id") REFERENCES "ingredient_tag"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "weight_record" (
    "id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "record_date" DATE NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "synced_to_profile" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "weight_record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "weight_record_dog_id_record_date_idx"
    ON "weight_record" ("dog_id", "record_date");

CREATE TABLE IF NOT EXISTS "vaccine_record" (
    "id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "vaccine_name" TEXT NOT NULL,
    "vaccination_date" DATE NOT NULL,
    "next_due_date" DATE,
    "notes" TEXT,
    "status" "VaccineStatus" NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vaccine_record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vaccine_record_dog_id_idx" ON "vaccine_record" ("dog_id");
CREATE INDEX IF NOT EXISTS "vaccine_record_dog_id_vaccination_date_idx"
    ON "vaccine_record" ("dog_id", "vaccination_date");
CREATE INDEX IF NOT EXISTS "vaccine_record_next_due_date_idx" ON "vaccine_record" ("next_due_date");

CREATE TABLE IF NOT EXISTS "checkup_record" (
    "id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "checkup_type" TEXT NOT NULL,
    "checkup_date" DATE NOT NULL,
    "findings" TEXT,
    "recommendations" TEXT,
    "veterinarian" TEXT,
    "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "checkup_record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "checkup_record_dog_id_idx" ON "checkup_record" ("dog_id");
CREATE INDEX IF NOT EXISTS "checkup_record_dog_id_checkup_date_idx"
    ON "checkup_record" ("dog_id", "checkup_date");

CREATE TABLE IF NOT EXISTS "medical_record" (
    "id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "visit_date" DATE NOT NULL,
    "chief_complaint" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "treatment" TEXT,
    "medications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "MedicalStatus" NOT NULL DEFAULT 'TREATING',
    "follow_up_date" DATE,
    "veterinarian" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "medical_record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "medical_record_dog_id_idx" ON "medical_record" ("dog_id");
CREATE INDEX IF NOT EXISTS "medical_record_dog_id_visit_date_idx"
    ON "medical_record" ("dog_id", "visit_date");
CREATE INDEX IF NOT EXISTS "medical_record_status_idx" ON "medical_record" ("status");

CREATE TABLE IF NOT EXISTS "allergy_record" (
    "id" TEXT NOT NULL,
    "dog_id" TEXT NOT NULL,
    "allergen" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "allergy_record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "allergy_record_dog_id_idx" ON "allergy_record" ("dog_id");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weight_record_dog_id_fkey') THEN
        ALTER TABLE "weight_record"
            ADD CONSTRAINT "weight_record_dog_id_fkey"
            FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vaccine_record_dog_id_fkey') THEN
        ALTER TABLE "vaccine_record"
            ADD CONSTRAINT "vaccine_record_dog_id_fkey"
            FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkup_record_dog_id_fkey') THEN
        ALTER TABLE "checkup_record"
            ADD CONSTRAINT "checkup_record_dog_id_fkey"
            FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medical_record_dog_id_fkey') THEN
        ALTER TABLE "medical_record"
            ADD CONSTRAINT "medical_record_dog_id_fkey"
            FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allergy_record_dog_id_fkey') THEN
        ALTER TABLE "allergy_record"
            ADD CONSTRAINT "allergy_record_dog_id_fkey"
            FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "global_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "labor_hourly_rate" DECIMAL(65,30) NOT NULL DEFAULT 30,
    "min_order_weight_g" INTEGER NOT NULL DEFAULT 1000,
    "default_batch_capacity_g" DECIMAL(65,30) NOT NULL DEFAULT 5000,
    "target_margin" DECIMAL(65,30) NOT NULL DEFAULT 0.4,
    "overhead_cost_per_kg" DECIMAL(65,30) NOT NULL DEFAULT 2,
    "target_batch_utilization" DECIMAL(65,30) NOT NULL DEFAULT 0.8,
    "supplement_loss_rate" DECIMAL(65,30) NOT NULL DEFAULT 1.05,
    "default_product_label_id" TEXT,
    "default_ice_pack_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "default_shipping_template_id" TEXT,
    "package_example_image_url" TEXT,
    "shipping_company_logo_url" TEXT,
    "payment_timeout_minutes" INTEGER NOT NULL DEFAULT 30,
    "equipment_recommendations" JSONB,
    "min_pot_weight_g" INTEGER NOT NULL DEFAULT 2000,
    "ingredient_price_auto_approve_threshold" DECIMAL(5,4) DEFAULT 0.08,
    "home_header_bg_image_url" TEXT,
    "diy_sheet_header_bg_image_url" TEXT,
    CONSTRAINT "global_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "shipping_template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_weight_kg" DECIMAL(65,30) NOT NULL,
    "base_fee" DECIMAL(65,30) NOT NULL,
    "step_weight_kg" DECIMAL(65,30) NOT NULL,
    "step_fee" DECIMAL(65,30) NOT NULL,
    "vas_fee_per_order" DECIMAL(65,30) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shipping_template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "photo_share_token" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    CONSTRAINT "photo_share_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "photo_share_token_token_key" ON "photo_share_token" ("token");
CREATE INDEX IF NOT EXISTS "photo_share_token_token_idx" ON "photo_share_token" ("token");
CREATE INDEX IF NOT EXISTS "photo_share_token_order_id_idx" ON "photo_share_token" ("order_id");
CREATE INDEX IF NOT EXISTS "photo_share_token_expires_at_idx" ON "photo_share_token" ("expires_at");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'photo_share_token_order_id_fkey') THEN
        ALTER TABLE "photo_share_token"
            ADD CONSTRAINT "photo_share_token_order_id_fkey"
            FOREIGN KEY ("order_id") REFERENCES "order"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "design_source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "design_source_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "design_source_is_active_idx" ON "design_source" ("is_active");

CREATE TABLE IF NOT EXISTS "recipe_health_tag" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "parent_id" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recipe_health_tag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recipe_health_tag_parent_id_idx" ON "recipe_health_tag" ("parent_id");
CREATE INDEX IF NOT EXISTS "recipe_health_tag_sort_idx" ON "recipe_health_tag" ("sort");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recipe_health_tag_parent_id_fkey'
    ) THEN
        ALTER TABLE "recipe_health_tag"
            ADD CONSTRAINT "recipe_health_tag_parent_id_fkey"
            FOREIGN KEY ("parent_id") REFERENCES "recipe_health_tag"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "recipe_health_tag_assignment" (
    "id" TEXT NOT NULL,
    "recipe_id" TEXT NOT NULL,
    "health_tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recipe_health_tag_assignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "recipe_health_tag_assignment_recipe_id_health_tag_id_key"
    ON "recipe_health_tag_assignment" ("recipe_id", "health_tag_id");
CREATE INDEX IF NOT EXISTS "recipe_health_tag_assignment_recipe_id_idx"
    ON "recipe_health_tag_assignment" ("recipe_id");
CREATE INDEX IF NOT EXISTS "recipe_health_tag_assignment_health_tag_id_idx"
    ON "recipe_health_tag_assignment" ("health_tag_id");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recipe_health_tag_assignment_recipe_id_fkey'
    ) THEN
        ALTER TABLE "recipe_health_tag_assignment"
            ADD CONSTRAINT "recipe_health_tag_assignment_recipe_id_fkey"
            FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recipe_health_tag_assignment_health_tag_id_fkey'
    ) THEN
        ALTER TABLE "recipe_health_tag_assignment"
            ADD CONSTRAINT "recipe_health_tag_assignment_health_tag_id_fkey"
            FOREIGN KEY ("health_tag_id") REFERENCES "recipe_health_tag"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "preparation_method" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "preparation_method_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "preparation_method_name_key" ON "preparation_method" ("name");
CREATE INDEX IF NOT EXISTS "preparation_method_sort_idx" ON "preparation_method" ("sort");
