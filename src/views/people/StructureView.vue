<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import RoleVsPosition from './RoleVsPosition.vue'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { occupantsAt } from '../../domain/organization'

const store = useErpStore()
const ui = useUiStore()
const selectedId = ref('')
const dialog = ref<'' | 'setor' | 'posicao' | 'editar'>('')
const editingId = ref('')
const sectorForm = reactive({ name: '' })
const positionForm = reactive({ jobId: '', sectorId: '', parentPositionId: '', headcount: 1 })

const sectors = computed(() => store.state.sectors.filter(entry => entry.tenantId === ui.activeTenantId))
const jobs = computed(() => store.state.jobs.filter(entry => entry.tenantId === ui.activeTenantId && entry.status === 'Ativo'))
const positions = computed(() => store.state.positions.filter(entry => entry.tenantId === ui.activeTenantId && entry.status === 'Ativo'))
const tree = computed(() => {
  const rows: { sector: (typeof sectors.value)[number]; depth: number }[] = []
  const walk = (parentId: string | undefined, depth: number) => {
    sectors.value.filter(entry => (entry.parentId ?? undefined) === parentId).forEach(sector => {
      rows.push({ sector, depth })
      walk(sector.id, depth + 1)
    })
  }
  walk(undefined, 0)
  return rows
})
const selected = computed(() => sectors.value.find(entry => entry.id === selectedId.value) ?? tree.value[0]?.sector)
const positionsOf = (sectorId?: string) => positions.value.filter(entry => entry.sectorId === sectorId)
const occupants = (positionId: string) => {
  const ids = occupantsAt(store.state, positionId).map(entry => entry.userId)
  return store.state.users.filter(entry => ids.includes(entry.id))
}
const leaderName = (sectorId: string) => {
  const sector = sectors.value.find(entry => entry.id === sectorId)
  if (!sector?.managerPositionId) return ''
  return occupants(sector.managerPositionId).map(entry => entry.name).join(', ') || 'Vaga livre'
}
const peopleIn = (sectorId: string) => positionsOf(sectorId).reduce((sum, entry) => sum + occupantsAt(store.state, entry.id).length, 0)
const selectedPositions = computed(() => positionsOf(selected.value?.id))
const descendants = computed(() => {
  const out = new Set<string>()
  const walk = (id: string) => sectors.value.filter(entry => entry.parentId === id).forEach(entry => { out.add(entry.id); walk(entry.id) })
  if (selected.value) walk(selected.value.id)
  return out
})

function openSector() {
  sectorForm.name = ''
  dialog.value = 'setor'
}
function openPosition() {
  Object.assign(positionForm, { jobId: '', sectorId: selected.value?.id ?? '', parentPositionId: '', headcount: 1 })
  dialog.value = 'posicao'
}
function blockedParents(id: string) {
  const blocked = new Set<string>([id])
  const walk = (current: string) => {
    positions.value.filter(entry => entry.parentPositionId === current).forEach(entry => {
      if (blocked.has(entry.id)) return
      blocked.add(entry.id)
      walk(entry.id)
    })
  }
  walk(id)
  return blocked
}
function openEdit(id: string) {
  const position = positions.value.find(entry => entry.id === id)
  if (!position) return
  editingId.value = id
  Object.assign(positionForm, { jobId: position.jobId, sectorId: position.sectorId, parentPositionId: position.parentPositionId ?? '', headcount: position.headcount })
  dialog.value = 'editar'
}
function addSector() {
  if (!selected.value) return
  const created = store.createSector(ui.activeTenantId, { name: sectorForm.name, parentId: selected.value.id })
  if (created && created !== true) {
    dialog.value = ''
    selectedId.value = created.id
  }
}
function addPosition() {
  if (!selected.value) return
  const created = store.createPosition(ui.activeTenantId, { sectorId: selected.value.id, jobId: positionForm.jobId, parentPositionId: positionForm.parentPositionId || undefined, headcount: Number(positionForm.headcount) })
  if (created) dialog.value = ''
}
function savePosition() {
  const saved = store.updatePosition(ui.activeTenantId, editingId.value, { sectorId: positionForm.sectorId, jobId: positionForm.jobId, parentPositionId: positionForm.parentPositionId || undefined, headcount: Number(positionForm.headcount) })
  if (saved) {
    dialog.value = ''
    if (positionForm.sectorId) selectedId.value = positionForm.sectorId
  }
}
function removePosition() {
  const removed = store.removePosition(ui.activeTenantId, editingId.value)
  if (removed) dialog.value = ''
}
</script>

