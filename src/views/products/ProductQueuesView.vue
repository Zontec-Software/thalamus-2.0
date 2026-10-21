<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import StatusBadge from '../../components/StatusBadge.vue'
import { APPROVAL_LABEL, approvalIssues, canApprove, catalogOf, itemFlags, requiredApprovals } from '../../domain/catalog'
import { useErpStore } from '../../stores/erp'
import { useUiStore } from '../../stores/ui'
import type { Item } from '../../types/domain'
import TablePager from './TablePager.vue'
import { LIFE_TONE, usePager } from './shared'

const store = useErpStore()
const ui = useUiStore()
const router = useRouter()

type Queue = 'mine' | 'homologation' | 'drafts' | 'exceptions' | 'flags' | 'blocked' | 'obsolete'
interface Row { item: Item; info: string; extra?: string }

const live = computed(() => store.state.items.filter(item => !catalogOf(item).deletedAt))
const myPending = (item: Item) => requiredApprovals(item).filter(role => !catalogOf(item).approvals[role] && canApprove(ui.role, role))

const QUEUES = computed<{ id: Queue; label: string; hint: string; rows: Row[] }[]>(() => [
  {
    id: 'mine', label: 'Aguardando meu papel', hint: `Itens em homologação com aprovação que o perfil ${ui.role} pode registrar.`,
    rows: live.value.filter(item => catalogOf(item).lifecycle === 'Em homologação' && myPending(item).length)
      .map(item => ({ item, info: myPending(item).map(role => APPROVAL_LABEL[role]).join(', '), extra: myPending(item).flatMap(role => approvalIssues(item, role)).join(' · ') })),
  },
  {
    id: 'homologation', label: 'Em homologação', hint: 'Todos os itens aguardando aprovação, com o que falta.',
    rows: live.value.filter(item => catalogOf(item).lifecycle === 'Em homologação')
      .map(item => ({ item, info: requiredApprovals(item).map(role => `${APPROVAL_LABEL[role]} ${catalogOf(item).approvals[role] ? '✓' : '…'}`).join(' · ') })),
  },
  {
    id: 'drafts', label: 'Rascunhos', hint: 'Cadastros iniciados que ainda não foram para homologação.',
    rows: live.value.filter(item => catalogOf(item).lifecycle === 'Rascunho').map(item => ({ item, info: `Criado por ${catalogOf(item).createdBy} em ${catalogOf(item).createdAt.slice(0, 10)}` })),
  },
  {
    id: 'exceptions', label: 'Exceções de campo-chave', hint: 'Mudança de unidade base ou NCM em item ativo. Decide a gestão do cadastro; quem pediu não aprova.',
    rows: live.value.flatMap(item => catalogOf(item).keyChanges.filter(change => change.status === 'Pendente').map(change => ({
      item, info: `${change.field === 'ncm' ? 'NCM' : 'Unidade'}: ${change.from || '—'} → ${change.to}`, extra: `${change.reason} · ${change.requestedBy}`,
    }))),
  },
  {
    id: 'flags', label: 'Ativos com pendência', hint: 'Ativos que ainda têm cadastro incompleto: NCM, CEST, EAN, estrutura ou roteiro.',
    rows: live.value.filter(item => catalogOf(item).lifecycle === 'Ativo' && itemFlags(store.state, item).length).map(item => ({ item, info: itemFlags(store.state, item).join(' · ') })),
  },
  {
    id: 'blocked', label: 'Bloqueados', hint: 'Não entram em transação nova até alguém reativar.',
    rows: live.value.filter(item => catalogOf(item).lifecycle === 'Bloqueado').map(item => ({ item, info: catalogOf(item).audit.find(entry => entry.field === 'Situação')?.reason ?? '' })),
  },
  {
    id: 'obsolete', label: 'Obsoletos com saldo', hint: 'Fora do planejamento, mas ainda com estoque para consumir antes de inativar.',
    rows: live.value.filter(item => catalogOf(item).lifecycle === 'Obsoleto' && item.stock > 0).map(item => ({ item, info: `${item.stock} ${item.unit} em estoque` })),
  },
])

const active = ref<Queue>('mine')
const queue = computed(() => QUEUES.value.find(entry => entry.id === active.value)!)
const rows = computed(() => queue.value.rows)
const { page, size, pages, slice, range } = usePager(rows)
const open = (item: Item, aba?: string) => router.push({ path: `/produtos/item/${item.id}`, query: aba ? { aba } : {} })
</script>

<template>
  <div class="queue-tabs" data-tour="product-life">
    <button v-for="entry in QUEUES" :key="entry.id" class="chip" :class="{ active: active === entry.id }" @click="active = entry.id">{{ entry.label }} <b>{{ entry.rows.length }}</b></button>
  </div>
  <article class="card flush">
    <div class="section-head"><div><h2>{{ queue.label }}</h2><p>{{ queue.hint }}</p></div></div>
    <table class="dense">
      <thead><tr><th>Item</th><th>Situação</th><th>{{ active === 'mine' ? 'Sua aprovação' : 'Detalhe' }}</th><th /></tr></thead>
      <tbody>
        <tr v-for="(row, index) in slice" :key="row.item.id + index" class="clickable" @click="open(row.item, 'ciclo')">
          <td><span class="cell-main code">{{ row.item.code }}</span><span class="cell-sub">{{ row.item.name }}</span></td>
          <td><StatusBadge :value="catalogOf(row.item).lifecycle" :tone="LIFE_TONE[catalogOf(row.item).lifecycle]" /></td>
          <td>{{ row.info }}<span v-if="row.extra" class="cell-sub">{{ row.extra }}</span></td>
          <td @click.stop>
            <div v-if="active === 'mine'" class="filter-row">
              <button v-for="role in myPending(row.item)" :key="role" class="button small" :disabled="approvalIssues(row.item, role).length > 0" @click="store.approveItem(row.item.id, role)">Aprovar {{ APPROVAL_LABEL[role].toLowerCase() }}</button>
            </div>
            <button v-else class="button secondary small" @click="open(row.item, active === 'flags' ? 'fiscal' : 'ciclo')">Abrir</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="!rows.length" class="empty-note">Fila vazia.</p>
    <TablePager v-model:page="page" v-model:size="size" :pages="pages" :range="range" />
  </article>
</template>
