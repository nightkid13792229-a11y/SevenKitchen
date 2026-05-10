import { Injectable } from '@nestjs/common';
import type { LabelExtractionResult } from '../../domain/nutrition-governance/nutrition-governance.types';

export const LABEL_RECOGNITION_PROVIDER = Symbol('LABEL_RECOGNITION_PROVIDER');

export interface LabelRecognitionProvider {
  extractFromImage(input: {
    imageUrl: string;
    ingredientName: string;
  }): Promise<LabelExtractionResult>;
}

@Injectable()
export class DisabledLabelRecognitionProvider
  implements LabelRecognitionProvider
{
  async extractFromImage(_input: {
    imageUrl: string;
    ingredientName: string;
  }): Promise<LabelExtractionResult> {
    return {
      ocrText: '',
      extractedItems: [],
      missingFields: ['ocrProvider'],
      normalizedNutrition: null,
    };
  }
}
