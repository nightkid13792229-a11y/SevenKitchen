export interface DogProfileAnalyticsSummary {
  createFunnel: {
    started: number
    basicCompleted: number
    recommendationSucceeded: number
    submitted: number
  }
  editFunnel: {
    moduleOpened: number
    calcSucceeded: number
    saved: number
  }
  riskSignals: {
    draftRestored: number
    calcFailed: number
    submitFailed: number
    healthSkipped: number
  }
}
