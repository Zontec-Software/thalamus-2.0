import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { Role } from '../types/domain'
import type { TourStep } from '../tour/steps'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  title: string
  text?: string
}

export type RecordKind = 'opportunity' | 'proposal' | 'demand' | 'purchase' | 'technical' | 'project' | 'budget' | 'person' | 'asset'
export interface RecordRef { kind: RecordKind; id: string; context?: Record<string, string> }

const TOUR_KEY = 'thalamus-tours-v3'
const TOUR_REFRESH = ['/pessoas', '/servicos', '/ativos', '/demandas', '/crm', '/assistencia', '/projetos', '/orcamentos', '/compras', '/dre', '/contas-pagar', '/contas-receber']

function loadSeenTours() {
  const current = localStorage.getItem(TOUR_KEY)
  if (current) return JSON.parse(current) as string[]
  const previous = JSON.parse(localStorage.getItem('thalamus-tours-v2') ?? '[]') as string[]
  return previous.filter(key => !TOUR_REFRESH.includes(key))
}

export const useUiStore = defineStore('ui', () => {
  const toasts = ref<Toast[]>([])
  /** Usuário autenticado na futura API Core; o mockup inicia com Lucas, Administrador. */
  const sessionUserId = ref('u16')
  /** Empresa ativa. Vazio enquanto a sessão é o usuário mestre. */
  const activeTenantId = ref('tenant-roboflex')
  /** Perfil usado apenas pelo Administrador para conferir a interface. Não troca a identidade real. */
  const previewProfileId = ref<string | null>(null)
  const role = ref<Role>('Administrador')
  const userName = ref('Lucas Lima')
  const orderDrawer = ref<string | null>(null)
  const opDrawer = ref<string | null>(null)
  /** Painel lateral dos cadastros e fluxos integrados; `id: 'new'` abre o formulário de criação. */
  const record = ref<RecordRef | null>(null)
  const recordHistory = ref<RecordRef[]>([])
  const tick = ref(Date.now())
  /** Aba que uma notificação pediu para abrir em Orçamentos. */
  const budgetTab = ref('')
  const tourSteps = ref<TourStep[]>([])
  const tourIndex = ref(0)
  const tourKey = ref('')
  const seenTours = ref<string[]>(loadSeenTours())
  let toastId = 0

  setInterval(() => { tick.value = Date.now() }, 1000)
  watch([orderDrawer, opDrawer], ([order, op]) => { if (order || op) closeRecord() })

  function notify(type: Toast['type'], title: string, text?: string) {
    const id = ++toastId
    toasts.value.push({ id, type, title, text })
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 4200)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(toast => toast.id !== id)
  }

  function startTour(key: string, steps: TourStep[]) {
    if (!steps.length) return
    tourKey.value = key
    tourSteps.value = steps
    tourIndex.value = 0
  }

  function endTour() {
    if (tourKey.value && !seenTours.value.includes(tourKey.value)) {
      seenTours.value.push(tourKey.value)
      localStorage.setItem(TOUR_KEY, JSON.stringify(seenTours.value))
    }
    tourSteps.value = []
    tourKey.value = ''
  }

  function resetTours() {
    seenTours.value = []
    localStorage.removeItem(TOUR_KEY)
  }

  function openRecord(kind: RecordKind, id: string, context?: Record<string, string>, replace = false) {
    if (record.value?.kind === kind && record.value.id === id && !context) return
    if (replace) recordHistory.value = []
    else if (record.value && record.value.id !== 'new') recordHistory.value.push(record.value)
    orderDrawer.value = null
    opDrawer.value = null
    record.value = { kind, id, context }
  }

  function backRecord() {
    record.value = recordHistory.value.pop() ?? null
  }

  function closeRecord() {
    record.value = null
    recordHistory.value = []
  }

  return {
    toasts, sessionUserId, activeTenantId, previewProfileId, role, userName, orderDrawer, opDrawer, record, recordHistory, tick, budgetTab, tourSteps, tourIndex, tourKey, seenTours,
    notify, dismiss, startTour, endTour, resetTours, openRecord, backRecord, closeRecord,
  }
})
