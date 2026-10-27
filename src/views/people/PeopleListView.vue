<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import DirectoryAlert from './DirectoryAlert.vue'
import PersonPhoto from './PersonPhoto.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { sectorOf } from '../../domain/enterprise'
import { directManager, groupDirectory, occupantsAt } from '../../domain/organization'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { User } from '../../types/domain'

type Filter = 'todos' | 'sem-posicao' | 'desligamento' | 'bloqueada' | 'grupo'
type Mode = 'projeto' | 'acesso' | 'vinculo'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const filter = ref<Filter>('todos')
const sector = ref('')
const query = ref('')
const target = ref<ReturnType<typeof groupDirectory>[number] | null>(null)
const mode = ref<Mode>('projeto')
const form = reactive({ projectId: '', projectRole: '', profileId: '', sector: '', positionId: '', contractType: 'CLT', startedOn: today(), shift: 'Manhã' as User['shift'] })

const companySectors = computed(() => store.state.sectors.filter(entry => entry.tenantId === ui.activeTenantId))
const staff = computed(() => store.state.users.filter(entry => !entry.platformMaster && entry.homeTenantId === ui.activeTenantId))
const leaving = (user: User) => store.state.offboardings.some(entry => entry.userId === user.id && entry.status === 'Em andamento')
const situation = (user: User) => leaving(user) ? 'Em desligamento' : user.active === false ? 'Conta bloqueada' : 'Ativo'
const matches: Record<Exclude<Filter, 'grupo'>, (user: User) => boolean> = {
  todos: () => true,
  'sem-posicao': user => !user.positionId,
  desligamento: leaving,
  bloqueada: user => user.active === false && !leaving(user),
}
const directory = computed(() => groupDirectory(store.state, ui.activeTenantId))
const filters = computed(() => [
  { id: 'todos' as const, label: 'Todos', count: staff.value.length },
  { id: 'sem-posicao' as const, label: 'Sem posição', count: staff.value.filter(matches['sem-posicao']).length },
  { id: 'desligamento' as const, label: 'Em desligamento', count: staff.value.filter(matches.desligamento).length },
  { id: 'bloqueada' as const, label: 'Conta bloqueada', count: staff.value.filter(matches.bloqueada).length },
])
const text = (value: string) => !query.value || value.toLowerCase().includes(query.value.toLowerCase())
const people = computed(() => filter.value === 'grupo' ? [] : staff.value.filter(entry =>
  matches[filter.value as Exclude<Filter, 'grupo'>](entry)
  && (!sector.value || sectorOf(store.state, entry)?.name === sector.value)
  && text(`${entry.name} ${entry.email ?? ''} ${positionName(entry.positionId) ?? ''}`)))
const peers = computed(() => directory.value.filter(entry => text(`${entry.name} ${entry.jobTitle} ${entry.tenantName}`)))
const positionName = (id?: string) => store.state.positions.find(entry => entry.id === id)?.name
const managerOf = (user: User) => directManager(store.state, user)?.name ?? '—'

const projects = computed(() => store.state.projects.filter(entry => entry.status !== 'Cancelado'))
const profiles = computed(() => store.state.accessProfiles.filter(entry => entry.tenantId === ui.activeTenantId))
const targetAccount = computed(() => store.state.users.find(entry => entry.personId === target.value?.personId))
const freePositions = computed(() => store.state.positions.filter(entry => entry.sectorId === companySectors.value.find(item => item.name === form.sector)?.id && occupantsAt(store.state, entry.id).length < entry.headcount))
const tenantName = computed(() => store.state.tenants.find(entry => entry.id === ui.activeTenantId)?.tradeName ?? 'esta empresa')

