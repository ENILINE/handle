<script setup lang="ts">
import type { MatchResult, MatchType, ParsedChar } from '~/logic/types'
import { inputMode, useCheckAssist } from '~/storage'
import { getSymbolState, useMask, useNumberTone } from '~/state'
import { displayFinalWithTone } from '~/logic/pinyin-display'

const props = defineProps<{
  char?: ParsedChar
  answer?: MatchResult
  active?: boolean
  masked?: boolean
}>()

const masked = computed(() => props.masked ?? useMask.value)

const exact = computed(() => props.answer && Object.values(props.answer).every(i => i === 'exact'))

const parsed = computed(() => {
  if (props.answer)
    return props.answer
  if (!props.char || !useCheckAssist.value || !props.active)
    return

  // Assist coloring
  return {
    _1: getSymbolState(props.char._1, inputMode.value === 'sp' ? '_1' : undefined) === 'none' ? 'deleted' : undefined,
    _2: getSymbolState(props.char._2, inputMode.value === 'sp' ? '_2' : undefined) === 'none' ? 'deleted' : undefined,
    _3: getSymbolState(props.char._3) === 'none' ? 'deleted' : undefined,
    tone: getSymbolState(props.char.tone, 'tone') === 'none' ? 'deleted' : undefined,
  } as MatchResult
})

function getColor(result?: MatchType, isChar = false) {
  const pre = masked.value
    ? `bg-current ${isChar ? ' !op70' : '!op40'} border border-current`
    : ''

  if (!result || exact.value)
    return pre

  const colors = {
    exact: 'text-ok',
    misplaced: 'text-mis',
    none: isChar ? 'op80' : 'op35',
    deleted: inputMode.value === 'zy' ? 'op30' : 'line-through op30',
  }
  return `${pre} ${colors[result]}`
}

const pyUnderlineClass = computed(() => {
  if (!props.answer || props.answer.char === 'exact')
    return ''
  if (props.answer.py === 'exact')
    return 'border-b-3 border-double border-ok'
  if (props.answer.py === 'misplaced')
    return 'border-b-3 border-double border-mis'
  return ''
})

const blockColor = computed(() => {
  if (!props.answer)
    return 'border-base'
  if (exact.value)
    return 'border-transparent bg-ok text-white'
  return 'border-transparent bg-gray-400/8'
})

const toneCharLocation = computed(() => {
  const part = props.char?._2 || ''
  return [
    part.lastIndexOf('iu') > -1 ? part.lastIndexOf('iu') + 1 : -1,
    part.lastIndexOf('a'),
    part.lastIndexOf('e'),
    part.lastIndexOf('o'),
    part.lastIndexOf('i'),
    part.lastIndexOf('u'),
    part.lastIndexOf('v'),
  ].find(i => i !== null && i >= 0) || 0
})

const vLocation = computed(() => {
  const part = props.char?._2 || ''
  return part.lastIndexOf('v')
})

const partTwo = computed(() => {
  const two = (props.char?._2 || '')
  return displayFinalWithTone(
    two,
    toneCharLocation.value,
    props.char?.tone || 0,
    useNumberTone.value,
  )
})
</script>

<template>
  <div
    h-20 w-20 border-2
    flex="~ center" relative
    leading-1em font-serif
    :class="blockColor"
  >
    <template v-if="char?.char?.trim()">
      <!-- Zhuyin -->
      <template v-if="inputMode === 'zy'">
        <div
          absolute text-3xl leading-1em flex items-center text-center
          top-0 bottom-0
          :class="[getColor(parsed?.char, true), masked ? 'left-3' : 'left-4']"
        >
          {{ char.char }}
        </div>
        <div
          absolute flex items-center text-center
          top-0 bottom-0
          right="2.5" w="5"
        >
          <div flex="~ center" text-xs style="writing-mode: vertical-rl">
            <span v-if="char._1" :class="getColor(parsed?._1)">
              {{ char._1 }}
            </span>
            <span v-if="char._2" :class="getColor(parsed?._2)">
              {{ char._2 }}
            </span>
            <span v-if="char._3" :class="getColor(parsed?._3)">
              {{ char._3 }}
            </span>
          </div>
          <ToneSymbol :tone="char.tone" :class="getColor(parsed?.tone)" mt--1 min-w-6px />
        </div>
      </template>

      <!-- Pinyin or Shuangpin -->
      <template v-else>
        <div
          absolute text-3xl leading-1em
          :class="[getColor(parsed?.char, true), masked ? 'top-8.5' : 'top-8']"
        >
          {{ char.char }}
        </div>
        <div
          absolute font-mono
          text-center left-0 right-0 font-100 flex flex-col items-center
          :class="[masked ? 'top-14px' : 'top-11px']"
        >
          <div
            relative ma items-start
            flex="~ x-center"
            :class="pyUnderlineClass"
          >
            <div v-if="char._1" :class="getColor(parsed?._1)" mx-1px>
              {{ char._1 }}
            </div>
            <div v-if="partTwo" mx-1px flex>
              <div v-for="w, idx of partTwo" :key="idx" relative>
                <div :class="getColor(parsed?._2)">
                  {{ inputMode === 'sp' ? w : w.replace('v', 'u') }}
                </div>
                <VDots
                  v-if="!masked && idx === vLocation && inputMode === 'py'"
                  :class="getColor(parsed?._2)"
                  absolute w="87%" left="8%" bottom="0.76rem"
                />
                <ToneSymbol
                  v-if="!useNumberTone && idx === toneCharLocation"
                  :tone="char.tone"
                  :class="getColor(parsed?.tone)"
                  absolute w="86%" left="8%"
                  :style="{
                    bottom: masked
                      ? '1.25rem'
                      : w === 'v'
                        ? '0.85rem'
                        : '0.78rem',
                  }"
                />
              </div>
            </div>
            <div
              v-if="useNumberTone"
              :class="getColor(parsed?.tone)"
              text-xs leading-1em mr--2 mt--1 ml-1px
            >
              {{ char.tone }}
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
