<script setup lang="ts">
import { getShuangpinConstants, pinyinFinals, pinyinInitials, zhuyinSymbols } from '@hankit/tools'
import { inputMode, spMode } from '~/storage'
import { t } from '~/i18n'
import { getSymbolState, showCheatSheet } from '~/state'
import { NULL_INITIAL, getFinalsForInitial, getInitialsForFinal } from '~/logic/pinyin-pairs'

interface PinyinSelection {
  kind: 'initial' | 'final'
  value: string
}

const selection = ref<PinyinSelection | null>(null)

function getSymbolClass(symbol: string, key?: '_1' | '_2') {
  const state = getSymbolState(symbol, key)
  if (!state)
    return ''
  return ({
    exact: 'text-ok',
    misplaced: 'text-mis',
    none: 'op30',
  })[state]
}

function close() {
  showCheatSheet.value = false
}

function clearSelection() {
  selection.value = null
}

function displaySymbol(symbol: string) {
  if (symbol === NULL_INITIAL)
    return t('zero-initial')
  return symbol.replace(/v/g, 'ü')
}

function selectInitial(initial: string) {
  selection.value = { kind: 'initial', value: initial }
}

function selectFinal(final: string) {
  selection.value = { kind: 'final', value: final }
}

const correspondingSymbols = computed(() => {
  if (!selection.value)
    return []
  return selection.value.kind === 'initial'
    ? getFinalsForInitial(selection.value.value)
    : getInitialsForFinal(selection.value.value)
})

const detailTitle = computed(() => {
  if (!selection.value)
    return ''
  const counterpart = selection.value.kind === 'initial'
    ? t('compatible-finals')
    : t('compatible-initials')
  return `${displaySymbol(selection.value.value)} · ${counterpart}`
})

function correspondenceLabel(kind: PinyinSelection['kind'], symbol: string) {
  return kind === 'initial'
    ? t('view-compatible-finals', displaySymbol(symbol))
    : t('view-compatible-initials', displaySymbol(symbol))
}

function selectCounterpart(symbol: string) {
  if (selection.value?.kind === 'initial')
    selectFinal(symbol)
  else
    selectInitial(symbol)
}

watch(inputMode, clearSelection)
watch(showCheatSheet, (visible) => {
  if (!visible)
    clearSelection()
})

const modeText = computed(() => ({
  py: t('pinyin'),
  sp: t('shuangpin'),
  zy: t('zhuyin'),
}[inputMode.value]))

const spConstants = computed(() => getShuangpinConstants(spMode.value))
</script>

<template>
  <div p8 pt4 flex="~ col center" relative>
    <button
      v-if="selection"
      absolute top-4 left-4 icon-btn
      :aria-label="t('back-to-cheatsheet')"
      :title="t('back-to-cheatsheet')"
      @click="clearSelection()"
    >
      <div i-carbon-arrow-left />
    </button>
    <div absolute top-4 right-4 flex="~ gap-3">
      <button icon-btn @click="close()">
        <div i-carbon-close />
      </button>
    </div>

    <p text-xl font-serif mb8>
      <b>{{ selection ? detailTitle : `${modeText}${t('cheatsheet')}` }}</b>
    </p>
    <!-- Pinyin initial-final correspondence -->
    <div
      v-if="selection"
      grid="~ cols-5 gap-3 center"
      font-mono font-light min-w-64
    >
      <button
        v-for="symbol of correspondingSymbols"
        :key="symbol"
        py2 rounded class="hover:bg-gray:5"
        :class="getSymbolClass(symbol, selection.kind === 'initial' ? '_2' : '_1')"
        :aria-label="correspondenceLabel(selection.kind === 'initial' ? 'final' : 'initial', symbol)"
        :title="correspondenceLabel(selection.kind === 'initial' ? 'final' : 'initial', symbol)"
        @click="selectCounterpart(symbol)"
      >
        {{ displaySymbol(symbol) }}
      </button>
    </div>
    <!-- Zhuyin -->
    <div
      v-else-if="inputMode === 'zy'"
      grid="~ cols-6 center"
    >
      <div v-for="s of zhuyinSymbols" :key="s" text-2xl font-serif w-12 h-12 :class="getSymbolClass(s)">
        {{ s }}
      </div>
    </div>
    <!-- Shuangpin -->
    <div
      v-else-if="inputMode === 'sp'"
      grid="~ cols-[1fr_1fr] gap-x-10 gap-y-4"
      font-mono font-light
    >
      <div text-center>
        {{ t('initials') }}
      </div>
      <div text-center>
        {{ t('finals') }}
      </div>
      <div grid="~ cols-4 gap-4" h-min>
        <div v-for="s of spConstants.initials" :key="s" :class="getSymbolClass(s, '_1')">
          {{ s }}
        </div>
      </div>
      <div grid="~ cols-4 gap-4" h-min>
        <div v-for="s of spConstants.finals" :key="s" :class="getSymbolClass(s, '_2')">
          {{ s }}
        </div>
      </div>
    </div>
    <!-- Pinyin -->
    <div
      v-else
      grid="~ cols-[1fr_3fr] gap-x-10 gap-y-4"
      font-mono font-light
    >
      <div text-center>
        {{ t('initials') }}
      </div>
      <div text-center>
        {{ t('finals') }}
      </div>
      <div grid="~ cols-2 gap-3" h-min>
        <button
          v-for="s of pinyinInitials"
          :key="s"
          py1 rounded class="hover:bg-gray:5"
          :class="getSymbolClass(s, '_1')"
          :aria-label="correspondenceLabel('initial', s)"
          :title="correspondenceLabel('initial', s)"
          @click="selectInitial(s)"
        >
          {{ s }}
        </button>
      </div>
      <div grid="~ cols-3 gap-3" h-min>
        <button
          v-for="s of pinyinFinals"
          :key="s"
          py1 rounded class="hover:bg-gray:5"
          :class="getSymbolClass(s, '_2')"
          :aria-label="correspondenceLabel('final', s)"
          :title="correspondenceLabel('final', s)"
          @click="selectFinal(s)"
        >
          {{ displaySymbol(s) }}
        </button>
      </div>
    </div>
  </div>
</template>
