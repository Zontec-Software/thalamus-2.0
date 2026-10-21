<script setup lang="ts">
import { computed, ref } from 'vue'
import { catalogOf } from '../../../domain/catalog'
import type { Item } from '../../../types/domain'
import TablePager from '../TablePager.vue'
import { usePager } from '../shared'

const props = defineProps<{ item: Item }>()
const query = ref('')
const rows = computed(() => {
  const text = query.value.trim().toLowerCase()
  return catalogOf(props.item).audit.filter(entry => !text || `${entry.field ?? ''} ${entry.text} ${entry.actor} ${entry.reason ?? ''}`.toLowerCase().includes(text))
})
const { page, size, pages, slice, range } = usePager(rows)
</script>

<template>
  <div class="filter-row" style="margin-bottom:10px">
    <input v-model="query" class="filter grow" placeholder="Filtrar por campo, pessoa ou motivo" />
    <span class="cell-sub">Versão atual do registro: v{{ catalogOf(item).version }}</span>
  </div>
  <table class="dense">
    <thead><tr><th>Quando</th><th>Quem</th><th>Versão</th><th>Campo</th><th>De</th><th>Para</th><th>Motivo</th></tr></thead>
    <tbody>
      <tr v-for="(entry, index) in slice" :key="entry.at + index">
        <td><span class="cell-sub">{{ entry.at.slice(0, 16).replace('T', ' ') }}</span></td>
        <td>{{ entry.actor }}</td>
        <td>v{{ entry.version }}</td>
        <template v-if="entry.field">
          <td><b>{{ entry.field }}</b></td>
          <td><span class="diff-del">{{ entry.from || '—' }}</span></td>
          <td><span class="diff-add">{{ entry.to || '—' }}</span></td>
        </template>
        <td v-else colspan="3">{{ entry.text }}</td>
        <td><span class="cell-sub">{{ entry.reason || '—' }}</span></td>
      </tr>
    </tbody>
  </table>
  <p v-if="!rows.length" class="empty-note">Nada registrado com esse filtro.</p>
  <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="range" />
</template>
