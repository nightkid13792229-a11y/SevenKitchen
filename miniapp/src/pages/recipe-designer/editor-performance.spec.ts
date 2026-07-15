import { describe, expect, it, vi } from 'vitest'
import {
  createKeyedSerialMutationQueue,
  createLatestTaskScheduler,
  createLatestRevisionTracker,
  moveItemToIndex,
  shouldTriggerDragFeedback,
} from './editor-performance'

describe('createKeyedSerialMutationQueue', () => {
  it('serializes same-key writes in client order while retaining the latest mutation version', async () => {
    let rejectFirst!: (error: Error) => void
    let signalFirstStarted!: () => void
    const calls: string[] = []
    const queue = createKeyedSerialMutationQueue()
    const firstVersion = queue.begin('item-1')
    let displayedWeight = 10
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve
    })
    const firstSave = queue.enqueue('item-1', () => new Promise<void>((_resolve, reject) => {
      calls.push('A')
      signalFirstStarted()
      rejectFirst = reject
    })).catch(() => {
      if (queue.isCurrent('item-1', firstVersion)) displayedWeight = 5
    })

    await firstStarted

    const secondVersion = queue.begin('item-1')
    displayedWeight = 20
    const secondSave = queue.enqueue('item-1', async () => {
      calls.push('B')
    })

    expect(calls).toEqual(['A'])
    rejectFirst(new Error('A failed'))
    await Promise.all([firstSave, secondSave])

    expect(calls).toEqual(['A', 'B'])
    expect(queue.isCurrent('item-1', firstVersion)).toBe(false)
    expect(queue.isCurrent('item-1', secondVersion)).toBe(true)
    expect(displayedWeight).toBe(20)
  })
})

describe('createLatestRevisionTracker', () => {
  it('ignores stale responses and remains updating until the newest revision completes', () => {
    const tracker = createLatestRevisionTracker()
    const firstRevision = tracker.begin()
    let appliedAssessment = ''
    const secondRevision = tracker.begin()

    if (tracker.isCurrent(firstRevision)) appliedAssessment = 'stale'
    expect(tracker.complete(firstRevision)).toBe(false)
    expect(tracker.isUpdating()).toBe(true)

    if (tracker.isCurrent(secondRevision)) appliedAssessment = 'latest'
    expect(tracker.complete(secondRevision)).toBe(true)

    expect(appliedAssessment).toBe('latest')
    expect(tracker.isUpdating()).toBe(false)
  })
})

describe('createLatestTaskScheduler', () => {
  it('runs only the latest value scheduled before the delay expires', async () => {
    vi.useFakeTimers()
    const received: number[] = []
    const scheduler = createLatestTaskScheduler((value: number) => {
      received.push(value)
    }, 100)

    scheduler.schedule(1)
    scheduler.schedule(2)
    scheduler.schedule(3)
    await vi.advanceTimersByTimeAsync(100)

    expect(received).toEqual([3])
    vi.useRealTimers()
  })

  it('flushes the pending latest task immediately and waits for it to finish', async () => {
    let resolveTask!: () => void
    const received: string[] = []
    const scheduler = createLatestTaskScheduler((value: string) => new Promise<void>((resolve) => {
      received.push(value)
      resolveTask = resolve
    }), 100)

    scheduler.schedule('older')
    scheduler.schedule('latest')
    const flushed = scheduler.flush()

    expect(received).toEqual(['latest'])
    let completed = false
    void flushed.then(() => {
      completed = true
    })
    await Promise.resolve()
    expect(completed).toBe(false)

    resolveTask()
    await flushed
    expect(completed).toBe(true)
  })

  it('runs the latest later value after an in-flight task without running tasks in parallel', async () => {
    vi.useFakeTimers()
    const received: number[] = []
    let concurrentTasks = 0
    let maxConcurrentTasks = 0
    let resolveFirstTask!: () => void
    const scheduler = createLatestTaskScheduler((value: number) => new Promise<void>((resolve) => {
      received.push(value)
      concurrentTasks += 1
      maxConcurrentTasks = Math.max(maxConcurrentTasks, concurrentTasks)
      if (value === 1) {
        resolveFirstTask = () => {
          concurrentTasks -= 1
          resolve()
        }
      } else {
        concurrentTasks -= 1
        resolve()
      }
    }), 100)

    scheduler.schedule(1)
    await vi.advanceTimersByTimeAsync(100)
    scheduler.schedule(2)
    scheduler.schedule(3)
    await vi.advanceTimersByTimeAsync(100)

    expect(received).toEqual([1])
    expect(maxConcurrentTasks).toBe(1)

    resolveFirstTask()
    await vi.runAllTimersAsync()

    expect(received).toEqual([1, 3])
    expect(maxConcurrentTasks).toBe(1)
    vi.useRealTimers()
  })

  it('cancels a pending task', async () => {
    vi.useFakeTimers()
    const received: number[] = []
    const scheduler = createLatestTaskScheduler((value: number) => {
      received.push(value)
    }, 100)

    scheduler.schedule(1)
    scheduler.cancel()
    await vi.runAllTimersAsync()

    expect(received).toEqual([])
    vi.useRealTimers()
  })

  it('rejects flush when the latest task fails and remains usable for a later success', async () => {
    const received: string[] = []
    const scheduler = createLatestTaskScheduler(async (value: string) => {
      if (value === 'fail') throw new Error('assessment failed')
      received.push(value)
    }, 100)

    scheduler.schedule('fail')
    await expect(scheduler.flush()).rejects.toThrow('assessment failed')

    scheduler.schedule('success')
    await scheduler.flush()

    expect(received).toEqual(['success'])
  })
})

describe('moveItemToIndex', () => {
  const items = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
  ]

  it('moves an item into the requested index without modifying item values', () => {
    const moved = moveItemToIndex(items, 'a', 2)

    expect(moved).toEqual([
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
      { id: 'a', label: 'A' },
    ])
    expect(moved).not.toBe(items)
    expect(moved[2]).toBe(items[0])
  })

  it.each([
    ['unknown item', 'missing', 1],
    ['negative index', 'a', -1],
    ['index after the end', 'a', 3],
  ])('leaves order unchanged for %s', (_caseName, itemId, targetIndex) => {
    expect(moveItemToIndex(items, itemId, targetIndex)).toEqual(items)
  })
})

describe('shouldTriggerDragFeedback', () => {
  it('returns true only when the feedback interval has elapsed', () => {
    expect(shouldTriggerDragFeedback(100, 179)).toBe(false)
    expect(shouldTriggerDragFeedback(100, 180)).toBe(true)
    expect(shouldTriggerDragFeedback(100, 181)).toBe(true)
  })

  it('uses an 80ms default interval and accepts an override', () => {
    expect(shouldTriggerDragFeedback(0, 79)).toBe(false)
    expect(shouldTriggerDragFeedback(0, 80)).toBe(true)
    expect(shouldTriggerDragFeedback(0, 20, 20)).toBe(true)
  })
})
