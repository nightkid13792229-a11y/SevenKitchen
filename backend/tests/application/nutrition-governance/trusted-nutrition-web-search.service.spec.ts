import { TrustedNutritionWebSearchService } from 'src/application/nutrition-governance/trusted-nutrition-web-search.service';

describe('TrustedNutritionWebSearchService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches a whitelisted nutrition CSV URL and converts it into source input', async () => {
    const csv = [
      'Food Name,Energy (kcal),Water (g),Protein (g),Fat (g),Carbohydrate (g),Ash (g),Calcium (mg),Phosphorus (mg)',
      'Quail egg cooked,158,74.3,13.1,11.1,0.4,1.1,64,226',
    ].join('\n');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(csv),
    }) as unknown as typeof global.fetch;
    const service = new TrustedNutritionWebSearchService();

    const results = await service.search({
      ingredientName: '鹌鹑蛋',
      reviewerRequirement:
        '请从 https://www.foodstandards.gov.au/nutrition/quail-egg.csv 查找水煮后的鹌鹑蛋营养数据',
      searchTerms: ['quail egg cooked'],
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.foodstandards.gov.au/nutrition/quail-egg.csv',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: expect.any(String) }),
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        sourceType: 'MANUAL',
        sourceTitle: 'Trusted web source: foodstandards.gov.au',
        foodName: 'Quail egg cooked',
        sourceDetail: expect.objectContaining({
          provider: 'Trusted whitelist web source',
          trustedDomain: 'foodstandards.gov.au',
          url: 'https://www.foodstandards.gov.au/nutrition/quail-egg.csv',
        }),
        normalizedNutrition: expect.objectContaining({
          macros: expect.objectContaining({
            energyKcal: 158,
            moisture: 74.3,
            crudeProtein: 13.1,
            crudeFat: 11.1,
            carbohydrate: 0.4,
            ash: 1.1,
          }),
          minerals: expect.objectContaining({
            calcium: 64,
            phosphorus: 226,
          }),
        }),
      }),
    );
  });

  it('discovers trusted nutrition pages from a whitelist web search when no URL is provided', async () => {
    const searchHtml =
      '<a rel="nofollow" href="/l/?uddg=https%3A%2F%2Fwww.foodstandards.gov.au%2Fnutrition%2Fquail-egg.csv">Quail egg nutrition</a>';
    const csv = [
      'Food Name,Energy (kcal),Water (g),Protein (g),Fat (g)',
      'Quail egg cooked,158,74.3,13.1,11.1',
    ].join('\n');
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const urlText = String(url);
      return {
        ok: true,
        text: jest
          .fn()
          .mockResolvedValue(
            urlText.includes('lite.duckduckgo.com') ? searchHtml : csv,
          ),
      };
    }) as unknown as typeof global.fetch;
    const service = new TrustedNutritionWebSearchService();

    const results = await service.search({
      ingredientName: '鹌鹑蛋',
      reviewerRequirement: '能否为鹌鹑蛋找到水煮后的营养档案',
      searchTerms: ['quail egg cooked'],
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('lite.duckduckgo.com/lite/'),
      expect.any(Object),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.foodstandards.gov.au/nutrition/quail-egg.csv',
      expect.any(Object),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        foodName: 'Quail egg cooked',
        sourceDetail: expect.objectContaining({
          discoveryMode: 'whitelist-web-search',
        }),
      }),
    );
  });

  it('ignores non-whitelisted URLs instead of fetching them', async () => {
    global.fetch = jest.fn() as unknown as typeof global.fetch;
    const service = new TrustedNutritionWebSearchService();

    const results = await service.search({
      ingredientName: '鹌鹑蛋',
      reviewerRequirement: 'https://example.com/quail-egg.csv',
      searchTerms: ['quail egg'],
    });

    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
