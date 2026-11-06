<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Search } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import RoleVsPosition from './RoleVsPosition.vue'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { fmtCurrency } from '../../utils/format'

const store = useErpStore()
const ui = useUiStore()
const query = ref('')
const open = ref(false)
const editing = ref('')
const form = reactive({ name: '', level: '', cbo: '', mission: '', requirements: '', salary: '' })

const canPay = computed(() => ui.role === 'Administrador' || ui.role === 'Gestor' || ui.role === 'Financeiro')
const jobs = computed(() => store.state.jobs.filter(entry => entry.tenantId === ui.activeTenantId && (!query.value || `${entry.name} ${entry.cbo} ${entry.mission}`.toLowerCase().includes(query.value.toLowerCase()))))
const usage = (jobId: string) => store.state.positions.filter(entry => entry.jobId === jobId && entry.status === 'Ativo')

function blank() {
  Object.assign(form, { name: '', level: '', cbo: '', mission: '', requirements: '', salary: '' })
}
function start() {
  editing.value = ''
  blank()
  open.value = true
}
function edit(id: string) {
  const job = jobs.value.find(entry => entry.id === id)
  if (!job) return
  editing.value = id
  Object.assign(form, { name: job.name, level: job.level, cbo: job.cbo, mission: job.mission, requirements: job.requirements.join(', '), salary: job.salary != null ? String(job.salary) : '' })
  open.value = true
}
function salaryOf() {
  if (!canPay.value || !form.salary.trim()) return undefined
  return Number(form.salary)
}
function save() {
  const payload = {
    name: form.name,
    level: form.level,
    cbo: form.cbo,
    mission: form.mission,
    requirements: form.requirements.split(',').map(entry => entry.trim()).filter(Boolean),
    ...(canPay.value ? { salary: salaryOf() } : {}),
  }
  const done = editing.value ? store.updateJob(editing.value, payload) : store.createJob(ui.activeTenantId, payload)
  if (done) open.value = false
}
</script>

<template>
  <article class="card flush">
    <div class="section-head">
      <div>
        <h2>Cargos</h2>
        <p>O catálogo do trabalho. O salário fica neste cargo: quem ocupa uma posição dele recebe o mesmo valor.</p>
      </div>
      <button class="button" @click="start">Novo cargo</button>
    </div>
    <RoleVsPosition />
    <div class="partner-filters">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Nome, CBO ou missão" /></label>
    </div>
    <table class="dense">
      <thead><tr><th>Cargo</th><th>Nível</th><th>CBO</th><th v-if="canPay">Salário</th><th>Requisitos</th><th>Usado em</th></tr></thead>
      <tbody>
        <tr v-for="entry in jobs" :key="entry.id" class="clickable" @click="edit(entry.id)">
          <td><span class="cell-main">{{ entry.name }}</span><span class="cell-sub">{{ entry.mission }}</span></td>
          <td>{{ entry.level || '—' }}</td>
          <td>{{ entry.cbo || '—' }}</td>
          <td v-if="canPay">{{ entry.salary != null ? fmtCurrency(entry.salary) : '—' }}</td>
          <td>{{ entry.requirements.join(', ') || '—' }}</td>
          <td>
            <span v-if="!usage(entry.id).length" class="cell-sub">Nenhuma posição</span>
            <span v-else class="cell-main">{{ usage(entry.id).length }} {{ usage(entry.id).length === 1 ? 'posição' : 'posições' }}</span>
            <span class="cell-sub">{{ [...new Set(usage(entry.id).map(position => store.state.sectors.find(sector => sector.id === position.sectorId)?.name))].join(', ') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!jobs.length" class="empty-note">Nenhum cargo com esse filtro.</p>
  </article>

  <BaseModal :open="open" :title="editing ? 'Cargo' : 'Novo cargo'" subtitle="O salário vale para toda posição que usa este cargo. A vaga nasce no organograma." @close="open = false">
    <div class="form-grid">
      <div class="field"><label>Nome</label><input v-model="form.name" placeholder="Ex.: Ferramenteiro" /></div>
      <div class="field"><label>Nível</label><input v-model="form.level" placeholder="Ex.: Pleno" /></div>
      <div class="field"><label>CBO</label><input v-model="form.cbo" placeholder="Opcional" /></div>
      <div v-if="canPay" class="field"><label>Salário</label><input v-model="form.salary" type="number" min="0" placeholder="Opcional" /><small>Quem ocupa o cargo recebe este valor. RH, gestor e financeiro veem o campo.</small></div>
      <div class="field"><label>Missão</label><input v-model="form.mission" placeholder="Para que o cargo existe" /></div>
      <div class="field"><label>Requisitos</label><input v-model="form.requirements" placeholder="Separe por vírgula" /></div>
    </div>
    <template #footer>
      <button class="button secondary" @click="open = false">Cancelar</button>
      <button class="button" @click="save">{{ editing ? 'Salvar cargo' : 'Criar cargo' }}</button>
    </template>
  </BaseModal>
</template>
