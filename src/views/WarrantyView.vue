<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from 'vue'
import { CalendarClock, ShieldAlert, ShieldCheck } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { DEFAULT_WARRANTY_MONTHS, warrantyPolicy, warrantyStatus } from '../domain/aftersales'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { Warranty, WarrantyPolicy, WarrantyStatus } from '../types/domain'
import { daysUntil, fmtDate, fmtDateTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const filter = ref<'' | WarrantyStatus>('')
const notes = ref<Record<string, string>>({})
const policy = computed(() => warrantyPolicy(store.state, ui.activeTenantId) ?? { tenantId: ui.activeTenantId, months: DEFAULT_WARRANTY_MONTHS, terms: '' } as WarrantyPolicy)
const form = reactive({ months: 12, terms: '' })
watchEffect(() => Object.assign(form, { months: policy.value.months, terms: policy.value.terms }))

const canManage = computed(() => store.can('modulo.garantia.gerir'))
const canApprove = computed(() => store.can('garantia.regra.aprovar'))
const all = computed(() => store.state.warranties.filter(entry => entry.tenantId === ui.activeTenantId))
const warranties = computed(() => all.value.filter(entry => !filter.value || warrantyStatus(entry) === filter.value))
const count = (status: WarrantyStatus) => all.value.filter(entry => warrantyStatus(entry) === status).length
const dirty = computed(() => form.months !== policy.value.months || form.terms !== policy.value.terms)

function change(warranty: Warranty, status: 'Suspensa' | 'Encerrada' | 'Ativa') {
  if (store.setWarrantyStatus(warranty.id, status, notes.value[warranty.id] ?? '')) notes.value[warranty.id] = ''
}
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <button class="chip" :class="{ active: !filter }" @click="filter = ''">Todas <b>{{ all.length }}</b></button>
      <button v-for="status in (['Pendente', 'Ativa', 'Vencida', 'Suspensa', 'Encerrada'] as const)" :key="status" class="chip" :class="{ active: filter === status }" @click="filter = status">{{ status }} <b>{{ count(status) }}</b></button>
    </div>
    <p>A garantia nasce na entrega confirmada. A assistência consulta a cobertura antes de abrir o chamado.</p>
  </div>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Ativas <ShieldCheck :size="17" /></div><strong>{{ count('Ativa') }}</strong><small>Cobrem chamado sem custo</small></article>
    <article class="metric"><div class="metric-head">Pendentes <ShieldAlert :size="17" /></div><strong :class="{ 'risk-text': count('Pendente') }">{{ count('Pendente') }}</strong><small>Esperam a regra ser aprovada</small></article>
    <article class="metric"><div class="metric-head">Vencem em 30 dias <CalendarClock :size="17" /></div><strong>{{ all.filter(entry => warrantyStatus(entry) === 'Ativa' && daysUntil(entry.endsOn) <= 30).length }}</strong><small>Oportunidade de contrato</small></article>
  </section>

  <article class="card" data-tour="warranty-policy">
    <div class="section-head">
      <div><h2>Regra de garantia da empresa</h2><p>{{ policy.approvedBy ? `Aprovada por ${policy.approvedBy} em ${fmtDateTime(policy.approvedAt!)}` : 'Ainda não aprovada: as garantias nascem Pendentes e a cobertura é só sugerida.' }}</p></div>
      <StatusBadge :value="policy.approvedBy ? 'Aprovada' : 'Pendente'" />
    </div>
    <div class="form-grid">
      <div class="field"><label>Prazo (meses)</label><input v-model.number="form.months" type="number" min="1" :disabled="!canManage" /></div>
      <div class="field"><label>Condições</label><input v-model="form.terms" :disabled="!canManage" /></div>
    </div>
    <div class="filter-row">
      <button v-if="canManage" class="button secondary" :disabled="!dirty" @click="store.setWarrantyPolicy({ ...form })">Salvar regra</button>
      <button v-if="canApprove && !policy.approvedBy" class="button" :disabled="dirty" @click="store.approveWarrantyPolicy()">Aprovar regra</button>
      <small v-if="dirty" class="hint">Mudar a regra desfaz a aprovação.</small>
    </div>
  </article>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Garantia</th><th>Cliente</th><th>Item</th><th>Vigência</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="warranty in warranties" :key="warranty.id">
          <td><span class="cell-main">{{ warranty.id }}</span><span class="cell-sub">{{ warranty.salesOrderId }}</span></td>
          <td>{{ store.partnerName(warranty.partnerId) }}</td>
          <td>{{ store.itemLabel(warranty.itemId) }}</td>
          <td>{{ fmtDate(warranty.startsOn) }} a {{ fmtDate(warranty.endsOn) }}<span class="cell-sub">{{ warranty.terms }}</span></td>
          <td><StatusBadge :value="warrantyStatus(warranty)" /><span v-if="warranty.note" class="cell-sub">{{ warranty.note }}</span></td>
          <td>
            <div v-if="canManage && warranty.status !== 'Encerrada' && warranty.status !== 'Pendente'" class="filter-row">
              <input v-model="notes[warranty.id]" class="filter" placeholder="Motivo" />
              <button v-if="warranty.status === 'Ativa'" class="button secondary small" :disabled="!notes[warranty.id]?.trim()" @click="change(warranty, 'Suspensa')">Suspender</button>
              <button v-else class="button secondary small" :disabled="!notes[warranty.id]?.trim()" @click="change(warranty, 'Ativa')">Reativar</button>
              <button class="button secondary small" :disabled="!notes[warranty.id]?.trim()" @click="change(warranty, 'Encerrada')">Encerrar</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!warranties.length" class="empty-note">Nenhuma garantia neste filtro.</p>
  </article>
</template>
