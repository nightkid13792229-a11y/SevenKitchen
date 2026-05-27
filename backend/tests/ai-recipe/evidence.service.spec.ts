import { EvidenceService } from '../../src/application/ai-recipe/evidence.service';
import { EvidenceLevel } from '../../src/domain/ai-recipe/enums';

describe('EvidenceService', () => {
  const service = new EvidenceService();

  it('grades confirmed diagnosis reports as A level', () => {
    const result = service.gradeEvidence({
      sourceType: 'MEDICAL_REPORT',
      isConfirmed: true,
      confirmedData: {
        diagnosis: '慢性胰腺炎',
        testIndicators: ['cPLI'],
        reportDate: '2026-05-01',
        clinicName: 'Test Clinic',
      },
      attachmentUrls: ['https://cdn.test/report.pdf'],
    });

    expect(result).toBe(EvidenceLevel.A_CONFIRMED_DIAGNOSIS);
  });

  it('grades unconfirmed report extraction as owner reported level', () => {
    const result = service.gradeEvidence({
      sourceType: 'MEDICAL_REPORT',
      isConfirmed: false,
      confirmedData: { diagnosis: '慢性胰腺炎' },
      attachmentUrls: ['https://cdn.test/report.pdf'],
    });

    expect(result).toBe(EvidenceLevel.C_OWNER_REPORTED);
  });

  it('grades stool photos as D level', () => {
    const result = service.gradeEvidence({
      sourceType: 'STOOL_PHOTO',
      isConfirmed: false,
      confirmedData: {},
      attachmentUrls: ['https://cdn.test/stool.jpg'],
    });

    expect(result).toBe(EvidenceLevel.D_ATTACHMENT_OBSERVATION);
  });
});
