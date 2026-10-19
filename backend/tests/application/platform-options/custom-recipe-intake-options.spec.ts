import { OPTION_SET_DEFINITIONS } from 'src/application/platform-options/option-sets.registry';

describe('定制页 · 饲喂历史选项（2026-10-19）', () => {
  const definition = (code: string) =>
    OPTION_SET_DEFINITIONS.find((item) => item.code === code);

  it('自制改为「自制/商业鲜食」', () => {
    const currentFood = definition('custom_recipe_current_food');
    expect(
      currentFood?.seed?.find((item) => item.code === 'HOMEMADE')?.label,
    ).toBe('自制/商业鲜食');
  });

  it('当前食物与肠胃都有「其他」选项', () => {
    expect(
      definition('custom_recipe_current_food')?.seed?.some(
        (item) => item.code === 'OTHER',
      ),
    ).toBe(true);
    expect(
      definition('custom_recipe_stomach')?.seed?.some(
        (item) => item.code === 'OTHER',
      ),
    ).toBe(true);
  });
});
