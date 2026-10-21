<script setup lang="ts">
import { computed, reactive } from 'vue'
import { PackageCheck, Truck } from 'lucide-vue-next'
import MetricCard from '../components/MetricCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import { fmtDate, fmtDateTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const CARRIERS = ['Rodonaves', 'Braspress', 'Jadlog', 'Retirada pelo cliente']
const forms = reactive<Record<string, { volumes: number; carrier: string }>>({})

const shipments = computed(() => store.state.salesOrders.filter(order => order.shipment).sort((a, b) => Number(a.shipment!.status === 'Faturado') - Number(b.shipment!.status === 'Faturado')))
const form = (orderId: string, quantity: number) => (forms[orderId] ??= { volumes: Math.ceil(quantity / 12), carrier: CARRIERS[0] })
const count = (status: string) => shipments.value.filter(order => order.shipment!.status === status).length

/** Linhas que saem na carga, com o kit virtual de origem quando houver. */
const cargo = (order: typeof store.state.salesOrders[number]) =>
  (order.lines ?? []).map(line => ({ ...line, label: store.itemLabel(line.itemId), unit: store.item(line.itemId).unit, kit: line.kitId ? store.item(line.kitId).name : '' }))
</script>

<template>
  <div class="toolbar"><p>Conferência, carga e faturamento. A NF-e é emitida no Omie e retorna automaticamente para o pedido.</p></div>

  <section class="metrics">
    <MetricCard label="Aguardando conferência" :value="count('Aguardando conferência')" detail="Aprovados pela qualidade" :icon="PackageCheck" />
    <MetricCard label="Conferidos" :value="count('Conferido')" detail="Prontos para carregar" :icon="PackageCheck" />
    <MetricCard label="Aguardando NF-e" :value="count('Expedido')" detail="Processando no Omie" :icon="Truck" />
    <MetricCard label="Faturados" :value="count('Faturado')" detail="NF-e emitida" :icon="Truck" trend="positive" />
  </section>

  <article class="card flush" data-tour="shipping-list">
    <table>
      <thead><tr><th>Pedido / cliente</th><th>Produto</th><th>Qtd.</th><th>Entrega</th><th>Volumes</th><th>Transportadora</th><th>Situação</th><th>Ação</th></tr></thead>
      <tbody>
        <tr v-for="order in shipments" :key="order.id">
          <td><button class="link" @click="ui.orderDrawer = order.id">{{ order.id }}</button><span class="cell-sub">{{ store.customerName(order.customerId) }}</span></td>
          <td>
            <template v-if="cargo(order).length > 1">
              <span v-for="line in cargo(order)" :key="line.itemId" class="cell-sub">
                {{ line.quantity }} {{ line.unit }} · {{ line.label }}<template v-if="line.kit"> · do kit {{ line.kit }}</template>
              </span>
            </template>
            <template v-else>{{ store.itemLabel(order.itemId) }}</template>
          </td>
          <td>{{ order.quantity }}</td>
          <td>{{ fmtDate(order.promisedDate) }}</td>
          <template v-if="order.shipment!.status === 'Aguardando conferência'">
            <td><input v-model.number="form(order.id, order.quantity).volumes" class="filter" style="min-width:0; width:70px" type="number" min="1" /></td>
            <td><select v-model="form(order.id, order.quantity).carrier" class="filter"><option v-for="carrier in CARRIERS" :key="carrier">{{ carrier }}</option></select></td>
          </template>
          <template v-else>
            <td>{{ order.shipment!.volumes }}</td>
            <td>{{ order.shipment!.carrier }}<span v-if="order.shipment!.shippedAt" class="cell-sub">Saída {{ fmtDateTime(order.shipment!.shippedAt) }}</span></td>
          </template>
          <td><StatusBadge :value="order.shipment!.status" /><span v-if="order.shipment!.invoice" class="cell-sub">{{ order.shipment!.invoice }}</span></td>
          <td>
            <button v-if="order.shipment!.status === 'Aguardando conferência'" class="button small" @click="store.confirmShipment(order.id, form(order.id, order.quantity).volumes, form(order.id, order.quantity).carrier)">Confirmar conferência</button>
            <button v-else-if="order.shipment!.status === 'Conferido'" class="button small" @click="store.shipOrder(order.id)"><Truck :size="13" /> Expedir e faturar</button>
            <span v-else-if="order.shipment!.status === 'Expedido'" class="cell-sub">Aguardando NF-e do Omie…</span>
            <span v-else class="cell-sub">Concluído</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!shipments.length" class="empty-note">Nenhum pedido liberado para expedição.</p>
  </article>
</template>
