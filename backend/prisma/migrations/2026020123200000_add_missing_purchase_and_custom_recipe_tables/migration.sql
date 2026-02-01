-- Migration: Add Missing Purchase and Custom Recipe Tables
-- Date: 2026-02-01
-- Description: This migration adds tables that were created via prisma db push in development
--              but never had proper migration files created for production deployment.

-- =====================================================
-- Step 1: Create Missing Enums
-- =====================================================

-- Check if types exist before creating (DO block to handle errors)
DO $$ BEGIN
    -- Create PurchaseListStatus if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseListStatus') THEN
        CREATE TYPE "PurchaseListStatus" AS ENUM ('PENDING', 'COMPLETED');
    END IF;

    -- Create TargetGoal if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TargetGoal') THEN
        CREATE TYPE "TargetGoal" AS ENUM ('MAINTAIN', 'GAIN_WEIGHT', 'LOSE_WEIGHT', 'HEALTH_SUPPORT');
    END IF;

    -- Create CustomRecipeStatus if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomRecipeStatus') THEN
        CREATE TYPE "CustomRecipeStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'DELIVERED');
    END IF;

    -- Create CustomAttachmentType if not exists
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomAttachmentType') THEN
        CREATE TYPE "CustomAttachmentType" AS ENUM ('MEDICAL_REPORT', 'LAB_RESULT', 'IMAGE', 'OTHER');
    END IF;
END $$;

-- =====================================================
-- Step 2: Create Tables
-- =====================================================

-- Table: purchase_list
CREATE TABLE "purchase_list" (
    "id" text NOT NULL,
    "target_date" timestamp(3) without time zone NOT NULL,
    "status" "PurchaseListStatus" NOT NULL,
    "total_estimated_cost" numeric(10,2) NOT NULL,
    "item_count" integer NOT NULL,
    "created_by_id" text NOT NULL,
    "source_order_ids" text[],
    "order_date_snapshot" jsonb,
    "reimbursement_id" text,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone NOT NULL,
    "started_at" timestamp(3) without time zone,
    "completed_at" timestamp(3) without time zone
);

-- Table: purchase_item
CREATE TABLE "purchase_item" (
    "id" text NOT NULL,
    "purchase_list_id" text NOT NULL,
    "ingredient_id" text NOT NULL,
    "quantity_needed" double precision NOT NULL,
    "quantity_unit" text NOT NULL,
    "estimated_cost" numeric(10,2) NOT NULL,
    "purchase_channel" character varying(200),
    "product_model" character varying(100),
    "notes" text,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ingredient_name" character varying(200) DEFAULT ''::character varying NOT NULL,
    "display_unit" character varying(20),
    "type" character varying(20)
);

-- Table: purchase_record
CREATE TABLE "purchase_record" (
    "id" text NOT NULL,
    "purchase_list_id" text NOT NULL,
    "purchase_item_id" text NOT NULL,
    "ingredient_id" text NOT NULL,
    "ingredient_name" character varying(200) NOT NULL,
    "purchase_channel" character varying(200) NOT NULL,
    "actual_quantity" integer NOT NULL,
    "actual_cost" numeric(10,2) NOT NULL,
    "product_model" character varying(100),
    "notes" text,
    "purchased_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone NOT NULL
);

-- Table: custom_recipe_order
CREATE TABLE "custom_recipe_order" (
    "id" text NOT NULL,
    "order_id" text NOT NULL,
    "customer_id" text NOT NULL,
    "dog_id" text NOT NULL,
    "target_goal" "TargetGoal" NOT NULL,
    "allergies" text[] DEFAULT ARRAY[]::text[],
    "medical_conditions" text[] DEFAULT ARRAY[]::text[],
    "additional_notes" text,
    "preferred_ingredients" text[] DEFAULT ARRAY[]::text[],
    "disliked_ingredients" text[] DEFAULT ARRAY[]::text[],
    "attachments" jsonb,
    "scheduled_date" date NOT NULL,
    "estimated_delivery_date" date,
    "amount" numeric(10,2) DEFAULT 299 NOT NULL,
    "status" "CustomRecipeStatus" NOT NULL,
    "payment_confirmed_at" timestamp(3) without time zone,
    "in_progress_at" timestamp(3) without time zone,
    "delivered_at" timestamp(3) without time zone,
    "recipe_id" text,
    "health_info_synced_at" timestamp(3) without time zone,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone NOT NULL
);

