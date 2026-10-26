<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CheckCircle2, GitBranch, GitCompare, Plus, Trash2 } from 'lucide-vue-next'
import StatusBadge from '../../../components/StatusBadge.vue'
import { catalogOf, hasRouting, inUse } from '../../../domain/catalog'
import { revisionDiff } from '../../../domain/engineering'
import { lineNeed, today } from '../../../domain/engine'
import RoutingSection from '../sections/RoutingSection.vue'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { BomLine, Item, ProductRevision } from '../../../types/domain'
import { fmtCurrency, fmtNumber } from '../../../utils/format'
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
const routed = computed(() => hasRouting(props.item))

type View = 'estrutura' | 'roteiro' | 'ops'
const view = ref<View>('estrutura')
watch(routed, value => { if (!value && view.value === 'roteiro') view.value = 'estrutura' })

const compareId = ref('')
watch(selectedId, () => { compareId.value = '' })
const compareBase = computed(() => revisions.value.find(entry => entry.id === compareId.value))
const diff = computed(() => revision.value && (isDraft.value || compareBase.value) ? revisionDiff(store.state, revision.value, compareBase.value) : undefined)
const diffOf = (itemId: string) => diff.value?.bom.find(entry => entry.itemId === itemId)
const removed = computed(() => diff.value?.bom.filter(entry => entry.kind === 'removido') ?? [])
const changeOf = (entry: ProductRevision) => entry.changeId ? store.state.engineeringChanges.find(change => change.id === entry.changeId) : undefined

const candidates = computed(() => store.state.items.filter(entry => {
  const catalog = catalogOf(entry)
  return entry.id !== props.item.id && inUse(catalog.lifecycle) && !catalog.deletedAt && (catalog.nature === 'Bem' || catalog.nature === 'Kit virtual')
    && !(revision.value?.lines ?? []).some(lineEntry => lineEntry.itemId === entry.id)
}).sort((a, b) => a.code.localeCompare(b.code)))
const line = reactive({ componentId: '', quantity: 1, loss: 0 })
const opening = ref(false)
const notes = ref('')
const todayIso = today()
const validFrom = ref(todayIso)
const date = (iso?: string) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : ''
const label = (entry: ProductRevision) => {
  if (entry.status !== 'Liberada') return entry.status
  if ((entry.validFrom ?? '') > todayIso) return 'Programada'
  return entry.id === props.item.currentRevisionId ? 'Vigente' : 'Liberada'
}
const TONE: Record<string, string> = { Vigente: 'success', Rascunho: 'warning', Programada: 'info' }
const period = (entry: ProductRevision) => entry.validFrom
  ? `${date(entry.validFrom)} → ${entry.validTo ? date(entry.validTo) : 'atual'}`
  : `aberta em ${date(entry.createdAt)}`
const lineCost = (entry: BomLine) => store.item(entry.itemId).cost * lineNeed(entry, 1)
const material = computed(() => (revision.value?.lines ?? []).reduce((sum, entry) => sum + lineCost(entry), 0))
const steps = computed(() => revision.value?.routing ?? props.item.routing ?? [])
const ops = computed(() => store.state.productionOrders.filter(op => op.revisionId && op.revisionId === selectedId.value))
const pendingChecks = computed(() => revision.value?.checklist.filter(entry => !entry.done).length ?? 0)

