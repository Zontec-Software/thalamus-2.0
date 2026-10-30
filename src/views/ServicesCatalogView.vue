<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BriefcaseBusiness, Building2, ChevronRight, CircleDollarSign, Factory, Plus, Search, Upload } from 'lucide-vue-next'
import CrumbBack from '../components/CrumbBack.vue'
import RecordTimeline from '../components/records/RecordTimeline.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { roleIsOpen } from '../domain/partners'
import { PLACE_LABEL, currentInstruction, serviceRoutingUses } from '../domain/services'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { ServiceCatalogItem, ServiceExecutor, ServicePlace } from '../types/domain'
import { fmtCurrency } from '../utils/format'

type UseFilter = '' | 'sellable' | 'os' | 'routing' | 'terceiro'
type Tab = 'cadastro' | 'uso' | 'historico'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const query = ref('')
const use = ref<UseFilter>('')
const tab = ref<Tab>('cadastro')
const picked = ref<string[]>([])
const datasheetInput = ref<HTMLInputElement | null>(null)
const openedForTour = ref(false)

const selectedId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const isNew = computed(() => selectedId.value === 'novo')
const own = computed(() => store.state.services.filter(entry => entry.tenantId === ui.activeTenantId))
const service = computed(() => own.value.find(entry => entry.id === selectedId.value))
const suppliers = computed(() => store.state.partners.filter(entry => roleIsOpen(entry, 'Fornecedor')))
const sectors = computed(() => store.state.sectors)

const form = reactive({
  name: '', description: '', unit: 'hora' as 'hora' | 'un' | 'visita',
  place: 'Roboflex' as ServicePlace, executor: 'Própria' as ServiceExecutor,
  sellable: false, usableInServiceOrder: false, usableInRouting: false,
  sectorId: '', teamLabel: '', instruction: '', estimatedMinutes: null as number | null,
  datasheetName: '', supplierId: '', cost: 0, price: 0, fiscalNote: '',
})

const counts = computed(() => ({
  all: own.value.length,
  sellable: own.value.filter(entry => entry.sellable).length,
  os: own.value.filter(entry => entry.usableInServiceOrder).length,
  routing: own.value.filter(entry => entry.usableInRouting).length,
  terceiro: own.value.filter(entry => entry.executor === 'Terceirizado').length,
  propria: own.value.filter(entry => entry.executor === 'Própria').length,
  active: own.value.filter(entry => entry.status === 'Ativo').length,
}))
const FILTERS: { id: UseFilter; label: string; count: number }[] = [
  { id: '', label: 'Todos', count: 0 },
  { id: 'sellable', label: 'Venda', count: 0 },
  { id: 'os', label: 'Ordem de serviço', count: 0 },
  { id: 'routing', label: 'Roteiro', count: 0 },
  { id: 'terceiro', label: 'Terceirizado', count: 0 },
]
const filters = computed(() => FILTERS.map(entry => ({ ...entry, count: entry.id === '' ? counts.value.all : entry.id === 'sellable' ? counts.value.sellable : entry.id === 'os' ? counts.value.os : entry.id === 'routing' ? counts.value.routing : counts.value.terceiro })))
const listed = computed(() => own.value.filter(entry => {
  const uses = !use.value
    || (use.value === 'sellable' && entry.sellable)
    || (use.value === 'os' && entry.usableInServiceOrder)
    || (use.value === 'routing' && entry.usableInRouting)
    || (use.value === 'terceiro' && entry.executor === 'Terceirizado')
  const text = !query.value || `${entry.code} ${entry.name}`.toLowerCase().includes(query.value.toLowerCase())
  return uses && text
}))

