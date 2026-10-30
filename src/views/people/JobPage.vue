<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight } from 'lucide-vue-next'
import CrumbBack from '../../components/CrumbBack.vue'
import StatusBadge from '../../components/StatusBadge.vue'
import { matchingCandidate, peopleBoard } from '../../domain/people'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { JobOpeningStatus, PeopleChecklistKind } from '../../types/domain'
import { fmtDate } from '../../utils/format'

type Tab = 'vaga' | 'candidatos'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const isNew = computed(() => route.path.endsWith('/nova'))
const tenantId = computed(() => ui.activeTenantId)
const job = computed(() => store.state.jobOpenings.find(entry => entry.id === route.params.id && entry.tenantId === tenantId.value))
const tab = computed(() => (route.query.aba === 'candidatos' ? 'candidatos' : 'vaga') as Tab)
const people = computed(() => store.state.users.filter(entry => !entry.platformMaster))
const applications = computed(() => store.state.applications.filter(entry => entry.jobId === job.value?.id))
const checklist = computed(() => store.state.peopleChecklists.find(entry => entry.process === 'admissao' && entry.refId === job.value?.id))
const suggested = computed(() => applications.value.filter(entry => {
  const latest = store.state.candidateBriefings.find(briefing => briefing.applicationId === entry.id)
  return latest?.suggested && latest.humanDecision !== 'Não seguir' && entry.stage !== 'Efetivado' && entry.stage !== 'Encerrado'
}))
const pending = computed(() => applications.value.filter(entry => entry.stage !== 'Efetivado' && entry.stage !== 'Encerrado').length)

const form = reactive({ title: '', sectorId: '', requesterId: '', ownerId: '', description: '', requirements: '', openedOn: today(), targetOn: '' })
const candidateForm = reactive({ name: '', email: '', phone: '', resumeName: '', resumeText: '' })
const duplicate = reactive({ id: '', name: '' })
const extraItem = reactive({ label: '', owner: 'Admissão', kind: 'geral' as PeopleChecklistKind, required: true })

function personName(id?: string) {
  return store.state.users.find(entry => entry.id === id)?.name ?? '—'
}
function sectorName(id?: string) {
  return store.state.sectors.find(entry => entry.id === id)?.name ?? 'Sem setor'
}
function lines(value: string) {
  return value.split('\n').map(entry => entry.trim()).filter(Boolean)
}
function openTab(aba: Tab) {
  router.replace({ query: { aba } })
}
function createJob() {
  const created = store.createJobOpening(tenantId.value, {
    title: form.title,
    sectorId: form.sectorId || undefined,
    requesterId: form.requesterId || undefined,
    ownerId: form.ownerId || undefined,
    description: form.description,
    requirements: lines(form.requirements),
    openedOn: form.openedOn,
    targetOn: form.targetOn || undefined,
  })
  if (created && created !== true) router.push(`/pessoas/admissao/${created.id}`)
}
function saveStatus(status: JobOpeningStatus) {
  if (job.value) store.setJobStatus(job.value.id, status)
}
function submitCandidate(mode: 'check' | 'force' | 'link') {
  if (!job.value) return
  if (mode === 'check') {
    const found = matchingCandidate(store.state, tenantId.value, candidateForm)
    if (found) {
      duplicate.id = found.id
      duplicate.name = found.name
      return
    }
  }
  const created = store.registerCandidate(tenantId.value, {
    jobId: job.value.id,
    ...candidateForm,
    force: mode === 'force',
    existingCandidateId: mode === 'link' ? duplicate.id : undefined,
  })
  if (created && created !== true) {
    duplicate.id = ''
    router.push(`/pessoas/admissao/${job.value.id}/candidatura/${created.application.id}`)
  }
}
function addItem() {
  if (!checklist.value) return
  const created = store.addPeopleChecklistItem(checklist.value.id, extraItem)
  if (created) extraItem.label = ''
}
const board = computed(() => peopleBoard(store.state, tenantId.value))
watch(() => route.path, path => {
  if (!path.endsWith('/nova')) return
  Object.assign(form, { title: '', sectorId: '', requesterId: '', ownerId: '', description: '', requirements: '', openedOn: today(), targetOn: '' })
  duplicate.id = ''
  duplicate.name = ''
})
</script>

