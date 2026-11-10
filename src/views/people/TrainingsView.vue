<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CalendarClock, GraduationCap, Hourglass, Plus, Search } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import { TRAINING_KINDS, trainingExpiresSoon, trainingStatus } from '../../domain/training'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Training, TrainingKind, TrainingStatus } from '../../types/domain'
import { fmtDate } from '../../utils/format'

const store = useErpStore()
const ui = useUiStore()
const query = ref('')
const filter = ref<'' | TrainingStatus | 'A vencer'>('')
const creating = ref(false)
const completing = ref<Record<string, string>>({})
const form = reactive({ personId: '', name: '', kind: 'Segurança' as TrainingKind, completedOn: '', validUntil: '', evidence: '' })

const canManage = computed(() => store.can('modulo.treinamentos.gerir'))
const persons = computed(() => store.state.persons.filter(entry => entry.tenantId === ui.activeTenantId).sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR')))
const personName = (id: string) => store.state.persons.find(entry => entry.id === id)?.fullName ?? id
const all = computed(() => store.state.trainings.filter(entry => entry.tenantId === ui.activeTenantId))
const matches = (training: Training) => !filter.value || (filter.value === 'A vencer' ? trainingExpiresSoon(training) : trainingStatus(training) === filter.value)
const trainings = computed(() => all.value
  .filter(entry => matches(entry) && (!query.value || `${personName(entry.personId)} ${entry.name}`.toLowerCase().includes(query.value.toLowerCase())))
  .sort((a, b) => personName(a.personId).localeCompare(personName(b.personId), 'pt-BR')))
const count = (status: TrainingStatus) => all.value.filter(entry => trainingStatus(entry) === status).length

function save() {
  if (store.recordTraining({ ...form })) {
    creating.value = false
    Object.assign(form, { personId: '', name: '', completedOn: '', validUntil: '', evidence: '' })
  }
}
function complete(training: Training) {
  const completedOn = completing.value[training.id]
  if (completedOn && store.updateTraining(training.id, { completedOn, result: 'Aprovado' })) delete completing.value[training.id]
}
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Pessoa ou treinamento" /></label>
      <button class="chip" :class="{ active: !filter }" @click="filter = ''">Todos <b>{{ all.length }}</b></button>
      <button v-for="status in (['Válido', 'A vencer', 'Vencido', 'Pendente'] as const)" :key="status" class="chip" :class="{ active: filter === status }" @click="filter = status">{{ status }} <b>{{ status === 'A vencer' ? all.filter(entry => trainingExpiresSoon(entry)).length : count(status) }}</b></button>
    </div>
    <button v-if="canManage" data-tour="new-record" class="button" @click="creating = !creating"><Plus :size="15" /> Registrar treinamento</button>
  </div>
  <p class="hint">Registro e validade. Por enquanto não bloqueia operação: vencido e a vencer aparecem como alerta para o gestor.</p>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Válidos <GraduationCap :size="17" /></div><strong>{{ count('Válido') }}</strong><small>Com realização e aprovação</small></article>
    <article class="metric"><div class="metric-head">Vencem em 30 dias <CalendarClock :size="17" /></div><strong>{{ all.filter(entry => trainingExpiresSoon(entry)).length }}</strong><small>Programe a reciclagem</small></article>
    <article class="metric"><div class="metric-head">Vencidos <Hourglass :size="17" /></div><strong :class="{ 'risk-text': count('Vencido') }">{{ count('Vencido') }}</strong><small>Precisam de reciclagem</small></article>
    <article class="metric"><div class="metric-head">Pendentes <Hourglass :size="17" /></div><strong>{{ count('Pendente') }}</strong><small>Programados, sem realização</small></article>
  </section>

  <article v-if="creating" class="card">
    <div class="section-head"><div><h2>Registrar treinamento</h2><p>Sem data de realização, fica pendente.</p></div></div>
    <div class="form-grid">
      <div class="field"><label>Pessoa</label><select v-model="form.personId"><option v-for="person in persons" :key="person.id" :value="person.id">{{ person.fullName }}</option></select></div>
      <div class="field"><label>Treinamento</label><input v-model="form.name" placeholder="NR-12, operação da injetora…" /></div>
      <div class="field"><label>Tipo</label><select v-model="form.kind"><option v-for="kind in TRAINING_KINDS" :key="kind">{{ kind }}</option></select></div>
      <div class="field"><label>Certificado</label><input v-model="form.evidence" placeholder="Nome do arquivo" /><small>O arquivo real vai para o armazenamento do sistema oficial.</small></div>
      <div class="field"><label>Realizado em</label><input v-model="form.completedOn" type="date" /></div>
      <div class="field"><label>Válido até</label><input v-model="form.validUntil" type="date" /></div>
    </div>
    <div class="filter-row"><button class="button" @click="save">Registrar</button><button class="button secondary" @click="creating = false">Cancelar</button></div>
  </article>

  <article class="card flush" data-tour="record-list">
    <table>
      <thead><tr><th>Pessoa</th><th>Treinamento</th><th>Realizado</th><th>Validade</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="training in trainings" :key="training.id">
          <td><RouterLink class="cell-main" :to="`/pessoas/pessoa/${training.personId}`">{{ personName(training.personId) }}</RouterLink></td>
          <td><span class="cell-main">{{ training.name }}</span><span class="cell-sub">{{ training.kind }}{{ training.evidence ? ` · ${training.evidence}` : '' }}</span></td>
          <td>{{ training.completedOn ? fmtDate(training.completedOn) : '—' }}</td>
          <td :class="{ 'risk-text': trainingStatus(training) === 'Vencido' }">{{ training.validUntil ? fmtDate(training.validUntil) : 'Sem validade' }}</td>
          <td><StatusBadge :value="trainingExpiresSoon(training) ? 'A vencer' : trainingStatus(training)" :tone="trainingExpiresSoon(training) ? 'warning' : undefined" /></td>
          <td>
            <div v-if="canManage && trainingStatus(training) === 'Pendente'" class="filter-row">
              <input v-model="completing[training.id]" class="filter" type="date" title="Realizado em" />
              <button class="button small" :disabled="!completing[training.id]" @click="complete(training)">Concluir</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!trainings.length" class="empty-note">Nenhum treinamento neste filtro.</p>
  </article>
</template>