<template>
  <article class="card flush">
    <div class="section-head">
      <div>
        <h2>Organograma</h2>
        <p>As vagas da empresa. Cada uma já tem um cargo, mesmo vazia. A pessoa ocupa a vaga.</p>
      </div>
    </div>
    <RoleVsPosition />
    <div class="grid-2 org-layout" data-tour="org-chart">
      <nav class="tree org-tree" aria-label="Setores">
        <div v-for="row in tree" :key="row.sector.id" class="tree-row" :class="{ active: selected?.id === row.sector.id }" :style="{ paddingLeft: `${8 + row.depth * 18}px` }">
          <button type="button" class="name" @click="selectedId = row.sector.id">
            {{ row.sector.name }}
            <small class="cell-sub" :class="{ 'warn-text': !row.sector.managerPositionId }">{{ leaderName(row.sector.id) || 'Sem liderança' }}</small>
          </button>
          <span class="count">{{ peopleIn(row.sector.id) }}</span>
        </div>
        <p v-if="!tree.length" class="empty-note">Nenhum setor nesta empresa.</p>
      </nav>

      <section v-if="selected" class="org-detail">
        <header class="partner-h-row">
          <div>
            <h3 class="section-title" style="margin:0">{{ selected.name }}</h3>
            <span class="cell-sub">{{ peopleIn(selected.id) }} {{ peopleIn(selected.id) === 1 ? 'pessoa' : 'pessoas' }}</span>
          </div>
          <button type="button" class="button secondary small" @click="openSector"><Plus :size="14" /> Setor abaixo</button>
        </header>

        <div class="form-grid">
          <div class="field"><label>Fica abaixo de</label>
            <select :value="selected.parentId ?? ''" @change="store.placeSector(selected!.id, ($event.target as HTMLSelectElement).value || undefined)">
              <option value="">Topo da empresa</option>
              <option v-for="entry in sectors.filter(item => item.id !== selected!.id && !descendants.has(item.id))" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
            </select>
          </div>
          <div class="field"><label>Quem lidera</label>
            <select :value="selected.managerPositionId ?? ''" @change="store.setSectorLeadership(selected!.id, ($event.target as HTMLSelectElement).value)">
              <option value="" disabled>{{ selectedPositions.length ? 'Escolha uma posição' : 'Crie uma posição primeiro' }}</option>
              <option v-for="entry in selectedPositions" :key="entry.id" :value="entry.id">{{ entry.name }} · {{ occupants(entry.id).map(user => user.name).join(', ') || 'vaga livre' }}</option>
            </select>
          </div>
        </div>

        <div class="partner-h-row">
          <h3 class="partner-h">Posições</h3>
          <button type="button" class="button secondary small" @click="openPosition"><Plus :size="14" /> Posição</button>
        </div>
        <table class="dense">
          <thead><tr><th>Posição</th><th>Responde a</th><th>Ocupação</th><th>Quem ocupa</th><th></th></tr></thead>
          <tbody>
            <tr v-for="entry in selectedPositions" :key="entry.id">
              <td><span class="cell-main">{{ entry.name }}</span><span class="cell-sub">Cargo: {{ jobs.find(job => job.id === entry.jobId)?.name ?? entry.name }}</span><span v-if="selected.managerPositionId === entry.id" class="cell-sub">Lidera o setor</span></td>
              <td>{{ positions.find(item => item.id === entry.parentPositionId)?.name ?? '—' }}</td>
              <td :class="{ 'warn-text': occupantsAt(store.state, entry.id).length < entry.headcount }">{{ occupantsAt(store.state, entry.id).length }} de {{ entry.headcount }}</td>
              <td>
                <RouterLink v-for="user in occupants(entry.id)" :key="user.id" :to="`/pessoas/pessoa/${user.personId ?? user.id}`" class="chip">{{ user.name }}</RouterLink>
                <span v-if="!occupants(entry.id).length" class="cell-sub">Vaga livre</span>
              </td>
              <td class="row-actions"><button type="button" class="button ghost small" @click="openEdit(entry.id)">Editar</button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="!selectedPositions.length" class="empty-note">Nenhuma posição neste setor.</p>
        <p class="hint">Editar muda o cargo desta vaga, o setor, a chefia e os lugares. A pessoa entra pela aba Vínculo da ficha. A posição não concede perfil de acesso.</p>
      </section>
    </div>
  </article>

  <BaseModal :open="dialog === 'setor'" title="Novo setor" :subtitle="selected ? `Abaixo de ${selected.name}` : ''" @close="dialog = ''">
    <div class="field"><label>Nome</label><input v-model="sectorForm.name" placeholder="Ex.: Ferramentaria" @keyup.enter="addSector" /></div>
    <template #footer>
      <button class="button secondary" @click="dialog = ''">Cancelar</button>
      <button class="button" @click="addSector">Criar setor</button>
    </template>
  </BaseModal>

  <BaseModal :open="dialog === 'posicao'" title="Nova posição" :subtitle="selected ? `Uma vaga em ${selected.name}` : ''" width="640px" @close="dialog = ''">
    <RoleVsPosition compact />
    <div class="form-grid">
      <div class="field"><label>Cargo da vaga</label><select v-model="positionForm.jobId"><option value="" disabled>Escolha o cargo</option><option v-for="entry in jobs" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small>A vaga já nasce com esse cargo e pode ficar livre. A pessoa entra depois. Falta o cargo? <RouterLink to="/pessoas/cargos">Cadastre em Cargos</RouterLink>.</small></div>
      <div class="field"><label>Responde a</label><select v-model="positionForm.parentPositionId"><option value="">Ninguém neste nível</option><option v-for="entry in positions" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Vagas</label><input v-model.number="positionForm.headcount" type="number" min="1" /></div>
    </div>
    <template #footer>
      <button class="button secondary" @click="dialog = ''">Cancelar</button>
      <button class="button" :disabled="!positionForm.jobId" @click="addPosition">Criar posição</button>
    </template>
  </BaseModal>

  <BaseModal :open="dialog === 'editar'" title="Editar posição" :subtitle="positions.find(entry => entry.id === editingId)?.name" width="640px" @close="dialog = ''">
    <p class="hint">Este cargo fica na vaga, livre ou ocupada. A pessoa ocupa a vaga pela ficha. Trocar a pessoa não troca o cargo.</p>
    <div class="form-grid">
      <div class="field"><label>Cargo da vaga</label><select v-model="positionForm.jobId"><option v-for="entry in jobs" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Setor</label><select v-model="positionForm.sectorId"><option v-for="entry in sectors" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Responde a</label><select v-model="positionForm.parentPositionId"><option value="">Ninguém neste nível</option><option v-for="entry in positions.filter(item => !blockedParents(editingId).has(item.id))" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Vagas</label><input v-model.number="positionForm.headcount" type="number" min="1" /></div>
    </div>
    <template #footer>
      <button class="button danger" style="margin-right: auto" @click="removePosition">Remover</button>
      <button class="button secondary" @click="dialog = ''">Cancelar</button>
      <button class="button" :disabled="!positionForm.jobId || !positionForm.sectorId" @click="savePosition">Salvar</button>
    </template>
  </BaseModal>
</template>
