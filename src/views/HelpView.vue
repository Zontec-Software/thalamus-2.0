<script setup lang="ts">
import { useRouter } from 'vue-router'
import { BookMarked, BookOpen, CircleHelp, FileText, PlayCircle, Tablet, Unplug, Wrench } from 'lucide-vue-next'
import { MANUAL, MANUAL_SECTIONS } from '../help/manual'
import { NAVIGATION } from '../navigation'
import { PAGE_TOURS, WELCOME_KEY, WELCOME_TOUR } from '../tour/steps'
import { useUiStore } from '../stores/ui'

const router = useRouter()
const ui = useUiStore()

const PROCESS = [
  { area: 'Omie', title: 'Pedido aprovado', text: 'O comercial aprova no Omie e o pedido chega sozinho ao Thalamus.' },
  { area: 'PCP', title: 'Planejamento', text: 'Explode a estrutura, reserva estoque, cria OPs de injeção e montagem.' },
  { area: 'Compras', title: 'Materiais', text: 'O que falta vira requisição; o pedido de compra é emitido no Omie.' },
  { area: 'Almoxarifado', title: 'Separação', text: 'Kit separado no tablet libera a OP para a máquina ou célula.' },
  { area: 'Injeção', title: 'Peças injetadas', text: 'Operador aponta no tablet; peças boas entram no estoque intermediário.' },
  { area: 'Montagem', title: 'Montagem e testes', text: 'Etapas do roteiro em sequência, cada uma com instruções no tablet.' },
  { area: 'Qualidade', title: 'Inspeção', text: 'Checklist por lote. Reprovação gera NC e retrabalho automático.' },
  { area: 'Expedição', title: 'Carga e NF-e', text: 'Conferência, expedição e nota emitida no Omie, de volta ao pedido.' },
]

const LEGACY = [
  { before: 'Status misturados em um único campo, difícil saber onde o pedido está', after: 'Etapa do pedido calculada a partir das OPs, compras e expedição: sempre coerente' },
  { before: 'Apontamento de injeção e de montagem em telas e regras diferentes', after: 'Um único modelo de apontamento no tablet para todos os postos' },
  { before: 'Aplicativos de tablet duplicados por setor', after: 'Um tablet só: o operador escolhe o posto e vê a fila daquele posto' },
  { before: 'Estrutura do produto espalhada em cadastros e planilhas', after: 'Cadastro único de itens com estrutura, roteiro e revisão' },
  { before: 'Integração com o Omie por rotinas agendadas sem visibilidade', after: 'Fila de integração com erros visíveis, reprocessamento e dono de cada dado' },
  { before: 'Permissões por números, verificadas só na tela', after: 'Perfis com nomes legíveis, verificados no menu, nas rotas e (no real) na API' },
  { before: 'Programação de máquinas que se perdia ao recarregar', after: 'Programação persistida e validada por tipo de recurso' },
]

const modules = NAVIGATION.flatMap(group => group.items).filter(item => PAGE_TOURS[item.to])

function openGuide(to: string) {
  router.push(to).then(() => setTimeout(() => ui.startTour(to, PAGE_TOURS[to]), 600))
}

function replayWelcome() {
  router.push('/').then(() => setTimeout(() => ui.startTour(WELCOME_KEY, WELCOME_TOUR), 400))
}
</script>

