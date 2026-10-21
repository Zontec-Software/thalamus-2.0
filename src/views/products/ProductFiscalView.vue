<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatusBadge from '../../components/StatusBadge.vue'
import { NCM_TABLE, approvalIssues, catalogOf, layersOf, ncmInfo } from '../../domain/catalog'
import { spedRegisters } from '../../domain/catalogExtensions'
import { today } from '../../domain/engine'
import { useErpStore } from '../../stores/erp'
import type { Item } from '../../types/domain'
import FiscalMatrixPanel from './FiscalMatrixPanel.vue'
import TablePager from './TablePager.vue'
import { LIFE_TONE, usePager } from './shared'

const store = useErpStore()
const router = useRouter()
const query = ref('')
const ncm = ref('')
const onlyPending = ref(false)

const issues = (item: Item) => approvalIssues(item, 'fiscal')
const rows = computed(() => store.state.items.filter(item => {
  const catalog = catalogOf(item)
  if (catalog.deletedAt || !layersOf(item).includes('fiscal')) return false
  if (ncm.value && catalog.ncm !== ncm.value) return false
  if (onlyPending.value && !issues(item).length) return false
  return !query.value || `${item.code} ${item.name} ${catalog.ncm} ${catalog.cClassTrib}`.toLowerCase().includes(query.value.toLowerCase())
}))
const { page, size, pages, slice, range } = usePager(rows)
const pendingCount = computed(() => store.state.items.filter(item => !catalogOf(item).deletedAt && layersOf(item).includes('fiscal') && issues(item).length).length)

const view = ref<'itens' | 'matriz' | 'sped'>('itens')
const sped = computed(() => spedRegisters(store.state))
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
  <div class="tabs" style="margin-bottom:12px">
    <button :class="{ active: view === 'itens' }" @click="view = 'itens'">Fiscal dos itens<b v-if="pendingCount">{{ pendingCount }}</b></button>
    <button :class="{ active: view === 'matriz' }" @click="view = 'matriz'">Matriz fiscal</button>
    <button :class="{ active: view === 'sped' }" @click="view = 'sped'">SPED · registro 0200</button>
  </div>
  <FiscalMatrixPanel v-if="view === 'matriz'" />
  <article v-else-if="view === 'sped'" class="card flush">
    <div class="section-head"><div><h2>SPED · Bloco 0</h2><p>Registros 0190 (unidades), 0200 (itens) e 0220 (fatores de conversão) da EFD ICMS/IPI, gerados do cadastro ativo. Rascunho, homologação e kit virtual ficam de fora.</p></div>
      <button class="button" @click="downloadSped">Baixar .txt ({{ sped.count }} itens)</button>
    </div>
    <p v-if="sped.issues.length" class="notice warning" style="margin:0 16px 10px">{{ sped.issues.join(' · ') }}</p>
    <pre class="code-block" style="margin:0 16px 16px">{{ sped.lines.join('\n') }}</pre>
  </article>
  <article v-else class="card flush">
    <div class="section-head"><div><h2>Fiscal do item</h2><p>NCM validado, Ex-TIPI, CEST quando há substituição tributária, benefícios por UF e a camada da reforma. CFOP, CST e alíquota vêm da matriz fiscal; a nota sai pelo Omie.</p></div>
      <span class="status" :class="pendingCount ? 'warning' : 'success'">{{ pendingCount }} com pendência fiscal</span>
    </div>
    <div class="list-meta">
      <div class="filter-row">
        <input v-model="query" class="filter" placeholder="Código, descrição, NCM ou cClassTrib" />
        <select v-model="ncm" class="filter"><option value="">Todos os NCM</option><option v-for="entry in NCM_TABLE" :key="entry.code" :value="entry.code">{{ entry.code }} · {{ entry.name }}</option></select>
        <label class="filter-row"><input v-model="onlyPending" type="checkbox" /> Só com pendência</label>
      </div>
    </div>
    <table class="dense">
      <thead><tr><th>Item</th><th>Situação</th><th>NCM</th><th>CEST</th><th>Origem</th><th>cClassTrib</th><th>Pendência</th></tr></thead>
      <tbody>
        <tr v-for="item in slice" :key="item.id" class="clickable" @click="router.push({ path: `/produtos/item/${item.id}`, query: { aba: 'fiscal' } })">
          <td><span class="cell-main code">{{ item.code }}</span><span class="cell-sub">{{ item.name }}</span></td>
          <td><StatusBadge :value="catalogOf(item).lifecycle" :tone="LIFE_TONE[catalogOf(item).lifecycle]" /></td>
          <td>
            <span v-if="catalogOf(item).nature === 'Serviço'" class="cell-sub">Não se aplica</span>
            <template v-else>{{ catalogOf(item).ncm || '—' }}<span class="cell-sub">{{ ncmInfo(catalogOf(item).ncm)?.name }}</span></template>
          </td>
          <td>{{ catalogOf(item).cest || (ncmInfo(catalogOf(item).ncm)?.st ? 'Obrigatório' : '—') }}</td>
          <td>{{ catalogOf(item).nature === 'Serviço' ? '—' : catalogOf(item).origin }}</td>
          <td>{{ catalogOf(item).cClassTrib || '—' }}</td>
          <td><span v-for="issue in issues(item)" :key="issue" class="status danger" style="margin:0 4px 4px 0">{{ issue }}</span><span v-if="!issues(item).length" class="status success">Completo</span></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="empty-note">Nenhum item com esse filtro.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="range" />
  </article>
</template>
