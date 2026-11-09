import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { getKnowledgeSource } from '../../domain/recipe-designer/knowledge-base/source-registry';
import { TOPIC_ALIASES } from '../../domain/knowledge/topic-aliases';

export const CKD_DOCUMENT_IDS = [
  'sacn5-chapters-SACN5-37',
  'iris-IRIS-staging-guidelines-2026',
  'iris-IRIS-DOG-Treatment-Recommendations-may-2026',
  'iris-IRIS-Pocket-Guide-to-CKD-June-2026-cn6g',
  'aaha-AAHA-2021-Nutrition-and-Weight-Management-Guidelines',
] as const;

export type CatalogSpecies = 'dog' | 'cat' | 'both' | 'unknown';
export type CatalogAuthority = 'guideline' | 'textbook' | 'reference';
export type CatalogSectionType =
  | 'staging'
  | 'treatment'
  | 'diagnosis'
  | 'nutrition'
  | 'appendix'
  | 'introduction'
  | 'other';

export interface CatalogSection {
  id: string;
  title: string;
  pageNo: number | null;
  sortOrder: number;
  paragraphCount: number;
  species: CatalogSpecies;
  stages: number[];
  topics: string[];
  allTopics: string[];
  sectionType: CatalogSectionType;
  documentType?: string;
  authority?: string;
}

export interface CatalogDocument {
  id: string;
  sourceId: string | null;
  title: string;
  sourceName: string | null;
  version: string | null;
  role: string | null;
  authority: CatalogAuthority;
  documentType: string;
  species: CatalogSpecies;
  stages: number[];
  sectionCount: number;
  paragraphCount: number;
  sections: CatalogSection[];
}

export interface SectionCatalog {
  documents: CatalogDocument[];
  sections: Array<CatalogSection & { documentId: string; sourceId: string | null }>;
}

/** 历史上从本模块取过词表，保留兼容；真源在 `domain/knowledge/topic-aliases.ts`。 */
export { TOPIC_ALIASES };

@Injectable()
export class SectionCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async build(documentIds: readonly string[]): Promise<SectionCatalog> {
    const documents = await this.prisma.sourceDocument.findMany({
      where: { id: { in: [...documentIds] } },
      include: {
        sections: {
          orderBy: { sortOrder: 'asc' },
          include: {
            paragraphs: {
              select: { text: true, pageStart: true, pageEnd: true },
              orderBy: { id: 'asc' },
            },
          },
        },
      },
    });

    const catalogDocuments: CatalogDocument[] = [];
    const catalogSections: SectionCatalog['sections'] = [];

    for (const document of documents as any[]) {
      const source = document.sourceId
        ? getKnowledgeSource(document.sourceId)
        : undefined;
      const docText = [
        document.title ?? '',
        ...(document.sections ?? []).flatMap((section: any) => [
          section.title ?? '',
          ...(section.paragraphs ?? []).map((paragraph: any) => paragraph.text ?? ''),
        ]),
      ].join('\n');
      const guessedSpecies = guessDocumentSpecies(document);
      const docSpecies =
        guessedSpecies === 'both'
          ? detectSpecies(docText, guessedSpecies)
          : guessedSpecies;
      const documentType = guessDocumentType(document, source);
      const authority = guessAuthority(document, source);
      const stages = detectStages(docText);
      const docTopics = detectTopics(docText);

      const sections: CatalogSection[] = (document.sections ?? []).map(
        (section: any) => {
          const text = [
            section.title ?? '',
            ...(section.paragraphs ?? []).map((paragraph: any) => paragraph.text ?? ''),
          ].join('\n');
          const allTopics = detectTopics(text, docTopics, 100);
          const titleStages = detectStages(section.title ?? '');
          return {
            id: section.id,
            title: section.title ?? '',
            pageNo: section.pageNo ?? null,
            sortOrder: Number(section.sortOrder ?? 0),
            paragraphCount: (section.paragraphs ?? []).length,
            species: detectSpecies(text, docSpecies),
            stages: titleStages.length
              ? titleStages
              : documentType === 'staging_guideline'
                ? detectStages(text)
                : [],
            topics: allTopics.slice(0, 12),
            allTopics,
            sectionType: guessSectionType(section.title ?? '', documentType),
          };
        },
      );

      const paragraphCount = sections.reduce(
        (sum, section) => sum + section.paragraphCount,
        0,
      );
      catalogDocuments.push({
        id: document.id,
        sourceId: document.sourceId ?? null,
        title: document.title ?? document.id,
        sourceName: source?.name ?? null,
        version: source?.version ?? null,
        role: source?.role ?? null,
        authority,
        documentType,
        species: docSpecies,
        stages,
        sectionCount: sections.length,
        paragraphCount,
        sections,
      });
      for (const section of sections) {
        catalogSections.push({
          ...section,
          documentId: document.id,
          sourceId: document.sourceId ?? null,
          documentType,
          authority,
        });
      }
    }