<template>
  <nav class="crumb-bar" aria-label="Caminho">
    <CrumbBack fallback="/pessoas/admissao" title="Voltar para Admissão" />
    <RouterLink to="/pessoas/admissao" class="crumb">Admissão</RouterLink>
    <ChevronRight :size="14" class="sep" />
    <span class="crumb here">{{ isNew ? 'Nova vaga' : job?.title ?? 'Vaga não encontrada' }}</span>
  </nav>

  <article v-if="isNew" class="card">
    <h2>Nova vaga</h2>
    <p class="cell-sub" style="margin-bottom:14px">A vaga nasce nesta empresa. O checklist que a acompanha é um modelo de demonstração.</p>
    <div class="form-grid">
      <div class="field"><label>Título do anúncio</label><input v-model="form.title" /><small>Na efetivação, a pessoa ocupa uma posição do organograma. O cargo é o dessa posição.</small></div>
      <div class="field"><label>Setor</label><select v-model="form.sectorId"><option value="">Quando houver</option><option v-for="entry in store.state.sectors" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Gestor requisitante</label><select v-model="form.requesterId"><option value="">—</option><option v-for="entry in people" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Responsável</label><select v-model="form.ownerId"><option value="">—</option><option v-for="entry in people" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Abertura</label><input v-model="form.openedOn" type="date" /></div>
      <div class="field"><label>Data alvo</label><input v-model="form.targetOn" type="date" /></div>
      <div class="field"><label>Descrição ou justificativa</label><textarea v-model="form.description" rows="2"></textarea></div>
      <div class="field"><label>Requisitos, um por linha</label><textarea v-model="form.requirements" rows="3"></textarea></div>
    </div>
    <div class="drawer-actions">
      <button class="button" @click="createJob">Abrir vaga</button>
      <RouterLink to="/pessoas/admissao" class="button secondary">Cancelar</RouterLink>
    </div>
  </article>

  <div v-else-if="!job" class="card empty-note">Vaga não encontrada nesta empresa. <RouterLink to="/pessoas/admissao">Voltar à lista</RouterLink></div>

  <template v-else>
    <article class="card item-hero">
      <div class="item-head">
        <div class="item-head-main">
          <span class="eyebrow">{{ sectorName(job.sectorId) }} · requisitante {{ personName(job.requesterId) }}</span>
          <h2>{{ job.title }}</h2>
          <div class="meta">
            <span>Aberta em {{ fmtDate(job.openedOn) }}</span>
            <span v-if="job.targetOn">Alvo {{ fmtDate(job.targetOn) }}</span>
            <span>Responsável {{ personName(job.ownerId) }}</span>
          </div>
        </div>
        <div class="actions">
          <select class="filter" :value="job.status" @change="saveStatus(($event.target as HTMLSelectElement).value as JobOpeningStatus)">
            <option>Aberta</option><option>Pausada</option><option>Encerrada</option>
          </select>
        </div>
      </div>
      <div class="kpi-strip">
        <button type="button" class="kpi link" @click="openTab('candidatos')"><span>Candidaturas</span><strong>{{ applications.length }}</strong><small>{{ pending }} em aberto</small></button>
        <button type="button" class="kpi link" @click="openTab('candidatos')"><span>Para revisão</span><strong>{{ suggested.length }}</strong><small>A leitura não decide</small></button>
        <button type="button" class="kpi link" @click="openTab('vaga')"><span>Requisitos</span><strong>{{ job.requirements.length }}</strong><small>Critérios da leitura</small></button>
        <button type="button" class="kpi"><span>Vagas abertas</span><strong>{{ board.openJobs }}</strong><small>Nesta empresa</small></button>
      </div>
    </article>

    <article class="card">
      <div class="tabs">
        <button type="button" :class="{ active: tab === 'vaga' }" @click="openTab('vaga')">Vaga</button>
        <button type="button" :class="{ active: tab === 'candidatos' }" @click="openTab('candidatos')">Candidatos<b v-if="applications.length">{{ applications.length }}</b></button>
      </div>

      <div v-if="tab === 'vaga'">
        <p>{{ job.description || 'Sem descrição.' }}</p>
        <h3 class="partner-h">Requisitos</h3>
        <p v-if="job.requirements.length">{{ job.requirements.join(' · ') }}</p>
        <p v-else class="empty-note">Nenhum requisito informado.</p>
        <h3 class="partner-h">Sugeridos para revisão humana</h3>
        <p v-if="!suggested.length" class="empty-note">Nenhuma sugestão em aberto. A leitura não ordena nem elimina candidatos.</p>
        <button v-for="entry in suggested" :key="entry.id" class="list-row" @click="router.push(`/pessoas/admissao/${job.id}/candidatura/${entry.id}`)">
          <div><strong>{{ store.state.candidates.find(person => person.id === entry.candidateId)?.name }}</strong><span>Critérios da vaga com evidência no texto. A decisão é humana.</span></div>
          <StatusBadge value="Sugerido" />
        </button>
        <h3 class="partner-h">Checklist da vaga</h3>
        <p class="hint">Modelo de demonstração. Item novo vale para candidaturas que entrarem depois.</p>
        <div v-for="item in checklist?.items ?? []" :key="item.id" class="list-row static">
          <div><strong>{{ item.label }}</strong><span>{{ item.owner }} · {{ item.required ? 'obrigatório neste modelo' : 'opcional' }}</span></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Novo item</label><input v-model="extraItem.label" /></div>
          <div class="field"><label>Responsável</label><input v-model="extraItem.owner" /></div>
        </div>
        <button class="button secondary small" @click="addItem">Incluir no modelo</button>
      </div>

      <div v-else>
        <table class="dense">
          <thead><tr><th>Candidato</th><th>Etapa</th><th>Pendências</th></tr></thead>
          <tbody>
            <tr v-for="entry in applications" :key="entry.id" class="clickable" @click="router.push(`/pessoas/admissao/${job.id}/candidatura/${entry.id}`)">
              <td><span class="cell-main">{{ store.state.candidates.find(person => person.id === entry.candidateId)?.name }}</span></td>
              <td><StatusBadge :value="entry.stage" /></td>
              <td>{{ store.state.peopleChecklists.find(list => list.refId === entry.id)?.items.filter(item => item.required && item.status !== 'Concluído').length ?? 0 }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!applications.length" class="empty-note">Nenhum candidato nesta vaga.</p>
        <h3 class="partner-h">Registrar candidato</h3>
        <div class="form-grid">
          <div class="field"><label>Nome</label><input v-model="candidateForm.name" /></div>
          <div class="field"><label>E-mail</label><input v-model="candidateForm.email" /></div>
          <div class="field"><label>Telefone</label><input v-model="candidateForm.phone" /></div>
          <div class="field"><label>Nome do arquivo</label><input v-model="candidateForm.resumeName" placeholder="Só o nome. O arquivo não é guardado." /></div>
          <div class="field"><label>Texto do currículo</label><textarea v-model="candidateForm.resumeText" rows="3" placeholder="Texto de demonstração para a leitura assistida."></textarea></div>
        </div>
        <div class="drawer-actions">
          <button class="button" @click="submitCandidate('check')">Registrar candidato</button>
          <template v-if="duplicate.id">
            <span class="hint">Possível duplicata: {{ duplicate.name }}.</span>
            <button class="button secondary" @click="submitCandidate('link')">Unir a este candidato</button>
            <button class="button secondary" @click="submitCandidate('force')">Manter outro cadastro</button>
          </template>
        </div>
      </div>
    </article>
  </template>
</template>
