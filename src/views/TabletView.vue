<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ArrowLeft, BellRing, Check, CheckCircle2, ClipboardList, Delete, FileText, LogOut, Pause, Play, Plus, ScanLine, ShieldCheck,
  ShieldX, Truck, Wrench,
} from 'lucide-vue-next'
import { elapsedMs, injectionSetup, openCorrective, PAUSE_REASONS, SCRAP_REASONS } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { Operation, ProductionOrder, Resource, Role, User } from '../types/domain'
import { fmtDate, fmtDuration, fmtTime } from '../utils/format'

type Step = 'login' | 'pin' | 'station' | 'queue' | 'work'
type Sheet = 'pause' | 'report' | 'alert' | 'reject' | null

const store = useErpStore()
const ui = useUiStore()

const FLOOR_ROLES: Role[] = ['Operador', 'Líder de produção', 'Almoxarifado', 'Qualidade', 'Expedição', 'Manutenção']
const ALERTS = ['Falta de material no posto', 'Dúvida na instrução de trabalho', 'Problema de qualidade na peça', 'Preciso de ajuda na máquina']
const CARRIERS = ['Rodonaves', 'Braspress', 'Jadlog', 'Retirada pelo cliente']
const QUALITY_CHECKS = ['Dimensional e encaixe do tablet', 'Acabamento sem riscos ou rebarbas', 'Fixação de parafusos e película', 'Etiqueta de lote e embalagem']

const step = ref<Step>('login')
const sheet = ref<Sheet>(null)
const user = ref<User | null>(null)
const pin = ref('')
const stationId = ref('')
const selected = ref<{ opId: string; operationId: string } | null>(null)
const focusId = ref('')
const almoxTab = ref<'separar' | 'receber'>('separar')
const scanned = ref<string[]>([])
const qualityChecks = ref<boolean[]>([])
const shipForm = ref({ volumes: 1, carrier: CARRIERS[0] })
const report = ref({ good: 0, scrap: 0, reason: '' })
const pauseReason = ref('')
const rejectForm = ref({ quantity: 1, reason: SCRAP_REASONS[3] })
const deviceToast = ref<{ text: string; error: boolean } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined

const users = computed(() => store.state.users.filter(entry => FLOOR_ROLES.includes(entry.role)))
const initials = (name: string) => name.split(' ').map(part => part[0]).join('').slice(0, 2)
const station = computed(() => store.state.resources.find(resource => resource.id === stationId.value))
const stationKind = computed(() => station.value?.kind ?? 'Manutenção')
const stations = computed<Resource[]>(() => {
  const role = user.value?.role
  if (role === 'Operador' || role === 'Líder de produção') return store.state.resources.filter(resource => ['Injetora', 'Montagem'].includes(resource.kind))
  return []
})

/* ---------- Feedback dentro do aparelho ---------- */
function flash(text: string, error = false) {
  deviceToast.value = { text, error }
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { deviceToast.value = null }, error ? 4000 : 2500)
}
watch(() => ui.toasts.length, (length, previous) => {
  if (length <= previous) return
  const toast = ui.toasts[length - 1]
  flash(toast.text && toast.type === 'error' ? toast.text : toast.title, toast.type === 'error')
})

/* ---------- Login ---------- */
function chooseUser(entry: User) {
  user.value = entry
  pin.value = ''
  step.value = 'pin'
}

function press(digit: string) {
  if (pin.value.length >= 4) return
  pin.value += digit
  if (pin.value.length === 4) setTimeout(checkPin, 150)
}

function checkPin() {
  if (!user.value) return
  if (pin.value !== user.value.pin) {
    pin.value = ''
    return flash('PIN incorreto. Tente novamente.', true)
  }
  const single: Partial<Record<Role, string>> = { Almoxarifado: 'alm', Qualidade: 'qual', Expedição: 'exp', Manutenção: '' }
  if (user.value.role in single) {
    stationId.value = single[user.value.role] ?? ''
    step.value = 'queue'
  } else {
    step.value = 'station'
  }
  flash(`Olá, ${user.value.name.split(' ')[0]}!`)
}

function chooseStation(resource: Resource) {
  stationId.value = resource.id
  step.value = 'queue'
}

function logout() {
  user.value = null
  stationId.value = ''
  selected.value = null
  focusId.value = ''
  sheet.value = null
  step.value = 'login'
}

function back() {
  sheet.value = null
  if (step.value === 'work') {
    selected.value = null
    focusId.value = ''
    step.value = 'queue'
  } else if (step.value === 'queue' && stations.value.length) {
    step.value = 'station'
  } else {
    logout()
  }
}

/* ---------- Postos produtivos ---------- */
const ORDER: Record<string, number> = { 'Em execução': 0, Pausada: 1, Disponível: 2 }
const entries = computed(() => store.state.productionOrders.flatMap(op => op.operations.map(operation => ({ op, operation })))
  .filter(entry => entry.operation.resourceId === stationId.value && entry.op.status !== 'Concluída'))