-- Table: custom_recipe_attachment
CREATE TABLE "custom_recipe_attachment" (
    "id" text NOT NULL,
    "order_id" text NOT NULL,
    "file_name" text NOT NULL,
    "file_url" text NOT NULL,
    "file_size" integer NOT NULL,
    "file_type" "CustomAttachmentType" NOT NULL,
    "uploaded_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Table: custom_recipe_schedule
CREATE TABLE "custom_recipe_schedule" (
    "id" text NOT NULL,
    "date" date NOT NULL,
    "capacity" integer DEFAULT 4 NOT NULL,
    "booked_count" integer DEFAULT 0 NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "is_public_holiday" boolean DEFAULT false NOT NULL,
    "notes" text,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone NOT NULL
);

-- Table: diy_sheet
CREATE TABLE "diy_sheet" (
    "id" text NOT NULL,
    "user_id" text NOT NULL,
    "recipe_id" text NOT NULL,
    "recipe_name" text NOT NULL,
    "dog_id" text NOT NULL,
    "dog_name" text NOT NULL,
    "cycle_days" integer NOT NULL,
    "per_meal_g" double precision NOT NULL,
    "daily_intake_g" double precision NOT NULL,
    "purchase_list" jsonb,
    "production_steps" text,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone NOT NULL
);

-- Table: order_pricing_snapshot
CREATE TABLE "order_pricing_snapshot" (
    "id" text NOT NULL,
    "customer_id" text NOT NULL,
    "request_params" jsonb NOT NULL,
    "pricing_result" jsonb NOT NULL,
    "expires_at" timestamp(3) without time zone NOT NULL,
    "used" boolean DEFAULT false NOT NULL,
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- =====================================================
-- Step 3: Create Primary Keys
-- =====================================================

ALTER TABLE ONLY "purchase_list"
    ADD CONSTRAINT "purchase_list_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "purchase_item"
    ADD CONSTRAINT "purchase_item_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "purchase_record"
    ADD CONSTRAINT "purchase_record_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "custom_recipe_order"
    ADD CONSTRAINT "custom_recipe_order_pkey" PRIMARY KEY ("id"),
    ADD CONSTRAINT "custom_recipe_order_order_id_key" UNIQUE ("order_id");

ALTER TABLE ONLY "custom_recipe_attachment"
    ADD CONSTRAINT "custom_recipe_attachment_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "custom_recipe_schedule"
    ADD CONSTRAINT "custom_recipe_schedule_pkey" PRIMARY KEY ("id"),
    ADD CONSTRAINT "custom_recipe_schedule_date_key" UNIQUE ("date");

ALTER TABLE ONLY "diy_sheet"
    ADD CONSTRAINT "diy_sheet_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "order_pricing_snapshot"
    ADD CONSTRAINT "order_pricing_snapshot_pkey" PRIMARY KEY ("id");

-- =====================================================
-- Step 4: Create Indexes
-- =====================================================

-- purchase_list indexes
CREATE INDEX "purchase_list_target_date_idx" ON "purchase_list" ("target_date");
CREATE INDEX "purchase_list_status_idx" ON "purchase_list" ("status");
CREATE INDEX "purchase_list_created_by_id_idx" ON "purchase_list" ("created_by_id");

-- purchase_item indexes
CREATE INDEX "purchase_item_purchase_list_id_idx" ON "purchase_item" ("purchase_list_id");
CREATE INDEX "purchase_item_ingredient_id_idx" ON "purchase_item" ("ingredient_id");

-- purchase_record indexes
CREATE INDEX "purchase_record_purchase_list_id_idx" ON "purchase_record" ("purchase_list_id");
CREATE INDEX "purchase_record_purchase_item_id_idx" ON "purchase_record" ("purchase_item_id");
CREATE INDEX "purchase_record_ingredient_id_idx" ON "purchase_record" ("ingredient_id");

-- custom_recipe_order indexes
CREATE INDEX "custom_recipe_order_customer_id_idx" ON "custom_recipe_order" ("customer_id");
CREATE INDEX "custom_recipe_order_dog_id_idx" ON "custom_recipe_order" ("dog_id");
CREATE INDEX "custom_recipe_order_status_idx" ON "custom_recipe_order" ("status");
CREATE INDEX "custom_recipe_order_scheduled_date_idx" ON "custom_recipe_order" ("scheduled_date");
CREATE INDEX "custom_recipe_order_recipe_id_idx" ON "custom_recipe_order" ("recipe_id");

-- custom_recipe_attachment indexes
CREATE INDEX "custom_recipe_attachment_order_id_idx" ON "custom_recipe_attachment" ("order_id");

-- custom_recipe_schedule indexes
CREATE INDEX "custom_recipe_schedule_date_idx" ON "custom_recipe_schedule" ("date");

-- diy_sheet indexes
CREATE INDEX "diy_sheet_user_id_idx" ON "diy_sheet" ("user_id");
CREATE INDEX "diy_sheet_user_id_created_at_idx" ON "diy_sheet" ("user_id", "created_at");
CREATE INDEX "diy_sheet_created_at_idx" ON "diy_sheet" ("created_at");

-- order_pricing_snapshot indexes
CREATE INDEX "order_pricing_snapshot_customer_id_expires_at_idx" ON "order_pricing_snapshot" ("customer_id", "expires_at");
CREATE INDEX "order_pricing_snapshot_expires_at_idx" ON "order_pricing_snapshot" ("expires_at");

-- =====================================================
-- Step 5: Create Foreign Keys
-- =====================================================

-- purchase_list foreign keys
ALTER TABLE ONLY "purchase_list"
    ADD CONSTRAINT "purchase_list_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "user"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- purchase_item foreign keys
ALTER TABLE ONLY "purchase_item"
    ADD CONSTRAINT "purchase_item_purchase_list_id_fkey"
    FOREIGN KEY ("purchase_list_id") REFERENCES "purchase_list"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "purchase_item"
    ADD CONSTRAINT "purchase_item_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- purchase_record foreign keys
ALTER TABLE ONLY "purchase_record"
    ADD CONSTRAINT "purchase_record_purchase_list_id_fkey"
    FOREIGN KEY ("purchase_list_id") REFERENCES "purchase_list"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "purchase_record"
    ADD CONSTRAINT "purchase_record_ingredient_id_fkey"
    FOREIGN KEY ("ingredient_id") REFERENCES "ingredient"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;

-- custom_recipe_order foreign keys
ALTER TABLE ONLY "custom_recipe_order"
    ADD CONSTRAINT "custom_recipe_order_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "user"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "custom_recipe_order"
    ADD CONSTRAINT "custom_recipe_order_dog_id_fkey"
    FOREIGN KEY ("dog_id") REFERENCES "dog"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY "custom_recipe_order"
    ADD CONSTRAINT "custom_recipe_order_recipe_id_fkey"
    FOREIGN KEY ("recipe_id") REFERENCES "recipe"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

-- custom_recipe_attachment foreign keys
ALTER TABLE ONLY "custom_recipe_attachment"
    ADD CONSTRAINT "custom_recipe_attachment_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "custom_recipe_order"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

-- diy_sheet foreign keys
ALTER TABLE ONLY "diy_sheet"
    ADD CONSTRAINT "diy_sheet_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

-- =====================================================
-- End of Migration
-- =====================================================