<template>
  <div class="toolbar">
    <p>Tudo o que você precisa para usar o Thalamus 2.0. Os guias também podem ser abertos a qualquer momento pelo botão de ajuda no topo.</p>
    <button class="button" @click="replayWelcome"><PlayCircle :size="15" /> Rever tour de boas-vindas</button>
  </div>

  <article class="card manual-promo">
    <div class="manual-promo-head">
      <div>
        <em>Manual do sistema</em>
        <h2><BookMarked :size="18" /> Todos os processos explicados em detalhe</h2>
        <p>{{ MANUAL.length }} capítulos e {{ MANUAL_SECTIONS.length }} seções com passo a passo, regras, perfis envolvidos e atalhos para as telas. Índice numerado e busca.</p>
      </div>
      <div class="manual-promo-actions">
        <RouterLink to="/ajuda/manual" class="button"><BookOpen :size="15" /> Abrir o manual</RouterLink>
        <RouterLink to="/ajuda/manual/completo" class="button secondary"><FileText :size="15" /> Versão para imprimir</RouterLink>
      </div>
    </div>
    <div class="manual-promo-chapters">
      <RouterLink v-for="(chapter, index) in MANUAL" :key="chapter.id" :to="`/ajuda/manual/${chapter.sections[0].id}`">
        <component :is="chapter.icon" :size="15" /><span><b>{{ index + 1 }}. {{ chapter.title }}</b>{{ chapter.sections.length }} seções</span>
      </RouterLink>
    </div>
  </article>

  <article class="card">
    <div class="section-head"><div><h2>O processo de ponta a ponta</h2><p>Cada etapa alimenta a seguinte automaticamente. Ninguém redigita informação.</p></div></div>
    <div class="process-map">
      <div v-for="node in PROCESS" :key="node.title" class="process-node"><em>{{ node.area }}</em><b>{{ node.title }}</b><span>{{ node.text }}</span></div>
    </div>
  </article>

  <section class="help-grid">
    <article class="card help-card">
      <h3><Tablet :size="17" /> Como funciona o tablet</h3>
      <ol>
        <li>O operador toca no próprio nome e digita o PIN de 4 dígitos.</li>
        <li>Escolhe o posto (injetora, célula, almoxarifado, qualidade ou expedição).</li>
        <li>Vê somente a fila daquele posto, na ordem definida pelo PCP.</li>
        <li><b>Iniciar</b> começa a contar o tempo; <b>Pausar</b> pede o motivo da parada.</li>
        <li><b>Apontar</b> registra peças boas e refugo (com motivo) usando botões grandes.</li>
        <li><b>Concluir</b> libera a próxima etapa; o painel e o fluxo atualizam na hora.</li>
        <li><b>Chamar líder</b> abre um chamado que aparece no sino do líder.</li>
      </ol>
      <button class="button secondary small" style="margin-top:12px" @click="router.push('/tablet')">Abrir simulador do tablet</button>
    </article>
    <article class="card help-card">
      <h3><BookOpen :size="17" /> Perguntas frequentes</h3>
      <ul>
        <li><b>Onde vejo em que etapa está um pedido?</b> Em Fluxo do pedido ou pela busca no topo.</li>
        <li><b>Por que não consigo iniciar uma OP?</b> Ela precisa estar separada pelo almoxarifado e a máquina não pode estar em manutenção corretiva.</li>
        <li><b>Quebra de máquina abre manutenção?</b> Sim, a pausa com esse motivo abre uma OS corretiva automaticamente.</li>
        <li><b>O que vai para o Omie?</b> Pedidos de compra, ajustes de estoque, cadastro de produto e faturamento. Veja Integração Omie.</li>
        <li><b>O que vejo no meu perfil?</b> Troque o perfil no topo: o menu e as tarefas mudam conforme o papel.</li>
      </ul>
    </article>
  </section>

  <article class="card">
    <div class="section-head"><div><h2><CircleHelp :size="17" style="vertical-align:-3px" /> Guias por módulo</h2><p>Abre a tela e mostra, passo a passo, cada área importante</p></div></div>
    <div class="filter-row" style="flex-wrap:wrap">
      <button v-for="item in modules" :key="item.to" class="button secondary small" @click="openGuide(item.to)"><component :is="item.icon" :size="13" /> {{ item.label }}</button>
    </div>
  </article>

  <article class="card flush">
    <div class="section-head"><div><h2><Wrench :size="17" style="vertical-align:-3px" /> O que muda em relação ao sistema atual</h2><p>Problemas observados no sistema antigo e como o novo desenho evita cada um</p></div></div>
    <table>
      <thead><tr><th>Antes</th><th>No Thalamus 2.0</th></tr></thead>
      <tbody><tr v-for="row in LEGACY" :key="row.before"><td>{{ row.before }}</td><td><span class="cell-main">{{ row.after }}</span></td></tr></tbody>
    </table>
  </article>

  <article class="callout"><Unplug :size="18" /><div><strong>Integração com o Omie</strong>Nesta demonstração o Omie é simulado, mas segue o mesmo contrato que a integração real usará no backend.</div></article>
</template>
