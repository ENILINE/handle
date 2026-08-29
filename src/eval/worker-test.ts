import { EvalWorkerEngine } from './worker'
import type { EvalWorkerRequest, EvalWorkerResponse } from './worker'

/** Browser-free worker adapter used by state integration tests. */
export class InlineEvaluationWorker {
  onmessage: ((event: MessageEvent<EvalWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  private readonly engine = new EvalWorkerEngine()
  private readonly requests: EvalWorkerRequest[] = []
  private scheduled = false
  private terminated = false

  postMessage(request: EvalWorkerRequest): void {
    if (this.terminated)
      return
    this.requests.push(request)
    this.schedule()
  }

  terminate(): void {
    this.terminated = true
    this.requests.length = 0
  }

  private schedule(): void {
    if (this.scheduled || this.terminated)
      return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      const request = this.requests.shift()
      if (!request || this.terminated)
        return
      try {
        this.engine.handle(request, (response) => {
          if (!this.terminated)
            this.onmessage?.({ data: response } as MessageEvent<EvalWorkerResponse>)
        })
      }
      catch (error) {
        this.onerror?.({
          message: error instanceof Error ? error.message : String(error),
        } as ErrorEvent)
      }
      this.schedule()
    })
  }
}

export function createInlineEvaluationWorker(): Worker {
  return new InlineEvaluationWorker() as unknown as Worker
}
