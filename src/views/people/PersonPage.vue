<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight } from 'lucide-vue-next'
import RecordTimeline from '../../components/records/RecordTimeline.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import PersonFile from './PersonFile.vue'
import PersonPhoto from './PersonPhoto.vue'
import { sectorOf } from '../../domain/enterprise'
import { reviewsShareScale } from '../../domain/people'
import { suggestDirectoryEmail } from '../../domain/directory'
import { canSeePersonBlock, directManager, occupantsAt, personView } from '../../domain/organization'
import { today } from '../../domain/engine'
import { AREAS, moduleFeature } from '../../navigation'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { User } from '../../types/domain'
import { fmtCurrency, fmtDate, fmtDateTime } from '../../utils/format'

type Tab = 'dados' | 'vinculo' | 'saude' | 'avaliacoes' | 'acesso' | 'equipe' | 'historico'
const LEGACY: Record<string, Tab> = { ficha: 'dados', contrato: 'vinculo', cadastro: 'vinculo', trajetoria: 'vinculo', acessos: 'acesso' }

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const isNew = computed(() => route.path.endsWith('/nova'))
const record = computed(() => {
  const id = String(route.params.id ?? '')
  return store.state.persons.find(entry => entry.id === id) ?? store.state.persons.find(entry => entry.id === store.state.users.find(user => user.id === id)?.personId)
})
const person = computed(() => store.state.users.find(entry => entry.personId === record.value?.id && entry.homeTenantId === record.value?.tenantId) ?? store.state.users.find(entry => entry.id === route.params.id))
const form = reactive({ name: '', email: '', profileId: '', sector: '', positionId: '', shift: 'Manhã' as User['shift'], google: true, googleEmail: '' })
const googleTouched = ref(false)
const accountEmail = ref('')
const moveForm = reactive({ sector: '', positionId: '', validFrom: today() })
const reviewForm = reactive({ scoreLabel: '', scale: '', period: '', origin: '' })
const contract = reactive({ contractType: '', salary: 0, cbo: '', workplace: '' })

