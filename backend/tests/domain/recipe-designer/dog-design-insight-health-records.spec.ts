import { buildDogDesignInsight } from '../../../src/domain/recipe-designer/dog-design-insight';

/**
 * 设计器看得到「最近一次就诊 / 体检」（2026-10-21）
 *
 * 设计面板只需要一个健康参照点：最近一次就诊与最近一次体检。
 * 全量记录列表既没人看，也容易把化验原始数值带出去 ——
 * 所以这里只输出最新一条的结论字段，日期统一 ISO。
 */
describe('DogDesignInsight · 最近就诊与体检', () => {
  const baseDog = { id: 'dog-1', name: '面包', currentWeightKg: 15 };

  const build = (
    overrides: Partial<Parameters<typeof buildDogDesignInsight>[0]> = {},
  ) =>
    buildDogDesignInsight({
      dog: baseDog,
      seriesList: [],
      orderItems: [],
      lifeStageLabel: '成犬期',
      ...overrides,
    });

  it('多条就诊记录时只取最近一次，日期返回 ISO', () => {
    const insight = build({
      medicalRecords: [
        {
          visitDate: '2026-03-10T00:00:00.000Z',
          diagnosis: '肠胃炎',
          status: 'RECOVERED',
          chiefComplaint: '呕吐',
        },
        {
          visitDate: '2026-08-02T00:00:00.000Z',
          diagnosis: '胰腺炎',
          status: 'TREATING',
          chiefComplaint: '腹痛',
          exams: '血常规 / 腹部B超',
        },
        {
          visitDate: '2026-05-01T00:00:00.000Z',
          diagnosis: '皮肤病',
          status: 'TREATING',
        },
      ],
    });

    expect(insight.latestMedicalRecord).toEqual({
      visitDate: '2026-08-02T00:00:00.000Z',
      diagnosis: '胰腺炎',
      status: 'TREATING',
      chiefComplaint: '腹痛',
      exams: '血常规 / 腹部B超',
      attachments: [],
    });
    // 不返回全量列表
    expect(insight).not.toHaveProperty('medicalRecords');
  });

  it('多条体检记录时只取最近一次，日期返回 ISO', () => {
    const insight = build({
      checkupRecords: [
        {
          checkupDate: '2025-12-01T00:00:00.000Z',
          checkupType: '年度体检',
          findings: '未见明显异常',
        },
        {
          checkupDate: '2026-07-15T00:00:00.000Z',
          checkupType: '术前检查',
          findings: '轻度贫血',
        },
      ],
    });

    expect(insight.latestCheckupRecord).toEqual({
      checkupDate: '2026-07-15T00:00:00.000Z',
      checkupType: '术前检查',
      findings: '轻度贫血',
      attachments: [],
    });
    expect(insight).not.toHaveProperty('checkupRecords');
  });

  it('没有就诊 / 体检记录时两者都是 null', () => {
    const empty = build();
    expect(empty.latestMedicalRecord).toBeNull();
    expect(empty.latestCheckupRecord).toBeNull();

    const emptyArrays = build({ medicalRecords: [], checkupRecords: [] });
    expect(emptyArrays.latestMedicalRecord).toBeNull();
    expect(emptyArrays.latestCheckupRecord).toBeNull();
  });

  it('不输出化验原始数值（labValues）等与设计无关的字段', () => {
    const insight = build({
      medicalRecords: [
        {
          visitDate: '2026-08-02T00:00:00.000Z',
          diagnosis: '胰腺炎',
          status: 'TREATING',
          chiefComplaint: '腹痛',
          exams: '血常规',
          // 即使调用方多传了原始数值，也不能出现在洞察里
          labValues: 'CREA 2.1 mg/dL',
          vitals: '体温 39.1℃',
        } as any,
      ],
      checkupRecords: [
        {
          checkupDate: '2026-07-15T00:00:00.000Z',
          checkupType: '年度体检',
          findings: '轻度贫血',
          labValues: 'ALT 80 U/L',
          recommendations: '三个月后复查',
        } as any,
      ],
    });

    expect(insight.latestMedicalRecord).not.toHaveProperty('labValues');
    expect(insight.latestMedicalRecord).not.toHaveProperty('vitals');
    expect(JSON.stringify(insight.latestMedicalRecord)).not.toContain('CREA');

    expect(insight.latestCheckupRecord).not.toHaveProperty('labValues');
    expect(insight.latestCheckupRecord).not.toHaveProperty('recommendations');
    expect(JSON.stringify(insight.latestCheckupRecord)).not.toContain('ALT');
  });

  it('可选结论字段为空时不输出空字符串', () => {
    const insight = build({
      medicalRecords: [
        {
          visitDate: '2026-08-02T00:00:00.000Z',
          diagnosis: '胰腺炎',
          status: 'TREATING',
          chiefComplaint: '',
          exams: null,
        },
      ],
      checkupRecords: [
        {
          checkupDate: '2026-07-15T00:00:00.000Z',
          checkupType: '年度体检',
          findings: null,
        },
      ],
    });

    expect(insight.latestMedicalRecord).not.toHaveProperty('chiefComplaint');
    expect(insight.latestMedicalRecord).not.toHaveProperty('exams');
    expect(insight.latestCheckupRecord).not.toHaveProperty('findings');
  });

  it('只带最新一条记录的附件，并保留原始 key / URL（签名交给服务层）', () => {
    const insight = build({
      medicalRecords: [
        {
          visitDate: '2026-03-10T00:00:00.000Z',
          diagnosis: '肠胃炎',
          status: 'RECOVERED',
          attachments: ['medical-record/old-report.jpg'],
        },
        {
          visitDate: '2026-08-02T00:00:00.000Z',
          diagnosis: '胰腺炎',
          status: 'TREATING',
          attachments: [
            'medical-record/report-a.jpg',
            ' https://cdn.example.com/medical-record/report-b.pdf ',
            '',
            null,
          ] as any,
        },
      ],
      checkupRecords: [
        {
          checkupDate: '2025-12-01T00:00:00.000Z',
          checkupType: '年度体检',
          attachments: ['checkup-record/old-report.jpg'],
        },
        {
          checkupDate: '2026-07-15T00:00:00.000Z',
          checkupType: '术前检查',
          attachments: ['checkup-record/annual-report.jpg'],
        },
      ],
    });

    expect(insight.latestMedicalRecord?.attachments).toEqual([
      'medical-record/report-a.jpg',
      'https://cdn.example.com/medical-record/report-b.pdf',
    ]);
    expect(insight.latestCheckupRecord?.attachments).toEqual([
      'checkup-record/annual-report.jpg',
    ]);
    // 旧记录的附件不能混进来
    expect(JSON.stringify(insight.latestMedicalRecord)).not.toContain(
      'old-report',
    );
    expect(JSON.stringify(insight.latestCheckupRecord)).not.toContain(
      'old-report',
    );
  });

  it('记录没有附件时返回空数组（前端可直接 .length / map）', () => {
    const insight = build({
      medicalRecords: [
        {
          visitDate: '2026-08-02T00:00:00.000Z',
          diagnosis: '胰腺炎',
          status: 'TREATING',
        },
      ],
      checkupRecords: [
        {
          checkupDate: '2026-07-15T00:00:00.000Z',
          checkupType: '年度体检',
        },
      ],
    });

    expect(insight.latestMedicalRecord?.attachments).toEqual([]);
    expect(insight.latestCheckupRecord?.attachments).toEqual([]);
  });
});
