<script setup lang="ts">
import { revealAnswerAsFailure, showGiveUp } from '~/state'
import { t } from '~/i18n'
</script>

<template>
  <div p5 flex="~ col center">
    <div i-carbon-flag text-5xl op50 m4 />
    <div text-lg>
      {{ t('give-up-confirm') }}
    </div>
    <div p4 flex="~ gap-5 center">
      <button btn @click="showGiveUp = false">
        {{ t('cancel') }}
      </button>
      <button icon-btn flex="inline gap-1 center" text="base mis!" @click="revealAnswerAsFailure()">
        <div i-mdi-emoticon-devil-outline /> {{ t('view-answer') }}
      </button>
    </div>
  </div>
</template>
