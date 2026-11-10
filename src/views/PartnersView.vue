<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight, Mail, MapPin, Phone, Plus, Search, UserRound } from 'lucide-vue-next'
import CrumbBack from '../components/CrumbBack.vue'
import BaseModal from '../components/BaseModal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import ReasonModal from './products/ReasonModal.vue'
import { BRAZIL_STATES, documentError, loadBrazilCities, lookupCnpj, maskCnpj, maskCpf, onlyDigits, validCnpj } from '../domain/brazil'
import { ADDRESS_PURPOSES, CLIENT_VERTICALS, clientSalesBase, duplicatePartner, homologationsOf, phaseOf, roleStatus, supplierReceiptBase } from '../domain/partners'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { AddressPurpose, BusinessPartner, PartnerRoleName } from '../types/domain'
import { fmtCurrency, fmtDate, fmtNumber } from '../utils/format'

type Role = 'Cliente' | 'Fornecedor' | 'Transportadora'
type Tab = 'cadastro' | 'contatos' | 'cliente' | 'fornecedor' | 'historico'
const ROLES: Role[] = ['Cliente', 'Fornecedor', 'Transportadora']

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const query = ref('')
const roleFilter = ref<'' | Role | 'Ambos'>('')
const tab = ref<Tab>('cadastro')
const creating = ref(false)
const addingContact = ref(false)
const addingAddress = ref(false)
const inactivating = ref<Role | ''>('')
const duplicateAck = ref(false)

const form = reactive({
  origin: 'Brasil' as 'Brasil' | 'Estrangeiro',
  country: '',
  personType: 'Jurídica' as 'Física' | 'Jurídica',
  legalName: '', tradeName: '', document: '',
  roles: [] as Role[],
  vertical: '',
  contactName: '', duty: 'Comercial', phone: '', email: '',
  purpose: 'Sede' as AddressPurpose, line: '', city: '', state: '',
})
const contactFromQuery = ref(false)
const contact = reactive({ name: '', duty: '', phone: '', email: '' })
const address = reactive({ purpose: 'Entrega' as AddressPurpose, line: '', city: '', state: '' })
const master = reactive({ origin: 'Brasil' as 'Brasil' | 'Estrangeiro', country: '', personType: 'Jurídica' as 'Física' | 'Jurídica', legalName: '', tradeName: '', document: '' })
const formCities = ref<string[]>([])
const addressCities = ref<string[]>([])
const consulting = ref(false)
const masterConsulting = ref(false)
const documentNote = ref('Opcional. Com o CNPJ completo, o nome, o estado e a cidade vêm da Receita.')
const masterNote = ref('')
let lookupSeq = 0
let masterSeq = 0

const selectedId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const partner = computed(() => store.state.partners.find(entry => entry.id === selectedId.value))
const hasBoth = (entry: BusinessPartner) => entry.roles.includes('Cliente') && entry.roles.includes('Fornecedor')
const counts = computed(() => ({
  all: store.state.partners.length,
  Cliente: store.state.partners.filter(entry => entry.roles.includes('Cliente')).length,
  Fornecedor: store.state.partners.filter(entry => entry.roles.includes('Fornecedor')).length,
  Transportadora: store.state.partners.filter(entry => entry.roles.includes('Transportadora')).length,
  Ambos: store.state.partners.filter(hasBoth).length,
}))
const FILTERS = computed(() => [
  { id: '' as const, label: 'Todos', count: counts.value.all },
  { id: 'Cliente' as const, label: 'Clientes', count: counts.value.Cliente },
  { id: 'Fornecedor' as const, label: 'Fornecedores', count: counts.value.Fornecedor },
  { id: 'Transportadora' as const, label: 'Transportadoras', count: counts.value.Transportadora },
  { id: 'Ambos' as const, label: 'Cliente e fornecedor', count: counts.value.Ambos },
])
const listed = computed(() => store.state.partners.filter(entry => {
  const text = `${entry.name} ${entry.legalName} ${entry.document} ${entry.city}`.toLowerCase()
  if (query.value && !text.includes(query.value.toLowerCase())) return false
  if (roleFilter.value === 'Ambos') return hasBoth(entry)
  if (roleFilter.value) return entry.roles.includes(roleFilter.value)
  return true
}))

const duplicate = computed(() => creating.value ? duplicatePartner(store.state, form.document) : undefined)
const sales = computed(() => partner.value ? clientSalesBase(store.state, partner.value.id) : undefined)
const receipts = computed(() => partner.value ? supplierReceiptBase(store.state, partner.value.id) : undefined)
const portraits = computed(() => partner.value ? homologationsOf(store.state, partner.value.id) : [])
const pendingAbc = computed(() => partner.value?.abcSuggestions.filter(entry => entry.status === 'Pendente') ?? [])
const canDecideAbc = computed(() => ui.role === 'Comercial' || ui.role === 'Admin')
const show = (role: PartnerRoleName) => !!partner.value?.roles.includes(role)
const blankNote = 'Opcional. Com o CNPJ completo, o nome, o estado e a cidade vêm da Receita.'
const sameDocument = (next: string, previous: string) => next.trim() === previous.trim() || (onlyDigits(next).length >= 11 && onlyDigits(next) === onlyDigits(previous))
const masterCountry = () => master.origin === 'Brasil' ? 'Brasil' : master.country.trim()
const masterChanged = computed(() => {
  const value = partner.value
  if (!value) return false
  const stored = !value.country || value.country === 'Brasil' ? 'Brasil' : value.country
  return master.personType !== value.personType || master.legalName !== value.legalName || master.tradeName !== value.tradeName || masterCountry() !== stored || !sameDocument(master.document, value.document)
})

