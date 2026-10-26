<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Save } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { roleIsOpen } from '../../domain/partners'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { ServiceCatalogItem } from '../../types/domain'
import { fmtCurrency } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()

const isNew = computed(() => props.id === 'new')
const service = computed(() => store.state.services.find(entry => entry.id === props.id))
const suppliers = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Fornecedor')))
const form = reactive({
  name: '', category: 'Produção' as ServiceCatalogItem['category'], unit: 'hora' as ServiceCatalogItem['unit'], standardMinutes: 60,
  cost: 0, price: 0, outsourced: false, supplierId: '', description: '',
})
watch(service, value => {
  if (!value) return
  const { name, category, unit, standardMinutes, cost, price, outsourced } = value
  Object.assign(form, { name, category, unit, standardMinutes, cost, price, outsourced, supplierId: value.supplierId ?? '', description: value.description ?? '' })
}, { immediate: true })

function save() {
  const payload = { ...form, supplierId: form.outsourced ? form.supplierId || undefined : undefined, description: form.description || undefined }
  if (isNew.value) {
    const created = store.createService(payload)
    if (created && created !== true) ui.openRecord('service', created.id)
  } else store.updateService(props.id, payload)
}

const margin = computed(() => form.price ? Math.round((1 - form.cost / form.price) * 100) : 0)
const proposals = computed(() => store.state.proposals.filter(entry => entry.lines.some(line => line.serviceId === props.id)))
const demands = computed(() => store.state.demands.filter(entry => entry.serviceId === props.id))
const technical = computed(() => service.value?.category === 'Assistência' ? store.state.technicalServiceOrders.filter(entry => entry.status === 'Concluída' && entry.chargeable) : [])
</script>

<template>
  <RecordHeader :eyebrow="isNew ? 'Cadastros · novo serviço' : `Serviço · ${service?.code}`" :title="isNew ? 'Novo serviço' : service?.name ?? ''" :subtitle="isNew ? 'Um catálogo para roteiro, manutenção, assistência e terceiros.' : `${service?.category} · ${service?.outsourced ? 'terceiro' : 'equipe interna'}`">
    <template v-if="service" #actions><StatusBadge :value="service.status" /></template>
  </RecordHeader>
  <div class="drawer-body">
    <template v-if="service">
      <div class="mini-stats four">
        <div class="mini-stat"><strong>{{ fmtCurrency(service.cost) }}</strong><span>custo / {{ service.unit }}</span></div>
        <div class="mini-stat"><strong>{{ service.price ? fmtCurrency(service.price) : '—' }}</strong><span>preço de venda</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': service.price > 0 && margin < 30 }">{{ service.price ? `${margin}%` : '—' }}</strong><span>margem</span></div>
        <div class="mini-stat"><strong>{{ proposals.length + demands.length }}</strong><span>usos registrados</span></div>
      </div>
      <h3 class="drawer-title">Cadastro</h3>
    </template>
    <div class="field"><label>Nome</label><input v-model="form.name" /></div>
    <div class="form-grid" data-tour="service-form">
      <div class="field"><label>Categoria</label><select v-model="form.category" :disabled="!isNew"><option>Produção</option><option>Manutenção</option><option>Assistência</option><option>Terceiro</option></select></div>
      <div class="field"><label>Unidade</label><select v-model="form.unit"><option>hora</option><option>un</option><option>visita</option></select></div>
      <div class="field"><label>Tempo padrão (min)</label><input v-model.number="form.standardMinutes" type="number" min="0" /></div>
      <div class="field"><label>Custo (R$)</label><input v-model.number="form.cost" type="number" min="0" step="0.01" /></div>
      <div class="field"><label>Preço de venda (R$)</label><input v-model.number="form.price" type="number" min="0" step="0.01" /><small>Zero se não for vendido em propostas</small></div>
      <div class="field"><label>Execução</label><label class="check-option"><input v-model="form.outsourced" type="checkbox" /> Executado por terceiro</label></div>
      <div v-if="form.outsourced" class="field"><label>Fornecedor padrão</label><select v-model="form.supplierId"><option value="">Escolher na contratação</option><option v-for="entry in suppliers" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
    </div>
    <div class="field"><label>Descrição / escopo</label><textarea v-model="form.description" rows="2"></textarea></div>
    <div class="drawer-actions">
      <button class="button" @click="save"><Save :size="15" /> {{ isNew ? 'Criar serviço' : 'Salvar' }}</button>
      <button v-if="service" class="button secondary" @click="store.updateService(service.id, { status: service.status === 'Ativo' ? 'Inativo' : 'Ativo' })">{{ service.status === 'Ativo' ? 'Inativar' : 'Reativar' }}</button>
      <button v-if="isNew" class="button secondary" @click="ui.closeRecord">Cancelar</button>
    </div>

    <template v-if="service">
      <div data-tour="service-usage">
      <h3 class="drawer-title">Onde é usado</h3>
      <button v-for="proposal in proposals" :key="proposal.id" class="list-row" @click="ui.openRecord('proposal', proposal.id)">
        <div><strong>{{ proposal.id }} · proposta</strong><span>{{ store.partnerName(proposal.partnerId) }}</span></div><StatusBadge :value="proposal.status" />
      </button>
      <button v-for="demand in demands" :key="demand.id" class="list-row" @click="ui.openRecord('demand', demand.id)">
        <div><strong>{{ demand.id }} · demanda</strong><span>{{ demand.description }}</span></div><StatusBadge :value="demand.status" />
      </button>
      <button v-for="entry in technical" :key="entry.id" class="list-row" @click="ui.openRecord('technical', entry.id)">
        <div><strong>{{ entry.id }} · assistência cobrada</strong><span>{{ store.partnerName(entry.partnerId) }} · {{ fmtCurrency(entry.chargeAmount ?? 0) }}</span></div><StatusBadge :value="entry.status" />
      </button>
      <p v-if="!proposals.length && !demands.length && !technical.length" class="empty-note">Ainda não usado em propostas, demandas ou chamados.</p>
      </div>
      <RecordTimeline :ref-id="service.id" />
    </template>
  </div>
</template>
