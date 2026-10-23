<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus } from 'lucide-vue-next'
import StatusBadge from '../../../components/StatusBadge.vue'
import { useErpStore } from '../../../stores/erp'
import type { Item } from '../../../types/domain'
import ChangeDetail from '../ChangeDetail.vue'
import ChangeFormModal from '../ChangeFormModal.vue'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const changes = computed(() => store.state.engineeringChanges.filter(change => change.itemIds.includes(props.item.id)))
const selectedId = ref('')
watch(changes, list => {
  if (!list.some(change => change.id === selectedId.value)) selectedId.value = (list.find(change => change.stage !== 'Implementada' && change.stage !== 'Recusada') ?? list[0])?.id ?? ''
}, { immediate: true })
const selected = computed(() => changes.value.find(change => change.id === selectedId.value))
const creating = ref(false)
</script>

<template>
  <div class="section-head" style="margin-top:0">
    <div><p>Mudanças de engenharia que atingem este item. Mudança controlada: pede, analisa o impacto, aprova e libera as versões juntas.</p></div>
    <button class="button small" @click="creating = true"><Plus :size="13" /> Solicitar mudança</button>
  </div>
  <div v-if="changes.length" class="version-grid">
    <div class="version-list">
      <button v-for="change in changes" :key="change.id" :class="{ active: change.id === selectedId }" @click="selectedId = change.id">
        <header>{{ change.id }} <StatusBadge :value="change.stage" /></header>
        <span>{{ change.title }}</span>
        <span>{{ change.priority }} · efetiva {{ change.effectiveDate.split('-').reverse().join('/') }}</span>
      </button>
    </div>
    <ChangeDetail v-if="selected" :change="selected" />
  </div>
  <p v-else class="empty-note">Nenhuma mudança registrada para este item.</p>
  <ChangeFormModal :open="creating" :item-id="item.id" @close="creating = false" @saved="id => selectedId = id" />
</template>