    catalogDocuments.sort((a, b) => a.id.localeCompare(b.id));
    catalogSections.sort(
      (a, b) =>
        a.documentId.localeCompare(b.documentId) ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id),
    );
    return { documents: catalogDocuments, sections: catalogSections };
  }

  async buildCkd(): Promise<SectionCatalog> {
    return this.build(CKD_DOCUMENT_IDS);
  }
}

function guessDocumentSpecies(document: any): CatalogSpecies {
  const title = String(document.title ?? '').toLowerCase();
  const id = String(document.id ?? '').toLowerCase();
  if (
    id.includes('dog-treatment') ||
    id.includes('iris-dog') ||
    title.includes('dog-treatment') ||
    title.includes('dog treatment')
  ) {
    return 'dog';
  }
  return 'both';
}

function guessDocumentType(document: any, source: any): string {
  const id = String(document.id ?? '').toLowerCase();
  if (id.includes('staging')) return 'staging_guideline';
  if (id.includes('treatment')) return 'treatment_guideline';
  if (id.includes('pocket')) return 'quick_reference';
  if (String(document.sourceId ?? '').toUpperCase().startsWith('SACN')) {
    return 'textbook_chapter';
  }
  if (String(document.sourceId ?? '').toUpperCase().startsWith('AAHA')) {
    return 'guideline';
  }
  return source?.role ? 'reference' : 'document';
}

function guessAuthority(document: any, source: any): CatalogAuthority {
  const sourceId = String(document.sourceId ?? '').toUpperCase();
  if (sourceId.startsWith('IRIS') || sourceId.startsWith('AAHA')) {
    return 'guideline';
  }
  if (sourceId.startsWith('SACN') || sourceId.startsWith('NRC')) {
    return 'textbook';
  }
  return 'reference';
}

function guessSectionType(title: string, documentType: string): CatalogSectionType {
  const lower = title.toLowerCase();
  if (/appendix|footnote|disclaimer/.test(lower)) return 'appendix';
  if (documentType === 'treatment_guideline') return 'treatment';
  if (documentType === 'staging_guideline') return 'staging';
  if (/staging|stage|substag/.test(lower)) return 'staging';
  if (/treatment|management|recommend/.test(lower)) return 'treatment';
  if (/diagnos/.test(lower)) return 'diagnosis';
  if (/nutrition|diet|feeding/.test(lower)) return 'nutrition';
  if (/introduction|overview/.test(lower)) return 'introduction';
  return 'other';
}

function detectSpecies(text: string, fallback: CatalogSpecies): CatalogSpecies {
  const lower = text.toLowerCase();
  const dog = /\b(dog|dogs|canine)\b/.test(lower) || text.includes('犬');
  const cat = /\b(cat|cats|feline)\b/.test(lower) || text.includes('猫');
  if (dog && cat) return 'both';
  if (dog) return 'dog';
  if (cat) return 'cat';
  return fallback;
}

function detectStages(text: string): number[] {
  const stages = new Set<number>();
  for (const match of text.matchAll(/\bstage\s*([1-4])\b/gi)) {
    stages.add(Number(match[1]));
  }
  for (const match of text.matchAll(/([1-4])\s*期/g)) {
    stages.add(Number(match[1]));
  }
  return [...stages].sort();
}

function detectTopics(text: string, fallback: string[] = [], limit = 12): string[] {
  const lower = text.toLowerCase();
  const counts = new Map<string, number>();
  for (const [topic, aliases] of Object.entries(TOPIC_ALIASES)) {
    let count = 0;
    for (const alias of aliases) {
      if (!alias) continue;
      let index = lower.indexOf(alias.toLowerCase());
      while (index >= 0) {
        count += 1;
        index = lower.indexOf(alias.toLowerCase(), index + alias.length);
      }
    }
    if (count > 0) counts.set(topic, count);
  }
  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([topic]) => topic);
  return topics.length > 0 ? topics : fallback;
}
