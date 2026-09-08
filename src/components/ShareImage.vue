<script setup lang="ts">
import { toPng } from 'html-to-image'
import { saveAs } from 'file-saver'
import { dayNoHanzi, isDev, isIOS, isMobile, playMode, triesRatings, useMask } from '~/state'
import { tries } from '~/storage'
import { t } from '~/i18n'
import { clearRatedImageVariants, imageVariantKey } from '~/eval/presentation'

const props = withDefaults(defineProps<{
  showEvaluation?: boolean
}>(), {
  showEvaluation: false,
})

const el = ref<HTMLDivElement>()
const show = ref(false)
const renderEvaluation = ref(false)
const dataUrls = reactive<Record<string, string>>({})
let mounted = false
let ratingGeneration = 0
let renderQueue = Promise.resolve()

const downloadLabel = computed(() => {
  if (playMode.value === 'daily') return dayNoHanzi.value
  if (playMode.value === 'random') return t('random-mode')
  return t('custom-mode')
})
const shareHost = computed(() => playMode.value === 'daily' ? 'handle.antfu.me' : 'eniline.github.io/handle')
const dataUrl = computed(() => dataUrls[imageVariantKey(useMask.value, props.showEvaluation)] || '')
const ratingSignature = computed(() => triesRatings.value.map(rating => rating || '').join('|'))

async function renderVariants(withEvaluation: boolean, generation: number) {
  const plainKey = imageVariantKey(false, withEvaluation)
  const maskedKey = imageVariantKey(true, withEvaluation)
  if (dataUrls[plainKey] && dataUrls[maskedKey])
    return
  if (withEvaluation && generation !== ratingGeneration)
    return

  const previousMask = useMask.value
  show.value = true
  renderEvaluation.value = withEvaluation
  try {
    await nextTick()
    await nextTick()
    for (const masked of [false, true]) {
      const key = imageVariantKey(masked, withEvaluation)
      if (dataUrls[key])
        continue
      useMask.value = masked
      await nextTick()
      const rendered = await toPng(el.value!)
      if (!withEvaluation || generation === ratingGeneration)
        dataUrls[key] = rendered
    }
  }
  finally {
    useMask.value = previousMask
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
  saveAs(dataUrl.value, `${t('name')} ${downloadLabel.value}${useMask.value ? ' 遮罩' : ''}.png`)
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

    <ToggleMask mx2 />
  </div>

  <div v-if="show" fixed op0 top-0 left-0 pointer-events-none>
    <div ref="el" flex="~ col" items-center p="x6 y4" bg-base relative text-center>
      <AppName w-full />
      <div w-full text-xs mt1 mb3 op50 ws-nowrap>
        {{ shareHost }}
      </div>

      <WordBlocks
        v-for="w, i of tries"
        :key="i"
        :word="w"
        :revealed="true"
        :animate="false"
        :rating="renderEvaluation ? triesRatings[i] : null"
      />
      <div v-if="playMode !== 'daily'" op50 my1 text-sm>{{ playMode === 'random' ? t('random-mode') : t('custom-mode') }}</div>
      <ResultFooter :day="playMode === 'daily'" mt3 w-full />
    </div>
  </div>
</template>
