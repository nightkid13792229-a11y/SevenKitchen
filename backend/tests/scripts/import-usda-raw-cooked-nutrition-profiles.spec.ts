import {
  selectUsdaProfileTargetsForIngredient,
  type UsdaLocalFoodRow,
} from '../../scripts/import-usda-raw-cooked-nutrition-profiles';

const food = (fdcId: string, description: string): UsdaLocalFoodRow => ({
  fdcId,
  description,
  dataType: 'sr_legacy_food',
  publicationDate: '2019-04-01',
});

describe('USDA raw/cooked nutrition profile importer matching', () => {
  it('prefers common cabbage over pak-choi or pe-tsai for generic cabbage', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '卷心菜',
      foods: [
        food('170390', 'Cabbage, chinese (pak-choi), raw'),
        food('169979', 'Cabbage, chinese (pe-tsai), raw'),
        food(
          '169975',
          'Cabbage, common (danish, domestic, and pointed types), raw',
        ),
        food('169976', 'Cabbage, cooked, boiled, drained, without salt'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '169975',
      '169976',
    ]);
    expect(selected[0]?.role).toBe('PRIMARY');
    expect(selected[1]?.role).toBe('SECONDARY');
  });

  it('keeps generic cucumber with peel as primary and peeled cucumber as secondary', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '黄瓜',
      foods: [
        food('169225', 'Cucumber, peeled, raw'),
        food('168409', 'Cucumber, with peel, raw'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '168409',
      '169225',
    ]);
    expect(selected[0]?.ediblePortionLabel).toBe('带皮');
    expect(selected[1]?.ediblePortionLabel).toBe('去皮');
  });

  it('matches waxgourd even when USDA writes it as one word', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '冬瓜',
      foods: [
        food('170069', 'Waxgourd, (chinese preserving melon), raw'),
        food(
          '170475',
          'Waxgourd, (chinese preserving melon), cooked, boiled, drained, without salt',
        ),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '170069',
      '170475',
    ]);
    expect(selected[1]?.role).toBe('SECONDARY');
  });

  it("uses fresh Jew's ear for black fungus instead of dried cloud ears", () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '黑木耳',
      foods: [
        food('168581', 'Fungi, Cloud ears, dried'),
        food('169237', "Jew's ear, (pepeao), raw"),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual(['169237']);
    expect(selected[0]?.state).toBe('RAW');
  });

  it('does not match green-lipped mussel to ordinary blue mussel USDA records', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '青口贝',
      foods: [
        food('175058', 'Mollusks, mussel, blue, raw'),
        food('175059', 'Mollusks, mussel, blue, cooked, moist heat'),
      ],
    });

    expect(selected).toEqual([]);
  });

  it('selects turkey breast rather than chicken deli breast distractions', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '火鸡胸',
      foods: [
        food('171103', 'Chicken breast tenders, breaded, uncooked'),
        food('171098', 'Turkey, whole, breast, meat only, raw'),
        food('171496', 'Turkey, whole, breast, meat only, cooked, roasted'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '171098',
      '171496',
    ]);
  });

  it('selects oyster mollusk records and rejects oyster mushroom noise', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '生蚝',
      foods: [
        food('11987', 'Mushrooms, oyster, raw'),
        food('174212', 'Mollusks, oyster, eastern, raw'),
        food('174213', 'Mollusks, oyster, eastern, cooked, breaded and fried'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual(['174212']);
  });

  it('prefers farmed oyster records and does not default to wild oyster', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '生蚝',
      foods: [
        food('171978', 'Mollusks, oyster, eastern, wild, raw'),
        food('171980', 'Mollusks, oyster, eastern, wild, cooked, moist heat'),
        food('174219', 'Mollusks, oyster, Pacific, raw'),
        food('174250', 'Mollusks, oyster, Pacific, cooked, moist heat'),
        food('175172', 'Mollusks, oyster, eastern, farmed, raw'),
        food('175173', 'Mollusks, oyster, eastern, farmed, cooked, dry heat'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '175172',
      '175173',
    ]);
  });

  it('does not confuse pear with pearled barley', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '梨（鲜）',
      foods: [
        food('170284', 'Barley, pearled, raw'),
        food('169118', 'Pears, raw'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual(['169118']);
  });

  it('rejects pumpkin flowers and pumpkinseed fish for pumpkin', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '南瓜',
      foods: [
        food('169270', 'Pumpkin flowers, raw'),
        food('168448', 'Pumpkin, raw'),
        food('173675', 'Fish, sunfish, pumpkin seed, cooked, dry heat'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual(['168448']);
  });

  it('rejects prepared potato distractions and keeps plain raw/cooked potato', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '土豆',
      foods: [
        food('167604', 'Potatoes, hash brown, refrigerated, unprepared'),
        food('170026', 'Potatoes, flesh and skin, raw'),
        food('170438', 'Potatoes, boiled, cooked in skin, flesh, without salt'),
        food('168483', 'Sweet potato, cooked, baked in skin, flesh, without salt'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '170026',
      '170438',
    ]);
  });

  it('rejects sprouted soybeans for mature soybean ingredients', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '大豆',
      foods: [
        food('169284', 'Soybeans, mature seeds, sprouted, raw'),
        food('174270', 'Soybeans, mature seeds, raw'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual(['174270']);
  });

  it('prefers single olive oil over blended oils', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '橄榄油',
      foods: [
        food('167737', 'Oil, corn, peanut, and olive'),
        food('171413', 'Oil, olive, salad or cooking'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual(['171413']);
  });

  it('allows plain nuts without a dried word and rejects roasted nut variants', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '巴旦木',
      foods: [
        food('170158', 'Nuts, almonds, dry roasted, without salt added'),
        food('170567', 'Nuts, almonds'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual(['170567']);
  });

  it('prefers generic pear over named pear cultivars', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '梨（鲜）',
      foods: [
        food('167777', 'Pears, raw, red anjou'),
        food('169118', 'Pears, raw'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual(['169118']);
  });

  it('does not let food distribution notes push raw sweet potato below threshold', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '红薯',
      foods: [
        food(
          '168482',
          "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
        ),
        food('168483', 'Sweet potato, cooked, baked in skin, flesh, without salt'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '168482',
      '168483',
    ]);
  });

  it('keeps mature mung beans separate from mung bean sprouts', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '绿豆',
      foods: [
        food('169957', 'Mung beans, mature seeds, sprouted, raw'),
        food('174256', 'Mung beans, mature seeds, raw'),
        food('174257', 'Mung beans, mature seeds, cooked, boiled, without salt'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '174256',
      '174257',
    ]);
  });

  it('keeps broccoli vegetable heads separate from leaves and Chinese broccoli', () => {
    const selected = selectUsdaProfileTargetsForIngredient({
      ingredientName: '西兰花',
      foods: [
        food('169329', 'Broccoli, leaves, raw'),
        food('170379', 'Broccoli, raw'),
        food('169392', 'Broccoli, chinese, cooked'),
        food('169967', 'Broccoli, cooked, boiled, drained, without salt'),
      ],
    });

    expect(selected.map((item) => item.food.fdcId)).toEqual([
      '170379',
      '169967',
    ]);
  });

  it('does not confuse apples or bananas with similarly named foods', () => {
    const apples = selectUsdaProfileTargetsForIngredient({
      ingredientName: '苹果',
      foods: [
        food('168171', 'Rose-apples, raw'),
        food(
          '171688',
          "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
        ),
      ],
    });
    const bananas = selectUsdaProfileTargetsForIngredient({
      ingredientName: '香蕉',
      foods: [
        food('169394', 'Pepper, banana, raw'),
        food('173944', 'Bananas, raw'),
      ],
    });

    expect(apples.map((item) => item.food.fdcId)).toEqual(['171688']);
    expect(bananas.map((item) => item.food.fdcId)).toEqual(['173944']);
  });
});
