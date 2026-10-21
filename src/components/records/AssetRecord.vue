<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CalendarCog, PackagePlus, Wrench } from 'lucide-vue-next'
import RecordHeader from './RecordHeader.vue'
import RecordTimeline from './RecordTimeline.vue'
import StatusBadge from '../StatusBadge.vue'
import { addDays, today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Asset } from '../../types/domain'
import { daysUntil, fmtCurrency, fmtDate, fmtDateTime, fmtNumber } from '../../utils/format'

const props = defineProps<{ id: string; context: Record<string, string> }>()
const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const isNew = computed(() => props.id === 'new')
const asset = computed(() => store.state.assets.find(entry => entry.id === props.id))
const technicians = computed(() => store.state.users.filter(entry => entry.role === 'Manutenção' || entry.role === 'Líder de produção'))
const form = reactive({
  name: '', kind: 'Equipamento' as Asset['kind'], serial: '', manufacturer: '', location: 'Fábrica', resourceId: '',
  responsibleId: technicians.value[0]?.id ?? '', criticality: 'B' as Asset['criticality'], preventiveLimit: 250000,
  nextPreventive: addDays(today(), 90), value: 0, acquiredAt: today(),
})

function create() {
  const created = store.createAsset({
    ...form, resourceId: form.resourceId || undefined, serial: form.serial || undefined, manufacturer: form.manufacturer || undefined,
    preventiveLimit: form.kind === 'Molde' ? form.preventiveLimit : undefined, value: form.value || undefined,
  })
  if (created && created !== true) ui.openRecord('asset', created.id)
}

const maintenance = computed(() => store.state.maintenanceOrders.filter(entry => entry.assetId === props.id))
const openOrders = computed(() => maintenance.value.filter(entry => entry.status !== 'Concluída'))
const correctives = computed(() => maintenance.value.filter(entry => entry.type === 'Corretiva'))
const status = computed(() => openOrders.value.some(entry => entry.type === 'Corretiva') ? 'Em manutenção' : asset.value?.status ?? 'Operando')
const resourceId = computed(() => asset.value?.resourceId)
const ops = computed(() => resourceId.value ? store.state.productionOrders.filter(entry => entry.resourceId === resourceId.value && entry.status !== 'Concluída') : [])
const parts = computed(() => store.state.items.filter(entry => entry.moldId === props.id))
const downtimes = computed(() => resourceId.value ? store.state.downtimes.filter(entry => entry.resourceId === resourceId.value).slice(0, 5) : [])
const cycleUse = computed(() => asset.value?.preventiveLimit && asset.value.shots ? Math.round(asset.value.shots / asset.value.preventiveLimit * 100) : 0)
const opening = ref<'Corretiva' | 'Preventiva' | null>(null)
const description = ref('')

function openMaintenance() {
  if (!opening.value) return
  if (store.createMaintenance(props.id, opening.value, description.value || (opening.value === 'Preventiva' ? 'Preventiva programada pelo cadastro do ativo' : 'Corretiva aberta pelo cadastro do ativo'))) {
    opening.value = null
    description.value = ''
  }
}

function openOp(id: string) {
  ui.closeRecord()
  ui.opDrawer = id
}
</script>