function open() {
  const created = store.newRevision(props.item.id, notes.value)
  if (created && typeof created === 'object') {
    selectedId.value = created.id
    notes.value = ''
    opening.value = false
    view.value = 'estrutura'
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

  <div class="rev-bar" data-tour="product-versions">
    <div class="rev-chips">
      <button v-for="entry in revisions" :key="entry.id" type="button" class="rev-chip" :class="{ active: entry.id === selectedId }" @click="selectedId = entry.id">
        <span class="rev-code">{{ entry.code }}</span>
        <span class="rev-info"><StatusBadge :value="label(entry)" :tone="TONE[label(entry)] ?? 'neutral'" /><small>{{ period(entry) }}</small></span>
      </button>
      <p v-if="!revisions.length" class="empty-note">Sem versões. Abra a primeira para montar a estrutura.</p>
    </div>
    <button v-if="!revisions.some(entry => entry.status === 'Rascunho')" type="button" class="button secondary small" :disabled="disabled" @click="opening = !opening"><GitBranch :size="14" /> Nova versão</button>
  </div>
  <form v-if="opening" class="inline-form row" @submit.prevent="open">
    <input v-model="notes" class="filter grow" placeholder="Motivo da nova versão" required />
    <button class="button small" type="submit">Abrir versão {{ revisions.length ? 'como cópia da vigente' : '' }}</button>
    <button class="button ghost small" type="button" @click="opening = false">Cancelar</button>
    <small class="cell-sub" style="flex-basis:100%">Mudança com impacto em estoque, OP ou pedido: abra pela aba Mudanças.</small>
  </form>

  <template v-if="revision">
    <div class="rev-head">
      <div class="rev-title">
        <h2>Versão {{ revision.code }} <StatusBadge :value="label(revision)" :tone="TONE[label(revision)] ?? 'neutral'" /></h2>
        <div class="meta-line">
          <span v-if="revision.notes">{{ revision.notes }}</span>
          <span v-if="revision.validFrom">Vigência <b>{{ period(revision) }}</b></span>
          <span v-else>Aberta por <b>{{ revision.createdBy ?? '—' }}</b> em {{ date(revision.createdAt) }}</span>
          <span v-if="revision.releasedBy">Liberada por <b>{{ revision.releasedBy }}</b></span>
          <RouterLink v-if="changeOf(revision)" :to="{ query: { aba: 'mudancas' } }" class="eco-tag">{{ changeOf(revision)!.id }} · {{ changeOf(revision)!.stage }}</RouterLink>
        </div>
      </div>
      <label v-if="revisions.length > 1" class="cell-sub compare-select"><GitCompare :size="13" />
        <select v-model="compareId" class="filter">
          <option value="">{{ isDraft ? 'Comparar com a vigente' : 'Sem comparação' }}</option>
          <option v-for="entry in revisions.filter(other => other.id !== revision!.id)" :key="entry.id" :value="entry.id">Comparar com {{ entry.code }}</option>
        </select>
      </label>
    </div>

    <div class="rev-tabs">
      <div class="segmented">
        <button type="button" :class="{ active: view === 'estrutura' }" @click="view = 'estrutura'">Estrutura <b>{{ revision.lines?.length ?? 0 }}</b></button>
        <button v-if="routed" type="button" :class="{ active: view === 'roteiro' }" @click="view = 'roteiro'">Roteiro <b>{{ steps.length }}</b><i v-if="diff?.routing.length" class="dot" title="Mudou em relação à comparada" /></button>
        <button type="button" :class="{ active: view === 'ops' }" @click="view = 'ops'">OPs nesta versão <b>{{ ops.length }}</b></button>
      </div>
      <span class="cell-sub">Material por unidade <b>{{ fmtCurrency(material) }}</b></span>
    </div>

    <template v-if="view === 'estrutura'">
      <div class="table-scroll">
        <table class="dense bom-table">
          <thead><tr><th>Componente</th><th>Tipo</th><th class="num">Quantidade</th><th class="num">Perda</th><th class="num">Necessidade/un</th><th class="num">Custo/un</th><th v-if="isDraft && !disabled" /></tr></thead>
          <tbody>
            <tr v-for="entry in revision.lines ?? []" :key="entry.itemId">
              <td>
                <RouterLink :to="`/produtos/item/${entry.itemId}`" class="cell-main code">{{ store.item(entry.itemId).code }}</RouterLink>
                <span class="cell-sub">{{ store.item(entry.itemId).name }}</span>
                <span v-if="diffOf(entry.itemId)" class="diff-tag" :class="diffOf(entry.itemId)!.kind === 'novo' ? 'diff-add' : 'diff-mod'">{{ diffOf(entry.itemId)!.kind === 'novo' ? 'novo' : `era ${diffOf(entry.itemId)!.detail.split(' → ')[0]}` }}</span>
              </td>
              <td><span class="cell-sub">{{ store.item(entry.itemId).type }}</span></td>
              <td class="num">
                <span class="unit-input">
                  <input v-if="isDraft && !disabled" :value="entry.quantity" class="cell-input" type="number" min="0" step="0.001" @change="store.setBomLine(revision.id, entry.itemId, Number(($event.target as HTMLInputElement).value))" />
                  <span v-else>{{ fmtNumber(entry.quantity, 3) }}</span>
                  <small>{{ store.item(entry.itemId).unit }}</small>
                </span>
              </td>
              <td class="num">
                <span class="unit-input">
                  <input v-if="isDraft && !disabled" :value="entry.loss ?? 0" class="cell-input short" type="number" min="0" max="99" step="0.1" @change="store.setBomLine(revision.id, entry.itemId, entry.quantity, Number(($event.target as HTMLInputElement).value))" />
                  <span v-else>{{ fmtNumber(entry.loss ?? 0, 1) }}</span>
                  <small>%</small>
                </span>
              </td>
              <td class="num">{{ fmtNumber(lineNeed(entry, 1), 3) }} <span class="cell-sub" style="display:inline">{{ store.item(entry.itemId).unit }}</span></td>
              <td class="num">{{ fmtCurrency(lineCost(entry)) }}</td>
              <td v-if="isDraft && !disabled" class="num"><button type="button" class="icon-plain" title="Remover componente" @click="store.removeBomLine(revision.id, entry.itemId)"><Trash2 :size="14" /></button></td>
            </tr>
            <tr v-for="entry in removed" :key="`del-${entry.itemId}`" class="removed-row">
              <td><span class="diff-del code">{{ store.item(entry.itemId).code }}</span><span class="cell-sub">{{ store.item(entry.itemId).name }}</span><span class="diff-tag diff-del">removido</span></td>
              <td /><td class="num"><span class="diff-del">{{ entry.detail }}</span></td><td /><td /><td /><td v-if="isDraft && !disabled" />
            </tr>
          </tbody>
          <tfoot>
            <tr v-if="isDraft && !disabled" class="add-row">
              <td colspan="2">
                <select v-model="line.componentId" class="filter" style="width:100%">
                  <option value="" disabled>Incluir componente ativo…</option>
                  <option v-for="entry in candidates" :key="entry.id" :value="entry.id">{{ entry.code }} · {{ entry.name }}</option>
                </select>
              </td>
              <td class="num"><span class="unit-input"><input v-model.number="line.quantity" class="cell-input" type="number" min="0.001" step="0.001" title="Quantidade" @keydown.enter.prevent="addLine" /><small>{{ line.componentId ? store.item(line.componentId).unit : '' }}</small></span></td>
              <td class="num"><span class="unit-input"><input v-model.number="line.loss" class="cell-input short" type="number" min="0" max="99" step="0.1" title="Perda prevista" @keydown.enter.prevent="addLine" /><small>%</small></span></td>
              <td colspan="3" class="num"><button type="button" class="button small" :disabled="!line.componentId" @click="addLine"><Plus :size="13" /> Incluir</button></td>
            </tr>
            <tr class="total-row">
              <td colspan="5">Material por unidade, com perdas</td>
              <td class="num">{{ fmtCurrency(material) }}</td>
              <td v-if="isDraft && !disabled" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="!revision.lines?.length" class="empty-note">Nenhum componente nesta versão.</p>
    </template>

    <template v-else-if="view === 'roteiro'">
      <RoutingSection :item="item" :revision="revision" />
      <template v-if="diff && diff.routing.length">
        <h3 class="drawer-title">O que mudou no roteiro {{ compareBase ? `em relação à versão ${compareBase.code}` : 'em relação à vigente' }}</h3>
        <div v-for="entry in diff.routing" :key="`${entry.kind}-${entry.name}`" class="list-row static">
          <div><strong :class="entry.kind === 'novo' ? 'diff-add' : entry.kind === 'removido' ? 'diff-del' : 'diff-mod'">{{ entry.name }} · {{ entry.kind }}</strong><span>{{ entry.detail }}</span></div>
        </div>
      </template>
    </template>

    <template v-else>
      <div v-for="op in ops" :key="op.id" class="list-row static">
        <div><strong>{{ op.id }}</strong><span>{{ op.quantity }} {{ item.unit }} · {{ op.status }}</span></div>
      </div>
      <p v-if="!ops.length" class="empty-note">Nenhuma OP registrada com esta versão. A OP grava a versão com que foi aberta.</p>
    </template>

    <section v-if="isDraft" class="release-panel">
      <header>
        <h3>Liberação da versão {{ revision.code }}</h3>
        <span class="cell-sub">{{ pendingChecks ? `${pendingChecks} conferência(s) pendente(s)` : 'Conferências feitas' }} · qualquer alteração desmarca o checklist</span>
      </header>
      <div class="revision-checklist">
        <button v-for="check in revision.checklist" :key="check.label" type="button" class="check-pill" :class="{ done: check.done }" :disabled="disabled" @click="store.toggleRevisionCheck(revision.id, check.label)"><CheckCircle2 :size="13" /> {{ check.label }}</button>
      </div>
      <p v-if="changeOf(revision)" class="notice info">Esta versão pertence à mudança {{ changeOf(revision)!.id }}. Ela é liberada quando a mudança for implementada, em {{ date(changeOf(revision)!.effectiveDate) }}.</p>
      <fieldset v-else class="layer release-actions" :disabled="disabled">
        <label class="cell-sub">Vigente a partir de <input v-model="validFrom" class="filter" type="date" :min="todayIso" /></label>
        <button type="button" class="button" :disabled="pendingChecks > 0 || !revision.lines?.length" @click="store.releaseRevision(revision.id, validFrom)">Liberar versão {{ revision.code }}</button>
        <button type="button" class="button ghost" @click="store.discardBomVersion(revision.id)">Descartar</button>
        <small class="cell-sub">Hoje: entra em vigor na hora. Data futura: fica programada e a atual vale até a véspera. OPs abertas não mudam.</small>
      </fieldset>
    </section>
  </template>
</template>
