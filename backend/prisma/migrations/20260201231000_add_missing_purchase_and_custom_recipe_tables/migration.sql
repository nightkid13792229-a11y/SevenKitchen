-- Migration: Add Missing Purchase, Custom Recipe, and Related Tables
-- Date: 2026-02-01
-- Description: This migration adds tables that were created via prisma db push in development
--              but never had proper migration files created for production deployment.

-- =====================================================
-- Step 1: Create Enums
-- =====================================================

CREATE TYPE IF NOT EXISTS "PurchaseListStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TYPE IF NOT EXISTS "AftersaleType" AS ENUM ('REFUND', 'REMAKE', 'COMPLAINT', 'RESOLVED');

CREATE TYPE IF NOT EXISTS "TargetGoal" AS ENUM ('MAINTAIN', 'GAIN_WEIGHT', 'LOSE_WEIGHT', 'HEALTH_SUPPORT');

CREATE TYPE IF NOT EXISTS "CustomRecipeStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'IN_PROGRESS', 'DELIVERED');

CREATE TYPE IF NOT EXISTS "CustomAttachmentType" AS ENUM ('MEDICAL_REPORT', 'LAB_RESULT', 'IMAGE', 'OTHER');

CREATE TYPE IF NOT EXISTS "ReimbursementStatus" AS ENUM ('PENDING_REVIEW', 'REIMBURSED', 'REJECTED', 'REQUIRES_RESUBMIT');

-- =====================================================
-- Step 2: Create Tables
-- =====================================================

