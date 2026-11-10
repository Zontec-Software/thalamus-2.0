<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowRightLeft, Building2, ClipboardCheck, Plus } from 'lucide-vue-next'
import StatusBadge from '../components/StatusBadge.vue'
import { ASSET_CONDITIONS, inventoryDivergent, MOVEMENT_REASONS } from '../domain/patrimony'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { Asset, AssetCondition, AssetInventory, AssetMovement, AssetMovementReason, Facility } from '../types/domain'
import { fmtCurrency, fmtDate, fmtDateTime } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const section = computed(() => String(route.params.secao ?? 'movimentacoes'))
const sections = [
  { id: 'movimentacoes', label: 'Movimentações' },
  { id: 'inventario', label: 'Inventário' },
  { id: 'instalacoes', label: 'Instalações e depreciação' },
]

const canManage = computed(() => store.can('modulo.patrimonio.gerir'))
const canApprove = computed(() => store.can('patrimonio.movimentacao.aprovar'))
const facilities = computed(() => store.state.facilities.filter(entry => entry.tenantId === ui.activeTenantId))
const assets = computed(() => store.state.assets.filter(entry => entry.status !== 'Baixado'))
const facilityName = (id?: string) => id ? facilities.value.find(entry => entry.id === id)?.name ?? id : '—'
const assetName = (id: string) => store.state.assets.find(entry => entry.id === id)?.name ?? id
const assetCode = (id: string) => store.state.assets.find(entry => entry.id === id)?.patrimonyCode ?? id

/* Movimentações */
const requesting = ref(false)
const movement = reactive({ assetId: '', reason: 'Transferência' as AssetMovementReason, toFacilityId: '', note: '' })
const cancelReasons = ref<Record<string, string>>({})
const movements = computed(() => store.state.assetMovements.filter(entry => entry.tenantId === ui.activeTenantId))
const openMovements = computed(() => movements.value.filter(entry => entry.status === 'Solicitada' || entry.status === 'Aprovada'))
const needsTarget = computed(() => movement.reason !== 'Baixa' && movement.reason !== 'Locação')
function request() {
  if (store.requestMovement({ ...movement, toFacilityId: needsTarget.value ? movement.toFacilityId : undefined })) {
    requesting.value = false
    Object.assign(movement, { assetId: '', toFacilityId: '', note: '' })
  }
}
function cancel(entry: AssetMovement) {
  if (store.cancelMovement(entry.id, cancelReasons.value[entry.id] ?? '')) cancelReasons.value[entry.id] = ''
}

/* Inventário */
const inventoryFacility = ref('')
const resolutions = ref<Record<string, string>>({})
const inventories = computed(() => store.state.assetInventories.filter(entry => entry.tenantId === ui.activeTenantId))
const counted = (inventory: AssetInventory) => inventory.lines.filter(entry => entry.found !== undefined).length
const lineKey = (inventory: AssetInventory, assetId: string) => `${inventory.id}:${assetId}`
function count(inventory: AssetInventory, assetId: string, found: boolean, condition?: AssetCondition) {
  store.countInventoryLine(inventory.id, assetId, found, condition)
}
function resolve(inventory: AssetInventory, assetId: string) {
  const key = lineKey(inventory, assetId)
  if (store.resolveInventoryLine(inventory.id, assetId, resolutions.value[key] ?? '')) resolutions.value[key] = ''
}