const queue = computed(() => entries.value
  .filter(({ op, operation }) => ['Liberada', 'Em produção'].includes(op.status) && operation.status in ORDER)
  .sort((a, b) => ORDER[a.operation.status] - ORDER[b.operation.status] || a.op.scheduledDate.localeCompare(b.op.scheduledDate)))
const upcoming = computed(() => entries.value.filter(entry => !queue.value.includes(entry) && entry.operation.status !== 'Concluída' && entry.op.status !== 'Inspeção'))
const waitingReason = (op: ProductionOrder) => op.status === 'Aguardando material' ? 'Aguardando material' : op.status === 'Planejada' ? 'Aguardando separação do kit' : 'Aguardando etapa anterior'

const current = computed(() => {
  if (!selected.value) return undefined
  const op = store.state.productionOrders.find(entry => entry.id === selected.value!.opId)
  const operation = op?.operations.find(entry => entry.id === selected.value!.operationId)
  return op && operation ? { op, operation } : undefined
})
const blocked = computed(() => current.value ? openCorrective(store.state, current.value.operation.resourceId) : undefined)
const limit = computed(() => {
  if (!current.value) return 0
  const { op, operation } = current.value
  if (operation.name === 'Retrabalho') return op.quantity
  const previous = op.operations[op.operations.indexOf(operation) - 1]
  return previous ? previous.good : Math.ceil(op.quantity * 1.05)
})
const firstPiecePending = computed(() => !!current.value?.operation.firstPiece && !current.value.operation.firstPieceAt)
const remaining = computed(() => {
  const done = current.value?.operation.good ?? 0
  return Math.max(0, firstPiecePending.value ? 1 - done : limit.value - done)
})
const part = computed(() => current.value ? store.item(current.value.op.itemId) : undefined)
const revisionCode = (revisionId?: string) => store.state.productRevisions.find(revision => revision.id === revisionId)?.code
const toolSummary = computed(() => {
  if (!current.value?.operation.toolId || !part.value) return ''
  const tool = store.state.items.find(item => item.id === current.value!.operation.toolId)
  if (current.value.op.kind !== 'Injeção') return tool?.name ?? ''
  const setup = injectionSetup(store.state, part.value)
  return `${tool?.name ?? ''} · ciclo ${setup.cycleSeconds} s · ${setup.cavities} cav.`
})
/** Documentos marcados para a OP, da versão com que a OP nasceu ou sem versão. */
const opDocuments = computed(() => {
  if (!current.value || !part.value) return []
  const code = revisionCode(current.value.op.revisionId)
  return (part.value.catalog?.media ?? []).filter(media => media.sendToOp && (!media.revisionCode || media.revisionCode === code))
})

function callQuality() {
  if (current.value && store.raiseAlert(stationId.value, operator(), `Primeira peça de ${current.value.op.id} aguardando liberação`)) flash('Qualidade chamada')
}

function openOperation(op: ProductionOrder, operation: Operation) {
  selected.value = { opId: op.id, operationId: operation.id }
  step.value = 'work'
}

const operator = () => user.value?.name ?? 'Operador'

function start() {
  if (current.value) store.startOperation(current.value.op.id, current.value.operation.id, operator())
}

function openReport() {
  report.value = { good: 0, scrap: 0, reason: '' }
  sheet.value = 'report'
}

function confirmReport() {
  if (!current.value) return
  if (store.reportProduction(current.value.op.id, current.value.operation.id, report.value.good, report.value.scrap, report.value.reason, operator())) sheet.value = null
}

function confirmPause() {
  if (!current.value || !pauseReason.value) return
  if (store.pauseOperation(current.value.op.id, current.value.operation.id, pauseReason.value, operator())) sheet.value = null
}

function finish() {
  if (!current.value) return
  const { op, operation } = current.value
  if (store.finishOperation(op.id, operation.id, operator())) {
    selected.value = null
    step.value = 'queue'
  }
}

function callLeader(message: string) {
  if (store.raiseAlert(stationId.value || 'alm', operator(), message)) sheet.value = null
}

const bump = (field: 'good' | 'scrap', delta: number) => { report.value[field] = Math.max(0, report.value[field] + delta) }

/* ---------- Almoxarifado ---------- */
const pickList = computed(() => store.state.productionOrders.filter(op => op.status === 'Planejada').sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)))
const receiving = computed(() => store.state.requisitions.filter(req => req.status === 'Pedido emitido'))
const pickOp = computed(() => store.state.productionOrders.find(op => op.id === focusId.value))

function openPick(op: ProductionOrder) {
  focusId.value = op.id
  scanned.value = []
  step.value = 'work'
}

function toggleScan(itemId: string) {
  scanned.value = scanned.value.includes(itemId) ? scanned.value.filter(entry => entry !== itemId) : [...scanned.value, itemId]
}

