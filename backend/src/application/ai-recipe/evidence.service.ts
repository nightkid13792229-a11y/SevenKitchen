import { Injectable } from '@nestjs/common';
import { EvidenceLevel } from '../../domain/ai-recipe/enums';

export type GradeEvidenceInput = {
  sourceType: string;
  isConfirmed: boolean;
  confirmedData: Record<string, unknown>;
  attachmentUrls: string[];
};

@Injectable()
export class EvidenceService {
  gradeEvidence(input: GradeEvidenceInput): EvidenceLevel {
    if (input.sourceType === 'STOOL_PHOTO') {
      return EvidenceLevel.D_ATTACHMENT_OBSERVATION;
    }

    if (!input.isConfirmed) {
      return EvidenceLevel.C_OWNER_REPORTED;
    }

    const hasDiagnosis =
      typeof input.confirmedData.diagnosis === 'string' &&
      input.confirmedData.diagnosis.trim().length > 0;
    const hasReportDate =
      typeof input.confirmedData.reportDate === 'string' &&
      input.confirmedData.reportDate.trim().length > 0;
    const hasClinicName =
      typeof input.confirmedData.clinicName === 'string' &&
      input.confirmedData.clinicName.trim().length > 0;
    const hasIndicators =
      Array.isArray(input.confirmedData.testIndicators) &&
      input.confirmedData.testIndicators.length > 0;

    if (hasDiagnosis && hasReportDate && hasClinicName && hasIndicators) {
      return EvidenceLevel.A_CONFIRMED_DIAGNOSIS;
    }

    if (hasIndicators) {
      return EvidenceLevel.B_TEST_INDICATED;
    }

    return EvidenceLevel.C_OWNER_REPORTED;
  }
}
