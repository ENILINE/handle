/// <reference lib="webworker" />

import { EvalWorkerEngine } from './worker'
import type { EvalWorkerRequest, EvalWorkerResponse } from './worker'

const engine = new EvalWorkerEngine()

self.onmessage = (event: MessageEvent<EvalWorkerRequest>) => {
  engine.handle(event.data, (response: EvalWorkerResponse) => self.postMessage(response))
}
