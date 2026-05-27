import { validate } from 'class-validator';
import { AddAssessmentEvidenceDto } from '../../src/interfaces/dto/ai-recipe/assessment.dto';

describe('AddAssessmentEvidenceDto', () => {
  it('rejects non-string attachment URLs', async () => {
    const dto = new AddAssessmentEvidenceDto();
    dto.sourceType = 'VET_REPORT';
    dto.title = 'Vet report';
    dto.attachmentUrls = ['https://example.test/report.pdf', 123] as any;

    const errors = await validate(dto);

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'attachmentUrls',
          constraints: expect.objectContaining({
            isString: 'each value in attachmentUrls must be a string',
          }),
        }),
      ]),
    );
  });
});
