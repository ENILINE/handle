<script setup lang="ts">
import { filterNonChineseChars, toSimplified } from '@hankit/tools'
import { activeGameMode, answer, customOrigin, dayNo, evalDebugTrace, evaluationEnabled, hint, idiomSearchWord, isDev, isFailed, isFinished, lastEvalDebug, newRandomGame, parseWord, parsedTries, playMode, resetCustomGame, showCheatSheet, showCustomAnswer, showCustomShare, showFailed, showGiveUp, showHelp, showHint, showIdiomExplanation, triesRatings } from '~/state'
import { gameMode, markStart, meta, tries, useNoHint } from '~/storage'
import { t } from '~/i18n'
import { TRIES_LIMIT, WORD_LENGTH, checkHardMode, checkValidIdiom } from '~/logic'

const el = ref<HTMLInputElement>()
const input = ref('')
const inputValue = ref('')
const showToast = autoResetRef(false, 1000)
const shake = autoResetRef(false, 500)

const toastKey = ref<'invalid-idiom' | 'hard-mode-violation' | 'duplicate-guess'>('invalid-idiom')
const isFinishedDelay = debouncedRef(isFinished, 800)

const hintHidden = computed(() => {
  if (playMode.value === 'custom') {
    if (customOrigin.value === 'own') return true
    if (customOrigin.value === 'shared' && !hint.value) return true
  }
  return false
})

const canGiveUp = computed(() => activeGameMode.value === 'strict'
  && !(playMode.value === 'custom' && customOrigin.value === 'own'))

function enter() {
  if (input.value.length !== WORD_LENGTH)
    return

  if (gameMode.value !== 'unlimited' && !checkValidIdiom(input.value)) {
    toastKey.value = 'invalid-idiom'
    showToast.value = true
    shake.value = true
    return
  }

  if (gameMode.value !== 'unlimited') {
    const simplifiedInput = toSimplified(input.value)
    if (tries.value.some(t => toSimplified(t) === simplifiedInput)) {
      toastKey.value = 'duplicate-guess'
      showToast.value = true
      shake.value = true
      return
    }
  }

  if (meta.value.strict == null)
    meta.value.strict = gameMode.value

  if (gameMode.value === 'strict' && parsedTries.value.length > 0) {
    const inputParsed = parseWord(input.value)
    if (!checkHardMode(inputParsed, parsedTries.value)) {
      toastKey.value = 'hard-mode-violation'
      showToast.value = true
      shake.value = true
      return
    }
  }

  tries.value.push(input.value)
  input.value = ''
  inputValue.value = ''
}
function reset() {
  tries.value = []
  meta.value = {}
  input.value = ''
  inputValue.value = ''
}
function handleInput(e: Event) {
  const el = (e.target! as HTMLInputElement)
  input.value = filterNonChineseChars(el.value).slice(0, 4)
  markStart()
}
function focus() {
  el.value?.focus()
}
function hintFn() {
  meta.value.hint = true
  if (!meta.value.hintLevel)
    meta.value.hintLevel = 1
  showHint.value = true
}
function sheet() {
  showCheatSheet.value = !showCheatSheet.value
}

watchEffect(() => {
  if (!showHelp.value)
    focus()
})

watchEffect(() => {
  if (isFailed.value && !meta.value.failed) {
    meta.value.failed = true
    setTimeout(() => {
      showFailed.value = true
    }, 1200)
  }
})
</script>