function useLabels(entry: ServiceCatalogItem) {
  return [entry.sellable ? 'Venda' : '', entry.usableInServiceOrder ? 'OS' : '', entry.usableInRouting ? 'Roteiro' : ''].filter(Boolean)
}
function blank() {
  Object.assign(form, {
    name: '', description: '', unit: 'hora', place: 'Roboflex', executor: 'Própria',
    sellable: false, usableInServiceOrder: false, usableInRouting: false,
    sectorId: '', teamLabel: '', instruction: '', estimatedMinutes: null,
    datasheetName: '', supplierId: '', cost: 0, price: 0, fiscalNote: '',
  })
}
function fill(entry: ServiceCatalogItem) {
  Object.assign(form, {
    name: entry.name, description: entry.description ?? '', unit: entry.unit, place: entry.place, executor: entry.executor,
    sellable: entry.sellable, usableInServiceOrder: entry.usableInServiceOrder, usableInRouting: entry.usableInRouting,
    sectorId: entry.sectorId ?? '', teamLabel: entry.teamLabel ?? '', instruction: currentInstruction(entry)?.text ?? '',
    estimatedMinutes: entry.estimatedMinutes ?? null, datasheetName: entry.datasheetName ?? '', supplierId: entry.supplierId ?? '',
    cost: entry.cost, price: entry.price, fiscalNote: entry.fiscalNote ?? '',
  })
}

watch(selectedId, () => {
  tab.value = 'cadastro'
  picked.value = []
  if (isNew.value) blank()
  else if (service.value) fill(service.value)
}, { immediate: true })
watch(service, value => { if (value && selectedId.value === value.id) fill(value) })

watch(() => ui.tourSteps[ui.tourIndex]?.target, target => {
  const wantsForm = !!target?.includes('service-form')
  const wantsUsage = !!target?.includes('service-usage')
  if ((wantsForm || wantsUsage) && !selectedId.value) {
    const first = own.value.find(entry => entry.usableInRouting) ?? own.value[0]
    if (!first) return
    openedForTour.value = true
    router.push(`/servicos/${first.id}`)
  } else if (!wantsForm && !wantsUsage && openedForTour.value) {
    openedForTour.value = false
    if (selectedId.value) router.push('/servicos')
  }
  if (wantsUsage) tab.value = 'uso'
  if (wantsForm) tab.value = 'cadastro'
})

const showCommercial = computed(() => form.sellable || form.usableInServiceOrder)
const routingUses = computed(() => service.value ? serviceRoutingUses(store.state, service.value.id) : [])
const productIds = computed(() => [...new Set(routingUses.value.filter(row => {
  const item = store.state.items.find(entry => entry.id === row.itemId)
  return item?.routing?.some(step => step.serviceId === service.value?.id)
}).map(row => row.itemId))])
const orders = computed(() => store.state.productionOrders.filter(order => productIds.value.includes(order.itemId)))
const proposals = computed(() => store.state.proposals.filter(entry => entry.lines.some(line => line.serviceId === service.value?.id)))
const demands = computed(() => store.state.demands.filter(entry => entry.serviceId === service.value?.id))
const appearances = computed(() => routingUses.value.length + proposals.value.length + demands.value.length)
const sectorName = (id?: string) => store.state.sectors.find(entry => entry.id === id)?.name ?? '—'
const draftOf = (itemId: string) => store.state.productRevisions.find(entry => entry.itemId === itemId && entry.status === 'Rascunho')
const itemOf = (id: string) => store.state.items.find(entry => entry.id === id)

function payload() {
  return {
    name: form.name, description: form.description, unit: form.unit, place: form.place, executor: form.executor,
    sellable: form.sellable, usableInServiceOrder: form.usableInServiceOrder, usableInRouting: form.usableInRouting,
    sectorId: form.sectorId || undefined, teamLabel: form.teamLabel, instruction: form.instruction,
    estimatedMinutes: typeof form.estimatedMinutes === 'number' && !Number.isNaN(form.estimatedMinutes) ? form.estimatedMinutes : undefined,
    datasheetName: form.datasheetName, supplierId: form.supplierId || undefined,
    cost: Number(form.cost) || 0, price: Number(form.price) || 0, fiscalNote: form.fiscalNote,
  }
}
function save() {
  if (isNew.value) {
    const created = store.createService(payload())
    if (created && created !== true) router.push(`/servicos/${created.id}`)
    return
  }
  if (service.value) store.updateService(service.value.id, payload())
}
function onDatasheet(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) form.datasheetName = file.name
}
function applyChange(mode: 'mesmos' | 'novo') {
  if (!service.value) return
  const result = store.openServiceRoutingChange(service.value.id, picked.value, mode)
  picked.value = []
  if (result && result !== true && mode === 'novo') router.push(`/servicos/${result.serviceId}`)
}
</script>

