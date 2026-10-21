<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CheckCircle2, GitBranch } from 'lucide-vue-next'
import StatusBadge from '../../../components/StatusBadge.vue'
import { catalogOf } from '../../../domain/catalog'
import { lineNeed, today } from '../../../domain/engine'
import RoutingSection from '../sections/RoutingSection.vue'
import StandardCostSection from '../sections/StandardCostSection.vue'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { BomLine, Item, ProductRevision } from '../../../types/domain'
import { fmtCurrency } from '../../../utils/format'
import PermHint from '../PermHint.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()

const revisions = computed(() => store.state.productRevisions
  .filter(entry => entry.itemId === props.item.id)
  .sort((a, b) => b.code.localeCompare(a.code)))
const selectedId = ref('')
watch(revisions, list => {
  if (!list.some(entry => entry.id === selectedId.value)) selectedId.value = (list.find(entry => entry.status === 'Rascunho') ?? list.find(entry => entry.status === 'Liberada') ?? list[0])?.id ?? ''
}, { immediate: true })
const revision = computed(() => revisions.value.find(entry => entry.id === selectedId.value))
const isDraft = computed(() => revision.value?.status === 'Rascunho')
const disabled = computed(() => readOnly(props.item, ui.role, 'manufatura'))
const current = computed(() => props.item.bom ?? [])

const candidates = computed(() => store.state.items.filter(entry => {
  const catalog = catalogOf(entry)
  return entry.id !== props.item.id && catalog.lifecycle === 'Ativo' && !catalog.deletedAt && (catalog.nature === 'Bem' || catalog.nature === 'Kit virtual')
}).sort((a, b) => a.code.localeCompare(b.code)))
const line = reactive({ componentId: '', quantity: 1, loss: 0 })
const leadDays = ref(0)
watch(() => [props.item.id, catalogOf(props.item).version], () => { leadDays.value = catalogOf(props.item).productionLeadDays }, { immediate: true })
const notes = ref('')
const todayIso = today()
const validFrom = ref(todayIso)
const label = (entry: ProductRevision) => {
  if (entry.status !== 'Liberada') return entry.status
  if ((entry.validFrom ?? '') > todayIso) return 'Programada'
  return entry.id === props.item.currentRevisionId ? 'Vigente' : 'Liberada'
}

function diff(entry: BomLine) {
  if (!isDraft.value) return ''
  const before = current.value.find(row => row.itemId === entry.itemId)
  if (!before) return 'novo'
  if (before.quantity !== entry.quantity) return `era ${before.quantity}`
  return (before.loss ?? 0) !== (entry.loss ?? 0) ? `perda era ${before.loss ?? 0}%` : ''
}
const removed = computed(() => isDraft.value ? current.value.filter(row => !revision.value?.lines?.some(entry => entry.itemId === row.itemId)) : [])
const cost = (lines: BomLine[]) => lines.reduce((sum, entry) => sum + store.item(entry.itemId).cost * lineNeed(entry, 1), 0)
const ops = computed(() => store.state.productionOrders.filter(op => op.revisionId && op.revisionId === selectedId.value))

function open() {
  const created = store.newRevision(props.item.id, notes.value)
  if (created && typeof created === 'object') {
    selectedId.value = created.id
    notes.value = ''
  }
}
function addLine() {
  if (!revision.value || !line.componentId) return
  if (store.setBomLine(revision.value.id, line.componentId, line.quantity, line.loss) !== undefined) Object.assign(line, { componentId: '', quantity: 1, loss: 0 })
}
</script>

