export interface LatestTaskScheduler<T> {
  schedule(value: T): void
  flush(): Promise<void>
  cancel(): void
}

export interface KeyedSerialMutationQueue {
  begin(key: string): number
  enqueue<T>(key: string, task: () => Promise<T> | T): Promise<T>
  isCurrent(key: string, version: number): boolean
}

export function createKeyedSerialMutationQueue(): KeyedSerialMutationQueue {
  const tails = new Map<string, Promise<void>>()
  const versions = new Map<string, number>()

  return {
    begin(key) {
      const version = (versions.get(key) || 0) + 1
      versions.set(key, version)
      return version
    },

    enqueue<T>(key: string, task: () => Promise<T> | T): Promise<T> {
      const previous = tails.get(key) || Promise.resolve()
      const next = previous.catch(() => undefined).then(task)
      const tail = next.then(
        () => undefined,
        () => undefined,
      )
      tails.set(key, tail)
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key)
      })
      return next
    },

    isCurrent(key, version) {
      return versions.get(key) === version
    },
  }
}

export interface KeyedWeightMutationCoordinator {
  begin(key: string, initialPersistedWeightG: number): number
  enqueue<T>(key: string, weightG: number, task: () => Promise<T> | T): Promise<{ result: T; persistedBeforeWeightG: number }>
  clear(): void
  getPersisted(key: string): number | undefined
  setPersisted(key: string, weightG: number): void
  isCurrent(key: string, version: number): boolean
}

export function createKeyedWeightMutationCoordinator(): KeyedWeightMutationCoordinator {
  const queue = createKeyedSerialMutationQueue()
  const persistedWeightGByKey = new Map<string, number>()

  return {
    begin(key, initialPersistedWeightG) {
      if (!persistedWeightGByKey.has(key)) {
        persistedWeightGByKey.set(key, initialPersistedWeightG)
      }
      return queue.begin(key)
    },

    async enqueue<T>(key: string, weightG: number, task: () => Promise<T> | T) {
      let persistedBeforeWeightG = persistedWeightGByKey.get(key) ?? 0
      const result = await queue.enqueue(key, async () => {
        persistedBeforeWeightG = persistedWeightGByKey.get(key) ?? 0
        const taskResult = await task()
        persistedWeightGByKey.set(key, weightG)
        return taskResult
      })
      return { result, persistedBeforeWeightG }
    },

    getPersisted(key) {
      return persistedWeightGByKey.get(key)
    },

    clear() {
      persistedWeightGByKey.clear()
    },

    setPersisted(key, weightG) {
      persistedWeightGByKey.set(key, weightG)
    },

    isCurrent(key, version) {
      return queue.isCurrent(key, version)
    },
  }
}

export interface LatestRevisionTracker {
  begin(): number
  complete(revision: number): boolean
  isCurrent(revision: number): boolean
  isUpdating(): boolean
}

export function createLatestRevisionTracker(): LatestRevisionTracker {
  let latestRevision = 0
  let updating = false

  return {
    begin() {
      latestRevision += 1
      updating = true
      return latestRevision
    },

    complete(revision) {
      if (revision !== latestRevision) return false
      updating = false
      return true
    },

    isCurrent(revision) {
      return revision === latestRevision
    },

    isUpdating() {
      return updating
    },
  }
}

export interface AssessmentMutationRequest {
  assessmentRevision: number
  mutationGeneration: number
}

export interface AssessmentMutationGuard {
  beginAssessment(): AssessmentMutationRequest
  beginMutation(): number
  complete(request: AssessmentMutationRequest): boolean
  isCurrent(request: AssessmentMutationRequest): boolean
  isUpdating(): boolean
}

export function createAssessmentMutationGuard(): AssessmentMutationGuard {
  const assessmentRevisions = createLatestRevisionTracker()
  let mutationGeneration = 0

  return {
    beginAssessment() {
      return {
        assessmentRevision: assessmentRevisions.begin(),
        mutationGeneration,
      }
    },

    beginMutation() {
      mutationGeneration += 1
      return mutationGeneration
    },

    complete(request) {
      return assessmentRevisions.complete(request.assessmentRevision)
    },

    isCurrent(request) {
      return (
        request.mutationGeneration === mutationGeneration &&
        assessmentRevisions.isCurrent(request.assessmentRevision)
      )
    },

    isUpdating() {
      return assessmentRevisions.isUpdating()
    },
  }
}

export function createLatestTaskScheduler<T>(
  task: (value: T) => Promise<void> | void,
  delayMs: number,
): LatestTaskScheduler<T> {
  let hasPendingValue = false
  let latestValue!: T
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | undefined
  const idleWaiters: Array<{ resolve: () => void; reject: (reason?: unknown) => void }> = []

  const resolveWhenIdle = () => {
    if (hasPendingValue || timer || inFlight) return
    idleWaiters.splice(0).forEach(({ resolve }) => resolve())
  }

  const rejectIdleWaiters = (error: unknown) => {
    idleWaiters.splice(0).forEach(({ reject }) => reject(error))
  }

  const runPendingTask = () => {
    if (inFlight || !hasPendingValue) return

    const value = latestValue
    hasPendingValue = false

    let result: Promise<void> | void
    try {
      result = task(value)
    } catch (error) {
      result = Promise.reject(error)
    }

    const currentTask = Promise.resolve(result)
    inFlight = currentTask
    void currentTask.then(
      () => {
        if (inFlight !== currentTask) return
        inFlight = undefined

        if (hasPendingValue && !timer) {
          runPendingTask()
        } else {
          resolveWhenIdle()
        }
      },
      (error) => {
        if (inFlight !== currentTask) return
        inFlight = undefined
        rejectIdleWaiters(error)

        if (hasPendingValue && !timer) {
          runPendingTask()
        }
      },
    )
  }

  const scheduleTimer = () => {
    timer = setTimeout(() => {
      timer = undefined
      runPendingTask()
    }, delayMs)
  }

  return {
    schedule(value) {
      latestValue = value
      hasPendingValue = true
      if (timer) clearTimeout(timer)
      scheduleTimer()
    },

    flush() {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }

      if (hasPendingValue && !inFlight) {
        runPendingTask()
      }

      if (!hasPendingValue && !inFlight) return Promise.resolve()
      return new Promise((resolve, reject) => {
        idleWaiters.push({ resolve, reject })
      })
    },

    cancel() {
      hasPendingValue = false
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      resolveWhenIdle()
    },
  }
}

export function moveItemToIndex<T extends { id: string }>(items: T[], itemId: string, targetIndex: number): T[] {
  const currentIndex = items.findIndex((item) => item.id === itemId)
  if (currentIndex < 0 || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= items.length) {
    return [...items]
  }

  const movedItems = [...items]
  const [item] = movedItems.splice(currentIndex, 1)
  movedItems.splice(targetIndex, 0, item)
  return movedItems
}

export function shouldTriggerDragFeedback(
  lastFeedbackAt: number,
  now: number,
  minimumIntervalMs = 80,
): boolean {
  return now - lastFeedbackAt >= minimumIntervalMs
}
