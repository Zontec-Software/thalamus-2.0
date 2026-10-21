<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ChevronRight, FileText, Printer, Search, X } from 'lucide-vue-next'
import { MANUAL, MANUAL_SECTIONS, sectionById, sectionText } from '../../help/manual'
import { PAGE_TOURS } from '../../tour/steps'
import { useUiStore } from '../../stores/ui'
import ManualSectionBody from './ManualSectionBody.vue'

const route = useRoute()
const router = useRouter()
const ui = useUiStore()

const query = ref('')
const sectionId = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const full = computed(() => sectionId.value === 'completo')
const current = computed(() => sectionById(sectionId.value))
const position = computed(() => current.value ? MANUAL_SECTIONS.indexOf(current.value) : -1)
const previous = computed(() => position.value > 0 ? MANUAL_SECTIONS[position.value - 1] : undefined)
const next = computed(() => position.value >= 0 && position.value < MANUAL_SECTIONS.length - 1 ? MANUAL_SECTIONS[position.value + 1] : undefined)

const openChapters = reactive(new Set<string>())
function toggleChapter(id: string) {
  if (openChapters.has(id)) openChapters.delete(id)
  else openChapters.add(id)
}

watch(sectionId, () => {
  query.value = ''
  if (current.value) openChapters.add(current.value.chapter.id)
  window.scrollTo({ top: 0 })
}, { immediate: true })

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const searchIndex = MANUAL_SECTIONS.map(section => {
  const raw = sectionText(section).normalize('NFC')
  return { section, raw, text: normalize(raw), title: normalize(section.title) }
})

const results = computed(() => {
  const terms = normalize(query.value).split(/\s+/).filter(term => term.length > 1)
  if (!terms.length) return []
  return searchIndex
    .filter(entry => terms.every(term => entry.text.includes(term)))
    .map(entry => {
      const at = entry.text.indexOf(terms[0])
      const start = Math.max(0, at - 70)
      const end = Math.min(entry.raw.length, at + terms[0].length + 120)
      return {
        section: entry.section,
        score: terms.filter(term => entry.title.includes(term)).length,
        before: (start > 0 ? '…' : '') + entry.raw.slice(start, at),
        match: entry.raw.slice(at, at + terms[0].length),
        after: entry.raw.slice(at + terms[0].length, end) + (end < entry.raw.length ? '…' : ''),
      }
    })
    .sort((a, b) => b.score - a.score)
})

const searching = computed(() => query.value.trim().length > 1)

function openGuide(to: string) {
  if (!PAGE_TOURS[to]) return
  router.push(to).then(() => setTimeout(() => ui.startTour(to, PAGE_TOURS[to]), 600))
}

function print() {
  window.print()
}
</script>

