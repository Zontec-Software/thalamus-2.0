<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { sectorOf, tasksForRole } from '../../domain/enterprise'
import { reviewsShareScale } from '../../domain/people'
import { AREAS, moduleFeature } from '../../navigation'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Role, User } from '../../types/domain'
import { fmtDate, fmtDateTime } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const ROLES: Role[] = ['Administrador', 'Gestor', 'Comercial', 'Engenharia', 'PCP', 'Compras', 'Almoxarifado', 'Líder de produção', 'Operador', 'Qualidade', 'Expedição', 'Manutenção', 'Assistência', 'Financeiro']
const isNew = computed(() => props.id === 'new')
const person = computed(() => store.state.users.find(entry => entry.id === props.id))
const form = reactive({ name: '', email: '', role: 'Operador' as Role, sector: props.context.sector ?? store.state.sectors[0]?.name ?? '', positionId: '', shift: 'Manhã' as User['shift'] })
const positionsOf = (sectorName: string) => {
  const sector = store.state.sectors.find(entry => entry.name === sectorName)
  return store.state.positions.filter(entry => entry.status === 'Ativo' && entry.sectorId === sector?.id)
}

function create() {
  const profile = store.state.accessProfiles.find(entry => entry.tenantId === ui.activeTenantId && (entry.simulatedRole === form.role || entry.name === form.role))
  if (!profile) return
  const created = store.createUser({ name: form.name, email: form.email || undefined, sector: form.sector, shift: form.shift, positionId: form.positionId || undefined, profileId: profile.id })
  if (created && created !== true) {
    ui.closeRecord()
    router.push(`/pessoas/pessoa/${created.id}`)
  }
}

const access = computed(() => person.value ? AREAS.map(area => ({
  area: area.label,
  modules: area.groups.flatMap(group => group.items).filter(item => {
    if (!item.module) return true
    const profiles = store.state.userProfileAssignments.filter(assignment => assignment.userId === person.value!.id).map(assignment => store.state.accessProfiles.find(profile => profile.id === assignment.profileId))
    return profiles.some(profile => profile?.system || profile?.functionalityIds.includes(moduleFeature(item.module!)))
  }).map(item => item.label),
})).filter(entry => entry.modules.length) : [])
const position = computed(() => store.state.positions.find(entry => entry.id === person.value?.positionId))
const managed = computed(() => store.state.sectors.filter(entry => entry.managerId === props.id))
const team = computed(() => store.state.users.filter(entry => managed.value.some(sector => sectorOf(store.state, entry)?.id === sector.id) && entry.id !== props.id))
const tasks = computed(() => person.value ? tasksForRole(store.state, person.value.role, person.value.id) : [])
const activity = computed(() => person.value ? store.state.events.filter(event => event.actor === person.value!.name).slice(0, 8) : [])

function update(patch: Partial<Pick<User, 'role' | 'shift' | 'active'>>) {
  store.updateUser(props.id, patch)
}

const assignmentForm = reactive({ sector: '', positionId: '', validFrom: '2026-10-27' })
const reviewForm = reactive({ scoreLabel: '', scale: '', period: '', origin: '' })
const assignments = computed(() => store.state.assignments.filter(entry => entry.userId === props.id).sort((a, b) => a.validFrom.localeCompare(b.validFrom)))
const reviews = computed(() => store.state.performanceReviews.filter(entry => entry.userId === props.id).sort((a, b) => a.at.localeCompare(b.at)))
const comparable = computed(() => reviewsShareScale(reviews.value))
const offboarding = computed(() => store.state.offboardings.find(entry => entry.userId === props.id && entry.status === 'Em andamento'))
const movementTasks = computed(() => store.state.peopleChecklists.filter(entry => entry.process === 'movimentacao' && assignments.value.some(assignment => assignment.id === entry.refId)))

function registerAssignment() {
  store.changeAssignment(ui.activeTenantId, props.id, { sector: assignmentForm.sector, positionId: assignmentForm.positionId || undefined, validFrom: assignmentForm.validFrom })
}

function registerReview() {
  const created = store.recordReview(props.id, reviewForm)
  if (created) {
    reviewForm.scoreLabel = ''
    reviewForm.scale = ''
    reviewForm.period = ''
    reviewForm.origin = ''
  }
}
</script>

