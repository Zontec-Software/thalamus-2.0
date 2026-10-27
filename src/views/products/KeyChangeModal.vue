<script setup lang="ts">
import { reactive, watch } from 'vue'
import BaseModal from '../../components/BaseModal.vue'
import { NCM_TABLE, catalogOf, classLabel, classOptions } from '../../domain/catalog'
import { useErpStore } from '../../stores/erp'
import type { Item, KeyChangeRequest } from '../../types/domain'

const props = defineProps<{ open: boolean; item: Item; field: KeyChangeRequest['field'] }>()
const emit = defineEmits<{ close: [] }>()
const store = useErpStore()
const form = reactive({ to: '', reason: '', originModule: 'OS', originId: '' })
const TITLE: Record<KeyChangeRequest['field'], string> = { ncm: 'Alterar NCM', unit: 'Alterar unidade base', name: 'Alterar descrição', class: 'Alterar classificação' }

watch(() => props.open, open => { if (open) Object.assign(form, { to: '', reason: '', originModule: 'OS', originId: '' }) })

const current = () => {
  if (props.field === 'ncm') return catalogOf(props.item).ncm || 'Sem NCM'
  if (props.field === 'unit') return props.item.unit
  if (props.field === 'name') return props.item.name
  return classLabel(store.state, catalogOf(props.item).classId)
}

function submit() {
  if (store.requestKeyChange(props.item.id, props.field, form.to, form.reason, { module: form.originModule, id: form.originId }) !== undefined) emit('close')
}
</script>

<template>
  <BaseModal :open="open" :title="TITLE[field]"
    subtitle="Produto ativo. O valor vigente continua até a aprovação. A solicitação precisa apontar um documento de outra área." @close="emit('close')">
    <form id="key-change" @submit.prevent="submit">
      <div class="field"><label>Valor atual</label><input :value="current()" disabled /></div>
      <div class="field"><label>Novo valor</label>
        <select v-if="field === 'ncm'" v-model="form.to" required><option value="" disabled>Escolha na tabela oficial</option><option v-for="entry in NCM_TABLE" :key="entry.code" :value="entry.code">{{ entry.code }} · {{ entry.name }}</option></select>
        <select v-else-if="field === 'class'" v-model="form.to" required><option value="" disabled>Escolha a classificação</option><option v-for="entry in classOptions(store.state)" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select>
        <input v-else v-model="form.to" required />
      </div>
      <div class="form-grid">
        <div class="field"><label>Origem</label>
          <select v-model="form.originModule" required>
            <option>OS</option><option>OP</option><option>PAP</option><option>Oportunidade</option><option>Outro documento</option>
          </select>
        </div>
        <div class="field"><label>Documento</label><input v-model="form.originId" required placeholder="Ex.: OS-18" /></div>
      </div>
      <div class="field"><label>Motivo</label><textarea v-model="form.reason" rows="3" required minlength="5" placeholder="Por que o campo precisa mudar" /></div>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="emit('close')">Cancelar</button>
      <button class="button" type="submit" form="key-change">Enviar para aprovação</button>
    </template>
  </BaseModal>
</template>
