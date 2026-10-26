<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Ban, CheckCircle2, PackageCheck, ShoppingCart } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { addDays, today } from '../../domain/engine'
import { roleIsOpen } from '../../domain/partners'
import { budgetSummary } from '../../domain/budget'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Demand, Priority, Role } from '../../types/domain'
import { daysUntil, fmtCurrency, fmtDate } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const isNew = computed(() => props.id === 'new')
const demand = computed(() => store.state.demands.find(entry => entry.id === props.id))
const materials = computed(() => store.state.items.filter(entry => ['MP', 'CP', 'EM'].includes(entry.type)))
const suppliers = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Fornecedor')))
const STEPS = ['Aberta', 'Em atendimento', 'Atendida'] as const

const form = reactive({
  kind: (props.context.kind as Demand['kind']) ?? 'Material',
  itemId: props.context.itemId ?? materials.value[0]?.id ?? '',
  serviceId: props.context.serviceId ?? store.state.services[0]?.id ?? '',
  description: props.context.description ?? '',
  quantity: Number(props.context.quantity ?? 1),
  neededBy: addDays(today(), 7),
  priority: 'Normal' as Priority,
  origin: (props.context.origin as Demand['origin']) ?? 'Manual',
  originId: props.context.originId ?? '',
  assigneeRole: 'Compras' as Role,
  notes: '',
})
const origins = computed(() => {
  if (form.origin === 'Projeto') return store.state.projects.map(entry => ({ id: entry.id, label: `${entry.id} · ${entry.name}` }))
  if (form.origin === 'Assistência') return store.state.technicalServiceOrders.map(entry => ({ id: entry.id, label: `${entry.id} · ${store.partnerName(entry.partnerId)}` }))
  if (form.origin === 'Manutenção') return store.state.maintenanceOrders.map(entry => ({ id: entry.id, label: `${entry.id} · ${entry.description}` }))
  if (form.origin === 'OP') return store.state.productionOrders.filter(entry => entry.status !== 'Concluída').map(entry => ({ id: entry.id, label: `${entry.id} · ${store.itemLabel(entry.itemId)}` }))
  return []
})
const formFree = computed(() => form.kind === 'Material' && form.itemId ? store.available(form.itemId) : 0)
watch(() => [form.kind, form.itemId, form.quantity], () => {
  form.assigneeRole = form.kind === 'Material' && formFree.value >= form.quantity ? 'Almoxarifado' : 'Compras'
}, { immediate: true })

function create() {
  const description = form.description || (form.kind === 'Material' ? store.item(form.itemId).name : form.kind === 'Serviço' ? store.serviceName(form.serviceId) : 'Aquisição de ativo')
  const created = store.createDemand({
    kind: form.kind, itemId: form.kind === 'Material' ? form.itemId : undefined, serviceId: form.kind === 'Serviço' ? form.serviceId : undefined,
    description, quantity: form.quantity, origin: form.origin, originId: form.originId || undefined, neededBy: form.neededBy, priority: form.priority,
    assigneeRole: form.assigneeRole, notes: form.notes || undefined,
  })
  if (created && created !== true) ui.openRecord('demand', created.id)
}

const item = computed(() => demand.value?.itemId ? store.item(demand.value.itemId) : undefined)
const service = computed(() => store.state.services.find(entry => entry.id === demand.value?.serviceId))
const free = computed(() => item.value ? store.available(item.value.id) : 0)
const purchase = computed(() => store.state.purchaseOrders.find(entry => entry.id === demand.value?.purchaseOrderId))
const budget = computed(() => demand.value?.budgetCategoryId && demand.value.budgetPeriod
  ? store.state.budgets.find(entry => entry.categoryId === demand.value!.budgetCategoryId && entry.period === demand.value!.budgetPeriod)
  : undefined)
const budgetCategory = computed(() => store.state.budgetCategories.find(entry => entry.id === demand.value?.budgetCategoryId))
const budgetStatus = computed(() => demand.value?.budgetCategoryId && demand.value.budgetPeriod
  ? budgetSummary(store.state, demand.value.budgetCategoryId, demand.value.budgetPeriod)
  : undefined)
const supplierId = ref(suppliers.value.find(entry => entry.name === item.value?.supplier)?.id ?? suppliers.value[0]?.id ?? '')
const cancelling = ref(false)
const cancelReason = ref('')
const stepIndex = computed(() => STEPS.indexOf(demand.value?.status as typeof STEPS[number]))

function cancel() {
  if (store.cancelDemand(props.id, cancelReason.value)) cancelling.value = false
}

function openOrigin() {
  const entry = demand.value
  if (!entry?.originId) return
  if (entry.origin === 'Projeto') ui.openRecord('project', entry.originId)
  else if (entry.origin === 'Assistência') ui.openRecord('technical', entry.originId)
  else if (entry.origin === 'OP') { ui.closeRecord(); ui.opDrawer = entry.originId }
  else if (entry.origin === 'Manutenção') { ui.closeRecord(); router.push('/manutencao') }
}
</script>

