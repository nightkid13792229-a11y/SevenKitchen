export interface LatestTaskScheduler<T> {
  schedule(value: T): void
  flush(): Promise<void>
  cancel(): void
}

export function createLatestTaskScheduler<T>(
  task: (value: T) => Promise<void> | void,
  delayMs: number,
): LatestTaskScheduler<T> {
  let hasPendingValue = false
  let latestValue!: T
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | undefined
  const idleResolvers: Array<() => void> = []

  const resolveWhenIdle = () => {
    if (hasPendingValue || timer || inFlight) return
    idleResolvers.splice(0).forEach((resolve) => resolve())
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
    void currentTask.catch(() => undefined).then(() => {
      if (inFlight !== currentTask) return
      inFlight = undefined

      if (hasPendingValue && !timer) {
        runPendingTask()
      } else {
        resolveWhenIdle()
      }
    })
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
      return new Promise((resolve) => {
        idleResolvers.push(resolve)
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
