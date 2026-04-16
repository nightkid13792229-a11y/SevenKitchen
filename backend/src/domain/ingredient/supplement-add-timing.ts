export type SupplementAddTiming = 'BEFORE_MIXING' | 'BEFORE_MEAL';

const SUPPLEMENT_ADD_TIMING_LABELS: Record<SupplementAddTiming, string> = {
  BEFORE_MIXING: '制作中',
  BEFORE_MEAL: '随餐',
};

export function resolveSupplementAddTimingLabel(
  addTiming?: string | null,
): string | undefined {
  if (!addTiming) {
    return undefined;
  }

  return SUPPLEMENT_ADD_TIMING_LABELS[addTiming as SupplementAddTiming];
}
