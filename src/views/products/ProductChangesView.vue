<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import { CHANGE_STAGES } from '../../domain/engineering'
import { useErpStore } from '../../stores/erp'
import ChangeDetail from './ChangeDetail.vue'
import ChangeFormModal from './ChangeFormModal.vue'

const store = useErpStore()
const showRefused = ref(false)
const columns = computed(() => [...CHANGE_STAGES, ...(showRefused.value ? ['Recusada' as const] : [])].map(stage => ({
  stage,
  cards: store.state.engineeringChanges.filter(change => change.stage === stage).sort((a, b) => (a.priority === 'Urgente' ? 0 : 1) - (b.priority === 'Urgente' ? 0 : 1) || a.effectiveDate.localeCompare(b.effectiveDate)),
})))
const refused = computed(() => store.state.engineeringChanges.filter(change => change.stage === 'Recusada').length)
const selectedId = ref('')
const selected = computed(() => store.state.engineeringChanges.find(change => change.id === selectedId.value))
const creating = ref(false)
const HINT: Record<string, string> = {
  Solicitada: 'Problema descrito, aguardando a engenharia.',
  'Em análise': 'Impacto avaliado e versões abertas em rascunho.',
  Aprovada: 'Pronta para liberar na data de efetividade.',
  Implementada: 'Versões liberadas; histórico preservado.',
  Recusada: 'Encerrada com motivo.',
}
const drafts = (itemIds: string[], changeId: string) => store.state.productRevisions.filter(entry => itemIds.includes(entry.itemId) && entry.changeId === changeId).length
</script>

<template>
  <section class="card">
    <div class="section-head" style="margin-top:0">
      <div>
        <h2>Mudanças de engenharia</h2>
        <p>Toda alteração de estrutura, roteiro ou ferramental com impacto em estoque, OP ou pedido passa por aqui. A versão só vale depois da implementação.</p>
      </div>
      <div class="filter-row" style="margin:0">
        <label v-if="refused" class="cell-sub"><input v-model="showRefused" type="checkbox" /> Recusadas ({{ refused }})</label>
        <button class="button" data-tour="changes-new" @click="creating = true"><Plus :size="14" /> Solicitar mudança</button>
      </div>
    </div>
    <div class="kanban-board" data-tour="changes-board">
      <div v-for="column in columns" :key="column.stage" class="kanban-column">
        <header><b>{{ column.stage }}</b><span>{{ column.cards.length }}</span></header>
        <small class="cell-sub">{{ HINT[column.stage] }}</small>
        <button v-for="change in column.cards" :key="change.id" class="kanban-card" :class="{ urgent: change.priority === 'Urgente' }" @click="selectedId = change.id">
          <span class="eyebrow">{{ change.id }}<template v-if="change.priority === 'Urgente'"> · urgente</template></span>
          <strong>{{ change.title }}</strong>
          <span class="cell-sub">{{ change.itemIds.map(id => store.item(id).code).join(', ') }}</span>
          <footer>
            <span>efetiva {{ change.effectiveDate.split('-').reverse().join('/') }}</span>
            <span v-if="column.stage !== 'Solicitada'">{{ drafts(change.itemIds, change.id) }}/{{ change.itemIds.length }} versões</span>
          </footer>
        </button>
        <p v-if="!column.cards.length" class="empty-note">Nada aqui.</p>
      </div>
    </div>
  </section>

  <BaseModal :open="!!selected" :title="selected?.id ?? ''" width="min(980px, 94vw)" @close="selectedId = ''">
    <ChangeDetail v-if="selected" :change="selected" />
  </BaseModal>
  <ChangeFormModal :open="creating" @close="creating = false" @saved="id => selectedId = id" />
</template>
