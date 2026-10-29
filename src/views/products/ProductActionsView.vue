<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from 'lucide-vue-next'
import BaseModal from '../../components/BaseModal.vue'
import { spedRegisters } from '../../domain/catalogExtensions'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import ChangeDetail from './ChangeDetail.vue'
import ChangeFormModal from './ChangeFormModal.vue'
import FiscalMatrixPanel from './FiscalMatrixPanel.vue'
import TablePager from './TablePager.vue'
import { productActions, type ProductActionKind } from './actions'
import { usePager } from './shared'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()
const kind = ref<ProductActionKind | ''>('')
const selectedChangeId = ref('')
const creating = ref(false)
const tool = ref<'' | 'matriz' | 'sped'>('')

const actions = computed(() => productActions(store.state, store.can, ui.userName))
const kinds = computed(() => {
  const counts = new Map<ProductActionKind, number>()
  for (const action of actions.value) counts.set(action.kind, (counts.get(action.kind) ?? 0) + 1)
  return [...counts.entries()]
})
const rows = computed(() => actions.value.filter(action => !kind.value || action.kind === kind.value))
const { page, size, pages, slice, range } = usePager(rows)
const selectedChange = computed(() => store.state.engineeringChanges.find(change => change.id === selectedChangeId.value))
const canFiscalTools = computed(() => store.can('produtos.fiscal.gerir'))
const sped = computed(() => spedRegisters(store.state))

function open(action: { productId?: string; changeId?: string; aba?: string }) {
  if (action.changeId) {
    selectedChangeId.value = action.changeId
    return
  }
  if (action.productId) router.push({ path: `/produtos/item/${action.productId}`, query: action.aba ? { aba: action.aba } : {} })
}
function downloadSped() {
  const blob = new Blob([`${sped.value.lines.join('\r\n')}\r\n`], { type: 'text/plain;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `SPED-bloco0-produtos-${today()}.txt`
  link.click()
  URL.revokeObjectURL(link.href)
}
</script>

<template>
  <div class="queue-tabs" data-tour="product-actions">
    <button type="button" class="chip" :class="{ active: !kind }" @click="kind = ''">Todas <b>{{ actions.length }}</b></button>
    <button v-for="[id, count] in kinds" :key="id" type="button" class="chip" :class="{ active: kind === id }" @click="kind = id">{{ id }} <b>{{ count }}</b></button>
  </div>

  <article class="card flush">
    <div class="section-head">
      <div>
        <h2>Ações</h2>
        <p>O que o seu perfil pode fazer agora: homologar, completar o cadastro, revisar estrutura, fiscal, mudança ou ciclo de vida.</p>
      </div>
      <button v-if="store.can('produtos.manufatura.gerir')" class="button" @click="creating = true"><Plus :size="14" /> Solicitar mudança</button>
    </div>
    <table class="dense">
      <thead><tr><th>Ação</th><th>Tipo</th><th>Onde</th><th /></tr></thead>
      <tbody>
        <tr v-for="action in slice" :key="action.id" class="clickable" @click="open(action)">
          <td><span class="cell-main">{{ action.title }}</span></td>
          <td><span class="status neutral">{{ action.kind }}</span></td>
          <td>{{ action.detail }}</td>
          <td @click.stop><button class="button secondary small" @click="open(action)">Abrir</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="empty-note">Nada pendente para o seu perfil.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="range" />
  </article>

  <article v-if="canFiscalTools" class="card" style="margin-top:16px">
    <div class="section-head">
      <div><h2>Ferramentas fiscais</h2><p>A matriz e o SPED continuam aqui, para quem gere o fiscal. Não são fila de produto.</p></div>
      <div class="filter-row">
        <button class="button secondary small" :class="{ active: tool === 'matriz' }" @click="tool = tool === 'matriz' ? '' : 'matriz'">Matriz fiscal</button>
        <button class="button secondary small" @click="tool = tool === 'sped' ? '' : 'sped'">SPED</button>
      </div>
    </div>
    <template v-if="tool === 'sped'">
      <p v-if="sped.issues.length" class="notice warning">{{ sped.issues.join(' · ') }}</p>
      <button class="button" @click="downloadSped">Baixar .txt ({{ sped.count }} produtos)</button>
      <pre class="code-block">{{ sped.lines.join('\n') }}</pre>
    </template>
  </article>
  <FiscalMatrixPanel v-if="canFiscalTools && tool === 'matriz'" />

  <BaseModal :open="!!selectedChange" :title="selectedChange?.id ?? ''" width="min(980px, 94vw)" @close="selectedChangeId = ''">
    <ChangeDetail v-if="selectedChange" :change="selectedChange" />
  </BaseModal>
  <ChangeFormModal :open="creating" @close="creating = false" @saved="id => selectedChangeId = id" />
</template>
