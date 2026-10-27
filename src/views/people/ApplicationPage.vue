<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import PersonPhoto from './PersonPhoto.vue'
import { suggestDirectoryEmail } from '../../domain/directory'
import { isChecklistLate } from '../../domain/people'
import { useErpStore } from '../../stores/erp'
import type { ApplicationStage, User } from '../../types/domain'
import { fmtDateTime } from '../../utils/format'

type Tab = 'leitura' | 'entrevista' | 'checklist' | 'efetivacao'
const STAGES: Exclude<ApplicationStage, 'Efetivado'>[] = ['Triagem', 'Entrevista', 'Selecionado', 'Encerrado']

const store = useErpStore()
const route = useRoute()
const router = useRouter()

const application = computed(() => store.state.applications.find(entry => entry.id === route.params.id && entry.jobId === route.params.jobId))
const job = computed(() => store.state.jobOpenings.find(entry => entry.id === application.value?.jobId))
const candidate = computed(() => store.state.candidates.find(entry => entry.id === application.value?.candidateId))
const briefing = computed(() => store.state.candidateBriefings.find(entry => entry.applicationId === application.value?.id))
const interviews = computed(() => store.state.interviews.filter(entry => entry.applicationId === application.value?.id))
const reviews = computed(() => store.state.selectionReviews.filter(entry => entry.applicationId === application.value?.id))
const applicationChecklist = computed(() => store.state.peopleChecklists.find(entry => entry.process === 'admissao' && entry.refId === application.value?.id))
const hireChecklist = computed(() => store.state.peopleChecklists.find(entry => entry.process === 'efetivacao' && entry.refId === application.value?.id))
const canHire = computed(() => application.value?.stage === 'Selecionado' || !!hireChecklist.value)
const tab = computed(() => {
  const asked = String(route.query.aba || 'leitura')
  if (asked === 'efetivacao' && !canHire.value) return 'leitura'
  return (['leitura', 'entrevista', 'checklist', 'efetivacao'].includes(asked) ? asked : 'leitura') as Tab
})
const people = computed(() => store.state.users.filter(entry => !entry.platformMaster))
const sameEmail = computed(() => {
  const email = candidate.value?.email?.toLowerCase()
  return email ? store.state.users.find(entry => entry.email?.toLowerCase() === email) : undefined
})
const hireReady = computed(() => hireChecklist.value?.items.every(item => !item.required || item.status === 'Concluído') ?? false)
const pendingItems = computed(() => applicationChecklist.value?.items.filter(item => item.required && item.status !== 'Concluído').length ?? 0)

const interviewForm = reactive({ at: '', place: '', interviewerId: '' })
const resultForm = reactive({ origin: 'Entrevista presencial', notes: '' })
const reviewNote = ref('')
const hireForm = reactive({ profileId: '', shift: 'Manhã' as User['shift'], positionId: '', google: true, googleEmail: '', touched: false })

function personName(id?: string) {
  return store.state.users.find(entry => entry.id === id)?.name ?? '—'
}
function sectorName(id?: string) {
  return store.state.sectors.find(entry => entry.id === id)?.name ?? 'Sem setor'
}
function openTab(aba: Tab) {
  router.replace({ query: { aba } })
}
function schedule() {
  if (!application.value || !interviewForm.interviewerId) return
  const created = store.scheduleInterview(application.value.id, { at: interviewForm.at, place: interviewForm.place, interviewerIds: [interviewForm.interviewerId] })
  if (created) {
    interviewForm.at = ''
    interviewForm.place = ''
  }
}
function conclude(checklistId: string, itemId: string) {
  store.setPeopleChecklistItem(checklistId, itemId, { status: 'Concluído' })
}
const hireProfiles = computed(() => store.state.accessProfiles.filter(entry => entry.tenantId === (job.value?.tenantId ?? application.value?.tenantId)))
watch(hireProfiles, list => {
  if (!list.some(entry => entry.id === hireForm.profileId)) hireForm.profileId = list.find(entry => entry.simulatedRole === 'Operador')?.id ?? list[0]?.id ?? ''
}, { immediate: true })
function hire() {
  if (!application.value || !job.value) return
  const created = store.hireCandidate(application.value.id, {
    profileId: hireForm.profileId,
    sector: sectorName(job.value.sectorId),
    shift: hireForm.shift,
    positionId: hireForm.positionId || undefined,
    linkUserId: sameEmail.value?.id,
  })
  if (created && created !== true && hireForm.google && hireForm.googleEmail && !sameEmail.value && created.personId) store.provisionDirectoryAccount(created.personId, hireForm.googleEmail)
  if (created && created !== true) router.push(`/pessoas/pessoa/${created.personId ?? created.id}?aba=acesso`)
}
watch(candidate, current => {
  if (!current || hireForm.touched) return
  const tenantId = job.value?.tenantId ?? application.value?.tenantId
  if (!tenantId || !store.state.workspaceConnections.some(entry => entry.tenantId === tenantId)) {
    hireForm.google = false
    return
  }
  hireForm.googleEmail = suggestDirectoryEmail(store.state, tenantId, current.name)
}, { immediate: true })
function setStage(stage: Exclude<ApplicationStage, 'Efetivado'>) {
  if (application.value) store.setApplicationStage(application.value.id, stage)
}

