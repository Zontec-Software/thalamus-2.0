<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { catalogOf, toolingIssues } from '../../../domain/catalog'
import { moldMinutesPerPiece, toolLife, toolUsers } from '../../../domain/engineering'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item, Tooling } from '../../../types/domain'
import { fmtNumber } from '../../../utils/format'
import PermHint from '../PermHint.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const catalog = computed(() => catalogOf(props.item))
const disabled = computed(() => readOnly(props.item, ui.role, 'ferramental'))
const blank = (): Tooling => ({ kind: 'Molde', cavities: 1, activeCavities: 1, cycleSeconds: 30, shotWeightG: 0, compatibleResourceIds: [], owner: 'Roboflex', ownerName: '', assetId: '', lifeShots: 0, value: props.item.cost })
const form = reactive<Tooling>(blank())
watch(() => [props.item.id, catalog.value.version], () => {
  Object.assign(form, blank(), catalog.value.tooling ? { ...catalog.value.tooling, compatibleResourceIds: [...catalog.value.tooling.compatibleResourceIds], ownerName: catalog.value.tooling.ownerName ?? '', assetId: catalog.value.tooling.assetId ?? '' } : {})
}, { immediate: true })

const resources = computed(() => store.state.resources.filter(resource => form.kind === 'Molde' ? resource.kind === 'Injetora' : resource.kind !== 'Injetora'))
const assets = computed(() => store.state.assets.filter(asset => asset.kind === (form.kind === 'Molde' ? 'Molde' : 'Equipamento') || asset.id === form.assetId))
const issues = computed(() => toolingIssues(catalog.value.tooling))
const life = computed(() => toolLife(store.state, props.item))
const users = computed(() => toolUsers(store.state, props.item.id))
const piece = computed(() => form.kind === 'Molde' && form.cycleSeconds > 0 ? moldMinutesPerPiece(form) : 0)
const perHour = computed(() => piece.value ? 60 / piece.value : 0)
const blocked = computed(() => form.kind === 'Molde' ? form.cavities - form.activeCavities : 0)

function toggle(resourceId: string) {
  const index = form.compatibleResourceIds.indexOf(resourceId)
  if (index >= 0) form.compatibleResourceIds.splice(index, 1)
  else form.compatibleResourceIds.push(resourceId)
}
function save() {
  store.saveTooling(props.item.id, { ...form, compatibleResourceIds: [...form.compatibleResourceIds], assetId: form.assetId || undefined, ownerName: form.ownerName || undefined })
}
</script>

<template>
  <PermHint :item="item" layer="ferramental" />
  <p v-if="issues.length" class="notice warning" style="margin-top:0">Para entrar em roteiro: {{ issues.join('; ') }}.</p>

  <form data-tour="product-tooling" @submit.prevent="save">
    <fieldset class="layer" :disabled="disabled">
      <div class="form-grid three">
        <div class="field"><label>Tipo</label><select v-model="form.kind"><option>Molde</option><option>Gabarito</option><option>Dispositivo</option></select></div>
        <template v-if="form.kind === 'Molde'">
          <div class="field"><label>Cavidades nominais</label><input v-model.number="form.cavities" type="number" min="1" step="1" /></div>
          <div class="field"><label>Cavidades ativas</label><input v-model.number="form.activeCavities" type="number" min="1" :max="form.cavities" step="1" /><small>{{ blocked ? `${blocked} bloqueada(s). ` : '' }}Bloqueie cavidade com defeito sem mudar o molde.</small></div>
          <div class="field"><label>Ciclo padrão (s)</label><input v-model.number="form.cycleSeconds" type="number" min="0.1" step="0.1" /><small v-if="piece">{{ fmtNumber(piece * 60, 1) }} s por peça · {{ fmtNumber(perHour, 0) }} peças/h</small></div>
          <div class="field"><label>Peso do golpe (g)</label><input v-model.number="form.shotWeightG" type="number" min="0" step="0.1" /><small>Peças + canal de alimentação.</small></div>
          <div class="field"><label>Vida útil (golpes)</label><input v-model.number="form.lifeShots" type="number" min="0" step="1000" /></div>
        </template>
        <div class="field"><label>Dono</label><select v-model="form.owner"><option>Roboflex</option><option>Cliente</option></select></div>
        <div v-if="form.owner === 'Cliente'" class="field"><label>Cliente dono</label><input v-model="form.ownerName" /></div>
        <div class="field"><label>Valor do ferramental (R$)</label><input v-model.number="form.value" type="number" min="0" step="100" /><small v-if="life.life && form.owner === 'Roboflex'">Desgaste de R$ {{ fmtNumber(form.value / life.life / Math.max(1, form.activeCavities), 4) }} por peça no custo.</small><small v-else>Com vida útil, vira desgaste por peça no custo.</small></div>
        <div class="field"><label>Ativo na manutenção</label>
          <select v-model="form.assetId"><option value="">Não vinculado</option><option v-for="asset in assets" :key="asset.id" :value="asset.id">{{ asset.name }}</option></select>
          <small>O contador de golpes e a preventiva vêm da manutenção.</small>
        </div>
      </div>
      <div class="field">
        <label>{{ form.kind === 'Molde' ? 'Injetoras compatíveis' : 'Postos compatíveis' }}</label>
        <div class="chip-row">
          <button v-for="resource in resources" :key="resource.id" type="button" class="chip" :class="{ active: form.compatibleResourceIds.includes(resource.id) }" @click="toggle(resource.id)">{{ resource.name }}</button>
        </div>
      </div>
      <button class="button" type="submit">Salvar ferramental</button>
    </fieldset>
  </form>

  <h3 class="drawer-title">Roteiros que usam este ferramental</h3>
  <table v-if="users.length" class="dense">
    <thead><tr><th>Item</th><th>Operação</th><th>Posto</th><th>Tempo por peça</th></tr></thead>
    <tbody>
      <template v-for="user in users" :key="user.id">
        <tr v-for="step in user.routing!.filter(entry => entry.toolId === item.id)" :key="`${user.id}-${step.id}`">
          <td><RouterLink :to="`/produtos/item/${user.id}?aba=manufatura`" class="cell-main code">{{ user.code }}</RouterLink><span class="cell-sub">{{ user.name }}</span></td>
          <td>{{ step.name }}</td>
          <td>{{ store.resourceName(step.resourceId) }}</td>
          <td>{{ fmtNumber(step.minutesPerUnit * 60, 1) }} s</td>
        </tr>
      </template>
    </tbody>
  </table>
  <p v-else class="empty-note">Nenhum roteiro vigente usa este ferramental.</p>
  <p class="cell-sub" style="margin-top:6px">Mudar cavidades ativas ou ciclo recalcula na hora o tempo por peça dos roteiros vigentes. OPs já abertas mantêm o tempo com que nasceram.</p>
</template>
