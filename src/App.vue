<script setup lang="ts">
import '~/init'
import { answer, dayNo, daySince, isDev, playMode } from '~/state'
import { colorblind } from '~/storage'
import { DAYS_PLAY_BACK } from '~/logic/constants'

const { height } = useWindowSize()

watchEffect(() => {
  document.documentElement.style.setProperty('--vh', `${height.value / 100}px`)
})
</script>

<template>
  <main font-sans text="center gray-700 dark:gray-300" select-none :class="{ colorblind }">
    <NotTodayBanner v-if="dayNo < daySince" />
    <Navbar />
    <div p="4">
      <CustomCreate v-if="playMode === 'custom' && !answer.word" />
      <NoQuizToday v-else-if="!answer.word" />
      <NoFuturePlay v-else-if="dayNo > daySince && !isDev && playMode === 'daily'" />
      <NoPastPlay v-else-if="daySince - dayNo > DAYS_PLAY_BACK && !isDev && playMode === 'daily'" />
      <Play v-else />
    </div>
    <ModalsLayer />
    <Confetti />
  </main>
</template>
