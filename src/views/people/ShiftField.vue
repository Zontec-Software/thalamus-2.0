<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseModal from '../../components/BaseModal.vue'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{ modelValue: string; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const MANAGE = '__catalog__'
const store = useErpStore()
const ui = useUiStore()
const open = ref(false)
const busy = ref('')
const draft = ref('')
const shifts = computed(() => store.state.shifts
  .filter(entry => entry.tenantId === ui.activeTenantId)
  .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')))

function choose(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value === MANAGE) {
    select.value = props.modelValue
    open.value = true
    return
  }
  emit('update:modelValue', select.value)
}
function close() {
  if (busy.value) return
  open.value = false
}
function add() {
  if (busy.value || !draft.value.trim()) return
  busy.value = 'novo'
  try {
    const created = store.createShift(ui.activeTenantId, draft.value)
    if (created && created !== true) {
      if (!shifts.value.some(entry => entry.name === props.modelValue)) emit('update:modelValue', created.name)
      draft.value = ''
    }
  } finally {
    busy.value = ''
  }
}
function rename(id: string, previous: string, name: string) {
  const next = name.trim()
  if (busy.value || !next || next === previous) return
  busy.value = id
  try {
    const saved = store.renameShift(id, next)
    if (saved && saved !== true && props.modelValue.toLocaleLowerCase('pt-BR') === previous.toLocaleLowerCase('pt-BR')) emit('update:modelValue', saved.name)
  } finally {
    busy.value = ''
  }
}
function drop(id: string, name: string) {
  if (busy.value) return
  busy.value = id
  try {
    const removed = store.removeShift(id)
    if (removed && props.modelValue.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')) emit('update:modelValue', '')
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <select :value="modelValue" :disabled="disabled" @change="choose">
    <option v-if="modelValue && !shifts.some(entry => entry.name === modelValue)" :value="modelValue">{{ modelValue }}</option>
    <option v-for="shift in shifts" :key="shift.id" :value="shift.name">{{ shift.name }}</option>
    <option :value="MANAGE">Criar e editar turnos</option>
  </select>
  <BaseModal :open="open" title="Turnos" subtitle="A lista desta empresa. Não há hierarquia." width="520px" @close="close">
    <div class="level-list">
      <div v-for="shift in shifts" :key="shift.id" class="level-line">
        <input :value="shift.name" :disabled="!!busy" @change="rename(shift.id, shift.name, ($event.target as HTMLInputElement).value)" />
        <button class="button ghost small" type="button" :disabled="!!busy" @click="drop(shift.id, shift.name)">Remover</button>
      </div>
      <p v-if="!shifts.length" class="empty-note">Nenhum turno nesta empresa.</p>
      <div class="level-line">
        <input v-model="draft" placeholder="Ex.: Noite" :disabled="!!busy" @keyup.enter="add" />
        <button class="button secondary small" type="button" :disabled="!!busy || !draft.trim()" @click="add">{{ busy === 'novo' ? 'Incluindo…' : 'Incluir' }}</button>
      </div>
    </div>
    <p v-if="busy && busy !== 'novo'" class="hint">Salvando o turno…</p>
    <template #footer>
      <button class="button" type="button" :disabled="!!busy" @click="close">Fechar</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.level-list { display: flex; flex-direction: column; gap: 8px; }
.level-line { display: flex; align-items: center; gap: 8px; }
.level-line input { flex: 1; min-width: 0; width: auto; border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; background: #fbfcfb; font-size: 13px; }
.level-line .button { flex: none; }
</style>
