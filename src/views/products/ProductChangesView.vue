<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import { useErpStore } from '../../stores/erp'
import type { ChangeStage } from '../../types/domain'
import ChangeDetail from './ChangeDetail.vue'
import ChangeFormModal from './ChangeFormModal.vue'

const store = useErpStore()
const showClosed = ref(false)
const selectedId = ref('')
const creating = ref(false)
const TONE: Record<ChangeStage, string> = {
  Solicitada: 'warning',
  'Em análise': 'info',
  Aprovada: 'warning',
  Implementada: 'success',
  Recusada: 'danger',
}
const closed = (stage: ChangeStage) => stage === 'Implementada' || stage === 'Recusada'
const rows = computed(() => store.state.engineeringChanges
  .filter(change => showClosed.value || !closed(change.stage))
  .sort((a, b) => (a.priority === 'Urgente' ? 0 : 1) - (b.priority === 'Urgente' ? 0 : 1) || a.effectiveDate.localeCompare(b.effectiveDate)))
const openCount = computed(() => store.state.engineeringChanges.filter(change => !closed(change.stage)).length)
const selected = computed(() => store.state.engineeringChanges.find(change => change.id === selectedId.value))
const dateOf = (value: string) => value.split('-').reverse().join('/')
const drafts = (itemIds: string[], changeId: string) => store.state.productRevisions.filter(entry => itemIds.includes(entry.itemId) && entry.changeId === changeId).length
</script>

<template>
  <article class="card flush" data-tour="changes-board">
    <div class="orc-card-head">
      <div>
        <h2>Mudanças em aberto</h2>
        <p>Uma linha por mudança. Abra para ver o impacto, aprovar ou implementar. A versão só vale depois da implementação.</p>
      </div>
      <div class="filter-row" style="margin:0">
        <label class="cell-sub"><input v-model="showClosed" type="checkbox" /> Encerradas</label>
        <button class="button" data-tour="changes-new" @click="creating = true"><Plus :size="14" /> Solicitar mudança</button>
      </div>
    </div>
    <table v-if="rows.length">
      <thead><tr><th>Mudança</th><th>Itens</th><th>Prioridade</th><th>Efetiva</th><th>Versões</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="change in rows" :key="change.id" class="clickable" @click="selectedId = change.id">
          <td><span class="cell-main">{{ change.title }}</span><span class="cell-sub code">{{ change.id }}</span></td>
          <td>{{ change.itemIds.map(id => store.item(id).code).join(', ') }}</td>
          <td>{{ change.priority }}</td>
          <td>{{ dateOf(change.effectiveDate) }}</td>
          <td>{{ change.stage === 'Solicitada' ? '—' : `${drafts(change.itemIds, change.id)}/${change.itemIds.length}` }}</td>
          <td><span class="status" :class="TONE[change.stage]">{{ change.stage }}</span></td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty-note">{{ openCount ? 'Nenhuma mudança encerrada.' : 'Nenhuma mudança em aberto.' }}</p>
  </article>

  <BaseModal :open="!!selected" :title="selected?.id ?? ''" width="min(980px, 94vw)" @close="selectedId = ''">
    <ChangeDetail v-if="selected" :change="selected" />
  </BaseModal>
  <ChangeFormModal :open="creating" @close="creating = false" @saved="id => selectedId = id" />
</template>