function deliverKit() {
  if (pickOp.value && store.pickOp(pickOp.value.id, operator())) back()
}

/* ---------- Qualidade ---------- */
const inspections = computed(() => store.state.productionOrders.filter(op => op.status === 'Inspeção'))
const firstPieces = computed(() => store.state.productionOrders.flatMap(op => op.operations
  .filter(operation => operation.firstPiece && !operation.firstPieceAt && operation.good >= 1)
  .map(operation => ({ op, operation }))))
const inspectionOp = computed(() => store.state.productionOrders.find(op => op.id === focusId.value && op.status === 'Inspeção'))

function openInspection(op: ProductionOrder) {
  focusId.value = op.id
  qualityChecks.value = QUALITY_CHECKS.map(() => false)
  step.value = 'work'
}

function approve() {
  if (inspectionOp.value && store.approveInspection(inspectionOp.value.id, operator())) back()
}

function confirmReject() {
  if (inspectionOp.value && store.rejectInspection(inspectionOp.value.id, rejectForm.value.quantity, rejectForm.value.reason, operator())) {
    sheet.value = null
    back()
  }
}

/* ---------- Expedição ---------- */
const shipments = computed(() => store.state.salesOrders.filter(order => order.shipment && order.shipment.status !== 'Faturado'))
const shipOrder = computed(() => store.state.salesOrders.find(order => order.id === focusId.value))

function openShipment(orderId: string, quantity: number) {
  focusId.value = orderId
  shipForm.value = { volumes: Math.ceil(quantity / 12), carrier: CARRIERS[0] }
  step.value = 'work'
}

function confirmConference() {
  if (shipOrder.value) store.confirmShipment(shipOrder.value.id, shipForm.value.volumes, shipForm.value.carrier, operator())
}

function dispatch() {
  if (!shipOrder.value) return
  store.shipOrder(shipOrder.value.id, operator())
  back()
}

/* ---------- Manutenção ---------- */
const maintenance = computed(() => store.state.maintenanceOrders.filter(order => order.status !== 'Concluída'))
const assetName = (id: string) => store.state.assets.find(asset => asset.id === id)?.name ?? id

/* ---------- Painéis laterais ---------- */
const guideIndex = computed(() => ({ login: 0, pin: 0, station: 1, queue: 2, work: 3 })[step.value])
const tip = computed(() => {
  if (step.value === 'login') return 'Cada pessoa entra com o próprio nome e PIN. Assim todo apontamento fica registrado com o responsável, sem papel.'
  if (step.value === 'pin') return `Digite o PIN de ${user.value?.name}. Na demonstração, o PIN aparece na lista abaixo.`
  if (step.value === 'station') return 'O operador escolhe o posto onde está trabalhando. O tablet mostra somente a fila daquele posto.'
  if (step.value === 'queue') return 'A fila segue a programação do PCP. Operações liberadas ficam no topo; as próximas mostram por que ainda não podem começar.'
  return 'Botões grandes para luvas e pouca digitação. Cada toque atualiza os painéis de gestão em tempo real (veja à direita).'
})
const liveResources = computed(() => store.state.resources.filter(resource => ['Injetora', 'Montagem'].includes(resource.kind)))
const liveEvents = computed(() => store.state.events.slice(0, 14))
const openAlerts = computed(() => store.state.alerts.filter(alert => !alert.resolved))
</script>

