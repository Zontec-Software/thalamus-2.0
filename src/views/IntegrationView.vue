<script setup lang="ts">
import { computed, ref } from 'vue'
import { CheckCircle2, CloudDownload, RotateCcw, TriangleAlert } from 'lucide-vue-next'
import MetricCard from '../components/MetricCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { OWNERSHIP } from '../services/omie/gateway'
import { useErpStore } from '../stores/erp'
import { fmtDateTime } from '../utils/format'

const store = useErpStore()
const syncing = ref(false)
const filter = ref<'todos' | 'erro' | 'pendente'>('todos')

const logs = computed(() => store.state.syncLogs.filter(log => filter.value === 'todos' || log.status === filter.value))
const count = (status: string) => store.state.syncLogs.filter(log => log.status === status).length

async function sync() {
  syncing.value = true
  await store.syncOmie()
  syncing.value = false
}

function reset() {
  if (confirm('Restaurar todos os dados da demonstração para o cenário inicial?')) store.resetDemo()
}
</script>

<template>
  <div class="toolbar">
    <p>Uma única camada de integração (backend) com fila e reprocessamento. Cada dado tem um dono: nada é digitado duas vezes.</p>
    <div class="filter-row">
      <button class="button secondary" @click="reset"><RotateCcw :size="14" /> Restaurar demonstração</button>
      <button class="button" :disabled="syncing" @click="sync"><CloudDownload :size="15" /> {{ syncing ? 'Consultando…' : 'Sincronizar agora' }}</button>
    </div>
  </div>

  <section class="metrics">
    <MetricCard label="Sincronizados" :value="count('sincronizado')" detail="Últimas transações" :icon="CheckCircle2" trend="positive" />
    <MetricCard label="Pendentes" :value="count('pendente')" detail="Na fila de envio" :icon="CloudDownload" />
    <MetricCard label="Com erro" :value="count('erro')" detail="Exigem correção de cadastro" :icon="TriangleAlert" :trend="count('erro') ? 'negative' : 'positive'" />
    <MetricCard label="Pedidos aguardando no Omie" :value="store.state.omieQueue.length" detail="Aprovados, ainda não importados" :icon="CloudDownload" />
  </section>

  <article class="card flush" data-tour="sync-table">
    <div class="section-head">
      <div><h2>Transações com o Omie</h2><p>Erros ficam visíveis e podem ser reprocessados após a correção</p></div>
      <div class="filter-row">
        <button v-for="option in (['todos', 'erro', 'pendente'] as const)" :key="option" class="chip" :class="{ active: filter === option }" @click="filter = option">{{ option }}</button>
      </div>
    </div>
    <table>
      <thead><tr><th>Quando</th><th>Entidade</th><th>Referência</th><th>Direção</th><th>Mensagem</th><th>Situação</th><th></th></tr></thead>
      <tbody>
        <tr v-for="log in logs" :key="log.id">
          <td>{{ fmtDateTime(log.at) }}</td><td>{{ log.entity }}</td><td><span class="cell-main">{{ log.reference }}</span></td><td>{{ log.direction }}</td>
          <td>{{ log.message }}</td><td><StatusBadge :value="log.status" /></td>
          <td><button v-if="log.status === 'erro'" class="button secondary small" @click="store.retrySync(log.id)">Reprocessar</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!logs.length" class="empty-note">Nenhuma transação neste filtro.</p>
  </article>

  <article class="card flush" data-tour="integration-rules">
    <div class="section-head"><div><h2>Quem é dono de cada dado</h2><p>Regra que evita divergência entre Omie e Thalamus</p></div></div>
    <table>
      <thead><tr><th>Dado</th><th>Dono</th><th>Direção</th><th>Gatilho</th></tr></thead>
      <tbody>
        <tr v-for="rule in OWNERSHIP" :key="rule.data">
          <td><span class="cell-main">{{ rule.data }}</span></td>
          <td><StatusBadge :value="rule.owner" :tone="rule.owner === 'Omie' ? 'info' : 'success'" /></td>
          <td>{{ rule.direction }}</td><td>{{ rule.trigger }}</td>
        </tr>
      </tbody>
    </table>
  </article>
</template>
