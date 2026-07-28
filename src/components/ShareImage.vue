<script setup lang="ts">
import { toPng } from 'html-to-image'
import { saveAs } from 'file-saver'
import { dayNoHanzi, isIOS, isMobile, playMode, useMask } from '~/state'
import { tries } from '~/storage'
import { t } from '~/i18n'

const el = ref<HTMLDivElement>()
const show = ref(false)
const showDialog = ref(false)
const dataUrlUnmasked = ref('')
const dataUrlMasked = ref('')

const downloadLabel = computed(() => playMode.value === 'daily' ? dayNoHanzi.value : t('random-mode'))
const shareHost = computed(() => playMode.value === 'daily' ? 'handle.antfu.me' : 'eniline.github.io/handle')
const dataUrl = computed(() => useMask.value ? dataUrlMasked.value : dataUrlUnmasked.value)

async function render() {
  show.value = true
  await nextTick()
  await nextTick()
  showDialog.value = true
  const p = useMask.value
  useMask.value = false
  await nextTick()
  dataUrlUnmasked.value = await toPng(el.value!)
  useMask.value = true
  await nextTick()
  dataUrlMasked.value = await toPng(el.value!)
  useMask.value = p
  show.value = false
}

onMounted(() => render())

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

      <WordBlocks v-for="w, i of tries" :key="i" :word="w" :revealed="true" :animate="false" />
      <div v-if="playMode === 'random'" op50 my1 text-sm>{{ t('random-mode') }}</div>
      <ResultFooter :day="playMode === 'daily'" mt3 w-full />
    </div>
  </div>
</template>