<template>
  <article v-if="!selectedId" class="card flush" data-tour="record-list">
    <div class="section-head">
      <div data-tour="service-idea">
        <h2>Serviços</h2>
        <p>Um cadastro por serviço. Venda, ordem de serviço e roteiro são usos, independentes do local e de quem executa.</p>
      </div>
      <button data-tour="new-record" class="button" @click="router.push('/servicos/novo')"><Plus :size="15" /> Novo serviço</button>
    </div>
    <div class="partner-filters">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Código ou serviço" /></label>
      <div class="chip-row" style="margin:0">
        <button v-for="entry in filters" :key="entry.id" type="button" class="chip" :class="{ active: use === entry.id }" @click="use = entry.id">{{ entry.label }} <b>{{ entry.count }}</b></button>
      </div>
    </div>
    <section class="metrics" style="padding: 0 18px 4px">
      <article class="metric"><div class="metric-head">Ativos <BriefcaseBusiness :size="17" /></div><strong>{{ counts.active }}</strong><small>Um cadastro, vários usos</small></article>
      <article class="metric"><div class="metric-head">Equipe própria <Factory :size="17" /></div><strong>{{ counts.propria }}</strong><small>O local não muda quem executa</small></article>
      <article class="metric"><div class="metric-head">Terceirizados <Building2 :size="17" /></div><strong>{{ counts.terceiro }}</strong><small>Execução por fornecedor</small></article>
      <article class="metric"><div class="metric-head">Vendáveis <CircleDollarSign :size="17" /></div><strong>{{ counts.sellable }}</strong><small>Podem entrar em proposta</small></article>
    </section>
    <table class="dense">
      <thead><tr><th>Serviço</th><th>Usos</th><th>Local</th><th>Executor</th><th>Tempo estimado</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="entry in listed" :key="entry.id" class="clickable" @click="router.push(`/servicos/${entry.id}`)">
          <td><span class="cell-main">{{ entry.name }}</span><span class="cell-sub code">{{ entry.code }}</span></td>
          <td>
            <div class="role-tags">
              <span v-for="label in useLabels(entry)" :key="label" class="role-tag on">{{ label }}</span>
              <span v-if="!useLabels(entry).length" class="cell-sub">Nenhum</span>
            </div>
          </td>
          <td>{{ PLACE_LABEL[entry.place] }}</td>
          <td>{{ entry.executor === 'Terceirizado' ? `Terceirizado${entry.supplierId ? ` · ${store.partnerName(entry.supplierId)}` : ''}` : 'Equipe própria' }}</td>
          <td>{{ entry.estimatedMinutes != null ? `${entry.estimatedMinutes} min` : 'Não informado' }}</td>
          <td><StatusBadge :value="entry.status" /></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!listed.length" class="empty-note">Nenhum serviço com esse filtro.</p>
  </article>

  <template v-else>
    <nav class="crumb-bar" aria-label="Caminho">
      <CrumbBack fallback="/servicos" title="Voltar para Serviços" />
      <RouterLink to="/servicos" class="crumb">Serviços</RouterLink>
      <ChevronRight :size="14" class="sep" />
      <span class="crumb here">{{ isNew ? 'Novo serviço' : service ? `${service.code} · ${service.name}` : 'Serviço não encontrado' }}</span>
    </nav>

    <div v-if="!isNew && !service" class="card empty-note">
      Serviço não encontrado.
      <div style="margin-top:10px"><RouterLink to="/servicos" class="button secondary">Voltar à lista</RouterLink></div>
    </div>

    <template v-else>
      <article v-if="service" class="card item-hero">
        <div class="item-head">
          <div class="item-photo placeholder">SV</div>
          <div class="item-head-main">
            <span class="eyebrow">{{ service.code }} · unidade {{ service.unit }}</span>
            <h2>{{ service.name }}</h2>
            <div class="meta">
              <span>{{ PLACE_LABEL[service.place] }}</span>
              <span>{{ service.executor === 'Terceirizado' ? 'Fornecedor terceirizado' : 'Equipe própria' }}</span>
              <span v-if="service.sectorId">Setor <b>{{ sectorName(service.sectorId) }}</b></span>
            </div>
            <div class="role-tags" style="margin-top:8px">
              <span v-for="label in useLabels(service)" :key="label" class="role-tag on">{{ label }}</span>
              <span v-if="!useLabels(service).length" class="role-tag draft">Nenhum uso</span>
            </div>
          </div>
          <div class="actions">
            <StatusBadge :value="service.status" />
            <button class="button secondary small" @click="store.setServiceStatus(service.id, service.status === 'Ativo' ? 'Inativo' : 'Ativo')">{{ service.status === 'Ativo' ? 'Inativar' : 'Reativar' }}</button>
          </div>
        </div>
        <div class="kpi-strip">
          <button type="button" class="kpi link" @click="tab = 'cadastro'"><span>Tempo estimado</span><strong>{{ service.estimatedMinutes != null ? `${service.estimatedMinutes} min` : '—' }}</strong><small>Informado no cadastro</small></button>
          <button type="button" class="kpi" disabled><span>Média apontada</span><strong class="pending-value">Sem fórmula</strong><small>Não é calculada</small></button>
          <button type="button" class="kpi link" @click="tab = 'uso'"><span>Onde aparece</span><strong>{{ appearances }}</strong><small>Roteiro, proposta e demanda</small></button>
          <button type="button" class="kpi link" @click="tab = 'cadastro'"><span>Preço informado</span><strong>{{ service.sellable || service.usableInServiceOrder ? (service.price ? fmtCurrency(service.price) : 'Sem preço') : '—' }}</strong><small>Sem lista e sem cálculo</small></button>
        </div>
      </article>

      <article class="card">
        <div v-if="service" class="tabs">
          <button type="button" :class="{ active: tab === 'cadastro' }" @click="tab = 'cadastro'">Cadastro</button>
          <button type="button" :class="{ active: tab === 'uso' }" @click="tab = 'uso'">Uso<b v-if="appearances">{{ appearances }}</b></button>
          <button type="button" :class="{ active: tab === 'historico' }" @click="tab = 'historico'">Histórico<b v-if="service.instructions.length">{{ service.instructions.length }}</b></button>
        </div>

        <div v-if="isNew || tab === 'cadastro'" data-tour="service-form">
          <h2 v-if="isNew" style="margin-bottom:4px">Novo serviço</h2>
          <p v-if="isNew" class="cell-sub" style="margin-bottom:14px">Os usos, o local e quem executa são independentes. A categoria oficial ainda não foi definida.</p>
          <div class="partner-split">
            <section>
              <h3 class="partner-h">Identificação</h3>
              <div class="form-grid">
                <div class="field wide"><label>Nome</label><input v-model="form.name" /></div>
                <div class="field wide"><label>Descrição</label><textarea v-model="form.description" rows="2"></textarea></div>
                <div class="field"><label>Unidade</label><select v-model="form.unit"><option value="hora">hora</option><option value="un">un</option><option value="visita">visita</option></select><small>A lista oficial ainda não foi definida.</small></div>
                <div class="field"><label>Local habitual</label><select v-model="form.place"><option value="Roboflex">Instalações da Roboflex</option><option value="Cliente">Instalações do cliente</option><option value="Outro">Outro local</option></select></div>
                <div class="field wide"><label>Quem executa</label><select v-model="form.executor"><option value="Própria">Equipe própria</option><option value="Terceirizado">Fornecedor terceirizado</option></select><small>Trabalho no cliente feito pela Roboflex continua sendo equipe própria.</small></div>
              </div>
            </section>
            <section>
              <h3 class="partner-h">Usos</h3>
              <div class="role-cards">
                <div class="role-card" :class="form.sellable ? 'on' : 'none'">
                  <div><strong>Vendável</strong><span>Pode entrar em proposta. Abre preço e cenário fiscal.</span></div>
                  <button type="button" class="button secondary small" @click="form.sellable = !form.sellable">{{ form.sellable ? 'Retirar' : 'Marcar' }}</button>
                </div>
                <div class="role-card" :class="form.usableInServiceOrder ? 'on' : 'none'">
                  <div><strong>Ordem de serviço</strong><span>Pode ser requisitado numa OS. Abre preço e cenário fiscal.</span></div>
                  <button type="button" class="button secondary small" @click="form.usableInServiceOrder = !form.usableInServiceOrder">{{ form.usableInServiceOrder ? 'Retirar' : 'Marcar' }}</button>
                </div>
                <div class="role-card" :class="form.usableInRouting ? 'on' : 'none'">
                  <div><strong>Roteiro de produção</strong><span>Pode compor uma operação. A consulta reversa fica na aba Uso.</span></div>
                  <button type="button" class="button secondary small" @click="form.usableInRouting = !form.usableInRouting">{{ form.usableInRouting ? 'Retirar' : 'Marcar' }}</button>
                </div>
              </div>
              <p v-if="!form.sellable && !form.usableInServiceOrder && !form.usableInRouting" class="cell-sub" style="margin-top:10px">Nenhum uso marcado. Quais são obrigatórios ainda não foi definido.</p>
            </section>
          </div>

          <div class="partner-split" style="margin-top:22px">
            <section v-if="form.executor === 'Própria'">
              <h3 class="partner-h">Equipe própria</h3>
              <div class="form-grid">
                <div class="field"><label>Setor responsável</label><select v-model="form.sectorId"><option value="">Não informado</option><option v-for="sector in sectors" :key="sector.id" :value="sector.id">{{ sector.name }}</option></select></div>
                <div class="field"><label>Equipe padrão</label><input v-model="form.teamLabel" placeholder="Quando houver" /><small>O subsetor oficial ainda não foi definido.</small></div>
                <div class="field wide"><label>Instrução técnica vigente</label><textarea v-model="form.instruction" rows="3"></textarea><small>Mudar o texto grava uma versão nova. As anteriores ficam na aba Histórico.</small></div>
              </div>
            </section>
            <section v-else>
              <h3 class="partner-h">Terceirizado</h3>
              <div class="field"><label>Datasheet</label><input ref="datasheetInput" type="file" hidden @change="onDatasheet" /><div class="filter-row"><button class="button secondary small" type="button" @click="datasheetInput?.click()"><Upload :size="13" /> {{ form.datasheetName ? 'Trocar arquivo' : 'Informar arquivo' }}</button><span class="cell-sub">{{ form.datasheetName || 'Nenhum arquivo informado' }}</span></div><small>Obrigatório para gravar. Nesta demonstração fica só o nome do arquivo. Formato e aprovador ainda não foram definidos.</small></div>
              <div class="field"><label>Fornecedor de referência</label><select v-model="form.supplierId"><option value="">A definir na compra</option><option v-for="entry in suppliers" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select><small>O desenho da compra ainda não foi definido.</small></div>
            </section>
            <section>
              <h3 class="partner-h">{{ showCommercial ? 'Preço, custo e tempo' : 'Custo e tempo' }}</h3>
              <div class="form-grid">
                <div class="field"><label>Custo informado (R$)</label><input v-model.number="form.cost" type="number" min="0" step="0.01" /></div>
                <div v-if="showCommercial" class="field"><label>Preço informado (R$)</label><input v-model.number="form.price" type="number" min="0" step="0.01" /><small>Não há lista nem regra de cálculo.</small></div>
                <div v-if="showCommercial" class="field wide"><label>Cenário fiscal</label><input v-model="form.fiscalNote" placeholder="Texto livre, quando houver classificação" /><small>Alíquota e validação por transação ainda não foram definidas.</small></div>
                <div class="field"><label>Tempo estimado (min)</label><input v-model.number="form.estimatedMinutes" type="number" min="0" step="1" /><small>A média dos apontamentos não é calculada.</small></div>
              </div>
            </section>
          </div>
          <div class="drawer-actions">
            <button class="button" @click="save">{{ isNew ? 'Criar serviço' : 'Salvar' }}</button>
            <RouterLink v-if="isNew" to="/servicos" class="button secondary">Cancelar</RouterLink>
          </div>
        </div>

        <div v-else-if="service && tab === 'uso'" data-tour="service-usage">
          <h3 class="partner-h">Roteiros e revisões</h3>
          <p class="cell-sub">A operação guarda a versão da instrução do momento em que foi gravada. A revisão liberada não é reescrita por esta tela.</p>
          <div v-if="routingUses.length" class="table-scroll">
            <table class="dense">
              <thead><tr><th>Produto</th><th>Operação</th><th>Revisão</th><th>Instrução</th></tr></thead>
              <tbody>
                <tr v-for="row in routingUses" :key="`${row.revisionId ?? 'item'}-${row.stepId}`">
                  <td><RouterLink :to="`/produtos/item/${row.itemId}`" class="code">{{ row.itemCode }}</RouterLink><span class="cell-sub">{{ row.itemName }}</span></td>
                  <td>{{ row.stepName }}</td>
                  <td>{{ row.revisionCode }} · {{ row.revisionStatus }}</td>
                  <td>{{ row.instructionVersion ? `v${row.instructionVersion}` : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-note">Nenhum roteiro aponta para este serviço.</p>

          <h3 class="partner-h" style="margin-top:18px">Propostas e demandas</h3>
          <div v-if="proposals.length || demands.length" class="table-scroll">
            <table class="dense">
              <thead><tr><th>Registro</th><th>Com quem</th><th>Situação</th></tr></thead>
              <tbody>
                <tr v-for="proposal in proposals" :key="proposal.id" class="clickable" @click="ui.openRecord('proposal', proposal.id)">
                  <td class="code">{{ proposal.id }} · proposta</td>
                  <td>{{ store.partnerName(proposal.partnerId) }}</td>
                  <td><StatusBadge :value="proposal.status" /></td>
                </tr>
                <tr v-for="demand in demands" :key="demand.id" class="clickable" @click="ui.openRecord('demand', demand.id)">
                  <td class="code">{{ demand.id }} · demanda</td>
                  <td>{{ demand.description }}</td>
                  <td><StatusBadge :value="demand.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="empty-note">Nenhuma proposta ou demanda.</p>

          <template v-if="productIds.length">
            <h3 class="partner-h" style="margin-top:18px">Alterar nos produtos</h3>
            <p class="cell-sub">Abre um rascunho de versão no cadastro do produto. Publicar continua lá. A troca automática das ordens espera a definição de quais situações contam como em andamento e quais contam como criadas sem início.</p>
            <div class="role-cards" style="margin: 10px 0">
              <label v-for="itemId in productIds" :key="itemId" class="role-card" :class="draftOf(itemId) ? 'off' : picked.includes(itemId) ? 'on' : 'none'">
                <div>
                  <strong>{{ itemOf(itemId)?.code }} · {{ itemOf(itemId)?.name }}</strong>
                  <span v-if="draftOf(itemId)">Já tem a versão {{ draftOf(itemId)?.code }} em rascunho. Conclua ou descarte no produto antes de abrir outra.</span>
                  <span v-else>Roteiro vigente usa este serviço.</span>
                </div>
                <input v-model="picked" type="checkbox" :value="itemId" :disabled="!!draftOf(itemId)" />
              </label>
            </div>
            <div class="drawer-actions">
              <button class="button secondary" type="button" :disabled="!picked.length" @click="applyChange('mesmos')">Abrir versão nos marcados</button>
              <button class="button secondary" type="button" :disabled="!picked.length" @click="applyChange('novo')">Criar serviço novo só para os marcados</button>
            </div>
            <h3 class="partner-h" style="margin-top:18px">Ordens destes produtos</h3>
            <p class="cell-sub">Nenhuma ordem já criada é trocada daqui.</p>
            <div v-if="orders.length" class="table-scroll">
              <table class="dense">
                <thead><tr><th>Ordem</th><th>Situação</th><th>Revisão</th></tr></thead>
                <tbody>
                  <tr v-for="order in orders" :key="order.id">
                    <td class="code">{{ order.id }}</td>
                    <td>{{ order.status }}</td>
                    <td>{{ store.state.productRevisions.find(entry => entry.id === order.revisionId)?.code ?? '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="empty-note">Nenhuma ordem destes produtos.</p>
          </template>
        </div>

        <div v-else-if="service && tab === 'historico'">
          <h3 class="partner-h">Instruções</h3>
          <div class="info-cards">
            <div v-for="entry in [...service.instructions].reverse()" :key="entry.version" class="info-card">
              <strong>Versão {{ entry.version }}</strong>
              <span>{{ entry.text }}</span>
              <span>{{ entry.origin }} · {{ entry.author }}</span>
            </div>
            <p v-if="!service.instructions.length" class="empty-note">Nenhuma instrução gravada.</p>
          </div>
          <RecordTimeline :ref-id="service.id" />
        </div>
      </article>
    </template>
  </template>
</template>
