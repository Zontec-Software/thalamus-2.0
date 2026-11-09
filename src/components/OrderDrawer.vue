<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Ban, CalendarClock, CheckCircle2, CircleHelp, ClipboardList, PackageCheck, Truck, X } from 'lucide-vue-next'
import StatusBadge from './StatusBadge.vue'
import { FLOW_STAGES, opProgress, salesOrderStatus } from '../domain/engine'
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
const status = computed(() => order.value ? salesOrderStatus(store.state, order.value) : 'Confirmado')
const editable = computed(() => !!order.value && !order.value.planned && !order.value.shipment && !order.value.cancelledAt)
const edits = ref<Record<number, { quantity: number; unitPrice: number }>>({})
const changeReason = ref('')
const cancelling = ref(false)
const cancelReason = ref('')
const receiver = ref('')
watch(() => ui.orderDrawer, () => {
  edits.value = {}
  changeReason.value = ''
  cancelling.value = false
  cancelReason.value = ''
  receiver.value = ''
})
function editLine(index: number) {
  const line = order.value?.lines?.[index]
  if (line) edits.value[index] = { quantity: line.quantity, unitPrice: line.unitPrice }
}
function saveLine(index: number) {
  if (!order.value) return
  if (store.changeSalesOrderLine(order.value.id, index, { ...edits.value[index] }, changeReason.value)) {
    delete edits.value[index]
    changeReason.value = ''
  }
}
function cancelOrder() {
  if (order.value && store.cancelSalesOrder(order.value.id, cancelReason.value)) cancelling.value = false
}
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
              <span class="eyebrow">Pedido de venda · {{ order.omieId ?? (status === 'Aguardando análise' ? 'vai ao Omie na confirmação' : 'só no Thalamus') }}</span>
              <h2>{{ order.id }} <StatusBadge :value="status" /></h2>
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

            <div v-if="order.cancelledAt" class="notice danger">Cancelado: {{ order.cancelReason }}</div>
            <div v-else-if="status === 'Aguardando análise'" class="notice warning">Nasceu da proposta {{ order.proposalId ?? '' }}. Confira itens, preço e prazo; ao confirmar, o pedido segue para o PCP e para o Omie, se a empresa usa o Omie.</div>

            <div class="drawer-actions">
              <button v-if="status === 'Aguardando análise'" class="button" @click="store.confirmSalesOrder(order.id)"><CheckCircle2 :size="15" /> Confirmar pedido</button>
              <button v-if="stage === 'Entrada' && status === 'Confirmado'" class="button" @click="store.planOrder(order.id)"><ClipboardList :size="15" /> Planejar produção</button>
              <button v-if="editable" class="button secondary" @click="cancelling = !cancelling"><Ban :size="15" /> Cancelar pedido</button>
              <button v-if="order.shipment && order.shipment.status !== 'Faturado'" class="button" @click="go('/expedicao')"><Truck :size="15" /> Ir para expedição</button>
              <button class="button secondary" @click="go('/fluxo')"><CalendarClock :size="15" /> Ver no fluxo</button>
            </div>

            <div v-if="cancelling" class="inline-form row">
              <input v-model="cancelReason" class="filter grow" placeholder="Motivo do cancelamento" />
              <button class="button danger small" :disabled="!cancelReason.trim()" @click="cancelOrder">Cancelar pedido</button>
            </div>
            <p v-else-if="order.planned && !order.cancelledAt && !order.shipment" class="hint">Pedido planejado: alteração e cancelamento passam pelo PCP.</p>

            <template v-if="order.lines?.length">
              <h3 class="drawer-title">Itens</h3>
              <div class="card flush">
                <table class="compact">
                  <thead><tr><th>Item</th><th>Qtd.</th><th>Preço un.</th><th>Total</th><th v-if="editable"></th></tr></thead>
                  <tbody>
                    <tr v-for="(line, index) in order.lines" :key="index">
                      <td><b>{{ store.itemLabel(line.itemId) }}</b><small class="cell-sub">{{ line.revision ? `revisão ${line.revision}` : '' }}{{ line.kitId ? ` · do kit ${store.item(line.kitId).code}` : '' }}</small></td>
                      <td><input v-if="edits[index]" v-model.number="edits[index].quantity" class="cell-input" type="number" min="1" /><template v-else>{{ line.quantity }}</template></td>
                      <td><input v-if="edits[index]" v-model.number="edits[index].unitPrice" class="cell-input" type="number" min="0" /><template v-else>{{ fmtCurrency(line.unitPrice) }}</template></td>
                      <td>{{ fmtCurrency(line.quantity * line.unitPrice) }}</td>
                      <td v-if="editable"><button v-if="!edits[index]" class="button secondary small" @click="editLine(index)">Alterar</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="Object.keys(edits).length" class="inline-form row">
                <input v-model="changeReason" class="filter grow" placeholder="Motivo da alteração (obrigatório)" />
                <button v-for="index in Object.keys(edits).map(Number)" :key="index" class="button small" :disabled="!changeReason.trim()" @click="saveLine(index)">Salvar linha {{ index + 1 }}</button>
              </div>
              <div v-if="order.changes?.length" class="hint">
                <div v-for="(change, index) in order.changes" :key="index">{{ fmtDateTime(change.at) }} · {{ change.actor }}: linha {{ change.line + 1 }}, {{ change.field === 'quantity' ? 'quantidade' : 'preço' }} de {{ change.from }} para {{ change.to }} ({{ change.reason }})</div>
              </div>
            </template>

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
              <p v-if="order.shipment.deliveredTo" class="hint">Entregue a {{ order.shipment.deliveredTo }} em {{ fmtDateTime(order.shipment.deliveredAt!) }}. A garantia começa nesta data.</p>
              <div v-else-if="order.shipment.status === 'Expedido' || order.shipment.status === 'Faturado'" class="inline-form row">
                <input v-model="receiver" class="filter grow" placeholder="Quem recebeu no cliente" />
                <button class="button small" :disabled="!receiver.trim()" @click="store.confirmDelivery(order.id, receiver)"><PackageCheck :size="14" /> Confirmar entrega</button>
              </div>
            </template>

            <h3 class="drawer-title">Linha do tempo</h3>
            <ol class="timeline">
              <li v-for="event in store.eventsOf(order.id)" :key="event.id">
                <i></i>
                <div><strong>{{ event.text }}</strong><span>{{ fmtDateTime(event.at) }} · {{ event.module }} · {{ event.actor }}</span></div>
              </li>
              <li><i></i><div><strong>{{ order.origin === 'Thalamus' ? `Pedido nascido da proposta ${order.proposalId ?? ''}` : 'Pedido importado do Omie' }}</strong><span>{{ fmtDateTime(order.receivedAt || new Date().toISOString()) }} · Comercial</span></div></li>
            </ol>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