/* Instalações e depreciação */
const facilityForm = reactive({ id: '', code: '', name: '', kind: 'Área produtiva' as Facility['kind'], address: '', status: 'Ativo' as Facility['status'] })
const editingFacility = ref(false)
const depreciation = ref<Record<string, { acquisitionValue?: number; usefulLifeYears?: number; residualValue?: number }>>({})
function editFacility(facility?: Facility) {
  Object.assign(facilityForm, facility ? { ...facility, address: facility.address ?? '' } : { id: '', code: '', name: '', kind: 'Área produtiva', address: '', status: 'Ativo' })
  editingFacility.value = true
}
function saveFacility() {
  const { id, ...data } = facilityForm
  if (store.saveFacility({ ...data, id: id || undefined })) editingFacility.value = false
}
function startDepreciation(asset: Asset) {
  depreciation.value[asset.id] = { acquisitionValue: asset.acquisitionValue, usefulLifeYears: asset.usefulLifeYears, residualValue: asset.residualValue }
}
function saveDepreciation(asset: Asset) {
  if (store.setDepreciation(asset.id, { ...depreciation.value[asset.id] })) delete depreciation.value[asset.id]
}
const monthly = (asset: Asset) => asset.acquisitionValue && asset.usefulLifeYears ? (asset.acquisitionValue - (asset.residualValue ?? 0)) / (asset.usefulLifeYears * 12) : undefined
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <RouterLink v-for="entry in sections" :key="entry.id" class="chip" :class="{ active: section === entry.id }" :to="`/patrimonio/${entry.id}`">{{ entry.label }}</RouterLink>
    </div>
    <RouterLink class="button secondary" to="/ativos">Ver ativos</RouterLink>
  </div>

  <template v-if="section === 'movimentacoes'">
    <p class="hint">A localização do bem só muda pela movimentação concluída. Quem solicita não aprova; baixa sempre exige motivo.</p>
    <section class="metrics">
      <article class="metric"><div class="metric-head">Aguardando aprovação <ArrowRightLeft :size="17" /></div><strong>{{ movements.filter(entry => entry.status === 'Solicitada').length }}</strong><small>Aprovação de outra pessoa</small></article>
      <article class="metric"><div class="metric-head">Aprovadas a executar <ArrowRightLeft :size="17" /></div><strong>{{ movements.filter(entry => entry.status === 'Aprovada').length }}</strong><small>Concluir ao chegar no destino</small></article>
      <article class="metric"><div class="metric-head">Concluídas <ClipboardCheck :size="17" /></div><strong>{{ movements.filter(entry => entry.status === 'Concluída').length }}</strong><small>Histórico de localização</small></article>
    </section>

    <article class="card flush" data-tour="record-list">
      <div class="section-head">
        <div><h2>Movimentações</h2><p>{{ openMovements.length }} em aberto</p></div>
        <button v-if="canManage" class="button" @click="requesting = !requesting"><Plus :size="15" /> Solicitar movimentação</button>
      </div>
      <div v-if="requesting" class="inline-form">
        <div class="form-grid">
          <div class="field"><label>Bem</label><select v-model="movement.assetId"><option v-for="asset in assets" :key="asset.id" :value="asset.id">{{ asset.patrimonyCode ?? asset.id }} · {{ asset.name }} ({{ facilityName(asset.facilityId) }})</option></select></div>
          <div class="field"><label>Motivo</label><select v-model="movement.reason"><option v-for="reason in MOVEMENT_REASONS" :key="reason">{{ reason }}</option></select></div>
          <div v-if="needsTarget" class="field"><label>Destino</label><select v-model="movement.toFacilityId"><option v-for="facility in facilities.filter(entry => entry.status === 'Ativo')" :key="facility.id" :value="facility.id">{{ facility.code }} · {{ facility.name }}</option></select></div>
          <div class="field"><label>Observação</label><input v-model="movement.note" :placeholder="movement.reason === 'Baixa' || movement.reason === 'Outro' ? 'Obrigatória' : ''" /></div>
        </div>
        <div class="filter-row"><button class="button" @click="request">Solicitar</button><button class="button secondary" @click="requesting = false">Cancelar</button></div>
      </div>
      <table>
        <thead><tr><th>Movimentação</th><th>Bem</th><th>De → para</th><th>Solicitada</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          <tr v-for="entry in movements" :key="entry.id">
            <td><span class="cell-main">{{ entry.id }}</span><span class="cell-sub">{{ entry.reason }}{{ entry.note ? ` · ${entry.note}` : '' }}</span></td>
            <td><span class="cell-main">{{ assetCode(entry.assetId) }}</span><span class="cell-sub">{{ assetName(entry.assetId) }}</span></td>
            <td>{{ facilityName(entry.fromFacilityId) }} → {{ entry.reason === 'Baixa' ? 'baixa' : facilityName(entry.toFacilityId) }}</td>
            <td>{{ entry.requestedBy }}<span class="cell-sub">{{ fmtDateTime(entry.requestedAt) }}</span></td>
            <td><StatusBadge :value="entry.status" /><span v-if="entry.approvedBy" class="cell-sub">aprovada por {{ entry.approvedBy }}</span></td>
            <td>
              <div v-if="entry.status === 'Solicitada' || entry.status === 'Aprovada'" class="filter-row">
                <button v-if="entry.status === 'Solicitada' && canApprove" class="button small" :disabled="entry.requestedBy === ui.userName" :title="entry.requestedBy === ui.userName ? 'Quem solicitou não aprova' : ''" @click="store.approveMovement(entry.id)">Aprovar</button>
                <button v-if="entry.status === 'Aprovada' && canManage" class="button small" @click="store.completeMovement(entry.id)">Concluir</button>
                <input v-if="canManage" v-model="cancelReasons[entry.id]" class="filter" placeholder="Motivo do cancelamento" />
                <button v-if="canManage" class="button secondary small" :disabled="!cancelReasons[entry.id]?.trim()" @click="cancel(entry)">Cancelar</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!movements.length" class="empty-note">Nenhuma movimentação registrada.</p>
    </article>
  </template>

  <template v-else-if="section === 'inventario'">
    <p class="hint">Contagem por instalação. Sem divergência, concilia; com divergência, fica pendente até cada bem ter tratamento.</p>
    <article v-if="canManage" class="card">
      <div class="filter-row">
        <select v-model="inventoryFacility" class="filter"><option v-for="facility in facilities" :key="facility.id" :value="facility.id">{{ facility.code }} · {{ facility.name }}</option></select>
        <button class="button" :disabled="!inventoryFacility" @click="store.openInventory(inventoryFacility)"><Plus :size="15" /> Abrir inventário</button>
      </div>
    </article>
    <article v-for="inventory in inventories" :key="inventory.id" class="card flush">
      <div class="section-head">
        <div><h2>{{ inventory.id }} · {{ facilityName(inventory.facilityId) }}</h2><p>{{ fmtDate(inventory.date) }} · {{ inventory.responsible }} · {{ counted(inventory) }} de {{ inventory.lines.length }} contados</p></div>
        <div class="filter-row">
          <StatusBadge :value="inventory.status" />
          <button v-if="inventory.status === 'Em contagem' && canManage" class="button small" :disabled="counted(inventory) < inventory.lines.length" @click="store.closeInventoryCount(inventory.id)">Fechar contagem</button>
        </div>
      </div>
      <table>
        <thead><tr><th>Bem</th><th>Esperado</th><th>Contagem</th><th>Tratamento</th></tr></thead>
        <tbody>
          <tr v-for="line in inventory.lines" :key="line.assetId">
            <td><span class="cell-main">{{ assetCode(line.assetId) }}</span><span class="cell-sub">{{ assetName(line.assetId) }}</span></td>
            <td>{{ line.expectedCondition ?? 'Bom' }}</td>
            <td>
              <div v-if="inventory.status === 'Em contagem' && canManage" class="filter-row">
                <select class="filter" :value="line.found === false ? 'nao' : line.condition ?? ''" @change="(event) => { const value = (event.target as HTMLSelectElement).value; if (value === 'nao') count(inventory, line.assetId, false); else if (value) count(inventory, line.assetId, true, value as AssetCondition) }">
                  <option v-for="condition in ASSET_CONDITIONS" :key="condition" :value="condition">Encontrado · {{ condition }}</option>
                  <option value="nao">Não encontrado</option>
                </select>
              </div>
              <template v-else>
                <StatusBadge v-if="line.found !== undefined" :value="line.found ? (line.condition ?? 'Bom') : 'Não encontrado'" :tone="inventoryDivergent(line) ? 'danger' : 'success'" />
                <span v-else>—</span>
              </template>
            </td>
            <td>
              <span v-if="line.resolution">{{ line.resolution }}</span>
              <div v-else-if="inventory.status === 'Pendente' && inventoryDivergent(line) && canManage" class="filter-row">
                <input v-model="resolutions[lineKey(inventory, line.assetId)]" class="filter" placeholder="O que foi feito" />
                <button class="button small" :disabled="!resolutions[lineKey(inventory, line.assetId)]?.trim()" @click="resolve(inventory, line.assetId)">Tratar</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
    <p v-if="!inventories.length" class="empty-note">Nenhum inventário aberto.</p>
  </template>

  <template v-else>
    <article class="card flush">
      <div class="section-head">
        <div><h2>Instalações</h2><p>Onde os bens ficam. Instalação com bens não é inativada.</p></div>
        <button v-if="canManage" class="button" @click="editFacility()"><Building2 :size="15" /> Nova instalação</button>
      </div>
      <div v-if="editingFacility" class="inline-form">
        <div class="form-grid">
          <div class="field"><label>Código</label><input v-model="facilityForm.code" /></div>
          <div class="field"><label>Nome</label><input v-model="facilityForm.name" /></div>
          <div class="field"><label>Tipo</label><select v-model="facilityForm.kind"><option>Área produtiva</option><option>Depósito</option><option>Escritório</option><option>Utilidade</option><option>Outro</option></select></div>
          <div class="field"><label>Situação</label><select v-model="facilityForm.status"><option>Ativo</option><option>Indisponível</option><option>Em manutenção</option><option>Inativo</option></select></div>
        </div>
        <div class="filter-row"><button class="button" @click="saveFacility">Salvar</button><button class="button secondary" @click="editingFacility = false">Cancelar</button></div>
      </div>
      <table>
        <thead><tr><th>Instalação</th><th>Tipo</th><th>Bens</th><th>Situação</th><th></th></tr></thead>
        <tbody>
          <tr v-for="facility in facilities" :key="facility.id">
            <td><span class="cell-main">{{ facility.code }} · {{ facility.name }}</span></td>
            <td>{{ facility.kind }}</td>
            <td>{{ store.state.assets.filter(entry => entry.facilityId === facility.id && entry.status !== 'Baixado').length }}</td>
            <td><StatusBadge :value="facility.status" /></td>
            <td><button v-if="canManage" class="button secondary small" @click="editFacility(facility)">Editar</button></td>
          </tr>
        </tbody>
      </table>
    </article>

    <article class="card flush">
      <div class="section-head"><div><h2>Depreciação</h2><p>Só os parâmetros, método linear. O cálculo contábil fica fora do Thalamus.</p></div></div>
      <table>
        <thead><tr><th>Bem</th><th>Aquisição</th><th>Vida útil</th><th>Residual</th><th>Cota mensal</th><th></th></tr></thead>
        <tbody>
          <tr v-for="asset in assets" :key="asset.id">
            <td><span class="cell-main">{{ asset.patrimonyCode ?? asset.id }}</span><span class="cell-sub">{{ asset.name }} · {{ facilityName(asset.facilityId) }}</span></td>
            <template v-if="depreciation[asset.id]">
              <td><input v-model.number="depreciation[asset.id].acquisitionValue" class="filter" type="number" min="0" /></td>
              <td><input v-model.number="depreciation[asset.id].usefulLifeYears" class="filter" type="number" min="1" /></td>
              <td><input v-model.number="depreciation[asset.id].residualValue" class="filter" type="number" min="0" /></td>
              <td>—</td>
              <td><button class="button small" @click="saveDepreciation(asset)">Salvar</button></td>
            </template>
            <template v-else>
              <td>{{ asset.acquisitionValue ? fmtCurrency(asset.acquisitionValue) : '—' }}</td>
              <td>{{ asset.usefulLifeYears ? `${asset.usefulLifeYears} anos` : '—' }}</td>
              <td>{{ asset.residualValue !== undefined ? fmtCurrency(asset.residualValue) : '—' }}</td>
              <td>{{ monthly(asset) !== undefined ? fmtCurrency(monthly(asset)!) : '—' }}</td>
              <td><button v-if="canManage" class="button secondary small" @click="startDepreciation(asset)">Editar</button></td>
            </template>
          </tr>
        </tbody>
      </table>
    </article>
  </template>
</template>