const TABS = computed(() => {
  const value = partner.value
  if (!value) return []
  return [
    { id: 'cadastro' as const, label: 'Cadastro' },
    { id: 'contatos' as const, label: 'Contatos e endereços', count: value.contacts.length + value.addresses.length },
    ...(show('Cliente') ? [{ id: 'cliente' as const, label: 'Cliente', count: sales.value?.count }] : []),
    ...(show('Fornecedor') ? [{ id: 'fornecedor' as const, label: 'Fornecedor', count: receipts.value?.open.length }] : []),
    { id: 'historico' as const, label: 'Histórico', count: value.audit.length },
  ]
})

interface Kpi { label: string; value: string; hint: string; target: Tab }
const kpis = computed<Kpi[]>(() => {
  const value = partner.value
  if (!value) return []
  const list: Kpi[] = []
  if (show('Cliente') && sales.value) {
    list.push({ label: 'Pedidos em Vendas', value: String(sales.value.count), hint: sales.value.count ? fmtCurrency(sales.value.total) : 'sem pedido', target: 'cliente' })
    list.push({ label: 'Classe ABC', value: value.abcClass ?? '—', hint: value.abcClass ? `decidida por ${value.abcDecidedBy}` : 'sem base para classe', target: 'cliente' })
  }
  if (show('Fornecedor') && receipts.value) {
    list.push({ label: 'Volume recebido', value: fmtNumber(receipts.value.volume), hint: `${receipts.value.received.length} pedido(s) recebido(s)`, target: 'fornecedor' })
    list.push({ label: 'Compras em andamento', value: String(receipts.value.open.length), hint: 'seguem mesmo com papel inativo', target: 'fornecedor' })
  }
  list.push({ label: 'Contatos', value: String(value.contacts.length), hint: value.contact || 'nenhum contato', target: 'contatos' })
  return list
})

watch(() => form.origin, () => {
  form.state = ''
  form.city = ''
  formCities.value = []
})
watch(partner, value => {
  if (!value) return
  if (!TABS.value.some(entry => entry.id === tab.value)) tab.value = 'cadastro'
  const foreign = !!value.country && value.country !== 'Brasil'
  Object.assign(master, {
    origin: foreign ? 'Estrangeiro' : 'Brasil',
    country: foreign ? value.country : '',
    personType: value.personType,
    legalName: value.legalName,
    tradeName: value.tradeName,
    document: foreign ? value.document : value.personType === 'Física' ? maskCpf(value.document) : maskCnpj(value.document),
  })
  masterNote.value = ''
}, { immediate: true })
watch(selectedId, () => {
  contactFromQuery.value = false
  const aba = route.query.aba
  tab.value = aba === 'contatos' || aba === 'cliente' || aba === 'fornecedor' || aba === 'historico' ? aba : 'cadastro'
}, { immediate: true })
watch(() => route.query.novo, value => {
  if (value === 'cliente' && !selectedId.value && !creating.value) startNew('Cliente')
  if (value === 'contato' && partner.value && !contactFromQuery.value) {
    contactFromQuery.value = true
    tab.value = 'contatos'
    openContact()
  }
}, { immediate: true })

const tone = (status?: string) => status === 'Ativo' || status === 'Homologado' ? 'success' : status === 'Inativo' || status === 'Reprovado' ? 'danger' : 'warning'
const roleClass = (entry: BusinessPartner, role: PartnerRoleName) => roleStatus(entry, role) === 'Inativo' ? 'off' : roleStatus(entry, role) === 'Ativo' ? 'on' : 'draft'
function roleHint(entry: BusinessPartner, role: Role) {
  if (!entry.roles.includes(role)) return 'Não atribuído'
  const status = roleStatus(entry, role)
  if (status === 'Inativo') return role === 'Transportadora' ? 'Inativa: não aparece na expedição' : 'Inativo: não aceita solicitação nova'
  if (status !== 'Ativo') return 'Em cadastro'
  if (role === 'Cliente') return 'Pode receber proposta e pedido'
  if (role === 'Fornecedor') return 'Pode receber pedido de compra'
  return 'Pode ser escolhida na expedição'
}
const item = (id: string) => store.state.items.find(entry => entry.id === id)

const originQuery = () => typeof route.query.origem === 'string' ? { origem: route.query.origem } : {}

