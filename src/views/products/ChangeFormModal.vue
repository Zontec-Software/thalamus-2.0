<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import BaseModal from '../../components/BaseModal.vue'
import { catalogOf, hasRouting } from '../../domain/catalog'
import { DISPOSITIONS } from '../../domain/engineering'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import type { EngineeringChange } from '../../types/domain'

const props = defineProps<{ open: boolean; itemId?: string; change?: EngineeringChange }>()
const emit = defineEmits<{ close: []; saved: [id: string] }>()
const store = useErpStore()
const todayIso = today()
const form = reactive({ title: '', reason: '', priority: 'Normal' as EngineeringChange['priority'], itemIds: [] as string[], disposition: 'Usar até acabar' as EngineeringChange['disposition'], effectiveDate: todayIso })
const pick = reactive({ itemId: '' })

watch(() => props.open, open => {
  if (!open) return
  const change = props.change
  Object.assign(form, change
    ? { title: change.title, reason: change.reason, priority: change.priority, itemIds: [...change.itemIds], disposition: change.disposition, effectiveDate: change.effectiveDate < todayIso ? todayIso : change.effectiveDate }
    : { title: '', reason: '', priority: 'Normal', itemIds: props.itemId ? [props.itemId] : [], disposition: 'Usar até acabar', effectiveDate: todayIso })
})

const candidates = computed(() => store.state.items
  .filter(item => !catalogOf(item).deletedAt && (hasRouting(item) || item.type === 'KT' || item.type === 'FE') && !form.itemIds.includes(item.id))
  .sort((a, b) => a.code.localeCompare(b.code)))

function addItem() {
  if (pick.itemId) form.itemIds.push(pick.itemId)
  pick.itemId = ''
}
function submit() {
  const input = { ...form, itemIds: [...form.itemIds] }
  const result = props.change ? store.updateChange(props.change.id, input) : store.createChange(input)
  if (result === undefined) return
  emit('saved', props.change?.id ?? (result as EngineeringChange).id)
  emit('close')
}
</script>

<template>
  <BaseModal :open="open" :title="change ? `Editar ${change.id}` : 'Solicitar mudança de engenharia'" subtitle="Quem pede descreve o problema. A engenharia analisa o impacto, abre as versões e aprova." width="640px" @close="emit('close')">
    <form id="change-form" @submit.prevent="submit">
      <div class="field"><label>Título</label><input v-model="form.title" required minlength="5" placeholder="Ex.: trocar parafuso da base da Mesa Lite" /></div>
      <div class="field"><label>Motivo e proposta</label><textarea v-model="form.reason" rows="3" required minlength="10" placeholder="O que acontece hoje, o que deve mudar e por quê" /></div>
      <div class="form-grid three">
        <div class="field"><label>Prioridade</label><select v-model="form.priority"><option>Normal</option><option>Urgente</option></select></div>
        <div class="field"><label>Estoque atual</label><select v-model="form.disposition"><option v-for="entry in DISPOSITIONS" :key="entry">{{ entry }}</option></select></div>
        <div class="field"><label>Efetiva a partir de</label><input v-model="form.effectiveDate" type="date" :min="todayIso" required /></div>
      </div>
      <div class="field">
        <label>Itens afetados</label>
        <div class="chip-row">
          <button v-for="id in form.itemIds" :key="id" type="button" class="chip active" title="Remover" @click="form.itemIds = form.itemIds.filter(entry => entry !== id)">{{ store.item(id).code }} ×</button>
          <span v-if="!form.itemIds.length" class="cell-sub">Nenhum item ainda.</span>
        </div>
        <div class="filter-row">
          <select v-model="pick.itemId" class="filter grow"><option value="">Incluir item…</option><option v-for="item in candidates" :key="item.id" :value="item.id">{{ item.code }} · {{ item.name }}</option></select>
          <button class="button secondary small" type="button" :disabled="!pick.itemId" @click="addItem">Incluir</button>
        </div>
      </div>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="emit('close')">Cancelar</button>
      <button class="button" type="submit" form="change-form">{{ change ? 'Salvar' : 'Solicitar' }}</button>
    </template>
  </BaseModal>
</template>
