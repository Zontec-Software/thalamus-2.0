<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import { ITEM_TYPE_LABEL, catalogOf, classLabel, hasRouting, itemFlags, layersOf, missingAttributes, references } from '../../domain/catalog'
import { hasFullAccess } from '../../domain/access'
import { mainPhoto } from '../../domain/catalogExtensions'
import { costBreakdown, parentsOf, toolLife, toolUsers } from '../../domain/engineering'
import { TOOL_LIFE_ALERT } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { fmtCurrency, fmtNumber } from '../../utils/format'
import ReasonModal from './ReasonModal.vue'
import { FLAG_TONE, LIFE_TONE } from './shared'
import AuditTab from './tabs/AuditTab.vue'
import ChangesTab from './tabs/ChangesTab.vue'
import CommercialTab from './tabs/CommercialTab.vue'
import CoreTab from './tabs/CoreTab.vue'
import CostTab from './tabs/CostTab.vue'
import FiscalTab from './tabs/FiscalTab.vue'
import LifecycleTab from './tabs/LifecycleTab.vue'
import MediaTab from './tabs/MediaTab.vue'
import PackagingTab from './tabs/PackagingTab.vue'
import ProjectsTab from './tabs/ProjectsTab.vue'
import StockTab from './tabs/StockTab.vue'
import StructureTab from './tabs/StructureTab.vue'
import ToolingTab from './tabs/ToolingTab.vue'
import UsageTab from './tabs/UsageTab.vue'

type Section = 'nucleo' | 'manufatura' | 'custos' | 'ferramental' | 'mudancas' | 'uso' | 'estoque' | 'embalagem' | 'comercial' | 'fiscal' | 'midia' | 'projetos' | 'ciclo' | 'auditoria'
const SECTION_COMPONENT: Record<Section, Component> = {
  nucleo: CoreTab, manufatura: StructureTab, custos: CostTab, ferramental: ToolingTab, mudancas: ChangesTab, uso: UsageTab,
  estoque: StockTab, embalagem: PackagingTab, comercial: CommercialTab, fiscal: FiscalTab, midia: MediaTab, projetos: ProjectsTab,
  ciclo: LifecycleTab, auditoria: AuditTab,
}

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const item = computed(() => store.state.items.find(entry => entry.id === route.params.id))
const catalog = computed(() => item.value ? catalogOf(item.value) : undefined)
const openChanges = computed(() => item.value ? store.state.engineeringChanges.filter(change => change.itemIds.includes(item.value!.id) && change.stage !== 'Implementada' && change.stage !== 'Recusada') : [])
const parents = computed(() => item.value ? parentsOf(store.state, item.value.id) : [])

interface SectionLink { id: Section; label: string; count?: number; alert?: boolean }
const groups = computed<{ label: string; links: SectionLink[] }[]>(() => {
  if (!item.value || !catalog.value) return []
  const layers = layersOf(item.value)
  const has = (layer: Parameters<typeof layers.includes>[0]) => layers.includes(layer)
  const physical = catalog.value.nature === 'Bem'
  const missing = missingAttributes(store.state, item.value).length
  const pendingKeys = catalog.value.keyChanges.filter(change => change.status === 'Pendente').length
  const result: { label: string; links: (SectionLink | false)[] }[] = [
    { label: 'Identificação', links: [{ id: 'nucleo', label: 'Geral e atributos', count: missing || undefined, alert: missing > 0 }] },
    { label: 'Engenharia', links: [
      has('manufatura') && { id: 'manufatura', label: hasRouting(item.value) ? 'Estrutura e roteiro' : 'Estrutura' },
      has('ferramental') && { id: 'ferramental', label: 'Ferramental' },
      (has('manufatura') || item.value.type === 'FE') && physical && { id: 'custos', label: 'Custos' },
      { id: 'mudancas', label: 'Mudanças', count: openChanges.value.length || undefined, alert: openChanges.value.length > 0 },
      { id: 'uso', label: 'Onde é usado', count: (item.value.type === 'FE' ? toolUsers(store.state, item.value.id).length : parents.value.length) || undefined },
    ] },
    { label: 'Logística', links: [
      has('estoque') && { id: 'estoque', label: 'Estoque e unidades' },
      has('estoque') && physical && { id: 'embalagem', label: 'Embalagem', count: catalog.value.packaging?.length || undefined },
    ] },
    { label: 'Comercial e fiscal', links: [
      has('comercial') && { id: 'comercial', label: 'Comercial' },
      has('fiscal') && { id: 'fiscal', label: 'Fiscal', alert: catalog.value.fiscalSync?.status === 'Conflito', count: catalog.value.fiscalSync && catalog.value.fiscalSync.status !== 'Sincronizado' ? 1 : undefined },
    ] },
    { label: 'Documentos', links: [
      has('midia') && { id: 'midia', label: 'Mídia e documentos', count: catalog.value.media.length || undefined },
      has('projetos') && { id: 'projetos', label: 'Projetos', count: catalog.value.projectLinks.length || undefined },
    ] },
    { label: 'Governança', links: [
      { id: 'ciclo', label: 'Ciclo e aprovações', count: pendingKeys || undefined, alert: pendingKeys > 0 },
      { id: 'auditoria', label: 'Auditoria', count: catalog.value.audit.length },
    ] },
  ]
  return result.map(group => ({ label: group.label, links: group.links.filter((link): link is SectionLink => !!link) })).filter(group => group.links.length)
})
const allLinks = computed(() => groups.value.flatMap(group => group.links))
const LEGACY_TAB: Record<string, Section> = { unidades: 'estoque' }
const section = computed<Section>({
  get: () => {
    const raw = route.query.aba as string | undefined
    const wanted = (raw && LEGACY_TAB[raw]) || raw as Section | undefined
    return wanted && allLinks.value.some(entry => entry.id === wanted) ? wanted : 'nucleo'
  },
  set: value => { router.replace({ query: { ...route.query, aba: value === 'nucleo' ? undefined : value } }) },
})
const sectionLabel = computed(() => allLinks.value.find(entry => entry.id === section.value)?.label ?? '')

