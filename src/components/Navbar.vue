<script setup lang="ts">
import { idiomSearchWord, isDark, playMode, showDashboard, showHelp, showIdiomExplanation, showSettings, useMask } from '~/state'
import { careerGamesCount } from '~/career'

const toggleDark = useToggle(isDark)
const toggleSettings = useToggle(showSettings)
const toggleDashboard = useToggle(showDashboard)

function openHelp() {
  showHelp.value = true
  useMask.value = false
}

function togglePlayMode() {
  const url = new URL(window.location.href)
  if (playMode.value === 'daily') {
    playMode.value = 'random'
    url.searchParams.set('mode', 'random')
  }
  else if (playMode.value === 'random') {
    playMode.value = 'custom'
    url.searchParams.delete('mode')
  }
  else {
    playMode.value = 'daily'
    url.searchParams.delete('mode')
  }
  window.history.replaceState({}, '', url.toString())
}
</script>

<template>
  <nav border="b base" relative>
    <div absolute font-serif text-2xl left-0 right-0 top-0 bottom-0 z--1 tracking-2 flex>
      <AppName ma />
    </div>
    <div flex items-center justify-between md:max-w-md ma py4 px2>
      <div flex items-center>
        <button icon-btn mx2 @click="openHelp()">
          <div i-carbon-help />
        </button>
        <button icon-btn mx2 @click="idiomSearchWord = ''; showIdiomExplanation = true">
          <div i-carbon-search />
        </button>
        <button v-if="careerGamesCount" icon-btn mx2 @click="toggleDashboard()">
          <div i-carbon-catalog />
        </button>
      </div>
      <div flex items-center>
        <button icon-btn mx2 @click="togglePlayMode()">
          <div v-if="playMode === 'daily'" i-carbon-calendar />
          <div v-else-if="playMode === 'random'" i-ri-shuffle-line />
          <div v-else i-carbon-edit />
        </button>
        <button icon-btn mx2 @click="toggleSettings()">
          <div i-carbon-settings />
        </button>
        <button icon-btn mx2 @click="toggleDark()">
          <div i-carbon-sun dark:i-carbon-moon />
        </button>
      </div>
    </div>
  </nav>
</template>
