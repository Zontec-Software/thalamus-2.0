<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { costCenterAmounts, sectorCostCenter } from '../../domain/budget'
import { fmtCurrency } from '../../utils/format'
import type { EntityStatus, Sector } from '../../types/domain'

const props = defineProps<{ year: string }>()
const emit = defineEmits<{ openCategory: [id: string] }>()
const store = useErpStore()
const ui = useUiStore()
const canEdit = computed(() => store.can('orcamentos.gerir'))
const form = reactive({ code: '', name: '', responsibleUserId: 'u14' })
const companyUsers = computed(() => {
  const assigned = new Set(store.state.userProfileAssignments.filter(entry => entry.tenantId === ui.activeTenantId).map(entry => entry.userId))
  const seen = new Set<string>()
  return store.state.users
    .filter(user => user.active !== false && !user.platformMaster && (assigned.size === 0 || assigned.has(user.id)) && !seen.has(user.id) && seen.add(user.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
})
const userName = (id?: string) => store.state.users.find(entry => entry.id === id)?.name ?? '—'

const centers = computed(() => store.state.costCenters
  .filter(entry => entry.tenantId === ui.activeTenantId)
  .sort((a, b) => a.code.localeCompare(b.code)))
const activeCenters = computed(() => centers.value.filter(entry => entry.status === 'Ativo'))
const sectorNames = (code: string) => store.state.sectors.filter(entry => sectorCostCenter(entry, ui.activeTenantId) === code).map(entry => entry.name)
const sectorCode = (sector: Sector) => sectorCostCenter(sector, ui.activeTenantId)

/** Contas em que o centro tem fatia no ano. Sai da distribuição gravada na categoria. */
const slices = computed(() => {
  const map = new Map<string, { categoryId: string; label: string; amount: number }[]>()
  for (const budget of store.state.budgets.filter(entry => entry.tenantId === ui.activeTenantId && entry.period === props.year && entry.costCenterSplit)) {
    const category = store.state.budgetCategories.find(entry => entry.id === budget.categoryId)
    if (!category) continue
    for (const line of costCenterAmounts(budget.amount, budget.costCenterSplit)) {
      const list = map.get(line.costCenterId) ?? []
      list.push({ categoryId: category.id, label: `${category.code} ${category.name}`, amount: line.amount })
      map.set(line.costCenterId, list)
    }
  }
  return map
})
const sliceTotal = (id: string) => (slices.value.get(id) ?? []).reduce((sum, entry) => sum + entry.amount, 0)

function optionsFor(current: string) {
  if (activeCenters.value.some(entry => entry.code === current)) return activeCenters.value
  const kept = centers.value.find(entry => entry.code === current)
  return kept ? [kept, ...activeCenters.value] : activeCenters.value
}
function create() {
  if (store.createCostCenter(form.code, form.name, form.responsibleUserId)) Object.assign(form, { code: '', name: '' })
}
function save(id: string, name: string, status: EntityStatus, responsibleUserId: string) {
  store.updateCostCenter(id, name, status, responsibleUserId)
}
</script>

<template>
  <article class="card flush" data-tour="budget-centers">
    <div class="orc-card-head">
      <div>
        <h2>Centros desta empresa</h2>
        <p>A conta do responsável recebe os alertas. Quando há posição, ela responde pelo gasto e não muda o perfil. As fatias ficam na aba Categorias.</p>
      </div>
    </div>
    <table class="dense fit-table">
      <thead><tr><th>Código</th><th>Nome</th><th>Responsável</th><th>Contas com fatia em {{ year }}</th><th class="num">Orçado no centro</th><th>Padrão de</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="center in centers" :key="center.id">
          <td class="code">{{ center.code }}</td>
          <td>
            <input v-if="canEdit" class="filter" :value="center.name" @change="save(center.id, ($event.target as HTMLInputElement).value, center.status, center.responsibleUserId)" />
            <template v-else>{{ center.name }}</template>
          </td>
          <td>
            <select v-if="canEdit" class="filter" :value="center.responsibleUserId" @change="save(center.id, center.name, center.status, ($event.target as HTMLSelectElement).value)">
              <option v-for="user in companyUsers" :key="user.id" :value="user.id">{{ user.name }}</option>
            </select>
            <template v-else>{{ userName(center.responsibleUserId) }}</template>
          </td>
          <td>
            <span v-if="!slices.get(center.id)?.length" class="cell-sub">Nenhuma</span>
            <span v-else class="slice-links">
              <button v-for="slice in slices.get(center.id)" :key="slice.categoryId" type="button" class="link" @click="emit('openCategory', slice.categoryId)">{{ slice.label }}</button>
            </span>
          </td>
          <td class="num">{{ sliceTotal(center.id) ? fmtCurrency(sliceTotal(center.id)) : '—' }}</td>
          <td>{{ sectorNames(center.code).join(', ') || '—' }}</td>
          <td>
            <select v-if="canEdit" class="filter" :value="center.status" @change="save(center.id, center.name, ($event.target as HTMLSelectElement).value as EntityStatus, center.responsibleUserId)">
              <option>Ativo</option>
              <option>Inativo</option>
            </select>
            <template v-else>{{ center.status }}</template>
          </td>
        </tr>
      </tbody>
    </table>
    <fieldset v-if="canEdit" class="layer"><legend>Novo centro de custo</legend>
      <div class="filter-row">
        <input v-model="form.code" class="filter" placeholder="Código, ex. CC-410" />
        <input v-model="form.name" class="filter grow" placeholder="Nome" />
        <select v-model="form.responsibleUserId" class="filter"><option v-for="user in companyUsers" :key="user.id" :value="user.id">{{ user.name }}</option></select>
        <button class="button small" @click="create"><Plus :size="14" /> Criar</button>
      </div>
    </fieldset>
  </article>

  <article class="card flush" data-tour="budget-sector">
    <div class="orc-card-head">
      <div>
        <h2>Centro padrão de cada setor</h2>
        <p>Demanda, compra, projeto e assistência nascem com o centro padrão do setor de quem pede. Cada empresa escolhe o seu.</p>
      </div>
    </div>
    <table class="dense">
      <thead><tr><th>Setor</th><th>Centro padrão</th></tr></thead>
      <tbody>
        <tr v-for="sector in store.state.sectors" :key="sector.id">
          <td>{{ sector.name }}</td>
          <td>
            <select v-if="canEdit" class="filter" :value="sectorCode(sector)" @change="store.setSectorDefaultCostCenter(sector.id, ($event.target as HTMLSelectElement).value)">
              <option v-if="!sectorCode(sector)" value="" disabled>Escolher centro</option>
              <option v-for="center in optionsFor(sectorCode(sector))" :key="center.id" :value="center.code">{{ center.code }} · {{ center.name }}</option>
            </select>
            <template v-else>{{ sectorCode(sector) || '—' }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </article>
</template>