<template>
  <div>
    <div flex="~ col" pt4 items-center>
      <WordBlocks
        v-for="w, i of tries"
        :key="playMode + '-' + i"
        :word="w"
        :revealed="true"
        :rating="evaluationEnabled ? triesRatings[i] : null"
        @click="focus()"
      />

      <template v-if="meta.answer">
        <div my4>
          <div font-serif p2>
            {{ t('correct-answer') }}
          </div>
          <WordBlocks :word="answer.word" />
        </div>
      </template>

      <WordBlocks
        v-if="!isFinished"
        :class="{ shake }"
        :word="input"
        :active="true"
        @click="focus()"
      />

      <div mt-1 />

      <Transition name="fade-out">
        <div v-if="!isFinished" flex="~ col gap-2" items-center>
          <div relative border="2 base rounded-0">
            <input
              ref="el"
              v-model="inputValue"
              bg-transparent w-86 p3 outline-none text-center
              type="text"
              autocomplete="off"
              :placeholder="t('input-placeholder')"
              :disabled="isFinished"
              :class="{ shake }"
              @input="handleInput"
              @keydown.enter="enter"
            >
            <div
              absolute top-0 left-0 right-0 bottom-0
              flex="~ center" bg-base
              transition-all duration-300 text-mis
              pointer-events-none
              :class="showToast ? '' : 'op0 translate-y--1'"
            >
              <span tracking-1 pl1>
                {{ t(toastKey) }}
              </span>
            </div>
          </div>
          <button
            mt3
            btn p="x6 y2"
            :disabled="input.length !== WORD_LENGTH"
            @click="enter"
          >
            {{ t('ok-spaced') }}
          </button>
          <div v-if="tries.length > 4 && !isFailed" op50>
            {{ t('tries-rest', TRIES_LIMIT - tries.length) }}
          </div>
          <button v-if="isFailed" square-btn @click="showFailed = true">
            <div i-mdi-emoticon-devil-outline /> {{ t('view-answer') }}
          </button>

          <div flex="~ center" mt4 :class="isFinished ? 'op0! pointer-events-none' : ''">
            <button v-if="!useNoHint && !hintHidden" mx2 icon-btn text-base pb2 gap-1 flex="~ center" @click="hintFn()">
              <div i-carbon-idea /> {{ t('hint') }}
            </button>
            <!-- Deliberately remains available after ten guesses: isFailed is
                 the existing soft limit and does not finish the game. -->
            <button v-if="canGiveUp" mx2 icon-btn text-base pb2 gap-1 flex="~ center" @click="showGiveUp = true">
              <div i-carbon-flag /> {{ t('give-up') }}
            </button>
            <button mx2 icon-btn text-base pb2 gap-1 flex="~ center" @click="sheet()">
              <div i-carbon-grid /> {{ t('cheatsheet') }}
            </button>
          </div>
        </div>
      </Transition>

      <!-- Custom mode own: always-visible buttons -->
      <div v-if="playMode === 'custom' && customOrigin === 'own'" mt4 flex="~ col" items-center gap-2>
        <div flex gap-2>
          <button
            btn flex="~ gap-1 center"
            @click="showCustomAnswer = true"
          >
            <div i-carbon-view /> {{ t('view-answer-custom') }}
          </button>
          <button
            btn flex="~ gap-1 center"
            @click="showCustomShare = true"
          >
            <div i-carbon-share /> {{ t('share-custom') }}
          </button>
        </div>
        <button btn flex="~ gap-1 center" @click="resetCustomGame()">
          <div i-ri-restart-line /> {{ t('recreate-custom') }}
        </button>
      </div>

      <Transition name="fade-in">
        <div v-if="isFinishedDelay && isFinished">
          <ResultFooter />
          <div flex justify-center mt2>
            <button btn flex="~ gap-1 center" @click="idiomSearchWord = answer.word; showIdiomExplanation = true">
              <div i-carbon-book /> {{ t('idiom-explanation') }}
            </button>
          </div>
          <div v-if="playMode === 'random'" flex justify-center mt2>
            <button btn flex="~ gap-1 center" @click="reset(); newRandomGame()">
              <div i-ri-shuffle-line /> {{ t('new-random-game') }}
            </button>
          </div>
          <div v-if="playMode === 'custom' && customOrigin === 'shared'" flex justify-center mt2>
            <button btn flex="~ gap-1 center" @click="resetCustomGame()">
              <div i-ri-restart-line /> {{ t('recreate-custom') }}
            </button>
          </div>
          <div v-if="playMode === 'random' || (playMode === 'custom' && customOrigin === 'shared')" flex="~ col" items-center mt4>
            <ShareButton m4 />
            <ToggleMask />
          </div>
          <Countdown />
        </div>
      </Transition>

      <template v-if="isDev">
        <div h-200 />
        <div op50 mb-2>
          测试用
        </div>
        <div>{{ answer.word }}</div>
        <div flex gap2>
          <a
            class="btn"
            :href="`/?dev=hey&d=${dayNo - 1}`"
          >
            上一天
          </a>
          <button
            class="btn"
            @click="reset"
          >
            重置
          </button>
          <a
            class="btn"
            :href="`/?dev=hey&d=${dayNo + 1}`"
          >
            下一天
          </a>
        </div>

        <!-- Eval debug -->
        <template v-if="evalDebugTrace.length">
          <div mt-6 mb-2 op50>联合后验与评价轨迹</div>
          <div w-full max-w-220 text-xs text-left flex="~ col gap-2">
            <div v-for="entry of evalDebugTrace" :key="`${entry.guess}-${entry.word}`" border="1 base rounded" p2>
              <b>#{{ entry.guess }} {{ entry.word }}</b>
              <div mt1 flex="~ wrap gap-x-3 gap-y-1">
                <span>猜后声母 {{ entry.after.initialRows }} 行 / {{ entry.after.initialUnique }} 种</span>
                <span>韵母 {{ entry.after.finalRows }} 行 / {{ entry.after.finalUnique }} 种</span>
                <span>声调 {{ entry.after.toneRows }} 行 / {{ entry.after.toneUnique }} 种</span>
                <span>IF {{ entry.after.ifRows }} / IF+PY {{ entry.after.ifPyRows }}</span>
                <span>不同全拼 {{ entry.after.ifPyUnique }} / 有效 {{ entry.after.ifPyEffective.toFixed(1) }}</span>
              </div>
              <div mt1 op60>
                保留 I/F/T/IF/IF+PY：
                {{ (entry.initialRetained * 100).toFixed(1) }}% /
                {{ (entry.finalRetained * 100).toFixed(1) }}% /
                {{ (entry.toneRetained * 100).toFixed(1) }}% /
                {{ (entry.ifRetained * 100).toFixed(1) }}% /
                {{ (entry.ifPyRetained * 100).toFixed(1) }}%
              </div>
              <template v-if="entry.analysis">
                <div mt1>
                  满足全部历史反馈：{{ entry.analysis.matchesHistory ? '是' : '否' }}；
                  猜中：{{ entry.analysis.won ? '是' : '否' }}；
                  特殊评级保底：{{ entry.analysis.specialRating ?? '无' }}
                </div>
                <div mt1>
                  猜前 N_I × N_F = {{ entry.analysis.initialUnique }} × {{ entry.analysis.finalUnique }}
                  = {{ entry.analysis.posteriorProduct }}；
                  {{ entry.analysis.model === 'endgame' ? '末盘完整加权后验' : 'V3 混合粒子' }}
                  / {{ entry.analysis.candidateCount }} 个候选
                </div>
                <div v-if="entry.analysis.search" mt1>
                  搜索 {{ entry.analysis.search.status }} /
                  {{ entry.analysis.search.nodes }} 节点 /
                  找到 {{ entry.analysis.search.candidatesFound }} 个候选 /
                  {{ entry.analysis.search.complete ? '完整结束' : '未完成，不使用部分候选' }}
                </div>
                <div v-if="entry.analysis.reason" mt1 text-red>{{ entry.analysis.reason }}</div>
                <div mt1>
                  猜前 J{{ entry.analysis.informationIsLowerBound ? '≥' : '=' }}{{ entry.analysis.informationBefore.toFixed(3) }}；
                  w={{ entry.analysis.toneWeight.toFixed(4) }}；
                  压缩系数 t={{ entry.analysis.compression.toFixed(4) }}
                </div>
                <div mt1 flex="~ wrap gap-x-3 gap-y-1">
                  <span>E1={{ entry.analysis.e1?.toFixed(3) ?? '无结果' }}</span>
                  <span>E2={{ entry.analysis.e2.toFixed(3) }}</span>
                  <span>E={{ entry.analysis.playerEI?.toFixed(3) ?? '无结果' }}</span>
                  <span>I1={{ entry.analysis.i1?.toFixed(3) ?? '未知' }}</span>
                  <span>I2={{ entry.analysis.i2?.toFixed(3) ?? '未知' }}</span>
                </div>
                <div mt1 op60>
                  累计 I1{{ entry.missingI1 ? '≥' : '=' }}{{ entry.cumulativeI1.toFixed(3) }}；
                  I2{{ entry.missingI2 ? '≥' : '=' }}{{ entry.cumulativeI2.toFixed(3) }}；
                  I{{ entry.missingI1 || entry.missingI2 ? '≥' : '=' }}{{ (entry.cumulativeI1 + entry.cumulativeI2).toFixed(3) }}
                  <span v-if="entry.missingI1 || entry.missingI2">（下界，缺失 {{ entry.missingI1 }} 次 I1 / {{ entry.missingI2 }} 次 I2）</span>
                </div>
                <div v-if="entry.analysis.i1Details" mt1 op60>
                  I1 粒子命中 {{ entry.analysis.i1Details.particleHits }}/{{ entry.analysis.i1Details.particleTotal }}，
                  真实后验命中 {{ entry.analysis.i1Details.realHits }}/{{ entry.analysis.i1Details.realTotal }}，
                  粒子权重 α={{ entry.analysis.i1Details.particleWeight.toFixed(3) }}，
                  p混合={{ entry.analysis.i1Details.blendedProbability.toExponential(3) }}
                </div>
              </template>
              <div v-if="entry.result" mt1>
                超过 {{ entry.result.rank }}/{{ entry.result.total }}；
                原始 {{ (entry.result.rawPercentile * 100).toFixed(3) }}% →
                最终 {{ (entry.result.percentile * 100).toFixed(3) }}%；
                常规 {{ entry.result.normalRating }} → 最终 {{ entry.result.rating }}
              </div>
              <div v-else-if="entry.rating" mt1>常规评分暂停，采用特殊评级：{{ entry.rating }}</div>
              <div v-if="entry.result?.model === 'v3'" mt1 op60>
                混合 λ={{ entry.result.lambda.toFixed(4) }}（有效假设 {{ entry.result.effectiveHypotheses.toFixed(1) }}）；
                真实/虚拟 {{ entry.result.realParticles }}/{{ entry.result.virtualParticles }}；
                接受 {{ entry.result.accepted }}/{{ entry.result.attempts }}
                （{{ (entry.result.acceptanceRate * 100).toFixed(1) }}%）；
                ESS {{ entry.result.candidateEffective.toFixed(1) }} → {{ entry.result.resampledEffective.toFixed(1) }}；
                非法音节/历史淘汰 {{ entry.result.invalidSyllableRejected }}/{{ entry.result.pinyinHistoryRejected }}；
                结构截断 {{ entry.result.clippedSignatureCount }}
                <span v-if="entry.result.fallback" text-red>虚拟粒子生成失败，V3 使用真实后验</span>
              </div>
              <div mt1 op60>
                生成 {{ entry.analysis?.generationMs.toFixed(1) ?? '—' }} ms；
                排名 {{ entry.result?.rankingMs.toFixed(1) ?? '跳过' }} ms；
                总耗时 {{ entry.elapsedMs.toFixed(1) }} ms
              </div>
              <div mt1 op60>
                precompute {{ entry.preparationMs.toFixed(1) }} ms
                (generation {{ entry.analysis?.generationMs.toFixed(1) ?? '-' }} /
                ranking {{ entry.result?.rankingMs.toFixed(1) ?? 'skipped' }}) |
                player {{ entry.playerMs.toFixed(1) }} ms |
                ready {{ entry.readyBeforeSubmit ? 'yes' : 'no' }} |
                queue {{ entry.queueWaitMs.toFixed(1) }} ms
              </div>
              <div v-if="entry.after.degradation === 'corpus-saturated'" mt1 text-ok>
                词库后验饱和（不代表逻辑上已无未知信息）
              </div>
              <div v-else-if="entry.after.degradation === 'corpus-sparse'" mt1 text-orange>词库稀疏</div>
              <div v-else-if="entry.after.degradation === 'invalid'" mt1 text-red>词库联合后验为空</div>
            </div>
          </div>
        </template>

        <template v-if="lastEvalDebug">
          <div mt-6 mb-2 op50>1000 词基准排名</div>
          <div text-sm>
            {{ lastEvalDebug.model === 'endgame' ? '末盘' : 'V3' }} E={{ lastEvalDebug.playerEI.toFixed(3) }}
            （E1={{ lastEvalDebug.e1.toFixed(3) }} + {{ lastEvalDebug.toneWeight.toFixed(3) }} × E2={{ lastEvalDebug.e2.toFixed(3) }}）
            | {{ lastEvalDebug.rating }}
            （常规 {{ lastEvalDebug.normalRating }} / 特殊 {{ lastEvalDebug.specialRating ?? '无' }}）
            | 超过 {{ lastEvalDebug.rank }}/{{ lastEvalDebug.total }}
            | {{ (lastEvalDebug.rawPercentile * 100).toFixed(3) }}% → {{ (lastEvalDebug.percentile * 100).toFixed(3) }}%
          </div>
          <div v-if="lastEvalDebug.sampled" mt-2 text-xs op50 max-h-100 overflow-auto w-full max-w-200>
            <div v-for="(entry, idx) of lastEvalDebug.sampled" :key="idx" flex gap-2>
              <span>{{ idx + 1 }}.</span>
              <span>{{ entry.word }}</span>
              <span>{{ entry.ei.toFixed(3) }}</span>
              <span op50>(E1 {{ entry.e1.toFixed(3) }} + {{ lastEvalDebug.toneWeight.toFixed(3) }} × E2 {{ entry.e2.toFixed(3) }})</span>
              <span v-if="entry.ei < lastEvalDebug.playerEI" text-ok>◀</span>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
