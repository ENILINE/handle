<script setup lang="ts">
import { t } from '~/i18n'
import { answer, dayNoHanzi, parseWord, playMode, testAnswer, triesRatings } from '~/state'
import { meta, tries } from '~/storage'
import { formatRatedShareRow, formatShareGameMode } from '~/eval/presentation'

const props = withDefaults(defineProps<{
  showEvaluation?: boolean
}>(), {
  showEvaluation: false,
})

const shareHost = computed(() => playMode.value === 'daily' ? 'handle.antfu.me' : 'eniline.github.io/handle')
const dayLabel = computed(() => {
  if (playMode.value === 'daily') return dayNoHanzi.value
  if (playMode.value === 'random') return t('random-mode')
  return t('custom-mode')
})

const gameModeLabel = computed(() => formatShareGameMode(meta.value.strict, key => t(key)))

const lines = computed(() => {
  const table = tries.value.map((word, index) => {
    const parsed = parseWord(word, answer.value.word)
    const symbols = testAnswer(parsed)
      .map((i, idx) => {
        if (i.char === 'exact')
          return '🟩'
        if (i.char === 'misplaced')
          return '🟧'
        if (parsed[idx]._1 && i._1 === 'exact')
          return '🟠'
        if (parsed[idx]._2 && i._2 === 'exact')
          return '🟠'
        if (parsed[idx]._3 && i._3 === 'exact')
          return '🟠'
        if (i._1 === 'misplaced' || i._2 === 'misplaced' || i._3 === 'misplaced')
          return '🟡'
        return '⬜️'
      })
      .join('')
    return formatRatedShareRow(
      symbols,
      triesRatings.value[index],
      props.showEvaluation,
      key => t(key),
    )
  })

  return [
    [
      t('name'),
      dayLabel.value,
      gameModeLabel.value,
      !meta.value.hint ? t('hint-level-none') : '',
    ].filter(Boolean).join(' · '),
    '',
    ...table,
    '',
    shareHost.value,
  ]
})

const text = computed(() => lines.value.join('\n'))

const share = useShare(computed(() => ({
  title: t('name'),
  text: text.value,
})))
const clipboard = useClipboard()
const copied = ref(false)

watch(text, () => {
  copied.value = false
})

async function copyText() {
  if (!clipboard.isSupported)
    return
  await clipboard.copy(text.value)
  copied.value = true
}

async function shareSystem() {
  if (share.isSupported) {
    await share.share()
    return true
  }
  return false
}
</script>

<template>
  <p text-center mb4>
    {{ copied ? t('share-copied') : t('share-not-copied') }}
  </p>
  <textarea
    bg-gray-500:5 rounded p5 select-text resize-none outline-none
    w-90 text-center
    style="line-height: 19px;letter-spacing: 1px;"
    :rows="lines.length"
    :value="text" readonly
  />
  <div flex="~ center wrap" my4>
    <button v-if="clipboard.isSupported" mx2 square-btn @click="copyText()">
      <div i-carbon-copy />
      {{ t('share-copy-text') }}
    </button>
    <button v-if="share.isSupported" mx2 square-btn @click="shareSystem()">
      <div i-carbon-share />
      {{ t('share-with-system-api') }}
    </button>
  </div>
</template>
