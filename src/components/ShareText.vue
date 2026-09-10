<script setup lang="ts">
import { t } from '~/i18n'
import { parseWord, testAnswer } from '~/state'
import { formatRatedShareRow, formatShareGameMode } from '~/eval/presentation'
import type { ShareGameSnapshot } from '~/logic/types'
import { numberToHanzi } from '~/logic'

const props = withDefaults(defineProps<{
  game: ShareGameSnapshot
  showEvaluation?: boolean
}>(), {
  showEvaluation: false,
})

const shareHost = computed(() => props.game.playMode === 'daily' ? 'handle.antfu.me' : 'eniline.github.io/handle')
const dayLabel = computed(() => {
  if (props.game.playMode === 'daily') return `${numberToHanzi(props.game.day || 0)}日`
  if (props.game.playMode === 'random') return t('random-mode')
  return t('custom-mode')
})

const gameModeLabel = computed(() => formatShareGameMode(props.game.gameMode, key => t(key)))

const lines = computed(() => {
  const parsedAnswer = parseWord(props.game.answer, props.game.answer)
  const table = props.game.tries.map((word, index) => {
    const parsed = parseWord(word, props.game.answer)
    const symbols = testAnswer(parsed, parsedAnswer)
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
      props.game.ratings[index],
      props.showEvaluation,
      key => t(key),
    )
  })

  return [
    [
      t('name'),
      dayLabel.value,
      gameModeLabel.value,
      !props.game.hintUsed ? t('hint-level-none') : '',
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
