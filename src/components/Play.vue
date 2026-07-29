<script setup lang="ts">
import { filterNonChineseChars, toSimplified } from '@hankit/tools'
import { answer, customOrigin, dayNo, hint, idiomSearchWord, isDev, isFailed, isFinished, newRandomGame, parseWord, parsedTries, playMode, resetCustomGame, showCheatSheet, showCustomAnswer, showCustomShare, showFailed, showHelp, showHint, showIdiomExplanation } from '~/state'
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
      <WordBlocks v-for="w, i of tries" :key="playMode + '-' + i" :word="w" :revealed="true" @click="focus()" />

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
      </template>
    </div>
  </div>
</template>