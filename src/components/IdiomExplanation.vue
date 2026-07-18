<script setup lang="ts">
import type { IdiomInfo } from '~/data/idioms'
import { getIdiomInfo, getIdiomInfoSync } from '~/data/idioms'
import { showIdiomExplanation } from '~/state'
import { t } from '~/i18n'

const props = defineProps<{
  word: string
}>()

const info = ref<IdiomInfo | undefined>(undefined)
const loading = ref(false)
const error = ref(false)

async function loadWord() {
  if (!props.word)
    return

  const cached = getIdiomInfoSync(props.word)
  if (cached) {
    info.value = cached
    return
  }

  loading.value = true
  error.value = false
  try {
    info.value = await getIdiomInfo(props.word)
  }
  catch {
    error.value = true
  }
  finally {
    loading.value = false
  }
}

watch(() => props.word, loadWord, { immediate: true })

const hasExplanation = computed(() => info.value && info.value.explanation !== '无')
const hasDerivation = computed(() => info.value && info.value.derivation !== '无')
const hasExample = computed(() => info.value && info.value.example !== '无')
const notFound = computed(() => !loading.value && !error.value && !hasExplanation.value)
</script>

<template>
  <div p5 flex="~ col center" max-w-140 ma relative>
    <button absolute top-4 right-4 icon-btn @click="showIdiomExplanation = false">
      <div i-carbon-close />
    </button>

    <div v-if="loading" flex="~ col center" gap-3 py10>
      <div i-carbon-circle-dash animate-spin text-3xl op50 />
      <div op50>{{ t('idiom-loading') }}</div>
    </div>

    <div v-else-if="error" flex="~ col center" gap-3 py10>
      <div i-carbon-warning-alt text-3xl text-mis />
      <div>{{ t('idiom-loading-failed') }}</div>
      <button btn text-sm p="x3 y1" @click="loadWord">
        {{ t('idiom-retry') }}
      </button>
    </div>

    <div v-else-if="notFound" flex="~ col center" gap-3 py10>
      <div i-carbon-document-unknown text-3xl op50 />
      <div op50>{{ t('idiom-no-explanation') }}</div>
    </div>

    <div v-else-if="info" flex="~ col" gap-4 w-full>
      <div text-2xl font-serif tracking-2 mt2>{{ word }}</div>

      <div v-if="hasExplanation" text-left>
        <div text-sm font-bold op50 mb1>{{ t('idiom-explanation-title') }}</div>
        <div leading-relaxed>{{ info.explanation }}</div>
      </div>

      <div v-if="hasDerivation" text-left>
        <div text-sm font-bold op50 mb1>{{ t('idiom-derivation') }}</div>
        <div leading-relaxed text-sm>{{ info.derivation }}</div>
      </div>

      <div v-if="hasExample" text-left>
        <div text-sm font-bold op50 mb1>{{ t('idiom-example') }}</div>
        <div leading-relaxed text-sm>{{ info.example }}</div>
      </div>
    </div>
  </div>
</template>