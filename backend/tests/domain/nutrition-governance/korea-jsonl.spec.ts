import {
  parseKoreaJsonl,
  type KoreaJsonlRecord,
} from 'src/domain/nutrition-governance/korea-jsonl';

const FOOD_A: KoreaJsonlRecord = {
  index: '1',
  code: 'A001001A010a',
  nameKo: '귀리, 겉귀리, 도정, 생것',
  nameEn: 'Oat(Gwiri), Covered, Polished, Raw',
  scientificName: 'Avena sativa L.',
  foodGroup: '곡류 및 그 제품',
  source: "농진청('21)",
  refuseRate: 0,
  nutrients: {
    에너지: { value: 388, unit: 'kcal' },
    셀레늄: { value: 1.61, unit: 'μg' },
    타우린: { value: 0, unit: 'mg' },
  },
};

const FOOD_B: KoreaJsonlRecord = {
  index: '2',
  code: 'A001002A010a',
  nameKo: '귀리, 쌀귀리, 도정, 생것',
  nameEn: null,
  scientificName: null,
  foodGroup: '곡류 및 그 제품',
  source: null,
  refuseRate: null,
  nutrients: {
    에너지: { value: 0, unit: 'kcal' },
  },
};

describe('parseKoreaJsonl', () => {
  it('parses one JSON object per line and skips blank lines', () => {
    const text = [
      '',
      JSON.stringify(FOOD_A),
      '   ',
      JSON.stringify(FOOD_B),
      '',
    ].join('\n');

    const records = parseKoreaJsonl(text);

    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(FOOD_A);
    expect(records[1]).toEqual(FOOD_B);
  });

  it('preserves numeric values and units exactly', () => {
    const [record] = parseKoreaJsonl(JSON.stringify(FOOD_A));

    expect(record.nutrients['셀레늄']).toEqual({ value: 1.61, unit: 'μg' });
    expect(record.nutrients['타우린']).toEqual({ value: 0, unit: 'mg' });
    expect(record.refuseRate).toBe(0);
  });

  it('accepts CRLF line endings', () => {
    const text = `${JSON.stringify(FOOD_A)}\r\n\r\n${JSON.stringify(FOOD_B)}\r\n`;

    expect(parseKoreaJsonl(text)).toHaveLength(2);
  });

  it('returns an empty list for blank input', () => {
    expect(parseKoreaJsonl('')).toEqual([]);
    expect(parseKoreaJsonl('\n \r\n\t\n')).toEqual([]);
  });

  it('throws with the line number on malformed JSON', () => {
    const text = [JSON.stringify(FOOD_A), '{not json'].join('\n');

    expect(() => parseKoreaJsonl(text)).toThrow(/第 2 行/);
    expect(() => parseKoreaJsonl(text)).toThrow(/JSON/);
  });

  it('throws when a required field is missing', () => {
    const { code: _code, ...withoutCode } = FOOD_A;

    expect(() => parseKoreaJsonl(JSON.stringify(withoutCode))).toThrow(
      /第 1 行.*code/,
    );
  });

  it('throws when a nutrient value is not finite', () => {
    const broken = {
      ...FOOD_A,
      nutrients: { 에너지: { value: null, unit: 'kcal' } },
    };

    expect(() => parseKoreaJsonl(JSON.stringify(broken))).toThrow(
      /第 1 行.*에너지/,
    );
  });

  it('normalizes absent optional text fields to null', () => {
    const {
      nameEn: _nameEn,
      scientificName: _scientificName,
      source: _source,
      ...withoutOptional
    } = FOOD_A;

    const [record] = parseKoreaJsonl(JSON.stringify(withoutOptional));

    expect(record.nameEn).toBeNull();
    expect(record.scientificName).toBeNull();
    expect(record.source).toBeNull();
    expect(record.foodGroup).toBe(FOOD_A.foodGroup);
  });
});
