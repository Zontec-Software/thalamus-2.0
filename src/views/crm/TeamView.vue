<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import BaseModal from '../../components/BaseModal.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { COMMERCIAL_CLASSES, partnersWithoutOwner } from '../../domain/crmRoutine'
import { EFFORT_KINDS, EFFORT_PROFILES, currentOwnerOf, effortRuleFor, effortSnapshot, recentWeeks } from '../../domain/crmEffort'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import type { CommercialClass, EffortIndicatorRule, EffortProfile } from '../../types/domain'
import { fmtDate } from '../../utils/format'
import EffortWeekCard from './EffortWeekCard.vue'
import { useCrmScope } from './shared'

const store = useErpStore()
const { tenantIds, tenantName, grouped } = useCrmScope()
const tab = ref<'week' | 'review' | 'portfolio' | 'rules'>('week')
const weeks = recentWeeks(8)
const weekStart = ref(weeks[0].start)
const week = computed(() => weeks.find(entry => entry.start === weekStart.value) ?? weeks[0])
const canRules = computed(() => store.can('crm.regua.gerir'))
const canPortfolio = computed(() => store.can('crm.carteira.gerir'))

const sellers = computed(() => store.crmSellers(tenantIds.value))
const rows = computed(() => sellers.value.map(link => ({ link, snapshot: effortSnapshot(store.state, link, week.value) })))
const selected = ref('')
const selectedRow = computed(() => rows.value.find(entry => entry.link.id === selected.value))

const pending = computed(() => store.state.effortRecords.filter(entry => entry.review === 'pending' && tenantIds.value.includes(entry.tenantId) && sellers.value.some(link => link.userId === entry.ownerId && link.tenantId === entry.tenantId))
  .sort((a, b) => a.date.localeCompare(b.date)))
const returning = reactive({ id: '', reason: '' })
const validate = (id: string) => store.reviewEffort(id, 'validate')
function giveBack() {
  if (store.reviewEffort(returning.id, 'return', returning.reason)) Object.assign(returning, { id: '', reason: '' })
}

const orphans = computed(() => partnersWithoutOwner(store.state))
const ownerChoice = reactive<Record<string, string>>({})
const classChoice = reactive<Record<string, CommercialClass>>({})
const assign = (id: string) => ownerChoice[id] && store.assignPartnerOwner(id, ownerChoice[id], today())
const classify = (id: string) => classChoice[id] && store.setCommercialClass(id, classChoice[id])
const clients = computed(() => store.state.partners.filter(entry => entry.status === 'Ativo' && entry.roles.includes('Cliente')))
const unclassified = computed(() => clients.value.filter(entry => !entry.commercialClass || entry.commercialClass === 'A classificar'))
const sellerOptions = computed(() => store.state.sellerLinks.filter(entry => tenantIds.value.includes(entry.tenantId)))

const profiles = Object.keys(EFFORT_PROFILES) as EffortProfile[]
const editing = reactive({ open: false, profile: 'carteira' as EffortProfile, since: today(), greenAt: 3, indicators: [] as EffortIndicatorRule[] })
function editRule(profile: EffortProfile) {
  const tenantId = tenantIds.value[0]
  const rule = effortRuleFor(store.state, tenantId, profile, today())
  Object.assign(editing, { open: true, profile, since: today(), greenAt: rule?.greenAt ?? 3, indicators: (rule?.indicators ?? []).map(entry => ({ ...entry })) })
}
function saveRule() {
  if (store.saveEffortRule({ tenantId: tenantIds.value[0], profile: editing.profile, since: editing.since, greenAt: editing.greenAt, indicators: editing.indicators })) editing.open = false
}
const ruleFor = (profile: EffortProfile) => effortRuleFor(store.state, tenantIds.value[0], profile, today())

