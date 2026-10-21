<script setup lang="ts">
import { computed, ref } from 'vue'
import { Send } from 'lucide-vue-next'
import StatusBadge from '../../../components/StatusBadge.vue'
import {
  APPROVAL_LABEL, APPROVER, LIFECYCLE, activationIssues, approvalIssues, canApprove, canEdit, catalogOf, editorsLabel, openPendencies, requiredApprovals,
} from '../../../domain/catalog'
import { hasFullAccess } from '../../../domain/access'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item } from '../../../types/domain'
import ReasonModal from '../ReasonModal.vue'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()

const catalog = computed(() => catalogOf(props.item))
const life = computed(() => catalog.value.lifecycle)
const issues = computed(() => activationIssues(store.state, props.item))
const pendencies = computed(() => life.value === 'Obsoleto' ? openPendencies(store.state, props.item.id) : [])
const canCycle = computed(() => canEdit(ui.role, 'ciclo') && !catalog.value.deletedAt)
const past = (step: string) => LIFECYCLE.indexOf(step as typeof life.value) < LIFECYCLE.indexOf(life.value) && LIFECYCLE.indexOf(life.value) <= 2

type Ask = 'return' | 'block' | 'reactivate' | 'obsolete' | 'inactivate' | 'refuse'
const ask = ref<Ask | ''>('')
const refusing = ref('')
const ASK: Record<Ask, { title: string; confirm: string; tone: 'danger' | 'warning' | '' }> = {
  return: { title: 'Devolver a rascunho', confirm: 'Devolver', tone: 'warning' },
  block: { title: 'Bloquear item', confirm: 'Bloquear', tone: 'danger' },
  reactivate: { title: 'Reativar item', confirm: 'Reativar', tone: '' },
  obsolete: { title: 'Obsoletar item', confirm: 'Obsoletar', tone: 'warning' },
  inactivate: { title: 'Inativar item', confirm: 'Inativar', tone: 'danger' },
  refuse: { title: 'Recusar exceção', confirm: 'Recusar', tone: 'danger' },
}
function confirm(reason: string) {
  const id = props.item.id
  const action = ask.value
  const done = {
    return: () => store.returnItem(id, reason),
    block: () => store.blockItem(id, reason),
    reactivate: () => store.reactivateItem(id, reason),
    obsolete: () => store.obsoleteItem(id, reason),
    inactivate: () => store.inactivateItem(id, reason),
    refuse: () => store.decideKeyChange(id, refusing.value, false, reason),
    '': () => undefined,
  }[action]()
  if (done !== undefined) ask.value = ''
}
const canReturn = computed(() => (APPROVER[ui.role] ?? []).some(role => requiredApprovals(props.item).includes(role)) || canEdit(ui.role, 'ciclo'))
</script>

