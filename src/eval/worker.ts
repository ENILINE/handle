import type { MatchResult, ParsedChar, Rating } from '../logic/types'
import {
  advancePreparedEvaluation,
  createEvalState,
  getEvalDiagnosticSnapshot,
  prepareEvaluation,
} from './index'
import type {
  EvalAnalysis,
  EvalDiagnosticSnapshot,
  EvalResult,
  EvalState,
  PreparedEvaluation,
} from './index'

export interface EvalWorkerGuess {
  index: number
  word: string
  parsed: ParsedChar[]
  feedback: MatchResult[]
}

export interface EvalSessionSnapshot {
  historyLength: number
  visibleHistoryLength: number
  information: EvalState['information']
  valid: boolean
  diagnostics: EvalDiagnosticSnapshot | null
}

export interface EvalDebugTraceEntry {
  guess: number
  word: string
  before: EvalDiagnosticSnapshot
  after: EvalDiagnosticSnapshot
  initialRetained: number
  finalRetained: number
  toneRetained: number
  ifRetained: number
  ifPyRetained: number
  elapsedMs: number
  analysis?: EvalAnalysis
  result?: EvalResult
  rating?: Rating
  cumulativeI1: number
  cumulativeI2: number
  missingI1: number
  missingI2: number
  preparationMs: number
  playerMs: number
  readyBeforeSubmit: boolean
  queueWaitMs: number
}

export type EvalWorkerRequest =
  | {
      type: 'init'
      sessionId: number
      guesses: EvalWorkerGuess[]
      ratingsCurrent: boolean
      includeDebug: boolean
      prepareNext?: boolean
    }
  | {
      type: 'append'
      sessionId: number
      guess: EvalWorkerGuess
      readyWhenSubmitted: boolean
      submittedAt: number
    }

export type EvalWorkerResponse =
  | {
      type: 'guess'
      sessionId: number
      index: number
      word: string
      applyRating: boolean
      rating: Rating | null
      result: EvalResult | null
      trace?: EvalDebugTraceEntry
      snapshot: EvalSessionSnapshot
    }
  | {
      type: 'ready'
      sessionId: number
      index: number
      preparationMs: number
      generationMs: number
      rankingMs: number
      snapshot: EvalSessionSnapshot
    }
  | {
      type: 'error'
      sessionId: number
      message: string
    }

function snapshot(state: EvalState, includeDiagnostics: boolean): EvalSessionSnapshot {
  return {
    historyLength: state.history.length,
    visibleHistoryLength: state.visibleHistory.length,
    information: { ...state.information },
    valid: state.valid,
    diagnostics: includeDiagnostics ? getEvalDiagnosticSnapshot(state) : null,
  }
}

function createTrace(
  state: EvalState,
  guess: EvalWorkerGuess,
  before: EvalDiagnosticSnapshot | null,
  analysis: EvalAnalysis,
  result: EvalResult | null,
  rating: Rating | null,
  startedAt: number,
  readyBeforeSubmit: boolean,
  queueWaitMs: number,
): EvalDebugTraceEntry | undefined {
  const after = getEvalDiagnosticSnapshot(state)
  if (!before || !after)
    return undefined
  const retained = (next: number, previous: number) => previous ? next / previous : 0
  return {
    guess: guess.index + 1,
    word: guess.word,
    before,
    after,
    initialRetained: retained(after.initialRows, before.initialRows),
    finalRetained: retained(after.finalRows, before.finalRows),
    toneRetained: retained(after.toneRows, before.toneRows),
    ifRetained: retained(after.ifRows, before.ifRows),
    ifPyRetained: retained(after.ifPyRows, before.ifPyRows),
    elapsedMs: performance.now() - startedAt,
    analysis,
    result: result || undefined,
    rating: rating || undefined,
    cumulativeI1: state.information.i1,
    cumulativeI2: state.information.i2,
    missingI1: state.information.missingI1,
    missingI2: state.information.missingI2,
    preparationMs: result?.preparationMs ?? analysis.generationMs,
    playerMs: result?.playerMs ?? analysis.elapsedMs,
    readyBeforeSubmit,
    queueWaitMs,
  }
}

/** Stateful core shared by the real worker and deterministic tests. */
export class EvalWorkerEngine {
  private state = createEvalState({ diagnostics: true })
  private prepared: PreparedEvaluation | undefined
  private sessionId = 0
  private includeDebug = false

