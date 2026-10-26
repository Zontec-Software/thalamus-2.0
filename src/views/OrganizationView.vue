<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { Plus, ShieldCheck, X } from 'lucide-vue-next'
import { AREAS } from '../navigation'
import { useErpStore } from '../stores/erp'
import { useUiStore } from '../stores/ui'

const store = useErpStore()
const ui = useUiStore()
const profiles = computed(() => store.state.accessProfiles.filter(entry => entry.tenantId === ui.activeTenantId))
const companyUsers = computed(() => store.state.users.filter(user => !user.platformMaster && store.state.userProfileAssignments.some(entry => entry.userId === user.id && entry.tenantId === ui.activeTenantId)))
const canEditAccess = computed(() => store.can('organizacao.acessos.gerir'))
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
const assigned = (userId: string, profileId: string) => store.state.userProfileAssignments.some(entry => entry.userId === userId && entry.profileId === profileId && entry.tenantId === ui.activeTenantId)
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
  <div class="toolbar"><p>Perfis agrupam funcionalidades. Um usuário pode ter mais de um perfil na empresa; as permissões se somam. A API repetirá esta regra.</p></div>

  <section class="grid-2">
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

  <article class="card flush" data-tour="permissions">
    <div class="section-head"><div><h2>Pessoas e perfis da empresa</h2><p>{{ canEditAccess ? 'Adicione perfis pelo + Perfil e retire pelo × da etiqueta. Alterações ficam registradas no cenário.' : 'Somente Administrador pode gerir acessos.' }}</p></div></div>
    <table>
      <thead><tr><th>Pessoa</th><th>Setor</th><th>Perfis</th></tr></thead>
      <tbody><tr v-for="user in companyUsers" :key="user.id">
        <td><span class="cell-main">{{ user.name }}</span><span class="cell-sub">{{ user.email ?? 'Sem e-mail' }}</span></td><td>{{ user.sector }}</td>
        <td>
          <div class="profile-chips">
            <span v-for="profile in profiles.filter(entry => assigned(user.id, entry.id))" :key="profile.id" class="chip active">
              {{ profile.name }}
              <button v-if="canEditAccess" type="button" class="chip-x" :aria-label="`Tirar ${profile.name} de ${user.name}`" @click="store.assignProfile(user.id, profile.id, false)"><X :size="11" /></button>
            </span>
            <span v-if="!profiles.some(entry => assigned(user.id, entry.id))" class="cell-sub">Sem perfil</span>
            <select v-if="canEditAccess && profiles.some(entry => !assigned(user.id, entry.id))" class="filter chip-add" value="" :aria-label="`Adicionar perfil a ${user.name}`" @change="store.assignProfile(user.id, ($event.target as HTMLSelectElement).value, true); ($event.target as HTMLSelectElement).value = ''">
              <option value="" disabled>+ Perfil</option>
              <option v-for="profile in profiles.filter(entry => !assigned(user.id, entry.id))" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
            </select>
          </div>
        </td>
      </tr></tbody>
    </table>
  </article>
</template>