const link = reactive({ open: false, userId: '', profile: 'carteira' as EffortProfile, team: true, since: today() })
function newLink() {
  Object.assign(link, { open: true, userId: '', profile: 'carteira', team: true, since: today() })
}
function editLink(entry: { userId: string; profile: EffortProfile; team: boolean; since: string }) {
  Object.assign(link, { open: true, userId: entry.userId, profile: entry.profile, team: entry.team, since: entry.since })
}
function saveLink() {
  if (store.saveSellerLink({ tenantId: tenantIds.value[0], userId: link.userId, profile: link.profile, team: link.team, since: link.since })) link.open = false
}
const linkable = computed(() => store.state.users.filter(entry => !entry.platformMaster && entry.active !== false))
</script>

<template>
  <p class="notice">A semana vai de segunda a domingo e a data da interação define em que semana ela cai. Registro em conferência ou devolvido fica fora do placar. Ninguém valida o próprio registro.</p>

  <div class="tab-row">
    <div class="tabs" data-tour="crm-team">
      <button type="button" :class="{ active: tab === 'week' }" @click="tab = 'week'">Semana</button>
      <button type="button" :class="{ active: tab === 'review' }" @click="tab = 'review'">Conferência<b v-if="pending.length">{{ pending.length }}</b></button>
      <button type="button" :class="{ active: tab === 'portfolio' }" @click="tab = 'portfolio'">Carteira<b v-if="orphans.length">{{ orphans.length }}</b></button>
      <button type="button" :class="{ active: tab === 'rules' }" @click="tab = 'rules'">Régua e vínculos</button>
    </div>
    <div v-if="tab === 'week'" class="field inline" style="margin:0">
      <label>Semana</label>
      <select v-model="weekStart"><option v-for="entry in weeks" :key="entry.start" :value="entry.start">{{ entry.label }}</option></select>
    </div>
  </div>

  <template v-if="tab === 'week'">
    <article class="card flush">
      <table class="dense">
        <thead><tr><th>Vendedor</th><th v-if="grouped">Empresa</th><th>Perfil</th><th>Placar</th><th>Semana</th><th>Conferência</th><th></th></tr></thead>
        <tbody>
          <tr v-for="entry in rows" :key="entry.link.id" class="clickable" @click="selected = selected === entry.link.id ? '' : entry.link.id">
            <td><span class="cell-main">{{ store.userName(entry.link.userId) }}</span><span class="cell-sub">{{ entry.link.team ? 'Equipe comercial' : 'Canal externo' }}</span></td>
            <td v-if="grouped">{{ tenantName(entry.link.tenantId) }}</td>
            <td>{{ EFFORT_PROFILES[entry.link.profile] }}</td>
            <td>{{ entry.snapshot.score === null ? '—' : `${entry.snapshot.score} de 4` }}</td>
            <td><StatusBadge :value="entry.snapshot.score === null ? 'Sem registro' : entry.snapshot.green ? 'Semana verde' : 'Abaixo da régua'" :tone="entry.snapshot.score === null ? 'neutral' : entry.snapshot.green ? 'success' : 'warning'" /></td>
            <td><span v-if="entry.snapshot.pending">{{ entry.snapshot.pending }} em conferência</span><span v-if="entry.snapshot.returned" class="risk-text"> {{ entry.snapshot.returned }} devolvido(s)</span><span v-if="!entry.snapshot.pending && !entry.snapshot.returned">—</span></td>
            <td><button type="button" class="link">{{ selected === entry.link.id ? 'Fechar' : 'Detalhar' }}</button></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!rows.length" class="empty-note">Nenhum vendedor com vínculo comercial. Crie em Régua e vínculos.</p>
    </article>
    <EffortWeekCard v-if="selectedRow" :link="selectedRow.link" :week="week" />
  </template>

  <article v-else-if="tab === 'review'" class="card flush">
    <table class="dense">
      <thead><tr><th>Evidência</th><th>Vendedor</th><th>Dia</th><th>Cliente</th><th></th></tr></thead>
      <tbody>
        <tr v-for="entry in pending" :key="entry.id">
          <td><span class="cell-main">{{ EFFORT_KINDS[entry.kind] }}</span><span class="cell-sub">{{ entry.note }}</span></td>
          <td>{{ store.userName(entry.ownerId) }}</td>
          <td>{{ fmtDate(entry.date) }}</td>
          <td>{{ entry.partnerId ? store.partnerName(entry.partnerId) : '—' }}</td>
          <td class="actions"><button class="button small" @click="validate(entry.id)">Validar</button><button class="button small secondary" @click="Object.assign(returning, { id: entry.id, reason: '' })">Devolver</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!pending.length" class="empty-note">Nada aguardando conferência.</p>
  </article>

  <template v-else-if="tab === 'portfolio'">
    <article class="card flush">
      <div class="section-head" style="margin:12px 14px 0"><div><h2>Clientes sem responsável</h2><p>Sem responsável vigente a conta não entra em carteira nenhuma. A escolha abre uma vigência e guarda a anterior.</p></div></div>
      <table class="dense">
        <thead><tr><th>Cliente</th><th>Classe</th><th>Responsável</th><th></th></tr></thead>
        <tbody>
          <tr v-for="partner in orphans" :key="partner.id">
            <td><span class="cell-main">{{ partner.name }}</span></td>
            <td><StatusBadge :value="partner.commercialClass ?? 'A classificar'" tone="neutral" /></td>
            <td><select v-model="ownerChoice[partner.id]" :disabled="!canPortfolio"><option :value="undefined">Escolha</option><option v-for="entry in sellerOptions" :key="entry.id" :value="entry.userId">{{ store.userName(entry.userId) }}</option></select></td>
            <td><button class="button small" :disabled="!canPortfolio || !ownerChoice[partner.id]" @click="assign(partner.id)">Atribuir</button></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!orphans.length" class="empty-note">Todos os clientes ativos têm responsável.</p>
    </article>
    <article class="card flush">
      <div class="section-head" style="margin:12px 14px 0"><div><h2>Classe comercial</h2><p>A classe define a cobertura de contato exigida na régua da carteira.</p></div></div>
      <table class="dense">
        <thead><tr><th>Cliente</th><th>Responsável</th><th>Classe</th><th></th></tr></thead>
        <tbody>
          <tr v-for="partner in clients" :key="partner.id">
            <td><span class="cell-main">{{ partner.name }}</span></td>
            <td>{{ currentOwnerOf(partner) ? store.userName(currentOwnerOf(partner)) : 'Sem responsável' }}<span v-if="partner.ownerHistory && partner.ownerHistory.length > 1" class="cell-sub">{{ partner.ownerHistory.length }} vigências</span></td>
            <td><select v-model="classChoice[partner.id]" :disabled="!canPortfolio"><option :value="undefined">{{ partner.commercialClass ?? 'A classificar' }}</option><option v-for="entry in COMMERCIAL_CLASSES" :key="entry" :value="entry">{{ entry }}</option></select></td>
            <td><button class="button small secondary" :disabled="!canPortfolio || !classChoice[partner.id]" @click="classify(partner.id)">Salvar</button></td>
          </tr>
        </tbody>
      </table>
      <p v-if="unclassified.length" class="hint" style="padding:8px 14px">{{ unclassified.length }} cliente(s) ainda sem classe; ficam fora da cobertura até a classificação.</p>
    </article>
  </template>

  <template v-else>
    <article class="card flush">
      <div class="section-head" style="margin:12px 14px 0"><div><h2>Régua por perfil</h2><p>Quatro indicadores por perfil. Mudar a meta cria nova vigência e as semanas anteriores continuam com a régua que valia. Valores de partida a calibrar com a gestão.</p></div></div>
      <table class="dense">
        <thead><tr><th>Perfil</th><th>Vigente desde</th><th>Indicadores</th><th>Verde com</th><th></th></tr></thead>
        <tbody>
          <tr v-for="profile in profiles" :key="profile">
            <td><span class="cell-main">{{ EFFORT_PROFILES[profile] }}</span></td>
            <td>{{ ruleFor(profile) ? fmtDate(ruleFor(profile)!.since) : 'Padrão' }}</td>
            <td><span v-for="entry in ruleFor(profile)?.indicators ?? []" :key="entry.id" class="cell-sub">{{ entry.label }}: {{ entry.unit === 'percentual' ? `${Math.round(entry.target * 100)}%` : entry.target > 0 ? entry.target : 'a calibrar' }}</span></td>
            <td>{{ ruleFor(profile)?.greenAt ?? 3 }} de 4</td>
            <td><button class="button small secondary" :disabled="!canRules" @click="editRule(profile)">Nova vigência</button></td>
          </tr>
        </tbody>
      </table>
    </article>
    <article class="card flush">
      <div class="section-head" style="margin:12px 14px 0"><div><h2>Vínculo comercial</h2><p>Liga a conta do Thalamus a um perfil de esforço. Quem não é da equipe é canal externo e a supervisão só enxerga com permissão.</p></div><button class="button small" :disabled="!canRules" @click="newLink">Novo vínculo</button></div>
      <table class="dense">
        <thead><tr><th>Pessoa</th><th>Empresa</th><th>Perfil</th><th>Grupo</th><th>Desde</th><th></th></tr></thead>
        <tbody>
          <tr v-for="entry in sellerOptions" :key="entry.id">
            <td><span class="cell-main">{{ store.userName(entry.userId) }}</span></td>
            <td>{{ tenantName(entry.tenantId) }}</td>
            <td>{{ EFFORT_PROFILES[entry.profile] }}</td>
            <td>{{ entry.team ? 'Equipe comercial' : 'Canal externo' }}</td>
            <td>{{ fmtDate(entry.since) }}</td>
            <td><button class="button small secondary" :disabled="!canRules" @click="editLink(entry)">Editar</button></td>
          </tr>
        </tbody>
      </table>
    </article>
  </template>

  <BaseModal :open="!!returning.id" title="Devolver evidência" subtitle="O vendedor vê o motivo e corrige" width="480px" @close="returning.id = ''">
    <div class="field"><label>Motivo</label><textarea v-model="returning.reason" rows="3"></textarea></div>
    <template #footer><button class="button secondary" @click="returning.id = ''">Cancelar</button><button class="button" :disabled="!returning.reason.trim()" @click="giveBack">Devolver</button></template>
  </BaseModal>

  <BaseModal :open="editing.open" :title="`Régua de ${EFFORT_PROFILES[editing.profile]}`" subtitle="Nova vigência" width="620px" @close="editing.open = false">
    <div class="form-grid">
      <div class="field"><label>Vale a partir de</label><input v-model="editing.since" type="date" /></div>
      <div class="field"><label>Semana verde com</label><select v-model.number="editing.greenAt"><option v-for="n in 4" :key="n" :value="n">{{ n }} de 4 indicadores</option></select></div>
    </div>
    <div v-for="entry in editing.indicators" :key="entry.id" class="field">
      <label>{{ entry.label }} <small>({{ entry.unit === 'percentual' ? 'de 0 a 1, ex.: 0,8' : 'quantidade' }})</small></label>
      <input v-model.number="entry.target" type="number" min="0" :step="entry.unit === 'percentual' ? 0.05 : 1" />
      <small>{{ entry.description }}</small>
    </div>
    <template #footer><button class="button secondary" @click="editing.open = false">Cancelar</button><button class="button" @click="saveRule">Salvar vigência</button></template>
  </BaseModal>

  <BaseModal :open="link.open" title="Vínculo comercial" width="500px" @close="link.open = false">
    <div class="field"><label>Conta</label><select v-model="link.userId"><option value="">Escolha</option><option v-for="entry in linkable" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
    <div class="form-grid">
      <div class="field"><label>Perfil</label><select v-model="link.profile"><option v-for="profile in profiles" :key="profile" :value="profile">{{ EFFORT_PROFILES[profile] }}</option></select></div>
      <div class="field"><label>Desde</label><input v-model="link.since" type="date" /></div>
    </div>
    <label class="check"><input v-model="link.team" type="checkbox" /> Equipe comercial (a supervisão acompanha)</label>
    <template #footer><button class="button secondary" @click="link.open = false">Cancelar</button><button class="button" :disabled="!link.userId" @click="saveLink">Salvar</button></template>
  </BaseModal>
</template>
