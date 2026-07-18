<script setup lang="ts">
import { filterNonChineseChars } from '@hankit/tools'
import type { IdiomInfo } from '~/data/idioms'
import { getIdiomInfo, getIdiomInfoSync } from '~/data/idioms'
import { showIdiomExplanation } from '~/state'
import { t } from '~/i18n'

const props = defineProps<{
  word: string
}>()

const searchWord = ref('')
const info = ref<IdiomInfo | undefined>(undefined)
const loading = ref(false)
const error = ref(false)

watch(() => props.word, (w) => {
  searchWord.value = w
}, { immediate: true })

async function loadWord() {
  const w = searchWord.value
  if (!w || w.length < 4)
    return

  const cached = getIdiomInfoSync(w)
  if (cached) {
    info.value = cached
    return
  }

  loading.value = true
  error.value = false
  try {
    info.value = await getIdiomInfo(w)
  }
  catch {
    error.value = true
  }
  finally {
    loading.value = false
  }
}

watch(searchWord, loadWord)

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  target.value = filterNonChineseChars(target.value).slice(0, 4)
  searchWord.value = target.value
}

const hasExplanation = computed(() => info.value && info.value.explanation !== '无')
const hasDerivation = computed(() => info.value && info.value.derivation !== '无')
const hasExample = computed(() => info.value && info.value.example !== '无')
const notFound = computed(() => !loading.value && !error.value && searchWord.value.length === 4 && !hasExplanation.value)
const feedbackUrl = computed(() =>
  `https://github.com/ENILINE/handle/issues/new?title=成语数据错误：${searchWord.value}&labels=数据纠错`,
)
</script>

<template>
  <div p5 flex="~ col center" max-w-140 ma relative>
    <button absolute top-4 right-4 icon-btn @click="showIdiomExplanation = false">
      <div i-carbon-close />
    </button>

    <p text-xl font-serif mb3>{{ t('idiom-title') }}</p>

    <div relative border="2 base rounded-0">
      <input
        v-model="searchWord"
        bg-transparent w-86 p3 outline-none text-center text-lg
        type="text"
        :placeholder="t('idiom-search-placeholder')"
        @input="onInput"
      >
    </div>

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

    <div v-else-if="info" flex="~ col" gap-4 w-full mt5>
      <div text-2xl font-serif tracking-2>{{ searchWord }}</div>

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

      <a
        mt4 text-sm op50
        :href="feedbackUrl"
        target="_blank"
      >{{ t('idiom-feedback') }}</a>
    </div>
  </div>
</template>
