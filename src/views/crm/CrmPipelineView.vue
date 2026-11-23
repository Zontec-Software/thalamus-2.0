<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import { today } from '../../domain/engine'
import { FUNNEL_LABEL, opportunityIsOpen, opportunityIsWon, openStagesOf, stagesOf } from '../../domain/enterprise'
import { useErpStore } from '../../stores/erp'
import { fmtCurrency, fmtDate } from '../../utils/format'
import { attentionOf, crmScope, useCrmScope } from './shared'

const store = useErpStore()
const router = useRouter()
const { opportunities } = useCrmScope()
/** Cada trilha tem as suas fases. Sem trilha escolhida, o quadro mostra Produtos Roboflex. */
const funnel = computed(() => crmScope.funnel || 'Produtos')
const stages = computed(() => stagesOf(funnel.value))
const lastOpen = computed(() => openStagesOf(funnel.value).at(-1))
const inFunnel = computed(() => opportunities.value.filter(entry => (entry.funnel ?? 'Produtos') === funnel.value))
const byStage = (stage: string) => inFunnel.value.filter(entry => entry.stage === stage)
const lost = computed(() => inFunnel.value.filter(entry => entry.stage === 'Perdido'))
const open = (id: string) => router.push(`/crm/oportunidade/${id}`)
const footnote = (entry: (typeof inFunnel.value)[number]) => entry.stage === 'Ganho' ? 'Pedido gerado' : entry.stage === 'Conquistado' ? 'Aguardando implantação' : entry.stage === 'Implantação' ? 'Em implantação' : entry.nextAction
</script>

<template>
  <p class="hint" data-tour="crm-funnel">Quadro da trilha <b>{{ FUNNEL_LABEL[funnel] }}</b>. Troque a trilha no filtro acima. <RouterLink to="/crm/oportunidades" class="link">Ver em lista</RouterLink></p>
  <section class="pipeline crm-pipeline">
    <div v-for="stage in stages" :key="stage" class="pipeline-col">
      <header><div>{{ stage }}<small>{{ byStage(stage).length }} · {{ fmtCurrency(byStage(stage).reduce((sum, entry) => sum + (entry.mrr ?? 0), 0)) }} MRR</small></div></header>
      <article v-for="entry in byStage(stage)" :key="entry.id" class="flow-card clickable" @click="open(entry.id)">
        <b>{{ entry.title }}</b>
        <small>{{ store.partnerName(entry.partnerId) }} · {{ store.userName(entry.ownerId) }}</small>
        <small v-if="entry.solutionIds?.length">{{ entry.solutionIds.join(' + ') }}</small>
        <strong>{{ fmtCurrency(entry.mrr ?? 0) }} <small>MRR</small></strong>
        <small>{{ funnel === 'Soluções' ? 'Implantação' : 'Ticket' }} {{ fmtCurrency(entry.value) }}</small>
        <p :class="{ 'risk-text': attentionOf(entry, today()).includes('Sem próxima ação') }">{{ footnote(entry) }}</p>
        <div class="meta"><span>{{ entry.temperature ?? 'Morno' }} · {{ entry.probability }}%</span><span :class="{ 'risk-text': opportunityIsOpen(entry) && entry.expectedClose < today() }">{{ fmtDate(entry.expectedClose) }}</span></div>
        <button v-if="opportunityIsOpen(entry) && !opportunityIsWon(entry) && stage !== lastOpen && stage !== 'Proposta'" class="link" @click.stop="store.advanceOpportunity(entry.id)">Avançar <ArrowRight :size="12" /></button>
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
