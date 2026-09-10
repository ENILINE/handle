<script setup lang="ts">
import { parseWord, parsedAnswer, testAnswer, answer as todayAnswer } from '~/state'
import { WORD_LENGTH } from '~/logic'
import type { Rating } from '~/logic/types'
import EvalBadge from '~/eval/Badge.vue'
import { disableAnimations } from '~/storage'

const props = withDefaults(
  defineProps<{
    word: string
    revealed?: boolean
    answer?: string
    animate?: boolean
    active?: boolean
    rating?: Rating | null
    masked?: boolean
  }>(), {
    animate: true,
  },
)

const result = computed(() => {
  if (props.revealed) {
    return testAnswer(
      parseWord(props.word),
      props.answer ? parseWord(props.answer) : parsedAnswer.value,
    )
  }
  return []
})

const flip = ref(false)

watchEffect((onCleanup) => {
  if (!props.revealed) {
    flip.value = false
    return
  }
  if (disableAnimations.value) {
    flip.value = true
    return
  }

  const timer = window.setTimeout(() => {
    flip.value = true
  }, Math.random() * 300)
  onCleanup(() => window.clearTimeout(timer))
})
</script>

<template>
  <div flex relative>
    <div
      v-for="c, i in parseWord(word.padEnd(WORD_LENGTH, ' '), answer || todayAnswer.word)" :key="i"
      w-20 h-20 m1
      class="tile" :class="[flip ? 'revealed' : '', animate && disableAnimations ? 'no-animation' : '']"
    >
      <template v-if="animate">
        <CharBlock
          class="front"
          :char="c"
          :active="active"
          :masked="masked"
          :style="{ transitionDelay: `${i * (300 + Math.random() * 50)}ms` }"
        />
        <CharBlock
          class="back"
          :char="c"
          :answer="result[i]"
          :masked="masked"
          :style="{
            transitionDelay: `${i * (300 + Math.random() * 50)}ms`,
            animationDelay: `${i * (100 + Math.random() * 50)}ms`,
          }"
        />
      </template>
      <template v-else>
        <CharBlock
          :char="c"
          :answer="result[i]"
          :active="active"
          :masked="masked"
        />
      </template>
    </div>
    <EvalBadge
      v-if="rating"
      :rating="rating"
      absolute z-10
      style="top: -3px; right: -7px;"
    />
  </div>
</template>

<style scoped>
.tile {
  user-select: none;
  position: relative;
}
.tile .front,
.tile .back {
  position: absolute;
  top: 0;
  left: 0;
  transition: transform 0.6s;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}
.tile .back {
  transform: rotateY(180deg);
}
.tile.no-animation .front,
.tile.no-animation .back {
  transition: none;
}
.tile.revealed .front {
  transform: rotateY(180deg);
}
.tile.revealed .back {
  transform: rotateY(0deg);
}
</style>
