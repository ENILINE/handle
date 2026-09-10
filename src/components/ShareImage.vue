<script setup lang="ts">
import { toPng } from 'html-to-image'
import { saveAs } from 'file-saver'
import { isDev, isIOS, isMobile } from '~/state'
import { formatDuration } from '~/storage'
import { t } from '~/i18n'
import { clearRatedImageVariants, imageVariantKey } from '~/eval/presentation'
import type { ShareGameSnapshot } from '~/logic/types'
import { numberToHanzi } from '~/logic'

const props = withDefaults(defineProps<{
  game: ShareGameSnapshot
  masked?: boolean
  showEvaluation?: boolean
}>(), {
  masked: false,
  showEvaluation: false,
})

const el = ref<HTMLDivElement>()
const show = ref(false)
const renderEvaluation = ref(false)
const renderMask = ref(false)
const dataUrls = reactive<Record<string, string>>({})
let mounted = false
let ratingGeneration = 0
let renderQueue = Promise.resolve()

const downloadLabel = computed(() => {
  if (props.game.playMode === 'daily') return `${numberToHanzi(props.game.day || 0)}日`
  if (props.game.playMode === 'random') return t('random-mode')
  return t('custom-mode')
})
const shareHost = computed(() => props.game.playMode === 'daily' ? 'handle.antfu.me' : 'eniline.github.io/handle')
const dataUrl = computed(() => dataUrls[imageVariantKey(props.masked, props.showEvaluation)] || '')
const ratingSignature = computed(() => props.game.ratings.map(rating => rating || '').join('|'))
const gameModeLabel = computed(() => {
  if (props.game.gameMode === 'unlimited')
    return t('game-mode-unlimited')
  if (props.game.gameMode === 'strict')
    return t('game-mode-strict')
  return ''
})
const hintLabel = computed(() => {
  if (props.game.hintLevel === 2)
    return t('hint-level-2')
  if (props.game.hintLevel === 1 || props.game.hintUsed)
    return t('hint-level-1')
  return t('hint-level-none')
})
const footerParts = computed(() => [
  props.game.playMode === 'daily' ? downloadLabel.value : '',
  hintLabel.value,
  gameModeLabel.value,
  formatDuration(props.game.duration),
].filter(Boolean))

async function renderVariants(withEvaluation: boolean, generation: number) {
  const plainKey = imageVariantKey(false, withEvaluation)
  const maskedKey = imageVariantKey(true, withEvaluation)
  if (dataUrls[plainKey] && dataUrls[maskedKey])
    return
  if (withEvaluation && generation !== ratingGeneration)
    return

  show.value = true
  renderEvaluation.value = withEvaluation
  try {
    await nextTick()
    await nextTick()
    for (const masked of [false, true]) {
      const key = imageVariantKey(masked, withEvaluation)
      if (dataUrls[key])
        continue
      renderMask.value = masked
      await nextTick()
      const rendered = await toPng(el.value!)
      if (!withEvaluation || generation === ratingGeneration)
        dataUrls[key] = rendered
    }
  }
  finally {
    show.value = false
  }
}

function ensureVariants(withEvaluation: boolean) {
  if (!mounted)
    return
  const generation = ratingGeneration
  renderQueue = renderQueue
    .catch(() => undefined)
    .then(() => renderVariants(withEvaluation, generation))
    .catch((error) => {
      if (isDev)
        console.warn('[share image] render failed', error)
    })
}

watch(() => props.showEvaluation, withEvaluation => ensureVariants(withEvaluation))
watch(ratingSignature, () => {
  ratingGeneration++
  clearRatedImageVariants(dataUrls)
  if (props.showEvaluation)
    ensureVariants(true)
})

onMounted(() => {
  mounted = true
  ensureVariants(props.showEvaluation)
})

async function download() {
  saveAs(dataUrl.value, `${t('name')} ${downloadLabel.value}${props.masked ? ' 遮罩' : ''}.png`)
}
</script>

<template>
  <div v-if="isMobile" op50 mb4>
    {{ t('press-and-download-image') }}
  </div>
  <img v-if="dataUrl" :src="dataUrl" w-80 min-h-10 border="~ base rounded">
  <div v-else w-80 border="~ base rounded" p4 animate-pulse>
    {{ t('rendering') }}
  </div>

  <div flex="~" py4>
    <button v-if="!isIOS" mx2 square-btn flex-gap-1 :disabled="!dataUrl" @click="download()">
      <div i-carbon-download />
      {{ t('download') }}
    </button>

  </div>

  <div v-if="show" fixed op0 top-0 left-0 pointer-events-none>
    <div ref="el" flex="~ col" items-center p="x6 y4" bg-base relative text-center>
      <AppName w-full />
      <div w-full text-xs mt1 mb3 op50 ws-nowrap>
        {{ shareHost }}
      </div>

      <WordBlocks
        v-for="w, i of game.tries"
        :key="i"
        :word="w"
        :revealed="true"
        :animate="false"
        :answer="game.answer"
        :masked="renderMask"
        :rating="renderEvaluation ? game.ratings[i] : null"
      />
      <div v-if="game.playMode !== 'daily'" op50 my1 text-sm>{{ game.playMode === 'random' ? t('random-mode') : t('custom-mode') }}</div>
      <div op50 my1 mt3 text-sm ws-nowrap text-center>
        {{ footerParts.join(' · ') }}
      </div>
    </div>
  </div>
</template>
