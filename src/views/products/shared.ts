import { computed, reactive, ref, watch, type Ref } from 'vue'
import { catalogOf, type ProductLifeTab } from '../../domain/catalog'
import { productFeature } from '../../domain/access'
import { useErpStore } from '../../stores/erp'
import type { CatalogLayer, Item, ItemLifecycle, ItemType, Role } from '../../types/domain'

/** Espelha a regra do domínio para travar o formulário antes de o usuário tentar salvar. */
export function readOnly(item: Item, role: Role, layer: CatalogLayer) {
  const catalog = catalogOf(item)
  void role // Mantém a assinatura estável para as abas enquanto a UI migra para funcionalidades.
  const capabilityLayer: Record<CatalogLayer, string> = {
    nucleo: 'nucleo.gerir', estoque: 'estoque.gerir', unidades: 'estoque.gerir', manufatura: 'manufatura.gerir',
    ferramental: 'ferramental.gerir', comercial: 'comercial.gerir', fiscal: 'fiscal.gerir', midia: 'midia.gerir',
    projetos: 'projetos.gerir', ciclo: 'ciclo.gerir',
  }
  return !!catalog.deletedAt || catalog.lifecycle === 'Inativo' || !useErpStore().can(productFeature(capabilityLayer[layer]))
}

export const LIFE_TONE: Record<ItemLifecycle, string> = {
  Rascunho: 'warning', 'Em homologação': 'info', Ativo: 'success', 'Alteração pendente': 'warning', 'Inativação pendente': 'warning', Bloqueado: 'danger', Obsoleto: 'neutral', Inativo: 'neutral',
}

export const FLAG_TONE: Record<string, string> = {
  'Sem NCM': 'danger', 'Sem CEST': 'danger', 'GTIN × NCM divergente': 'danger', 'Exceção pendente': 'warning', 'Versão em rascunho': 'info', Excluído: 'neutral',
}

export const PAGE_SIZES = [25, 50, 100]

/** Paginação local; volta à primeira página quando o conjunto filtrado muda. */
export function usePager<T>(rows: Ref<T[]>, initial = 25) {
  const page = ref(1)
  const size = ref(initial)
  const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / size.value)))
  const slice = computed(() => rows.value.slice((page.value - 1) * size.value, page.value * size.value))
  const range = computed(() => {
    if (!rows.value.length) return '0 produtos'
    const start = (page.value - 1) * size.value + 1
    return `${start}–${Math.min(rows.value.length, page.value * size.value)} de ${rows.value.length}`
  })
  watch([() => rows.value.length, size], () => { if (page.value > pages.value) page.value = 1 })
  return { page, size, pages, slice, range }
}

export type HeaderFilterOp = 'starts' | 'ends' | 'contains' | 'not-contains' | 'equals' | 'not-equals'
export const HEADER_FILTER_OPS: { id: HeaderFilterOp; label: string }[] = [
  { id: 'starts', label: 'Começa com' },
  { id: 'ends', label: 'Termina com' },
  { id: 'contains', label: 'Contém' },
  { id: 'not-contains', label: 'Não contém' },
  { id: 'equals', label: 'Igual a' },
  { id: 'not-equals', label: 'Diferente de' },
]

export type HeaderFilterColumn = 'code' | 'name' | 'type' | 'class' | 'brand' | 'abc' | 'price' | 'model' | 'unit' | 'stock' | 'ncm' | 'gtin' | 'version' | 'updated' | 'lifecycle' | 'flags'

export function blankHeaderFilters(): Record<HeaderFilterColumn, { value: string; op: HeaderFilterOp }> {
  const columns: HeaderFilterColumn[] = ['code', 'name', 'type', 'class', 'brand', 'abc', 'price', 'model', 'unit', 'stock', 'ncm', 'gtin', 'version', 'updated', 'lifecycle', 'flags']
  return Object.fromEntries(columns.map(id => [id, { value: '', op: 'contains' as HeaderFilterOp }])) as Record<HeaderFilterColumn, { value: string; op: HeaderFilterOp }>
}

/** Compara o texto exibido na célula com a condição escolhida no cabeçalho. */
export function headerFilterMatches(text: string, value: string, op: HeaderFilterOp) {
  const needle = value.trim().toLowerCase()
  if (!needle) return true
  const hay = text.toLowerCase()
  if (op === 'starts') return hay.startsWith(needle)
  if (op === 'ends') return hay.endsWith(needle)
  if (op === 'contains') return hay.includes(needle)
  if (op === 'not-contains') return !hay.includes(needle)
  if (op === 'equals') return hay === needle
  return hay !== needle
}

export type ListColumn = 'type' | 'class' | 'brand' | 'abc' | 'price' | 'model' | 'unit' | 'stock' | 'ncm' | 'gtin' | 'version' | 'updated' | 'flags'
export const LIST_COLUMNS: { id: ListColumn; label: string }[] = [
  { id: 'type', label: 'Tipo' },
  { id: 'class', label: 'Classificação' },
  { id: 'brand', label: 'Marca e linha' },
  { id: 'abc', label: 'Curva ABC' },
  { id: 'price', label: 'Preço (tabela padrão)' },
  { id: 'model', label: 'Grade' },
  { id: 'unit', label: 'Unidade' },
  { id: 'stock', label: 'Saldo' },
  { id: 'ncm', label: 'NCM' },
  { id: 'gtin', label: 'EAN' },
  { id: 'version', label: 'Versão do registro' },
  { id: 'updated', label: 'Alterado por' },
  { id: 'flags', label: 'Pendências' },
]

const COLUMNS_KEY = 'thalamus-produtos-colunas'
const savedColumns = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null')
    return Array.isArray(raw) ? raw as ListColumn[] : undefined
  } catch {
    return undefined
  }
})()

/** Filtros da lista sobrevivem à ida e volta da página do item. */
export const listState = reactive({
  query: '',
  life: 'active' as ProductLifeTab,
  type: '' as ItemType | '',
  lifecycle: '' as ItemLifecycle | '',
  classId: '',
  flag: '',
  brand: '',
  category: '',
  abc: '' as '' | 'A' | 'B' | 'C',
  showDeleted: false,
  sort: 'code' as 'code' | 'name' | 'lifecycle' | 'stock' | 'updated',
  desc: false,
  columns: savedColumns ?? ['type', 'class', 'stock', 'ncm', 'flags'] as ListColumn[],
  headerFilters: blankHeaderFilters(),
})

watch(() => [...listState.columns], columns => localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns)))
