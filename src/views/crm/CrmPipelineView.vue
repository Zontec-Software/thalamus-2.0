<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import { today } from '../../domain/engine'
import { CRM_STAGES } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { fmtCurrency, fmtDate } from '../../utils/format'
import { attentionOf, useCrmScope } from './shared'

const store = useErpStore()
const router = useRouter()
const { opportunities } = useCrmScope()
const byStage = (stage: string) => opportunities.value.filter(entry => entry.stage === stage)
const lost = computed(() => opportunities.value.filter(entry => entry.stage === 'Perdida'))
const open = (id: string) => router.push(`/crm/oportunidade/${id}`)
</script>

<template>
  <section class="pipeline crm-pipeline" data-tour="crm-funnel">
    <div v-for="stage in CRM_STAGES" :key="stage" class="pipeline-col">
      <header><div>{{ stage }}<small>{{ byStage(stage).length }} · {{ fmtCurrency(byStage(stage).reduce((sum, entry) => sum + (entry.mrr ?? 0), 0)) }} MRR</small></div></header>
      <article v-for="entry in byStage(stage)" :key="entry.id" class="flow-card clickable" @click="open(entry.id)">
        <b>{{ entry.title }}</b>
        <small>{{ store.partnerName(entry.partnerId) }} · {{ store.userName(entry.ownerId) }}</small>
        <strong>{{ fmtCurrency(entry.mrr ?? 0) }} <small>MRR</small></strong>
        <small>Ticket {{ fmtCurrency(entry.value) }}</small>
        <p :class="{ 'risk-text': attentionOf(entry, today()).includes('Sem próxima ação') }">{{ stage === 'Conquista' ? 'Pedido gerado' : entry.nextAction }}</p>
        <div class="meta"><span>{{ entry.temperature ?? 'Morno' }} · {{ entry.probability }}%</span><span :class="{ 'risk-text': stage !== 'Conquista' && entry.expectedClose < today() }">{{ fmtDate(entry.expectedClose) }}</span></div>
        <button v-if="stage !== 'Conquista' && stage !== 'Proposta'" class="link" @click.stop="store.advanceOpportunity(entry.id)">Avançar <ArrowRight :size="12" /></button>
      </article>
      <p v-if="!byStage(stage).length" class="empty-note">Nenhuma.</p>
    </div>
  </section>
  <details v-if="lost.length" class="card lost-box">
    <summary>{{ lost.length }} oportunidade(s) perdida(s)</summary>
    <button v-for="entry in lost" :key="entry.id" class="list-row" @click="open(entry.id)">
      <div><strong>{{ entry.title }}</strong><span>{{ store.partnerName(entry.partnerId) }} · {{ entry.lossReason }}</span></div><span>{{ fmtCurrency(entry.value) }}</span>
    </button>
  </details>
</template>
