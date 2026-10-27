<script setup lang="ts">
import { computed } from 'vue'
import { Lock } from 'lucide-vue-next'
import { canEdit, catalogOf, editorsLabel } from '../../domain/catalog'
import { useUiStore } from '../../stores/ui'
import type { CatalogLayer, Item } from '../../types/domain'

const props = defineProps<{ item: Item; layer: CatalogLayer }>()
const ui = useUiStore()

const reason = computed(() => {
  const catalog = catalogOf(props.item)
  if (catalog.deletedAt) return 'Produto excluído: restaure para editar.'
  if (catalog.lifecycle === 'Inativo') return 'Produto inativo: só leitura.'
  if (!canEdit(ui.role, props.layer)) return `Somente leitura para ${ui.role}. Quem edita esta camada: ${editorsLabel(props.layer)}.`
  return ''
})
defineExpose({ reason })
</script>

<template>
  <p v-if="reason" class="perm-hint"><Lock :size="13" /> {{ reason }}</p>
</template>
