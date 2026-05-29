import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CURATED_DISPLAY_NAME_SOURCE,
  CURATED_NUTRITION_FOOD_DISPLAY_NAMES,
} from '../../prisma/curated-nutrition-food-display-names';

describe('curated nutrition food display names', () => {
  it('stores manually curated names for every distinct standard food nutrition profile', () => {
    const sourcePath = resolve(
      process.cwd(),
      'prisma/curated-nutrition-food-display-names.ts',
    );

    expect(existsSync(sourcePath)).toBe(true);
    expect(CURATED_DISPLAY_NAME_SOURCE).toBe('CURATED_MANUAL');
    expect(Object.keys(CURATED_NUTRITION_FOOD_DISPLAY_NAMES)).toHaveLength(183);
  });

  it('replaces coarse auto-rule labels with specific Chinese nutrition profile names', () => {
    expect(
      CURATED_NUTRITION_FOOD_DISPLAY_NAMES[
        'deea4c1d-5949-4224-9857-02969c8f396e'
      ],
    ).toBe('三文鱼（大西洋鲑，养殖，干烤熟制）');
    expect(
      CURATED_NUTRITION_FOOD_DISPLAY_NAMES[
        '97d4b8b3-f272-4e04-90b4-eb9140f6c4f4'
      ],
    ).toBe('藜麦（未煮）');
    expect(
      CURATED_NUTRITION_FOOD_DISPLAY_NAMES[
        '7a37bae6-fb55-4e2b-8054-37e8a6c2a025'
      ],
    ).toBe('黄瓜（去皮，生）');
    expect(
      CURATED_NUTRITION_FOOD_DISPLAY_NAMES[
        '1ea23dde-235e-4e9f-bc83-85e5d765f077'
      ],
    ).toBe('新西兰青口贝肉（生）');
    expect(
      CURATED_NUTRITION_FOOD_DISPLAY_NAMES[
        '8caac0e2-9910-4887-b2e6-a42e9eee53ea'
      ],
    ).toBe('红薯/甘薯（生，未加工）');
    expect(
      CURATED_NUTRITION_FOOD_DISPLAY_NAMES[
        'c7cf54d5-929f-48a3-9e8b-37b32ed79c1a'
      ],
    ).toBe('红薯/甘薯（水煮，去皮）');
  });

  it('does not keep generic source placeholders in the curated names', () => {
    const names = Object.values(CURATED_NUTRITION_FOOD_DISPLAY_NAMES);

    expect(names).not.toContain('三文鱼（熟制，干热）');
    expect(names.some((name) => name.includes('USDA档案'))).toBe(false);
    expect(names.some((name) => name.trim().length === 0)).toBe(false);
  });
});
