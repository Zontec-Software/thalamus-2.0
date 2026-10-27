<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Plus, ShieldCheck, X } from 'lucide-vue-next'
import { companyAccessOf } from '../domain/organization'
import { AREAS } from '../navigation'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

const store = useErpStore()
const ui = useUiStore()
const scope = ref(ui.activeTenantId)
watch(() => ui.activeTenantId, id => { scope.value = id })
const members = computed(() => {
  const groupId = store.state.tenants.find(entry => entry.id === ui.activeTenantId)?.groupId
  return groupId ? store.state.tenants.filter(entry => entry.groupId === groupId && entry.status === 'Ativa') : []
})
const canGroup = computed(() => store.can('organizacao.consultar_consolidado') && members.value.length > 1)
const groupView = computed(() => canGroup.value && scope.value === 'grupo')
const viewingTenantId = computed(() => {
  if (!canGroup.value || scope.value === 'grupo') return groupView.value ? '' : ui.activeTenantId
  return members.value.some(entry => entry.id === scope.value) ? scope.value : ui.activeTenantId
})
const scopeLabel = computed(() => {
  if (groupView.value) return store.state.economicGroups.find(entry => entry.id === members.value[0]?.groupId)?.name ?? 'Grupo'
  return store.state.tenants.find(entry => entry.id === (viewingTenantId.value || ui.activeTenantId))?.tradeName ?? ''
})
const profiles = computed(() => store.state.accessProfiles.filter(entry => entry.tenantId === (viewingTenantId.value || ui.activeTenantId)))
const companyUsers = computed(() => store.state.users.filter(user => !user.platformMaster && store.state.userProfileAssignments.some(entry => entry.userId === user.id && entry.tenantId === viewingTenantId.value)))
const canEditAccess = computed(() => store.can('organizacao.acessos.gerir'))
const catalogHere = computed(() => !groupView.value && viewingTenantId.value === ui.activeTenantId)
const canEditHere = computed(() => canEditAccess.value && !groupView.value)
const grant = reactive({ userId: '', profileId: '' })
const outsiders = computed(() => {
  const here = viewingTenantId.value
  if (!here) return []
  const memberIds = new Set(members.value.map(entry => entry.id))
  return store.state.users.filter(user => {
    if (user.platformMaster) return false
    if (store.state.userProfileAssignments.some(entry => entry.userId === user.id && entry.tenantId === here)) return false
    const person = store.state.persons.find(entry => entry.id === user.personId)
    const origin = person?.tenantId ?? user.homeTenantId
    return !!origin && origin !== here && memberIds.has(origin)
  })
})
const groupRows = computed(() => store.state.users
  .filter(user => !user.platformMaster && members.value.some(tenant => companyAccessOf(store.state, user.id, tenant.id).profileNames.length))
  .map(user => ({
    user,
    home: store.state.tenants.find(entry => entry.id === (store.state.persons.find(person => person.id === user.personId)?.tenantId ?? user.homeTenantId))?.tradeName ?? '—',
    cells: members.value.map(tenant => ({ tenantId: tenant.id, ...companyAccessOf(store.state, user.id, tenant.id) })),
  }))
  .sort((a, b) => a.user.name.localeCompare(b.user.name, 'pt-BR')))
function originName(userId: string) {
  const user = store.state.users.find(entry => entry.id === userId)
  const person = store.state.persons.find(entry => entry.id === user?.personId)
  return store.state.tenants.find(entry => entry.id === (person?.tenantId ?? user?.homeTenantId))?.tradeName ?? ''
}
function grantAccess() {
  if (!grant.userId || !grant.profileId) return
  store.assignProfile(grant.userId, grant.profileId, true)
  grant.userId = ''
  grant.profileId = ''
}
const selectedId = reactive({ value: 'profile-administrador' })
const selected = computed(() => store.state.accessProfiles.find(entry => entry.id === selectedId.value))
const form = reactive({ name: '', description: '', functionalityIds: [] as string[] })
const newProfile = reactive({ name: '', description: '' })

