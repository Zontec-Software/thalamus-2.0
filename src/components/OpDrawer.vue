<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { PackageCheck, ShieldCheck, Tablet, X } from 'lucide-vue-next'
import StatusBadge from './StatusBadge.vue'
import { elapsedMs, opProgress } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtCurrency, fmtDate, fmtDateTime, fmtDuration, fmtNumber } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const op = computed(() => store.state.productionOrders.find(entry => entry.id === ui.opDrawer))
const events = computed(() => op.value ? store.state.events.filter(event => event.text.includes(op.value!.id)) : [])
const budgetCategory = computed(() => store.state.budgetCategories.find(entry => entry.id === op.value?.budgetCategoryId))

function go(path: string) {
  ui.opDrawer = null
  ui.orderDrawer = null
  router.push(path)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="op" class="drawer-backdrop upper" @click.self="ui.opDrawer = null">
        <aside class="drawer">
          <header class="drawer-header">
            <div>
              <span class="eyebrow">{{ op.kind === 'Injeção' ? 'OP de injeção · a peça plástica' : 'OP de montagem · o case' }} · pedido {{ op.salesOrderId }}</span>
              <h2>{{ op.id }}</h2>
              <p>{{ store.itemLabel(op.itemId) }} · {{ op.quantity }} un.</p>
            </div>
            <button class="icon-plain" @click="ui.opDrawer = null"><X :size="18" /></button>
          </header>
          <div class="drawer-body">
            <div class="callout" :class="op.kind === 'Injeção' ? 'info' : ''">
              <div><strong>{{ op.kind === 'Injeção' ? 'Esta OP fabrica a peça, não o case' : 'Esta OP monta o case do pedido' }}</strong>{{ op.kind === 'Injeção' ? 'Ela roda na injetora. As peças boas entram no estoque e alimentam a OP de montagem do mesmo pedido.' : 'Ela junta as peças das OPs de injeção com os componentes comprados. Só avança quando essas peças estão prontas.' }}</div>
            </div>
            <div class="mini-stats four">
              <div class="mini-stat"><strong><StatusBadge :value="op.status" /></strong><span>situação</span></div>
              <div class="mini-stat"><strong>{{ opProgress(op) }}%</strong><span>progresso</span></div>
              <div class="mini-stat"><strong>{{ fmtDate(op.scheduledDate) }}</strong><span>programada</span></div>
              <div class="mini-stat"><strong>{{ store.resourceName(op.resourceId).split(' · ')[0] }}</strong><span>recurso</span></div>
            </div>
            <div class="notice info">Previsão orçamentária: {{ fmtCurrency(op.estimatedCost ?? 0) }} · {{ budgetCategory?.name ?? 'Sem categoria' }} · {{ op.budgetPeriod ?? 'sem período' }}</div>

            <div class="drawer-actions">
              <button v-if="op.status === 'Planejada'" class="button" @click="store.pickOp(op.id)"><PackageCheck :size="15" /> Separar kit e liberar</button>
              <button v-if="op.status === 'Inspeção'" class="button" @click="go('/qualidade')"><ShieldCheck :size="15" /> Ir para inspeção</button>
              <button v-if="['Liberada', 'Em produção'].includes(op.status)" class="button secondary" @click="go('/tablet')"><Tablet :size="15" /> Abrir no tablet</button>
              <button class="button secondary" @click="ui.orderDrawer = op.salesOrderId; ui.opDrawer = null">Ver pedido</button>
            </div>

            <h3 class="drawer-title">Materiais</h3>
            <table>
              <thead><tr><th>Item</th><th>Necessário</th><th>Reservado</th><th>Situação</th></tr></thead>
              <tbody>
                <tr v-for="line in op.materials" :key="line.itemId">
                  <td><span class="cell-main">{{ store.item(line.itemId).code }}</span><span class="cell-sub">{{ store.itemLabel(line.itemId) }}</span></td>
                  <td>{{ fmtNumber(line.required, 2) }} {{ store.item(line.itemId).unit }}</td>
                  <td>{{ fmtNumber(line.reserved, 2) }}</td>
                  <td><StatusBadge :value="line.picked ? 'Separado' : line.reserved >= line.required ? 'Reservado' : 'Em falta'" :tone="line.picked ? 'success' : line.reserved >= line.required ? 'info' : 'danger'" /></td>
                </tr>
              </tbody>
            </table>

            <h3 class="drawer-title">Operações</h3>
            <div v-for="operation in op.operations" :key="operation.id" class="list-row static">
              <div>
                <strong>{{ operation.name }}</strong>
                <span>{{ store.resourceName(operation.resourceId) }} · {{ operation.good }} boas · {{ operation.scrap }} refugo · {{ fmtDuration(elapsedMs(operation, ui.tick)) }}<template v-if="operation.operator"> · {{ operation.operator }}</template></span>
                <span v-if="operation.pauseReason" class="risk-text">Parada: {{ operation.pauseReason }}</span>
              </div>
              <StatusBadge :value="operation.status" />
            </div>

            <h3 class="drawer-title">Histórico da OP</h3>
            <ol class="timeline">
              <li v-for="event in events" :key="event.id"><i></i><div><strong>{{ event.text }}</strong><span>{{ fmtDateTime(event.at) }} · {{ event.actor }}</span></div></li>
            </ol>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