<template>
  <div class="tablet-page">
    <aside class="tablet-side" data-tour="tablet-guide">
      <RouterLink to="/" class="back-link"><ArrowLeft :size="15" /> Voltar ao início</RouterLink>
      <span class="eyebrow" style="display:block; margin-top:18px">Simulador do tablet</span>
      <h1>Chão de fábrica</h1>
      <p>{{ tip }}</p>
      <div class="side-card">
        <h3>Roteiro para testar</h3>
        <ol class="guide-steps">
          <li :class="{ done: guideIndex > 0 }">Toque no seu nome e digite o PIN</li>
          <li :class="{ done: guideIndex > 1 }">Escolha o posto (ex.: Injetora 02 ou Célula 1)</li>
          <li :class="{ done: guideIndex > 2 }">Selecione uma tarefa da fila</li>
          <li :class="{ done: false }">Inicie, aponte peças, pause com motivo ou conclua</li>
          <li>Veja o efeito no painel ao lado e nas telas de gestão</li>
        </ol>
      </div>
      <div class="side-card">
        <h3>PINs da demonstração</h3>
        <div v-for="entry in users" :key="entry.id" class="guide-steps" style="display:flex; justify-content:space-between; font-size:12.5px; padding:3px 0; color:#D6E4F5">
          <span>{{ entry.name }} <small style="color:#A9BDD4">· {{ entry.role }}</small></span><b style="color:#00CCFF">{{ entry.pin }}</b>
        </div>
      </div>
    </aside>

    <div class="device" data-tour="tablet-device">
      <div class="screen">
        <header class="t-bar">
          <div class="t-user">
            <button v-if="step !== 'login'" class="icon-button" style="background:transparent; color:white; border-color:rgba(255,255,255,.2)" aria-label="Voltar" @click="back"><ArrowLeft :size="18" /></button>
            <div><strong>{{ station?.name ?? (user?.role === 'Manutenção' ? 'Manutenção' : 'Thalamus · Chão de fábrica') }}</strong><small style="display:block">{{ user ? `${user.name} · ${user.role}` : 'Toque no seu nome para entrar' }}</small></div>
          </div>
          <div class="t-user">
            <small>{{ fmtTime(new Date(ui.tick).toISOString()) }}</small>
            <button v-if="user" class="icon-button" style="background:transparent; color:white; border-color:rgba(255,255,255,.2)" aria-label="Sair" @click="logout"><LogOut :size="17" /></button>
          </div>
        </header>

        <div class="t-body">
          <!-- Login -->
          <template v-if="step === 'login'">
            <p class="t-title">Quem está trabalhando?</p>
            <p class="t-sub">Toque no seu nome</p>
            <div class="t-grid">
              <button v-for="entry in users" :key="entry.id" class="t-tile" @click="chooseUser(entry)">
                <span class="t-avatar">{{ initials(entry.name) }}</span>
                <div><strong>{{ entry.name }}</strong><span>{{ entry.role }} · {{ entry.shift }}</span></div>
              </button>
            </div>
          </template>

          <!-- PIN -->
          <template v-else-if="step === 'pin'">
            <p class="t-title" style="text-align:center">Olá, {{ user?.name.split(' ')[0] }}</p>
            <p class="t-sub" style="text-align:center">Digite seu PIN de 4 dígitos</p>
            <div class="pin-dots"><i v-for="index in 4" :key="index" :class="{ on: pin.length >= index }"></i></div>
            <div class="keypad">
              <button v-for="digit in ['1', '2', '3', '4', '5', '6', '7', '8', '9']" :key="digit" @click="press(digit)">{{ digit }}</button>
              <button @click="logout"><ArrowLeft :size="20" /></button>
              <button @click="press('0')">0</button>
              <button aria-label="Apagar" @click="pin = pin.slice(0, -1)"><Delete :size="20" /></button>
            </div>
          </template>

          <!-- Escolha do posto -->
          <template v-else-if="step === 'station'">
            <p class="t-title">Onde você está hoje?</p>
            <p class="t-sub">Escolha o posto de trabalho</p>
            <div class="t-grid">
              <button v-for="resource in stations" :key="resource.id" class="t-tile" @click="chooseStation(resource)">
                <div><strong>{{ resource.name }}</strong><span>{{ resource.kind }}</span></div>
                <span class="status" :class="store.machineState(resource.id) === 'Produzindo' ? 'success' : store.machineState(resource.id) === 'Livre' ? 'neutral' : store.machineState(resource.id) === 'Parada' ? 'warning' : 'danger'">{{ store.machineState(resource.id) }}</span>
              </button>
            </div>
          </template>

          <!-- Fila: injeção e montagem -->
          <template v-else-if="step === 'queue' && (stationKind === 'Injetora' || stationKind === 'Montagem')">
            <p class="t-title">Minha fila</p>
            <p class="t-sub">{{ queue.length }} tarefa(s) liberada(s) neste posto</p>
            <button v-for="entry in queue" :key="entry.operation.id" class="t-list-item" @click="openOperation(entry.op, entry.operation)">
              <div><strong>{{ entry.operation.name }} · {{ store.itemLabel(entry.op.itemId) }}</strong><span>{{ entry.op.id }} · pedido {{ entry.op.salesOrderId }} · {{ entry.operation.good }}/{{ entry.op.quantity }} un. · entrega {{ fmtDate(entry.op.dueDate) }}</span></div>
              <span class="status" :class="entry.operation.status === 'Em execução' ? 'info' : entry.operation.status === 'Pausada' ? 'warning' : 'success'">{{ entry.operation.status === 'Disponível' ? 'Pronta para iniciar' : entry.operation.status }}</span>
            </button>
            <div v-if="!queue.length" class="t-empty"><strong>Nenhuma tarefa liberada</strong>Quando o almoxarifado entregar o kit ou a etapa anterior terminar, a tarefa aparece aqui.</div>
            <template v-if="upcoming.length">
              <p class="counter-label" style="margin-top:14px">Próximas</p>
              <div v-for="entry in upcoming" :key="entry.operation.id" class="t-list-item" style="opacity:.6">
                <div><strong>{{ entry.operation.name }} · {{ store.itemLabel(entry.op.itemId) }}</strong><span>{{ entry.op.id }} · {{ entry.op.quantity }} un.</span></div>
                <span class="status neutral">{{ waitingReason(entry.op) }}</span>
              </div>
            </template>
            <button class="t-btn light small" style="width:100%; margin-top:10px" @click="sheet = 'alert'"><BellRing :size="18" /> Chamar líder</button>
          </template>

          <!-- Execução da operação -->
          <template v-else-if="step === 'work' && current">
            <div class="t-hero" :class="{ paused: current.operation.status === 'Pausada', blocked: !!blocked }">
              <div>
                <small>{{ current.op.id }} · pedido {{ current.op.salesOrderId }}</small>
                <h2>{{ current.operation.name }}</h2>
                <small>{{ store.itemLabel(current.op.itemId) }}<template v-if="current.op.revisionId"> · revisão {{ revisionCode(current.op.revisionId) }}</template><template v-if="toolSummary"> · {{ toolSummary }}</template></small>
              </div>
              <div class="t-timer">{{ fmtDuration(elapsedMs(current.operation, ui.tick)) }}<small>{{ blocked ? 'Máquina em manutenção' : current.operation.status === 'Pausada' ? `Parada: ${current.operation.pauseReason}` : current.operation.status === 'Em execução' ? 'Em execução' : 'Pronta para iniciar' }}</small></div>
            </div>
            <div class="t-progress">
              <div><b>{{ current.operation.good }}</b><span>peças boas</span></div>
              <div><b>{{ current.operation.scrap }}</b><span>refugo</span></div>
              <div><b>{{ current.op.quantity }}</b><span>meta da OP · faltam {{ Math.max(0, current.op.quantity - current.operation.good) }}</span></div>
            </div>
            <div v-if="current.operation.status === 'Disponível'" class="t-actions" style="grid-template-columns:1fr">
              <button class="t-btn start" :disabled="!!blocked" @click="start"><Play :size="22" /> Iniciar operação</button>
            </div>
            <div v-else class="t-actions">
              <button v-if="current.operation.status === 'Em execução'" class="t-btn pause" @click="pauseReason = ''; sheet = 'pause'"><Pause :size="22" /> Pausar</button>
              <button v-else class="t-btn start" :disabled="!!blocked" @click="start"><Play :size="22" /> Retomar</button>
              <button class="t-btn" @click="openReport"><Plus :size="22" /> Apontar peças</button>
              <button class="t-btn finish" @click="finish"><CheckCircle2 :size="22" /> Concluir</button>
            </div>
            <div v-if="current.operation.firstPiece" class="t-first-piece" :class="{ ok: !firstPiecePending }">
              <template v-if="firstPiecePending">
                <div><strong>Primeira peça</strong><span>{{ current.operation.good ? 'Aguardando a qualidade liberar. Depois disso o apontamento segue normal.' : 'Aponte 1 peça boa e chame a qualidade para liberar.' }}</span></div>
                <button v-if="current.operation.good" class="t-btn light small" @click="callQuality"><ShieldCheck :size="18" /> Chamar qualidade</button>
              </template>
              <div v-else><strong>Primeira peça liberada</strong><span>{{ current.operation.firstPieceBy }} · {{ fmtTime(current.operation.firstPieceAt!) }}</span></div>
            </div>
            <div class="instr">
              <b><ClipboardList :size="14" style="vertical-align:-2px" /> Instruções de trabalho</b>
              <ol><li v-for="line in current.operation.instructions" :key="line">{{ line }}</li></ol>
            </div>
            <div v-if="opDocuments.length" class="instr">
              <b><FileText :size="14" style="vertical-align:-2px" /> Documentos da OP</b>
              <ul><li v-for="media in opDocuments" :key="media.id">{{ media.kind }} · {{ media.name }}<template v-if="media.revisionCode"> · versão {{ media.revisionCode }}</template></li></ul>
            </div>
            <button class="t-btn light small" style="width:100%; margin-top:12px" @click="sheet = 'alert'"><BellRing :size="18" /> Chamar líder</button>
          </template>

          <!-- Almoxarifado -->
          <template v-else-if="step === 'queue' && stationKind === 'Almoxarifado'">
            <div class="t-grid two" style="margin-bottom:14px">
              <button class="t-reason" :class="{ on: almoxTab === 'separar' }" @click="almoxTab = 'separar'">Separar kits ({{ pickList.length }})</button>
              <button class="t-reason" :class="{ on: almoxTab === 'receber' }" @click="almoxTab = 'receber'">Receber compras ({{ receiving.length }})</button>
            </div>
            <template v-if="almoxTab === 'separar'">
              <button v-for="op in pickList" :key="op.id" class="t-list-item" @click="openPick(op)">
                <div><strong>{{ op.id }} · {{ store.itemLabel(op.itemId) }}</strong><span>{{ op.materials.length }} item(ns) · entregar em {{ store.resourceName(op.resourceId) }} · {{ fmtDate(op.scheduledDate) }}</span></div>
                <span class="status success">Separar</span>
              </button>
              <div v-if="!pickList.length" class="t-empty"><strong>Nenhum kit para separar</strong>OPs aparecem aqui quando todo o material estiver reservado.</div>
            </template>
            <template v-else>
              <div v-for="req in receiving" :key="req.id" class="t-list-item">
                <div><strong>{{ store.itemLabel(req.itemId) }}</strong><span>{{ req.omiePo }} · {{ req.quantity }} {{ store.item(req.itemId).unit }} · {{ req.supplier }}</span></div>
                <button class="t-btn small" @click="store.advanceRequisition(req.id, operator())"><Check :size="18" /> Recebido</button>
              </div>
              <div v-if="!receiving.length" class="t-empty"><strong>Nada a receber</strong>Pedidos de compra emitidos no Omie aparecem aqui.</div>
            </template>
          </template>

          <template v-else-if="step === 'work' && stationKind === 'Almoxarifado' && pickOp">
            <p class="t-title">Kit da {{ pickOp.id }}</p>
            <p class="t-sub">Bipe ou toque em cada item ao colocar no carrinho. Entregar em {{ store.resourceName(pickOp.resourceId) }}.</p>
            <button v-for="line in pickOp.materials" :key="line.itemId" class="t-list-item" :class="{ checked: scanned.includes(line.itemId) }" @click="toggleScan(line.itemId)">
              <div><strong>{{ store.itemLabel(line.itemId) }}</strong><span>{{ line.reserved }} {{ store.item(line.itemId).unit }} · local {{ store.item(line.itemId).location }}</span></div>
              <span class="t-check" :class="{ on: scanned.includes(line.itemId) }"><Check v-if="scanned.includes(line.itemId)" :size="18" /><ScanLine v-else :size="16" color="#919191" /></span>
            </button>
            <button class="t-btn start" style="width:100%; margin-top:8px" :disabled="scanned.length < pickOp.materials.length" @click="deliverKit"><Check :size="20" /> Entregar kit e liberar OP ({{ scanned.length }}/{{ pickOp.materials.length }})</button>
          </template>

          <!-- Qualidade -->
          <template v-else-if="step === 'queue' && stationKind === 'Qualidade'">
            <template v-if="firstPieces.length">
              <p class="t-title">Primeiras peças</p>
              <p class="t-sub">A produção espera a liberação para seguir</p>
              <div v-for="entry in firstPieces" :key="entry.operation.id" class="t-list-item">
                <div><strong>{{ entry.operation.name }} · {{ store.itemLabel(entry.op.itemId) }}</strong><span>{{ entry.op.id }} · {{ store.resourceName(entry.operation.resourceId) }} · feita por {{ entry.operation.operator }}</span></div>
                <button class="t-btn small start" @click="store.approveFirstPiece(entry.op.id, entry.operation.id, operator())"><ShieldCheck :size="18" /> Liberar</button>
              </div>
            </template>
            <p class="t-title" :style="firstPieces.length ? 'margin-top:16px' : ''">Lotes para inspecionar</p>
            <p class="t-sub">{{ inspections.length }} lote(s) aguardando</p>
            <button v-for="op in inspections" :key="op.id" class="t-list-item" @click="openInspection(op)">
              <div><strong>{{ op.id }} · {{ store.itemLabel(op.itemId) }}</strong><span>{{ op.quantity }} un. · pedido {{ op.salesOrderId }}</span></div>
              <span class="status warning">Inspecionar</span>
            </button>
            <div v-if="!inspections.length" class="t-empty"><strong>Nenhum lote aguardando</strong>Lotes chegam quando a montagem conclui a última etapa.</div>
          </template>

          <template v-else-if="step === 'work' && stationKind === 'Qualidade' && inspectionOp">
            <p class="t-title">Inspeção {{ inspectionOp.id }}</p>
            <p class="t-sub">{{ store.itemLabel(inspectionOp.itemId) }} · {{ inspectionOp.quantity }} un.</p>
            <button v-for="(check, index) in QUALITY_CHECKS" :key="check" class="t-list-item" :class="{ checked: qualityChecks[index] }" @click="qualityChecks[index] = !qualityChecks[index]">
              <strong>{{ check }}</strong><span class="t-check" :class="{ on: qualityChecks[index] }"><Check v-if="qualityChecks[index]" :size="18" /></span>
            </button>
            <div class="t-actions" style="grid-template-columns:1fr 1fr; margin-top:6px">
              <button class="t-btn danger" @click="rejectForm = { quantity: 1, reason: SCRAP_REASONS[3] }; sheet = 'reject'"><ShieldX :size="20" /> Reprovar</button>
              <button class="t-btn start" :disabled="!qualityChecks.every(Boolean)" @click="approve"><ShieldCheck :size="20" /> Aprovar lote</button>
            </div>
          </template>

          <!-- Expedição -->
          <template v-else-if="step === 'queue' && stationKind === 'Expedição'">
            <p class="t-title">Cargas do dia</p>
            <p class="t-sub">Confira os volumes antes de carregar</p>
            <button v-for="order in shipments" :key="order.id" class="t-list-item" :disabled="order.shipment!.status === 'Expedido'" @click="openShipment(order.id, order.quantity)">
              <div><strong>{{ order.id }} · {{ store.customerName(order.customerId) }}</strong><span>{{ store.itemLabel(order.itemId) }} · {{ order.quantity }} un.</span></div>
              <span class="status" :class="order.shipment!.status === 'Conferido' ? 'success' : order.shipment!.status === 'Expedido' ? 'info' : 'warning'">{{ order.shipment!.status === 'Expedido' ? 'Aguardando NF-e' : order.shipment!.status }}</span>
            </button>
            <div v-if="!shipments.length" class="t-empty"><strong>Nenhuma carga pendente</strong>Pedidos aprovados pela qualidade aparecem aqui.</div>
          </template>

          <template v-else-if="step === 'work' && stationKind === 'Expedição' && shipOrder?.shipment">
            <p class="t-title">{{ shipOrder.id }} · {{ store.customerName(shipOrder.customerId) }}</p>
            <p class="t-sub">{{ store.itemLabel(shipOrder.itemId) }} · {{ shipOrder.quantity }} un.</p>
            <template v-if="shipOrder.shipment.status === 'Aguardando conferência'">
              <p class="counter-label">Volumes conferidos</p>
              <div class="counter-box"><button @click="shipForm.volumes = Math.max(1, shipForm.volumes - 1)">−</button><b>{{ shipForm.volumes }}</b><button @click="shipForm.volumes++">+</button></div>
              <p class="counter-label" style="margin-top:12px">Transportadora</p>
              <div class="t-grid four"><button v-for="carrier in CARRIERS" :key="carrier" class="t-reason" :class="{ on: shipForm.carrier === carrier }" @click="shipForm.carrier = carrier">{{ carrier }}</button></div>
              <button class="t-btn start" style="width:100%; margin-top:14px" @click="confirmConference"><Check :size="20" /> Confirmar conferência</button>
            </template>
            <template v-else-if="shipOrder.shipment.status === 'Conferido'">
              <div class="t-progress" style="grid-template-columns:1fr 1fr"><div><b>{{ shipOrder.shipment.volumes }}</b><span>volumes</span></div><div><b style="font-size:20px">{{ shipOrder.shipment.carrier }}</b><span>transportadora</span></div></div>
              <button class="t-btn finish" style="width:100%" @click="dispatch"><Truck :size="20" /> Carregar e expedir (solicita NF-e no Omie)</button>
            </template>
            <div v-else class="t-empty"><strong>{{ shipOrder.shipment.status }}</strong>{{ shipOrder.shipment.invoice ?? 'Aguardando NF-e do Omie' }}</div>
          </template>

          <!-- Manutenção -->
          <template v-else-if="step === 'queue' && stationKind === 'Manutenção'">
            <p class="t-title">Ordens de manutenção</p>
            <p class="t-sub">Corretivas abertas pelos operadores aparecem aqui na hora</p>
            <div v-for="order in maintenance" :key="order.id" class="t-list-item">
              <div><strong><Wrench :size="15" style="vertical-align:-2px" /> {{ order.id }} · {{ assetName(order.assetId) }}</strong><span>{{ order.type }} · {{ order.description }}</span></div>
              <button class="t-btn small" :class="order.status === 'Aberta' ? 'start' : 'finish'" @click="store.advanceMaintenance(order.id, operator())">{{ order.status === 'Aberta' ? 'Iniciar' : 'Liberar máquina' }}</button>
            </div>
            <div v-if="!maintenance.length" class="t-empty"><strong>Nenhuma OS aberta</strong>Tudo funcionando.</div>
          </template>

          <div v-else class="t-empty"><strong>Tarefa concluída</strong><button class="t-btn light small" style="margin:12px auto 0" @click="back">Voltar para a fila</button></div>
        </div>

        <!-- Folhas de ação -->
        <div v-if="sheet" class="t-sheet-backdrop" @click.self="sheet = null">
          <div class="t-sheet">
            <template v-if="sheet === 'report' && current">
              <h3>Apontar produção</h3>
              <p>{{ current.operation.name }} · até {{ remaining }} peça(s) disponíveis para esta etapa</p>
              <div class="t-grid two">
                <div>
                  <p class="counter-label">Peças boas</p>
                  <div class="counter-box"><button @click="bump('good', -1)">−</button><b>{{ report.good }}</b><button @click="bump('good', 1)">+</button></div>
                  <div class="quick-add"><button @click="bump('good', 5)">+5</button><button @click="bump('good', 10)">+10</button><button @click="bump('good', 50)">+50</button><button @click="report.good = remaining">Tudo</button></div>
                </div>
                <div>
                  <p class="counter-label">Refugo</p>
                  <div class="counter-box"><button @click="bump('scrap', -1)">−</button><b>{{ report.scrap }}</b><button @click="bump('scrap', 1)">+</button></div>
                  <div class="quick-add"><button @click="bump('scrap', 5)">+5</button><button @click="report.scrap = 0">Zerar</button></div>
                </div>
              </div>
              <template v-if="report.scrap > 0">
                <p class="counter-label" style="margin-top:12px">Motivo do refugo</p>
                <div class="t-grid"><button v-for="reason in SCRAP_REASONS" :key="reason" class="t-reason" :class="{ on: report.reason === reason }" @click="report.reason = reason">{{ reason }}</button></div>
              </template>
              <div class="t-actions" style="grid-template-columns:1fr 2fr; margin-top:14px">
                <button class="t-btn light" @click="sheet = null">Cancelar</button>
                <button class="t-btn start" :disabled="report.good + report.scrap === 0 || (report.scrap > 0 && !report.reason)" @click="confirmReport"><Check :size="20" /> Registrar</button>
              </div>
            </template>

            <template v-else-if="sheet === 'pause'">
              <h3>Por que a operação vai parar?</h3>
              <p>O motivo alimenta os indicadores de paradas. Quebra de máquina abre manutenção automaticamente.</p>
              <div class="t-grid">
                <button v-for="reason in PAUSE_REASONS" :key="reason" class="t-reason" :class="{ on: pauseReason === reason, alert: reason === 'Quebra de máquina' }" @click="pauseReason = reason">{{ reason }}</button>
              </div>
              <div class="t-actions" style="grid-template-columns:1fr 2fr; margin-top:14px">
                <button class="t-btn light" @click="sheet = null">Cancelar</button>
                <button class="t-btn pause" :disabled="!pauseReason" @click="confirmPause"><Pause :size="20" /> Registrar parada</button>
              </div>
            </template>

            <template v-else-if="sheet === 'alert'">
              <h3>Chamar o líder</h3>
              <p>O chamado aparece no sino do líder de produção, com o posto e o seu nome.</p>
              <div class="t-grid two"><button v-for="message in ALERTS" :key="message" class="t-reason" @click="callLeader(message)">{{ message }}</button></div>
              <button class="t-btn light small" style="width:100%; margin-top:12px" @click="sheet = null">Cancelar</button>
            </template>

            <template v-else-if="sheet === 'reject' && inspectionOp">
              <h3>Reprovar {{ inspectionOp.id }}</h3>
              <p>As unidades reprovadas voltam para a montagem como retrabalho e uma NC é aberta.</p>
              <p class="counter-label">Unidades reprovadas</p>
              <div class="counter-box"><button @click="rejectForm.quantity = Math.max(1, rejectForm.quantity - 1)">−</button><b>{{ rejectForm.quantity }}</b><button @click="rejectForm.quantity = Math.min(inspectionOp.quantity, rejectForm.quantity + 1)">+</button></div>
              <p class="counter-label" style="margin-top:12px">Defeito</p>
              <div class="t-grid"><button v-for="reason in SCRAP_REASONS" :key="reason" class="t-reason" :class="{ on: rejectForm.reason === reason }" @click="rejectForm.reason = reason">{{ reason }}</button></div>
              <div class="t-actions" style="grid-template-columns:1fr 2fr; margin-top:14px">
                <button class="t-btn light" @click="sheet = null">Cancelar</button>
                <button class="t-btn danger" @click="confirmReject"><ShieldX :size="20" /> Reprovar e abrir NC</button>
              </div>
            </template>
          </div>
        </div>

        <div v-if="deviceToast" class="t-toast" :class="{ error: deviceToast.error }">{{ deviceToast.text }}</div>
      </div>
    </div>

    <aside class="tablet-side" data-tour="tablet-live">
      <span class="eyebrow">Ao vivo na gestão</span>
      <h1 style="font-size:18px">O que o gestor vê</h1>
      <div class="side-card" style="margin-top:10px">
        <h3>Postos</h3>
        <div class="live-machines">
          <div v-for="resource in liveResources" :key="resource.id" :class="store.machineState(resource.id)"><b>{{ resource.name.split('·')[0] }}</b>{{ store.machineState(resource.id) }}</div>
        </div>
      </div>
      <div v-if="openAlerts.length" class="side-card">
        <h3>Chamados abertos ({{ openAlerts.length }})</h3>
        <div v-for="alert in openAlerts" :key="alert.id" class="live-item"><i style="background:#f28a45"></i><div><strong>{{ alert.message }}</strong><span>{{ store.resourceName(alert.resourceId) }} · {{ alert.operator }}</span></div></div>
      </div>
      <div class="side-card">
        <h3>Últimos registros</h3>
        <div class="live-feed">
          <div v-for="event in liveEvents" :key="event.id" class="live-item"><i></i><div><strong>{{ event.text }}</strong><span>{{ fmtTime(event.at) }} · {{ event.actor }} · {{ event.module }}</span></div></div>
        </div>
      </div>
    </aside>
  </div>
</template>