function loadProfile() {
  const profile = selected.value
  if (!profile) return
  form.name = profile.name
  form.description = profile.description
  form.functionalityIds = [...profile.functionalityIds]
}
watch(selectedId, loadProfile, { immediate: true })
const assigned = (userId: string, profileId: string) => store.state.userProfileAssignments.some(entry => entry.userId === userId && entry.profileId === profileId && entry.tenantId === viewingTenantId.value)
function toggleFunctionality(id: string) {
  form.functionalityIds = form.functionalityIds.includes(id) ? form.functionalityIds.filter(entry => entry !== id) : [...form.functionalityIds, id]
}
function saveProfile() {
  if (!selected.value) return
  store.saveAccessProfile({ id: selected.value.id, ...form })
}
const functionalityGroups = computed(() => AREAS.map(area => ({
  label: area.label,
  modules: [...new Set(area.groups.flatMap(group => group.items).map(item => item.module).filter((module): module is string => !!module))]
    .map(module => ({ module, items: store.state.functionalities.filter(entry => entry.module === module) }))
    .filter(entry => entry.items.length),
})).filter(area => area.modules.length))
function createProfile() {
  const id = store.createAccessProfile(newProfile.name, newProfile.description, [])
  if (id) {
    selectedId.value = id
    newProfile.name = ''
    newProfile.description = ''
  }
}
</script>

