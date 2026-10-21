<script setup lang="ts">
import { ref, watch } from 'vue'

const model = defineModel<number>({ required: true })
const text = ref('R$ 0,00')

const format = (value: number) =>
  (Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

watch(() => model.value, value => { text.value = format(value) }, { immediate: true })

function onInput(event: Event) {
  const digits = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 13)
  model.value = digits ? Number(digits) / 100 : 0
  text.value = format(model.value)
}
</script>

<template>
  <input class="filter" :value="text" inputmode="numeric" autocomplete="off" @input="onInput" />
</template>