-- Table: purchase_list
CREATE TABLE IF NOT EXISTS "purchase_list" (
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
CREATE TABLE IF NOT EXISTS "purchase_item" (
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
CREATE TABLE IF NOT EXISTS "purchase_record" (
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
CREATE TABLE IF NOT EXISTS "custom_recipe_order" (
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
CREATE TABLE IF NOT EXISTS "custom_recipe_attachment" (
    "id" text NOT NULL,
    "order_id" text NOT NULL,
    "file_name" text NOT NULL,
    "file_url" text NOT NULL,
    "file_size" integer NOT NULL,
    "file_type" "CustomAttachmentType" NOT NULL,
    "uploaded_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Table: custom_recipe_schedule
CREATE TABLE IF NOT EXISTS "custom_recipe_schedule" (
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

-- Table: reimbursement
CREATE TABLE IF NOT EXISTS "reimbursement" (
    "id" text NOT NULL,
    "claim_number" text NOT NULL,
    "status" "ReimbursementStatus" NOT NULL,
    "total_actual_cost" numeric(10,2) NOT NULL,
    "total_estimated_cost" numeric(10,2) NOT NULL,
    "receipt_urls" text[] DEFAULT ARRAY[]::text[],
    "submitted_by_id" text NOT NULL,
    "submitted_at" timestamp(3) without time zone NOT NULL,
    "reviewed_by_id" text,
    "reviewed_at" timestamp(3) without time zone,
    "review_comment" text,
    "platform_shipping_fee" numeric(10,2),
    "platform_packaging_fee" numeric(10,2),
    "custom_fees" jsonb,
    "payment_proof_urls" text[] DEFAULT ARRAY[]::text[],
    "payment_proof_keys" text[] DEFAULT ARRAY[]::text[],
    "created_at" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) without time zone NOT NULL
);

-- Table: diy_sheet
CREATE TABLE IF NOT EXISTS "diy_sheet" (
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
CREATE TABLE IF NOT EXISTS "order_pricing_snapshot" (
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

ALTER TABLE ONLY "reimbursement"
    ADD CONSTRAINT "reimbursement_pkey" PRIMARY KEY ("id"),
    ADD CONSTRAINT "reimbursement_claim_number_key" UNIQUE ("claim_number");

ALTER TABLE ONLY "diy_sheet"
    ADD CONSTRAINT "diy_sheet_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "order_pricing_snapshot"
    ADD CONSTRAINT "order_pricing_snapshot_pkey" PRIMARY KEY ("id");

-- =====================================================
-- Step 4: Create Indexes
-- =====================================================

-- purchase_list indexes
CREATE INDEX IF NOT EXISTS "purchase_list_target_date_idx" ON "purchase_list" ("target_date");
CREATE INDEX IF NOT EXISTS "purchase_list_status_idx" ON "purchase_list" ("status");
CREATE INDEX IF NOT EXISTS "purchase_list_created_by_id_idx" ON "purchase_list" ("created_by_id");
CREATE INDEX IF NOT EXISTS "purchase_list_reimbursement_id_idx" ON "purchase_list" ("reimbursement_id");

-- purchase_item indexes
CREATE INDEX IF NOT EXISTS "purchase_item_purchase_list_id_idx" ON "purchase_item" ("purchase_list_id");
CREATE INDEX IF NOT EXISTS "purchase_item_ingredient_id_idx" ON "purchase_item" ("ingredient_id");

-- purchase_record indexes
CREATE INDEX IF NOT EXISTS "purchase_record_purchase_list_id_idx" ON "purchase_record" ("purchase_list_id");
CREATE INDEX IF NOT EXISTS "purchase_record_purchase_item_id_idx" ON "purchase_record" ("purchase_item_id");
CREATE INDEX IF NOT EXISTS "purchase_record_ingredient_id_idx" ON "purchase_record" ("ingredient_id");

-- custom_recipe_order indexes
CREATE INDEX IF NOT EXISTS "custom_recipe_order_customer_id_idx" ON "custom_recipe_order" ("customer_id");
CREATE INDEX IF NOT EXISTS "custom_recipe_order_dog_id_idx" ON "custom_recipe_order" ("dog_id");
CREATE INDEX IF NOT EXISTS "custom_recipe_order_status_idx" ON "custom_recipe_order" ("status");
CREATE INDEX IF NOT EXISTS "custom_recipe_order_scheduled_date_idx" ON "custom_recipe_order" ("scheduled_date");
CREATE INDEX IF NOT EXISTS "custom_recipe_order_recipe_id_idx" ON "custom_recipe_order" ("recipe_id");

-- custom_recipe_attachment indexes
CREATE INDEX IF NOT EXISTS "custom_recipe_attachment_order_id_idx" ON "custom_recipe_attachment" ("order_id");

-- reimbursement indexes
CREATE INDEX IF NOT EXISTS "reimbursement_status_idx" ON "reimbursement" ("status");
CREATE INDEX IF NOT EXISTS "reimbursement_submitted_by_id_idx" ON "reimbursement" ("submitted_by_id");
CREATE INDEX IF NOT EXISTS "reimbursement_claim_number_idx" ON "reimbursement" ("claim_number");

-- diy_sheet indexes
CREATE INDEX IF NOT EXISTS "diy_sheet_user_id_idx" ON "diy_sheet" ("user_id");
CREATE INDEX IF NOT EXISTS "diy_sheet_user_id_created_at_idx" ON "diy_sheet" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "diy_sheet_created_at_idx" ON "diy_sheet" ("created_at");

-- order_pricing_snapshot indexes
CREATE INDEX IF NOT EXISTS "order_pricing_snapshot_customer_id_expires_at_idx" ON "order_pricing_snapshot" ("customer_id", "expires_at");
CREATE INDEX IF NOT EXISTS "order_pricing_snapshot_expires_at_idx" ON "order_pricing_snapshot" ("expires_at");

-- =====================================================
-- Step 5: Create Foreign Keys
-- =====================================================

-- purchase_list foreign keys
ALTER TABLE ONLY "purchase_list"
    ADD CONSTRAINT "purchase_list_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "user"("id")
    ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY "purchase_list"
    ADD CONSTRAINT "purchase_list_reimbursement_id_fkey"
    FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursement"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

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

-- reimbursement relations
ALTER TABLE ONLY "purchase_list"
    ADD CONSTRAINT "purchase_list_reimbursement_id_fkey"
    FOREIGN KEY ("reimbursement_id") REFERENCES "reimbursement"("id")
    ON UPDATE CASCADE ON DELETE SET NULL;

-- diy_sheet foreign keys
ALTER TABLE ONLY "diy_sheet"
    ADD CONSTRAINT "diy_sheet_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id")
    ON UPDATE CASCADE ON DELETE CASCADE;

-- =====================================================
-- End of Migration
-- =====================================================
