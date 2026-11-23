<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { EFFORT_KINDS, EFFORT_REVIEWS } from '../../domain/crmEffort'
import { today } from '../../domain/engine'
import { opportunityIsOpen } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { CrmActivity, Opportunity } from '../../types/domain'
import { fmtDate } from '../../utils/format'
import ActivityEvidenceModal from './ActivityEvidenceModal.vue'
import { useCrmScope } from './shared'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const { owner, inScope } = useCrmScope()
const tab = ref<'todo' | 'done' | 'repurchase' | 'evidence'>('todo')

interface Row { opportunity: Opportunity; activity: CrmActivity }
const mine = computed<Row[]>(() => store.state.opportunities
  .filter(opportunity => inScope(opportunity.tenantId))
  .flatMap(opportunity => opportunity.activities.filter(activity => !owner.value || (activity.ownerId ?? opportunity.ownerId) === owner.value).map(activity => ({ opportunity, activity }))))
const todo = computed(() => mine.value.filter(row => !row.activity.done && row.activity.type !== 'Recompra' && opportunityIsOpen(row.opportunity)).sort((a, b) => a.activity.at.localeCompare(b.activity.at)))
const done = computed(() => mine.value.filter(row => row.activity.done).sort((a, b) => (b.activity.completedAt ?? b.activity.at).localeCompare(a.activity.completedAt ?? a.activity.at)))
const repurchase = computed(() => mine.value.filter(row => row.activity.type === 'Recompra').sort((a, b) => a.activity.at.localeCompare(b.activity.at)))
const evidence = computed(() => store.state.effortRecords.filter(entry => (!owner.value || entry.ownerId === owner.value) && entry.tenantId === ui.activeTenantId).sort((a, b) => b.date.localeCompare(a.date)))
const returned = computed(() => evidence.value.filter(entry => entry.review === 'returned').length)
const lateness = (row: Row) => row.activity.done ? 'Concluída' : row.activity.at.slice(0, 10) < today() ? 'Vencido' : row.activity.at.slice(0, 10) === today() ? 'Hoje' : 'Agendada'
const reviewLabel = (review: keyof typeof EFFORT_REVIEWS) => review === 'approved' ? 'Validada' : review === 'pending' ? 'Em conferência' : review === 'returned' ? 'Devolvida' : 'Registrada'

const completing = reactive({ opportunityId: '', activityId: '' })
const correcting = reactive({ id: '', note: '', reason: '' })
function correct() {
  if (store.correctEffort(correcting.id, correcting.note)) Object.assign(correcting, { id: '', note: '', reason: '' })
}
const open = (id: string) => router.push(`/crm/oportunidade/${id}`)
</script>