<template>
  <template v-if="isNew">
    <RecordHeader eyebrow="Cadastros · novo ativo" title="Novo ativo" subtitle="Máquinas, moldes e equipamentos com responsável, criticidade e plano preventivo." />
    <div class="drawer-body">
      <div class="form-grid">
        <div class="field"><label>Nome</label><input v-model="form.name" placeholder="Ex.: Injetora 04 · Haitian 250 t" /></div>
        <div class="field"><label>Tipo</label><select v-model="form.kind"><option>Injetora</option><option>Molde</option><option>Equipamento</option></select></div>
        <div class="field"><label>Fabricante</label><input v-model="form.manufacturer" /></div>
        <div class="field"><label>Número de série</label><input v-model="form.serial" /></div>
        <div class="field"><label>Localização</label><input v-model="form.location" /></div>
        <div class="field"><label>Recurso produtivo</label><select v-model="form.resourceId"><option value="">Nenhum</option><option v-for="resource in store.state.resources" :key="resource.id" :value="resource.id">{{ resource.name }}</option></select><small>Liga o ativo à programação da fábrica</small></div>
        <div class="field"><label>Responsável</label><select v-model="form.responsibleId"><option v-for="user in technicians" :key="user.id" :value="user.id">{{ user.name }}</option></select></div>
        <div class="field"><label>Criticidade</label><select v-model="form.criticality"><option value="A">A · para a produção</option><option value="B">B · impacto parcial</option><option value="C">C · baixo impacto</option></select></div>
        <div v-if="form.kind === 'Molde'" class="field"><label>Limite de ciclos p/ preventiva</label><input v-model.number="form.preventiveLimit" type="number" min="0" step="10000" /></div>
        <div class="field"><label>Próxima preventiva</label><input v-model="form.nextPreventive" type="date" /></div>
        <div class="field"><label>Valor de aquisição (R$)</label><input v-model.number="form.value" type="number" min="0" /></div>
        <div class="field"><label>Data de aquisição</label><input v-model="form.acquiredAt" type="date" /></div>
      </div>
      <div class="drawer-actions">
        <button class="button" @click="create">Cadastrar ativo</button>
        <button class="button secondary" @click="ui.closeRecord">Cancelar</button>
      </div>
    </div>
  </template>

  <template v-else-if="asset">
    <RecordHeader :eyebrow="`Ativo · ${asset.kind} · criticidade ${asset.criticality ?? 'B'}`" :title="asset.name" :subtitle="`${asset.manufacturer ?? ''} ${asset.serial ? `· série ${asset.serial}` : ''} · ${asset.location ?? 'Fábrica'}`">
      <template #actions><StatusBadge :value="status" /></template>
    </RecordHeader>
    <div class="drawer-body">
      <div class="mini-stats four">
        <div class="mini-stat"><strong>{{ asset.shots !== undefined ? fmtNumber(asset.shots) : '—' }}</strong><span>{{ asset.preventiveLimit ? `de ${fmtNumber(asset.preventiveLimit)} ciclos` : 'ciclos' }}</span></div>
        <div class="mini-stat"><strong :class="{ 'risk-text': daysUntil(asset.nextPreventive) < 0 }">{{ fmtDate(asset.nextPreventive) }}</strong><span>{{ daysUntil(asset.nextPreventive) < 0 ? 'preventiva vencida' : `preventiva em ${daysUntil(asset.nextPreventive)} dias` }}</span></div>
        <div class="mini-stat"><strong>{{ correctives.length }}</strong><span>corretivas registradas</span></div>
        <div class="mini-stat"><strong>{{ store.userName(asset.responsibleId) }}</strong><span>responsável</span></div>
      </div>
      <template v-if="asset.preventiveLimit">
        <div class="progress wide" :class="{ danger: cycleUse >= 90 }"><span :style="{ width: `${Math.min(100, cycleUse)}%` }"></span></div>
        <p class="hint">{{ cycleUse }}% do limite de ciclos. Ao atingir 100%, o apontamento abre a preventiva automaticamente.</p>
      </template>

      <div class="drawer-actions" data-tour="asset-actions">
        <button class="button" @click="opening = 'Corretiva'"><Wrench :size="15" /> Abrir corretiva</button>
        <button class="button secondary" @click="opening = 'Preventiva'"><CalendarCog :size="15" /> Programar preventiva</button>
        <button class="button secondary" @click="ui.openRecord('demand', 'new', { origin: 'Manutenção', originId: openOrders[0]?.id ?? '', kind: 'Material' })"><PackagePlus :size="15" /> Solicitar peça</button>
        <select class="filter" :value="asset.status ?? 'Operando'" @change="store.updateAsset(asset.id, { status: ($event.target as HTMLSelectElement).value as Asset['status'] })"><option>Operando</option><option>Parado</option><option>Em manutenção</option></select>
      </div>
      <div v-if="opening" class="inline-form row">
        <input v-model="description" class="filter grow" :placeholder="`Descrição da ${opening.toLowerCase()}`" />
        <button class="button small" @click="openMaintenance">Abrir OS</button>
        <button class="button ghost small" @click="opening = null">Cancelar</button>
      </div>

      <div data-tour="asset-history">
      <h3 class="drawer-title">Ordens de manutenção</h3>
      <button v-for="order in maintenance" :key="order.id" class="list-row" @click="ui.closeRecord(); router.push('/manutencao')">
        <div><strong>{{ order.id }} · {{ order.type }}</strong><span>{{ order.description }} · {{ fmtDateTime(order.createdAt) }} · {{ order.origin }}</span></div><StatusBadge :value="order.status" />
      </button>
      <p v-if="!maintenance.length" class="empty-note">Nenhuma ordem registrada.</p>

      <template v-if="parts.length">
        <h3 class="drawer-title">Peças produzidas neste molde</h3>
        <div v-for="part in parts" :key="part.id" class="list-row static">
          <div><strong>{{ part.code }} · {{ part.name }}</strong><span>Ciclo {{ part.cycleSeconds }} s · {{ part.cavities }} cavidade(s) · estoque {{ part.stock }}</span></div>
        </div>
      </template>

      <template v-if="resourceId">
        <h3 class="drawer-title">Programação em {{ store.resourceName(resourceId) }}</h3>
        <button v-for="op in ops" :key="op.id" class="list-row inj" @click="openOp(op.id)">
          <div><strong>{{ op.id }} · {{ store.itemLabel(op.itemId) }}</strong><span>{{ op.quantity }} un. · {{ fmtDate(op.scheduledDate) }}</span></div><StatusBadge :value="op.status" />
        </button>
        <p v-if="!ops.length" class="empty-note">Nenhuma OP programada.</p>
        <template v-if="downtimes.length">
          <h3 class="drawer-title">Paradas recentes</h3>
          <div v-for="stop in downtimes" :key="stop.id" class="list-row static"><div><strong>{{ stop.reason }}</strong><span>{{ stop.opId }} · {{ fmtDateTime(stop.start) }}{{ stop.end ? '' : ' · em aberto' }}</span></div></div>
        </template>
      </template>
      </div>

      <h3 class="drawer-title">Patrimônio</h3>
      <div class="card kv-card">
        <div class="kv"><span>Valor de aquisição</span><b>{{ asset.value ? fmtCurrency(asset.value) : '—' }}</b></div>
        <div class="kv"><span>Aquisição</span><b>{{ asset.acquiredAt ? fmtDate(asset.acquiredAt) : '—' }}</b></div>
        <div class="kv"><span>Localização</span><b>{{ asset.location ?? '—' }}</b></div>
      </div>

      <RecordTimeline :ref-id="asset.id" />
    </div>
  </template>
  <p v-else class="empty-note">Ativo não encontrado.</p>
</template>
