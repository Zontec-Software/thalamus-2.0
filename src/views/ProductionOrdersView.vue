<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatusBadge from '../components/StatusBadge.vue'
import { missingLines, opProgress } from '../domain/engine'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { OpStatus } from '../types/domain'
import { fmtDate } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const STATUSES: OpStatus[] = ['Aguardando material', 'Planejada', 'Liberada', 'Em produção', 'Inspeção', 'Concluída']
const status = ref<OpStatus | ''>('')
const kind = ref('')

const ops = computed(() => store.state.productionOrders
  .filter(op => (!status.value || op.status === status.value) && (!kind.value || op.kind === kind.value))
  .sort((a, b) => a.dueDate.localeCompare(b.dueDate)))

const count = (value: OpStatus) => store.state.productionOrders.filter(op => op.status === value).length
const current = (opId: string) => store.state.productionOrders.find(op => op.id === opId)?.operations.find(operation => operation.status !== 'Concluída')
</script>

<template>
  <div class="toolbar" data-tour="op-filters">
    <div class="filter-row">
      <button class="chip" :class="{ active: !status }" @click="status = ''">Todas <b>{{ store.state.productionOrders.length }}</b></button>
      <button v-for="entry in STATUSES" :key="entry" class="chip" :class="{ active: status === entry }" @click="status = entry">{{ entry }} <b>{{ count(entry) }}</b></button>
    </div>
    <select v-model="kind" class="filter"><option value="">Injeção e montagem</option><option>Injeção</option><option>Montagem</option></select>
  </div>

  <article class="card flush" data-tour="op-table">
    <table>
      <thead><tr><th>OP</th><th>Tipo</th><th>Item</th><th>Qtd.</th><th>Recurso</th><th>Etapa atual</th><th>Limite</th><th>Progresso</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="op in ops" :key="op.id" class="clickable" @click="ui.opDrawer = op.id">
          <td><span class="cell-main">{{ op.id }}</span><span class="cell-sub">{{ op.salesOrderId }}</span></td>
          <td><span class="kind-tag" :class="op.kind === 'Injeção' ? 'inj' : 'mont'">{{ op.kind === 'Injeção' ? 'OP de injeção' : 'OP de montagem' }}</span><span class="cell-sub">{{ op.kind === 'Injeção' ? 'Peça plástica' : 'Case do pedido' }}</span></td>
          <td>{{ store.itemLabel(op.itemId) }}<span v-if="op.revisionId" class="cell-sub">Revisão {{ store.state.productRevisions.find(revision => revision.id === op.revisionId)?.code }} congelada</span></td>
          <td>{{ op.quantity }}</td>
          <td>{{ store.resourceName(op.resourceId) }}</td>
          <td>
            <template v-if="current(op.id)">{{ current(op.id)!.name }}<span class="cell-sub">{{ current(op.id)!.status }}{{ current(op.id)!.pauseReason ? ` · ${current(op.id)!.pauseReason}` : '' }}</span></template>
            <span v-else class="cell-sub">—</span>
            <span v-if="op.status === 'Aguardando material'" class="cell-sub risk-text">Falta: {{ missingLines(op).map(line => store.item(line.itemId).name).join(', ') }}</span>
          </td>
          <td>{{ fmtDate(op.dueDate) }}</td>
          <td><div class="progress"><span :style="{ width: `${opProgress(op)}%` }"></span></div><div class="progress-label">{{ opProgress(op) }}%</div></td>
          <td><StatusBadge :value="op.status" /></td>
          <td @click.stop>
            <button v-if="op.status === 'Planejada'" class="button small" @click="store.pickOp(op.id)">Separar kit</button>
            <button v-else-if="op.status === 'Inspeção'" class="button small" @click="router.push('/qualidade')">Inspecionar</button>
            <button v-else-if="['Liberada', 'Em produção'].includes(op.status)" class="button secondary small" @click="router.push('/tablet')">Tablet</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!ops.length" class="empty-note">Nenhuma OP nesta situação.</p>
  </article>
</template>
