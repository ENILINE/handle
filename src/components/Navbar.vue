<script setup lang="ts">
import { idiomSearchWord, isDark, playMode, showDashboard, showHelp, showIdiomExplanation, showSettings, useMask } from '~/state'
import { gamesCount } from '~/storage'

const toggleDark = useToggle(isDark)
const toggleSettings = useToggle(showSettings)
const toggleDashboard = useToggle(showDashboard)

function openHelp() {
  showHelp.value = true
  useMask.value = false
}

function togglePlayMode() {
  if (playMode.value === 'daily') {
    playMode.value = 'random'
    const url = new URL(window.location.href)
    url.searchParams.set('mode', 'random')
    window.history.replaceState({}, '', url.toString())
  }
  else {
    playMode.value = 'daily'
    const url = new URL(window.location.href)
    url.searchParams.delete('mode')
    window.history.replaceState({}, '', url.toString())
  }
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
        <button v-if="gamesCount" icon-btn mx2 @click="toggleDashboard()">
          <div i-carbon-catalog />
        </button>
      </div>
      <div flex items-center>
        <button icon-btn mx2 @click="togglePlayMode()">
          <div v-if="playMode === 'daily'" i-ri-shuffle-line />
          <div v-else i-carbon-calendar />
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
