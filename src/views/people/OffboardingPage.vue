<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ChevronRight } from 'lucide-vue-next'
import StatusBadge from '../../components/StatusBadge.vue'
import PersonPhoto from './PersonPhoto.vue'
import { isChecklistLate } from '../../domain/people'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import { fmtDate, fmtDateTime } from '../../utils/format'

type Tab = 'checklist' | 'acessos'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const isNew = computed(() => route.path.endsWith('/novo'))
const tenantId = computed(() => ui.activeTenantId)
const process = computed(() => store.state.offboardings.find(entry => entry.id === route.params.id && entry.tenantId === tenantId.value))
const person = computed(() => store.state.users.find(entry => entry.id === process.value?.userId))
const checklist = computed(() => store.state.peopleChecklists.find(entry => entry.process === 'desligamento' && entry.refId === process.value?.id))
const revocations = computed(() => store.state.accessRevocations.filter(entry => entry.offboardingId === process.value?.id))
const tab = computed(() => (route.query.aba === 'acessos' ? 'acessos' : 'checklist') as Tab)
const eligible = computed(() => store.state.users.filter(entry => !entry.platformMaster && entry.active !== false && !store.state.offboardings.some(item => item.userId === entry.id && item.status === 'Em andamento')))
const pending = computed(() => checklist.value?.items.filter(item => item.required && item.status !== 'Concluído').length ?? 0)
const googleAccount = computed(() => store.state.directoryAccounts.find(entry => entry.personId === person.value?.personId && entry.tenantId === process.value?.tenantId && entry.provider === 'Google'))
const portrait = computed(() => store.state.persons.find(entry => entry.id === person.value?.personId)?.photo)

const form = reactive({ userId: String(route.query.pessoa ?? ''), effectiveOn: today(), reason: '' })
const access = reactive({ systems: 'Thalamus', result: 'Concluído' as 'Concluído' | 'Falha', failure: '', vaultReference: '' })

function openTab(aba: Tab) {
  router.replace({ query: { aba } })
}
function start() {
  const created = store.startOffboarding(tenantId.value, form.userId, { effectiveOn: form.effectiveOn, reason: form.reason })
  if (created && created !== true) router.push(`/pessoas/desligamento/${created.id}`)
}
function conclude(itemId: string) {
  if (!checklist.value) return
  store.setPeopleChecklistItem(checklist.value.id, itemId, { status: 'Concluído' })
}
watch(() => route.path, path => {
  if (path.endsWith('/novo')) Object.assign(form, { userId: String(route.query.pessoa ?? ''), effectiveOn: today(), reason: '' })
})
function revoke() {
  if (!process.value) return
  store.revokeAccess(process.value.id, {
    systems: access.systems.split(',').map(entry => entry.trim()).filter(Boolean),
    result: access.result,
    failure: access.failure,
    vaultReference: access.vaultReference,
  })
}
</script>

