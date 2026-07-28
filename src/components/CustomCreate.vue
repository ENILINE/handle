<script setup lang="ts">
import { filterNonChineseChars } from '@hankit/tools'
import { newCustomGame } from '~/state'
import { t } from '~/i18n'
import { WORD_LENGTH, checkValidIdiom } from '~/logic'

const input = ref('')
const inputValue = ref('')
const showToast = autoResetRef(false, 1000)
const shake = autoResetRef(false, 500)

function handleInput(e: Event) {
  const el = (e.target! as HTMLInputElement)
  input.value = filterNonChineseChars(el.value).slice(0, WORD_LENGTH)
}

function confirm() {
  if (input.value.length !== WORD_LENGTH)
    return
  if (!checkValidIdiom(input.value)) {
    showToast.value = true
    shake.value = true
    return
  }
  newCustomGame({ a: input.value, s: 'own' })
}
</script>

<template>
  <div flex="~ col" items-center pt12 gap-4>
    <div text-xl font-serif>{{ t('custom-mode') }}</div>
    <div relative border="2 base rounded-0">
      <input
        v-model="inputValue"
        bg-transparent w-86 p3 outline-none text-center
        type="text"
        :placeholder="t('create-custom-placeholder')"
        :class="{ shake }"
        @input="handleInput"
        @keydown.enter="confirm"
      >
      <div
        absolute top-0 left-0 right-0 bottom-0
        flex="~ center" bg-base
        transition-all duration-300 text-mis
        pointer-events-none
        :class="showToast ? '' : 'op0 translate-y--1'"
      >
        <span tracking-1 pl1>{{ t('invalid-idiom') }}</span>
      </div>
    </div>
    <button
      btn p="x6 y2"
      :disabled="input.length !== WORD_LENGTH"
      @click="confirm"
    >
      {{ t('create-custom-confirm') }}
    </button>
  </div>
</template>