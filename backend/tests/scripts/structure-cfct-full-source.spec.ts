import {
  buildCfctFullStructureBatches,
  buildCfctReviewArtifacts,
  mergeCfctStructuredPayloads,
  type CfctFullStructureVolume,
  type CfctStructuredPayload,
} from '../../scripts/structure-cfct-full-source';

describe('CFCT full source structuring', () => {
  const volumes: CfctFullStructureVolume[] = [
    {
      id: 'v1',
      volume: '第六版 第一册',
      pdf: '/private/cfct-v1.pdf',
      startPage: 1,
      endPage: 5,
    },
    {
      id: 'v2',
      volume: '第六版 第二册',
      pdf: '/private/cfct-v2.pdf',
      startPage: 10,
      endPage: 13,
    },
  ];

  it('builds resumable page batches for every CFCT volume', () => {
    const batches = buildCfctFullStructureBatches({
      volumes,
      chunkSize: 2,
      outputDir: 'reports/cfct-full',
    });

    expect(batches.map((batch) => ({
      id: batch.id,
      startPage: batch.startPage,
      endPage: batch.endPage,
      volume: batch.volume,
    }))).toEqual([
      { id: 'v1-p001-p002', startPage: 1, endPage: 2, volume: '第六版 第一册' },
      { id: 'v1-p003-p004', startPage: 3, endPage: 4, volume: '第六版 第一册' },
      { id: 'v1-p005-p005', startPage: 5, endPage: 5, volume: '第六版 第一册' },
      { id: 'v2-p010-p011', startPage: 10, endPage: 11, volume: '第六版 第二册' },
      { id: 'v2-p012-p013', startPage: 12, endPage: 13, volume: '第六版 第二册' },
    ]);
    expect(batches[0].structuredOutput).toBe(
      'reports/cfct-full/batches/v1-p001-p002-structured.json',
    );
    expect(batches[0].orientation).toBe('right');
  });

  it('merges structured payloads in volume and page order', () => {
    const payloads: CfctStructuredPayload[] = [
      {
        generatedAt: '2026-05-17T00:00:00.000Z',
        rows: [
          {
            volume: '第六版 第二册',
            page: 2,
            row: 3,
            foodName: '后排',
            nutrients: { energyKcal: 20 },
            qualityFlags: [],
            reviewStatus: 'AUTO_STRUCTURED',
          },
        ],
      },
      {
        generatedAt: '2026-05-17T00:00:00.000Z',
        rows: [
          {
            volume: '第六版 第一册',
            page: 1,
            row: 9,
            foodName: '第一页后行',
            nutrients: { energyKcal: 10 },
            qualityFlags: [],
            reviewStatus: 'AUTO_STRUCTURED',
          },
          {
            volume: '第六版 第一册',
            page: 1,
            row: 1,
            foodName: '第一页前行',
            nutrients: { energyKcal: 11 },
            qualityFlags: [],
            reviewStatus: 'AUTO_STRUCTURED',
          },
        ],
      },
    ];

    const merged = mergeCfctStructuredPayloads(payloads, ['第六版 第一册', '第六版 第二册']);

    expect(merged.rows.map((row) => row.foodName)).toEqual([
      '第一页前行',
      '第一页后行',
      '后排',
    ]);
  });

  it('merges primary and continuation rows with the same CFCT food code across batches', () => {
    const payloads: CfctStructuredPayload[] = [
      {
        rows: [
          {
            volume: '第六版 第一册',
            page: 120,
            row: 8,
            foodName: '鸡胸肉',
            foodCode: '051201',
            nutrients: { energyKcal: 133, protein: 19.4 },
            qualityFlags: [],
            reviewStatus: 'AUTO_STRUCTURED',
            sourceSegments: [
              {
                kind: 'PRIMARY',
                page: 120,
                row: 8,
                rawOcrText: '051201 鸡胸肉 133 19.4',
                nutrientKeys: ['energyKcal', 'protein'],
              },
            ],
          },
        ],
      },
      {
        rows: [
          {
            volume: '第六版 第一册',
            page: 121,
            row: 8,
            foodName: '鸡胸肉',
            foodCode: '051201',
            nutrients: { vitaminA: 5, vitaminC: 2 },
            qualityFlags: ['MISSING_PRIMARY_ROW'],
            reviewStatus: 'NEEDS_REVIEW',
            sourceSegments: [
              {
                kind: 'CONTINUATION',
                page: 121,
                row: 8,
                rawOcrText: '051201 鸡胸肉 5 2',
                nutrientKeys: ['vitaminA', 'vitaminC'],
              },
            ],
          },
        ],
      },
    ];

    const merged = mergeCfctStructuredPayloads(payloads, ['第六版 第一册']);

    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0]).toMatchObject({
      foodCode: '051201',
      nutrients: {
        energyKcal: 133,
        protein: 19.4,
        vitaminA: 5,
        vitaminC: 2,
      },
      qualityFlags: [],
      reviewStatus: 'AUTO_STRUCTURED',
    });
    expect(merged.rows[0].sourceSegments?.map((segment) => segment.kind)).toEqual([
      'PRIMARY',
      'CONTINUATION',
    ]);
  });

  it('requires enough nutrient coverage before a row is considered auto-ready', () => {
    const merged = mergeCfctStructuredPayloads(
      [
        {
          rows: [
            {
              volume: '第六版 第一册',
              page: 60,
              row: 25,
              foodName: '薏米［薏仁米,苡米］',
              foodCode: '019008',
              nutrients: {
                energyKcal: 357,
                protein: 12.8,
                fat: 3.3,
                carbohydrate: 69.1,
                ash: 1.7,
                moisture: 13.1,
              },
              qualityFlags: [],
              reviewStatus: 'AUTO_STRUCTURED',
              sourceSegments: [
                {
                  kind: 'PRIMARY',
                  page: 60,
                  row: 25,
                  rawOcrText: '019008 薏米 357 12.8 3.3',
                  nutrientKeys: [
                    'energyKcal',
                    'protein',
                    'fat',
                    'carbohydrate',
                    'ash',
                    'moisture',
                  ],
                },
              ],
            },
          ],
        },
      ],
      ['第六版 第一册'],
    );

    expect(merged.rows[0]).toMatchObject({
      qualityFlags: ['CONTINUATION_INCOMPLETE'],
      reviewStatus: 'NEEDS_REVIEW',
    });
  });

  it('splits full structured rows into importable and review queues', () => {
    const artifacts = buildCfctReviewArtifacts([
      {
        volume: '第六版 第一册',
        page: 1,
        row: 1,
        foodName: '可入库',
        nutrients: { energyKcal: 10 },
        qualityFlags: [],
        reviewStatus: 'AUTO_STRUCTURED',
      },
      {
        volume: '第六版 第一册',
        page: 1,
        row: 2,
        foodName: '需复核',
        nutrients: { energyKcal: 20 },
        qualityFlags: ['LOW_OCR_CONFIDENCE'],
        reviewStatus: 'NEEDS_REVIEW',
      },
    ]);

    expect(artifacts.autoReady.rows).toHaveLength(1);
    expect(artifacts.needsReview.rows).toHaveLength(1);
    expect(artifacts.summary).toMatchObject({
      totalRows: 2,
      autoReadyRows: 1,
      needsReviewRows: 1,
      qualityFlagCounts: {
        LOW_OCR_CONFIDENCE: 1,
      },
    });
  });
});
