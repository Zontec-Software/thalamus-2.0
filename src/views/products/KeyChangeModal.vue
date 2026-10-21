<script setup lang="ts">
import { reactive, watch } from 'vue'
import BaseModal from '../../components/BaseModal.vue'
import { NCM_TABLE, catalogOf } from '../../domain/catalog'
import { useErpStore } from '../../stores/erp'
import type { Item } from '../../types/domain'

const props = defineProps<{ open: boolean; item: Item; field: 'unit' | 'ncm' }>()
const emit = defineEmits<{ close: [] }>()
const store = useErpStore()
const form = reactive({ to: '', reason: '' })

watch(() => props.open, open => { if (open) Object.assign(form, { to: '', reason: '' }) })

function submit() {
  if (store.requestKeyChange(props.item.id, props.field, form.to, form.reason) !== undefined) emit('close')
}
</script>

<template>
  <BaseModal :open="open" :title="field === 'ncm' ? 'Exceção: alterar NCM' : 'Exceção: alterar unidade base'"
    subtitle="Campo-chave de item ativo. A mudança só vale depois que a gestão do cadastro aprovar, e quem solicita não aprova." @close="emit('close')">
    <form id="key-change" @submit.prevent="submit">
      <div class="field"><label>Valor atual</label><input :value="field === 'ncm' ? catalogOf(item).ncm || 'Sem NCM' : item.unit" disabled /></div>
      <div class="field"><label>Novo valor</label>
        <select v-if="field === 'ncm'" v-model="form.to" required><option value="" disabled>Escolha na tabela oficial</option><option v-for="entry in NCM_TABLE" :key="entry.code" :value="entry.code">{{ entry.code }} · {{ entry.name }}</option></select>
        <input v-else v-model="form.to" required />
      </div>
      <div class="field"><label>Justificativa</label><textarea v-model="form.reason" rows="3" required minlength="5" placeholder="Por que o campo precisa mudar e o que isso afeta" /></div>
      <p v-if="field === 'unit'" class="notice warning">Saldo, conversões e estruturas que usam este item estão na unidade atual. Confira o impacto antes de pedir.</p>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="emit('close')">Cancelar</button>
      <button class="button" type="submit" form="key-change">Enviar para aprovação</button>
    </template>
  </BaseModal>
</template>
