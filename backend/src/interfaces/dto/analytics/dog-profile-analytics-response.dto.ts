export interface DogProfileAnalyticsSummaryDto {
  createFunnel: {
    started: number;
    basicCompleted: number;
    recommendationSucceeded: number;
    submitted: number;
  };
  editFunnel: {
    moduleOpened: number;
    calcSucceeded: number;
    saved: number;
  };
  riskSignals: {
    draftRestored: number;
    calcFailed: number;
    submitFailed: number;
    healthSkipped: number;
  };
  /**
   * 体况确认率（阶段 C10）。
   *
   * 整库快照，不是区间事件计数：分母是全部档案，分子是顾客亲自确认过的。
   * 背景 —— 阶段 C 上线前，生产库 99.98% 的狗从未确认过体况分，
   * 而新算法里体况分第一次真正参与能量计算。
   */
  bcsConfirmation: {
    totalDogs: number;
    confirmedDogs: number;
    confirmedInRange: number;
    rate: number;
  };
}
