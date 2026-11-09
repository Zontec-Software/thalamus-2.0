<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ChevronDown, ChevronUp, Search } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { fmtCurrency } from '../../utils/format'

const store = useErpStore()
const ui = useUiStore()
const query = ref('')
const open = ref(false)
const editing = ref('')
const saving = ref(false)
const levelsOpen = ref(false)
const levelBusy = ref('')
const draft = ref('')
const form = reactive({ name: '', level: '', cbo: '', mission: '', requirements: '', salary: '' })

const canPay = computed(() => ui.role === 'Administrador' || ui.role === 'Gestor' || ui.role === 'Financeiro')
const levels = computed(() => store.state.jobLevels.filter(entry => entry.tenantId === ui.activeTenantId).sort((left, right) => left.rank - right.rank || left.name.localeCompare(right.name, 'pt-BR')))
function levelText(name: string) {
  const index = levels.value.findIndex(entry => entry.name === name)
  return index < 0 ? name : `${index + 1} · ${name}`
}
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
function close() {
  if (saving.value) return
  open.value = false
}
function closeLevels() {
  if (levelBusy.value) return
  levelsOpen.value = false
}
function chooseLevel(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value === '__catalog__') {
    select.value = form.level
    levelsOpen.value = true
    return
  }
  form.level = select.value
}
function addLevel() {
  if (levelBusy.value || !draft.value.trim()) return
  levelBusy.value = 'novo'
  try {
    const created = store.createJobLevel(ui.activeTenantId, draft.value)
    if (created && created !== true) {
      form.level = created.name
      draft.value = ''
    }
  } finally {
    levelBusy.value = ''
  }
}
function renameLevel(id: string, previous: string, name: string) {
  const next = name.trim()
  if (levelBusy.value || !next || next === previous) return
  levelBusy.value = id
  try {
    const saved = store.renameJobLevel(id, next)
    if (saved && saved !== true && form.level.toLocaleLowerCase('pt-BR') === previous.toLocaleLowerCase('pt-BR')) form.level = saved.name
  } finally {
    levelBusy.value = ''
  }
}
function moveLevel(id: string, direction: 'up' | 'down') {
  if (levelBusy.value) return
  levelBusy.value = id
  try {
    store.moveJobLevel(id, direction)
  } finally {
    levelBusy.value = ''
  }
}
function dropLevel(id: string, name: string) {
  if (levelBusy.value) return
  levelBusy.value = id
  try {
    const removed = store.removeJobLevel(id)
    if (removed && form.level.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR')) form.level = ''
  } finally {
    levelBusy.value = ''
  }
}
function save() {
  if (saving.value) return
  saving.value = true
  const payload = {
    name: form.name,
    level: form.level,
    cbo: form.cbo,
    mission: form.mission,
    requirements: form.requirements.split(',').map(entry => entry.trim()).filter(Boolean),
    ...(canPay.value ? { salary: salaryOf() } : {}),
  }
  try {
    const done = editing.value ? store.updateJob(editing.value, payload) : store.createJob(ui.activeTenantId, payload)
    if (done) open.value = false
  } finally {
    saving.value = false
  }
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
    <div class="partner-filters">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Nome, CBO ou missão" /></label>
    </div>
    <table class="dense">
      <thead><tr><th>Cargo</th><th>Nível</th><th>CBO</th><th v-if="canPay">Salário</th><th>Usado em</th></tr></thead>
      <tbody>
        <tr v-for="entry in jobs" :key="entry.id" class="clickable" @click="edit(entry.id)">
          <td><span class="cell-main">{{ entry.name }}</span></td>
          <td>{{ entry.level ? levelText(entry.level) : '—' }}</td>
          <td>{{ entry.cbo || '—' }}</td>
          <td v-if="canPay">{{ entry.salary != null ? fmtCurrency(entry.salary) : '—' }}</td>
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

  <BaseModal :open="open" :title="editing ? 'Cargo' : 'Novo cargo'" width="760px" @close="close">
    <div class="form-grid">
      <div class="field"><label>Nome</label><input v-model="form.name" placeholder="Ex.: Ferramenteiro" :disabled="saving" /></div>
      <div class="field">
        <label>Nível</label>
        <select :value="form.level" :disabled="saving" @change="chooseLevel">
          <option v-if="form.level && !levels.some(entry => entry.name === form.level)" :value="form.level">{{ form.level }}</option>
          <option v-for="(level, index) in levels" :key="level.id" :value="level.name">{{ index + 1 }} · {{ level.name }}</option>
          <option value="__catalog__">Criar e editar níveis</option>
        </select>
      </div>
      <div class="field"><label>CBO</label><input v-model="form.cbo" placeholder="Opcional" :disabled="saving" /></div>
      <div v-if="canPay" class="field"><label>Salário</label><input v-model="form.salary" type="number" min="0" placeholder="Opcional" :disabled="saving" /></div>
      <div class="field wide"><label>Missão</label><textarea v-model="form.mission" rows="4" placeholder="Para que o cargo existe" :disabled="saving" /></div>
      <div class="field wide"><label>Requisitos</label><textarea v-model="form.requirements" rows="4" placeholder="Separe por vírgula" :disabled="saving" /></div>
    </div>
    <p v-if="saving" class="hint">{{ editing ? 'Salvando o cargo…' : 'Criando o cargo…' }}</p>
    <template #footer>
      <button class="button secondary" type="button" :disabled="saving" @click="close">Cancelar</button>
      <button class="button" type="button" :disabled="saving || !form.level" @click="save">{{ saving ? (editing ? 'Salvando…' : 'Criando…') : (editing ? 'Salvar cargo' : 'Criar cargo') }}</button>
    </template>
  </BaseModal>

  <BaseModal :open="levelsOpen" title="Níveis" subtitle="O número é o nível." width="520px" @close="closeLevels">
    <div class="level-list">
      <div v-for="(level, index) in levels" :key="level.id" class="level-line">
        <span class="level-num">{{ index + 1 }}</span>
        <input :value="level.name" :disabled="!!levelBusy" @change="renameLevel(level.id, level.name, ($event.target as HTMLInputElement).value)" />
        <button class="icon-plain" type="button" title="Subir" :disabled="!!levelBusy || index === 0" @click="moveLevel(level.id, 'up')"><ChevronUp :size="16" /></button>
        <button class="icon-plain" type="button" title="Descer" :disabled="!!levelBusy || index === levels.length - 1" @click="moveLevel(level.id, 'down')"><ChevronDown :size="16" /></button>
        <button class="button ghost small" type="button" :disabled="!!levelBusy" @click="dropLevel(level.id, level.name)">Remover</button>
      </div>
      <p v-if="!levels.length" class="empty-note">Nenhum nível nesta empresa.</p>
      <div class="level-line">
        <span class="level-num">{{ levels.length + 1 }}</span>
        <input v-model="draft" placeholder="Ex.: Pleno" :disabled="!!levelBusy" @keyup.enter="addLevel" />
        <button class="button secondary small" type="button" :disabled="!!levelBusy || !draft.trim()" @click="addLevel">{{ levelBusy === 'novo' ? 'Incluindo…' : 'Incluir' }}</button>
      </div>
    </div>
    <p v-if="levelBusy && levelBusy !== 'novo'" class="hint">Salvando o nível…</p>
    <template #footer>
      <button class="button" type="button" :disabled="!!levelBusy" @click="closeLevels">Fechar</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.level-list { display: flex; flex-direction: column; gap: 8px; }
.level-line { display: flex; align-items: center; gap: 8px; }
.level-line input { flex: 1; min-width: 0; width: auto; border: 1px solid var(--border); border-radius: 8px; padding: 9px 11px; background: #fbfcfb; font-size: 13px; }
.level-num { width: 22px; flex: none; text-align: center; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; color: #52625b; }
.level-line .icon-plain, .level-line .button { flex: none; }
</style>
