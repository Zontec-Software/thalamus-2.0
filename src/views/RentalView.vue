<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CalendarClock, FileSignature, Plus, Truck } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { RENTAL_BILLINGS, rentalAlerts, rentalStatus } from '../domain/aftersales'
import { ASSET_CONDITIONS } from '../domain/patrimony'
import { registryOptions } from '../domain/registry'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { AssetCondition, RentalContract, RentalStatus } from '../types/domain'
import { fmtCurrency, fmtDate } from '../utils/format'

const addDaysIso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
const store = useErpStore()
const ui = useUiStore()
const filter = ref<'' | RentalStatus>('')
const creating = ref(false)
const editing = ref('')
const draft = reactive({ partnerId: '', startsOn: addDaysIso(7), endsOn: addDaysIso(97), note: '' })
const terms = reactive<Partial<Pick<RentalContract, 'assetId' | 'amount' | 'billing' | 'paymentTerms'>>>({})
const reasons = ref<Record<string, string>>({})
const returns = ref<Record<string, { condition: AssetCondition; note: string }>>({})

const all = computed(() => store.state.rentalContracts.filter(entry => entry.tenantId === ui.activeTenantId))
const contracts = computed(() => all.value.filter(entry => !filter.value || rentalStatus(entry) === filter.value))
const count = (status: RentalStatus) => all.value.filter(entry => rentalStatus(entry) === status).length
const customers = computed(() => store.state.partners.filter(entry => entry.roles.includes('Cliente')))
const rentableAssets = computed(() => store.state.assets.filter(entry => entry.rentable))
const paymentTerms = computed(() => registryOptions(store.state, 'Condição de pagamento', ui.activeTenantId))
const canManage = computed(() => store.can('modulo.locacao.gerir'))
const canApprove = computed(() => store.can('locacao.contrato.aprovar'))
const assetName = (id?: string) => id ? store.state.assets.find(entry => entry.id === id)?.name ?? id : '—'
const missing = (contract: RentalContract) => [
  !contract.assetId && 'bem', !(Number(contract.amount) > 0) && 'valor', !contract.billing && 'cobrança', !contract.paymentTerms && 'condição de pagamento',
].filter(Boolean).join(', ')