function open(id: string) {
  router.push({ path: `/parceiros/${id}`, query: originQuery() })
}
function startNew(role?: Role) {
  duplicateAck.value = false
  lookupSeq += 1
  consulting.value = false
  formCities.value = []
  documentNote.value = blankNote
  Object.assign(form, { origin: 'Brasil', country: '', personType: 'Jurídica', legalName: '', tradeName: '', document: '', roles: role ? [role] : [], vertical: '', contactName: '', duty: 'Comercial', phone: '', email: '', purpose: 'Sede', line: '', city: '', state: '' })
  creating.value = true
}
function closeCreate() {
  lookupSeq += 1
  consulting.value = false
  creating.value = false
  if (route.query.novo) router.replace({ path: '/parceiros', query: originQuery() })
}
async function onFormDocument(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  form.document = form.personType === 'Física' ? maskCpf(raw) : maskCnpj(raw)
  if (form.origin !== 'Brasil' || form.personType !== 'Jurídica') {
    consulting.value = false
    documentNote.value = form.personType === 'Física' ? 'CPF opcional.' : blankNote
    return
  }
  const digits = onlyDigits(form.document)
  const seq = ++lookupSeq
  if (digits.length !== 14) {
    consulting.value = false
    documentNote.value = digits.length ? 'Complete o CNPJ para consultar a Receita, ou apague para cadastrar sem documento.' : blankNote
    return
  }
  if (!validCnpj(digits)) {
    consulting.value = false
    documentNote.value = 'CNPJ inválido.'
    return
  }
  consulting.value = true
  documentNote.value = 'Consultando o cadastro do CNPJ…'
  const found = await lookupCnpj(digits)
  if (seq !== lookupSeq) return
  consulting.value = false
  if (!found.ok) {
    documentNote.value = found.message
    return
  }
  form.legalName = found.value.legalName
  form.tradeName = found.value.tradeName
  form.state = found.value.state
  const cities = await loadBrazilCities(found.value.state)
  if (seq !== lookupSeq) return
  formCities.value = cities.ok ? cities.value : []
  form.city = formCities.value.includes(found.value.city) ? found.value.city : ''
  if (!cities.ok) documentNote.value = cities.message
  else if (found.value.situation && found.value.situation.toUpperCase() !== 'ATIVA') documentNote.value = `Situação na Receita: ${found.value.situation}`
  else if (!form.city && found.value.state) documentNote.value = 'Escolha a cidade. O município informado pela Receita não coincidiu com a lista.'
  else documentNote.value = 'Confira os dados. Dá para ajustar antes de salvar.'
}
async function onFormState() {
  const seq = lookupSeq
  form.city = ''
  const cities = await loadBrazilCities(form.state)
  if (seq !== lookupSeq) return
  formCities.value = cities.ok ? cities.value : []
  if (!cities.ok) documentNote.value = cities.message
}
async function onMasterDocument(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  master.document = master.personType === 'Física' ? maskCpf(raw) : maskCnpj(raw)
  if (master.origin !== 'Brasil' || master.personType !== 'Jurídica') {
    masterConsulting.value = false
    masterNote.value = ''
    return
  }
  const digits = onlyDigits(master.document)
  const seq = ++masterSeq
  if (digits.length !== 14 || !validCnpj(digits)) {
    masterConsulting.value = false
    masterNote.value = digits.length === 14 ? 'CNPJ inválido.' : ''
    return
  }
  masterConsulting.value = true
  masterNote.value = 'Consultando o cadastro do CNPJ…'
  const found = await lookupCnpj(digits)
  if (seq !== masterSeq) return
  masterConsulting.value = false
  if (!found.ok) {
    masterNote.value = found.message
    return
  }
  master.legalName = found.value.legalName
  master.tradeName = found.value.tradeName
  masterNote.value = found.value.situation && found.value.situation.toUpperCase() !== 'ATIVA' ? `Situação na Receita: ${found.value.situation}` : 'Razão social e nome fantasia vieram da Receita. O endereço se ajusta na outra aba.'
}
async function onAddressState() {
  address.city = ''
  const cities = await loadBrazilCities(address.state)
  addressCities.value = cities.ok ? cities.value : []
}
function toggleRole(role: Role) {
  form.roles = form.roles.includes(role) ? form.roles.filter(entry => entry !== role) : [...form.roles, role]
}
function saveNew() {
  if (consulting.value) return
  const problem = documentError(form.origin, form.personType, form.document)
  if (problem) {
    ui.notify('error', problem)
    return
  }
  if (form.origin === 'Estrangeiro' && !form.country.trim()) {
    ui.notify('error', 'Informe o país.')
    return
  }
  const created = store.createPartner({
    personType: form.personType, legalName: form.legalName, tradeName: form.tradeName, document: form.document, country: form.origin === 'Brasil' ? 'Brasil' : form.country.trim(), roles: form.roles,
    contacts: form.contactName.trim() ? [{ name: form.contactName, duty: form.duty, phone: form.phone, email: form.email }] : [],
    addresses: form.city.trim() || form.line.trim() || form.state.trim() ? [{ purpose: form.purpose, line: form.line, city: form.city, state: form.state }] : [],
    forceDuplicate: duplicateAck.value,
    vertical: form.roles.includes('Cliente') ? form.vertical : undefined,
  })
  if (created && created !== true) {
    creating.value = false
    const next = { path: `/parceiros/${created.id}`, query: originQuery() }
    if (route.query.novo) router.replace(next)
    else router.push(next)
  }
}
function saveMaster() {
  if (!partner.value || masterConsulting.value) return
  const problem = sameDocument(master.document, partner.value.document) ? '' : documentError(master.origin, master.personType, master.document)
  if (problem) {
    ui.notify('error', problem)
    return
  }
  if (master.origin === 'Estrangeiro' && !master.country.trim()) {
    ui.notify('error', 'Informe o país.')
    return
  }
  store.updatePartnerMaster(partner.value.id, { personType: master.personType, legalName: master.legalName, tradeName: master.tradeName, document: master.document, country: masterCountry() })
}
function openContact() {
  Object.assign(contact, { name: '', duty: '', phone: '', email: '' })
  addingContact.value = true
}
function closeContact() {
  addingContact.value = false
  if (route.query.novo === 'contato') router.replace({ path: route.path, query: { aba: 'contatos', ...originQuery() } })
}
function saveContact() {
  if (!partner.value || store.addPartnerContact(partner.value.id, { ...contact }) === undefined) return
  addingContact.value = false
  if (route.query.novo) router.replace({ path: route.path, query: { aba: 'contatos', ...originQuery() } })
}
function saveVertical(value: string) {
  if (partner.value) store.setPartnerVertical(partner.value.id, value)
}
function openAddress() {
  addressCities.value = []
  Object.assign(address, { purpose: 'Entrega', line: '', city: '', state: '' })
  addingAddress.value = true
}
function saveAddress() {
  if (partner.value && store.addPartnerAddress(partner.value.id, { ...address }) !== undefined) addingAddress.value = false
}
function inactivate(reason: string) {
  if (!partner.value || !inactivating.value) return
  if (store.inactivatePartnerRole(partner.value.id, inactivating.value, reason) !== undefined) inactivating.value = ''
}
</script>