const companySectors = computed(() => store.state.sectors.filter(entry => entry.tenantId === (record.value?.tenantId ?? ui.activeTenantId)))
const companyProfiles = computed(() => store.state.accessProfiles.filter(entry => entry.tenantId === ui.activeTenantId))
const defaultProfile = () => companyProfiles.value.find(entry => entry.simulatedRole === 'Operador')?.id ?? companyProfiles.value[0]?.id ?? ''
const freePositions = (sectorName: string) => store.state.positions.filter(entry => entry.sectorId === companySectors.value.find(sector => sector.name === sectorName)?.id && (entry.id === person.value?.positionId || occupantsAt(store.state, entry.id).length < entry.headcount))
const employment = computed(() => store.state.employments.find(entry => entry.personId === record.value?.id && entry.tenantId === record.value?.tenantId && entry.status === 'Ativo') ?? store.state.employments.find(entry => entry.personId === record.value?.id && entry.tenantId === record.value?.tenantId))
const managed = computed(() => store.state.sectors.filter(entry => entry.managerId === person.value?.id))
const team = computed(() => store.state.users.filter(entry => managed.value.some(sector => sectorOf(store.state, entry)?.id === sector.id) && entry.id !== person.value?.id))
const fileView = computed(() => record.value && person.value ? personView(ui.role, ui.sessionUserId, record.value, person.value.id, managed.value.length > 0) : 'profissional')
const profilesHere = computed(() => person.value ? store.state.userProfileAssignments.filter(entry => entry.userId === person.value!.id) : [])
const companies = computed(() => [...new Set(profilesHere.value.map(entry => entry.tenantId))].map(id => store.state.tenants.find(entry => entry.id === id)?.tradeName ?? id))
const profilesByCompany = computed(() => [...new Set(profilesHere.value.map(entry => entry.tenantId))].map(tenantId => ({
  tenant: store.state.tenants.find(entry => entry.id === tenantId)?.tradeName ?? tenantId,
  employed: record.value?.tenantId === tenantId || store.state.employments.some(entry => entry.personId === record.value?.id && entry.tenantId === tenantId && entry.status === 'Ativo'),
  profiles: profilesHere.value.flatMap(entry => entry.tenantId === tenantId ? store.state.accessProfiles.filter(profile => profile.id === entry.profileId) : []),
})))
const homeProfileNames = computed(() => profilesHere.value.filter(entry => entry.tenantId === person.value?.homeTenantId).flatMap(entry => store.state.accessProfiles.filter(profile => profile.id === entry.profileId).map(profile => profile.name)).join(', '))
const position = computed(() => store.state.positions.find(entry => entry.id === person.value?.positionId))
const manager = computed(() => person.value ? directManager(store.state, person.value) : undefined)
const assignments = computed(() => store.state.assignments.filter(entry => entry.userId === person.value?.id).sort((a, b) => b.validFrom.localeCompare(a.validFrom)))
const reviews = computed(() => store.state.performanceReviews.filter(entry => entry.userId === person.value?.id).sort((a, b) => b.at.localeCompare(a.at)))
const comparable = computed(() => reviewsShareScale(reviews.value))
const offboarding = computed(() => store.state.offboardings.find(entry => entry.userId === person.value?.id && entry.status === 'Em andamento'))
const movementTasks = computed(() => store.state.peopleChecklists.filter(entry => entry.process === 'movimentacao' && assignments.value.some(assignment => assignment.id === entry.refId)))
const activity = computed(() => person.value ? store.state.events.filter(event => event.actor === person.value!.name).slice(0, 8) : [])
const situation = computed(() => offboarding.value ? 'Em desligamento' : person.value?.active === false ? 'Conta bloqueada' : 'Ativo')
const googleAccount = computed(() => store.state.directoryAccounts.find(entry => entry.personId === record.value?.id && entry.tenantId === record.value?.tenantId && entry.provider === 'Google'))
function proposedEmail(tenantId: string, name: string) {
  if (!name.trim() || !store.state.workspaceConnections.some(entry => entry.tenantId === tenantId)) return ''
  const domain = store.state.workspaceConnections.find(entry => entry.tenantId === tenantId)!.domain
  const current = record.value?.corporateEmail?.toLowerCase()
  if (current?.endsWith(`@${domain}`) && !store.state.directoryAccounts.some(entry => entry.email === current && entry.personId !== record.value?.id)) return current
  return suggestDirectoryEmail(store.state, tenantId, name)
}
const tenure = computed(() => {
  const start = employment.value?.startedOn
  if (!start) return ''
  const months = Math.max(0, (Number(today().slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(today().slice(5, 7)) - Number(start.slice(5, 7)))
  return months >= 12 ? `${Math.floor(months / 12)} ano(s) e ${months % 12} mês(es)` : `${months} mês(es)`
})
const access = computed(() => person.value ? AREAS.map(area => ({
  area: area.label,
  modules: area.groups.flatMap(group => group.items).filter(item => {
    if (!item.module) return true
    const profiles = profilesHere.value.map(assignment => store.state.accessProfiles.find(profile => profile.id === assignment.profileId))
    return profiles.some(profile => profile?.system || profile?.functionalityIds.includes(moduleFeature(item.module!)))
  }).map(item => item.label),
})).filter(entry => entry.modules.length) : [])

const tabs = computed(() => [
  { id: 'dados' as const, label: 'Dados pessoais' },
  { id: 'vinculo' as const, label: 'Vínculo e trajetória', count: assignments.value.length },
  { id: 'saude' as const, label: 'Saúde e benefícios' },
  { id: 'avaliacoes' as const, label: 'Avaliações', count: reviews.value.length },
  { id: 'acesso' as const, label: 'Acesso' },
  ...(team.value.length ? [{ id: 'equipe' as const, label: 'Equipe', count: team.value.length }] : []),
  { id: 'historico' as const, label: 'Histórico' },
])
const tab = computed<Tab>(() => {
  const raw = String(route.query.aba ?? 'dados')
  const name = LEGACY[raw] ?? raw
  return tabs.value.some(entry => entry.id === name) ? name as Tab : 'dados'
})

watch(employment, current => Object.assign(contract, { contractType: current?.contractType ?? '', salary: current?.salary ?? 0, cbo: current?.cbo ?? '', workplace: current?.workplace ?? '' }), { immediate: true })
watch(person, current => Object.assign(moveForm, { sector: current ? sectorOf(store.state, current)?.name ?? current.sector : '', positionId: '', validFrom: today() }), { immediate: true })
watch(() => route.path, path => {
  if (!path.endsWith('/nova')) return
  googleTouched.value = false
  Object.assign(form, { name: '', email: '', profileId: defaultProfile(), sector: companySectors.value[0]?.name ?? '', positionId: '', shift: 'Manhã', google: true, googleEmail: '' })
}, { immediate: true })
watch(() => form.name, name => { if (!googleTouched.value) form.googleEmail = proposedEmail(ui.activeTenantId, name) })
watch(record, current => { accountEmail.value = current ? proposedEmail(current.tenantId, current.fullName) : '' }, { immediate: true })

function openTab(aba: Tab) {
  router.replace({ query: { aba } })
}
function create() {
  const created = store.createUser({ name: form.name, email: form.email || undefined, profileId: form.profileId, sector: form.sector, positionId: form.positionId || undefined, shift: form.shift })
  if (created && created !== true && form.google && form.googleEmail && created.personId) store.provisionDirectoryAccount(created.personId, form.googleEmail)
  if (created && created !== true) router.push(`/pessoas/pessoa/${created.personId ?? created.id}`)
}
function saveContract() {
  if (!employment.value) return
  const patch = canSeePersonBlock(fileView.value, 'salario') ? { ...contract } : { contractType: contract.contractType, cbo: contract.cbo, workplace: contract.workplace }
  store.updateEmployment(employment.value.id, patch)
}
function update(patch: Partial<Pick<User, 'shift' | 'active'>>) {
  if (person.value) store.updateUser(person.value.id, patch)
}
function move() {
  if (!person.value) return
  const done = store.changeAssignment(ui.activeTenantId, person.value.id, { sector: moveForm.sector, positionId: moveForm.positionId || undefined, validFrom: moveForm.validFrom })
  if (done) moveForm.positionId = ''
}
function registerReview() {
  if (!person.value) return
  const created = store.recordReview(person.value.id, reviewForm)
  if (created) Object.assign(reviewForm, { scoreLabel: '', scale: '', period: '', origin: '' })
}
</script>

<template>
  <nav class="crumb-bar" aria-label="Caminho">
    <RouterLink to="/pessoas" class="crumb-back" title="Voltar para Colaboradores"><ArrowLeft :size="16" /></RouterLink>
    <RouterLink to="/pessoas" class="crumb">Colaboradores</RouterLink>
    <ChevronRight :size="14" class="sep" />
    <span class="crumb here">{{ isNew ? 'Nova pessoa' : person?.name ?? 'Pessoa não encontrada' }}</span>
  </nav>

  <article v-if="isNew" class="card">
    <h2>Nova pessoa</h2>
    <p class="cell-sub" style="margin-bottom:14px">O resto da ficha é preenchido depois, na página da pessoa. O PIN do tablet é gerado na hora.</p>
    <div class="form-grid">
      <div class="field"><label>Nome</label><input v-model="form.name" /></div>
      <div class="field"><label>E-mail de login</label><input v-model="form.email" placeholder="Deixe vazio para usar o e-mail do Google, ou vazio de vez se usa só o tablet" /></div>
      <div class="field"><label>Conta Google</label><label class="check-line"><input v-model="form.google" type="checkbox" /> Criar no domínio da empresa</label><input v-if="form.google" v-model="form.googleEmail" @input="googleTouched = true" /></div>
      <div class="field"><label>Setor</label><select v-model="form.sector" @change="form.positionId = ''"><option v-for="entry in companySectors" :key="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Posição</label><select v-model="form.positionId"><option value="">Sem posição por enquanto</option><option v-for="entry in freePositions(form.sector)" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small v-if="!freePositions(form.sector).length">Nenhuma vaga livre. <RouterLink to="/pessoas/organograma">Abrir o organograma</RouterLink></small></div>
      <div class="field"><label>Turno</label><select v-model="form.shift"><option>Manhã</option><option>Tarde</option><option>Administrativo</option></select></div>
      <div class="field"><label>Perfil</label><select v-model="form.profileId"><option v-for="entry in companyProfiles" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small>O mesmo catálogo da Gestão de acesso. A posição não concede perfil.</small></div>
    </div>
    <div class="drawer-actions">
      <button class="button" @click="create">Cadastrar</button>
      <RouterLink to="/pessoas" class="button secondary">Cancelar</RouterLink>
    </div>
  </article>

  <div v-else-if="!person" class="card empty-note">Pessoa não encontrada. <RouterLink to="/pessoas">Voltar à lista</RouterLink></div>

  <template v-else>
    <article class="card item-hero">
      <div class="item-head">
        <PersonPhoto v-if="record" :name="person.name" :photo="record.photo" :person-id="record.id" />
        <div class="item-head-main">
          <span class="eyebrow">{{ position?.name ?? 'Sem posição' }} · {{ person.sector }}</span>
          <h2>{{ person.name }}</h2>
          <div class="meta">
            <span>{{ person.email ?? 'Usa só o tablet' }}</span>
            <span>Turno {{ person.shift.toLowerCase() }}</span>
            <span>{{ store.state.tenants.find(entry => entry.id === person!.homeTenantId)?.tradeName }}</span>
          </div>
        </div>
        <div class="actions">
          <StatusBadge :value="situation" />
          <RouterLink v-if="offboarding" class="button secondary small" :to="`/pessoas/desligamento/${offboarding.id}`">Ver desligamento</RouterLink>
          <RouterLink v-else-if="person.active !== false" class="button secondary small" :to="{ path: '/pessoas/desligamento/novo', query: { pessoa: person.id } }">Iniciar desligamento</RouterLink>
        </div>
      </div>
      <div class="kpi-strip">
        <button type="button" class="kpi link" @click="openTab('vinculo')"><span>Na empresa desde</span><strong>{{ employment ? fmtDate(employment.startedOn) : '—' }}</strong><small>{{ tenure || 'Sem vínculo registrado' }}</small></button>
        <button type="button" class="kpi link" @click="manager && router.push(`/pessoas/pessoa/${manager.personId ?? manager.id}`)"><span>Gestor direto</span><strong>{{ manager?.name ?? '—' }}</strong><small>{{ manager ? 'Abrir a ficha' : 'Ninguém acima' }}</small></button>
        <button v-if="team.length" type="button" class="kpi link" @click="openTab('equipe')"><span>Equipe</span><strong>{{ team.length }}</strong><small>Lidera {{ managed.map(entry => entry.name).join(', ') }}</small></button>
        <button v-else type="button" class="kpi link" @click="openTab('avaliacoes')"><span>Última avaliação</span><strong>{{ reviews[0]?.scoreLabel ?? '—' }}</strong><small>{{ reviews[0] ? `${reviews[0].period} · escala ${reviews[0].scale}` : 'Nenhuma ainda' }}</small></button>
        <button type="button" class="kpi link" @click="openTab('acesso')"><span>Acesso</span><strong>{{ homeProfileNames || 'Sem perfil' }}</strong><small>{{ companies.length ? companies.join(' · ') : 'Nenhuma empresa' }}</small></button>
      </div>
    </article>

    <article class="card">
      <div class="tabs">
        <button v-for="entry in tabs" :key="entry.id" type="button" :class="{ active: tab === entry.id }" @click="openTab(entry.id)">{{ entry.label }}<b v-if="entry.count">{{ entry.count }}</b></button>
      </div>

      <PersonFile v-if="tab === 'dados' && record" :person-id="record.id" part="pessoal" />
      <PersonFile v-else-if="tab === 'saude' && record" :person-id="record.id" part="saude" />

      <div v-else-if="tab === 'vinculo'" data-tour="person-role">
        <p v-if="offboarding" class="hint">Desligamento em andamento, efetivo em {{ fmtDate(offboarding.effectiveOn) }}. <RouterLink :to="`/pessoas/desligamento/${offboarding.id}`">Abrir o processo</RouterLink></p>
        <section class="person-section">
          <h3>Hoje</h3>
          <div class="form-grid">
            <div class="field"><label>Setor</label><input :value="person.sector" disabled /></div>
            <div class="field"><label>Posição</label><input :value="position?.name ?? 'Sem posição'" disabled /><small v-if="position">{{ position.description }}</small></div>
            <div class="field"><label>Gestor direto</label><input :value="manager?.name ?? '—'" disabled /></div>
            <div class="field"><label>Turno</label><select :value="person.shift" @change="update({ shift: ($event.target as HTMLSelectElement).value as User['shift'] })"><option>Manhã</option><option>Tarde</option><option>Administrativo</option></select></div>
          </div>
        </section>

        <section v-if="employment" class="person-section">
          <h3>Contrato</h3>
          <div class="form-grid">
            <div class="field"><label>Tipo</label><select v-model="contract.contractType"><option>CLT</option><option>Estágio</option><option>PJ</option><option>Temporário</option></select></div>
            <div class="field"><label>Início</label><input :value="fmtDate(employment.startedOn)" disabled /></div>
            <div class="field"><label>CBO</label><input v-model="contract.cbo" /></div>
            <div class="field"><label>Local de trabalho</label><input v-model="contract.workplace" /></div>
            <div v-if="canSeePersonBlock(fileView, 'salario')" class="field"><label>Salário</label><input v-model.number="contract.salary" type="number" min="0" /><small>{{ fmtCurrency(contract.salary || 0) }}</small></div>
          </div>
          <div class="save-bar"><button class="button" @click="saveContract">Salvar contrato</button></div>
        </section>

        <PersonFile v-if="record && canSeePersonBlock(fileView, 'banco')" :person-id="record.id" part="banco" />

        <section class="person-section">
          <h3>Trajetória</h3>
          <div class="inline-form row">
            <span class="cell-sub">Mudar para</span>
            <select v-model="moveForm.sector" class="filter" @change="moveForm.positionId = ''"><option v-for="entry in companySectors" :key="entry.id">{{ entry.name }}</option></select>
            <select v-model="moveForm.positionId" class="filter"><option value="">Sem posição</option><option v-for="entry in freePositions(moveForm.sector)" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select>
            <span class="cell-sub">a partir de</span>
            <input v-model="moveForm.validFrom" type="date" class="filter" />
            <button class="button secondary small" @click="move">Registrar mudança</button>
          </div>
          <ol class="timeline">
            <li v-for="entry in assignments" :key="entry.id"><i></i><div><strong>{{ entry.sector }} · {{ store.state.positions.find(item => item.id === entry.positionId)?.name ?? 'Sem posição' }}</strong><span>{{ fmtDate(entry.validFrom) }}<template v-if="entry.validTo"> a {{ fmtDate(entry.validTo) }}</template><template v-else> · atual</template> · registrado por {{ entry.actor }}</span></div></li>
          </ol>
          <p v-if="!assignments.length" class="empty-note">Nenhuma mudança registrada.</p>
          <div v-for="list in movementTasks" :key="list.id" class="list-row static"><div><strong>Revisar depois da mudança</strong><span>{{ list.items.map(item => `${item.label}: ${item.status}`).join(' · ') }}</span></div></div>
          <p class="hint">Mudar de posição não mexe no acesso. O sistema só cria as tarefas de revisão.</p>
        </section>
      </div>

      <div v-else-if="tab === 'avaliacoes'">
        <div class="inline-form row">
          <input v-model="reviewForm.scoreLabel" class="filter" placeholder="Nota (4 ou B)" />
          <input v-model="reviewForm.scale" class="filter" placeholder="Escala (0 a 5)" />
          <input v-model="reviewForm.period" class="filter" placeholder="Período (2026)" />
          <input v-model="reviewForm.origin" class="filter" placeholder="Quem avaliou" />
          <button class="button secondary small" @click="registerReview">Registrar</button>
        </div>
        <ol class="timeline">
          <li v-for="entry in reviews" :key="entry.id"><i></i><div><strong>{{ entry.scoreLabel }} · escala {{ entry.scale }}</strong><span>{{ entry.period }} · {{ entry.origin }} · {{ entry.actor }} · {{ fmtDateTime(entry.at) }}</span></div></li>
        </ol>
        <p v-if="reviews.length > 1 && !comparable" class="hint">Estas notas usam escalas diferentes e não são comparadas.</p>
        <p v-if="!reviews.length" class="empty-note">Nenhuma avaliação registrada.</p>
      </div>

      <div v-else-if="tab === 'acesso'" data-tour="person-access">
        <div class="kpi-strip">
          <div class="kpi"><span>Conta</span><strong>{{ person.email ?? 'Só tablet' }}</strong><small>{{ person.active === false ? 'Bloqueada' : 'Ativa' }}</small></div>
          <div class="kpi"><span>Acesso em</span><strong>{{ companies.length }}</strong><small>{{ companies.join(' · ') || 'Nenhuma' }}</small></div>
          <div class="kpi"><span>PIN do tablet</span><strong>••{{ person.pin.slice(-2) }}</strong><small>Os outros dígitos não aparecem</small></div>
        </div>
        <h3 class="partner-h">Perfis</h3>
        <p class="hint">O número conta empresas em que a conta tem perfil, não empregos. Isso se define na Gestão de acesso: escolha a empresa, ou o grupo para ver o mapa. Acesso sem vínculo não cria usuário. Um emprego novo nasce em Pessoas, em Contratar aqui também. A posição não concede perfil.</p>
        <section v-for="group in profilesByCompany" :key="group.tenant" class="person-section">
          <h3>{{ group.tenant }}</h3>
          <p class="cell-sub">{{ group.employed ? 'Vínculo nesta empresa.' : 'Acesso sem vínculo: a conta entra aqui, sem cadastro nem posição.' }}</p>
          <div class="chip-row"><span v-for="profile in group.profiles" :key="profile.id" class="chip active">{{ profile.name }}</span></div>
        </section>
        <p v-if="!profilesHere.length" class="empty-note">Nenhum perfil. O acesso se concede em Gestão de acesso.</p>
        <h3 class="partner-h">O que ela vê</h3>
        <div v-for="entry in access" :key="entry.area" class="access-row"><b>{{ entry.area }}</b><span v-for="module in entry.modules" :key="module" class="chip">{{ module }}</span></div>
        <p v-if="!access.length" class="empty-note">Nenhum módulo. Usa só o tablet.</p>
        <h3 class="partner-h">Conta Google</h3>
        <template v-if="googleAccount">
          <div class="kpi-strip">
            <div class="kpi"><span>E-mail</span><strong>{{ googleAccount.email }}</strong><small><StatusBadge :value="googleAccount.status" /></small></div>
            <div class="kpi"><span>Identificador</span><strong>{{ googleAccount.externalId ?? '—' }}</strong><small>Sem senha neste registro</small></div>
          </div>
          <p v-if="googleAccount.failure" class="hint">{{ googleAccount.failure }}</p>
          <button v-if="googleAccount.status === 'Falha'" class="button secondary small" @click="store.retryDirectoryAccount(googleAccount.id)">Tentar de novo</button>
          <p class="hint">A suspensão corre na data efetiva do desligamento. A posição não mexe nesta conta.</p>
        </template>
        <template v-else-if="accountEmail">
          <div class="inline-form row">
            <input v-model="accountEmail" class="filter" />
            <button class="button secondary small" @click="record && store.provisionDirectoryAccount(record.id, accountEmail)">Criar conta</button>
          </div>
          <p class="hint">Confira o e-mail antes de criar. A senha não volta para o Thalamus.</p>
        </template>
        <p v-else class="hint">Esta empresa não tem domínio Google configurado.</p>
        <div class="action-row" style="margin-top: 12px">
          <button class="button secondary small" @click="store.resetPin(person.id)">Redefinir PIN</button>
          <button class="button secondary small" @click="update({ active: person.active === false })">{{ person.active === false ? 'Reativar conta' : 'Bloquear conta' }}</button>
          <RouterLink class="button secondary small" to="/organizacao">Mudar perfis em Gestão de acesso</RouterLink>
        </div>
      </div>

      <div v-else-if="tab === 'equipe'">
        <button v-for="member in team" :key="member.id" class="list-row" @click="router.push(`/pessoas/pessoa/${member.personId ?? member.id}`)">
          <div><strong>{{ member.name }}</strong><span>{{ store.state.positions.find(item => item.id === member.positionId)?.name ?? 'Sem posição' }} · {{ member.shift }}</span></div>
          <StatusBadge :value="member.active === false ? 'Conta bloqueada' : 'Ativo'" />
        </button>
      </div>

      <div v-else>
        <ol class="timeline">
          <li v-for="event in activity" :key="event.id"><i></i><div><strong>{{ event.text }}</strong><span>{{ fmtDateTime(event.at) }} · {{ event.module }}</span></div></li>
        </ol>
        <p v-if="!activity.length" class="empty-note">Nada feito por esta pessoa nos últimos registros.</p>
        <RecordTimeline :ref-id="person.id" />
      </div>
    </article>
  </template>
</template>
