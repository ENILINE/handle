/// <reference lib="webworker" />

import { EvalWorkerEngine } from './eval-worker'
import type { EvalWorkerRequest, EvalWorkerResponse } from './eval-worker'

const engine = new EvalWorkerEngine()

self.onmessage = (event: MessageEvent<EvalWorkerRequest>) => {
  engine.handle(event.data, (response: EvalWorkerResponse) => self.postMessage(response))
}
