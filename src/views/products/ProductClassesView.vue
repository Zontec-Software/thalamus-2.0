<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, ChevronRight, FolderPlus, Pencil, Trash2 } from 'lucide-vue-next'
import { canEdit, catalogOf, classDescendants, classLabel, editorsLabel } from '../../domain/catalog'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { ItemClass } from '../../types/domain'
import { listState } from './shared'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

const open = reactive<Record<string, boolean>>({})
const selectedId = ref('')
const editable = computed(() => canEdit(ui.role, 'nucleo'))
const children = (parentId?: string) => store.state.itemClasses.filter(entry => entry.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))
const direct = computed(() => {
  const map: Record<string, number> = {}
  for (const item of store.state.items) if (!catalogOf(item).deletedAt) map[catalogOf(item).classId] = (map[catalogOf(item).classId] ?? 0) + 1
  return map
})
const total = (id: string) => classDescendants(store.state, id).reduce((sum, entry) => sum + (direct.value[entry] ?? 0), 0)

interface Row { node: ItemClass; depth: number }
const rows = computed<Row[]>(() => {
  const list: Row[] = []
  const walk = (parentId: string | undefined, depth: number) => {
    for (const node of children(parentId)) {
      list.push({ node, depth })
      if (open[node.id]) walk(node.id, depth + 1)
    }
  }
  walk(undefined, 0)
  return list
})
const selected = computed(() => store.state.itemClasses.find(entry => entry.id === selectedId.value))
const form = reactive({ child: '', rename: '', root: '' })

function pick(node: ItemClass) {
  selectedId.value = node.id
  form.rename = node.name
}
function addChild() {
  if (!selected.value) return
  if (store.createClass(form.child, selected.value.id) !== undefined) {
    open[selected.value.id] = true
    form.child = ''
  }
}
function addRoot() {
  if (store.createClass(form.root) !== undefined) form.root = ''
}
function remove() {
  if (selected.value && store.removeClass(selected.value.id) !== undefined) selectedId.value = ''
}
function showItems(id: string) {
  Object.assign(listState, { classId: id, query: '', type: '', lifecycle: '', flag: '', showDeleted: false })
  router.push('/produtos')
}
function expandAll(value: boolean) {
  for (const node of store.state.itemClasses) open[node.id] = value
}
</script>

<template>
  <div class="version-grid" style="grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr)">
    <article class="card">
      <div class="section-head">
        <div><h2>Árvore de classificação</h2><p>Profundidade livre. O código do item não depende da árvore: reclassificar não muda o código.</p></div>
        <div class="filter-row">
          <button class="button ghost small" @click="expandAll(true)">Expandir tudo</button>
          <button class="button ghost small" @click="expandAll(false)">Recolher</button>
        </div>
      </div>
      <div class="tree">
        <div v-for="row in rows" :key="row.node.id" class="tree-row" :class="{ active: row.node.id === selectedId }" :style="{ paddingLeft: `${8 + row.depth * 20}px` }">
          <button class="toggle" :style="{ visibility: children(row.node.id).length ? 'visible' : 'hidden' }" @click="open[row.node.id] = !open[row.node.id]">
            <ChevronDown v-if="open[row.node.id]" :size="14" /><ChevronRight v-else :size="14" />
          </button>
          <button class="name" @click="pick(row.node)">{{ row.node.name }}</button>
          <span class="count">{{ total(row.node.id) }} item(ns)</span>
        </div>
      </div>
      <form class="filter-row" style="margin-top:12px" @submit.prevent="addRoot">
        <input v-model="form.root" class="filter grow" placeholder="Novo nó raiz" :disabled="!editable" />
        <button class="button secondary small" :disabled="!editable"><FolderPlus :size="13" /> Criar raiz</button>
      </form>
    </article>

    <article class="card">
      <template v-if="selected">
        <span class="eyebrow">Nó selecionado</span>
        <h2 style="font-size:16px;margin:2px 0 4px">{{ selected.name }}</h2>
        <p class="cell-sub">{{ classLabel(store.state, selected.id) }}</p>
        <div class="mini-stats" style="margin:12px 0">
          <div class="mini-stat"><strong>{{ direct[selected.id] ?? 0 }}</strong><span>itens neste nó</span></div>
          <div class="mini-stat"><strong>{{ total(selected.id) }}</strong><span>incluindo filhos</span></div>
        </div>
        <button class="button secondary block" @click="showItems(selected.id)">Ver itens na lista</button>
        <p v-if="!editable" class="perm-hint" style="margin-top:12px">Quem mantém a árvore: {{ editorsLabel('nucleo') }}.</p>
        <fieldset class="layer" :disabled="!editable" style="margin-top:12px">
          <form class="field" @submit.prevent="addChild"><label>Novo filho</label><div class="filter-row"><input v-model="form.child" class="filter grow" required /><button class="button small"><FolderPlus :size="13" /> Criar</button></div></form>
          <form class="field" @submit.prevent="store.renameClass(selected.id, form.rename)"><label>Renomear</label><div class="filter-row"><input v-model="form.rename" class="filter grow" required /><button class="button secondary small"><Pencil :size="13" /> Salvar</button></div></form>
          <button class="button secondary small" :disabled="children(selected.id).length > 0 || (direct[selected.id] ?? 0) > 0" @click="remove"><Trash2 :size="13" /> Remover nó</button>
          <p class="cell-sub" style="margin-top:6px">Só nó sem filhos e sem itens pode ser removido. Reclassifique os itens antes (seleção em lote na lista).</p>
        </fieldset>
      </template>
      <p v-else class="empty-note">Escolha um nó para ver os itens, criar filhos ou renomear.</p>
    </article>
  </div>
</template>