<template>
  <div class="toolbar">
    <p v-if="groupView">A soma do {{ scopeLabel }} mostra em qual empresa cada conta entra. Ela não concede perfil.</p>
    <p v-else>Acesso da {{ scopeLabel }}. O perfil se concede aqui. Acesso sem vínculo não cria usuário nem cadastro. Um emprego novo nasce em Pessoas, em Contratar aqui também.</p>
    <div v-if="canGroup" class="seg" aria-label="Empresa ou grupo">
      <button v-for="tenant in members" :key="tenant.id" type="button" :class="{ on: scope === tenant.id }" @click="scope = tenant.id">{{ tenant.tradeName }}</button>
      <button type="button" :class="{ on: scope === 'grupo' }" @click="scope = 'grupo'">Grupo</button>
    </div>
  </div>

  <section v-if="catalogHere" class="grid-2">
    <article class="card">
      <div class="section-head"><div><h2><ShieldCheck :size="18" /> Perfis</h2><p>Administrador é do sistema, não pode ser apagado e sempre recebe tudo.</p></div></div>
      <select v-model="selectedId.value" class="filter"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}{{ profile.system ? ' · sistema' : '' }}</option></select>
      <template v-if="selected">
        <div class="form-grid" style="margin-top:12px"><div class="field"><label>Nome</label><input v-model="form.name" class="filter" :disabled="selected.system || !canEditAccess" /></div><div class="field"><label>Descrição</label><input v-model="form.description" class="filter" :disabled="selected.system || !canEditAccess" /></div></div>
        <div class="functionality-groups">
          <section v-for="area in functionalityGroups" :key="area.label">
            <h3>{{ area.label }}</h3>
            <div v-for="module in area.modules" :key="module.module" class="functionality-module">
              <strong>{{ module.module }}</strong>
              <label v-for="functionality in module.items" :key="functionality.id">
                <input type="checkbox" :checked="selected.system || form.functionalityIds.includes(functionality.id)" :disabled="selected.system || !canEditAccess" @change="toggleFunctionality(functionality.id)" />
                <span><b>{{ functionality.action === 'consultar' ? 'Consultar' : functionality.label }}</b><small>{{ functionality.description }}</small></span>
              </label>
            </div>
          </section>
        </div>
        <div class="action-row"><button class="button small" :disabled="selected.system || !canEditAccess" @click="saveProfile">Salvar perfil</button><span v-if="selected.system" class="cell-sub">As funcionalidades futuras também entram automaticamente.</span></div>
      </template>
    </article>
    <article class="card">
      <div class="section-head"><div><h2>Novo perfil</h2><p>Use perfis para exceções operacionais, em vez de liberar botão por usuário.</p></div></div>
      <div class="field"><label>Nome</label><input v-model="newProfile.name" class="filter" placeholder="Ex.: Auditor de estoque" :disabled="!canEditAccess" /></div>
      <div class="field"><label>Descrição</label><input v-model="newProfile.description" class="filter" placeholder="O que este perfil faz" :disabled="!canEditAccess" /></div>
      <button class="button small" :disabled="!canEditAccess" @click="createProfile"><Plus :size="14" /> Criar e configurar</button>
    </article>
  </section>
  <p v-else-if="!groupView" class="hint">Os perfis da {{ scopeLabel }} já existem. Aqui você concede e tira. Um perfil novo se cria dentro da empresa.</p>

  <article v-if="groupView" class="card flush">
    <div class="section-head"><div><h2>Mapa do grupo</h2><p>Cada coluna é uma empresa. O texto diz se a conta trabalha lá ou só entra.</p></div></div>
    <table>
      <thead><tr><th>Conta</th><th>Vínculo</th><th v-for="tenant in members" :key="tenant.id">{{ tenant.tradeName }}</th></tr></thead>
      <tbody><tr v-for="row in groupRows" :key="row.user.id">
        <td><span class="cell-main">{{ row.user.name }}</span><span class="cell-sub">{{ row.user.email ?? 'Sem e-mail' }}</span></td>
        <td>{{ row.home }}</td>
        <td v-for="cell in row.cells" :key="cell.tenantId">
          <template v-if="cell.profileNames.length"><span class="cell-main">{{ cell.profileNames.join(' · ') }}</span><span class="cell-sub">{{ cell.employed ? 'Vínculo' : 'Acesso sem vínculo' }}</span></template>
          <span v-else class="cell-sub">—</span>
        </td>
      </tr></tbody>
    </table>
  </article>

  <article v-else class="card flush" data-tour="permissions">
    <div class="section-head"><div><h2>Pessoas e perfis da {{ scopeLabel }}</h2><p>{{ canEditHere ? 'Adicione perfis pelo + Perfil e retire pelo × da etiqueta. Quem ainda não entra nesta empresa recebe acesso sem vínculo, no fim da lista.' : 'Somente quem gere acessos altera os perfis.' }}</p></div></div>
    <table>
      <thead><tr><th>Pessoa</th><th>Setor</th><th>Perfis</th></tr></thead>
      <tbody><tr v-for="user in companyUsers" :key="user.id">
        <td><span class="cell-main">{{ user.name }}</span><span class="cell-sub">{{ store.state.persons.some(person => person.id === user.personId && person.tenantId === viewingTenantId) ? (user.email ?? 'Sem e-mail') : 'Acesso sem vínculo nesta empresa' }}</span></td><td>{{ store.state.persons.some(person => person.id === user.personId && person.tenantId === viewingTenantId) ? user.sector : '—' }}</td>
        <td>
          <div class="profile-chips">
            <span v-for="profile in profiles.filter(entry => assigned(user.id, entry.id))" :key="profile.id" class="chip active">
              {{ profile.name }}
              <button v-if="canEditHere" type="button" class="chip-x" :aria-label="`Tirar ${profile.name} de ${user.name}`" @click="store.assignProfile(user.id, profile.id, false)"><X :size="11" /></button>
            </span>
            <span v-if="!profiles.some(entry => assigned(user.id, entry.id))" class="cell-sub">Sem perfil</span>
            <select v-if="canEditHere && profiles.some(entry => !assigned(user.id, entry.id))" class="filter chip-add" value="" :aria-label="`Adicionar perfil a ${user.name}`" @change="store.assignProfile(user.id, ($event.target as HTMLSelectElement).value, true); ($event.target as HTMLSelectElement).value = ''">
              <option value="" disabled>+ Perfil</option>
              <option v-for="profile in profiles.filter(entry => !assigned(user.id, entry.id))" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
            </select>
          </div>
        </td>
      </tr></tbody>
    </table>
    <div v-if="canEditHere && outsiders.length" class="inline-form row">
      <select v-model="grant.userId" class="filter" aria-label="Conta de outra empresa">
        <option value="">Conta de outra empresa do grupo</option>
        <option v-for="user in outsiders" :key="user.id" :value="user.id">{{ user.name }} · {{ originName(user.id) }}</option>
      </select>
      <select v-model="grant.profileId" class="filter" aria-label="Perfil a conceder">
        <option value="">Perfil</option>
        <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
      </select>
      <button class="button small" :disabled="!grant.userId || !grant.profileId" @click="grantAccess">Conceder acesso sem vínculo</button>
    </div>
  </article>
</template>
