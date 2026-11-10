<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Mic } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import { readOpportunityBrief, SIMULATED_BRIEFS } from '../../domain/crmBrief'
import { addDays, today } from '../../domain/engine'
import { CLIENT_VERTICALS, roleIsOpen } from '../../domain/partners'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { OpportunityDeal } from '../../types/domain'
import { CRM_COMPANIES, CRM_SOURCES, CRM_VERTICALS, DEAL_TYPES, useCrmLists } from './shared'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const { sources } = useCrmLists()
const clients = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Cliente')))
const sellers = computed(() => store.state.users.filter(entry => !entry.platformMaster && (entry.role === 'Comercial' || entry.role === 'Gestor' || entry.role === 'Administrador')))

const blank = () => ({
  tenantId: CRM_COMPANIES.some(company => company.id === ui.activeTenantId) ? ui.activeTenantId : CRM_COMPANIES[0].id,
  ownerId: sellers.value.find(entry => entry.id === ui.sessionUserId)?.id ?? sellers.value.find(entry => entry.name === ui.userName)?.id ?? sellers.value[0]?.id ?? '',
  partnerId: '',
  source: CRM_SOURCES[2],
  dealType: 'Venda' as OpportunityDeal,
  vertical: '',
  expectedClose: addDays(today(), 30),
  notes: '',
  title: '',
})
const form = reactive(blank())
const brief = ref('')
const registering = ref(false)
const hearing = ref(false)
const clientDraft = reactive({ legalName: '', document: '', contact: '', phone: '', email: '' })
const chosen = computed(() => store.state.partners.find(entry => entry.id === form.partnerId))

watch(() => props.open, open => {
  if (!open) return
  Object.assign(form, blank())
  brief.value = ''
  registering.value = false
  Object.assign(clientDraft, { legalName: '', document: '', contact: '', phone: '', email: '' })
})
watch(() => form.partnerId, id => {
  const partner = store.state.partners.find(entry => entry.id === id)
  if (partner?.vertical) form.vertical = partner.vertical
})

function applyBrief() {
  const read = readOpportunityBrief(brief.value, { clients: clients.value.map(entry => ({ id: entry.id, name: entry.name })), sources: sources.value, verticals: CRM_VERTICALS })
  if (read.tenantId) form.tenantId = read.tenantId
  if (read.partnerId) form.partnerId = read.partnerId
  if (read.source) form.source = read.source
  if (read.dealType) form.dealType = read.dealType
  if (read.vertical && (CLIENT_VERTICALS as readonly string[]).includes(read.vertical)) form.vertical = read.vertical
  if (read.expectedClose) form.expectedClose = read.expectedClose
  if (read.title) form.title = read.title
  if (read.notes) form.notes = read.notes
}
function hear() {
  hearing.value = true
  window.setTimeout(() => {
    brief.value = SIMULATED_BRIEFS.brief
    hearing.value = false
    applyBrief()
  }, 700)
}
function registerClient() {
  const created = store.createPartner({
    personType: 'Jurídica', legalName: clientDraft.legalName, tradeName: clientDraft.legalName, document: clientDraft.document,
    roles: ['Cliente'], contacts: clientDraft.contact ? [{ name: clientDraft.contact, phone: clientDraft.phone, email: clientDraft.email, duty: '' }] : [],
    addresses: [], vertical: form.vertical || undefined,
  })
  if (created && created !== true) {
    form.partnerId = created.id
    registering.value = false
  }
}
function create() {
  const person = chosen.value?.contacts[0]
  const created = store.createOpportunity({
    partnerId: form.partnerId,
    title: form.title.trim() || chosen.value?.name || 'Nova oportunidade',
    ownerId: form.ownerId,
    value: 0,
    mrr: 0,
    expectedClose: form.expectedClose,
    source: form.source,
    nextAction: 'Primeiro contato',
    tenantId: form.tenantId,
    dealType: form.dealType,
    notes: form.notes,
    contact: person?.name,
    phone: person?.phone,
    email: person?.email,
    segment: form.vertical || chosen.value?.vertical,
    temperature: 'Frio',
  })
  if (!created || created === true) return
  if (form.partnerId && form.vertical && form.vertical !== chosen.value?.vertical) store.setPartnerVertical(form.partnerId, form.vertical)
  emit('close')
  router.push(`/crm/oportunidade/${created.id}`)
}
</script>