<template>
  <template v-if="isNew">
    <RecordHeader eyebrow="Suprimentos · nova demanda" title="Nova demanda" subtitle="Toda necessidade entra por aqui: material, serviço ou ativo, de qualquer origem." />
    <div class="drawer-body">
      <div class="segmented">
        <button v-for="kind in ['Material', 'Serviço', 'Ativo'] as const" :key="kind" :class="{ active: form.kind === kind }" @click="form.kind = kind">{{ kind }}</button>
      </div>
      <div v-if="form.kind === 'Material'" class="field">
        <label>Material</label>
        <select v-model="form.itemId"><option v-for="entry in materials" :key="entry.id" :value="entry.id">{{ entry.code }} · {{ entry.name }}</option></select>
        <small>Estoque {{ store.item(form.itemId).stock }} · reservado {{ store.reserved(form.itemId) }} · livre <b>{{ formFree }}</b> {{ store.item(form.itemId).unit }} · em compra {{ store.incoming(form.itemId) }}</small>
      </div>
      <div v-else-if="form.kind === 'Serviço'" class="field">
        <label>Serviço do catálogo</label>
        <select v-model="form.serviceId"><option v-for="entry in store.state.services" :key="entry.id" :value="entry.id">{{ entry.code }} · {{ entry.name }}</option></select>
        <small>{{ store.state.services.find(entry => entry.id === form.serviceId)?.executor === 'Terceirizado' ? 'Executado por fornecedor: o pagamento fica no Omie' : 'Execução pela equipe própria' }}</small>
      </div>
      <div class="field"><label>Descrição</label><input v-model="form.description" :placeholder="form.kind === 'Ativo' ? 'Ex.: Paquímetro digital para a qualidade' : 'Deixe em branco para usar o nome do cadastro'" /></div>
      <div class="form-grid">
        <div class="field"><label>Quantidade</label><input v-model.number="form.quantity" type="number" min="1" /></div>
        <div class="field"><label>Necessário em</label><input v-model="form.neededBy" type="date" /></div>
        <div class="field"><label>Prioridade</label><select v-model="form.priority"><option>Baixa</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></div>
        <div class="field"><label>Responsável</label><select v-model="form.assigneeRole"><option>Compras</option><option>Almoxarifado</option><option>Manutenção</option></select><small>{{ form.assigneeRole === 'Almoxarifado' ? 'Há saldo livre: o almoxarifado entrega' : 'Sem saldo: segue para compras' }}</small></div>
        <div class="field"><label>Origem</label><select v-model="form.origin" @change="form.originId = ''"><option>Manual</option><option>Projeto</option><option>Assistência</option><option>Manutenção</option><option>OP</option><option>Estoque mínimo</option></select></div>
        <div v-if="origins.length" class="field"><label>Vínculo</label><select v-model="form.originId"><option value="">Selecione…</option><option v-for="entry in origins" :key="entry.id" :value="entry.id">{{ entry.label }}</option></select></div>
      </div>
      <div class="field"><label>Observações</label><textarea v-model="form.notes" rows="2"></textarea></div>
      <div class="drawer-actions">
        <button class="button" @click="create">Registrar demanda</button>
        <button class="button secondary" @click="ui.closeRecord">Cancelar</button>
      </div>
    </div>
  </template>

  <template v-else-if="demand">
    <RecordHeader :eyebrow="`Demanda · ${demand.id} · ${demand.kind}`" :title="demand.description" :subtitle="`Solicitada por ${demand.requester ?? demand.origin} · ${fmtDate(demand.createdAt)}`" />
    <div class="drawer-body">
      <div v-if="demand.status === 'Cancelada'" class="notice danger">Cancelada: {{ demand.resolution }}</div>
      <div v-else class="stage-stepper">
        <div v-for="(step, index) in STEPS" :key="step" class="stage-step" :class="{ done: index < stepIndex, current: index === stepIndex }"><i></i><span>{{ step }}</span></div>
      </div>

      <div class="mini-stats four">
        <div class="mini-stat"><strong>{{ demand.quantity }} {{ item?.unit ?? service?.unit ?? 'un' }}</strong><span>quantidade</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': demand.status !== 'Atendida' && daysUntil(demand.neededBy) < 0 }">{{ fmtDate(demand.neededBy) }}</strong><span>{{ demand.status === 'Atendida' ? 'necessário em' : daysUntil(demand.neededBy) < 0 ? `${-daysUntil(demand.neededBy)} dia(s) atrasada` : `em ${daysUntil(demand.neededBy)} dia(s)` }}</span></div>
        <div class="mini-stat"><strong>{{ fmtCurrency(demand.estimatedCost ?? 0) }}</strong><span>custo estimado</span></div>
        <div class="mini-stat"><strong><StatusBadge :value="demand.priority" /></strong><span>{{ demand.assigneeRole }}</span></div>
      </div>

      <template v-if="item">
        <div data-tour="demand-stock">
        <h3 class="drawer-title">Situação do material</h3>
        <div class="mini-stats four">
          <div class="mini-stat"><strong>{{ item.stock }}</strong><span>estoque</span></div>
          <div class="mini-stat"><strong>{{ store.reserved(item.id) }}</strong><span>reservado p/ OPs</span></div>
          <div class="mini-stat"><strong :class="{ 'risk-text': free < demand.quantity }">{{ free }}</strong><span>livre</span></div>
          <div class="mini-stat"><strong>{{ item.leadTimeDays ?? 7 }} dias</strong><span>lead time</span></div>
        </div>
        <p v-if="demand.status === 'Aberta'" class="hint">{{ free >= demand.quantity ? `Há ${free} ${item.unit} livres em ${item.location}: atenda pelo estoque.` : `Faltam ${demand.quantity - Math.max(free, 0)} ${item.unit}. Com lead time de ${item.leadTimeDays ?? 7} dias, a entrega prevista é ${fmtDate(addDays(today(), item.leadTimeDays ?? 7))}.` }}</p>
        </div>
      </template>

      <div v-if="demand.status === 'Aberta' || demand.status === 'Em atendimento'" class="drawer-actions" data-tour="demand-actions">
        <template v-if="demand.status === 'Aberta' && demand.kind === 'Material'">
          <button class="button" :disabled="free < demand.quantity" @click="store.attendDemandFromStock(demand.id)"><PackageCheck :size="15" /> Atender pelo estoque</button>
          <select v-model="supplierId" class="filter"><option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option></select>
          <button class="button secondary" @click="store.createPurchaseOrder(demand.id, supplierId)"><ShoppingCart :size="15" /> Gerar pedido de compra</button>
        </template>
        <template v-else-if="demand.status === 'Aberta' && demand.kind === 'Serviço'">
          <select v-model="supplierId" class="filter"><option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option></select>
          <button class="button" @click="store.contractService(demand.id, supplierId)"><ShoppingCart :size="15" /> Contratar serviço</button>
        </template>
        <button v-else-if="demand.status === 'Aberta'" class="button" @click="store.attendDemand(demand.id)">Iniciar atendimento</button>
        <button v-if="demand.status === 'Em atendimento' && !demand.purchaseOrderId" class="button" @click="store.completeDemand(demand.id)"><CheckCircle2 :size="15" /> Concluir</button>
        <button class="button ghost" @click="cancelling = !cancelling"><Ban :size="15" /> Cancelar</button>
      </div>
      <div v-if="cancelling" class="inline-form row">
        <input v-model="cancelReason" class="filter grow" placeholder="Motivo do cancelamento" />
        <button class="button danger small" @click="cancel">Confirmar</button>
      </div>
      <div v-if="demand.resolution && demand.status !== 'Cancelada'" class="notice success">{{ demand.resolution }}</div>

      <div data-tour="demand-links">
      <h3 class="drawer-title">Vínculos</h3>
      <button v-if="demand.originId" class="list-row" @click="openOrigin">
        <div><strong>Origem: {{ demand.origin }} {{ demand.originId }}</strong><span>Quem gerou a necessidade</span></div>
        <span class="link">Abrir</span>
      </button>
      <div v-else class="list-row static"><div><strong>Origem: {{ demand.origin }}</strong><span>Sem documento vinculado</span></div></div>
      <button v-if="purchase" class="list-row" @click="ui.openRecord('purchase', purchase.id)">
        <div><strong>{{ purchase.id }} · {{ store.partnerName(purchase.supplierId) }}</strong><span>{{ purchase.received }}/{{ purchase.quantity }} recebido · entrega {{ fmtDate(purchase.promisedDate) }}</span></div>
        <StatusBadge :value="purchase.status" />
      </button>
      <button v-if="budget" class="list-row" @click="ui.openRecord('budget', budget.id)">
        <div><strong>Orçamento: {{ budgetCategory?.name }} · {{ budget.period }}</strong><span>Saldo {{ fmtCurrency(budgetStatus?.balance ?? 0) }} de {{ fmtCurrency(budget.amount) }}</span></div>
        <span class="link">Abrir</span>
      </button>
      <p v-if="demand.notes" class="hint">{{ demand.notes }}</p>
      </div>

      <RecordTimeline :ref-id="demand.id" :created-at="demand.createdAt" created-text="Demanda registrada" />
    </div>
  </template>
  <p v-else class="empty-note">Demanda não encontrada.</p>
</template>