const flags = computed(() => item.value ? itemFlags(store.state, item.value) : [])
const photo = computed(() => item.value ? mainPhoto(item.value) : undefined)
const canDelete = computed(() => !!catalog.value && !catalog.value.deletedAt && (catalog.value.lifecycle === 'Rascunho' || catalog.value.lifecycle === 'Inativo'))
const deleting = ref(false)
const deleteKind = computed(() => item.value && references(store.state, item.value.id).length ? 'lógica' : 'física')

interface Kpi { label: string; value: string; hint?: string; target?: Section; tone?: string }
const kpis = computed<Kpi[]>(() => {
  const entry = item.value
  const layer = catalog.value
  if (!entry || !layer) return []
  if (entry.type === 'FE') {
    const tooling = layer.tooling
    const life = toolLife(store.state, entry)
    return [
      { label: 'Cavidades', value: tooling ? `${tooling.activeCavities}/${tooling.cavities}` : '—', hint: tooling && tooling.activeCavities < tooling.cavities ? 'ativas/nominais · há cavidade bloqueada' : 'ativas/nominais', target: 'ferramental', tone: tooling && tooling.activeCavities < tooling.cavities ? 'warning' : undefined },
      { label: 'Ciclo', value: tooling?.cycleSeconds ? `${fmtNumber(tooling.cycleSeconds, 0)} s` : '—', hint: tooling?.cycleSeconds ? `${fmtNumber(tooling.cycleSeconds / Math.max(1, tooling.activeCavities), 1)} s por peça` : undefined, target: 'ferramental' },
      { label: 'Vida útil', value: life.life ? `${fmtNumber(life.used * 100, 0)}%` : '—', hint: life.life ? `${fmtNumber(life.shots, 0)} de ${fmtNumber(life.life, 0)} golpes` : 'sem vida útil definida', target: 'ferramental', tone: life.used >= TOOL_LIFE_ALERT ? 'danger' : undefined },
      { label: 'Usado em', value: String(toolUsers(store.state, entry.id).length), hint: 'roteiros vigentes', target: 'uso' },
      { label: 'Dono', value: tooling?.owner ?? '—', hint: tooling?.ownerName, target: 'ferramental' },
    ]
  }
  const computedCost = layer.nature === 'Bem' && (entry.bom?.length || entry.routing?.length) ? costBreakdown(store.state, entry) : undefined
  const list: Kpi[] = [
    { label: 'Custo-padrão', value: layer.nature === 'Serviço' ? '—' : fmtCurrency(entry.cost), hint: computedCost ? `calculado ${fmtCurrency(computedCost.total)}` : undefined, target: layer.nature === 'Bem' && (entry.bom?.length || entry.routing?.length) ? 'custos' : undefined },
  ]
  if (layer.nature === 'Bem') list.push({ label: 'Saldo', value: `${fmtNumber(entry.stock, entry.stock % 1 ? 2 : 0)} ${entry.unit}`, hint: entry.minimum ? `mínimo ${entry.minimum}` : undefined, target: 'estoque', tone: entry.minimum && entry.stock < entry.minimum ? 'warning' : undefined })
  const lead = (layer.productionLeadDays || 0) + (entry.leadTimeDays || 0)
  if (layer.nature === 'Bem') list.push({ label: 'Lead time', value: `${lead} dia(s)`, hint: layer.productionLeadDays ? `${layer.productionLeadDays} de fabricação` : 'de compra', target: layer.productionLeadDays ? 'custos' : 'estoque' })
  if (hasRouting(entry)) list.push({ label: 'Roteiro', value: `${fmtNumber((entry.routing ?? []).reduce((sum, step) => sum + step.minutesPerUnit, 0), 1)} min`, hint: `${entry.routing?.length ?? 0} operação(ões) por unidade`, target: 'manufatura' })
  list.push({ label: 'Usado em', value: String(parents.value.length), hint: parents.value.length ? 'estruturas acima' : 'não é componente', target: 'uso' })
  list.push({ label: 'Mudanças', value: String(openChanges.value.length), hint: openChanges.value.length ? 'em aberto' : 'nenhuma em aberto', target: 'mudancas', tone: openChanges.value.some(change => change.priority === 'Urgente') ? 'warning' : undefined })
  return list
})

