<script setup lang="ts">
import { ref, watch } from 'vue'
import { BUDGET_REASONS } from '../domain/budget'

const model = defineModel<string>({ required: true })
const choice = ref('')
const detail = ref('')

watch(() => model.value, value => {
  if (!value) { choice.value = ''; detail.value = '' }
})
watch([choice, detail], ([option, text]) => {
  model.value = option === 'Outro' ? (text.trim() ? `Outro: ${text.trim()}` : '') : option
})
</script>

<template>
  <select v-model="choice" class="filter" :class="{ grow: choice !== 'Outro' }">
    <option value="" disabled>Motivo da alteração</option>
    <option v-for="reason in BUDGET_REASONS" :key="reason">{{ reason }}</option>
  </select>
  <input v-if="choice === 'Outro'" v-model="detail" class="filter grow" placeholder="Descreva o motivo" />
</template>
