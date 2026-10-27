<script setup lang="ts">
import { computed, reactive } from 'vue'
import { catalogOf } from '../../../domain/catalog'
import { projectTrace } from '../../../domain/catalogExtensions'
import { useErpStore } from '../../../stores/erp'
import { useUiStore } from '../../../stores/ui'
import type { Item } from '../../../types/domain'
import { fmtCurrency } from '../../../utils/format'
import PermHint from '../PermHint.vue'
import { readOnly } from '../shared'

const props = defineProps<{ item: Item }>()
const store = useErpStore()
const ui = useUiStore()
const form = reactive({ projectId: '', milestoneId: '', note: '' })
const disabled = computed(() => readOnly(props.item, ui.role, 'projetos'))
const open = computed(() => store.state.projects.filter(project => project.status !== 'Cancelado' && project.status !== 'Concluído'))
const milestones = computed(() => store.state.projects.find(project => project.id === form.projectId)?.milestones ?? [])
const trace = computed(() => projectTrace(store.state, props.item.id))
const lifecycle = computed(() => catalogOf(props.item).lifecycle)

function link() {
  if (store.linkProject(props.item.id, { projectId: form.projectId, milestoneId: form.milestoneId || undefined, note: form.note }) !== undefined) Object.assign(form, { milestoneId: '', note: '' })
}
</script>

<template>
  <PermHint :item="item" layer="projetos" />
  <p class="cell-sub">Produto ligado a projeto passa a exigir aprovação técnica. Cada vínculo aponta a atividade da EAP que o justifica e acumula o custo de compras e demandas do produto naquele projeto.</p>

  <div v-for="(entry, index) in trace" :key="entry.link.projectId + (entry.link.milestoneId ?? '')" class="card" style="margin:10px 0;background:#F8FAFC">
    <div class="section-head" style="margin-bottom:6px">
      <div>
        <h2 style="font-size:15px">{{ entry.project?.name ?? entry.link.projectId }}</h2>
        <p>
          {{ entry.link.projectId }} · {{ entry.project?.status }} ·
          <template v-if="entry.milestone">atividade <b>{{ entry.milestone.title }}</b> (prazo {{ entry.milestone.dueDate.split('-').reverse().join('/') }}{{ entry.milestone.done ? ', concluída' : '' }})</template>
          <span v-else class="status warning">sem atividade da EAP</span>
        </p>
        <p v-if="entry.link.note" class="cell-sub">{{ entry.link.note }} · vinculado por {{ entry.link.linkedBy }}</p>
      </div>
      <button class="button ghost small" :disabled="disabled" @click="store.unlinkProject(item.id, index)">Desvincular</button>
    </div>
    <div class="mini-stats">
      <div class="mini-stat"><strong>{{ fmtCurrency(entry.committed) }}</strong><span>comprometido em {{ entry.purchases.length }} pedido(s) de compra</span></div>
      <div class="mini-stat"><strong>{{ fmtCurrency(entry.realized) }}</strong><span>recebido</span></div>
      <div class="mini-stat"><strong>{{ fmtCurrency(entry.pipeline) }}</strong><span>demandas ainda sem pedido ({{ entry.demands.length }} no total)</span></div>
    </div>
    <div v-for="order in entry.purchases" :key="order.id" class="list-row static">
      <div><strong>{{ order.id }}</strong><span>{{ order.quantity }} {{ item.unit }} × {{ fmtCurrency(order.unitPrice) }} · {{ order.status }}</span></div>
    </div>
  </div>
  <p v-if="!trace.length" class="empty-note">Produto sem projeto vinculado.</p>

  <h3 class="drawer-title">Vincular a projeto</h3>
  <form class="filter-row" @submit.prevent="link">
    <fieldset class="layer filter-row" :disabled="disabled">
      <select v-model="form.projectId" class="filter" required @change="form.milestoneId = ''"><option value="" disabled>Projeto…</option><option v-for="project in open" :key="project.id" :value="project.id">{{ project.id }} · {{ project.name }}</option></select>
      <select v-model="form.milestoneId" class="filter" :disabled="!form.projectId"><option value="">Atividade da EAP…</option><option v-for="milestone in milestones" :key="milestone.id" :value="milestone.id">{{ milestone.title }}</option></select>
      <input v-model="form.note" class="filter grow" placeholder="Por que o produto está no projeto" />
      <button class="button small" type="submit">Vincular</button>
    </fieldset>
  </form>
  <p v-if="lifecycle === 'Em homologação'" class="cell-sub">Mudar vínculo com o produto em homologação zera a aprovação técnica.</p>
</template>
