<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Save } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { roleIsOpen } from '../../domain/partners'
import { PLACE_LABEL, currentInstruction, serviceRoutingUses } from '../../domain/services'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { ServiceExecutor, ServicePlace } from '../../types/domain'
import { fmtCurrency } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()

const isNew = computed(() => props.id === 'new')
const service = computed(() => store.state.services.find(entry => entry.id === props.id))
const suppliers = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Fornecedor')))
const sectors = computed(() => store.state.sectors)
const form = reactive({
  name: '', description: '', unit: 'hora' as 'hora' | 'un' | 'visita',
  place: 'Roboflex' as ServicePlace, executor: 'Própria' as ServiceExecutor,
  sellable: false, usableInServiceOrder: false, usableInRouting: false,
  sectorId: '', teamLabel: '', instruction: '', estimatedMinutes: null as number | null,
  datasheetName: '', supplierId: '', cost: 0, price: 0, fiscalNote: '',
})
const picked = ref<string[]>([])

watch(service, value => {
  picked.value = []
  if (!value) return
  Object.assign(form, {
    name: value.name, description: value.description ?? '', unit: value.unit, place: value.place, executor: value.executor,
    sellable: value.sellable, usableInServiceOrder: value.usableInServiceOrder, usableInRouting: value.usableInRouting,
    sectorId: value.sectorId ?? '', teamLabel: value.teamLabel ?? '', instruction: currentInstruction(value)?.text ?? '',
    estimatedMinutes: value.estimatedMinutes ?? null, datasheetName: value.datasheetName ?? '', supplierId: value.supplierId ?? '',
    cost: value.cost, price: value.price, fiscalNote: value.fiscalNote ?? '',
  })
}, { immediate: true })

const showCommercial = computed(() => form.sellable || form.usableInServiceOrder)
const routingUses = computed(() => service.value ? serviceRoutingUses(store.state, service.value.id) : [])
const productIds = computed(() => [...new Set(routingUses.value.filter(row => {
  const item = store.state.items.find(entry => entry.id === row.itemId)
  return item?.routing?.some(step => step.serviceId === service.value?.id)
}).map(row => row.itemId))])
const draftOf = (itemId: string) => store.state.productRevisions.find(entry => entry.itemId === itemId && entry.status === 'Rascunho')
const orders = computed(() => store.state.productionOrders.filter(order => productIds.value.includes(order.itemId)))
const proposals = computed(() => store.state.proposals.filter(entry => entry.lines.some(line => line.serviceId === props.id)))
const demands = computed(() => store.state.demands.filter(entry => entry.serviceId === props.id))
const sectorName = (id?: string) => store.state.sectors.find(entry => entry.id === id)?.name ?? '—'

function payload() {
  return {
    name: form.name, description: form.description, unit: form.unit, place: form.place, executor: form.executor,
    sellable: form.sellable, usableInServiceOrder: form.usableInServiceOrder, usableInRouting: form.usableInRouting,
    sectorId: form.sectorId || undefined, teamLabel: form.teamLabel, instruction: form.instruction,
    estimatedMinutes: typeof form.estimatedMinutes === 'number' && !Number.isNaN(form.estimatedMinutes) ? form.estimatedMinutes : undefined, datasheetName: form.datasheetName, supplierId: form.supplierId || undefined,
    cost: form.cost, price: form.price, fiscalNote: form.fiscalNote,
  }
}
function save() {
  if (isNew.value) {
    const created = store.createService(payload())
    if (created && created !== true) ui.openRecord('service', created.id)
  } else store.updateService(props.id, payload())
}
function onDatasheet(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) form.datasheetName = file.name
}
function applyChange(mode: 'mesmos' | 'novo') {
  const result = store.openServiceRoutingChange(props.id, picked.value, mode)
  if (result && result !== true && mode === 'novo') ui.openRecord('service', result.serviceId)
  picked.value = []
}
</script>

