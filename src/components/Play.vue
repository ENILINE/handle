<script setup lang="ts">
import { filterNonChineseChars, toSimplified } from '@hankit/tools'
import { answer, customOrigin, dayNo, evalDebugTrace, hint, idiomSearchWord, isDev, isFailed, isFinished, lastEvalDebug, newRandomGame, parseWord, parsedTries, playMode, resetCustomGame, showCheatSheet, showCustomAnswer, showCustomShare, showFailed, showHelp, showHint, showIdiomExplanation, triesRatings } from '~/state'
import { gameMode, markStart, meta, showEval, tries, useNoHint } from '~/storage'
import { t } from '~/i18n'
import { TRIES_LIMIT, WORD_LENGTH, checkHardMode, checkValidIdiom } from '~/logic'
import EvalBadge from './EvalBadge.vue'

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
      <div v-for="w, i of tries" :key="playMode + '-' + i" flex="~ col items-center">
        <WordBlocks :word="w" :revealed="true" @click="focus()" />
        <EvalBadge v-if="showEval && triesRatings[i]" :rating="triesRatings[i]" mt-1 />
      </div>

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
          <div mt-6 mb-2 op50>
            联合后验轨迹
          </div>
          <div w-full max-w-220 text-xs text-left flex="~ col gap-2">
            <div
              v-for="entry of evalDebugTrace"
              :key="`${entry.guess}-${entry.word}`"
              border="1 base rounded" p2
            >
              <div flex="~ wrap gap-x-3 gap-y-1">
                <b>#{{ entry.guess }} {{ entry.word }}</b>
                <span>I {{ entry.after.initialRows }} 行 / {{ entry.after.initialUnique }} 种 / 有效 {{ entry.after.initialEffective.toFixed(1) }}</span>
                <span>F {{ entry.after.finalRows }} 行 / {{ entry.after.finalUnique }} 种 / 有效 {{ entry.after.finalEffective.toFixed(1) }}</span>
              </div>
              <div flex="~ wrap gap-x-3 gap-y-1" mt1>
                <span>IF {{ entry.after.ifRows }} 行 / {{ entry.after.ifUnique }} 种 / 有效 {{ entry.after.ifEffective.toFixed(1) }}</span>
                <span>IF+PY {{ entry.after.ifPyRows }} 行 / {{ entry.after.ifPyUnique }} 种 / 有效 {{ entry.after.ifPyEffective.toFixed(1) }}</span>
              </div>
              <div flex="~ wrap gap-x-3 gap-y-1" mt1 op60>
                <span>保留 I {{ (entry.initialRetained * 100).toFixed(1) }}%</span>
                <span>F {{ (entry.finalRetained * 100).toFixed(1) }}%</span>
                <span>IF {{ (entry.ifRetained * 100).toFixed(1) }}%</span>
                <span>IF+PY {{ (entry.ifPyRetained * 100).toFixed(1) }}%</span>
                <span>{{ entry.elapsedMs.toFixed(1) }} ms</span>
              </div>
              <div v-if="entry.v2 && entry.v3" mt1 flex="~ wrap gap-x-3 gap-y-1">
                <span>V2 H={{ entry.v2.playerEI.toFixed(3) }} / {{ entry.v2.rating }} / {{ entry.v2.rank }}名</span>
                <span>V3 H={{ entry.v3.playerEI.toFixed(3) }} / {{ entry.v3.rating }} / {{ entry.v3.rank }}名</span>
                <span>排名差 {{ entry.v3.rank - entry.v2.rank >= 0 ? '+' : '' }}{{ entry.v3.rank - entry.v2.rank }}</span>
              </div>
              <div v-if="entry.v3" mt1 op60 flex="~ wrap gap-x-3 gap-y-1">
                <span>混合 λ={{ entry.v3.lambda.toFixed(4) }}（有效假设 {{ entry.v3.effectiveHypotheses.toFixed(1) }}）</span>
                <span>真实/虚拟 {{ entry.v3.realParticles }}/{{ entry.v3.virtualParticles }}</span>
                <span>候选 {{ entry.v3.accepted }}/{{ entry.v3.attempts }}（{{ (entry.v3.acceptanceRate * 100).toFixed(1) }}%）</span>
                <span>ESS {{ entry.v3.candidateEffective.toFixed(1) }} → {{ entry.v3.resampledEffective.toFixed(1) }}</span>
              </div>
              <div v-if="entry.v3" mt1 op60 flex="~ wrap gap-x-3 gap-y-1">
                <span>非法音节淘汰 {{ entry.v3.invalidSyllableRejected }}</span>
                <span>全拼历史淘汰 {{ entry.v3.pinyinHistoryRejected }}</span>
                <span>结构权重截断 {{ entry.v3.clippedSignatureCount }}</span>
                <span>生成 {{ entry.v3.generationMs.toFixed(1) }} ms</span>
                <span>排名 {{ entry.v3.rankingMs.toFixed(1) }} ms</span>
                <span>V3 总计 {{ entry.v3.elapsedMs.toFixed(1) }} ms</span>
                <span v-if="entry.v3.fallback" text-red>虚拟粒子失败，已回退真实后验</span>
              </div>
              <div v-if="entry.after.degradation === 'true-saturation'" mt1 text-ok>
                真实饱和：IF+PY 只剩一种拼音，I/F 有效假设数均不超过 8
              </div>
              <div v-else-if="entry.after.degradation === 'corpus-sparse'" mt1 text-mis>
                词库稀疏：IF+PY 只剩一种拼音，但 I/F 至少一项仍有超过 8 个有效假设
              </div>
              <div v-else-if="entry.after.degradation === 'invalid'" mt1 text-red>
                异常：联合后验为空
              </div>
            </div>
          </div>
        </template>

        <template v-if="lastEvalDebug">
          <div mt-6 mb-2 op50>
            评价调试
          </div>
          <div text-sm>
            本次联合熵: {{ lastEvalDebug.playerEI.toFixed(3) }}
            | 评价: {{ lastEvalDebug.rating }}
            | 超过: {{ lastEvalDebug.rank }} / {{ lastEvalDebug.total }}
            ({{ (lastEvalDebug.rank / lastEvalDebug.total * 100).toFixed(1) }}%)
          </div>
          <div text-xs op50>
            后验: 声母 {{ lastEvalDebug.initialPosterior }} / 韵母 {{ lastEvalDebug.finalPosterior }}
            | 粒子: 声母 {{ lastEvalDebug.initialParticles }} / 韵母 {{ lastEvalDebug.finalParticles }}
            | 耗时: {{ lastEvalDebug.elapsedMs.toFixed(1) }} ms
          </div>
          <div v-if="lastEvalDebug.sampled" mt-2 text-xs op50 max-h-100 overflow-auto w-full max-w-200>
            <div v-for="(entry, idx) of lastEvalDebug.sampled" :key="idx" flex gap-2>
              <span>{{ idx + 1 }}.</span>
              <span>{{ entry.word }}</span>
              <span op50>{{ entry.ei.toFixed(3) }}</span>
              <span v-if="entry.ei < lastEvalDebug.playerEI" text-ok>◀</span>
            </div>
          </div>
        </template>
      </template>
    </div>
  </div>
</template>