function create() {
  if (store.createRental({ ...draft })) {
    creating.value = false
    Object.assign(draft, { partnerId: '', note: '' })
  }
}
function edit(contract: RentalContract) {
  editing.value = contract.id
  Object.assign(terms, { assetId: contract.assetId, amount: contract.amount, billing: contract.billing, paymentTerms: contract.paymentTerms })
}
function saveTerms(contract: RentalContract) {
  if (store.updateRental(contract.id, { ...terms })) editing.value = ''
}
function startReturn(contract: RentalContract) {
  returns.value[contract.id] = { condition: 'Bom', note: '' }
}
function finishReturn(contract: RentalContract) {
  const entry = returns.value[contract.id]
  if (entry && store.returnRental(contract.id, entry.condition, entry.note)) delete returns.value[contract.id]
}
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <button class="chip" :class="{ active: !filter }" @click="filter = ''">Todos <b>{{ all.length }}</b></button>
      <button v-for="status in (['Proposta', 'Ativo', 'Atrasado', 'Encerrado', 'Cancelado'] as const)" :key="status" class="chip" :class="{ active: filter === status }" @click="filter = status">{{ status }} <b>{{ count(status) }}</b></button>
    </div>
    <button v-if="canManage" data-tour="new-record" class="button" @click="creating = !creating"><Plus :size="15" /> Nova locação</button>
  </div>
  <p class="hint">Nasce como proposta. Só fica ativa com bem locável e disponível, valor, cobrança, condição de pagamento e aprovação de outra pessoa.</p>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Propostas <FileSignature :size="17" /></div><strong>{{ count('Proposta') }}</strong><small>Aguardam condições e aprovação</small></article>
    <article class="metric"><div class="metric-head">Bens no cliente <Truck :size="17" /></div><strong>{{ count('Ativo') + count('Atrasado') }}</strong><small>{{ rentableAssets.length }} bens locáveis</small></article>
    <article class="metric"><div class="metric-head">Retorno em 7 dias ou atrasado <CalendarClock :size="17" /></div><strong :class="{ 'risk-text': count('Atrasado') }">{{ rentalAlerts(store.state).length }}</strong><small>{{ count('Atrasado') }} atrasado(s)</small></article>
  </section>

  <article v-if="creating" class="card">
    <div class="section-head"><div><h2>Nova proposta de locação</h2><p>Bem e condições podem ser definidos depois, antes da aprovação.</p></div></div>
    <div class="form-grid">
      <div class="field"><label>Cliente</label><select v-model="draft.partnerId"><option value="">Escolha</option><option v-for="partner in customers" :key="partner.id" :value="partner.id">{{ partner.name }}</option></select></div>
      <div class="field"><label>Observação</label><input v-model="draft.note" /></div>
      <div class="field"><label>Início</label><input v-model="draft.startsOn" type="date" /></div>
      <div class="field"><label>Fim previsto</label><input v-model="draft.endsOn" type="date" /></div>
    </div>
    <div class="filter-row"><button class="button" @click="create">Criar proposta</button><button class="button secondary" @click="creating = false">Cancelar</button></div>
  </article>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Contrato</th><th>Cliente</th><th>Bem</th><th>Período</th><th>Condições</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <template v-for="contract in contracts" :key="contract.id">
          <tr>
            <td><span class="cell-main">{{ contract.id }}</span><span class="cell-sub">{{ contract.opportunityId ?? '' }} · proposto por {{ contract.createdBy }}</span></td>
            <td>{{ store.partnerName(contract.partnerId) }}</td>
            <td>{{ assetName(contract.assetId) }}<span v-if="contract.conditionIn" class="cell-sub">retorno: {{ contract.conditionIn }}</span></td>
            <td>{{ fmtDate(contract.startsOn) }} a {{ fmtDate(contract.expectedReturnOn) }}<span v-if="contract.returnedOn" class="cell-sub">devolvido em {{ fmtDate(contract.returnedOn) }}</span></td>
            <td>
              <template v-if="contract.amount">{{ fmtCurrency(contract.amount) }} · {{ contract.billing ?? '—' }}<span class="cell-sub">{{ contract.paymentTerms }}</span></template>
              <span v-if="contract.status === 'Proposta' && missing(contract)" class="cell-sub risk-text">Falta: {{ missing(contract) }}</span>
            </td>
            <td><StatusBadge :value="rentalStatus(contract)" /><span v-if="contract.approvedBy" class="cell-sub">aprovado por {{ contract.approvedBy }}</span><span v-if="contract.cancelReason" class="cell-sub">{{ contract.cancelReason }}</span></td>
            <td>
              <div v-if="contract.status === 'Proposta'" class="filter-row">
                <button v-if="canManage" class="button secondary small" @click="edit(contract)">Condições</button>
                <button v-if="canApprove" class="button small" :disabled="contract.createdBy === ui.userName || !!missing(contract)" :title="contract.createdBy === ui.userName ? 'Quem propôs não aprova' : ''" @click="store.activateRental(contract.id)">Aprovar e ativar</button>
                <input v-if="canManage" v-model="reasons[contract.id]" class="filter" placeholder="Motivo do cancelamento" />
                <button v-if="canManage" class="button secondary small" :disabled="!reasons[contract.id]?.trim()" @click="store.cancelRental(contract.id, reasons[contract.id])">Cancelar</button>
              </div>
              <div v-else-if="contract.status === 'Ativo' && canManage" class="filter-row">
                <button v-if="!returns[contract.id]" class="button small" @click="startReturn(contract)">Registrar retorno</button>
                <template v-else>
                  <select v-model="returns[contract.id].condition" class="filter"><option v-for="condition in ASSET_CONDITIONS" :key="condition">{{ condition }}</option></select>
                  <input v-model="returns[contract.id].note" class="filter" :placeholder="returns[contract.id].condition === 'Bom' ? 'Observação' : 'Descreva a avaria'" />
                  <button class="button small" @click="finishReturn(contract)">Confirmar</button>
                </template>
              </div>
            </td>
          </tr>
          <tr v-if="editing === contract.id">
            <td colspan="7">
              <div class="inline-form">
                <div class="form-grid">
                  <div class="field"><label>Bem</label><select v-model="terms.assetId"><option :value="undefined">Escolha</option><option v-for="asset in rentableAssets" :key="asset.id" :value="asset.id">{{ asset.name }} · {{ asset.status ?? 'Operando' }}</option></select></div>
                  <div class="field"><label>Valor</label><input v-model.number="terms.amount" type="number" min="0" /></div>
                  <div class="field"><label>Cobrança</label><select v-model="terms.billing"><option :value="undefined">Escolha</option><option v-for="billing in RENTAL_BILLINGS" :key="billing">{{ billing }}</option></select></div>
                  <div class="field"><label>Condição de pagamento</label><select v-model="terms.paymentTerms"><option :value="undefined">Escolha</option><option v-for="option in paymentTerms" :key="option">{{ option }}</option></select></div>
                </div>
                <div class="filter-row"><button class="button" @click="saveTerms(contract)">Salvar condições</button><button class="button secondary" @click="editing = ''">Fechar</button></div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
    <p v-if="!contracts.length" class="empty-note">Nenhum contrato neste filtro.</p>
  </article>
</template>
