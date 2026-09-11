<script setup lang="ts">
import type { GameMode } from '~/logic/types'
import { activeGameMode, answer, isPassed, showCustomShare } from '~/state'
import { gameMode, tries as triesRef } from '~/storage'
import { t } from '~/i18n'
import { encodeCustom } from '~/logic/encode'

const shareMode = ref<GameMode>(gameMode.value || 'normal')
const hintChar = ref('')
const selectedTries = ref<boolean[]>([])
const copied = ref(false)
const invalidHint = ref(false)

const allTries = computed(() => {
  const all = triesRef.value
  // If game is passed, exclude the winning guess
  if (isPassed.value && all.length > 0)
    return all.slice(0, -1)
  return all
})

const hasTries = computed(() => allTries.value.length > 0)
const hasSubmittedTries = computed(() => triesRef.value.length > 0)

function initSelection() {
  selectedTries.value = allTries.value.map(() => false)
}

watch(showCustomShare, (v) => {
  if (v) {
    shareMode.value = hasSubmittedTries.value ? activeGameMode.value : gameMode.value
    hintChar.value = ''
    invalidHint.value = false
    copied.value = false
    nextTick(() => initSelection())
  }
})

function toggleAll() {
  const anySelected = selectedTries.value.some(s => s)
  if (anySelected)
    selectedTries.value = allTries.value.map(() => false)

  else
    selectedTries.value = allTries.value.map((_, i) => i < 9)
}

function toggleTry(index: number) {
  const current = selectedTries.value[index]
  if (!current) {
    const count = selectedTries.value.filter(s => s).length
    if (count >= 9)
      return
  }
  selectedTries.value[index] = !current
}

function validateHint(): boolean {
  if (!hintChar.value)
    return true
  if (answer.value.word.includes(hintChar.value)) {
    invalidHint.value = false
    return true
  }
  invalidHint.value = true
  return false
}

function copyLink() {
  if (!validateHint())
    return
  const payload: { a: string; s: string; m?: string; h?: string; t?: string[] } = {
    a: answer.value.word,
    s: 'shared',
  }
  if (shareMode.value !== 'normal')
    payload.m = shareMode.value
  payload.h = hintChar.value
  const triesToInclude = allTries.value.filter((_, i: number) => selectedTries.value[i])
  if (triesToInclude.length > 0)
    payload.t = triesToInclude

  const encoded = encodeCustom(payload as any)
  const url = new URL(window.location.origin + window.location.pathname)
  url.searchParams.set('custom', encoded)
  navigator.clipboard.writeText(url.toString()).then(() => {
    copied.value = true
  })
}
</script>

<template>
  <div p6 flex="~ col" items-center gap-4 relative>
    <div absolute top-4 right-4>
      <button icon-btn @click="showCustomShare = false">
        <div i-carbon-close />
      </button>
    </div>
    <p text-xl font-serif>
      <b>{{ t('share-custom') }}</b>
    </p>

    <!-- Mode selector (only before first guess) -->
    <div v-if="!hasSubmittedTries">
      <div square-btn>
        <button :class="shareMode === 'unlimited' ? 'text-primary' : 'op80'" @click="shareMode = 'unlimited'">
          {{ t('game-mode-unlimited') }}
        </button>
        <div w-1px h-4 border="r base" />
        <button :class="shareMode === 'normal' ? 'text-primary' : 'op80'" @click="shareMode = 'normal'">
          {{ t('game-mode-normal') }}
        </button>
        <div w-1px h-4 border="r base" />
        <button :class="shareMode === 'strict' ? 'text-primary' : 'op80'" @click="shareMode = 'strict'">
          {{ t('game-mode-strict') }}
        </button>
      </div>
    </div>

    <!-- Hint input -->
    <div flex="~ col" items-center gap-1>
      <div op50 text-sm>
        {{ t('share-custom-hint') }}
      </div>
      <input
        v-model="hintChar"
        w-16 p2 border="~ base rounded" text-center text-xl
        maxlength="1"
        :class="{ 'border-mis': invalidHint }"
        @input="hintChar = hintChar.slice(0, 1); invalidHint = false"
        @blur="validateHint"
      >
      <div v-if="invalidHint" text-mis text-sm>
        {{ t('invalid-hint-char') }}
      </div>
    </div>

    <!-- Tries selector -->
    <div v-if="hasTries" flex="~ col" items-center gap-2>
      <div op50 text-sm>
        {{ t('share-custom-tries') }}
      </div>
      <button text-sm op50 hover:op80 @click="toggleAll()">
        {{ selectedTries.some(s => s) ? t('share-custom-select-none') : t('share-custom-select-all') }}
      </button>
      <div v-for="(w, i) of allTries" :key="i" flex items-center gap-2>
        <input
          type="checkbox"
          :checked="selectedTries[i]"
          @change="toggleTry(i)"
        >
        <span font-serif>{{ w }}</span>
      </div>
    </div>

    <!-- Copy button -->
    <button btn p="x4 y2" flex="~ gap-1 center" @click="copyLink()">
      <div i-carbon-copy /> {{ copied ? t('share-custom-copied') : t('share-custom-link') }}
    </button>
  </div>
</template>
