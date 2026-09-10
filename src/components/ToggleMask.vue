<script setup lang="ts">
import { useMask } from '~/state'
import { t } from '~/i18n'

const props = defineProps<{
  hint?: boolean
  modelValue?: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const masked = computed(() => props.modelValue ?? useMask.value)

function toggle() {
  if (props.modelValue == null)
    useMask.value = !useMask.value
  else
    emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    square-btn flex-gap-1
    :class="masked ? 'text-primary' : hint ? 'op50' : ''" ma
    @click="toggle"
  >
    <div :i="masked ? 'carbon-view-off' : 'carbon-view'" />
    {{ masked ? t('mask-on') : t('mask-off') }}
  </button>
  <div v-if="hint" my2 op50>
    {{ t('dont-spoiler') }}
  </div>
</template>