<template>
  <div class="tabs" data-tour="crm-tasks">
    <button type="button" :class="{ active: tab === 'todo' }" @click="tab = 'todo'">A fazer<b>{{ todo.length }}</b></button>
    <button type="button" :class="{ active: tab === 'done' }" @click="tab = 'done'">Concluídas</button>
    <button type="button" :class="{ active: tab === 'repurchase' }" @click="tab = 'repurchase'">Recompras<b>{{ repurchase.filter(row => !row.activity.done).length }}</b></button>
    <button type="button" :class="{ active: tab === 'evidence' }" @click="tab = 'evidence'">Minhas evidências<b v-if="returned">{{ returned }}</b></button>
  </div>

  <article v-if="tab === 'todo' || tab === 'repurchase'" class="card flush">
    <table class="dense">
      <thead><tr><th>Ação</th><th>Oportunidade</th><th>Prazo</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="row in (tab === 'todo' ? todo : repurchase)" :key="row.activity.id">
          <td><span class="cell-main">{{ row.activity.text }}</span><span class="cell-sub">{{ row.activity.type }}<template v-if="row.activity.origin === 'mcp'"> · ChatGPT via MCP</template></span></td>
          <td><button type="button" class="link" @click="open(row.opportunity.id)">{{ row.opportunity.title }}</button><span class="cell-sub">{{ store.partnerName(row.opportunity.partnerId) }}</span></td>
          <td :class="{ 'risk-text': !row.activity.done && row.activity.at.slice(0, 10) < today() }">{{ fmtDate(row.activity.at) }}</td>
          <td><StatusBadge :value="lateness(row)" /></td>
          <td><button v-if="!row.activity.done && opportunityIsOpen(row.opportunity)" class="button small" @click="Object.assign(completing, { opportunityId: row.opportunity.id, activityId: row.activity.id })">Concluir com evidência</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!(tab === 'todo' ? todo : repurchase).length" class="empty-note">{{ tab === 'todo' ? 'Nada a fazer. Registre ações na ficha da oportunidade.' : 'Nenhuma recompra combinada.' }}</p>
  </article>

  <article v-else-if="tab === 'done'" class="card flush">
    <table class="dense">
      <thead><tr><th>Ação</th><th>Oportunidade</th><th>Aconteceu em</th><th>Registrada em</th><th>Origem</th><th>Resultado</th></tr></thead>
      <tbody>
        <tr v-for="row in done" :key="row.activity.id" class="clickable" @click="open(row.opportunity.id)">
          <td><span class="cell-main">{{ row.activity.text }}</span><span class="cell-sub">{{ row.activity.type }}</span></td>
          <td>{{ row.opportunity.title }}</td>
          <td>{{ fmtDate(row.activity.completedAt ?? row.activity.at) }}</td>
          <td>{{ row.activity.registeredAt ? fmtDate(row.activity.registeredAt) : '—' }}</td>
          <td>{{ row.activity.origin === 'mcp' ? 'ChatGPT via MCP' : 'Digitada' }}</td>
          <td><span class="cell-sub">{{ row.activity.summary ?? '—' }}</span><span v-if="row.activity.attachments?.length" class="cell-sub">{{ row.activity.attachments.length }} anexo(s)</span></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!done.length" class="empty-note">Nenhuma ação concluída.</p>
  </article>

  <article v-else class="card flush">
    <p class="hint" style="padding:10px 14px 0">Só o que está registrado ou validado entra no placar. Em conferência ou devolvido fica de fora até a supervisão decidir ou você corrigir.</p>
    <table class="dense">
      <thead><tr><th>Evidência</th><th v-if="!owner">Vendedor</th><th>Dia</th><th>Cliente</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="entry in evidence" :key="entry.id">
          <td><span class="cell-main">{{ EFFORT_KINDS[entry.kind] }}</span><span class="cell-sub">{{ entry.note }}</span><span v-if="entry.reason" class="cell-sub risk-text">Devolvida: {{ entry.reason }}</span></td>
          <td v-if="!owner">{{ store.userName(entry.ownerId) }}</td>
          <td>{{ fmtDate(entry.date) }}</td>
          <td>{{ entry.partnerId ? store.partnerName(entry.partnerId) : '—' }}</td>
          <td><StatusBadge :value="reviewLabel(entry.review)" /></td>
          <td><button v-if="entry.review === 'returned' && entry.ownerId === ui.sessionUserId" class="button small" @click="Object.assign(correcting, { id: entry.id, note: entry.note, reason: entry.reason ?? '' })">Corrigir</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!evidence.length" class="empty-note">Nenhuma evidência registrada.</p>
  </article>

  <ActivityEvidenceModal :open="!!completing.activityId" :opportunity-id="completing.opportunityId" :activity-id="completing.activityId" @close="Object.assign(completing, { opportunityId: '', activityId: '' })" />
  <BaseModal :open="!!correcting.id" title="Corrigir evidência devolvida" :subtitle="correcting.reason ? `Motivo da supervisão: ${correcting.reason}` : ''" width="520px" @close="correcting.id = ''">
    <div class="field"><label>Registro corrigido</label><textarea v-model="correcting.note" rows="4"></textarea></div>
    <template #footer><button class="button secondary" @click="correcting.id = ''">Cancelar</button><button class="button" @click="correct">Reenviar para conferência</button></template>
  </BaseModal>
</template>