<template>
  <nav class="crumb-bar" aria-label="Caminho">
    <RouterLink to="/pessoas/desligamento" class="crumb-back" title="Voltar para Desligamento"><ArrowLeft :size="16" /></RouterLink>
    <RouterLink to="/pessoas/desligamento" class="crumb">Desligamento</RouterLink>
    <ChevronRight :size="14" class="sep" />
    <span class="crumb here">{{ isNew ? 'Iniciar' : person?.name ?? 'Processo não encontrado' }}</span>
  </nav>

  <article v-if="isNew" class="card">
    <h2>Iniciar desligamento</h2>
    <p class="cell-sub" style="margin-bottom:14px">O motivo é texto livre. A lista oficial ainda não existe. Nada de senha é pedido aqui.</p>
    <div class="form-grid">
      <div class="field"><label>Pessoa</label><select v-model="form.userId"><option value="">—</option><option v-for="entry in eligible" :key="entry.id" :value="entry.id">{{ entry.name }}</option></select></div>
      <div class="field"><label>Data efetiva</label><input v-model="form.effectiveOn" type="date" /></div>
      <div class="field"><label>Motivo</label><input v-model="form.reason" placeholder="Texto livre" /></div>
    </div>
    <div class="drawer-actions">
      <button class="button" @click="start">Iniciar</button>
      <RouterLink to="/pessoas/desligamento" class="button secondary">Cancelar</RouterLink>
    </div>
  </article>

  <div v-else-if="!process || !person" class="card empty-note">Processo não encontrado nesta empresa. <RouterLink to="/pessoas/desligamento">Voltar à lista</RouterLink></div>

  <template v-else>
    <article class="card item-hero">
      <div class="item-head">
        <PersonPhoto :name="person.name" :photo="portrait" />
        <div class="item-head-main">
          <span class="eyebrow">Iniciado por {{ process.startedBy }} · {{ fmtDateTime(process.startedAt) }}</span>
          <h2>{{ person.name }}</h2>
          <div class="meta">
            <span>Efetivo em {{ fmtDate(process.effectiveOn) }}</span>
            <span>{{ process.reason }}</span>
          </div>
        </div>
        <div class="actions"><StatusBadge :value="process.status" /></div>
      </div>
      <div class="kpi-strip">
        <button type="button" class="kpi link" @click="openTab('checklist')"><span>Pendências</span><strong>{{ pending }}</strong><small>Obrigatórias em aberto</small></button>
        <button type="button" class="kpi link" @click="openTab('acessos')"><span>Execuções</span><strong>{{ revocations.length }}</strong><small>Sem senha no registro</small></button>
        <button type="button" class="kpi"><span>Acesso</span><strong>{{ person.active === false ? 'Inativo' : 'Ativo' }}</strong><small>Muda quando a revogação conclui</small></button>
        <button type="button" class="kpi link" @click="router.push(`/pessoas/pessoa/${person.id}`)"><span>Cadastro</span><strong>Abrir</strong><small>O histórico da pessoa permanece</small></button>
      </div>
    </article>

    <article class="card">
      <div class="tabs">
        <button type="button" :class="{ active: tab === 'checklist' }" @click="openTab('checklist')">Checklist</button>
        <button type="button" :class="{ active: tab === 'acessos' }" @click="openTab('acessos')">Acessos</button>
      </div>

      <div v-if="tab === 'checklist'">
        <div v-for="item in checklist?.items ?? []" :key="item.id" class="list-row static">
          <div><strong>{{ item.label }}</strong><span>{{ item.owner }}<template v-if="item.evidence"> · {{ item.evidence }}</template></span></div>
          <StatusBadge :value="isChecklistLate(item) ? 'Atrasado' : item.status" />
          <button v-if="item.kind !== 'acesso' && item.status !== 'Concluído' && process.status === 'Em andamento'" class="button secondary small" @click="conclude(item.id)">Concluir</button>
        </div>
        <div class="drawer-actions">
          <button v-if="process.status === 'Em andamento'" class="button" @click="store.closeOffboarding(process.id)">Confirmar encerramento</button>
        </div>
        <p class="hint">O item de acesso só conclui na aba Acessos, pela execução. Senha não é pedida.</p>
      </div>

      <div v-else>
        <div v-if="googleAccount" class="list-row static">
          <div><strong>Google · {{ googleAccount.email }}</strong><span>{{ googleAccount.status }}<template v-if="googleAccount.failure"> · {{ googleAccount.failure }}</template><template v-else> · suspensa na data efetiva, sem senha no registro</template></span></div>
          <button v-if="googleAccount.status === 'Falha'" class="button secondary small" @click="store.retryDirectoryAccount(googleAccount.id)">Tentar de novo</button>
        </div>
        <div v-for="entry in revocations" :key="entry.id" class="list-row static">
          <div><strong>{{ entry.result }} · {{ entry.systems.join(', ') }}</strong><span>{{ entry.actor }} · {{ fmtDateTime(entry.at) }}<template v-if="entry.failure"> · {{ entry.failure }}</template><template v-if="entry.vaultReference"> · cofre {{ entry.vaultReference }}</template></span></div>
        </div>
        <p v-if="!revocations.length" class="empty-note">Nenhuma execução registrada.</p>
        <div v-if="process.status === 'Em andamento'" class="form-grid">
          <div class="field"><label>Sistemas</label><input v-model="access.systems" placeholder="Separados por vírgula" /></div>
          <div class="field"><label>Resultado</label><select v-model="access.result"><option>Concluído</option><option>Falha</option></select></div>
          <div v-if="access.result === 'Falha'" class="field"><label>Falha</label><input v-model="access.failure" /></div>
          <div class="field"><label>Referência no cofre</label><input v-model="access.vaultReference" placeholder="Opcional. Sem o segredo." /></div>
        </div>
        <button v-if="process.status === 'Em andamento'" class="button secondary" @click="revoke">Registrar execução</button>
      </div>
    </article>
  </template>
</template>
