<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import { ITEM_TYPE_LABEL, LAYER_LABEL, catalogOf, classLabel, itemFlags, layersOf, references } from '../../domain/catalog'
import { hasFullAccess } from '../../domain/access'
import { mainPhoto } from '../../domain/catalogExtensions'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import ReasonModal from './ReasonModal.vue'
import { FLAG_TONE, LIFE_TONE } from './shared'
import AuditTab from './tabs/AuditTab.vue'
import CommercialTab from './tabs/CommercialTab.vue'
import CoreTab from './tabs/CoreTab.vue'
import FiscalTab from './tabs/FiscalTab.vue'
import LifecycleTab from './tabs/LifecycleTab.vue'
import MediaTab from './tabs/MediaTab.vue'
import ProjectsTab from './tabs/ProjectsTab.vue'
import StockTab from './tabs/StockTab.vue'
import StructureTab from './tabs/StructureTab.vue'
import UsageTab from './tabs/UsageTab.vue'

type Tab = 'nucleo' | 'estoque' | 'manufatura' | 'comercial' | 'fiscal' | 'midia' | 'projetos' | 'ciclo' | 'auditoria' | 'uso'
const TAB_COMPONENT = {
  nucleo: CoreTab, estoque: StockTab, manufatura: StructureTab, comercial: CommercialTab, fiscal: FiscalTab, midia: MediaTab, projetos: ProjectsTab,
  ciclo: LifecycleTab, auditoria: AuditTab, uso: UsageTab,
}

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const item = computed(() => store.state.items.find(entry => entry.id === route.params.id))
const catalog = computed(() => item.value ? catalogOf(item.value) : undefined)
const tabs = computed<{ id: Tab; label: string; count?: number }[]>(() => {
  if (!item.value) return []
  const layers = layersOf(item.value).filter(layer => layer !== 'unidades') as Tab[]
  const pendingChanges = catalog.value!.keyChanges.filter(change => change.status === 'Pendente').length
  return [
    { id: 'nucleo', label: 'Núcleo' },
    ...layers.map(id => ({
      id, label: id === 'estoque' ? 'Estoque e unidades' : LAYER_LABEL[id as keyof typeof LAYER_LABEL],
      count: id === 'midia' ? catalog.value!.media.length || undefined : id === 'projetos' ? catalog.value!.projectLinks.length || undefined : undefined,
    })),
    { id: 'ciclo', label: 'Ciclo e aprovações', count: pendingChanges || undefined },
    { id: 'auditoria', label: 'Auditoria', count: catalog.value!.audit.length },
    { id: 'uso', label: 'Onde é usado' },
  ]
})
const tab = computed<Tab>({
  get: () => {
    const wanted = route.query.aba as Tab | undefined
    return wanted && tabs.value.some(entry => entry.id === wanted) ? wanted : 'nucleo'
  },
  set: value => { router.replace({ query: { ...route.query, aba: value === 'nucleo' ? undefined : value } }) },
})
const flags = computed(() => item.value ? itemFlags(store.state, item.value) : [])
const photo = computed(() => item.value ? mainPhoto(item.value) : undefined)
const canDelete = computed(() => !!catalog.value && !catalog.value.deletedAt && (catalog.value.lifecycle === 'Rascunho' || catalog.value.lifecycle === 'Inativo'))
const deleting = ref(false)
const deleteKind = computed(() => item.value && references(store.state, item.value.id).length ? 'lógica' : 'física')

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
    <article class="card">
      <div class="item-head">
        <img v-if="photo?.dataUrl" class="item-photo" :src="photo.dataUrl" :alt="photo.name" />
        <div class="item-head-main">
          <span class="eyebrow">{{ item.code }} · {{ ITEM_TYPE_LABEL[item.type] }} · {{ catalog.nature }}</span>
          <h2>{{ item.name }}</h2>
          <div class="meta">
            <span>{{ classLabel(store.state, catalog.classId) }}</span>
            <span>Unidade <b>{{ item.unit }}</b></span>
            <span>Registro <b>v{{ catalog.version }}</b></span>
            <span>Alterado por <b>{{ catalog.updatedBy }}</b> em {{ catalog.updatedAt.slice(0, 10) }}</span>
            <span v-if="item.revision">Estrutura vigente <b>{{ item.revision }}</b></span>
          </div>
          <div v-if="flags.length" class="flag-list" style="margin-top:8px"><span v-for="flag in flags" :key="flag" class="status" :class="FLAG_TONE[flag] ?? 'warning'">{{ flag }}</span></div>
        </div>
        <div class="actions">
          <StatusBadge :value="catalog.deletedAt ? 'Excluído' : catalog.lifecycle" :tone="catalog.deletedAt ? 'neutral' : LIFE_TONE[catalog.lifecycle]" />
          <button v-if="canDelete" class="button secondary small" @click="deleting = true"><Trash2 :size="13" /> Excluir</button>
          <button v-if="catalog.deletedAt" class="button small" :disabled="!hasFullAccess(ui.role)" :title="hasFullAccess(ui.role) ? '' : 'Só a gestão do cadastro restaura'" @click="store.restoreItem(item.id)"><RotateCcw :size="13" /> Restaurar</button>
        </div>
      </div>
      <p v-if="catalog.deletedAt" class="notice warning">Excluído logicamente por {{ catalog.deletedBy }} em {{ catalog.deletedAt.slice(0, 10) }}. Não aparece nas listas nem entra em transação; o histórico fica.</p>

      <div class="tabs" data-tour="product-layers">
        <button v-for="entry in tabs" :key="entry.id" :class="{ active: tab === entry.id }" @click="tab = entry.id">{{ entry.label }}<b v-if="entry.count">{{ entry.count }}</b></button>
      </div>
      <component :is="TAB_COMPONENT[tab]" :item="item" />
    </article>

    <ReasonModal :open="deleting" :title="`Excluir ${item.code}`" tone="danger" confirm="Excluir"
      :subtitle="deleteKind === 'física' ? 'Nunca foi usado: será apagado de verdade.' : 'Já foi usado em documentos: a exclusão será lógica e o histórico fica preservado.'"
      @close="deleting = false" @confirm="remove" />
  </template>
</template>
