<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import StatusBadge from '../../components/StatusBadge.vue'
import { catalogOf, ensureClassPath, toolingIssues } from '../../domain/catalog'
import { moldMinutesPerPiece, toolLife, toolUsers } from '../../domain/engineering'
import { TOOL_LIFE_ALERT } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { fmtNumber } from '../../utils/format'
import { LIFE_TONE } from './shared'

const store = useErpStore()
const router = useRouter()
const kind = ref('')
const tools = computed(() => store.state.items
  .filter(item => item.type === 'FE' && !catalogOf(item).deletedAt && (!kind.value || catalogOf(item).tooling?.kind === kind.value))
  .map(item => {
    const tooling = catalogOf(item).tooling
    return { item, tooling, life: toolLife(store.state, item), users: toolUsers(store.state, item.id), issues: toolingIssues(tooling) }
  })
  .sort((a, b) => b.life.used - a.life.used))
const blockedCavities = computed(() => tools.value.filter(row => row.tooling && row.tooling.activeCavities < row.tooling.cavities).length)
const nearEnd = computed(() => tools.value.filter(row => row.life.used >= TOOL_LIFE_ALERT).length)

function create() {
  const classId = store.state.itemClasses.find(entry => entry.name === 'Moldes de injeção')?.id ?? ensureClassPath(store.state, ['Ferramental', 'Moldes de injeção'])
  const created = store.createCatalogItem({ name: 'Novo molde', type: 'FE', unit: 'un', classId })
  if (created && typeof created === 'object') router.push(`/produtos/item/${created.id}?aba=ferramental`)
}
</script>

<template>
  <section class="card">
    <div class="section-head" style="margin-top:0">
      <div>
        <h2>Ferramental</h2>
        <p>Moldes, gabaritos e dispositivos são itens do catálogo. O roteiro aponta para eles; a manutenção conta os golpes no mesmo ativo.</p>
      </div>
      <div class="filter-row" style="margin:0">
        <select v-model="kind" class="filter"><option value="">Todos os tipos</option><option>Molde</option><option>Gabarito</option><option>Dispositivo</option></select>
        <button class="button" @click="create"><Plus :size="14" /> Novo ferramental</button>
      </div>
    </div>
    <div class="flag-list" style="margin-bottom:10px">
      <span class="status neutral">{{ tools.length }} ferramenta(s)</span>
      <span v-if="blockedCavities" class="status warning">{{ blockedCavities }} com cavidade bloqueada</span>
      <span v-if="nearEnd" class="status danger">{{ nearEnd }} acima de 85% da vida útil</span>
    </div>
    <table class="dense" data-tour="tooling-list">
      <thead><tr><th>Ferramental</th><th>Tipo</th><th>Cavidades</th><th>Ciclo</th><th>Por peça</th><th>Máquinas</th><th>Vida útil</th><th>Dono</th><th>Usado em</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="row in tools" :key="row.item.id">
          <td><RouterLink :to="`/produtos/item/${row.item.id}?aba=ferramental`" class="cell-main code">{{ row.item.code }}</RouterLink><span class="cell-sub">{{ row.item.name }}</span></td>
          <td>{{ row.tooling?.kind ?? '—' }}</td>
          <td><template v-if="row.tooling?.kind === 'Molde'"><b :class="{ warn: row.tooling.activeCavities < row.tooling.cavities }">{{ row.tooling.activeCavities }}</b>/{{ row.tooling.cavities }}</template><span v-else class="cell-sub">—</span></td>
          <td>{{ row.tooling?.cycleSeconds ? `${fmtNumber(row.tooling.cycleSeconds, 1)} s` : '—' }}</td>
          <td>{{ row.tooling?.kind === 'Molde' && row.tooling.cycleSeconds ? `${fmtNumber(moldMinutesPerPiece(row.tooling) * 60, 1)} s` : '—' }}</td>
          <td><span class="cell-sub">{{ row.tooling?.compatibleResourceIds.map(id => store.resourceName(id).replace(/ · \d+ t$/, '')).join(', ') || '—' }}</span></td>
          <td style="min-width:120px">
            <template v-if="row.life.life">
              <div class="progress wide" :class="{ danger: row.life.used >= TOOL_LIFE_ALERT }"><span :style="{ width: `${row.life.used * 100}%` }" /></div>
              <span class="cell-sub">{{ fmtNumber(row.life.shots, 0) }} / {{ fmtNumber(row.life.life, 0) }}</span>
            </template>
            <span v-else class="cell-sub">—</span>
          </td>
          <td>{{ row.tooling?.owner ?? '—' }}<span v-if="row.tooling?.ownerName" class="cell-sub">{{ row.tooling.ownerName }}</span></td>
          <td><span class="cell-sub">{{ row.users.map(user => user.code).join(', ') || '—' }}</span></td>
          <td>
            <StatusBadge :value="catalogOf(row.item).lifecycle" :tone="LIFE_TONE[catalogOf(row.item).lifecycle]" />
            <span v-if="row.issues.length" class="cell-sub warn">{{ row.issues[0] }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!tools.length" class="empty-note">Nenhum ferramental cadastrado.</p>
  </section>
</template>
