<script setup lang="ts">
import { computed } from 'vue'
import StatusBadge from '../../../components/StatusBadge.vue'
import { catalogOf, isTooling, openPendencies, references } from '../../../domain/catalog'
import { toolUsers } from '../../../domain/engineering'
import { useErpStore } from '../../../stores/erp'
import type { Item } from '../../../types/domain'
import { LIFE_TONE } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()

const parents = computed(() => store.state.items.filter(entry => entry.bom?.some(line => line.itemId === props.item.id)))
const pastVersions = computed(() => store.state.productRevisions.filter(entry => entry.status !== 'Liberada' && entry.lines?.some(line => line.itemId === props.item.id)))
const refs = computed(() => references(store.state, props.item.id))
const pendencies = computed(() => openPendencies(store.state, props.item.id))
</script>

<template>
  <template v-if="isTooling(item)">
    <h3 class="drawer-title" style="margin-top:0">Roteiros vigentes que usam este ferramental</h3>
    <div v-for="user in toolUsers(store.state, item.id)" :key="user.id" class="list-row static">
      <div><RouterLink :to="`/produtos/item/${user.id}?aba=manufatura`"><strong>{{ user.code }} · {{ user.name }}</strong></RouterLink><span>{{ user.routing!.filter(step => step.toolId === item.id).map(step => step.name).join(', ') }}</span></div>
    </div>
    <p v-if="!toolUsers(store.state, item.id).length" class="empty-note">Nenhum roteiro vigente usa este ferramental.</p>
  </template>
  <h3 class="drawer-title" :style="isTooling(item) ? '' : 'margin-top:0'">Estruturas vigentes que usam este produto</h3>
  <table v-if="parents.length" class="dense">
    <thead><tr><th>Produto pai</th><th>Quantidade</th><th>Situação do pai</th></tr></thead>
    <tbody>
      <tr v-for="parent in parents" :key="parent.id">
        <td><RouterLink :to="`/produtos/item/${parent.id}`" class="cell-main code">{{ parent.code }}</RouterLink><span class="cell-sub">{{ parent.name }}</span></td>
        <td>{{ parent.bom?.find(line => line.itemId === item.id)?.quantity }} {{ item.unit }}</td>
        <td><StatusBadge :value="catalogOf(parent).lifecycle" :tone="LIFE_TONE[catalogOf(parent).lifecycle]" /></td>
      </tr>
    </tbody>
  </table>
  <p v-else class="empty-note">Não é componente de nenhuma estrutura vigente.</p>

  <template v-if="pastVersions.length">
    <h3 class="drawer-title">Versões antigas ou em rascunho</h3>
    <div v-for="entry in pastVersions" :key="entry.id" class="list-row static">
      <div><strong>{{ store.item(entry.itemId).code }} · versão {{ entry.code }}</strong><span>{{ entry.status }}{{ entry.validTo ? ` até ${entry.validTo}` : '' }}</span></div>
    </div>
  </template>

  <h3 class="drawer-title">Histórico de uso</h3>
  <div class="flag-list"><span v-for="entry in refs" :key="entry" class="status info">{{ entry }}</span></div>
  <p v-if="!refs.length" class="empty-note">Nunca foi usado: se for excluído, sai do cadastro de verdade.</p>
  <p v-else class="cell-sub" style="margin-top:8px">Como já foi usado, a exclusão é lógica: o produto some das listas e o histórico fica.</p>

  <h3 class="drawer-title">Em aberto agora</h3>
  <div v-for="entry in pendencies" :key="entry" class="list-row static"><div><strong>{{ entry }}</strong></div></div>
  <p v-if="!pendencies.length" class="empty-note">Nada em aberto.</p>
</template>
