<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Cog, Plus, Search } from 'lucide-vue-next'
import BaseModal from '../components/BaseModal.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { RESOURCE_KINDS, resourceHasOpenWork, resourceIsReferenced } from '../domain/resources'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'
import type { Resource } from '../types/domain'
import { fmtCurrency } from '../utils/format'

const store = useErpStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const query = ref('')
const kind = ref<Resource['kind'] | ''>('')
const openedForTour = ref(false)

const mine = computed(() => store.state.resources.filter(entry => entry.tenantId === ui.activeTenantId))
const listed = computed(() => mine.value.filter(entry => {
  if (kind.value && entry.kind !== kind.value) return false
  return !query.value || entry.name.toLowerCase().includes(query.value.toLowerCase())
}))
const selectedId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const isNew = computed(() => selectedId.value === 'novo')
const current = computed(() => mine.value.find(entry => entry.id === selectedId.value))
const open = computed(() => isNew.value || !!current.value)
const linkedAssets = computed(() => current.value ? store.state.assets.filter(asset => asset.resourceId === current.value!.id) : [])
const inUse = computed(() => current.value ? resourceIsReferenced(store.state, current.value.id) : false)
const openWork = computed(() => current.value ? resourceHasOpenWork(store.state, current.value.id) : false)

const form = reactive({ name: '', kind: 'Montagem' as Resource['kind'], dailyMinutes: 480, hourlyRate: '' })

