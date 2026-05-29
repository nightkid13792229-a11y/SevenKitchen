ALTER TABLE "design_recipe"
  ALTER COLUMN "energy_density_kcal_per_kg" DROP DEFAULT,
  ALTER COLUMN "energy_density_kcal_per_kg" DROP NOT NULL;
