<script setup lang="ts">
import { evaluationAvailable, evaluationEnabled, showShareDialog } from '~/state'
import { t } from '~/i18n'

const shareType = ref<'text' | 'image' | null>()
const shareEvaluation = ref(false)

watch(showShareDialog, (v) => {
  if (v)
    shareEvaluation.value = evaluationEnabled.value
  else
    shareType.value = null
})

watch(evaluationAvailable, (available) => {
  if (!available)
    shareEvaluation.value = false
})
</script>

<template>
  <div flex="~ col" p6 items-center relative>
    <div absolute top-4 right-4 flex="~">
      <button icon-btn @click="showShareDialog = false">
        <div i-carbon-close />
      </button>
    </div>
    <div v-if="shareType" absolute top-4 left-4 flex="~">
      <button icon-btn @click="shareType = null">
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
      <ShareText :show-evaluation="shareEvaluation" />
    </template>
    <template v-if="shareType === 'image'">
      <ShareImage :show-evaluation="shareEvaluation" />
    </template>
    <template v-if="shareType">
      <button
        v-if="evaluationAvailable"
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