function open(entry: ReturnType<typeof groupDirectory>[number]) {
  target.value = entry
  mode.value = 'projeto'
  const profileId = profiles.value.find(entry => entry.simulatedRole === 'Operador')?.id ?? profiles.value[0]?.id ?? ''
  Object.assign(form, { projectId: projects.value[0]?.id ?? '', projectRole: '', profileId, sector: companySectors.value[0]?.name ?? '', positionId: '', contractType: 'CLT', startedOn: today(), shift: 'Manhã' })
}
function confirm() {
  const entry = target.value
  if (!entry) return
  let done: unknown
  if (mode.value === 'projeto') done = store.addProjectParticipation(ui.activeTenantId, form.projectId, entry.personId, form.projectRole)
  if (mode.value === 'acesso' && targetAccount.value) done = store.grantCompanyAccess(targetAccount.value.id, ui.activeTenantId, form.profileId)
  if (mode.value === 'vinculo') done = store.openLinkedEmployment(entry.personId, ui.activeTenantId, { sector: form.sector, positionId: form.positionId || undefined, contractType: form.contractType, startedOn: form.startedOn, profileId: form.profileId, shift: form.shift })
  if (done) target.value = null
}
</script>

<template>
  <article class="card flush" data-tour="record-list">
    <div class="section-head">
      <div>
        <h2>Colaboradores</h2>
        <p>Quem trabalha em {{ tenantName }}. Clique na pessoa para abrir a ficha.</p>
      </div>
      <button data-tour="new-record" class="button" @click="router.push('/pessoas/nova')">Nova pessoa</button>
    </div>
    <DirectoryAlert />
    <div class="partner-filters">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Nome, e-mail ou posição" /></label>
      <select v-if="filter !== 'grupo'" v-model="sector" class="filter"><option value="">Todos os setores</option><option v-for="entry in companySectors" :key="entry.id" :value="entry.name">{{ entry.name }}</option></select>
      <div class="chip-row" style="margin:0">
        <button v-for="entry in filters" :key="entry.id" type="button" class="chip" :class="{ active: filter === entry.id }" @click="filter = entry.id">{{ entry.label }} <b>{{ entry.count }}</b></button>
        <button v-if="directory.length" type="button" class="chip" :class="{ active: filter === 'grupo' }" title="Pessoas das outras empresas do grupo" @click="filter = 'grupo'">Outras empresas do grupo <b>{{ directory.length }}</b></button>
      </div>
    </div>

    <template v-if="filter !== 'grupo'">
      <table class="dense">
        <thead><tr><th>Pessoa</th><th>Setor e posição</th><th>Gestor direto</th><th>Turno</th><th>Situação</th></tr></thead>
        <tbody>
          <tr v-for="user in people" :key="user.id" class="clickable" @click="router.push(`/pessoas/pessoa/${user.personId ?? user.id}`)">
            <td><div class="person-cell"><PersonPhoto :name="user.name" :photo="store.state.persons.find(entry => entry.id === user.personId)?.photo" size="row" /><div><span class="cell-main">{{ user.name }}</span><span class="cell-sub">{{ user.email ?? 'Usa só o tablet' }}</span></div></div></td>
            <td><span class="cell-main">{{ user.sector }}</span><span class="cell-sub" :class="{ 'warn-text': !user.positionId }">{{ positionName(user.positionId) ?? 'Sem posição' }}</span></td>
            <td>{{ managerOf(user) }}</td>
            <td>{{ user.shift }}</td>
            <td><StatusBadge :value="situation(user)" /></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!people.length" class="empty-note">Ninguém com esse filtro.</p>
    </template>

    <template v-else>
      <p class="hint" style="padding: 0 18px">Estas pessoas são de outra empresa do grupo. Aqui aparecem só nome, cargo e contato. Documento, saúde, salário e banco não saem da empresa de origem.</p>
      <table class="dense">
        <thead><tr><th>Pessoa</th><th>Empresa</th><th>Cargo</th><th>Cadastro aqui</th><th></th></tr></thead>
        <tbody>
          <tr v-for="entry in peers" :key="entry.personId">
            <td><div class="person-cell"><PersonPhoto :name="entry.name" :photo="entry.photo" size="row" /><div><span class="cell-main">{{ entry.name }}</span><span class="cell-sub">{{ entry.contact || 'Sem e-mail corporativo' }}</span></div></div></td>
            <td>{{ entry.tenantName }}</td>
            <td>{{ entry.jobTitle }}</td>
            <td><span :class="{ 'warn-text': entry.linkStatus === 'Sugerido' }">{{ entry.linkStatus === 'Confirmado' ? 'Mesma pessoa, ligada' : entry.linkStatus === 'Sugerido' ? 'Talvez seja a mesma pessoa' : 'Nenhum' }}</span></td>
            <td style="text-align:right"><button class="button secondary small" @click="open(entry)">Trazer para {{ tenantName }}</button></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!peers.length" class="empty-note">Ninguém com esse filtro.</p>
    </template>
  </article>

  <BaseModal :open="!!target" :title="`Trazer ${target?.name ?? ''}`" :subtitle="`${target?.tenantName ?? ''} → ${tenantName}`" width="560px" @close="target = null">
    <div class="chip-row">
      <button type="button" class="chip" :class="{ active: mode === 'projeto' }" @click="mode = 'projeto'">Participar de um projeto</button>
      <button type="button" class="chip" :class="{ active: mode === 'acesso' }" @click="mode = 'acesso'">Acesso sem vínculo</button>
      <button type="button" class="chip" :class="{ active: mode === 'vinculo' }" @click="mode = 'vinculo'">Contratar aqui também</button>
    </div>

    <template v-if="mode === 'projeto'">
      <p class="hint">Entra na equipe do projeto e continua na empresa de origem. Não cria cadastro nem conta aqui.</p>
      <div class="form-grid">
        <div class="field"><label>Projeto</label><select v-model="form.projectId"><option v-for="entry in projects" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
        <div class="field"><label>Papel no projeto</label><input v-model="form.projectRole" placeholder="Ex.: Apoio de engenharia" /></div>
      </div>
    </template>

    <template v-else-if="mode === 'acesso'">
      <p class="hint">A conta dela passa a entrar em {{ tenantName }} com o perfil escolhido. Não vira colaboradora daqui.</p>
      <div v-if="targetAccount" class="field"><label>Perfil em {{ tenantName }}</label><select v-model="form.profileId"><option value="" disabled>Escolha o perfil</option><option v-for="entry in profiles" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <p v-else class="empty-note">Esta pessoa não tem conta no Thalamus. Peça para a empresa de origem criar a conta primeiro.</p>
    </template>

    <template v-else>
      <p class="hint">Abre um segundo vínculo formal em {{ tenantName }}. Nasce outro cadastro, só com nome e contato, ligado ao de origem. O resto é preenchido aqui.</p>
      <div class="form-grid">
        <div class="field"><label>Setor</label><select v-model="form.sector" @change="form.positionId = ''"><option v-for="entry in companySectors" :key="entry.id" :value="entry.name">{{ entry.name }}</option></select></div>
        <div class="field"><label>Posição</label><select v-model="form.positionId"><option value="">Sem posição por enquanto</option><option v-for="entry in freePositions" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small v-if="!freePositions.length">Nenhuma vaga livre neste setor.</small></div>
        <div class="field"><label>Contrato</label><select v-model="form.contractType"><option>CLT</option><option>Estágio</option><option>PJ</option><option>Temporário</option></select></div>
        <div class="field"><label>Início</label><input v-model="form.startedOn" type="date" /></div>
        <div class="field"><label>Turno</label><select v-model="form.shift"><option>Manhã</option><option>Tarde</option><option>Administrativo</option></select></div>
        <div class="field"><label>Perfil em {{ tenantName }}</label><select v-model="form.profileId"><option v-for="entry in profiles" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small>O mesmo catálogo da Gestão de acesso.</small></div>
      </div>
    </template>

    <template #footer>
      <button class="button secondary" @click="target = null">Cancelar</button>
      <button class="button" :disabled="mode === 'acesso' && (!targetAccount || !form.profileId)" @click="confirm">Confirmar</button>
    </template>
  </BaseModal>
</template>
