<script setup lang="ts">
import { isDark, showHelp, showVariants, useMask } from '~/state'
import { initialized, inputMode } from '~/storage'
import { t } from '~/i18n'
import { getIdiomFeedbackUrl } from '~/logic/feedback'

function start() {
  showHelp.value = false
  useMask.value = false
  initialized.value = true
}

function variantButton() {
  showVariants.value = true
}

const final = computed(() => ({ py: 'uo', zy: 'ㄨㄛ', sp: 'o' }[inputMode.value]))
const idiomFeedbackUrl = getIdiomFeedbackUrl()
</script>

<template>
  <div p="x5 y10" flex="~ col gap-2 y-center" relative>
    <div absolute top-4 right-4 flex="~ gap-3">
      <button v-if="!initialized" icon-btn @click="isDark = !isDark">
        <div i-carbon-sun dark:i-carbon-moon />
      </button>
      <button v-else icon-btn @click="start()">
        <div i-carbon-close />
      </button>
    </div>

    <AppName h="2.5rem" />
    <div mt--1 op50 text-sm>
      {{ t('description') }}
    </div>

    <div h-1px w-10 border="b base" m4 />

    <p text-xl font-serif mb4>
      <b>{{ t('rule') }}</b>
    </p>

    <p>{{ t('intro-1') }} <b text-ok>{{ t('intro-2') }}</b>。</p>
    <p>{{ t('intro-3') }}</p>
    <div h-1px w-10 border="b base" m4 />

    <WordBlocks my2 :word="t('example-1')" :revealed="true" answer=" 门  " />
    <p>{{ t('intro-4') }} <b text-ok>{{ t('intro-5') }}</b> {{ t('intro-6') }}</p>

    <WordBlocks my2 :word="t('example-2')" :revealed="true" answer="一一一水" />
    <p>{{ t('intro-7') }} <b text-mis>{{ t('intro-8') }}</b> {{ t('intro-9') }}</p>

    <WordBlocks my2 :word="t('example-3')" :revealed="true" answer="桥它拖 " />
    <p max-w-130>
      {{ t('intro-10') }} <b>{{ t('intro-11') }}</b> {{ t('intro-12') }}
      {{ t('intro-13') }} <b op50>{{ t('intro-14') }}</b> {{ t('intro-15') }} <b op50>{{ t('intro-14') }}</b> {{ t('intro-16') }}
      {{ t('intro-17') }} <b text-mis>{{ final }}</b> {{ t('intro-19') }}
    </p>
    <p max-w-130 mt2>
      {{ t('intro-21') }}
    </p>

    <WordBlocks my2 :word="t('example-4')" :revealed="true" answer="武运昌隆" />
    <p>{{ t('intro-20') }}</p>

    <div h-1px w-10 border="b base" m4 />

    <button btn p="x4 y2" @click="start()">
      <span tracking-1 pl1>{{ t('start') }}</span>
    </button>

    <div h-1px w-10 border="b base" m4 />

    <Settings :lite="true" />

    <div h-1px w-10 border="b base" m4 />
    <a :href="idiomFeedbackUrl" target="_blank" rel="noopener noreferrer" flex="~ center gap-1" op50 hover:op80>
      <div i-carbon-warning-alt />
      {{ t('idiom-feedback') }}
    </a>
    <div h-1px w-10 border="b base" m4 />
    <button text-primary op80 hover:op100 @click="variantButton()">
      {{ t('other-variants') }}
    </button>
    <a href="https://github.com/ENILINE/handle" target="_blank" flex="~ center gap-1" op50 hover:op80>
      <div i-carbon-logo-github />
      Source Code
    </a>
  </div>
</template>
