<script setup lang="ts">
import type { Rating } from '~/logic/types'
import brilliantSvg from './assets/brilliant.svg'
import excellentSvg from './assets/excellent.svg'
import goodSvg from './assets/good.svg'
import averageSvg from './assets/average.svg'
import mistakeSvg from './assets/mistake.svg'
import incorrectSvg from './assets/incorrect.svg'
import { t } from '~/i18n'

const props = defineProps<{
  rating: Rating
}>()

const svgMap: Record<Rating, string> = {
  brilliant: brilliantSvg,
  excellent: excellentSvg,
  good: goodSvg,
  average: averageSvg,
  mistake: mistakeSvg,
  incorrect: incorrectSvg,
}

const labelMap = {
  brilliant: 'eval-brilliant',
  excellent: 'eval-excellent',
  good: 'eval-good',
  average: 'eval-average',
  mistake: 'eval-mistake',
  incorrect: 'eval-incorrect',
} as const
</script>

<template>
  <span flex="~ items-center gap-1" text-xs op80>
    <img :src="svgMap[rating]" w="18px" h="18px" alt="">
    {{ t(labelMap[rating]) }}
  </span>
</template>
