<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Building2, Landmark, Unplug } from 'lucide-vue-next'
import { useErpStore } from '../stores/erp'

const store = useErpStore()
const router = useRouter()
const company = reactive({ legalName: '', tradeName: '', document: '', state: '', city: '', adminName: '', adminEmail: '' })
const states = ref<{ uf: string; name: string }[]>([])
const cities = ref<string[]>([])
const identified = ref(false)
const consulting = ref(false)
const note = ref('Comece pelo CNPJ. O nome, o estado e a cidade vêm dessa consulta.')
let lookupSeq = 0
const group = reactive({ id: '', name: '', description: '', tenantIds: [] as string[] })
const omie = reactive({ tenantId: 'tenant-roboflex', appKey: '', accountLabel: '', secret: '' })

const groupName = (id?: string) => store.state.economicGroups.find(entry => entry.id === id)?.name ?? 'Sem grupo'
const connectionOf = (tenantId: string) => store.state.omieConnections.find(entry => entry.tenantId === tenantId)

function loadOmie() {
  const connection = connectionOf(omie.tenantId)
  omie.appKey = connection?.appKey ?? ''
  omie.accountLabel = connection?.accountLabel ?? ''
  omie.secret = ''
}
loadOmie()

const selectedGroupMembers = computed(() => store.state.tenants.filter(entry => entry.groupId === group.id).map(entry => entry.id))
function editGroup(id: string) {
  const current = store.state.economicGroups.find(entry => entry.id === id)
  if (!current) return
  group.id = current.id
  group.name = current.name
  group.description = current.description
  group.tenantIds = selectedGroupMembers.value
}
function toggleTenant(id: string) {
  group.tenantIds = group.tenantIds.includes(id) ? group.tenantIds.filter(entry => entry !== id) : [...group.tenantIds, id]
}
function maskCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  let masked = digits.slice(0, 2)
  if (digits.length > 2) masked += `.${digits.slice(2, 5)}`
  if (digits.length > 5) masked += `.${digits.slice(5, 8)}`
  if (digits.length > 8) masked += `/${digits.slice(8, 12)}`
  if (digits.length > 12) masked += `-${digits.slice(12, 14)}`
  return masked
}
function fold(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
async function loadStates() {
  const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
  if (!response.ok) return
  const data = await response.json() as { sigla: string; nome: string }[]
  states.value = data.map(entry => ({ uf: entry.sigla, name: entry.nome }))
}
void loadStates()
async function loadCities(uf: string, seq: number) {
  cities.value = []
  if (!uf) return
  const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
  if (seq !== lookupSeq || !response.ok) return
  const data = await response.json() as { nome: string }[]
  cities.value = data.map(entry => entry.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
async function onDocument(event: Event) {
  company.document = maskCnpj((event.target as HTMLInputElement).value)
  const digits = company.document.replace(/\D/g, '')
  const seq = ++lookupSeq
  company.legalName = ''
  company.tradeName = ''
  company.state = ''
  company.city = ''
  cities.value = []
  identified.value = false
  if (digits.length !== 14) {
    consulting.value = false
    note.value = 'Comece pelo CNPJ. O nome, o estado e a cidade vêm dessa consulta.'
    return
  }
  consulting.value = true
  note.value = 'Consultando o cadastro do CNPJ…'
  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (seq !== lookupSeq) return
    if (response.status === 404) { note.value = 'CNPJ não encontrado na Receita Federal.'; return }
    if (!response.ok) { note.value = 'Não foi possível consultar o CNPJ agora. Tente de novo.'; return }
    const data = await response.json() as { razao_social?: string; nome_fantasia?: string; uf?: string; municipio?: string; descricao_situacao_cadastral?: string }
    company.legalName = data.razao_social ?? ''
    company.tradeName = data.nome_fantasia ?? ''
    company.state = (data.uf ?? '').toUpperCase()
    await loadCities(company.state, seq)
    if (seq !== lookupSeq) return
    company.city = cities.value.find(city => fold(city) === fold(data.municipio ?? '')) ?? ''
    identified.value = true
    note.value = data.descricao_situacao_cadastral && data.descricao_situacao_cadastral.toUpperCase() !== 'ATIVA' ? `Situação na Receita: ${data.descricao_situacao_cadastral}` : ''
    if (!company.city) note.value = 'Escolha a cidade. O município informado pela Receita não coincidiu com a lista.'
  } catch {
    if (seq === lookupSeq) note.value = 'Não foi possível consultar o CNPJ agora. Tente de novo.'
  } finally {
    if (seq === lookupSeq) consulting.value = false
  }
}
async function onState() {
  const seq = lookupSeq
  company.city = ''
  await loadCities(company.state, seq)
}
function createCompany() {
  if (!identified.value || !company.state || !company.city) return
  const id = store.createCompany({ ...company })
  if (!id) return
  company.legalName = ''
  company.tradeName = ''
  company.document = ''
  company.state = ''
  company.city = ''
  company.adminName = ''
  company.adminEmail = ''
  cities.value = []
  identified.value = false
  note.value = 'Comece pelo CNPJ. O nome, o estado e a cidade vêm dessa consulta.'
}
function saveGroup() {
  if (store.saveGroup({ id: group.id, name: group.name, description: group.description, tenantIds: [...group.tenantIds] })) {
    group.id = ''
    group.name = ''
    group.description = ''
    group.tenantIds = []
  }
}
function saveOmie() {
  const secret = omie.secret
  if (store.configureOmie(omie.tenantId, omie.appKey, omie.accountLabel, secret.length > 0)) omie.secret = ''
}
function openCompany(id: string) {
  store.enterCompany(id)
  router.push('/')
}
</script>

<template>
  <div class="toolbar" data-tour="platform-intro"><p>O usuário mestre cadastra empresas, grupos econômicos e o vínculo com o Omie. Ele não opera o ERP. Cada empresa nasce só com o perfil Administrador; os demais perfis são criados dentro dela.</p></div>

  <section class="grid-2">
    <article class="card">
      <div class="section-head"><div><h2><Building2 :size="18" /> Empresas</h2><p>O documento abaixo é de demonstração. A conta Omie da Roboflex ainda não está ligada.</p></div></div>
      <table>
        <thead><tr><th>Empresa</th><th>Documento</th><th>Grupo</th><th>Omie</th><th></th></tr></thead>
        <tbody>
          <tr v-for="tenant in store.state.tenants" :key="tenant.id">
            <td><span class="cell-main">{{ tenant.tradeName }}</span><span class="cell-sub">{{ tenant.legalName }} · {{ tenant.city }}<template v-if="tenant.state">/{{ tenant.state }}</template></span></td>
            <td>{{ tenant.document }}</td>
            <td>{{ groupName(tenant.groupId) }}</td>
            <td><span class="status" :class="connectionOf(tenant.id)?.status === 'Simulada' ? 'success' : 'neutral'">{{ connectionOf(tenant.id)?.status ?? 'Não configurada' }}</span></td>
            <td><button class="button small" @click="openCompany(tenant.id)">Entrar</button></td>
          </tr>
        </tbody>
      </table>
    </article>
    <article class="card">
      <div class="section-head"><div><h2>Nova empresa</h2><p>Cria o tenant, o Administrador com todas as funcionalidades do código e o primeiro usuário.</p></div></div>
      <div class="form-grid">
        <div class="field wide">
          <label>CNPJ<span class="required-mark" title="Obrigatório">*</span></label>
          <input :value="company.document" class="filter" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0001-00" required @input="onDocument" />
          <p class="hint">{{ consulting ? 'Consultando o cadastro do CNPJ…' : note }}</p>
        </div>
        <div class="field"><label>Razão social<span class="required-mark" title="Obrigatório">*</span></label><input v-model="company.legalName" class="filter" :disabled="!identified" required /></div>
        <div class="field"><label>Nome fantasia</label><input v-model="company.tradeName" class="filter" :disabled="!identified" /></div>
        <div class="field"><label>Estado<span class="required-mark" title="Obrigatório">*</span></label>
          <select v-model="company.state" class="filter" :disabled="!identified" required @change="onState">
            <option value="">Selecione</option>
            <option v-for="state in states" :key="state.uf" :value="state.uf">{{ state.name }}</option>
          </select>
        </div>
        <div class="field"><label>Cidade<span class="required-mark" title="Obrigatório">*</span></label>
          <select v-model="company.city" class="filter" :disabled="!identified || !company.state" required>
            <option value="">Selecione</option>
            <option v-for="city in cities" :key="city" :value="city">{{ city }}</option>
          </select>
        </div>
        <div class="field"><label>Primeiro administrador<span class="required-mark" title="Obrigatório">*</span></label><input v-model="company.adminName" class="filter" :disabled="!identified" required /></div>
        <div class="field"><label>E-mail<span class="required-mark" title="Obrigatório">*</span></label><input v-model="company.adminEmail" class="filter" type="email" :disabled="!identified" required /></div>
      </div>
      <button class="button small" @click="createCompany">Cadastrar empresa</button>
    </article>
  </section>

  <section class="grid-2">
    <article class="card">
      <div class="section-head"><div><h2><Landmark :size="18" /> Grupos econômicos</h2><p>Uma empresa fica em no máximo um grupo. O grupo consulta; não mistura o movimento.</p></div></div>
      <p v-if="!store.state.economicGroups.length" class="empty-note">Nenhum grupo cadastrado.</p>
      <button v-for="entry in store.state.economicGroups" :key="entry.id" class="button ghost small" @click="editGroup(entry.id)">{{ entry.name }}</button>
      <div class="form-grid" style="margin-top:12px">
        <div class="field"><label>Nome</label><input v-model="group.name" class="filter" /></div>
        <div class="field"><label>Descrição</label><input v-model="group.description" class="filter" /></div>
      </div>
      <div class="functionality-module">
        <label v-for="tenant in store.state.tenants" :key="tenant.id"><input type="checkbox" :checked="group.tenantIds.includes(tenant.id)" @change="toggleTenant(tenant.id)" /><span>{{ tenant.tradeName }}</span></label>
      </div>
      <button class="button small" @click="saveGroup">Salvar grupo</button>
    </article>
    <article class="card" data-tour="platform-omie">
      <div class="section-head"><div><h2><Unplug :size="18" /> Vínculo Omie</h2><p>A chave identifica a conta. O segredo é aceito e descartado: o navegador só guarda que ele foi informado. A chamada real ao Omie continua simulada.</p></div></div>
      <div class="field"><label>Empresa</label><select v-model="omie.tenantId" class="filter" @change="loadOmie"><option v-for="tenant in store.state.tenants" :key="tenant.id" :value="tenant.id">{{ tenant.tradeName }}</option></select></div>
      <div class="field"><label>Chave da aplicação</label><input v-model="omie.appKey" class="filter" /></div>
      <div class="field"><label>Nome da conta</label><input v-model="omie.accountLabel" class="filter" /></div>
      <div class="field"><label>Segredo</label><input v-model="omie.secret" class="filter" type="password" autocomplete="new-password" placeholder="Informe para marcar como definido" /></div>
      <p class="cell-sub">Situação: {{ connectionOf(omie.tenantId)?.status }}. Segredo {{ connectionOf(omie.tenantId)?.secretDefined ? 'definido' : 'ausente' }}.</p>
      <button class="button small" @click="saveOmie">Registrar vínculo</button>
    </article>
  </section>
</template>
