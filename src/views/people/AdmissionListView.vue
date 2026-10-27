<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import { peopleBoard } from '../../domain/people'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { fmtDate } from '../../utils/format'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const query = ref('')
const status = ref('')

const tenantId = computed(() => ui.activeTenantId)
const board = computed(() => peopleBoard(store.state, tenantId.value))
const jobs = computed(() => store.state.jobOpenings.filter(entry => {
  if (entry.tenantId !== tenantId.value) return false
  if (status.value && entry.status !== status.value) return false
  const sector = store.state.sectors.find(item => item.id === entry.sectorId)?.name ?? ''
  return !query.value || `${entry.title} ${sector}`.toLowerCase().includes(query.value.toLowerCase())
}))

function sectorName(id?: string) {
  return store.state.sectors.find(entry => entry.id === id)?.name ?? 'Sem setor'
}
function personName(id?: string) {
  return store.state.users.find(entry => entry.id === id)?.name ?? '—'
}
function count(jobId: string) {
  return store.state.applications.filter(entry => entry.jobId === jobId && entry.stage !== 'Efetivado' && entry.stage !== 'Encerrado').length
}
</script>

<template>
  <article class="card flush">
    <div class="section-head">
      <div>
        <h2>Admissão</h2>
        <p>A vaga, os candidatos e a entrevista ficam na página da vaga. A leitura sugere; a pessoa decide.</p>
      </div>
      <button class="button" @click="router.push('/pessoas/admissao/nova')">Nova vaga</button>
    </div>
    <div class="partner-filters">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Cargo ou setor" /></label>
      <button type="button" class="chip" :class="{ active: status === '' }" @click="status = ''">Todas</button>
      <button type="button" class="chip" :class="{ active: status === 'Aberta' }" @click="status = 'Aberta'">Abertas <b>{{ board.openJobs }}</b></button>
      <button type="button" class="chip" :class="{ active: status === 'Pausada' }" @click="status = 'Pausada'">Pausadas</button>
      <button type="button" class="chip" :class="{ active: status === 'Encerrada' }" @click="status = 'Encerrada'">Encerradas</button>
    </div>
    <section class="metrics" style="padding: 0 18px 4px">
      <article class="metric"><div class="metric-head">Vagas abertas</div><strong>{{ board.openJobs }}</strong><small>Situação Aberta nesta empresa</small></article>
      <article class="metric"><div class="metric-head">Candidaturas em aberto</div><strong>{{ board.pendingApplications }}</strong><small>Fora de efetivado e encerrado</small></article>
      <article class="metric"><div class="metric-head">Entrevistas sem confirmação</div><strong>{{ board.unconfirmedInterviews }}</strong><small>Presenciais de hoje em diante</small></article>
      <article class="metric"><div class="metric-head">Efetivações incompletas</div><strong>{{ board.incompleteHires }}</strong><small>{{ board.suggested }} sugestão(ões) para revisão humana</small></article>
    </section>
    <p class="hint" style="margin: 0 18px 10px">O currículo é um texto de demonstração: o arquivo não é guardado e a leitura não acessa um modelo externo. A lista oficial de documentos e os papéis desta área ainda não foram definidos.</p>
    <table class="dense">
      <thead><tr><th>Vaga</th><th>Setor</th><th>Responsável</th><th>Abertura</th><th>Em aberto</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="entry in jobs" :key="entry.id" class="clickable" @click="router.push(`/pessoas/admissao/${entry.id}`)">
          <td><span class="cell-main">{{ entry.title }}</span><span class="cell-sub">{{ entry.requirements.join(' · ') || 'Sem requisitos' }}</span></td>
          <td>{{ sectorName(entry.sectorId) }}</td>
          <td>{{ personName(entry.ownerId) }}</td>
          <td>{{ fmtDate(entry.openedOn) }}<span v-if="entry.targetOn" class="cell-sub">Alvo {{ fmtDate(entry.targetOn) }}</span></td>
          <td>{{ count(entry.id) }}</td>
          <td><StatusBadge :value="entry.status" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!jobs.length" class="empty-note">Nenhuma vaga com esse filtro.</p>
  </article>
</template>
