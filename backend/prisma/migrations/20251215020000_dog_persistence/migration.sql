-- CreateEnum
CREATE TYPE "DogGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('RESTING', 'LOW', 'NORMAL', 'HIGH', 'WORKING');

-- CreateEnum
CREATE TYPE "LifeStageOverride" AS ENUM ('NONE', 'PREGNANCY', 'LACTATION', 'PUPPY', 'ADULT', 'SENIOR');

-- CreateEnum
CREATE TYPE "DogSizeCategory" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'GIANT');

-- CreateEnum
CREATE TYPE "TreatInputMode" AS ENUM ('ESTIMATE_LEVEL', 'EXACT_KCAL');

-- CreateEnum
CREATE TYPE "TreatLevel" AS ENUM ('NONE', 'LOW', 'MODERATE', 'HIGH');

-- CreateTable
CREATE TABLE "dog" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "breed_id" TEXT NOT NULL,
    "birthday" TIMESTAMP(3) NOT NULL,
    "gender" "DogGender" NOT NULL,
    "is_neutered" BOOLEAN NOT NULL,
    "current_weight_kg" DOUBLE PRECISION NOT NULL,
    "bcs_score" INTEGER NOT NULL,
    "activity_level" "ActivityLevel" NOT NULL,
    "life_stage_override" "LifeStageOverride" NOT NULL,
    "size_class_override" "DogSizeCategory",
    "meals_per_day" INTEGER NOT NULL DEFAULT 2,
    "treat_input_mode" "TreatInputMode" NOT NULL DEFAULT 'ESTIMATE_LEVEL',
    "treat_level" "TreatLevel" NOT NULL DEFAULT 'LOW',
    "manual_treat_kcal" INTEGER,
    "medical_history" TEXT,
    "cached_target_food_kcal" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dog_owner_id_idx" ON "dog"("owner_id");

-- CreateIndex
CREATE INDEX "dog_owner_id_created_at_idx" ON "dog"("owner_id", "created_at");

