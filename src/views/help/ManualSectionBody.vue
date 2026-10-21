<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, ArrowRight, ExternalLink, Info, Lightbulb, PlayCircle, ShieldCheck, Users } from 'lucide-vue-next'
import { sectionById, type IndexedSection } from '../../help/manual'
import ManualText from './ManualText.vue'

const props = defineProps<{ section: IndexedSection }>()
defineEmits<{ guide: [to: string] }>()

const related = computed(() => (props.section.related ?? []).map(sectionById).filter(entry => entry !== undefined))
const NOTE_ICON = { info: Info, tip: Lightbulb, warning: AlertTriangle }
</script>

<template>
  <article class="manual-section" :id="`secao-${section.id}`">
    <header class="manual-section-head">
      <em>Capítulo {{ section.chapterNumber }} · {{ section.chapter.title }}</em>
      <h2><span>{{ section.number }}</span> {{ section.title }}</h2>
      <p>{{ section.summary }}</p>
      <div v-if="section.roles?.length || section.screens?.length || section.tour" class="manual-meta">
        <span v-if="section.roles?.length" class="manual-roles"><Users :size="13" /> {{ section.roles.join(', ') }}</span>
        <RouterLink v-for="screen in section.screens" :key="screen.to" :to="screen.to" class="button secondary small no-print"><ExternalLink :size="13" /> {{ screen.label }}</RouterLink>
        <button v-if="section.tour" class="button secondary small no-print" @click="$emit('guide', section.tour)"><PlayCircle :size="13" /> Ver guia interativo</button>
      </div>
    </header>

    <template v-for="(block, index) in section.blocks" :key="index">
      <p v-if="block.kind === 'p'" class="manual-p"><ManualText :text="block.text" /></p>

      <div v-else-if="block.kind === 'steps'" class="manual-block">
        <h4 v-if="block.title">{{ block.title }}</h4>
        <ol class="manual-steps"><li v-for="item in block.items" :key="item"><ManualText :text="item" /></li></ol>
      </div>

      <div v-else-if="block.kind === 'list'" class="manual-block">
        <h4 v-if="block.title">{{ block.title }}</h4>
        <ul class="manual-list"><li v-for="item in block.items" :key="item"><ManualText :text="item" /></li></ul>
      </div>

      <div v-else-if="block.kind === 'rules'" class="manual-block manual-rules">
        <h4><ShieldCheck :size="14" /> {{ block.title ?? 'Regras' }}</h4>
        <ul><li v-for="item in block.items" :key="item"><ManualText :text="item" /></li></ul>
      </div>

      <div v-else-if="block.kind === 'table'" class="manual-block">
        <h4 v-if="block.title">{{ block.title }}</h4>
        <div class="manual-table">
          <table>
            <thead><tr><th v-for="cell in block.head" :key="cell">{{ cell }}</th></tr></thead>
            <tbody><tr v-for="(row, rowIndex) in block.rows" :key="rowIndex"><td v-for="(cell, cellIndex) in row" :key="cellIndex"><ManualText :text="cell" /></td></tr></tbody>
          </table>
        </div>
      </div>

      <div v-else-if="block.kind === 'flow'" class="manual-block">
        <h4 v-if="block.title">{{ block.title }}</h4>
        <div class="manual-flow">
          <template v-for="(item, itemIndex) in block.items" :key="item">
            <span>{{ item }}</span><ArrowRight v-if="itemIndex < block.items.length - 1" :size="14" />
          </template>
        </div>
      </div>

      <div v-else-if="block.kind === 'note'" class="manual-note" :class="block.tone">
        <component :is="NOTE_ICON[block.tone]" :size="16" />
        <p><ManualText :text="block.text" /></p>
      </div>
    </template>

    <footer v-if="related.length" class="manual-related no-print">
      <h4>Veja também</h4>
      <RouterLink v-for="entry in related" :key="entry.id" :to="`/ajuda/manual/${entry.id}`"><b>{{ entry.number }}</b> {{ entry.title }}</RouterLink>
    </footer>
  </article>
</template>
