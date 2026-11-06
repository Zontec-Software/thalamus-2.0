<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import CrumbBack from '../../components/CrumbBack.vue'
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
const readingRows = computed(() => {
  const evidence = new Set(briefing.value?.evidence ?? [])
  const gaps = new Set(briefing.value?.gaps ?? [])
  return (job.value?.requirements ?? []).map(label => ({
    label,
    state: !briefing.value ? 'pending' as const : evidence.has(label) ? 'ok' as const : gaps.has(label) ? 'gap' as const : 'pending' as const,
    question: briefing.value?.questions.find(entry => entry.includes(label)),
  }))
})
const readingStatus = computed(() => {
  const current = briefing.value
  const total = current?.criteria.length ?? job.value?.requirements.length ?? 0
  if (!current) return { title: 'Sem leitura', detail: 'Compare o currículo com a vaga' }
  if (!total) return { title: 'Sem requisitos', detail: 'A vaga não lista o que comparar' }
  const found = current.evidence.length
  if (current.gaps.length === 1) return { title: `${found} de ${total}`, detail: `Falta ${current.gaps[0]}` }
  if (current.gaps.length) return { title: `${found} de ${total}`, detail: `${current.gaps.length} requisitos não aparecem no texto` }
  return { title: `${found} de ${total}`, detail: 'Os requisitos aparecem no texto' }
})
const interviewStatus = computed(() => {
  const pending = interviews.value.filter(entry => !entry.confirmed).length
  if (!interviews.value.length) return { title: 'Nenhuma', detail: 'Nada marcado' }
  if (pending) return { title: String(interviews.value.length), detail: pending === 1 ? '1 sem confirmação' : `${pending} sem confirmação` }
  return { title: String(interviews.value.length), detail: 'Todas confirmadas' }
})

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
    <CrumbBack :fallback="job ? `/pessoas/admissao/${job.id}` : '/pessoas/admissao'" title="Voltar para a vaga" />
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
        <button type="button" class="kpi link" :class="{ active: tab === 'leitura' }" @click="openTab('leitura')"><span>Leitura do currículo</span><strong>{{ readingStatus.title }}</strong><small>{{ readingStatus.detail }}</small></button>
        <button type="button" class="kpi link" :class="{ active: tab === 'entrevista' }" @click="openTab('entrevista')"><span>Entrevistas</span><strong>{{ interviewStatus.title }}</strong><small>{{ interviewStatus.detail }}</small></button>
        <button type="button" class="kpi link" :class="{ active: tab === 'checklist' }" @click="openTab('checklist')"><span>Pendências</span><strong>{{ pendingItems }}</strong><small>{{ pendingItems ? 'Obrigatórios ainda por concluir' : 'Nada em aberto' }}</small></button>
        <button v-if="canHire" type="button" class="kpi link" :class="{ active: tab === 'efetivacao' }" @click="openTab('efetivacao')"><span>Efetivação</span><strong>{{ hireReady ? 'Pronta' : 'Em curso' }}</strong><small>{{ application.stage === 'Selecionado' ? 'Pode efetivar' : 'Mude a etapa para Selecionado' }}</small></button>
      </div>
    </article>

    <article class="card">
      <div class="tabs">
        <button type="button" :class="{ active: tab === 'leitura' }" @click="openTab('leitura')">Leitura</button>
        <button type="button" :class="{ active: tab === 'entrevista' }" @click="openTab('entrevista')">Entrevista<b v-if="interviews.length">{{ interviews.length }}</b></button>
        <button type="button" :class="{ active: tab === 'checklist' }" @click="openTab('checklist')">Checklist</button>
        <button v-if="canHire" type="button" :class="{ active: tab === 'efetivacao' }" @click="openTab('efetivacao')">Efetivação</button>
      </div>

      <div v-if="tab === 'leitura'" class="admit-stack">
        <section class="admit-block">
          <header>
            <div>
              <h3>Currículo</h3>
              <p>{{ candidate.resumeName ?? 'Sem arquivo' }}. O texto é de demonstração: o arquivo não é guardado e a leitura não chama um modelo externo.</p>
            </div>
          </header>
          <blockquote class="admit-quote">{{ candidate.resumeText || 'Sem texto de currículo.' }}</blockquote>
        </section>

        <section class="admit-block">
          <header>
            <div>
              <h3>O que a vaga pede</h3>
              <p v-if="!briefing">Cada requisito fica numa linha depois da leitura. A leitura não contrata, não elimina e não dá nota.</p>
              <p v-else-if="!readingRows.length">Esta vaga não lista requisitos, então não há o que comparar.</p>
              <p v-else>{{ readingStatus.detail }}. A decisão de seguir é de uma pessoa.</p>
            </div>
            <button class="button secondary small" @click="store.prepareBriefing(application.id)">{{ briefing ? 'Atualizar leitura' : 'Preparar leitura' }}</button>
          </header>
          <ul v-if="readingRows.length" class="admit-reqs">
            <li v-for="row in readingRows" :key="row.label" :class="row.state">
              <span class="mark">{{ row.state === 'ok' ? 'No texto' : row.state === 'gap' ? 'Não aparece' : 'A comparar' }}</span>
              <strong>{{ row.label }}</strong>
              <p v-if="row.state === 'gap' && row.question">{{ row.question }}</p>
            </li>
          </ul>
          <p v-else class="empty-note">Nenhum requisito nesta vaga.</p>
        </section>

        <section v-if="briefing" class="admit-block">
          <header><div><h3>Decisão sobre a leitura</h3><p>Registrar isto não muda a etapa da candidatura.</p></div></header>
          <div v-if="briefing.humanDecision" class="admit-decision">
            <strong>{{ briefing.humanDecision === 'Seguir' ? 'Leitura aceita' : 'Leitura descartada' }}</strong>
            <p>{{ briefing.humanNote }}</p>
            <small>{{ briefing.decidedBy }} · {{ fmtDateTime(briefing.decidedAt ?? briefing.at) }}</small>
          </div>
          <div v-else class="admit-decision">
            <div class="field"><label>O que você viu</label><textarea v-model="reviewNote" rows="2" placeholder="Obrigatório. Diga por que a leitura serve ou não."></textarea></div>
            <div class="drawer-actions">
              <button class="button small" :disabled="!reviewNote.trim()" @click="store.reviewBriefing(briefing.id, 'Seguir', reviewNote)">Esta leitura serve</button>
              <button class="button secondary small" :disabled="!reviewNote.trim()" @click="store.reviewBriefing(briefing.id, 'Não seguir', reviewNote)">Esta leitura não serve</button>
            </div>
          </div>
        </section>

        <section class="admit-block">
          <header><div><h3>O que já aconteceu</h3></div></header>
          <ol class="timeline">
            <li v-for="(entry, index) in application.history" :key="index"><i></i><div><strong>{{ entry.text }}</strong><span>{{ entry.actor }} · {{ fmtDateTime(entry.at) }}</span></div></li>
          </ol>
        </section>
      </div>

      <div v-else-if="tab === 'entrevista'" class="admit-stack">
        <section class="admit-block">
          <header><div><h3>Entrevistas</h3><p>A confirmação é só o registro daqui. Nenhum convite sai para o calendário.</p></div></header>
          <div v-for="entry in interviews" :key="entry.id" class="list-row static">
            <div>
              <strong>{{ fmtDateTime(entry.at) }} · {{ entry.place }}</strong>
              <span>Com {{ entry.interviewerIds.map(personName).join(', ') }} · {{ entry.confirmed ? 'Presença confirmada' : 'Presença em aberto' }}</span>
            </div>
            <button class="button secondary small" @click="store.setInterviewConfirmation(entry.id, !entry.confirmed)">{{ entry.confirmed ? 'Tirar confirmação' : 'Confirmar presença' }}</button>
          </div>
          <p v-if="!interviews.length" class="empty-note">Nenhuma entrevista registrada.</p>
        </section>
        <section class="admit-block">
          <header><div><h3>Marcar outra</h3></div></header>
          <div class="form-grid">
            <div class="field"><label>Data e hora</label><input v-model="interviewForm.at" type="datetime-local" /></div>
            <div class="field"><label>Local</label><input v-model="interviewForm.place" placeholder="Sala ou link" /></div>
            <div class="field"><label>Quem entrevista</label><select v-model="interviewForm.interviewerId"><option value="">Escolha uma pessoa</option><option v-for="entry in people" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
          </div>
          <button class="button secondary small" :disabled="!interviewForm.at || !interviewForm.place.trim() || !interviewForm.interviewerId" @click="schedule">Agendar</button>
        </section>
        <section class="admit-block">
          <header><div><h3>O que a entrevista mostrou</h3></div></header>
          <div v-for="entry in reviews" :key="entry.id" class="list-row static">
            <div><strong>{{ entry.origin }}</strong><span>{{ entry.notes || 'Sem observação' }}</span><span>{{ entry.actor }} · {{ fmtDateTime(entry.at) }}</span></div>
          </div>
          <p v-if="!reviews.length" class="empty-note">Nenhum resultado registrado.</p>
          <div class="form-grid">
            <div class="field"><label>Origem</label><input v-model="resultForm.origin" /></div>
            <div class="field"><label>Observação</label><input v-model="resultForm.notes" placeholder="O que ficou decidido nesta conversa" /></div>
          </div>
          <button class="button secondary small" :disabled="!resultForm.notes.trim()" @click="store.recordSelectionResult(application.id, resultForm)">Registrar resultado</button>
        </section>
      </div>

      <div v-else-if="tab === 'checklist'">
        <table v-if="applicationChecklist" class="dense">
          <thead><tr><th>Item</th><th>Responsável</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            <tr v-for="item in applicationChecklist.items" :key="item.id">
              <td>{{ item.label }}</td>
              <td>{{ item.owner }}</td>
              <td><StatusBadge :value="isChecklistLate(item) ? 'Atrasado' : item.status" /></td>
              <td><button v-if="item.status !== 'Concluído'" class="button secondary small" @click="conclude(applicationChecklist.id, item.id)">Concluir</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty-note">Esta candidatura não tem checklist.</p>
      </div>

      <div v-else class="admit-stack">
        <section class="admit-block">
          <header><div><h3>Antes de efetivar</h3><p>Conclua o que é obrigatório. O acesso é criado na efetivação.</p></div></header>
          <div v-for="item in hireChecklist?.items ?? []" :key="item.id" class="list-row static">
            <div><strong>{{ item.label }}</strong><span>{{ item.owner }}</span></div>
            <StatusBadge :value="item.status" />
            <button v-if="item.kind !== 'acesso' && item.status !== 'Concluído' && hireChecklist" class="button secondary small" @click="conclude(hireChecklist.id, item.id)">Concluir</button>
          </div>
        </section>
        <section class="admit-block">
          <header><div><h3>Como a pessoa entra</h3></div></header>
        <div class="form-grid">
          <div class="field"><label>Perfil</label><select v-model="hireForm.profileId"><option v-for="entry in hireProfiles" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small>O mesmo catálogo da Gestão de acesso.</small></div>
          <div class="field"><label>Turno</label><select v-model="hireForm.shift"><option>Manhã</option><option>Tarde</option><option>Administrativo</option></select></div>
          <div class="field"><label>Posição</label><select v-model="hireForm.positionId"><option value="">Sem posição por enquanto</option><option v-for="entry in store.state.positions.filter(item => item.status === 'Ativo' && item.tenantId === (job?.tenantId ?? application?.tenantId))" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small>A pessoa ocupa esta vaga. O cargo é o da vaga, definido no organograma.</small></div>
        </div>
        <p v-if="sameEmail" class="hint">O e-mail já é de {{ sameEmail.name }}. A efetivação une os cadastros e não cria outra conta Google.</p>
        <template v-else>
          <div class="field"><label class="check-line"><input v-model="hireForm.google" type="checkbox" /> Criar conta Google</label><input v-if="hireForm.google" v-model="hireForm.googleEmail" @input="hireForm.touched = true" /></div>
          <p class="hint">O e-mail sugerido é do domínio desta empresa. A senha não volta para o Thalamus.</p>
        </template>
        <button class="button" :disabled="!hireReady || application.stage !== 'Selecionado'" @click="hire">Efetivar</button>
        </section>
      </div>
    </article>
  </template>
</template>