function rememberView() {
  const id = application.value?.candidateId
  if (id) store.noteCandidateView(id)
}
onMounted(rememberView)
watch(() => route.params.id, rememberView)
</script>

<template>
  <nav class="crumb-bar" aria-label="Caminho">
    <RouterLink :to="job ? `/pessoas/admissao/${job.id}` : '/pessoas/admissao'" class="crumb-back" title="Voltar para a vaga"><ArrowLeft :size="16" /></RouterLink>
    <RouterLink to="/pessoas/admissao" class="crumb">Admissão</RouterLink>
    <ChevronRight :size="14" class="sep" />
    <RouterLink v-if="job" :to="`/pessoas/admissao/${job.id}`" class="crumb">{{ job.title }}</RouterLink>
    <ChevronRight v-if="job" :size="14" class="sep" />
    <span class="crumb here">{{ candidate?.name ?? 'Candidatura não encontrada' }}</span>
  </nav>

  <div v-if="!application || !candidate || !job" class="card empty-note">Candidatura não encontrada. <RouterLink to="/pessoas/admissao">Voltar à lista</RouterLink></div>

  <template v-else>
    <article class="card item-hero">
      <div class="item-head">
        <PersonPhoto :name="candidate.name" />
        <div class="item-head-main">
          <span class="eyebrow">{{ job.title }}</span>
          <h2>{{ candidate.name }}</h2>
          <div class="meta">
            <span>{{ candidate.email ?? 'Sem e-mail' }}</span>
            <span>{{ candidate.phone ?? 'Sem telefone' }}</span>
            <span>{{ candidate.resumeName ?? 'Sem arquivo informado' }}</span>
          </div>
        </div>
        <div class="actions">
          <select class="filter" :value="application.stage === 'Efetivado' ? 'Efetivado' : application.stage" :disabled="application.stage === 'Efetivado'" @change="setStage(($event.target as HTMLSelectElement).value as Exclude<ApplicationStage, 'Efetivado'>)">
            <option v-if="application.stage === 'Efetivado'">Efetivado</option>
            <option v-for="stage in STAGES" :key="stage">{{ stage }}</option>
          </select>
        </div>
      </div>
      <div class="kpi-strip">
        <button type="button" class="kpi link" @click="openTab('leitura')"><span>Leitura</span><strong>{{ briefing?.suggested ? 'Sugerido' : briefing ? 'Com lacuna' : 'Sem leitura' }}</strong><small>Não contrata nem rejeita</small></button>
        <button type="button" class="kpi link" @click="openTab('entrevista')"><span>Entrevistas</span><strong>{{ interviews.length }}</strong><small>{{ interviews.filter(entry => !entry.confirmed).length }} sem confirmação</small></button>
        <button type="button" class="kpi link" @click="openTab('checklist')"><span>Pendências</span><strong>{{ pendingItems }}</strong><small>Itens obrigatórios em aberto</small></button>
        <button v-if="canHire" type="button" class="kpi link" @click="openTab('efetivacao')"><span>Efetivação</span><strong>{{ hireReady ? 'Pronta' : 'Em curso' }}</strong><small>Exige etapa Selecionado</small></button>
      </div>
    </article>

    <article class="card">
      <div class="tabs">
        <button type="button" :class="{ active: tab === 'leitura' }" @click="openTab('leitura')">Leitura</button>
        <button type="button" :class="{ active: tab === 'entrevista' }" @click="openTab('entrevista')">Entrevista<b v-if="interviews.length">{{ interviews.length }}</b></button>
        <button type="button" :class="{ active: tab === 'checklist' }" @click="openTab('checklist')">Checklist</button>
        <button v-if="canHire" type="button" :class="{ active: tab === 'efetivacao' }" @click="openTab('efetivacao')">Efetivação</button>
      </div>

      <div v-if="tab === 'leitura'">
        <p class="assistant-note">{{ candidate.resumeText || 'Sem texto de currículo.' }}</p>
        <p class="hint">Versão {{ briefing?.version ?? 'pessoas-ia-demo-1' }}. A leitura não rejeita, não ranqueia e não contrata.</p>
        <button class="button secondary small" @click="store.prepareBriefing(application.id)">Preparar leitura</button>
        <template v-if="briefing">
          <p>{{ briefing.summary }}</p>
          <p><b>Critérios:</b> {{ briefing.criteria.join(' · ') || 'A vaga não lista requisitos.' }}</p>
          <p><b>Evidências:</b> {{ briefing.evidence.join(' · ') || 'Nenhuma.' }}</p>
          <p><b>Lacunas:</b> {{ briefing.gaps.join(' · ') || 'Nenhuma.' }}</p>
          <p v-if="briefing.questions.length"><b>Perguntas:</b> {{ briefing.questions.join(' ') }}</p>
          <p v-if="briefing.humanDecision">Revisão de {{ briefing.decidedBy }}: {{ briefing.humanDecision }}. {{ briefing.humanNote }}</p>
          <template v-else>
            <div class="form-grid"><div class="field"><label>Observação da revisão humana</label><input v-model="reviewNote" /></div></div>
            <div class="drawer-actions">
              <button class="button secondary small" @click="store.reviewBriefing(briefing.id, 'Seguir', reviewNote)">Seguir a sugestão</button>
              <button class="button secondary small" @click="store.reviewBriefing(briefing.id, 'Não seguir', reviewNote)">Não seguir</button>
            </div>
          </template>
        </template>
        <h3 class="partner-h">Histórico</h3>
        <ol class="timeline">
          <li v-for="(entry, index) in application.history" :key="index"><i></i><div><strong>{{ entry.text }}</strong><span>{{ entry.actor }} · {{ fmtDateTime(entry.at) }}</span></div></li>
        </ol>
      </div>

      <div v-else-if="tab === 'entrevista'">
        <div v-for="entry in interviews" :key="entry.id" class="list-row static">
          <div><strong>{{ fmtDateTime(entry.at) }} · {{ entry.place }}</strong><span>{{ entry.interviewerIds.map(personName).join(', ') }}</span></div>
          <button class="button secondary small" @click="store.setInterviewConfirmation(entry.id, !entry.confirmed)">{{ entry.confirmed ? 'Confirmada' : 'Sem confirmação' }}</button>
        </div>
        <p v-if="!interviews.length" class="empty-note">Nenhuma entrevista registrada.</p>
        <div class="form-grid">
          <div class="field"><label>Data e hora</label><input v-model="interviewForm.at" type="datetime-local" /></div>
          <div class="field"><label>Local</label><input v-model="interviewForm.place" /></div>
          <div class="field"><label>Entrevistador</label><select v-model="interviewForm.interviewerId"><option value="">—</option><option v-for="entry in people" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
        </div>
        <button class="button secondary small" @click="schedule">Agendar</button>
        <p class="hint">Calendário externo não está ligado. O registro fica só aqui.</p>
        <h3 class="partner-h">Resultado da etapa</h3>
        <div v-for="entry in reviews" :key="entry.id" class="list-row static"><div><strong>{{ entry.origin }}</strong><span>{{ entry.notes }} · {{ entry.actor }} · {{ fmtDateTime(entry.at) }}</span></div></div>
        <div class="form-grid">
          <div class="field"><label>Origem</label><input v-model="resultForm.origin" /></div>
          <div class="field"><label>Observações</label><input v-model="resultForm.notes" /></div>
        </div>
        <button class="button secondary small" @click="store.recordSelectionResult(application.id, resultForm)">Registrar resultado</button>
      </div>

      <div v-else-if="tab === 'checklist'">
        <div v-for="item in applicationChecklist?.items ?? []" :key="item.id" class="list-row static">
          <div><strong>{{ item.label }}</strong><span>{{ item.owner }}</span></div>
          <StatusBadge :value="isChecklistLate(item) ? 'Atrasado' : item.status" />
          <button v-if="item.status !== 'Concluído' && applicationChecklist" class="button secondary small" @click="conclude(applicationChecklist.id, item.id)">Concluir</button>
        </div>
        <p v-if="!applicationChecklist" class="empty-note">Esta candidatura não tem checklist.</p>
      </div>

      <div v-else>
        <div v-for="item in hireChecklist?.items ?? []" :key="item.id" class="list-row static">
          <div><strong>{{ item.label }}</strong><span>{{ item.owner }}</span></div>
          <button v-if="item.kind !== 'acesso' && item.status !== 'Concluído' && hireChecklist" class="button secondary small" @click="conclude(hireChecklist.id, item.id)">Concluir</button>
          <StatusBadge :value="item.status" />
        </div>
        <div class="form-grid">
          <div class="field"><label>Perfil</label><select v-model="hireForm.profileId"><option v-for="entry in hireProfiles" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small>O mesmo catálogo da Gestão de acesso.</small></div>
          <div class="field"><label>Turno</label><select v-model="hireForm.shift"><option>Manhã</option><option>Tarde</option><option>Administrativo</option></select></div>
          <div class="field"><label>Cargo</label><select v-model="hireForm.positionId"><option value="">Sem cargo</option><option v-for="entry in store.state.positions" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
        </div>
        <p v-if="sameEmail" class="hint">O e-mail já é de {{ sameEmail.name }}. A efetivação une os cadastros e não cria outra conta Google.</p>
        <template v-else>
          <div class="field"><label class="check-line"><input v-model="hireForm.google" type="checkbox" /> Criar conta Google</label><input v-if="hireForm.google" v-model="hireForm.googleEmail" @input="hireForm.touched = true" /></div>
          <p class="hint">O e-mail sugerido é do domínio desta empresa. A senha não volta para o Thalamus.</p>
        </template>
        <button class="button" :disabled="!hireReady || application.stage !== 'Selecionado'" @click="hire">Efetivar</button>
      </div>
    </article>
  </template>
</template>
