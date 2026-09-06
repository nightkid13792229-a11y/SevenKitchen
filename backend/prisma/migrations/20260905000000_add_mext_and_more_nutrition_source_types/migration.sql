-- AlterEnum: extend NutritionGovernanceSourceType for bulk library imports
ALTER TYPE "NutritionGovernanceSourceType" ADD VALUE IF NOT EXISTS 'MEXT';
ALTER TYPE "NutritionGovernanceSourceType" ADD VALUE IF NOT EXISTS 'COFID';
ALTER TYPE "NutritionGovernanceSourceType" ADD VALUE IF NOT EXISTS 'CIQUAL';
ALTER TYPE "NutritionGovernanceSourceType" ADD VALUE IF NOT EXISTS 'CNF';
