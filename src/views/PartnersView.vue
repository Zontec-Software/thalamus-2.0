<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Handshake, Plus, Search } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { ADDRESS_PURPOSES, clientSalesBase, duplicatePartner, homologationsOf, phaseOf, roleStatus, supplierReceiptBase } from '../domain/partners'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { AddressPurpose, PartnerRoleName } from '../types/domain'
import { fmtCurrency, fmtDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const query = ref('')
const roleFilter = ref<'' | 'Cliente' | 'Fornecedor' | 'Ambos'>('')
const creating = ref(false)
const profile = ref<'geral' | 'cliente' | 'fornecedor'>('geral')
const duplicateAck = ref(false)
const reason = ref('')

const form = reactive({
  personType: 'Jurídica' as 'Física' | 'Jurídica',
  legalName: '', tradeName: '', document: '',
  roles: [] as ('Cliente' | 'Fornecedor')[],
  contactName: '', duty: 'Comercial', phone: '', email: '',
  purpose: 'Sede' as AddressPurpose, line: '', city: '', state: '',
})
const extra = reactive({ contactName: '', duty: '', phone: '', email: '', purpose: 'Entrega' as AddressPurpose, line: '', city: '', state: '' })
const master = reactive({ personType: 'Jurídica' as 'Física' | 'Jurídica', legalName: '', tradeName: '', document: '' })

const selectedId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const partner = computed(() => store.state.partners.find(entry => entry.id === selectedId.value))
const listed = computed(() => store.state.partners.filter(entry => {
  const text = `${entry.name} ${entry.legalName} ${entry.document}`.toLowerCase()
  if (query.value && !text.includes(query.value.toLowerCase())) return false
  if (roleFilter.value === 'Ambos') return entry.roles.includes('Cliente') && entry.roles.includes('Fornecedor')
  if (roleFilter.value) return entry.roles.includes(roleFilter.value)
  return true
}))
const duplicate = computed(() => creating.value ? duplicatePartner(store.state, form.document) : undefined)
const sales = computed(() => partner.value ? clientSalesBase(store.state, partner.value.id) : undefined)
const receipts = computed(() => partner.value ? supplierReceiptBase(store.state, partner.value.id) : undefined)
const portraits = computed(() => partner.value ? homologationsOf(store.state, partner.value.id) : [])
const pendingAbc = computed(() => partner.value?.abcSuggestions.filter(entry => entry.status === 'Pendente') ?? [])

watch(partner, value => {
  profile.value = 'geral'
  reason.value = ''
  if (!value) return
  master.personType = value.personType
  master.legalName = value.legalName
  master.tradeName = value.tradeName
  master.document = value.document
}, { immediate: true })

function open(id: string) {
  creating.value = false
  router.push(`/parceiros/${id}`)
}
function startNew() {
  creating.value = true
  duplicateAck.value = false
  Object.assign(form, { personType: 'Jurídica', legalName: '', tradeName: '', document: '', roles: [], contactName: '', duty: 'Comercial', phone: '', email: '', purpose: 'Sede', line: '', city: '', state: '' })
  router.push('/parceiros')
}
function toggleRole(role: 'Cliente' | 'Fornecedor') {
  form.roles = form.roles.includes(role) ? form.roles.filter(entry => entry !== role) : [...form.roles, role]
}
function saveNew() {
  const created = store.createPartner({
    personType: form.personType, legalName: form.legalName, tradeName: form.tradeName, document: form.document, roles: form.roles,
    contacts: form.contactName.trim() ? [{ name: form.contactName, duty: form.duty, phone: form.phone, email: form.email }] : [],
    addresses: form.city.trim() || form.line.trim() ? [{ purpose: form.purpose, line: form.line, city: form.city, state: form.state }] : [],
    forceDuplicate: duplicateAck.value,
  })
  if (created && created !== true) { creating.value = false; router.push(`/parceiros/${created.id}`) }
}
function saveMaster() {
  if (!partner.value) return
  store.updatePartnerMaster(partner.value.id, { ...master })
}
function inactivate(role: 'Cliente' | 'Fornecedor') {
  if (!partner.value) return
  store.inactivatePartnerRole(partner.value.id, role, reason.value)
  reason.value = ''
}
function itemName(id: string) {
  return store.state.items.find(entry => entry.id === id)
}
const tone = (status?: string) => status === 'Ativo' || status === 'Homologado' ? 'success' : status === 'Inativo' || status === 'Reprovado' ? 'danger' : 'warning'
const show = (role: PartnerRoleName) => !!partner.value?.roles.includes(role)
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Buscar nome ou documento" /></label>
      <button class="chip" :class="{ active: roleFilter === '' }" @click="roleFilter = ''">Todos</button>
      <button class="chip" :class="{ active: roleFilter === 'Cliente' }" @click="roleFilter = 'Cliente'">Clientes</button>
      <button class="chip" :class="{ active: roleFilter === 'Fornecedor' }" @click="roleFilter = 'Fornecedor'">Fornecedores</button>
      <button class="chip" :class="{ active: roleFilter === 'Ambos' }" @click="roleFilter = 'Ambos'">Os dois papéis</button>
    </div>
    <button data-tour="new-partner" class="button" @click="startNew"><Plus :size="15" /> Novo parceiro</button>
  </div>

  <p class="cell-sub" data-tour="partner-idea">Nome temporário. No Omie, cliente e fornecedor são o mesmo cadastro. Aqui o parceiro é esse registro único; Cliente e Fornecedor são papéis, com dados e indicadores separados.</p>

  <div class="grid-2">
    <article class="card" data-tour="partner-list">
      <table class="data">
        <thead><tr><th>Parceiro</th><th>Documento</th><th>Papéis</th><th>Situação</th></tr></thead>
        <tbody>
          <tr v-for="entry in listed" :key="entry.id" :class="{ selected: entry.id === partner?.id }" @click="open(entry.id)">
            <td><strong>{{ entry.name }}</strong><span>{{ entry.city }}</span></td>
            <td>{{ entry.document }}</td>
            <td>{{ entry.roles.join(' · ') || 'Nenhum' }}</td>
            <td><StatusBadge :value="phaseOf(entry)" :tone="tone(phaseOf(entry))" /></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!listed.length" class="empty-note">Nenhum parceiro com esse filtro.</p>
    </article>

    <article v-if="creating" class="card">
      <h2>Novo parceiro</h2>
      <p class="cell-sub">Um registro só. O papel pode ser Cliente, Fornecedor ou os dois, agora ou depois.</p>
      <div class="form-grid">
        <div class="field"><label>Pessoa</label><select v-model="form.personType"><option>Jurídica</option><option>Física</option></select></div>
        <div class="field"><label>Documento</label><input v-model="form.document" placeholder="CPF ou CNPJ" /></div>
        <div class="field wide"><label>Razão social ou nome</label><input v-model="form.legalName" /></div>
        <div class="field wide"><label>Nome fantasia</label><input v-model="form.tradeName" /></div>
      </div>
      <p v-if="duplicate" class="notice warning">Já existe {{ duplicate.name }} com este documento. <label><input v-model="duplicateAck" type="checkbox" /> Cadastrar mesmo assim</label></p>
      <div class="field"><label>Papéis</label>
        <div class="filter-row">
          <label class="cell-sub"><input type="checkbox" :checked="form.roles.includes('Cliente')" @change="toggleRole('Cliente')" /> Cliente</label>
          <label class="cell-sub"><input type="checkbox" :checked="form.roles.includes('Fornecedor')" @change="toggleRole('Fornecedor')" /> Fornecedor</label>
        </div>
        <small>Sem papel, o cadastro fica em cadastro.</small>
      </div>
      <h3 class="drawer-title">Contato</h3>
      <div class="form-grid">
        <div class="field"><label>Nome</label><input v-model="form.contactName" /></div>
        <div class="field"><label>Função</label><input v-model="form.duty" /></div>
        <div class="field"><label>Telefone</label><input v-model="form.phone" /></div>
        <div class="field"><label>E-mail</label><input v-model="form.email" /></div>
      </div>
      <h3 class="drawer-title">Endereço</h3>
      <div class="form-grid">
        <div class="field"><label>Finalidade</label><select v-model="form.purpose"><option v-for="purpose in ADDRESS_PURPOSES" :key="purpose">{{ purpose }}</option></select></div>
        <div class="field wide"><label>Logradouro</label><input v-model="form.line" /></div>
        <div class="field"><label>Cidade</label><input v-model="form.city" /></div>
        <div class="field"><label>UF</label><input v-model="form.state" maxlength="2" /></div>
      </div>
      <button class="button" @click="saveNew">Salvar parceiro</button>
    </article>

    <article v-else-if="partner" class="card" data-tour="partner-profile">
      <header class="record-heading">
        <div>
          <h2>{{ partner.name }}</h2>
          <p class="cell-sub">{{ partner.personType }} · {{ partner.document }} · {{ partner.city }}</p>
        </div>
        <StatusBadge :value="phaseOf(partner)" :tone="tone(phaseOf(partner))" />
      </header>
      <div class="filter-row">
        <button class="chip" :class="{ active: profile === 'geral' }" @click="profile = 'geral'">Cadastro</button>
        <button v-if="show('Cliente')" class="chip" :class="{ active: profile === 'cliente' }" @click="profile = 'cliente'">Perfil do Cliente</button>
        <button v-if="show('Fornecedor')" class="chip" :class="{ active: profile === 'fornecedor' }" @click="profile = 'fornecedor'">Perfil do Fornecedor</button>
      </div>

      <template v-if="profile === 'geral'">
        <div class="form-grid">
          <div class="field"><label>Pessoa</label><select v-model="master.personType"><option>Jurídica</option><option>Física</option></select></div>
          <div class="field"><label>Documento</label><input v-model="master.document" /></div>
          <div class="field wide"><label>Razão social ou nome</label><input v-model="master.legalName" /></div>
          <div class="field wide"><label>Nome fantasia</label><input v-model="master.tradeName" /></div>
        </div>
        <button class="button secondary" @click="saveMaster">Salvar dados gerais</button>

        <h3 class="drawer-title">Papéis</h3>
        <p class="cell-sub">Inativar um papel não inativa o outro. A política de quem aprova a inativação ainda não foi definida; aqui a solicitação já inativa o papel. Operações em andamento seguem.</p>
        <div v-for="role in (['Cliente', 'Fornecedor'] as const)" :key="role" class="list-row static">
          <div><strong>{{ role }}</strong><span>{{ partner.roles.includes(role) ? roleStatus(partner, role) : 'Não atribuído' }}</span></div>
          <button v-if="!partner.roles.includes(role) || roleStatus(partner, role) === 'Inativo'" class="button secondary small" @click="store.addPartnerRole(partner.id, role)">Atribuir</button>
          <StatusBadge v-else :value="roleStatus(partner, role) ?? 'Ativo'" :tone="tone(roleStatus(partner, role))" />
        </div>
        <div v-if="partner.roles.includes('Transportadora')" class="list-row static"><div><strong>Transportadora</strong><span>Papel já usado na expedição. Fora desta especificação.</span></div></div>
        <div class="field"><label>Motivo da inativação</label><input v-model="reason" placeholder="Fica no histórico" /></div>
        <div class="filter-row">
          <button class="button secondary" :disabled="roleStatus(partner, 'Cliente') !== 'Ativo'" @click="inactivate('Cliente')">Inativar cliente</button>
          <button class="button secondary" :disabled="roleStatus(partner, 'Fornecedor') !== 'Ativo'" @click="inactivate('Fornecedor')">Inativar fornecedor</button>
        </div>

        <h3 class="drawer-title">Contatos</h3>
        <div v-for="(contact, index) in partner.contacts" :key="index" class="list-row static"><div><strong>{{ contact.name }}</strong><span>{{ contact.duty }} · {{ contact.phone }} · {{ contact.email }}</span></div></div>
        <div class="form-grid">
          <div class="field"><label>Nome</label><input v-model="extra.contactName" /></div>
          <div class="field"><label>Função</label><input v-model="extra.duty" /></div>
          <div class="field"><label>Telefone</label><input v-model="extra.phone" /></div>
          <div class="field"><label>E-mail</label><input v-model="extra.email" /></div>
        </div>
        <button class="button secondary" @click="store.addPartnerContact(partner.id, { name: extra.contactName, duty: extra.duty, phone: extra.phone, email: extra.email })">Incluir contato</button>

        <h3 class="drawer-title">Endereços</h3>
        <div v-for="(address, index) in partner.addresses" :key="index" class="list-row static"><div><strong>{{ address.purpose }}</strong><span>{{ address.line }} · {{ address.city }} {{ address.state }}</span></div></div>
        <div class="form-grid">
          <div class="field"><label>Finalidade</label><select v-model="extra.purpose"><option v-for="purpose in ADDRESS_PURPOSES" :key="purpose">{{ purpose }}</option></select></div>
          <div class="field wide"><label>Logradouro</label><input v-model="extra.line" /></div>
          <div class="field"><label>Cidade</label><input v-model="extra.city" /></div>
          <div class="field"><label>UF</label><input v-model="extra.state" maxlength="2" /></div>
        </div>
        <button class="button secondary" @click="store.addPartnerAddress(partner.id, { purpose: extra.purpose, line: extra.line, city: extra.city, state: extra.state })">Incluir endereço</button>

        <h3 class="drawer-title">Histórico</h3>
        <div v-for="(entry, index) in partner.audit" :key="index" class="list-row static"><div><strong>{{ entry.text }}</strong><span>{{ entry.actor }} · {{ fmtDate(entry.at) }}<template v-if="entry.before"> · {{ entry.before }} → {{ entry.after }}</template></span></div></div>
        <p v-if="!partner.audit.length" class="empty-note">Sem alterações além da carga inicial.</p>
      </template>

      <template v-else-if="profile === 'cliente' && sales">
        <section class="metrics">
          <article class="metric"><div class="metric-head">Ticket médio <Handshake :size="17" /></div><strong>Fórmula pendente</strong><small>Origem: Vendas. {{ sales.from ? `Da primeira compra em ${fmtDate(sales.from)} até ${fmtDate(sales.to!)}` : 'Sem compra registrada' }}.</small></article>
          <article class="metric"><div class="metric-head">Base</div><strong>{{ sales.count }}</strong><small>{{ fmtCurrency(sales.total) }} em pedidos. O valor do ticket não é publicado enquanto a regra de Vendas não definir a conta.</small></article>
          <article class="metric"><div class="metric-head">Classe ABC</div><strong>{{ partner.abcClass ?? 'Sem base' }}</strong><small>{{ partner.abcClass ? `Vigente, decidida por ${partner.abcDecidedBy}` : 'Sem histórico suficiente para uma classe. Nenhuma letra foi atribuída.' }} A classe, sozinha, não libera crédito, desconto nem condição.</small></article>
        </section>
        <h3 class="drawer-title">Pedidos em Vendas</h3>
        <div v-for="order in sales.orders" :key="order.id" class="list-row static"><div><strong>{{ order.id }}</strong><span>{{ fmtDate(order.receivedAt) }} · {{ fmtCurrency(order.value) }}</span></div></div>
        <p v-if="!sales.orders.length" class="empty-note">Sem transação em Vendas.</p>
        <h3 class="drawer-title">Reclassificação anual</h3>
        <p class="cell-sub">O alerta nasce da atualização do faturamento. Os limites A, B e C ainda não foram definidos, então nenhuma classe é sugerida e a vigente não muda. A decisão é do Coordenador Comercial; nesta demonstração, o perfil Comercial cumpre essa função.</p>
        <button class="button secondary" @click="store.registerAnnualBilling(partner.id, '2026')">Registrar faturamento de 2026</button>
        <div v-for="suggestion in partner.abcSuggestions" :key="suggestion.id" class="list-row static">
          <div>
            <strong>{{ suggestion.year }} · {{ fmtCurrency(suggestion.billing) }} · {{ suggestion.status }}</strong>
            <span>{{ suggestion.note }}{{ suggestion.decidedBy ? ` · ${suggestion.decidedBy}` : '' }}</span>
          </div>
          <div v-if="suggestion.status === 'Pendente'" class="filter-row">
            <button class="button small" :disabled="ui.role !== 'Comercial' && ui.role !== 'Administrador'" @click="store.decideAbcSuggestion(partner.id, suggestion.id, true, ui.role)">Aprovar</button>
            <button class="button secondary small" :disabled="ui.role !== 'Comercial' && ui.role !== 'Administrador'" @click="store.decideAbcSuggestion(partner.id, suggestion.id, false, ui.role)">Recusar</button>
          </div>
        </div>
        <p v-if="pendingAbc.length" class="notice info">Há reclassificação aguardando o Coordenador Comercial. Sem uma classe sugerida, aprovar não altera a vigente.</p>
      </template>

      <template v-else-if="profile === 'fornecedor' && receipts">
        <section class="metrics">
          <article class="metric"><div class="metric-head">Nota do fornecedor</div><strong>Cálculo não publicado</strong><small>Origem: recebimentos do Almoxarifado, em Suprimentos. A fórmula, a escala e os pesos ainda não foram definidos.</small></article>
          <article class="metric"><div class="metric-head">Volume recebido</div><strong>{{ receipts.volume }}</strong><small>{{ receipts.received.length }} pedido(s) com recebimento{{ receipts.from ? ` · ${fmtDate(receipts.from)} a ${fmtDate(receipts.to!)}` : '' }}.</small></article>
          <article class="metric"><div class="metric-head">Em andamento</div><strong>{{ receipts.open.length }}</strong><small>Pedidos já abertos seguem até o fim, mesmo com o papel inativo.</small></article>
        </section>
        <h3 class="drawer-title">Retrato de homologação</h3>
        <p class="cell-sub">Leitura do outro submódulo. Só matéria-prima, por fornecedor. Não se decide nem se anexa evidência aqui.</p>
        <div v-for="portrait in portraits" :key="portrait.id" class="list-row static">
          <div>
            <strong>{{ itemName(portrait.itemId)?.code }} · {{ itemName(portrait.itemId)?.name }}</strong>
            <span>{{ portrait.status }} · {{ portrait.reference }}<template v-if="portrait.validUntil"> · até {{ portrait.validUntil }}</template><template v-if="portrait.tests"> · {{ portrait.tests }}</template></span>
          </div>
          <StatusBadge :value="portrait.status" :tone="tone(portrait.status)" />
        </div>
        <p v-if="!portraits.length" class="empty-note">Sem retrato de homologação. Para C2 e C3, a ausência não bloqueia a compra.</p>
      </template>
    </article>

    <article v-else class="card">
      <h2>Parceiros</h2>
      <p class="cell-sub">Escolha um cadastro ou comece um novo. Os perfis de cliente e de fornecedor abrem depois de salvar, sobre os mesmos dados gerais.</p>
    </article>
  </div>
</template>
