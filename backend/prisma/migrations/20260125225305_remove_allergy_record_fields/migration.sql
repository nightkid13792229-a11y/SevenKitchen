-- Remove unnecessary fields from allergy_record table
-- Drop columns: allergenType, discoveryDate, symptoms, severity, confirmedBy, treatment

DO $$
BEGIN
    IF to_regclass('public.allergy_record') IS NOT NULL THEN
        ALTER TABLE "allergy_record"
            DROP COLUMN IF EXISTS "allergen_type",
            DROP COLUMN IF EXISTS "discovery_date",
            DROP COLUMN IF EXISTS "symptoms",
            DROP COLUMN IF EXISTS "severity",
            DROP COLUMN IF EXISTS "confirmed_by",
            DROP COLUMN IF EXISTS "treatment";
    END IF;
END $$;

-- Remove index on allergen_type (no longer needed)
DROP INDEX IF EXISTS "allergy_record_dogId_allergenType_idx";

-- Drop unused enums
DROP TYPE IF EXISTS "AllergenType";
DROP TYPE IF EXISTS "Severity";
DROP TYPE IF EXISTS "ConfirmedBy";
