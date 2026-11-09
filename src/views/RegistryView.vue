<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { REGISTRY_KINDS } from '../domain/registry'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { RegistryEntry, RegistryKind } from '../types/domain'

const store = useErpStore()
const ui = useUiStore()
const kind = ref<RegistryKind>('Origem de oportunidade')
const form = reactive({ id: '', code: '', description: '' })
const editing = ref(false)

const canManage = computed(() => store.can('modulo.cadastros_gerais.gerir'))
const entries = computed(() => store.state.registry.filter(entry => entry.tenantId === ui.activeTenantId && entry.kind === kind.value))
const countOf = (value: RegistryKind) => store.state.registry.filter(entry => entry.tenantId === ui.activeTenantId && entry.kind === value && entry.status === 'Ativo').length
const usedBy: Record<RegistryKind, string> = {
  Unidade: 'Produtos e compras',
  Moeda: 'Propostas e pedidos',
  'Condição de pagamento': 'Propostas, pedidos e locação',
  'Origem de oportunidade': 'CRM: nova oportunidade',
  'Motivo de perda': 'CRM: oportunidade perdida',
  'Motivo de recusa': 'Propostas recusadas',
}

function start(entry?: RegistryEntry) {
  Object.assign(form, entry ? { id: entry.id, code: entry.code, description: entry.description } : { id: '', code: '', description: '' })
  editing.value = true
}
function save() {
  if (store.saveRegistryEntry({ kind: kind.value, code: form.code, description: form.description, id: form.id || undefined })) editing.value = false
}
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <button v-for="value in REGISTRY_KINDS" :key="value" class="chip" :class="{ active: kind === value }" @click="kind = value; editing = false">{{ value }} <b>{{ countOf(value) }}</b></button>
    </div>
    <button v-if="canManage" data-tour="new-record" class="button" @click="start()"><Plus :size="15" /> Nova opção</button>
  </div>
  <p class="hint">Listas compartilhadas pelos módulos. Cada opção existe uma vez por empresa; inativar tira da escolha sem apagar o histórico. Usada em: {{ usedBy[kind] }}.</p>

  <article class="card flush" data-tour="record-list">
    <div v-if="editing" class="inline-form">
      <div class="form-grid">
        <div class="field"><label>Código</label><input v-model="form.code" /></div>
        <div class="field"><label>Descrição</label><input v-model="form.description" /></div>
      </div>
      <div class="filter-row"><button class="button" @click="save">Salvar</button><button class="button secondary" @click="editing = false">Cancelar</button></div>
    </div>
    <table>
      <thead><tr><th>Código</th><th>Descrição</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="entry in entries" :key="entry.id">
          <td><span class="cell-main">{{ entry.code }}</span></td>
          <td>{{ entry.description }}</td>
          <td><StatusBadge :value="entry.status" /></td>
          <td>
            <div v-if="canManage" class="filter-row">
              <button class="button secondary small" @click="start(entry)">Editar</button>
              <button class="button secondary small" @click="store.setRegistryStatus(entry.id, entry.status === 'Ativo' ? 'Inativo' : 'Ativo')">{{ entry.status === 'Ativo' ? 'Inativar' : 'Reativar' }}</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!entries.length" class="empty-note">Nenhuma opção cadastrada.</p>
  </article>
</template>
