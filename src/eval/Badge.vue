<script setup lang="ts">
import brilliantSvg from './assets/brilliant.svg'
import excellentSvg from './assets/excellent.svg'
import goodSvg from './assets/good.svg'
import averageSvg from './assets/average.svg'
import mistakeSvg from './assets/mistake.svg'
import incorrectSvg from './assets/incorrect.svg'
import { RATING_LABEL_KEYS } from './presentation'
import { t } from '~/i18n'
import type { Rating } from '~/logic/types'

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

const label = computed(() => t(RATING_LABEL_KEYS[props.rating]))
</script>

<template>
  <span
    data-eval-badge inline-flex
    :title="label"
    role="img"
    :aria-label="label"
  >
    <img :src="svgMap[rating]" w="20px" h="20px" alt="">
  </span>
</template>
