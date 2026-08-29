let testFactory: (() => Worker) | undefined

export function setEvaluationWorkerFactoryForTests(factory?: () => Worker): void {
  testFactory = factory
}

export function createEvaluationWorker(): Worker {
  if (testFactory)
    return testFactory()
  return new Worker(new URL('./eval.worker.ts', import.meta.url), { type: 'module' })
}