  handle(request: EvalWorkerRequest, emit: (response: EvalWorkerResponse) => void): void {
    try {
      if (request.type === 'init')
        this.initialize(request, emit)
      else
        this.append(request, emit)
    }
    catch (error) {
      emit({
        type: 'error',
        sessionId: request.sessionId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private initialize(
    request: Extract<EvalWorkerRequest, { type: 'init' }>,
    emit: (response: EvalWorkerResponse) => void,
  ): void {
    this.sessionId = request.sessionId
    this.includeDebug = request.includeDebug
    this.state = createEvalState({ diagnostics: true })
    this.prepared = undefined

    for (const guess of request.guesses) {
      if (guess.index !== this.state.history.length)
        throw new Error(`Evaluation replay index mismatch: ${guess.index}`)
      const startedAt = performance.now()
      const before = this.includeDebug ? getEvalDiagnosticSnapshot(this.state) : null
      const prepared = prepareEvaluation(this.state, {
        rank: !request.ratingsCurrent,
        includeDebug: this.includeDebug && guess.index === request.guesses.length - 1,
      })
      const advanced = advancePreparedEvaluation(
        this.state,
        prepared,
        guess.parsed,
        guess.feedback,
        { rank: !request.ratingsCurrent },
      )
      const rating = advanced.valid ? advanced.rating : null
      emit({
        type: 'guess',
        sessionId: request.sessionId,
        index: guess.index,
        word: guess.word,
        applyRating: !request.ratingsCurrent,
        rating,
        result: advanced.result,
        trace: this.includeDebug
          ? createTrace(this.state, guess, before, advanced.analysis, advanced.result, rating, startedAt, false, 0)
          : undefined,
        snapshot: snapshot(this.state, this.includeDebug),
      })
    }
    if (request.prepareNext !== false) {
      this.prepareNext(emit)
    }
    else {
      emit({
        type: 'ready',
        sessionId: this.sessionId,
        index: this.state.history.length,
        preparationMs: 0,
        generationMs: 0,
        rankingMs: 0,
        snapshot: snapshot(this.state, this.includeDebug),
      })
    }
  }

  private append(
    request: Extract<EvalWorkerRequest, { type: 'append' }>,
    emit: (response: EvalWorkerResponse) => void,
  ): void {
    if (request.sessionId !== this.sessionId)
      return
    if (request.guess.index !== this.state.history.length)
      throw new Error(`Evaluation append index mismatch: ${request.guess.index}`)
    const startedAt = performance.now()
    const before = this.includeDebug ? getEvalDiagnosticSnapshot(this.state) : null
    const prepared = this.prepared || prepareEvaluation(this.state, {
      includeDebug: this.includeDebug,
    })
    this.prepared = undefined
    const advanced = advancePreparedEvaluation(
      this.state,
      prepared,
      request.guess.parsed,
      request.guess.feedback,
    )
    const rating = advanced.valid ? advanced.rating : null
    const queueWaitMs = Math.max(0, Date.now() - request.submittedAt)
    if (advanced.result) {
      advanced.result.readyBeforeSubmit = request.readyWhenSubmitted
      advanced.result.queueWaitMs = queueWaitMs
    }
    emit({
      type: 'guess',
      sessionId: request.sessionId,
      index: request.guess.index,
      word: request.guess.word,
      applyRating: true,
      rating,
      result: advanced.result,
      trace: this.includeDebug
        ? createTrace(
            this.state,
            request.guess,
            before,
            advanced.analysis,
            advanced.result,
            rating,
            startedAt,
            request.readyWhenSubmitted,
            queueWaitMs,
          )
        : undefined,
      snapshot: snapshot(this.state, this.includeDebug),
    })
    this.prepareNext(emit)
  }

  private prepareNext(emit: (response: EvalWorkerResponse) => void): void {
    this.prepared = prepareEvaluation(this.state, { includeDebug: this.includeDebug })
    emit({
      type: 'ready',
      sessionId: this.sessionId,
      index: this.state.history.length,
      preparationMs: this.prepared.preparationMs,
      generationMs: this.prepared.generationMs,
      rankingMs: this.prepared.benchmarks?.rankingMs || 0,
      snapshot: snapshot(this.state, this.includeDebug),
    })
  }
}