function hours(minutes: number) {
  const whole = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${whole} h ${rest} min` : `${whole} h`
}

function fill(resource?: Resource) {
  if (!resource) {
    Object.assign(form, { name: '', kind: 'Montagem' as Resource['kind'], dailyMinutes: 480, hourlyRate: '' })
    return
  }
  Object.assign(form, {
    name: resource.name,
    kind: resource.kind,
    dailyMinutes: resource.dailyMinutes,
    hourlyRate: resource.hourlyRate === undefined ? '' : String(resource.hourlyRate),
  })
}

watch(selectedId, () => fill(isNew.value ? undefined : current.value), { immediate: true })

watch(() => ui.tourSteps[ui.tourIndex]?.target, target => {
  const wantsForm = !!target?.includes('post-form')
  if (wantsForm && !selectedId.value) {
    const first = mine.value[0]
    if (!first) return
    openedForTour.value = true
    router.push(`/postos/${first.id}`)
  } else if (!wantsForm && openedForTour.value) {
    openedForTour.value = false
    if (selectedId.value) router.push('/postos')
  }
})

function rate() {
  const text = form.hourlyRate.trim()
  if (!text) return undefined
  return Number(text.replace(',', '.'))
}

function payload() {
  return { name: form.name, kind: form.kind, dailyMinutes: Number(form.dailyMinutes), hourlyRate: rate() }
}

function close() {
  openedForTour.value = false
  if (route.path !== '/postos') router.push('/postos')
}

function save() {
  if (isNew.value) {
    const created = store.createResource(payload())
    if (created && typeof created === 'object' && 'id' in created) router.push(`/postos/${created.id}`)
    return
  }
  if (!current.value) return
  if (store.updateResource(current.value.id, payload()) === undefined) fill(current.value)
}

function inactivate() {
  if (!current.value) return
  if (store.inactivateResource(current.value.id) !== undefined) fill(store.state.resources.find(entry => entry.id === current.value!.id))
}

function reactivate() {
  if (!current.value) return
  if (store.reactivateResource(current.value.id) !== undefined) fill(store.state.resources.find(entry => entry.id === current.value!.id))
}

function remove() {
  if (!current.value) return
  if (store.removeResource(current.value.id) !== undefined) close()
}

async function openAsset(id: string) {
  await router.push('/postos')
  ui.openRecord('asset', id)
}
</script>

<template>
  <div class="toolbar">
    <div class="filter-row">
      <label class="search-inline"><Search :size="15" /><input v-model="query" placeholder="Buscar posto" /></label>
      <button class="chip" :class="{ active: !kind }" @click="kind = ''">Todos <b>{{ mine.length }}</b></button>
      <button v-for="entry in RESOURCE_KINDS" :key="entry" class="chip" :class="{ active: kind === entry }" @click="kind = entry">{{ entry }} <b>{{ mine.filter(resource => resource.kind === entry).length }}</b></button>
    </div>
    <button data-tour="new-post" class="button" @click="router.push('/postos/novo')"><Plus :size="15" /> Novo posto</button>
  </div>

  <p data-tour="post-idea" class="cell-sub" style="margin: -4px 0 14px">O posto é a vaga da fábrica: onde a ordem entra, o que o operador escolhe no tablet e de onde saem os minutos do dia e o custo-hora. O ativo físico continua em Ativos e aponta para cá.</p>

  <section class="metrics">
    <article class="metric"><div class="metric-head">Ativos <Cog :size="17" /></div><strong>{{ mine.filter(entry => entry.status === 'Ativo').length }}</strong><small>Disponíveis para roteiro e programação</small></article>
    <article class="metric"><div class="metric-head">Inativos</div><strong>{{ mine.filter(entry => entry.status === 'Inativo').length }}</strong><small>Fora das escolhas novas</small></article>
    <article class="metric"><div class="metric-head">Injetoras</div><strong>{{ mine.filter(entry => entry.kind === 'Injetora' && entry.status === 'Ativo').length }}</strong><small>Só estas recebem molde</small></article>
    <article class="metric"><div class="metric-head">Montagem</div><strong>{{ mine.filter(entry => entry.kind === 'Montagem' && entry.status === 'Ativo').length }}</strong><small>Células e bancadas</small></article>
  </section>

  <article class="card flush" data-tour="post-list">
    <table>
      <thead><tr><th>Posto</th><th>Tipo</th><th>Dia</th><th>Custo-hora</th><th>Situação</th></tr></thead>
      <tbody>
        <tr v-for="resource in listed" :key="resource.id" class="clickable" :class="{ current: resource.id === selectedId }" @click="router.push(`/postos/${resource.id}`)">
          <td><b>{{ resource.name }}</b></td>
          <td>{{ resource.kind }}</td>
          <td>{{ hours(resource.dailyMinutes) }}</td>
          <td>{{ resource.hourlyRate === undefined ? '—' : fmtCurrency(resource.hourlyRate) }}</td>
          <td><StatusBadge :value="resource.status" /></td>
        </tr>
        <tr v-if="!listed.length"><td colspan="5" class="cell-sub">Nenhum posto com esse filtro.</td></tr>
      </tbody>
    </table>
  </article>

  <BaseModal :open="open" :title="isNew ? 'Cadastrar posto' : current?.name ?? ''" :subtitle="isNew ? 'A vaga entra ativa e já pode ir para o roteiro e a programação.' : current ? `${current.kind} · ${hours(current.dailyMinutes)} por dia` : ''" width="640px" @close="close">
    <div v-if="open" data-tour="post-form">
      <div v-if="current" style="margin-bottom: 12px"><StatusBadge :value="current.status" /></div>
      <form id="post-form" class="form-grid" @submit.prevent="save">
        <div class="field"><label>Nome</label><input v-model="form.name" required placeholder="Ex.: Montagem · Célula 3" /></div>
        <div class="field">
          <label>Tipo</label>
          <select v-model="form.kind" :disabled="inUse">
            <option v-for="entry in RESOURCE_KINDS" :key="entry">{{ entry }}</option>
          </select>
          <small v-if="inUse">O tipo fica travado enquanto o posto estiver em roteiro, ordem, ferramental ou ativo.</small>
        </div>
        <div class="field">
          <label>Minutos por dia</label>
          <input v-model.number="form.dailyMinutes" type="number" min="1" step="1" required />
          <small>{{ hours(Number(form.dailyMinutes) || 0) }} disponíveis para a programação.</small>
        </div>
        <div class="field">
          <label>Custo-hora (R$)</label>
          <input v-model="form.hourlyRate" inputmode="decimal" placeholder="Opcional" />
          <small>Máquina, energia e depreciação. A mão de obra fica de fora.</small>
        </div>
      </form>
      <p v-if="current" class="cell-sub">Inativar tira o posto das escolhas novas. Ordem e roteiro já gravados continuam nele. Excluir só existe enquanto nada aponta para o posto.</p>
      <p v-if="current?.status === 'Inativo' && openWork" class="callout warn">Há ordem aberta neste posto. Ela segue aqui mesmo inativo.</p>
      <template v-if="current">
        <h3 class="drawer-title">Ativos neste posto</h3>
        <p v-if="!linkedAssets.length" class="empty-note">Nenhum ativo aponta para cá. O vínculo fica na ficha do ativo. Cadastrar o posto não cria a máquina.</p>
        <ul v-else class="plain-list">
          <li v-for="asset in linkedAssets" :key="asset.id"><button class="button ghost" type="button" @click="openAsset(asset.id)">{{ asset.name }}</button> <span class="cell-sub">{{ asset.kind }}</span></li>
        </ul>
      </template>
    </div>
    <template #footer>
      <button v-if="current" class="button secondary" type="button" :disabled="inUse" @click="remove">Excluir</button>
      <button v-if="current?.status === 'Ativo'" class="button secondary" type="button" @click="inactivate">Inativar</button>
      <button v-if="current?.status === 'Inativo'" class="button secondary" type="button" @click="reactivate">Reativar</button>
      <button class="button secondary" type="button" @click="close">Cancelar</button>
      <button class="button" type="submit" form="post-form">{{ isNew ? 'Cadastrar' : 'Salvar' }}</button>
    </template>
  </BaseModal>
</template>

<style scoped>
tr.current td { background: #f3f6fb; }
.plain-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
</style>
