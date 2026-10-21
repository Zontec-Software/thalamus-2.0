<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarClock, CircleHelp, ClipboardList, Truck, X } from 'lucide-vue-next'
import StatusBadge from './StatusBadge.vue'
import { FLOW_STAGES, opProgress } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { ORDER_DRAWER_TOUR } from '../tour/steps'
import { fmtCurrency, fmtDate, fmtDateTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const order = computed(() => store.state.salesOrders.find(entry => entry.id === ui.orderDrawer))
const stage = computed(() => order.value ? store.stage(order.value) : 'Entrada')
const stageIndex = computed(() => FLOW_STAGES.indexOf(stage.value))
const ops = computed(() => order.value ? store.opsOf(order.value.id) : [])
const injectionOps = computed(() => ops.value.filter(op => op.kind === 'Injeção'))
const assemblyOps = computed(() => ops.value.filter(op => op.kind === 'Montagem'))
const requisitions = computed(() => order.value ? store.state.requisitions.filter(req => req.origin.startsWith(order.value!.id)) : [])

function go(path: string) {
  ui.orderDrawer = null
  router.push(path)
}

function explain() {
  ui.startTour('order-drawer', ORDER_DRAWER_TOUR)
}

watch(order, async value => {
  if (!value || ui.tourSteps.length || ui.seenTours.includes('order-drawer')) return
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 450))
  if (!order.value || ui.tourSteps.length || ui.seenTours.includes('order-drawer')) return
  if (!injectionOps.value.length && !assemblyOps.value.length) return
  explain()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="order" class="drawer-backdrop" @click.self="ui.orderDrawer = null">
        <aside class="drawer">
          <header class="drawer-header">
            <div>
              <span class="eyebrow">Pedido de venda · {{ order.omieId }}</span>
              <h2>{{ order.id }}</h2>
              <p>{{ store.customerName(order.customerId) }} · {{ store.itemLabel(order.itemId) }}</p>
            </div>
            <div class="filter-row">
              <button v-if="ops.length" class="button secondary small" @click="explain"><CircleHelp :size="14" /> Como ler</button>
              <button class="icon-plain" @click="ui.orderDrawer = null"><X :size="18" /></button>
            </div>
          </header>

          <div class="drawer-body">
            <div class="stage-stepper" data-tour="drawer-stages">
              <div v-for="(name, index) in FLOW_STAGES" :key="name" class="stage-step" :class="{ done: index < stageIndex, current: index === stageIndex }">
                <i></i><span>{{ name }}</span>
              </div>
            </div>

            <div class="mini-stats four">
              <div class="mini-stat"><strong>{{ order.quantity }}</strong><span>unidades</span></div>
              <div class="mini-stat"><strong>{{ fmtDate(order.promisedDate) }}</strong><span>entrega prometida</span></div>
              <div class="mini-stat"><strong>{{ store.progress(order) }}%</strong><span>progresso</span></div>
              <div class="mini-stat"><strong>{{ fmtCurrency(order.value) }}</strong><span>valor</span></div>
            </div>

            <div v-if="store.risks(order).length" class="risk-row">
              <span v-for="risk in store.risks(order)" :key="risk" class="status danger">{{ risk }}</span>
            </div>

            <div class="drawer-actions">
              <button v-if="stage === 'Entrada'" class="button" @click="store.planOrder(order.id)"><ClipboardList :size="15" /> Planejar produção</button>
              <button v-if="order.shipment && order.shipment.status !== 'Faturado'" class="button" @click="go('/expedicao')"><Truck :size="15" /> Ir para expedição</button>
              <button class="button secondary" @click="go('/fluxo')"><CalendarClock :size="15" /> Ver no fluxo</button>
            </div>

            <h3 class="drawer-title">Ordens de produção deste pedido</h3>
            <p v-if="!ops.length" class="empty-note">Ainda não planejado. Ao planejar, cada peça plástica em falta vira uma OP de injeção e o case vira a OP de montagem.</p>
            <template v-else>
              <div data-tour="drawer-injection">
                <div class="op-kind inj">
                  <strong>Injeção · a peça plástica</strong>
                  <span>Feita na injetora. Quando termina, a peça entra no estoque e a montagem pode usar.</span>
                </div>
                <p v-if="!injectionOps.length" class="empty-note">Nenhuma OP de injeção. As peças deste pedido já estavam no estoque.</p>
                <button v-for="op in injectionOps" :key="op.id" class="list-row inj" @click="ui.opDrawer = op.id">
                  <div><span class="kind-tag inj">OP de injeção</span><strong>{{ op.id }} · {{ store.itemLabel(op.itemId) }}</strong><span>{{ op.quantity }} un. · {{ store.resourceName(op.resourceId) }}</span></div>
                  <div class="row-end"><div class="progress"><span :style="{ width: `${opProgress(op)}%` }"></span></div><StatusBadge :value="op.status" /></div>
                </button>
              </div>

              <div data-tour="drawer-assembly">
                <div class="op-kind mont">
                  <strong>Montagem · o case do cliente</strong>
                  <span>Junta as peças injetadas e os componentes no produto que será expedido.</span>
                </div>
                <button v-for="op in assemblyOps" :key="op.id" class="list-row mont" @click="ui.opDrawer = op.id">
                  <div><span class="kind-tag mont">OP de montagem</span><strong>{{ op.id }} · {{ store.itemLabel(op.itemId) }}</strong><span>{{ op.quantity }} un. · {{ store.resourceName(op.resourceId) }}</span></div>
                  <div class="row-end"><div class="progress"><span :style="{ width: `${opProgress(op)}%` }"></span></div><StatusBadge :value="op.status" /></div>
                </button>
              </div>
            </template>

            <template v-if="requisitions.length">
              <h3 class="drawer-title">Compras vinculadas</h3>
              <div v-for="req in requisitions" :key="req.id" class="list-row static">
                <div><strong>{{ req.id }} · {{ store.itemLabel(req.itemId) }}</strong><span>{{ req.quantity }} {{ store.item(req.itemId).unit }} · {{ req.supplier }} · necessário até {{ fmtDate(req.neededBy) }}</span></div>
                <StatusBadge :value="req.status" />
              </div>
            </template>

            <template v-if="order.shipment">
              <h3 class="drawer-title">Expedição e faturamento</h3>
              <div class="list-row static">
                <div><strong>{{ order.shipment.volumes }} volume(s) · {{ order.shipment.carrier }}</strong><span>{{ order.shipment.invoice ?? 'NF-e ainda não emitida' }}</span></div>
                <StatusBadge :value="order.shipment.status" />
              </div>
            </template>

            <h3 class="drawer-title">Linha do tempo</h3>
            <ol class="timeline">
              <li v-for="event in store.eventsOf(order.id)" :key="event.id">
                <i></i>
                <div><strong>{{ event.text }}</strong><span>{{ fmtDateTime(event.at) }} · {{ event.module }} · {{ event.actor }}</span></div>
              </li>
              <li><i></i><div><strong>Pedido aprovado no Omie</strong><span>{{ fmtDateTime(order.receivedAt || new Date().toISOString()) }} · Comercial</span></div></li>
            </ol>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
