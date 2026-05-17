import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
  getBreedHealthAttentionLabel,
} from 'src/domain/dog/breed-health-risk.entity';

describe('breed health risk domain contracts', () => {
  it('maps editorial attention priorities to user-facing labels', () => {
    expect(getBreedHealthAttentionLabel(BreedHealthAttentionPriority.KEY_ATTENTION)).toBe('重点关注');
    expect(getBreedHealthAttentionLabel(BreedHealthAttentionPriority.RECOMMENDED_AWARENESS)).toBe('建议了解');
    expect(getBreedHealthAttentionLabel(BreedHealthAttentionPriority.SUPPLEMENTAL_AWARENESS)).toBe('补充了解');
  });

  it('keeps source types explicit for visible evidence rows', () => {
    expect(BreedHealthRiskSourceType.CIDD).toBe('CIDD');
    expect(BreedHealthRiskSourceType.OFA_CHIC).toBe('OFA_CHIC');
    expect(BreedHealthRiskSourceType.OMIA).toBe('OMIA');
    expect(BreedHealthRiskSourceType.WSAVA).toBe('WSAVA');
  });
});
