-- Remove unnecessary fields from allergy_record table
-- Drop columns: allergenType, discoveryDate, symptoms, severity, confirmedBy, treatment

-- Drop the allergen_type column
ALTER TABLE "allergy_record" DROP COLUMN IF EXISTS "allergen_type";

-- Drop the discovery_date column
ALTER TABLE "allergy_record" DROP COLUMN IF EXISTS "discovery_date";

-- Drop the symptoms column
ALTER TABLE "allergy_record" DROP COLUMN IF EXISTS "symptoms";

-- Drop the severity column
ALTER TABLE "allergy_record" DROP COLUMN IF EXISTS "severity";

-- Drop the confirmed_by column
ALTER TABLE "allergy_record" DROP COLUMN IF EXISTS "confirmed_by";

-- Drop the treatment column
ALTER TABLE "allergy_record" DROP COLUMN IF EXISTS "treatment";

-- Remove index on allergen_type (no longer needed)
DROP INDEX IF EXISTS "allergy_record_dogId_allergenType_idx";

-- Drop unused enums
DROP TYPE IF EXISTS "AllergenType";
DROP TYPE IF EXISTS "Severity";
DROP TYPE IF EXISTS "ConfirmedBy";
