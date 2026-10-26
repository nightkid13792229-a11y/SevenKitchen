-- AlterEnum: add Korean RDA food composition database source
ALTER TYPE "NutritionGovernanceSourceType" ADD VALUE IF NOT EXISTS 'KO_RDA';
