<script setup lang="ts">
import type { ShareGameSnapshot } from '~/logic/types'
import { activeGameMode, answer, dayNo, evaluationEnabled, playMode, showShareDialog, triesRatings, useMask } from '~/state'
import { meta, tries } from '~/storage'
import { t } from '~/i18n'

const props = withDefaults(defineProps<{
  game?: ShareGameSnapshot
  embedded?: boolean
}>(), {
  embedded: false,
})

const emit = defineEmits<{
  (event: 'close'): void
}>()

const shareType = ref<'text' | 'image' | null>()
const shareEvaluation = ref(false)
const shareMask = ref(false)

const currentGame = computed<ShareGameSnapshot>(() => ({
  answer: answer.value.word,
  playMode: playMode.value,
  day: playMode.value === 'daily' ? dayNo.value : undefined,
  gameMode: activeGameMode.value,
  tries: [...tries.value],
  hintUsed: !!(meta.value.hint || meta.value.hintLevel),
  hintLevel: meta.value.hintLevel && meta.value.hintLevel >= 2
    ? 2
    : meta.value.hint || meta.value.hintLevel
      ? 1
      : 0,
  duration: meta.value.resultDuration ?? meta.value.duration ?? 0,
  ratings: [...triesRatings.value],
  ratingsVersion: meta.value.ratingsVersion,
}))
const gameSnapshot = computed(() => props.game || currentGame.value)
const canShareEvaluation = computed(() => evaluationEnabled.value && gameSnapshot.value.gameMode !== 'strict')

function initialize() {
  shareType.value = null
  shareEvaluation.value = canShareEvaluation.value
  shareMask.value = props.game ? false : useMask.value
}

function close() {
  if (props.embedded)
    emit('close')
  else
    showShareDialog.value = false
}

watch(showShareDialog, (v) => {
  if (!props.embedded && v)
    initialize()
})

watch(canShareEvaluation, (available) => {
  if (!available)
    shareEvaluation.value = false
})

watch(shareMask, (masked) => {
  if (!props.game)
    useMask.value = masked
})

onMounted(() => {
  if (props.embedded)
    initialize()
})
</script>

<template>
  <div flex="~ col" p6 items-center relative>
    <div v-if="!embedded" absolute top-4 right-4 flex="~">
      <button icon-btn @click="close">
        <div i-carbon-close />
      </button>
    </div>
    <div v-if="shareType || embedded" absolute top-4 left-4 flex="~">
      <button icon-btn @click="shareType ? shareType = null : close()">
        <div i-carbon-arrow-left />
      </button>
    </div>

    <p text-xl font-serif mb4>
      <b>{{
        shareType === 'text'
          ? t('share-with-text')
          : shareType === 'image'
            ? t('download-as-image')
            : t('share')
      }}</b>
    </p>
    <template v-if="!shareType">
      <div>
        {{ t('select-share-method') }}
      </div>
      <div grid="~ cols-2 gap-2" my4>
        <button
          flex="~ col center" border="~ base" p4 op80 class="hover:op100 hover:bg-gray:5"
          w-30 h-30
          @click="shareType = 'text'"
        >
          <div i-ep-tickets text-10 op70 mb1 />
          <div>{{ t('share-with-text') }}</div>
        </button>
        <button
          flex="~ col center" border="~ base" p4 op80 class="hover:op100 hover:bg-gray:5"
          w-30 h-30
          @click="shareType = 'image'"
        >
          <div i-ep-picture text-10 op70 mb1 />
          <div>{{ t('download-as-image') }}</div>
        </button>
      </div>
    </template>
    <template v-if="shareType === 'text'">
      <ShareText :game="gameSnapshot" :show-evaluation="shareEvaluation" />
    </template>
    <template v-if="shareType === 'image'">
      <ShareImage :game="gameSnapshot" :masked="shareMask" :show-evaluation="shareEvaluation" />
      <ToggleMask v-model="shareMask" mx2 />
    </template>
    <template v-if="shareType">
      <button
        v-if="canShareEvaluation"
        square-btn m2
        :class="shareEvaluation ? 'text-primary' : 'op80'"
        @click="shareEvaluation = !shareEvaluation"
      >
        {{ t('share-evaluation') }}
        <div v-if="shareEvaluation" square-btn-mark />
      </button>
      <SocialLinks />
    </template>
  </div>
</template>
