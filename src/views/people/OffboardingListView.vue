<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import DirectoryAlert from './DirectoryAlert.vue'
import { isChecklistLate, peopleBoard } from '../../domain/people'
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
const processes = computed(() => store.state.offboardings.filter(entry => {
  if (entry.tenantId !== tenantId.value) return false
  if (status.value && entry.status !== status.value) return false
  const name = store.state.users.find(user => user.id === entry.userId)?.name ?? ''
  return !query.value || `${name} ${entry.reason}`.toLowerCase().includes(query.value.toLowerCase())
}))

function personName(id?: string) {
  return store.state.users.find(entry => entry.id === id)?.name ?? '—'
}
function late(id: string) {
  return store.state.peopleChecklists.find(entry => entry.process === 'desligamento' && entry.refId === id)?.items.filter(item => isChecklistLate(item)).length ?? 0
}
</script>

<template>
  <article class="card flush">
    <div class="section-head">
      <div>
        <h2>Desligamento</h2>
        <p>A saída desativa o acesso e guarda a execução. A conta Google suspende na data efetiva. Senha, PIN e segredo não entram no registro.</p>
      </div>
      <button class="button" @click="router.push('/pessoas/desligamento/novo')">Iniciar desligamento</button>
    </div>
    <DirectoryAlert />
    <div class="partner-filters">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Pessoa ou motivo" /></label>
      <button type="button" class="chip" :class="{ active: status === '' }" @click="status = ''">Todos</button>
      <button type="button" class="chip" :class="{ active: status === 'Em andamento' }" @click="status = 'Em andamento'">Em andamento <b>{{ board.offboardingOpen }}</b></button>
      <button type="button" class="chip" :class="{ active: status === 'Concluído' }" @click="status = 'Concluído'">Concluídos</button>
    </div>
    <section class="metrics" style="padding: 0 18px 4px">
      <article class="metric"><div class="metric-head">Em andamento</div><strong>{{ board.offboardingOpen }}</strong><small>Processos desta empresa</small></article>
      <article class="metric"><div class="metric-head">Itens atrasados</div><strong>{{ board.lateItems }}</strong><small>Pendentes depois da data efetiva</small></article>
      <article class="metric"><div class="metric-head">Ativos pendentes</div><strong>{{ board.assetsPending }}</strong><small>Devolução ainda aberta</small></article>
      <article class="metric"><div class="metric-head">Acessos com falha</div><strong>{{ board.accessFailed }}</strong><small>Execução registrada, sem senha</small></article>
    </section>
    <p class="hint" style="margin: 0 18px 10px">Diretório, horário de bloqueio e a lista de motivos ainda não foram definidos. Conta técnica, se houver, fica só com a referência do cofre.</p>
    <table class="dense">
      <thead><tr><th>Pessoa</th><th>Data efetiva</th><th>Motivo</th><th>Atrasos</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="entry in processes" :key="entry.id" class="clickable" @click="router.push(`/pessoas/desligamento/${entry.id}`)">
          <td><span class="cell-main">{{ personName(entry.userId) }}</span></td>
          <td>{{ fmtDate(entry.effectiveOn) }}</td>
          <td>{{ entry.reason }}</td>
          <td>{{ late(entry.id) || '—' }}</td>
          <td><StatusBadge :value="entry.status" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!processes.length" class="empty-note">Nenhum desligamento com esse filtro.</p>
  </article>
</template>