<template>
  <template v-if="isNew">
    <RecordHeader eyebrow="Cadastros · nova pessoa" title="Nova pessoa" subtitle="O papel define os módulos e tarefas; o cargo descreve a responsabilidade. Um PIN é gerado para o tablet." />
    <div class="drawer-body">
      <div class="form-grid">
        <div class="field"><label>Nome</label><input v-model="form.name" /></div>
        <div class="field"><label>E-mail</label><input v-model="form.email" placeholder="Opcional para operadores" /></div>
        <div class="field"><label>Setor</label><select v-model="form.sector" @change="form.positionId = ''"><option v-for="entry in store.state.sectors" :key="entry.id">{{ entry.name }}</option></select></div>
        <div class="field"><label>Cargo</label><select v-model="form.positionId"><option value="">Sem cargo</option><option v-for="entry in positionsOf(form.sector)" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
        <div class="field"><label>Papel de acesso</label><select v-model="form.role"><option v-for="role in ROLES" :key="role">{{ role }}</option></select></div>
        <div class="field"><label>Turno</label><select v-model="form.shift"><option>Manhã</option><option>Tarde</option><option>Administrativo</option></select></div>
      </div>
      <div class="drawer-actions">
        <button class="button" @click="create">Cadastrar</button>
        <button class="button secondary" @click="ui.closeRecord">Cancelar</button>
      </div>
    </div>
  </template>

  <template v-else-if="person">
    <RecordHeader :eyebrow="`Pessoa · ${person.role}`" :title="person.name" :subtitle="`${position?.name ?? 'Sem cargo'} · ${person.sector} · ${person.email ?? 'acesso pelo tablet'}`">
      <template #actions><StatusBadge :value="person.active === false ? 'Inativo' : 'Ativo'" /></template>
    </RecordHeader>
    <div class="drawer-body">
      <div class="mini-stats four">
        <div class="mini-stat"><strong>{{ access.reduce((sum, entry) => sum + entry.modules.length, 0) }}</strong><span>módulos com acesso</span></div>
        <div class="mini-stat"><strong>{{ tasks.length }}</strong><span>tarefas do papel</span></div>
        <div class="mini-stat"><strong>{{ person.shift }}</strong><span>turno</span></div>
        <div class="mini-stat"><strong>••{{ person.pin.slice(-2) }}</strong><span>PIN do tablet</span></div>
      </div>

      <div data-tour="person-role">
      <h3 class="drawer-title">Cadastro</h3>
      <div class="form-grid">
        <div class="field"><label>Papel de acesso</label><select :value="person.role" @change="update({ role: ($event.target as HTMLSelectElement).value as Role })"><option v-for="role in ROLES" :key="role">{{ role }}</option></select></div>
        <div class="field"><label>Setor vigente</label><input :value="person.sector" disabled /></div>
        <div class="field"><label>Cargo vigente</label><input :value="position?.name ?? 'Sem cargo'" disabled /></div>
        <div class="field"><label>Turno</label><select :value="person.shift" @change="update({ shift: ($event.target as HTMLSelectElement).value as User['shift'] })"><option>Manhã</option><option>Tarde</option><option>Administrativo</option></select></div>
      </div>
      <div class="drawer-actions">
        <button class="button secondary small" @click="update({ active: person.active === false })">{{ person.active === false ? 'Reativar acesso' : 'Desativar acesso' }}</button>
      </div>
      <p v-if="position" class="hint">{{ position.name }}: {{ position.description }}</p>
      <p v-if="offboarding" class="hint">Desligamento em andamento, com data efetiva {{ fmtDate(offboarding.effectiveOn) }}. Acompanhe em Pessoas → Desligamento.</p>
      </div>

      <h3 class="drawer-title">Cargos e setores</h3>
      <ol class="timeline">
        <li v-for="entry in assignments" :key="entry.id"><i></i><div><strong>{{ entry.sector }} · {{ store.state.positions.find(position => position.id === entry.positionId)?.name ?? 'Sem cargo' }}</strong><span>{{ fmtDate(entry.validFrom) }}<template v-if="entry.validTo"> a {{ fmtDate(entry.validTo) }}</template><template v-else> · vigente</template> · {{ entry.actor }}</span></div></li>
      </ol>
      <p v-if="!assignments.length" class="empty-note">Sem vigência registrada. O setor atual continua no cadastro.</p>
      <div class="form-grid">
        <div class="field"><label>Novo setor</label><select v-model="assignmentForm.sector"><option value="">—</option><option v-for="entry in store.state.sectors" :key="entry.id">{{ entry.name }}</option></select></div>
        <div class="field"><label>Novo cargo</label><select v-model="assignmentForm.positionId"><option value="">Sem cargo</option><option v-for="entry in positionsOf(assignmentForm.sector)" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
        <div class="field"><label>Vigência a partir de</label><input v-model="assignmentForm.validFrom" type="date" /></div>
      </div>
      <button class="button secondary small" @click="registerAssignment">Registrar vigência</button>
      <div v-for="list in movementTasks" :key="list.id" class="list-row static">
        <div><strong>Revisão após a mudança</strong><span>{{ list.items.map(item => `${item.label}: ${item.status}`).join(' · ') }}</span></div>
      </div>
      <p class="hint">A mudança não concede acesso. As tarefas são só de revisão.</p>

      <h3 class="drawer-title">Avaliações individuais</h3>
      <ol class="timeline">
        <li v-for="entry in reviews" :key="entry.id"><i></i><div><strong>{{ entry.scoreLabel }} · escala {{ entry.scale }}</strong><span>{{ entry.period }} · {{ entry.origin }} · {{ entry.actor }} · {{ fmtDateTime(entry.at) }}</span></div></li>
      </ol>
      <p v-if="reviews.length > 1 && !comparable" class="hint">Estas notas usam escalas diferentes e não são comparadas.</p>
      <p v-if="!reviews.length" class="empty-note">Nenhuma avaliação registrada.</p>
      <div class="form-grid">
        <div class="field"><label>Nota</label><input v-model="reviewForm.scoreLabel" placeholder="4 ou B" /></div>
        <div class="field"><label>Escala</label><input v-model="reviewForm.scale" placeholder="0 a 5" /></div>
        <div class="field"><label>Período</label><input v-model="reviewForm.period" placeholder="2026" /></div>
        <div class="field"><label>Origem</label><input v-model="reviewForm.origin" placeholder="Gestor direto" /></div>
      </div>
      <button class="button secondary small" @click="registerReview">Registrar avaliação</button>

      <div data-tour="person-access">
      <h3 class="drawer-title">Acessos pelo papel {{ person.role }}</h3>
      <div v-for="entry in access" :key="entry.area" class="access-row"><b>{{ entry.area }}</b><span v-for="module in entry.modules" :key="module" class="chip">{{ module }}</span></div>
      <p v-if="!access.length" class="empty-note">Sem módulos. Operadores usam apenas o tablet.</p>
      <p class="hint">As permissões por papel são ajustadas em Cadastros → Gestão de acesso.</p>
      </div>

      <div data-tour="person-team">
      <template v-if="managed.length">
        <h3 class="drawer-title">Equipe ({{ managed.map(entry => entry.name).join(', ') }})</h3>
        <button v-for="member in team" :key="member.id" class="list-row" @click="ui.closeRecord(); router.push(`/pessoas/pessoa/${member.id}`)">
          <div><strong>{{ member.name }}</strong><span>{{ member.role }} · {{ member.shift }}</span></div><StatusBadge :value="member.active === false ? 'Inativo' : 'Ativo'" />
        </button>
      </template>

      <h3 class="drawer-title">Pendências do papel</h3>
      <div v-for="task in tasks.slice(0, 6)" :key="task.id" class="list-row static"><div><strong>{{ task.title }}</strong><span>{{ task.detail }}</span></div></div>
      <p v-if="!tasks.length" class="empty-note">Nenhuma pendência.</p>
      </div>

      <h3 class="drawer-title">Atividade recente no sistema</h3>
      <ol class="timeline">
        <li v-for="event in activity" :key="event.id"><i></i><div><strong>{{ event.text }}</strong><span>{{ fmtDateTime(event.at) }} · {{ event.module }}</span></div></li>
      </ol>
      <p v-if="!activity.length" class="empty-note">Sem registros recentes.</p>
      <RecordTimeline :ref-id="person.id" />
    </div>
  </template>
  <p v-else class="empty-note">Pessoa não encontrada.</p>
</template>
