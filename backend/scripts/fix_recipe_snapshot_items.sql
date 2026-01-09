-- Fix missing recipeSnapshot.items in packaging_unit
-- This script backfills recipeSnapshot.items from Recipe table for existing PackagingUnits
-- It is idempotent: only updates records where recipeSnapshot.items is missing or empty
-- 
-- Usage: psql $DATABASE_URL -f backend/scripts/fix_recipe_snapshot_items.sql
-- Or: cat backend/scripts/fix_recipe_snapshot_items.sql | psql $DATABASE_URL

-- Step 1: Create a temporary function to merge recipe snapshot with items
DO $$
DECLARE
    pu_record RECORD;
    recipe_record RECORD;
    recipe_items JSONB;
    updated_snapshot JSONB;
    updated_count INT := 0;
BEGIN
    -- Loop through all packaging_units where recipeSnapshot.items is missing or empty
    FOR pu_record IN
        SELECT 
            pu.id,
            pu.recipe_snapshot::jsonb as current_snapshot
        FROM packaging_unit pu
        WHERE 
            -- Check if items field is missing or empty array
            (
                pu.recipe_snapshot::jsonb->'items' IS NULL
                OR jsonb_array_length(COALESCE(pu.recipe_snapshot::jsonb->'items', '[]'::jsonb)) = 0
            )
            -- Ensure recipe_snapshot has an id field
            AND pu.recipe_snapshot::jsonb->>'id' IS NOT NULL
    LOOP
        -- Find the recipe by id from snapshot
        SELECT 
            r.id,
            r.items
        INTO recipe_record
        FROM recipe r
        WHERE r.id::text = pu_record.current_snapshot->>'id'
        LIMIT 1;

        -- If recipe found, merge items into snapshot
        IF recipe_record.id IS NOT NULL THEN
            -- Build items array from recipe.items
            SELECT jsonb_agg(
                jsonb_build_object(
                    'ingredient_id', ri.ingredient_id::text,
                    'name', COALESCE(ing.name, 'Unknown'),
                    'ratio', ri.ratio_percent
                )
            )
            INTO recipe_items
            FROM recipe_item ri
            LEFT JOIN ingredient ing ON ing.id = ri.ingredient_id
            WHERE ri.recipe_id = recipe_record.id;

            -- If items found, merge into snapshot
            IF recipe_items IS NOT NULL AND jsonb_array_length(recipe_items) > 0 THEN
                -- Merge: keep existing snapshot fields, add/update items
                updated_snapshot := pu_record.current_snapshot || jsonb_build_object('items', recipe_items);

                -- Update packaging_unit
                UPDATE packaging_unit
                SET recipe_snapshot = updated_snapshot::json
                WHERE id = pu_record.id;

                updated_count := updated_count + 1;
            END IF;
        END IF;
    END LOOP;

    RAISE NOTICE 'Updated % packaging_units with recipe snapshot items', updated_count;
END $$;

-- Step 2: Verify the fix
SELECT 
    COUNT(*) as total_units,
    COUNT(*) FILTER (WHERE recipe_snapshot::jsonb->'items' IS NOT NULL 
                     AND jsonb_array_length(recipe_snapshot::jsonb->'items') > 0) as units_with_items,
    COUNT(*) FILTER (WHERE recipe_snapshot::jsonb->'items' IS NULL 
                     OR jsonb_array_length(COALESCE(recipe_snapshot::jsonb->'items', '[]'::jsonb)) = 0) as units_missing_items
FROM packaging_unit;

