<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { RouterLink } from 'vue-router'
import { Construction } from 'lucide-vue-next'

const route = useRoute()
const paying = computed(() => route.path === '/contas-pagar')
const plan = computed(() => paying.value
  ? {
      title: 'Contas a pagar',
      purpose: 'Agenda do que a empresa vai pagar, nascida dos compromissos que o Thalamus já conhece, para o Financeiro ver vencimento e responsável sem procurar.',
      sources: [
        { module: 'Compras', text: 'Pedido de compra aprovado vira parcela prevista com vencimento pela condição de pagamento.', to: '/compras' },
        { module: 'Gestão de contratos', text: 'Contrato recorrente (aluguel, serviço, licença) gera as parcelas do período. Módulo ainda não existe.' },
        { module: 'Ativos', text: 'Aquisição e financiamento de máquina e molde geram parcelas ligadas ao ativo.', to: '/ativos' },
        { module: 'Orçamentos', text: 'Cada parcela consome a previsão da categoria e do centro de custo; o pagamento no Omie vira realizado.', to: '/orcamentos' },
      ],
    }
  : {
      title: 'Contas a receber',
      purpose: 'Agenda do que a empresa vai receber, nascida das vendas e dos contratos, para o Comercial e o Financeiro verem atraso e cliente sem procurar.',
      sources: [
        { module: 'Vendas', text: 'Pedido aprovado e nota emitida no Omie geram as parcelas a receber pela condição de pagamento.', to: '/vendas' },
        { module: 'Gestão de contratos', text: 'Contrato de serviço ou locação gera as parcelas do período. Módulo ainda não existe.' },
        { module: 'Assistência técnica', text: 'Atendimento cobrado gera a cobrança ligada ao chamado.', to: '/assistencia' },
        { module: 'Orçamentos', text: 'O recebimento no Omie vira receita realizada na categoria e alimenta o DRE.', to: '/orcamentos' },
      ],
    })
</script>

<template>
  <article class="card titles-plan">
    <span class="status warning"><Construction :size="13" /> Em estruturação</span>
    <h2>{{ plan.title }}</h2>
    <p>{{ plan.purpose }}</p>
    <h3>De onde virão os títulos</h3>
    <ul>
      <li v-for="source in plan.sources" :key="source.module">
        <strong><RouterLink v-if="source.to" class="link" :to="source.to">{{ source.module }}</RouterLink><template v-else>{{ source.module }}</template></strong> · {{ source.text }}
      </li>
    </ul>
    <h3>O que já vale hoje</h3>
    <ul>
      <li>O título, a baixa e o boleto continuam no Omie. O Thalamus lê o pagamento e o recebimento como realizado do orçamento.</li>
      <li>Esta aba será desenhada junto com Gestão de contratos e a evolução de Ativos, para que cada título já nasça ligado ao documento de origem.</li>
    </ul>
  </article>
</template>