<template>
  <!-- Lista -->
  <article v-if="!selectedId" class="card flush" data-tour="partner-list">
    <div class="section-head">
      <div data-tour="partner-idea">
        <h2><CrumbBack only-history fallback="/parceiros" title="Voltar" /> Parceiros</h2>
        <p>Um cadastro por empresa ou pessoa. Cliente e fornecedor são papéis desse cadastro, com situação e perfil próprios.</p>
    </div>
    <button data-tour="new-partner" class="button" @click="startNew()"><Plus :size="15" /> Novo parceiro</button>
  </div>
    <div class="partner-filters">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Nome, razão social, documento ou cidade" /></label>
      <div class="chip-row" style="margin:0">
        <button v-for="entry in FILTERS" :key="entry.id" type="button" class="chip" :class="{ active: roleFilter === entry.id }" @click="roleFilter = entry.id">{{ entry.label }} <b>{{ entry.count }}</b></button>
      </div>
    </div>
    <table class="dense">
      <thead><tr><th>Parceiro</th><th>Documento</th><th>Cidade</th><th>Contato principal</th><th>Papéis</th><th>Situação</th></tr></thead>
        <tbody>
        <tr v-for="entry in listed" :key="entry.id" class="clickable" @click="open(entry.id)">
          <td><span class="cell-main">{{ entry.name }}</span><span v-if="entry.legalName !== entry.name" class="cell-sub">{{ entry.legalName }}</span></td>
          <td class="code">{{ entry.document || '—' }}</td>
          <td>{{ entry.city || '—' }}</td>
          <td><span class="cell-main">{{ entry.contact || '—' }}</span><span v-if="entry.email" class="cell-sub">{{ entry.email }}</span></td>
          <td>
            <div class="role-tags">
              <span v-for="role in entry.roles" :key="role" class="role-tag" :class="roleClass(entry, role)" :title="roleStatus(entry, role)">{{ role }}</span>
              <span v-if="!entry.roles.length" class="cell-sub">Nenhum</span>
            </div>
          </td>
            <td><StatusBadge :value="phaseOf(entry)" :tone="tone(phaseOf(entry))" /></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!listed.length" class="empty-note">Nenhum parceiro com esse filtro.</p>
    </article>

  <!-- Página do parceiro -->
  <template v-else>
    <nav class="crumb-bar" aria-label="Caminho">
      <CrumbBack fallback="/parceiros" title="Voltar para Parceiros" />
      <RouterLink :to="{ path: '/parceiros', query: originQuery() }" class="crumb">Parceiros</RouterLink>
      <ChevronRight :size="14" class="sep" />
      <span class="crumb here">{{ partner?.name ?? 'Parceiro não encontrado' }}</span>
    </nav>

    <div v-if="!partner" class="card empty-note">Parceiro não encontrado.</div>
    <template v-else>
      <article class="card item-hero" data-tour="partner-profile">
        <div class="item-head">
          <div class="item-photo placeholder">{{ partner.name.slice(0, 2).toUpperCase() }}</div>
          <div class="item-head-main">
            <span class="eyebrow">Pessoa {{ partner.personType.toLowerCase() }} · {{ partner.document || (partner.country && partner.country !== 'Brasil' ? partner.country : 'Sem documento') }}</span>
            <h2>{{ partner.name }}</h2>
            <div class="meta">
              <span v-if="partner.legalName !== partner.name">{{ partner.legalName }}</span>
              <span v-if="partner.city"><MapPin :size="12" style="vertical-align:-1px" /> {{ partner.city }}</span>
              <span>Cadastrado por <b>{{ partner.createdBy }}</b> em {{ fmtDate(partner.createdAt) }}</span>
            </div>
            <div class="role-tags" style="margin-top:8px">
              <span v-for="role in partner.roles" :key="role" class="role-tag" :class="roleClass(partner, role)">{{ role }} · {{ roleStatus(partner, role) }}</span>
            </div>
          </div>
          <div class="actions"><StatusBadge :value="phaseOf(partner)" :tone="tone(phaseOf(partner))" /></div>
        </div>
        <div class="kpi-strip">
          <button v-for="kpi in kpis" :key="kpi.label" type="button" class="kpi link" @click="tab = kpi.target">
            <span>{{ kpi.label }}</span><strong>{{ kpi.value }}</strong><small>{{ kpi.hint }}</small>
          </button>
        </div>
      </article>

      <article class="card">
        <div class="tabs">
          <button v-for="entry in TABS" :key="entry.id" type="button" :class="{ active: tab === entry.id }" @click="tab = entry.id">{{ entry.label }}<b v-if="entry.count">{{ entry.count }}</b></button>
        </div>

        <!-- Cadastro -->
        <div v-if="tab === 'cadastro'" class="partner-split">
          <section>
            <h3 class="partner-h">Dados gerais</h3>
            <div class="form-grid">
              <div class="field"><label>Origem</label><select v-model="master.origin" :disabled="masterConsulting"><option>Brasil</option><option>Estrangeiro</option></select></div>
              <div class="field"><label>Pessoa</label><select v-model="master.personType" :disabled="masterConsulting"><option>Jurídica</option><option>Física</option></select></div>
              <div v-if="master.origin === 'Estrangeiro'" class="field wide"><label>País<span class="required-mark" title="Obrigatório">*</span></label><input v-model="master.country" :disabled="masterConsulting" placeholder="Ex.: Alemanha" /></div>
              <div class="field"><label>{{ master.origin === 'Estrangeiro' ? 'Identificação fiscal' : master.personType === 'Física' ? 'CPF' : 'CNPJ' }}</label><input v-if="master.origin === 'Estrangeiro'" v-model="master.document" :disabled="masterConsulting" placeholder="Opcional" /><input v-else :value="master.document" :disabled="masterConsulting" inputmode="numeric" autocomplete="off" :placeholder="master.personType === 'Física' ? '000.000.000-00' : '00.000.000/0001-00'" @input="onMasterDocument" /></div>
              <div class="field wide"><label>{{ master.personType === 'Física' ? 'Nome' : 'Razão social' }}</label><input v-model="master.legalName" :disabled="masterConsulting" /></div>
              <div class="field wide"><label>Nome fantasia</label><input v-model="master.tradeName" :disabled="masterConsulting" /><small>É o nome que aparece nas listas, pedidos e compras.</small></div>
            </div>
            <p v-if="masterNote" class="hint">{{ masterNote }}</p>
            <button class="button" :disabled="!masterChanged || masterConsulting" @click="saveMaster">{{ masterConsulting ? 'Consultando…' : 'Salvar dados gerais' }}</button>
          </section>
          <section>
            <h3 class="partner-h">Papéis</h3>
            <div class="role-cards">
              <div v-for="role in ROLES" :key="role" class="role-card" :class="partner.roles.includes(role) ? roleClass(partner, role) : 'none'">
                <div>
                  <strong>{{ role }}</strong>
                  <span>{{ roleHint(partner, role) }}</span>
                </div>
                <button v-if="!partner.roles.includes(role) || roleStatus(partner, role) === 'Inativo'" class="button secondary small" @click="store.addPartnerRole(partner.id, role)">{{ partner.roles.includes(role) ? 'Reativar' : 'Atribuir' }}</button>
                <button v-else-if="roleStatus(partner, role) === 'Ativo'" class="button ghost small" @click="inactivating = role">Inativar</button>
              </div>
              </div>
            <p class="cell-sub" style="margin-top:10px">Inativar um papel não inativa o outro. O que já está em andamento segue até o fim. Quem aprova a inativação ainda não foi definido; nesta demonstração ela vale na hora.</p>
          </section>
        </div>

        <!-- Contatos e endereços -->
        <div v-else-if="tab === 'contatos'" class="partner-split">
          <section>
            <div class="partner-h-row"><h3 class="partner-h">Contatos</h3><button class="button secondary small" @click="openContact"><Plus :size="13" /> Contato</button></div>
            <div class="info-cards">
              <div v-for="(entry, index) in partner.contacts" :key="index" class="info-card">
                <strong><UserRound :size="14" /> {{ entry.name }}<span v-if="index === 0" class="status info">Principal</span></strong>
                <span v-if="entry.duty">{{ entry.duty }}</span>
                <span v-if="entry.phone"><Phone :size="12" /> {{ entry.phone }}</span>
                <span v-if="entry.email"><Mail :size="12" /> {{ entry.email }}</span>
              </div>
              <p v-if="!partner.contacts.length" class="empty-note">Nenhum contato.</p>
            </div>
          </section>
          <section>
            <div class="partner-h-row"><h3 class="partner-h">Endereços</h3><button class="button secondary small" @click="openAddress"><Plus :size="13" /> Endereço</button></div>
            <div class="info-cards">
              <div v-for="(entry, index) in partner.addresses" :key="index" class="info-card">
                <strong><MapPin :size="14" /> {{ entry.purpose }}</strong>
                <span>{{ entry.line || '—' }}</span>
                <span>{{ [entry.city, entry.state].filter(Boolean).join(' · ') }}</span>
              </div>
              <p v-if="!partner.addresses.length" class="empty-note">Nenhum endereço.</p>
            </div>
          </section>
        </div>

        <!-- Cliente -->
        <template v-else-if="tab === 'cliente' && sales">
          <div class="form-grid" style="max-width:420px">
            <div class="field">
              <label>Vertical</label>
              <select :value="partner.vertical ?? ''" @change="saveVertical(($event.target as HTMLSelectElement).value)">
                <option value="">Não informada</option>
                <option v-for="vertical in CLIENT_VERTICALS" :key="vertical">{{ vertical }}</option>
              </select>
              <small>A oportunidade usa esta vertical. Ela se escolhe aqui, no cliente.</small>
            </div>
          </div>
          <section class="metrics cols-3">
            <article class="metric"><div class="metric-head">Pedidos em Vendas</div><strong>{{ sales.count }}</strong><small>{{ fmtCurrency(sales.total) }}{{ sales.from ? ` · ${fmtDate(sales.from)} a ${fmtDate(sales.to!)}` : '' }}</small></article>
            <article class="metric"><div class="metric-head">Ticket médio</div><strong class="pending-value">Sem fórmula</strong><small>Não é publicado enquanto Vendas não definir a conta.</small></article>
            <article class="metric"><div class="metric-head">Classe ABC</div><strong>{{ partner.abcClass ?? '—' }}</strong><small>{{ partner.abcClass ? `Decidida por ${partner.abcDecidedBy}.` : 'Sem histórico suficiente.' }} Sozinha, não libera crédito, desconto nem condição.</small></article>
          </section>
          <h3 class="partner-h">Pedidos</h3>
          <div v-if="sales.orders.length" class="table-scroll">
            <table class="dense">
              <thead><tr><th>Pedido</th><th>Recebido em</th><th class="num">Valor</th></tr></thead>
              <tbody><tr v-for="order in sales.orders" :key="order.id"><td class="code">{{ order.id }}</td><td>{{ fmtDate(order.receivedAt) }}</td><td class="num">{{ fmtCurrency(order.value) }}</td></tr></tbody>
            </table>
          </div>
          <p v-else class="empty-note">Sem pedido em Vendas.</p>

          <div class="partner-h-row" style="margin-top:18px">
            <h3 class="partner-h">Reclassificação anual</h3>
            <button class="button secondary small" @click="store.registerAnnualBilling(partner.id, '2026')">Registrar faturamento de 2026</button>
          </div>
          <p class="cell-sub">Os limites A, B e C ainda não existem: o registro guarda o faturamento e não sugere letra. Quem decide é o Coordenador Comercial (aqui, o perfil Comercial).</p>
          <div v-for="suggestion in partner.abcSuggestions" :key="suggestion.id" class="list-row static">
            <div>
              <strong>{{ suggestion.year }} · {{ fmtCurrency(suggestion.billing) }}</strong>
              <span>{{ suggestion.note }}{{ suggestion.decidedBy ? ` · ${suggestion.decidedBy}` : '' }}</span>
            </div>
            <div v-if="suggestion.status === 'Pendente'" class="filter-row">
              <button class="button small" :disabled="!canDecideAbc" @click="store.decideAbcSuggestion(partner.id, suggestion.id, true, ui.role)">Aprovar</button>
              <button class="button secondary small" :disabled="!canDecideAbc" @click="store.decideAbcSuggestion(partner.id, suggestion.id, false, ui.role)">Recusar</button>
            </div>
            <StatusBadge v-else :value="suggestion.status" :tone="suggestion.status === 'Aprovada' ? 'success' : 'neutral'" />
          </div>
          <p v-if="pendingAbc.length && !canDecideAbc" class="notice info">Aguardando o Coordenador Comercial.</p>
        </template>

        <!-- Fornecedor -->
        <template v-else-if="tab === 'fornecedor' && receipts">
          <section class="metrics cols-3">
            <article class="metric"><div class="metric-head">Volume recebido</div><strong>{{ fmtNumber(receipts.volume) }}</strong><small>{{ receipts.received.length }} pedido(s){{ receipts.from ? ` · ${fmtDate(receipts.from)} a ${fmtDate(receipts.to!)}` : '' }}</small></article>
            <article class="metric"><div class="metric-head">Compras em andamento</div><strong>{{ receipts.open.length }}</strong><small>Seguem até o fim, mesmo com o papel inativo.</small></article>
            <article class="metric"><div class="metric-head">Nota do fornecedor</div><strong class="pending-value">Sem fórmula</strong><small>Escala e pesos ainda não definidos.</small></article>
          </section>
          <h3 class="partner-h">Homologação de matéria-prima</h3>
          <p class="cell-sub">Retrato do processo de homologação, só para leitura. Matéria-prima C1 sem homologação para o item bloqueia a compra; C2 e C3, não.</p>
          <div v-if="portraits.length" class="table-scroll">
            <table class="dense">
              <thead><tr><th>Item</th><th>Referência</th><th>Validade</th><th>Ensaios</th><th>Situação</th></tr></thead>
              <tbody>
                <tr v-for="portrait in portraits" :key="portrait.id">
                  <td><span class="cell-main code">{{ item(portrait.itemId)?.code }}</span><span class="cell-sub">{{ item(portrait.itemId)?.name }}</span></td>
                  <td>{{ portrait.reference }}</td>
                  <td>{{ portrait.validUntil ? fmtDate(portrait.validUntil) : '—' }}</td>
                  <td><span class="cell-sub">{{ portrait.tests || '—' }}</span></td>
                  <td><StatusBadge :value="portrait.status" :tone="tone(portrait.status)" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-note">Sem homologação registrada.</p>
        </template>

        <!-- Histórico -->
        <template v-else-if="tab === 'historico'">
          <div v-for="(entry, index) in partner.audit" :key="index" class="list-row static">
            <div><strong>{{ entry.text }}</strong><span>{{ entry.actor }} · {{ fmtDate(entry.at) }}<template v-if="entry.before"> · {{ entry.before }} → {{ entry.after }}</template></span></div>
          </div>
          <p v-if="!partner.audit.length" class="empty-note">Sem alterações além da carga inicial.</p>
        </template>
      </article>
    </template>
  </template>

  <!-- Novo parceiro -->
  <BaseModal :open="creating" title="Novo parceiro" subtitle="Um registro só. Cliente, fornecedor ou os dois, agora ou depois." width="720px" @close="closeCreate">
    <form id="new-partner" @submit.prevent="saveNew">
      <div class="form-grid">
        <div class="field"><label>Origem</label><select v-model="form.origin" :disabled="consulting"><option>Brasil</option><option>Estrangeiro</option></select></div>
        <div class="field"><label>Pessoa</label><select v-model="form.personType" :disabled="consulting"><option>Jurídica</option><option>Física</option></select></div>
        <div v-if="form.origin === 'Estrangeiro'" class="field wide"><label>País<span class="required-mark" title="Obrigatório">*</span></label><input v-model="form.country" :disabled="consulting" placeholder="Ex.: Alemanha" required /></div>
        <div class="field wide">
          <label>{{ form.origin === 'Estrangeiro' ? 'Identificação fiscal' : form.personType === 'Física' ? 'CPF' : 'CNPJ' }}</label>
          <input v-if="form.origin === 'Estrangeiro'" v-model="form.document" :disabled="consulting" placeholder="Opcional. Número no país de origem" />
          <input v-else :value="form.document" :disabled="consulting" inputmode="numeric" autocomplete="off" :placeholder="form.personType === 'Física' ? '000.000.000-00' : '00.000.000/0001-00'" @input="onFormDocument" />
          <p class="hint">{{ consulting ? 'Consultando o cadastro do CNPJ…' : form.origin === 'Estrangeiro' ? 'Parceiro estrangeiro não tem CNPJ. O documento fica em branco ou leva a identificação do país.' : documentNote }}</p>
        </div>
        <div class="field wide"><label>{{ form.personType === 'Física' ? 'Nome' : 'Razão social' }}<span class="required-mark" title="Obrigatório">*</span></label><input v-model="form.legalName" :disabled="consulting" required /></div>
        <div class="field wide"><label>Nome fantasia</label><input v-model="form.tradeName" :disabled="consulting" placeholder="Se vazio, usa a razão social" /></div>
      </div>
      <p v-if="duplicate" class="notice warning">
        Já existe <b>{{ duplicate.name }}</b> com este documento.
        <RouterLink :to="{ path: `/parceiros/${duplicate.id}`, query: originQuery() }" @click="creating = false">Abrir esse cadastro</RouterLink>
        <label class="check-line" style="border:0;padding:6px 0 0"><input v-model="duplicateAck" type="checkbox" /> Cadastrar outro registro mesmo assim</label>
      </p>
      <div class="field">
        <label>Papéis</label>
        <div class="usage-row">
          <label v-for="role in ROLES" :key="role" class="usage-pill" :class="{ on: form.roles.includes(role) }"><input type="checkbox" :checked="form.roles.includes(role)" @change="toggleRole(role)" /> {{ role }}</label>
        </div>
        <small>Sem papel, o cadastro fica em cadastro.</small>
      </div>
      <div v-if="form.roles.includes('Cliente')" class="field"><label>Vertical</label><select v-model="form.vertical"><option value="">Não informada</option><option v-for="vertical in CLIENT_VERTICALS" :key="vertical">{{ vertical }}</option></select><small>Fica no cliente e aparece na oportunidade.</small></div>
      <h3 class="partner-h">Contato principal</h3>
      <div class="form-grid">
        <div class="field"><label>Nome</label><input v-model="form.contactName" /></div>
        <div class="field"><label>Função</label><input v-model="form.duty" /></div>
        <div class="field"><label>Telefone</label><input v-model="form.phone" /></div>
        <div class="field"><label>E-mail</label><input v-model="form.email" type="email" /></div>
      </div>
      <h3 class="partner-h">Endereço</h3>
      <div class="form-grid three">
        <div class="field"><label>Finalidade</label><select v-model="form.purpose" :disabled="consulting"><option v-for="purpose in ADDRESS_PURPOSES" :key="purpose">{{ purpose }}</option></select></div>
        <template v-if="form.origin === 'Brasil'">
          <div class="field"><label>Estado</label>
            <select v-model="form.state" :disabled="consulting" @change="onFormState"><option v-for="state in BRAZIL_STATES" :key="state.uf" :value="state.uf">{{ state.name }}</option></select>
          </div>
          <div class="field"><label>Cidade</label>
            <select v-model="form.city" :disabled="consulting || !form.state"><option v-for="city in formCities" :key="city">{{ city }}</option></select>
          </div>
        </template>
        <template v-else>
          <div class="field"><label>Região</label><input v-model="form.state" :disabled="consulting" maxlength="80" /></div>
          <div class="field"><label>Cidade</label><input v-model="form.city" :disabled="consulting" /></div>
        </template>
        <div class="field wide"><label>Logradouro</label><input v-model="form.line" :disabled="consulting" /></div>
      </div>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="closeCreate">Cancelar</button>
      <button class="button" type="submit" form="new-partner" :disabled="consulting || (!!duplicate && !duplicateAck)">{{ consulting ? 'Consultando…' : 'Salvar parceiro' }}</button>
      </template>
  </BaseModal>

  <BaseModal :open="addingContact" title="Novo contato" @close="closeContact">
    <form id="new-contact" class="form-grid" @submit.prevent="saveContact">
      <div class="field"><label>Nome</label><input v-model="contact.name" required /></div>
      <div class="field"><label>Função</label><input v-model="contact.duty" /></div>
      <div class="field"><label>Telefone</label><input v-model="contact.phone" /></div>
      <div class="field"><label>E-mail</label><input v-model="contact.email" type="email" /></div>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="closeContact">Cancelar</button>
      <button class="button" type="submit" form="new-contact">Incluir contato</button>
      </template>
  </BaseModal>

  <BaseModal :open="addingAddress" title="Novo endereço" @close="addingAddress = false">
    <form id="new-address" class="form-grid" @submit.prevent="saveAddress">
      <div class="field"><label>Finalidade</label><select v-model="address.purpose"><option v-for="purpose in ADDRESS_PURPOSES" :key="purpose">{{ purpose }}</option></select></div>
      <template v-if="!partner?.country || partner.country === 'Brasil'">
        <div class="field"><label>Estado</label>
          <select v-model="address.state" @change="onAddressState"><option v-for="state in BRAZIL_STATES" :key="state.uf" :value="state.uf">{{ state.name }}</option></select>
        </div>
        <div class="field wide"><label>Cidade</label>
          <select v-model="address.city" :disabled="!address.state"><option v-for="city in addressCities" :key="city">{{ city }}</option></select>
        </div>
      </template>
      <template v-else>
        <div class="field"><label>Região</label><input v-model="address.state" maxlength="80" /></div>
        <div class="field wide"><label>Cidade</label><input v-model="address.city" /></div>
      </template>
      <div class="field wide"><label>Logradouro</label><input v-model="address.line" /></div>
    </form>
    <template #footer>
      <button class="button secondary" type="button" @click="addingAddress = false">Cancelar</button>
      <button class="button" type="submit" form="new-address">Incluir endereço</button>
      </template>
  </BaseModal>

  <ReasonModal :open="!!inactivating" :title="`Inativar papel ${inactivating}`" tone="danger" confirm="Inativar"
    :subtitle="inactivating === 'Transportadora' ? 'Ela deixa de aparecer na expedição. Embarques já conferidos não mudam.' : 'Solicitação nova deste papel fica bloqueada. O outro papel e o que já está em andamento continuam.'"
    @close="inactivating = ''" @confirm="inactivate" />
</template>