watch(item, value => { if (value) document.title = `${value.code} · Thalamus` }, { immediate: true })

function remove(reason: string) {
  const id = item.value!.id
  const result = store.deleteItem(id, reason)
  if (result === undefined) return
  deleting.value = false
  if (result === 'física') router.push('/produtos')
}
</script>

<template>
  <div v-if="!item || !catalog" class="card empty-note">
    Item não encontrado. Ele pode ter sido apagado por nunca ter sido usado.
    <div style="margin-top:10px"><RouterLink to="/produtos" class="button secondary">Voltar à lista</RouterLink></div>
  </div>
  <template v-else>
    <RouterLink to="/produtos" class="back-link"><ArrowLeft :size="13" /> Itens</RouterLink>
    <article class="card item-hero" data-tour="product-header">
      <div class="item-head">
        <img v-if="photo?.dataUrl" class="item-photo" :src="photo.dataUrl" :alt="photo.name" />
        <div v-else class="item-photo placeholder">{{ item.type }}</div>
        <div class="item-head-main">
          <span class="eyebrow">{{ item.code }} · {{ ITEM_TYPE_LABEL[item.type] }}</span>
          <h2>{{ item.name }}<small v-if="item.variant" class="cell-sub"> · {{ item.variant }}</small></h2>
          <div class="meta">
            <span>{{ classLabel(store.state, catalog.classId) }}</span>
            <span>Unidade <b>{{ item.unit }}</b></span>
            <span v-if="item.revision">Versão vigente <b>{{ item.revision }}</b></span>
            <span>Registro <b>v{{ catalog.version }}</b> · {{ catalog.updatedBy }} em {{ catalog.updatedAt.slice(0, 10).split('-').reverse().join('/') }}</span>
          </div>
          <div v-if="flags.length" class="flag-list" style="margin-top:8px"><span v-for="flag in flags" :key="flag" class="status" :class="FLAG_TONE[flag] ?? 'warning'">{{ flag }}</span></div>
        </div>
        <div class="actions">
          <StatusBadge :value="catalog.deletedAt ? 'Excluído' : catalog.lifecycle" :tone="catalog.deletedAt ? 'neutral' : LIFE_TONE[catalog.lifecycle]" />
          <button v-if="canDelete" class="button secondary small" @click="deleting = true"><Trash2 :size="13" /> Excluir</button>
          <button v-if="catalog.deletedAt" class="button small" :disabled="!hasFullAccess(ui.role)" :title="hasFullAccess(ui.role) ? '' : 'Só a gestão do cadastro restaura'" @click="store.restoreItem(item.id)"><RotateCcw :size="13" /> Restaurar</button>
        </div>
      </div>
      <div class="kpi-strip" data-tour="product-kpis">
        <button v-for="kpi in kpis" :key="kpi.label" type="button" class="kpi" :class="[kpi.tone, { link: kpi.target }]" :disabled="!kpi.target" @click="kpi.target && (section = kpi.target)">
          <span>{{ kpi.label }}</span>
          <strong>{{ kpi.value }}</strong>
          <small v-if="kpi.hint">{{ kpi.hint }}</small>
        </button>
      </div>
      <p v-if="catalog.deletedAt" class="notice warning" style="margin-top:12px">Excluído logicamente por {{ catalog.deletedBy }} em {{ catalog.deletedAt.slice(0, 10) }}. Não aparece nas listas nem entra em transação; o histórico fica.</p>
    </article>

    <div class="object-page">
      <nav class="section-rail" data-tour="product-layers">
        <template v-for="group in groups" :key="group.label">
          <span class="nav-label">{{ group.label }}</span>
          <button v-for="entry in group.links" :key="entry.id" type="button" :class="{ active: section === entry.id }" @click="section = entry.id">
            {{ entry.label }}<b v-if="entry.count" :class="{ alert: entry.alert }">{{ entry.count }}</b>
          </button>
        </template>
      </nav>
      <article class="card section-body">
        <h3 class="section-title">{{ sectionLabel }}</h3>
        <component :is="SECTION_COMPONENT[section]" :item="item" />
      </article>
    </div>

    <ReasonModal :open="deleting" :title="`Excluir ${item.code}`" tone="danger" confirm="Excluir"
      :subtitle="deleteKind === 'física' ? 'Nunca foi usado: será apagado de verdade.' : 'Já foi usado em documentos: a exclusão será lógica e o histórico fica preservado.'"
      @close="deleting = false" @confirm="remove" />
  </template>
</template>
