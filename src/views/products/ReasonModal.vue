<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseModal from '../../components/BaseModal.vue'

const props = withDefaults(defineProps<{ open: boolean; title: string; subtitle?: string; confirm?: string; tone?: 'danger' | 'warning' | '' ; optional?: boolean }>(), {
  subtitle: '', confirm: 'Confirmar', tone: '', optional: false,
})
const emit = defineEmits<{ close: []; confirm: [reason: string] }>()
const reason = ref('')

watch(() => props.open, open => { if (open) reason.value = '' })

function submit() {
  if (!props.optional && reason.value.trim().length < 5) return
  emit('confirm', reason.value.trim())
}
</script>

<template>
  <BaseModal :open="open" :title="title" :subtitle="subtitle" @close="emit('close')">
    <form id="reason-form" class="field" @submit.prevent="submit">
      <label>{{ optional ? 'Observação' : 'Motivo (fica na auditoria)' }}</label>
      <textarea v-model="reason" rows="3" :required="!optional" :minlength="optional ? 0 : 5" placeholder="Explique para quem vier depois" />
      <slot />
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="emit('close')">Cancelar</button>
      <button class="button" :class="tone" type="submit" form="reason-form">{{ confirm }}</button>
    </template>
  </BaseModal>
</template>
