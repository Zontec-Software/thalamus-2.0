<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircle2, FilePenLine, ShieldCheck, XCircle } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { ProductRevision } from '../types/domain'
import { fmtDate, fmtDateTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const filter = ref<'Rascunho' | 'Decididas'>('Rascunho')
const reasons = ref<Record<string, string>>({})
const validFrom = ref<Record<string, string>>({})

const revisions = computed(() => store.state.productRevisions
  .filter(entry => filter.value === 'Rascunho' ? entry.status === 'Rascunho' : entry.status !== 'Rascunho' && entry.createdBy !== 'Carga inicial')
  .sort((a, b) => (b.releasedAt ?? b.rejectedAt ?? b.createdAt).localeCompare(a.releasedAt ?? a.rejectedAt ?? a.createdAt)))
const drafts = computed(() => store.state.productRevisions.filter(entry => entry.status === 'Rascunho'))
const canRelease = computed(() => store.can('produtos.revisao.liberar'))
const ownDraft = (revision: ProductRevision) => revision.createdBy === ui.userName
const pendingChecks = (revision: ProductRevision) => revision.checklist.filter(entry => !entry.done).length
const project = (revision: ProductRevision) => revision.projectId ? store.state.projects.find(entry => entry.id === revision.projectId) : undefined

function release(revision: ProductRevision) {
  store.releaseRevision(revision.id, validFrom.value[revision.id] || undefined)
}
function reject(revision: ProductRevision) {
  if (store.rejectRevision(revision.id, reasons.value[revision.id] ?? '')) reasons.value[revision.id] = ''
}
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <button class="chip" :class="{ active: filter === 'Rascunho' }" @click="filter = 'Rascunho'">Aguardando decisão <b>{{ drafts.length }}</b></button>
      <button class="chip" :class="{ active: filter === 'Decididas' }" @click="filter = 'Decididas'">Decididas</button>
    </div>
    <p>Estrutura e roteiro mudam por versão. Quem elabora não libera: a decisão é de outra pessoa, e a rejeição exige motivo.</p>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Em rascunho <FilePenLine :size="17" /></div><strong>{{ drafts.length }}</strong><small>Aguardam liberação ou rejeição</small></article>
    <article class="metric"><div class="metric-head">Checklist incompleto <ShieldCheck :size="17" /></div><strong :class="{ 'risk-text': drafts.some(entry => pendingChecks(entry)) }">{{ drafts.filter(entry => pendingChecks(entry)).length }}</strong><small>Não liberam até conferir</small></article>
    <article class="metric"><div class="metric-head">Liberadas <CheckCircle2 :size="17" /></div><strong>{{ store.state.productRevisions.filter(entry => entry.status === 'Liberada').length }}</strong><small>Vigentes nos itens</small></article>
    <article class="metric"><div class="metric-head">Rejeitadas <XCircle :size="17" /></div><strong>{{ store.state.productRevisions.filter(entry => entry.status === 'Rejeitada').length }}</strong><small>Com motivo registrado</small></article>
  </section>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Item</th><th>Versão</th><th>Elaborada por</th><th>Checklist</th><th>Situação</th><th>{{ filter === 'Rascunho' ? 'Decisão' : 'Decidida por' }}</th></tr></thead>
      <tbody>
        <tr v-for="revision in revisions" :key="revision.id">
          <td>
            <RouterLink class="cell-main" :to="`/produtos/item/${revision.itemId}`">{{ store.item(revision.itemId).code }}</RouterLink>
            <span class="cell-sub">{{ store.item(revision.itemId).name }}{{ project(revision) ? ` · ${project(revision)!.id}` : '' }}</span>
          </td>
          <td><span class="cell-main">{{ revision.code }}</span><span class="cell-sub">{{ revision.notes }}</span></td>
          <td>{{ revision.createdBy ?? '—' }}<span class="cell-sub">{{ fmtDateTime(revision.createdAt) }}</span></td>
          <td><StatusBadge :value="pendingChecks(revision) ? `${pendingChecks(revision)} pendente(s)` : 'Conferido'" :tone="pendingChecks(revision) ? 'warning' : 'success'" /></td>
          <td><StatusBadge :value="revision.status" /><span v-if="revision.rejectionReason" class="cell-sub">{{ revision.rejectionReason }}</span></td>
          <td v-if="revision.status === 'Rascunho'">
            <p v-if="ownDraft(revision)" class="cell-sub">Você elaborou: a decisão é de outra pessoa.</p>
            <p v-else-if="!canRelease" class="cell-sub">Decide quem libera revisão.</p>
            <div v-else class="filter-row">
              <input v-model="validFrom[revision.id]" class="filter" type="date" title="Vigência a partir de" />
              <button class="button small" :disabled="pendingChecks(revision) > 0" @click="release(revision)">Liberar</button>
              <input v-model="reasons[revision.id]" class="filter" placeholder="Motivo da rejeição" />
              <button class="button secondary small" :disabled="!reasons[revision.id]?.trim()" @click="reject(revision)">Rejeitar</button>
            </div>
          </td>
          <td v-else>{{ revision.releasedBy ?? revision.rejectedBy ?? '—' }}<span class="cell-sub">{{ revision.validFrom ? `vigente desde ${fmtDate(revision.validFrom)}` : '' }}</span></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!revisions.length" class="empty-note">{{ filter === 'Rascunho' ? 'Nenhuma versão aguardando decisão.' : 'Nenhuma versão decidida ainda.' }}</p>
  </article>
</template>