<template>
  <BaseModal :open="open" title="Nova oportunidade" subtitle="Nasce fria, em Novo contato. O relato pode ser escrito ou falado: nesta demonstração a gravação e a leitura dos campos são simuladas." width="680px" @close="emit('close')">
    <div class="field">
      <label>Relato</label>
      <textarea v-model="brief" rows="3" placeholder="Conte o negócio. A leitura preenche os campos que reconhecer."></textarea>
      <div class="filter-row">
        <button type="button" class="button secondary small" :disabled="hearing" @click="hear"><Mic :size="13" /> {{ hearing ? 'Ouvindo…' : 'Gravar áudio' }}</button>
        <button type="button" class="button secondary small" :disabled="!brief.trim()" @click="applyBrief">Preencher campos</button>
        <span class="cell-sub">A gravação não chama um serviço de voz.</span>
      </div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Empresa</label><select v-model="form.tenantId"><option v-for="company in CRM_COMPANIES" :key="company.id" :value="company.id">{{ company.label }}</option></select></div>
      <div class="field"><label>Vendedor</label><select v-model="form.ownerId"><option v-for="seller in sellers" :key="seller.id" :value="seller.id">{{ seller.name }}</option></select><small>Começa com quem está logado.</small></div>
      <div class="field">
        <label>Cliente</label>
        <select v-model="form.partnerId"><option v-for="client in clients" :key="client.id" :value="client.id">{{ client.name }}</option></select>
        <small><button type="button" class="link" @click="registering = !registering">{{ registering ? 'Cancelar cadastro' : 'Cadastrar cliente' }}</button></small>
      </div>
      <div class="field"><label>Origem</label><select v-model="form.source"><option v-for="source in sources" :key="source">{{ source }}</option></select></div>
      <div class="field"><label>Tipo</label><select v-model="form.dealType"><option v-for="type in DEAL_TYPES" :key="type">{{ type }}</option></select></div>
      <div class="field"><label>Vertical</label><select v-model="form.vertical"><option value="">Não informada</option><option v-for="vertical in CRM_VERTICALS" :key="vertical">{{ vertical }}</option></select><small>Fica no cadastro do cliente.</small></div>
      <div class="field"><label>Previsão de fechamento</label><input v-model="form.expectedClose" type="date" /></div>
      <div class="field"><label>Título</label><input v-model="form.title" placeholder="Se vazio, usa o nome do cliente" /></div>
    </div>
    <div v-if="registering" class="person-section">
      <h3>Novo cliente</h3>
      <div class="form-grid">
        <div class="field"><label>Nome</label><input v-model="clientDraft.legalName" /></div>
        <div class="field"><label>CNPJ ou CPF</label><input v-model="clientDraft.document" /></div>
        <div class="field"><label>Contato</label><input v-model="clientDraft.contact" /></div>
        <div class="field"><label>Telefone</label><input v-model="clientDraft.phone" /></div>
        <div class="field"><label>E-mail</label><input v-model="clientDraft.email" /></div>
      </div>
      <button type="button" class="button small" :disabled="clientDraft.legalName.trim().length < 2 || clientDraft.document.trim().length < 11" @click="registerClient">Salvar cliente</button>
    </div>
    <div class="field">
      <label>Motivação</label>
      <textarea v-model="form.notes" rows="3" placeholder="Contexto do negócio, escrito ou trazido do relato"></textarea>
    </div>
    <template #footer>
      <button class="button secondary" @click="emit('close')">Cancelar</button>
      <button class="button" :disabled="!form.partnerId || !form.ownerId" @click="create">Criar e abrir</button>
    </template>
  </BaseModal>
</template>