<template>
  <div class="life-track" data-tour="product-life">
    <span v-for="step in LIFECYCLE" :key="step" :class="{ current: life === step, past: past(step) }">{{ step }}</span>
  </div>

  <template v-if="life === 'Rascunho' || life === 'Em homologação'">
    <h3 class="drawer-title">Homologação por papel</h3>
    <div class="approval-grid">
      <div v-for="role in requiredApprovals(item)" :key="role" class="approval-card" :class="{ done: !!catalog.approvals[role] }">
        <header>{{ APPROVAL_LABEL[role] }} <StatusBadge :value="catalog.approvals[role] ? 'Aprovado' : 'Pendente'" :tone="catalog.approvals[role] ? 'success' : 'warning'" /></header>
        <small v-if="catalog.approvals[role]">Por {{ catalog.approvals[role] }}</small>
        <ul v-else-if="approvalIssues(item, role).length"><li v-for="issue in approvalIssues(item, role)" :key="issue">{{ issue }}</li></ul>
        <small v-else>Pronto para aprovar.</small>
        <button v-if="life === 'Em homologação' && !catalog.approvals[role]" class="button small" :disabled="!canApprove(ui.role, role) || approvalIssues(item, role).length > 0"
          :title="canApprove(ui.role, role) ? '' : `O perfil ${ui.role} não aprova ${APPROVAL_LABEL[role].toLowerCase()}`" @click="store.approveItem(item.id, role)">Aprovar {{ APPROVAL_LABEL[role].toLowerCase() }}</button>
      </div>
    </div>
    <p v-if="issues.length" class="notice warning">Para ativar: {{ issues.join(' · ') }}</p>
  </template>

  <div class="drawer-actions">
    <button v-if="life === 'Rascunho'" class="button" :disabled="!canCycle" @click="store.submitItem(item.id)">Enviar para homologação</button>
    <template v-if="life === 'Em homologação'">
      <button class="button" :disabled="!canCycle || issues.length > 0" @click="store.finishActivation(item.id)">Ativar</button>
      <button class="button secondary" :disabled="!canReturn" @click="ask = 'return'">Devolver a rascunho</button>
    </template>
    <button v-if="life === 'Ativo'" class="button secondary" :disabled="!canCycle" @click="ask = 'block'">Bloquear</button>
    <button v-if="life === 'Bloqueado'" class="button" :disabled="!canCycle" @click="ask = 'reactivate'">Reativar</button>
    <button v-if="life === 'Ativo' || life === 'Bloqueado'" class="button secondary" :disabled="!canCycle" @click="ask = 'obsolete'">Obsoletar</button>
    <button v-if="life === 'Obsoleto'" class="button secondary" :disabled="!canCycle || pendencies.length > 0" @click="ask = 'inactivate'">Inativar</button>
    <button v-if="life === 'Ativo'" class="button secondary" @click="store.publishItem(item.id)"><Send :size="14" /> Enviar ao Omie</button>
  </div>
  <p v-if="!canCycle && !catalog.deletedAt" class="cell-sub">Mudança de situação: {{ editorsLabel('ciclo') }}. Aprovações: cada papel na sua parte.</p>
  <div v-if="pendencies.length" class="notice danger" style="margin-top:10px">
    <b>Inativação bloqueada enquanto houver:</b>
    <div v-for="entry in pendencies" :key="entry">· {{ entry }}</div>
  </div>
  <p v-if="life === 'Bloqueado'" class="notice info" style="margin-top:10px">Bloqueado não entra em proposta, compra, pedido nem OP nova. Saldo e histórico ficam.</p>
  <p v-if="life === 'Obsoleto'" class="notice info" style="margin-top:10px">Obsoleto sai do planejamento. O saldo restante ainda pode ser consumido.</p>

  <h3 class="drawer-title">Exceções de campo-chave</h3>
  <div v-for="change in catalog.keyChanges" :key="change.id" class="list-row static">
    <div>
      <strong>{{ change.field === 'ncm' ? 'NCM' : 'Unidade base' }}: {{ change.from || '—' }} → {{ change.to }}</strong>
      <span>{{ change.reason }} · {{ change.requestedBy }} em {{ change.requestedAt.slice(0, 10) }}<template v-if="change.decidedBy"> · {{ change.status.toLowerCase() }} por {{ change.decidedBy }}{{ change.note ? `: ${change.note}` : '' }}</template></span>
    </div>
    <div v-if="change.status === 'Pendente'" class="filter-row">
      <button class="button small" :disabled="!hasFullAccess(ui.role) || change.requestedBy === ui.userName" :title="change.requestedBy === ui.userName ? 'Quem solicitou não aprova' : !hasFullAccess(ui.role) ? 'Decisão da gestão do cadastro' : ''" @click="store.decideKeyChange(item.id, change.id, true, '')">Aprovar</button>
      <button class="button secondary small" :disabled="!hasFullAccess(ui.role) || change.requestedBy === ui.userName" @click="refusing = change.id; ask = 'refuse'">Recusar</button>
    </div>
    <StatusBadge v-else :value="change.status" :tone="change.status === 'Aprovada' ? 'success' : 'danger'" />
  </div>
  <p v-if="!catalog.keyChanges.length" class="empty-note">Nenhuma exceção solicitada. Unidade base e NCM de item ativo só mudam por aqui.</p>

  <ReasonModal :open="ask !== ''" :title="ask ? ASK[ask].title : ''" :confirm="ask ? ASK[ask].confirm : ''" :tone="ask ? ASK[ask].tone : ''" @close="ask = ''" @confirm="confirm" />
</template>