<template>
  <RecordHeader :eyebrow="isNew ? 'Cadastros · novo serviço' : `Serviço · ${service?.code}`" :title="isNew ? 'Novo serviço' : service?.name ?? ''" :subtitle="isNew ? 'Um cadastro. Os usos, o local e quem executa são independentes.' : `${PLACE_LABEL[service?.place ?? 'Roboflex']} · ${service?.executor === 'Terceirizado' ? 'fornecedor terceirizado' : 'equipe própria'}`">
    <template v-if="service" #actions><StatusBadge :value="service.status" /></template>
  </RecordHeader>
  <div class="drawer-body">
    <div class="field"><label>Nome</label><input v-model="form.name" /></div>
    <div class="field"><label>Descrição</label><textarea v-model="form.description" rows="2"></textarea></div>
    <div class="form-grid" data-tour="service-form">
      <div class="field"><label>Unidade</label><select v-model="form.unit"><option value="hora">hora</option><option value="un">un</option><option value="visita">visita</option></select><small>A lista oficial de unidades ainda não foi definida.</small></div>
      <div class="field"><label>Local habitual</label><select v-model="form.place"><option value="Roboflex">Instalações da Roboflex</option><option value="Cliente">Instalações do cliente</option><option value="Outro">Outro local</option></select></div>
      <div class="field"><label>Quem executa</label><select v-model="form.executor"><option value="Própria">Equipe própria</option><option value="Terceirizado">Fornecedor terceirizado</option></select><small>Independente do local. Trabalho no cliente feito pela Roboflex continua sendo equipe própria.</small></div>
    </div>
    <fieldset class="layer">
      <legend>Usos</legend>
      <label class="check-option"><input v-model="form.sellable" type="checkbox" /> Vendável</label>
      <label class="check-option"><input v-model="form.usableInServiceOrder" type="checkbox" /> Ordem de serviço</label>
      <label class="check-option"><input v-model="form.usableInRouting" type="checkbox" /> Roteiro de produção</label>
      <p v-if="!form.sellable && !form.usableInServiceOrder && !form.usableInRouting" class="cell-sub">Nenhum uso marcado. Quais são obrigatórios ainda não foi definido.</p>
    </fieldset>

    <fieldset v-if="form.executor === 'Própria'" class="layer">
      <legend>Equipe própria</legend>
      <div class="form-grid">
        <div class="field"><label>Setor responsável</label><select v-model="form.sectorId"><option value="">Não informado</option><option v-for="sector in sectors" :key="sector.id" :value="sector.id">{{ sector.name }}</option></select></div>
        <div class="field"><label>Equipe padrão</label><input v-model="form.teamLabel" placeholder="Quando houver" /><small>O subsetor oficial ainda não foi definido. Aqui fica o nome da equipe.</small></div>
      </div>
      <div class="field"><label>Instrução técnica vigente</label><textarea v-model="form.instruction" rows="3"></textarea><small>Mudar o texto grava uma versão nova. A anterior permanece.</small></div>
      <p v-for="entry in [...(service?.instructions ?? [])].reverse()" :key="entry.version" class="cell-sub">v{{ entry.version }} · {{ entry.origin }} · {{ entry.author }} — {{ entry.text }}</p>
    </fieldset>

    <fieldset v-else class="layer">
      <legend>Terceirizado</legend>
      <div class="field"><label>Datasheet</label><input type="file" @change="onDatasheet" /><small>{{ form.datasheetName ? `Anexo informado: ${form.datasheetName}.` : 'Obrigatório para gravar.' }} O arquivo não é enviado: nesta demonstração fica só o nome. Formato e aprovador ainda não foram definidos.</small></div>
      <div class="field"><label>Fornecedor de referência</label><select v-model="form.supplierId"><option value="">A definir na compra</option><option v-for="entry in suppliers" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small>O desenho da compra ainda não foi definido. O fornecedor aqui é só referência.</small></div>
    </fieldset>

    <fieldset v-if="showCommercial" class="layer">
      <legend>Preço e cenário fiscal</legend>
      <div class="form-grid">
        <div class="field"><label>Custo informado (R$)</label><input v-model.number="form.cost" type="number" min="0" step="0.01" /></div>
        <div class="field"><label>Preço informado (R$)</label><input v-model.number="form.price" type="number" min="0" step="0.01" /><small>Não há lista nem regra de cálculo.</small></div>
      </div>
      <div class="field"><label>Cenário fiscal</label><input v-model="form.fiscalNote" placeholder="Texto livre, quando houver classificação" /><small>Alíquota e validação por transação ainda não foram definidas. O preço gravado num pedido não é reescrito por esta ficha.</small></div>
    </fieldset>
    <div v-else class="field"><label>Custo informado (R$)</label><input v-model.number="form.cost" type="number" min="0" step="0.01" /></div>

    <fieldset class="layer">
      <legend>Tempo</legend>
      <div class="field"><label>Tempo estimado (min)</label><input v-model.number="form.estimatedMinutes" type="number" min="0" step="1" /><small>Informado neste cadastro. A média dos apontamentos não é calculada: fórmula, unidade, base e período ainda não foram definidos.</small></div>
      <p class="cell-sub">Média apontada: não calculada.{{ service?.estimatedMinutes != null ? ` Estimativa vigente: ${service.estimatedMinutes} min.` : '' }}</p>
    </fieldset>

    <div class="drawer-actions">
      <button class="button" @click="save"><Save :size="15" /> {{ isNew ? 'Criar serviço' : 'Salvar' }}</button>
      <button v-if="service" class="button secondary" @click="store.setServiceStatus(service.id, service.status === 'Ativo' ? 'Inativo' : 'Ativo')">{{ service.status === 'Ativo' ? 'Inativar' : 'Reativar' }}</button>
      <button v-if="isNew" class="button secondary" @click="ui.closeRecord">Cancelar</button>
    </div>

    <template v-if="service">
      <div data-tour="service-usage">
        <h3 class="drawer-title">Onde é usado</h3>
        <p v-if="!routingUses.length" class="empty-note">Nenhum roteiro aponta para este serviço.</p>
        <p v-for="row in routingUses" :key="`${row.revisionId ?? 'item'}-${row.stepId}`" class="list-row">
          <span><strong>{{ row.itemCode }} · {{ row.stepName }}</strong><span>Revisão {{ row.revisionCode }} ({{ row.revisionStatus }}){{ row.instructionVersion ? ` · instrução v${row.instructionVersion}` : '' }}</span></span>
        </p>
        <button v-for="proposal in proposals" :key="proposal.id" class="list-row" @click="ui.openRecord('proposal', proposal.id)">
          <div><strong>{{ proposal.id }} · proposta</strong><span>{{ store.partnerName(proposal.partnerId) }}</span></div><StatusBadge :value="proposal.status" />
        </button>
        <button v-for="demand in demands" :key="demand.id" class="list-row" @click="ui.openRecord('demand', demand.id)">
          <div><strong>{{ demand.id }} · demanda</strong><span>{{ demand.description }}</span></div><StatusBadge :value="demand.status" />
        </button>
        <p v-if="!proposals.length && !demands.length && !routingUses.length" class="empty-note">Ainda não usado em proposta, demanda ou roteiro.</p>

        <template v-if="productIds.length">
          <h3 class="drawer-title">Alterar nos produtos</h3>
          <p class="cell-sub">A mudança abre um rascunho de versão no cadastro do produto. A revisão já liberada não é reescrita. Publicar continua no produto. A troca automática das ordens espera a definição de quais situações contam como em andamento e quais contam como criadas sem início.</p>
          <label v-for="itemId in productIds" :key="itemId" class="check-option">
            <input v-model="picked" type="checkbox" :value="itemId" :disabled="!!draftOf(itemId)" />
            {{ store.state.items.find(entry => entry.id === itemId)?.code }} · {{ store.state.items.find(entry => entry.id === itemId)?.name }}
            <span v-if="draftOf(itemId)" class="cell-sub">Já tem a versão {{ draftOf(itemId)?.code }} em rascunho. Conclua ou descarte no produto antes de abrir outra.</span>
          </label>
          <div class="drawer-actions">
            <button class="button secondary" type="button" :disabled="!picked.length" @click="applyChange('mesmos')">Abrir versão nos marcados</button>
            <button class="button secondary" type="button" :disabled="!picked.length" @click="applyChange('novo')">Criar serviço novo só para os marcados</button>
          </div>
          <p v-for="order in orders" :key="order.id" class="cell-sub">{{ order.id }} · {{ order.status }} · revisão {{ store.state.productRevisions.find(entry => entry.id === order.revisionId)?.code ?? '—' }}</p>
        </template>
      </div>
      <p v-if="service.sectorId" class="cell-sub">Setor de referência: {{ sectorName(service.sectorId) }}. Quem executou de fato fica na ordem, não neste cadastro.</p>
      <p v-if="service.price" class="cell-sub">Preço informado: {{ fmtCurrency(service.price) }} por {{ service.unit }}.</p>
      <RecordTimeline :ref-id="service.id" />
    </template>
  </div>
</template>
