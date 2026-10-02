import { describe, expect, it } from 'vitest';
import { buildSingleScannedRecord, filterWarningsAgainstRecord } from './health-records';

/**
 * 一次拍多页纸 → 合成一条记录（2026-10-02 老板定稿）。
 *
 * 老板实测的问题：从「就诊」进去传了 2 页病历 + 3 张化验单，
 * 结果裂成两条记录（就诊 + 体检），他的疑问是
 * "我走的不是就诊路径吗？为什么它还是会识别成体检报告呢？"
 *
 * 定稿规则：**入口决定记录类型**。AI 判出来的文档类型只决定"字往哪个字段填"：
 *   · 化验页的数字 → 化验数据（不论入口是就诊还是体检）
 *   · 影像页 → 这次做的检查 + 附件（从就诊进）/ 补充说明（从体检进）
 *   · 另一类的文字不丢，带前缀并进「补充说明」
 *   · 疫苗本 / 过敏报告不并进来（各自板块有更合适的表单）
 */
describe('多页识别 · 入口决定记录类型', () => {
  const medicalDraft = {
    visitDate: '2026-02-11',
    chiefComplaint: '在家不够活泼，有点呕吐',
    diagnosis: '胆汁淤积',
    treatment: '回家后注意：清淡饮食，按时吃药，定期复查',
    exams: '全腹部彩超、血常规',
    vitals: '体温 38.4℃、体重 6.70kg、BCS 3',
    medications: ['乐妥 1片/次 每日2次 共3天'],
    notes: 'DR 检查 2 次',
    patientName: 'seven',
    attachments: ['https://img.sevenkitchen.cloud/medical-reports/a.jpg'],
  };

  const labDraft = {
    checkupDate: '2026-02-11',
    labValues: '生化\n丙氨酸氨基转移酶(ALT) 144 U/L（偏高）',
    patientName: 'seven',
    attachments: [
      'https://img.sevenkitchen.cloud/medical-reports/b.jpg',
      'https://img.sevenkitchen.cloud/medical-reports/c.jpg',
    ],
  };

  it('从「就诊」进：病历 + 3 张化验单 = 1 条就诊记录，数字进化验数据', () => {
    const { draft, matchedEntryType, ignored } = buildSingleScannedRecord(
      [
        { type: 'MEDICAL_RECORD', drafts: [medicalDraft] },
        { type: 'CHECKUP_REPORT', drafts: [labDraft, { ...labDraft, labValues: '血常规\nWBC 7.31' }] },
      ],
      'MEDICAL_RECORD',
    );

    expect(matchedEntryType).toBe(true);
    expect(ignored).toEqual([]);
    expect(draft?.__documentType).toBe('MEDICAL_RECORD');
    // 病历内容照旧
    expect(draft?.diagnosis).toBe('胆汁淤积');
    // 化验单的数字并进这条就诊记录
    expect(draft?.labValues).toContain('144 U/L（偏高）');
    expect(draft?.labValues).toContain('WBC 7.31');
    // 3 张原图全在这条记录下
    expect(draft?.attachments).toHaveLength(3);
  });

  it('从「体检」进：同一批纸 = 1 条体检记录，病历文字进「补充说明」并标明来源', () => {
    const { draft, matchedEntryType } = buildSingleScannedRecord(
      [
        { type: 'MEDICAL_RECORD', drafts: [medicalDraft] },
        { type: 'CHECKUP_REPORT', drafts: [labDraft] },
      ],
      'CHECKUP_REPORT',
    );

    expect(matchedEntryType).toBe(true);
    expect(draft?.__documentType).toBe('CHECKUP_REPORT');
    expect(draft?.labValues).toContain('144 U/L');
    // 病历里的诊断/医嘱/用药不能丢，但要标明来自病历
    expect(draft?.notes).toContain('医生诊断：胆汁淤积');
    expect(draft?.notes).toContain('医嘱：回家后注意');
    expect(draft?.notes).toContain('用药：乐妥');
    expect(draft?.attachments).toHaveLength(3);
  });

  it('只传了一张化验单、但走的是「就诊」→ 仍是就诊记录，并标出"没有病历内容"', () => {
    const { draft, matchedEntryType } = buildSingleScannedRecord(
      [{ type: 'CHECKUP_REPORT', drafts: [labDraft] }],
      'MEDICAL_RECORD',
    );

    expect(matchedEntryType).toBe(false);
    expect(draft?.__documentType).toBe('MEDICAL_RECORD');
    expect(draft?.labValues).toContain('144 U/L');
    // 日期也要兜住（化验单上有日期）
    expect(draft?.visitDate).toBe('2026-02-11');
  });

  it('影像片：从就诊进 → 检查部位进「这次做的检查」，原件仍留档', () => {
    const { draft } = buildSingleScannedRecord(
      [
        {
          type: 'IMAGING',
          drafts: [
            {
              checkupDate: '2026-02-11',
              notes: '腹部正位',
              attachments: ['https://img.sevenkitchen.cloud/medical-reports/dr.jpg'],
            },
          ],
        },
      ],
      'MEDICAL_RECORD',
    );

    expect(draft?.exams).toContain('腹部正位');
    expect(draft?.attachments).toEqual([
      'https://img.sevenkitchen.cloud/medical-reports/dr.jpg',
    ]);
  });

  it('疫苗本 / 过敏报告不并进来，单独回报（各自的板块更合适）', () => {
    const { draft, matchedEntryType, ignored } = buildSingleScannedRecord(
      [
        { type: 'MEDICAL_RECORD', drafts: [medicalDraft] },
        { type: 'VACCINE_BOOK', drafts: [{ vaccineName: '犬四联' }, { vaccineName: '狂犬' }] },
        { type: 'ALLERGY_REPORT', drafts: [{ allergen: '鸡肉' }] },
      ],
      'MEDICAL_RECORD',
    );

    expect(matchedEntryType).toBe(true);
    expect(ignored).toEqual([
      { type: 'VACCINE_BOOK', count: 2 },
      { type: 'ALLERGY_REPORT', count: 1 },
    ]);
    expect(draft?.diagnosis).toBe('胆汁淤积');
    expect(JSON.stringify(draft)).not.toContain('犬四联');
  });

  describe('合并后的提示筛除（老板实测：明明有 CRP，还说读不到）', () => {
    const merged = {
      labValues: '生化\nALT 144 U/L（偏高）\nCRP\nCRP 9.373 ug/ml（正常）',
      patientName: 'seven',
      visitDate: '2026-02-11',
    };

    it('某页说"CRP 结果值未填写"，但另一页抄到了 → 撤掉这句', () => {
      expect(
        filterWarningsAgainstRecord(
          ['检查结果表格中 CRP C反应蛋白的结果值未填写，无法读取'],
          merged,
        ),
      ).toEqual([]);
    });

    it('真的没读到的东西仍要提示', () => {
      const warnings = ['第三行日期被印章遮挡，未能确认'];
      // 日期是有的，但"被遮挡"不是"缺失"，属于真的看不清 → 保留
      expect(filterWarningsAgainstRecord(warnings, merged)).toEqual(warnings);
    });

    it('去重 + 最多留 3 条（一次传 5 张时提示会堆起来）', () => {
      const result = filterWarningsAgainstRecord(
        ['A 模糊', 'A 模糊', 'B 模糊', 'C 模糊', 'D 模糊'],
        { labValues: 'CRP 9.373' },
      );
      expect(result).toHaveLength(3);
      expect(new Set(result).size).toBe(3);
    });
  });

  it('什么都没读出来时不给草稿（上层据此提示重新上传）', () => {
    const { draft } = buildSingleScannedRecord(
      [{ type: 'VACCINE_BOOK', drafts: [{ vaccineName: '犬四联' }] }],
      'MEDICAL_RECORD',
    );

    expect(draft).toBeNull();
  });

  it('同一类有多页时字段互补、附件去重', () => {
    const { draft } = buildSingleScannedRecord(
      [
        {
          type: 'MEDICAL_RECORD',
          drafts: [
            { visitDate: '2026-02-11', diagnosis: '胆汁淤积', attachments: ['a.jpg'] },
            { treatment: '清淡饮食', attachments: ['a.jpg', 'b.jpg'] },
          ],
        },
      ],
      'MEDICAL_RECORD',
    );

    expect(draft?.diagnosis).toBe('胆汁淤积');
    expect(draft?.treatment).toBe('清淡饮食');
    expect(draft?.attachments).toEqual(['a.jpg', 'b.jpg']);
  });
});
