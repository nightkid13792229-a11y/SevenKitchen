import { SectionCatalogService } from '../../../src/application/knowledge-base/section-catalog.service';

describe('SectionCatalogService', () => {
  it('builds species/stage/topic metadata per document and section', async () => {
    const prisma = {
      sourceDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'iris-IRIS-DOG-Treatment-Recommendations-may-2026',
            sourceId: 'IRIS-CKD-2026',
            title: 'IRIS dog treatment',
            sections: [
              {
                id: 's2',
                title: 'Stage 2 Canine patients:',
                pageNo: 6,
                sortOrder: 2,
                paragraphs: [
                  { text: 'Dietary phosphate restriction for dogs with CKD.' },
                  { text: 'If plasma phosphate remains above 4.6 mg/dl, add binder.' },
                ],
              },
            ],
          },
        ]),
      },
    };
    const service = new SectionCatalogService(prisma as any);
    const catalog = await service.build(['iris-IRIS-DOG-Treatment-Recommendations-may-2026']);
    const document = catalog.documents[0];
    const section = document.sections[0];

    expect(document.documentType).toBe('treatment_guideline');
    expect(document.species).toBe('dog');
    expect(document.authority).toBe('guideline');
    expect(document.year).toBe(2026);
    expect(section.species).toBe('dog');
    expect(section.stages).toEqual([2]);
    expect(section.topics).toEqual(
      expect.arrayContaining(['phosphorus', 'phosphatebinder', 'staging']),
    );
    expect(section.sectionType).toBe('treatment');
  });
});