<template>
  <PermHint :item="item" layer="manufatura" />
  <p v-if="catalogOf(item).nature === 'Kit virtual'" class="notice info">Kit virtual: não é estocado. A estrutura explode em componentes na proposta e no pedido.</p>
  <p v-else-if="item.type === 'KF'" class="notice info">Kit físico: é montado e estocado como item próprio. A montagem baixa os componentes da versão vigente.</p>

  <div class="version-grid">
    <div class="version-list">
      <button v-for="entry in revisions" :key="entry.id" :class="{ active: entry.id === selectedId }" @click="selectedId = entry.id">
        <header>Versão {{ entry.code }} <StatusBadge :value="label(entry)" :tone="label(entry) === 'Vigente' ? 'success' : label(entry) === 'Rascunho' ? 'warning' : label(entry) === 'Programada' ? 'info' : 'neutral'" /></header>
        <span v-if="entry.validFrom">Vigência {{ entry.validFrom }} → {{ entry.validTo ?? 'atual' }}</span>
        <span v-else>Aberta por {{ entry.createdBy ?? '—' }} em {{ entry.createdAt.slice(0, 10) }}</span>
        <span>{{ entry.lines?.length ?? 0 }} componente(s)</span>
      </button>
      <p v-if="!revisions.length" class="empty-note">Sem versões. Abra a primeira para montar a estrutura.</p>
      <fieldset v-if="!revisions.some(entry => entry.status === 'Rascunho')" class="layer" :disabled="disabled" style="margin-top:6px">
        <input v-model="notes" class="filter" style="width:100%;margin-bottom:6px" placeholder="Motivo da nova versão" />
        <button class="button secondary block" @click="open"><GitBranch :size="14" /> Abrir nova versão</button>
      </fieldset>
    </div>

    <div v-if="revision">
      <div class="section-head" style="margin-bottom:8px">
        <div><h2>Versão {{ revision.code }} · {{ label(revision) }}</h2><p>{{ revision.notes }}<template v-if="revision.releasedBy"> · liberada por {{ revision.releasedBy }}</template></p></div>
        <span class="cell-sub">Custo de material com perdas {{ fmtCurrency(cost(revision.lines ?? [])) }}</span>
      </div>
      <table class="dense">
        <thead><tr><th>Componente</th><th>Tipo</th><th>Quantidade</th><th>Perda prevista</th><th>Necessidade por unidade</th><th v-if="isDraft" /></tr></thead>
        <tbody>
          <tr v-for="entry in revision.lines ?? []" :key="entry.itemId">
            <td><RouterLink :to="`/produtos/item/${entry.itemId}`" class="cell-main code">{{ store.item(entry.itemId).code }}</RouterLink><span class="cell-sub">{{ store.item(entry.itemId).name }}</span></td>
            <td><span class="cell-sub">{{ store.item(entry.itemId).type }}</span></td>
            <td>
              <input v-if="isDraft && !disabled" :value="entry.quantity" class="filter narrow" type="number" min="0" step="0.001" @change="store.setBomLine(revision.id, entry.itemId, Number(($event.target as HTMLInputElement).value))" />
              <span v-else>{{ entry.quantity }}</span> {{ store.item(entry.itemId).unit }}
              <span v-if="diff(entry)" :class="diff(entry) === 'novo' ? 'diff-add' : 'diff-mod'"> · {{ diff(entry) }}</span>
            </td>
            <td>
              <input v-if="isDraft && !disabled" :value="entry.loss ?? 0" class="filter narrow" type="number" min="0" max="99" step="0.1" @change="store.setBomLine(revision.id, entry.itemId, entry.quantity, Number(($event.target as HTMLInputElement).value))" />
              <span v-else>{{ entry.loss ?? 0 }}</span> %
            </td>
            <td><span class="cell-sub">{{ lineNeed(entry, 1) }} {{ store.item(entry.itemId).unit }}</span></td>
            <td v-if="isDraft"><button class="button ghost small" :disabled="disabled" @click="store.removeBomLine(revision.id, entry.itemId)">Remover</button></td>
          </tr>
          <tr v-for="entry in removed" :key="`del-${entry.itemId}`">
            <td><span class="diff-del">{{ store.item(entry.itemId).code }}</span><span class="cell-sub">{{ store.item(entry.itemId).name }}</span></td>
            <td /><td><span class="diff-del">{{ entry.quantity }}</span> · removido</td><td /><td /><td />
          </tr>
        </tbody>
      </table>

      <template v-if="isDraft">
        <form class="filter-row" style="margin:10px 0" @submit.prevent="addLine">
          <fieldset class="layer filter-row" :disabled="disabled">
            <select v-model="line.componentId" class="filter grow" required><option value="" disabled>Componente ativo…</option><option v-for="entry in candidates" :key="entry.id" :value="entry.id">{{ entry.code }} · {{ entry.name }}</option></select>
            <input v-model.number="line.quantity" class="filter narrow" type="number" min="0.001" step="0.001" title="Quantidade" />
            <label class="cell-sub">perda <input v-model.number="line.loss" class="filter narrow" type="number" min="0" max="99" step="0.1" />%</label>
            <button class="button small" type="submit">Incluir</button>
          </fieldset>
        </form>
        <p class="cell-sub">Só componente ativo entra. Ciclo (o componente já usa este item) e quantidade zero são recusados. Qualquer mudança desmarca o checklist.</p>
        <div class="revision-checklist">
          <button v-for="check in revision.checklist" :key="check.label" class="check-pill" :class="{ done: check.done }" :disabled="disabled" @click="store.toggleRevisionCheck(revision.id, check.label)"><CheckCircle2 :size="13" /> {{ check.label }}</button>
        </div>
        <fieldset class="layer filter-row" :disabled="disabled" style="margin-top:10px">
          <label class="cell-sub">Vigente a partir de <input v-model="validFrom" class="filter" type="date" :min="todayIso" /></label>
          <button class="button" :disabled="revision.checklist.some(entry => !entry.done) || !revision.lines?.length" @click="store.releaseRevision(revision.id, validFrom)">Liberar versão {{ revision.code }}</button>
          <button class="button secondary" @click="store.discardBomVersion(revision.id)">Descartar</button>
        </fieldset>
        <p class="cell-sub">Com data de hoje, a versão entra em vigor na hora. Com data futura, fica programada e a atual vale até a véspera. OPs já abertas continuam com a versão com que nasceram.</p>
      </template>

      <h3 class="drawer-title">Ordens de produção nesta versão</h3>
      <div v-for="op in ops" :key="op.id" class="list-row static">
        <div><strong>{{ op.id }}</strong><span>{{ op.quantity }} {{ item.unit }} · {{ op.status }}</span></div>
      </div>
      <p v-if="!ops.length" class="empty-note">Nenhuma OP registrada com esta versão.</p>
    </div>
  </div>

  <RoutingSection v-if="item.type === 'PA' || item.type === 'KF'" :item="item" />

  <template v-if="catalogOf(item).nature === 'Bem'">
    <h3 class="drawer-title">Prazos de fabricação</h3>
    <form class="filter-row" @submit.prevent="store.updateProductionLead(item.id, leadDays)">
      <fieldset class="layer filter-row" :disabled="disabled">
        <label class="cell-sub">Lead time de produção <input v-model.number="leadDays" class="filter narrow" type="number" min="0" /> dia(s)</label>
        <button class="button secondary small" type="submit">Salvar prazo</button>
      </fieldset>
    </form>
    <p class="cell-sub">Soma ao lead time de compra dos componentes para estimar a data de entrega na proposta.</p>
    <StandardCostSection :item="item" />
  </template>
</template>