<template>
  <div class="manual-page">
    <aside class="manual-toc" data-tour="manual-toc">
      <RouterLink to="/ajuda" class="manual-back"><ArrowLeft :size="14" /> Central de ajuda</RouterLink>
      <label class="manual-search" data-tour="manual-search">
        <Search :size="15" />
        <input v-model="query" placeholder="Buscar no manual" aria-label="Buscar no manual">
        <button v-if="query" class="manual-clear" aria-label="Limpar busca" @click="query = ''"><X :size="14" /></button>
      </label>
      <nav>
        <RouterLink to="/ajuda/manual" class="manual-toc-top" :class="{ active: !sectionId }"><BookOpen :size="14" /> Sumário</RouterLink>
        <RouterLink to="/ajuda/manual/completo" class="manual-toc-top" :class="{ active: full }"><FileText :size="14" /> Manual completo</RouterLink>
        <div v-for="(chapter, chapterIndex) in MANUAL" :key="chapter.id" class="manual-toc-chapter">
          <button :class="{ current: current?.chapter.id === chapter.id }" @click="toggleChapter(chapter.id)">
            <component :is="openChapters.has(chapter.id) ? ChevronDown : ChevronRight" :size="14" />
            <span>{{ chapterIndex + 1 }}.</span> {{ chapter.title }}
          </button>
          <div v-if="openChapters.has(chapter.id)" class="manual-toc-sections">
            <RouterLink v-for="(section, sectionIndex) in chapter.sections" :key="section.id" :to="`/ajuda/manual/${section.id}`" :class="{ active: section.id === sectionId }">
              <span>{{ chapterIndex + 1 }}.{{ sectionIndex + 1 }}</span> {{ section.title }}
            </RouterLink>
          </div>
        </div>
      </nav>
    </aside>

    <div class="manual-content">
      <template v-if="searching">
        <div class="manual-results-head"><h2>Resultados para “{{ query.trim() }}”</h2><span class="muted">{{ results.length }} seção(ões)</span></div>
        <RouterLink v-for="result in results" :key="result.section.id" :to="`/ajuda/manual/${result.section.id}`" class="manual-result">
          <em>{{ result.section.number }} · {{ result.section.chapter.title }}</em>
          <b>{{ result.section.title }}</b>
          <span>{{ result.before }}<mark>{{ result.match }}</mark>{{ result.after }}</span>
        </RouterLink>
        <p v-if="!results.length" class="manual-empty">Nada encontrado. Tente outra palavra, como “lote”, “orçamento” ou “garantia”.</p>
      </template>

      <template v-else-if="full">
        <div class="manual-full-head no-print">
          <div><h2>Manual completo</h2><p class="muted">Todos os capítulos em uma página, prontos para imprimir ou salvar em PDF.</p></div>
          <button class="button" @click="print"><Printer :size="15" /> Imprimir</button>
        </div>
        <section v-for="(chapter, chapterIndex) in MANUAL" :key="chapter.id" class="manual-full-chapter">
          <h1><span>{{ chapterIndex + 1 }}</span> {{ chapter.title }}</h1>
          <p class="muted">{{ chapter.intro }}</p>
          <ManualSectionBody v-for="section in MANUAL_SECTIONS.filter(entry => entry.chapter === chapter)" :key="section.id" :section="section" @guide="openGuide" />
        </section>
      </template>

      <template v-else-if="current">
        <nav class="manual-crumbs">
          <RouterLink to="/ajuda/manual">Sumário</RouterLink><ChevronRight :size="12" />
          <span>{{ current.chapterNumber }}. {{ current.chapter.title }}</span><ChevronRight :size="12" />
          <b>{{ current.number }} {{ current.title }}</b>
        </nav>
        <ManualSectionBody :section="current" @guide="openGuide" />
        <nav class="manual-pager">
          <RouterLink v-if="previous" :to="`/ajuda/manual/${previous.id}`"><ArrowLeft :size="15" /><span><em>Anterior</em>{{ previous.number }} {{ previous.title }}</span></RouterLink>
          <span v-else />
          <RouterLink v-if="next" :to="`/ajuda/manual/${next.id}`" class="next"><span><em>Próxima</em>{{ next.number }} {{ next.title }}</span><ArrowRight :size="15" /></RouterLink>
        </nav>
      </template>

      <template v-else>
        <header class="manual-cover" data-tour="manual-index">
          <em>Manual do sistema</em>
          <h2>Thalamus 2.0: como cada processo funciona</h2>
          <p>{{ MANUAL.length }} capítulos e {{ MANUAL_SECTIONS.length }} seções. Escolha um tema no sumário abaixo ou no índice à esquerda, ou busque uma palavra. Cada seção explica o passo a passo, as regras que o sistema confere, quem participa e leva direto para a tela e para o guia interativo.</p>
          <p v-if="sectionId" class="manual-empty">A seção “{{ sectionId }}” não existe. Escolha outra no sumário.</p>
        </header>
        <div class="manual-chapters">
          <article v-for="(chapter, chapterIndex) in MANUAL" :key="chapter.id" class="manual-chapter-card">
            <h3><span class="manual-chapter-icon"><component :is="chapter.icon" :size="17" /></span><span>{{ chapterIndex + 1 }}. {{ chapter.title }}</span></h3>
            <p>{{ chapter.intro }}</p>
            <RouterLink v-for="(section, sectionIndex) in chapter.sections" :key="section.id" :to="`/ajuda/manual/${section.id}`">
              <b>{{ chapterIndex + 1 }}.{{ sectionIndex + 1 }}</b> {{ section.title }}
            </RouterLink>
          </article>
        </div>
      </template>
    </div>
  </div>
</template>
