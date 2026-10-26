import type { Component } from 'vue'
import {
  BookMarked, Boxes, CircleDollarSign, Compass, Factory, HandCoins, LineChart, Warehouse, Wrench,
} from 'lucide-vue-next'

/** Trechos entre **asteriscos** são renderizados em negrito. */
export type ManualBlock =
  | { kind: 'p'; text: string }
  | { kind: 'steps'; title?: string; items: string[] }
  | { kind: 'list'; title?: string; items: string[] }
  | { kind: 'rules'; title?: string; items: string[] }
  | { kind: 'table'; title?: string; head: string[]; rows: string[][] }
  | { kind: 'flow'; title?: string; items: string[] }
  | { kind: 'note'; tone: 'info' | 'tip' | 'warning'; text: string }

export interface ManualSection {
  id: string
  title: string
  summary: string
  roles?: string[]
  screens?: { label: string; to: string }[]
  tour?: string
  blocks: ManualBlock[]
  related?: string[]
}

export interface ManualChapter {
  id: string
  title: string
  icon: Component
  intro: string
  sections: ManualSection[]
}

export const MANUAL: ManualChapter[] = [
  {
    id: 'inicio', title: 'Primeiros passos', icon: Compass,
    intro: 'O que é o sistema, como ele está organizado e como se movimentar nele.',
    sections: [
      {
        id: 'visao-geral', title: 'O que é o Thalamus 2.0',
        summary: 'O sistema de produção da Roboflex e a divisão de responsabilidades com o Omie.',
        blocks: [
          { kind: 'p', text: 'O Thalamus 2.0 é o sistema de **produção e operação** da Roboflex. Ele cuida de tudo o que acontece entre o pedido aprovado e a carga expedida: cadastro técnico dos itens, planejamento, compras de material, chão de fábrica, qualidade, manutenção, assistência e o acompanhamento operacional dos custos.' },
          { kind: 'p', text: 'O **Omie** continua sendo o sistema fiscal e financeiro oficial. Os dois conversam por integração e cada dado tem um único dono, para que ninguém precise digitar a mesma informação duas vezes.' },
          {
            kind: 'table', title: 'Quem é dono de cada informação',
            head: ['Informação', 'Dono', 'O que o outro sistema faz'],
            rows: [
              ['Pedido de venda aprovado', 'Omie', 'O Thalamus importa e planeja a produção'],
              ['Nota fiscal (NF-e) e faturamento', 'Omie', 'O Thalamus pede a emissão ao expedir e recebe o número da nota'],
              ['Apuração fiscal: CST e alíquota aplicados na nota', 'Omie', 'A matriz fiscal do Thalamus apenas sugere, para conferência'],
              ['Contas a pagar e a receber, banco e fiscal', 'Omie', 'O Thalamus lê o pagamento e o recebimento como realizado do orçamento'],
              ['Cadastro técnico do item (estrutura, roteiro, camadas)', 'Thalamus', 'O Omie recebe o cadastro do produto ativo'],
              ['Cadastro fiscal do item: NCM, Ex-TIPI, CEST, origem, benefícios e reforma', 'Compartilhado (mão dupla)', 'Nasce no Thalamus; alteração feita no Omie volta, e mudança simultânea vira conflito a decidir'],
              ['Códigos de barras, tabelas de preço e mídia do item', 'Thalamus', 'O Omie recebe quando o item é publicado'],
              ['Ordens de produção, apontamentos e qualidade', 'Thalamus', 'Não vão ao Omie'],
              ['Pedido de compra e ajuste de estoque', 'Thalamus', 'São enviados ao Omie com o motivo'],
            ],
          },
          { kind: 'note', tone: 'info', text: 'Nesta demonstração o Omie é simulado, mas segue o mesmo contrato que a integração real vai usar.' },
        ],
        related: ['integracao-omie', 'processo-ponta-a-ponta'],
      },
      {
        id: 'navegacao', title: 'Áreas, módulos e navegação',
        summary: 'Tela inicial, barra de módulos, menu do módulo, busca e notificações.',
        screens: [{ label: 'Tela inicial', to: '/' }],
        tour: '/',
        blocks: [
          { kind: 'p', text: 'O sistema é dividido em **sete áreas**: Cadastros, Suprimentos, Comercial, Operações, Serviços, Gestão e Finanças. A tela inicial mostra um bloco por área, todos na mesma linha. Cada bloco tem atalhos para as telas mais usadas e o botão **Entrar**.' },
          {
            kind: 'list', title: 'Elementos fixos da tela',
            items: [
              '**Barra superior**: marca, seletor de área (o nome da área acima do título da tela), busca geral, perfil, sino de notificações e o botão de ajuda.',
              '**Barra de módulos**: faixa escura logo abaixo do topo, com os módulos da área em que você está. O módulo aberto fica sublinhado em ciano. À direita fica o indicador do Omie, que mostra se há falhas de integração.',
              '**Abas do módulo**: Produtos e Orçamentos têm as telas internas numa faixa no topo, com a tela aberta sublinhada. Na ficha do item, as abas do módulo somem e as seções do item aparecem na mesma faixa horizontal.',
            ],
          },
          {
            kind: 'steps', title: 'Para chegar a uma tela',
            items: [
              'Na tela inicial, clique em **Entrar** no bloco da área, ou num atalho do bloco.',
              'Na barra de módulos, escolha o módulo.',
              'Se o módulo tiver abas no topo, escolha a tela interna.',
              'Para trocar de área sem voltar ao início, clique no nome da área acima do título da tela.',
            ],
          },
          { kind: 'p', text: 'A **busca** do topo encontra pedidos, ordens de produção, itens, oportunidades, demandas, projetos, chamados e pessoas. O resultado abre o registro direto: a ficha à direita ou, no caso de itens, a página do item.' },
          { kind: 'note', tone: 'tip', text: 'O número vermelho no sino junta chamados do chão de fábrica, o limiar do orçamento e as decisões do seu perfil. No saldo excedido, a justificativa e os botões decidem ali; o clique no restante abre Ações. No limiar, Ciente encerra o aviso e o clique no restante abre a categoria.' },
        ],
        related: ['perfis', 'fichas'],
      },
      {
        id: 'perfis', title: 'Perfis e permissões',
        summary: 'O que cada perfil enxerga e como a permissão é conferida.',
        screens: [{ label: 'Organização e acessos', to: '/organizacao' }],
        blocks: [
          { kind: 'p', text: 'Acesso é definido por **funcionalidades** agrupadas em perfis. Uma pessoa pode ter vários perfis na mesma empresa, e as funcionalidades se somam. O perfil de sistema **Administrador** não pode ser apagado nem perder permissões: ele sempre recebe tudo, inclusive funcionalidades adicionadas depois.' },
          {
            kind: 'table', title: 'Acesso padrão por perfil',
            head: ['Perfil', 'Módulos liberados'],
            rows: [
              ['Administrador', 'Todos, inclusive orçamento, categorias e liberação de saldo excedido'],
              ['Gestor', 'Todos, inclusive a liberação de saldo excedido e a consulta consolidada do grupo'],
              ['Comercial', 'CRM, Vendas, Expedição, Produtos'],
              ['Engenharia', 'Produtos, Serviços, Ativos, Projetos'],
              ['PCP', 'Painel, Fluxo do pedido, Vendas, Produtos, Planejamento, Ordens de produção, Demandas, Injeção, Montagem, Indicadores'],
              ['Compras', 'Painel, Demandas, Compras, Almoxarifado, Orçamentos, Produtos'],
              ['Almoxarifado', 'Almoxarifado, Compras, Demandas, Ordens de produção, Produtos'],
              ['Líder de produção', 'Painel, Fluxo do pedido, Planejamento, Ordens de produção, Demandas, Injeção, Montagem, Qualidade, Manutenção'],
              ['Qualidade', 'Qualidade, Ordens de produção, Indicadores'],
              ['Expedição', 'Expedição, Vendas'],
              ['Manutenção', 'Manutenção, Ativos, Serviços, Demandas, Injeção'],
              ['Assistência', 'Assistência técnica, Serviços, Demandas, Almoxarifado'],
              ['Financeiro', 'DRE, Orçamentos (com centros de custo e consulta consolidada do grupo), Projetos, Indicadores, Produtos'],
              ['Operador', 'Somente o tablet do posto'],
            ],
          },
          { kind: 'p', text: 'A funcionalidade representa uma ação de negócio, não cada botão: por exemplo, consultar Orçamentos, gerir orçamento, liberar saldo excedido ou gerir acessos. A tela pergunta quais perfis da empresa têm aquela funcionalidade. A lista de perfis Financeiro, Gestor e demais existe só no cenário de demonstração. Numa empresa nova, o único perfil inicial é o Administrador; os outros são criados nesta tela.' },
          { kind: 'p', text: 'Cargo e setor descrevem a pessoa e podem indicar o responsável de um centro de custo. Eles não abrem o botão. Quem decide a ação é o perfil.' },
          { kind: 'note', tone: 'info', text: 'Na demonstração, apenas o Administrador vê **Visualizar como** no topo. Ela serve para conferir a interface de outro perfil, sem trocar a identidade nem os acessos reais. Na API real, qualquer impersonação exigirá justificativa e auditoria.' },
        ],
        related: ['organizacao', 'permissoes-camada'],
      },
      {
        id: 'fichas', title: 'Fichas, linha do tempo e rastreabilidade',
        summary: 'Como os registros se ligam uns aos outros.',
        blocks: [
          { kind: 'p', text: 'Quase todo registro abre uma **ficha** no painel à direita: oportunidade, proposta, demanda, pedido de compra, chamado, projeto, orçamento, pessoa e ativo. Pedidos de venda e ordens de produção abrem o painel do pedido. Item, parceiro e serviço abrem a própria página. Posto abre uma janela sobre a lista.' },
          {
            kind: 'list', title: 'O que toda ficha mostra',
            items: [
              '**Ações principais** no topo, já filtradas pelo que a situação permite.',
              '**Vínculos**: de onde o registro veio e o que ele gerou. Cada vínculo abre a ficha correspondente, e o botão voltar retorna à anterior.',
              '**Linha do tempo**: cada evento com quem fez, quando e em qual módulo.',
            ],
          },
          { kind: 'p', text: 'Com isso dá para seguir um caminho completo sem sair do lugar, por exemplo: chamado de assistência → pedido de venda → OP que produziu o lote → não conformidade → demanda da peça → pedido de compra → categoria do orçamento.' },
        ],
      },
      {
        id: 'tarefas', title: 'Minhas tarefas',
        summary: 'A fila de trabalho de cada perfil.',
        screens: [{ label: 'Minhas tarefas', to: '/tarefas' }],
        tour: '/tarefas',
        blocks: [
          { kind: 'p', text: 'Minhas tarefas reúne tudo o que depende do seu perfil agora, já com a ação principal ao lado: separar um kit, aprovar uma compra, inspecionar um lote, homologar um item, decidir uma exceção de cadastro.' },
          { kind: 'rules', items: ['A tarefa some sozinha quando o trabalho é feito, em qualquer tela.', 'A área seguinte é avisada automaticamente: ninguém precisa mudar status à mão.', 'Trocar o perfil mostra a fila de outra função.'] },
        ],
      },
      {
        id: 'ajuda', title: 'Guias interativos e esta central',
        summary: 'Tour de cada tela, manual e perguntas frequentes.',
        screens: [{ label: 'Central de ajuda', to: '/ajuda' }],
        blocks: [
          { kind: 'p', text: 'Cada tela importante tem um **guia interativo**, que destaca os elementos um por um. Ele abre sozinho na primeira visita e pode ser reaberto pelo botão de ajuda (?) no topo, ou pela lista "Guias por módulo" na Central de ajuda.' },
          { kind: 'p', text: 'Este **manual** explica os processos com mais detalhe que o guia. Use o índice à esquerda, a busca, ou os botões **Abrir tela** e **Ver guia** de cada seção.' },
        ],
      },
    ],
  },

  {
    id: 'cadastros', title: 'Cadastros', icon: Boxes,
    intro: 'A base compartilhada: itens, estruturas, serviços, pessoas, postos e ativos.',
    sections: [
      {
        id: 'itens-conceitos', title: 'Cadastro de itens: núcleo e camadas',
        summary: 'Um código por item, com camadas que dependem do tipo.',
        roles: ['Engenharia', 'Gestor'],
        screens: [{ label: 'Itens', to: '/produtos' }],
        tour: '/produtos',
        blocks: [
          { kind: 'p', text: 'Tudo o que a empresa produz, compra, vende ou usa é um **item** com um único código. O item tem um **núcleo**, comum a todos os tipos (código, descrição, tipo, unidade base, classificação), e **camadas** que só aparecem quando o tipo precisa delas.' },
          {
            kind: 'table', title: 'Tipos de item e camadas',
            head: ['Tipo', 'Natureza', 'Camadas', 'Observação'],
            rows: [
              ['Produto acabado (PA)', 'Bem', 'Estoque, unidades, estrutura e roteiro, comercial, fiscal, mídia, projetos', 'Precisa de estrutura, roteiro, EAN e preço para ativar'],
              ['Peça injetada (SE)', 'Bem', 'Estoque, unidades, estrutura, fiscal, mídia, projetos', 'Fabricada na injetora; vira OP de injeção'],
              ['Matéria-prima (MP)', 'Bem', 'Estoque, unidades, fiscal, mídia, projetos', 'Comprada; entra no planejamento de materiais'],
              ['Componente (CP)', 'Bem', 'Estoque, unidades, fiscal, mídia, projetos', 'Comprado; entra no planejamento de materiais'],
              ['Embalagem (EM)', 'Bem', 'Estoque, unidades, fiscal, mídia, projetos', 'Comprada; entra no planejamento de materiais'],
              ['Kit físico (KF)', 'Bem', 'Estoque, unidades, estrutura e roteiro, comercial, fiscal, mídia, projetos', 'Montado e estocado como item próprio'],
              ['Kit virtual (KT)', 'Kit virtual', 'Estrutura, comercial, fiscal, mídia, projetos', 'Não é estocado; explode em componentes na proposta aceita'],
              ['Serviço (SV)', 'Serviço', 'Comercial, fiscal, projetos', 'Sem estoque e fora do planejamento'],
              ['Imobilizado (IM)', 'Imobilizado', 'Fiscal, projetos', 'Não é vendido nem entra no planejamento'],
              ['Ferramental (FE)', 'Imobilizado', 'Ferramental, fiscal, mídia, projetos', 'Molde, gabarito ou dispositivo; o roteiro aponta para ele'],
            ],
          },
          {
            kind: 'list', title: 'As telas do módulo Produtos',
            items: [
              '**Itens**: a lista de todos os itens, com filtros, ordenação, colunas configuráveis e ações em lote.',
              '**Ficha do item**: abre ao clicar numa linha. No topo ficam a foto, a situação e os indicadores (custo, saldo, lead time, roteiro, onde é usado, mudanças); cada indicador leva à seção correspondente. Abaixo, as seções ficam numa faixa horizontal: Identificação, Engenharia, Logística, Comercial e fiscal, Documentos e Governança. O número marca o que pede ação.',
              '**Classificação**: a árvore que organiza os itens e define os atributos que eles herdam.',
              '**Estruturas e roteiros e Fiscal**: visões para quem trabalha nessa parte. O Fiscal também tem a matriz fiscal e a geração do SPED. Estoque e ferramental ficam na página do item, não nestas abas.',
              '**Mudanças**: a lista das mudanças de engenharia em aberto.',
              '**Homologação**: as filas de aprovação e de pendências.',
            ],
          },
          {
            kind: 'list', title: 'Encontrar itens numa base grande',
            items: [
              'A busca aceita código, descrição, descrição comercial, qualquer código de barras (EAN, DUN, UPC), marca, linha e NCM.',
              'Os filtros combinam tipo, situação, nó da classificação (inclui os nós filhos), marca, categoria de e-commerce, curva ABC e pendência (sem NCM, sem CEST, sem estrutura, sem roteiro, sem EAN, sem preço, GTIN × NCM divergente, exceção pendente, versão em rascunho, obsoleto com saldo).',
              'Clique no cabeçalho para ordenar por código, descrição, saldo, data de alteração ou situação.',
              'Em **Colunas**, escolha o que aparece: tipo, classificação, unidade, saldo, NCM, EAN, marca, curva ABC, preço vigente, grade, versão do registro, alterado por e pendências. A escolha fica salva no navegador.',
              'A lista é paginada em 25, 50 ou 100 itens por página. Os filtros continuam valendo quando você abre um item e volta.',
            ],
          },
        ],
        related: ['criar-item', 'ciclo-vida', 'permissoes-camada'],
      },
      {
        id: 'criar-item', title: 'Criar um item',
        summary: 'Do novo rascunho até a homologação.',
        roles: ['Engenharia', 'Gestor'],
        screens: [{ label: 'Itens', to: '/produtos' }],
        blocks: [
          {
            kind: 'steps',
            items: [
              'Em Produtos → Itens, clique em **Novo item**.',
              'Informe a descrição, o tipo, a unidade base e o nó da classificação.',
              'Se já existir item com descrição parecida, o sistema lista os candidatos. Confira: se for o mesmo item, cancele e use o existente. Se for outro, confirme com **É outro item, criar**.',
              'O item nasce em **Rascunho**, com código sequencial (RF-10007, RF-10008…) e abre a página dele.',
              'Preencha as camadas que o tipo pede. Para produto acabado e kit, abra a primeira versão da estrutura na aba Estrutura e roteiro.',
              'Na aba Ciclo e aprovações, clique em **Enviar para homologação**.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'O código não tem significado e nunca muda. Quem organiza é a classificação.',
              'Só Engenharia e Gestor criam itens.',
              'Rascunho não entra em pedido, proposta, compra, demanda nem produção.',
              'Descrição parecida gera aviso, não bloqueio: a decisão é de quem cadastra.',
            ],
          },
        ],
        related: ['ciclo-vida', 'classificacao'],
      },
      {
        id: 'classificacao', title: 'Classificação em árvore',
        summary: 'Grupos, subgrupos e famílias sem limite de profundidade.',
        roles: ['Engenharia', 'Gestor'],
        screens: [{ label: 'Classificação', to: '/produtos/classificacao' }],
        blocks: [
          { kind: 'p', text: 'A classificação é uma árvore livre (por exemplo, Componentes › Elétricos › Cabos). Ela serve para organizar, filtrar e fazer relatórios. Reclassificar um item não muda o código dele.' },
          {
            kind: 'steps', title: 'Manter a árvore',
            items: [
              'Abra Produtos → Classificação. Use as setas para abrir e fechar os nós, ou **Expandir tudo**.',
              'Clique no nome de um nó para selecioná-lo. À direita aparecem a contagem de itens (no nó e incluindo os filhos) e as ações.',
              'Para criar um filho, digite o nome em **Novo filho**. Para criar um nó de primeiro nível, use **Criar raiz** abaixo da árvore.',
              'Para renomear, edite o nome e salve.',
              '**Ver itens na lista** abre a lista de itens já filtrada por aquele nó.',
            ],
          },
          { kind: 'rules', items: ['Não pode haver dois nós com o mesmo nome no mesmo nível.', 'Só nó sem filhos e sem itens pode ser removido. Para esvaziar um nó, reclassifique os itens em lote na lista.'] },
        ],
        related: ['acoes-lote', 'atributos'],
      },
      {
        id: 'atributos', title: 'Atributos por classe',
        summary: 'Características técnicas definidas no nó e herdadas pelos itens.',
        roles: ['Engenharia', 'Gestor'],
        screens: [{ label: 'Classificação', to: '/produtos/classificacao' }],
        tour: '/produtos/classificacao',
        blocks: [
          { kind: 'p', text: 'Cada nó da classificação pode definir **atributos**: Linha, Modelo de device e Cor nos produtos acabados; Grau de proteção nos cases; Peso da peça nas peças injetadas. O item herda os atributos do nó dele e de todos os nós acima.' },
          {
            kind: 'steps', title: 'Definir um atributo',
            items: [
              'Em Produtos → Classificação, selecione o nó e clique em **Atributo**.',
              'Informe o nome, o tipo (texto, número ou lista), a unidade e, para lista, as opções.',
              'Marque **Obrigatório** se o item não pode ir para homologação sem ele.',
              'Marque **Eixo de variação** se o atributo diferencia variantes de uma grade (por exemplo, Cor).',
              'Na ficha do item, em **Geral e atributos**, preencha os valores.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'Atributo obrigatório vazio impede o envio para homologação e aparece como pendência "Atributos pendentes".',
              'Valor de lista precisa ser uma das opções; número precisa ser numérico.',
              'Não dá para remover um atributo que algum item já preencheu.',
              'Na variante de uma grade, o eixo de variação é fixo: muda-se pela grade, não pelo item.',
              'Ao criar uma grade, os eixos já vêm sugeridos pelos atributos marcados como eixo de variação.',
            ],
          },
        ],
        related: ['classificacao', 'grade'],
      },
      {
        id: 'camada-estoque', title: 'Estoque, filiais e lotes',
        summary: 'Endereço, mínimo, controles de lote e validade, saldo negativo.',
        roles: ['Almoxarifado', 'Compras', 'Engenharia', 'Gestor'],
        screens: [{ label: 'Estoque e unidades', to: '/produtos/estoque' }],
        blocks: [
          { kind: 'p', text: 'A aba **Estoque e unidades** da página do item mostra o saldo, o reservado para OPs, o disponível e o mínimo. Abaixo ficam os parâmetros da Matriz, as filiais, os lotes com saldo, as unidades alternativas, um conversor e as últimas movimentações.' },
          {
            kind: 'table', title: 'Parâmetros',
            head: ['Campo', 'Para que serve'],
            rows: [
              ['Endereço', 'Onde o item fica no almoxarifado da Matriz'],
              ['Estoque mínimo', 'Abaixo dele o item aparece como crítico e pode gerar demanda'],
              ['Lead time', 'Dias até a compra chegar; usado para estimar datas'],
              ['Lote mínimo e múltiplo de compra', 'A necessidade de compra sobe para o lote mínimo e arredonda para o múltiplo (ex.: precisa 130, mínimo 100, múltiplo 25 → compra 150). O mínimo não pode ser menor que o múltiplo'],
              ['Peso unitário', 'Usado na expedição'],
              ['Comprimento, largura e altura', 'Dimensões em cm; o sistema calcula o volume para frete e armazenagem'],
              ['Controla lote', 'Cada entrada gera um lote, e cada baixa registra os lotes usados'],
              ['Controla validade', 'Além do lote, guarda o vencimento e consome primeiro o que vence antes (FEFO)'],
              ['Controla número de série', 'Marca itens rastreados unidade a unidade'],
              ['Permite saldo negativo', 'Só com essa opção uma baixa pode deixar o saldo abaixo de zero'],
            ],
          },
          {
            kind: 'rules',
            items: [
              '**Sem saldo negativo**: sem a opção ligada, qualquer baixa que deixaria o saldo abaixo de zero é recusada, com o saldo atual na mensagem. Vale para separação, atendimento de demanda, peça de assistência, expedição e ajuste.',
              '**FEFO**: com validade ligada, a baixa consome primeiro o lote que vence antes; empatando, o recebido antes. Sem validade, consome pelo recebimento mais antigo.',
              'Os lotes usados ficam gravados na movimentação e na linha de material da OP, para rastreio.',
              'Ao ligar o controle de lote num item que já tem saldo, o saldo vira um lote L-SALDO.',
              'Não dá para desligar o controle de lote enquanto houver lote com saldo.',
            ],
          },
          { kind: 'p', text: 'Na tabela **Filiais**, habilite o item em Itabira ou Vitória com endereço e mínimo próprios. Filial habilitada exige endereço.' },
          { kind: 'p', text: 'A aba também mostra a **curva ABC** e o **giro** do item nos últimos 90 dias (veja a seção Custo-padrão e curva ABC). Itens comprados, sem estrutura, têm aqui o lançamento do custo-padrão.' },
          { kind: 'note', tone: 'tip', text: 'O saldo, os lotes e as unidades ficam na aba Estoque e unidades da página do item. Essa lista não está nas abas do módulo.' },
        ],
        related: ['unidades', 'almoxarifado'],
      },
      {
        id: 'unidades', title: 'Unidades e conversões',
        summary: 'Comprar numa unidade, produzir e estocar em outra.',
        screens: [{ label: 'Estoque e unidades', to: '/produtos/estoque' }],
        blocks: [
          { kind: 'p', text: 'Todo item tem uma **unidade base**, em que o saldo é guardado. Unidades alternativas servem para contextos específicos: comprar parafuso em cento ou milheiro, consumir em kit de 8, vender em caixa.' },
          {
            kind: 'steps', title: 'Cadastrar uma conversão',
            items: ['Na aba Estoque e unidades, vá até Unidades alternativas.', 'Escolha o contexto (Compra, Produção, Estoque ou Venda), a unidade e o fator.', 'O fator sempre diz quantas unidades base cabem em uma alternativa: 1 milheiro = 1000 un.', 'Use o **Conversor** logo abaixo para conferir.'],
          },
          { kind: 'rules', items: ['O fator tem de ser maior que zero.', 'A unidade alternativa não pode ser igual à base.', 'Não existe conversão em cadeia: de cento para milheiro, converta passando pela unidade base.'] },
        ],
      },
      {
        id: 'estrutura-versoes', title: 'Estrutura e roteiro: versões com vigência',
        summary: 'Alteração controlada da lista de materiais.',
        roles: ['Engenharia', 'PCP', 'Gestor'],
        screens: [{ label: 'Estruturas', to: '/produtos/estruturas' }],
        blocks: [
          { kind: 'p', text: 'A **estrutura** (lista de materiais) diz quais componentes e quantidades formam um produto acabado, peça injetada ou kit. Ela nunca é editada direto: cada alteração nasce como uma **versão** (A, B, C…), é conferida e liberada com uma data de vigência. As versões anteriores ficam guardadas.' },
          {
            kind: 'flow', title: 'Situações de uma versão',
            items: ['Rascunho', 'Programada (liberada com data futura)', 'Vigente', 'Substituída'],
          },
          {
            kind: 'steps', title: 'Alterar a estrutura de um item',
            items: [
              'Abra o item e vá para a aba **Estrutura e roteiro**.',
              'As versões aparecem em linha no topo da aba. Clique em **Nova versão**, informe o motivo e confirme. Ela nasce como cópia da vigente.',
              'Na aba **Estrutura**, ajuste quantidade e perda direto na linha, inclua componentes pela última linha da tabela ou remova com a lixeira. A tabela mostra o que é novo, o que mudou ("era 8"), o que foi removido e o custo de material por unidade.',
              'No painel **Liberação**, marque os itens do checklist (estrutura conferida e, para produto acabado e kit físico, roteiro conferido).',
              'Escolha a data em **Vigente a partir de** e clique em **Liberar versão**.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'Só existe uma versão em rascunho por item. Conclua ou descarte antes de abrir outra.',
              'Só componente **ativo** entra numa versão nova. Serviço e imobilizado não entram.',
              'O item não pode ser componente de si mesmo, nem de um componente que já o usa (o sistema detecta o ciclo).',
              'Quantidade tem de ser maior que zero.',
              'Cada linha aceita um **% de perda** (de 0 a 99). A necessidade vira quantidade × (1 + perda) por unidade produzida, e é ela que entra na OP, no planejamento de materiais e no custo da estrutura.',
              'Qualquer mudança nas linhas desmarca o checklist.',
              'A vigência não pode começar no passado. Com a data de hoje, a versão entra em vigor na hora; com data futura, fica **programada** e a atual vale até a véspera.',
              'Enquanto houver uma versão programada, não é possível liberar outra.',
              'A ordem de produção grava a versão com que foi aberta. OPs já abertas não mudam quando uma versão nova entra em vigor.',
            ],
          },
          { kind: 'p', text: 'O **roteiro** é a sequência de operações de fabricação (injetar, montar, testar, embalar). Ele faz parte da **versão**, junto com a estrutura: cada versão tem o seu roteiro, e os dois entram em vigor juntos. Cada operação tem posto, tempo por unidade, preparação (setup), equipe, ferramental, instruções para o tablet e a marca de **inspeção de primeira peça**.' },
          {
            kind: 'steps', title: 'Manter o roteiro e os prazos',
            items: [
              'Selecione a versão em rascunho na seção **Estrutura e roteiro** e abra a aba **Roteiro**. Um ponto laranja na aba indica que o roteiro mudou em relação à versão comparada.',
              'Clique na operação para abrir o detalhe. Na versão vigente o painel só mostra. Na versão em rascunho, o mesmo painel edita. **Operação** abre o painel vazio para incluir uma etapa: nome, posto, tempo, preparação, equipe e instruções. Para injeção, escolha o molde: o tempo por peça é calculado pelo ciclo dividido pelas cavidades ativas.',
              'Use as setas para mudar a ordem e a lixeira para tirar uma operação. **Copiar roteiro de outro item** traz as operações de um item parecido.',
              'Em **Comparar com**, escolha outra versão para ver o que mudou na estrutura e no roteiro.',
              'Em **Prazos de fabricação**, informe o prazo de produção em dias. A data sugerida da proposta passa a ser esse prazo somado ao maior lead time de compra entre os componentes da estrutura vigente.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'Produto acabado e kit físico não liberam versão com roteiro vazio.',
              'Operação com molde só aceita injetora compatível com aquele molde.',
              'O posto vem de Cadastros → Postos. Posto inativo não entra em operação nova; a operação que já o usa permanece.',
              'Qualquer mudança no roteiro desmarca o checklist da versão.',
              'Versão ligada a uma mudança de engenharia só é liberada pela própria mudança, na data de efetividade.',
            ],
          },
          { kind: 'note', tone: 'info', text: 'Mudar o roteiro de um item em homologação apaga a aprovação do PCP.' },
        ],
        related: ['planejar-pedido', 'ordens-producao', 'ferramental', 'mudancas-engenharia', 'postos'],
      },
      {
        id: 'ferramental', title: 'Ferramental: moldes, gabaritos e dispositivos',
        summary: 'Item de engenharia usado no roteiro. O ativo de manutenção é outro cadastro e o vínculo é opcional.',
        roles: ['Engenharia', 'PCP', 'Manutenção', 'Gestor'],
        screens: [{ label: 'Ferramental', to: '/produtos/ferramental' }],
        tour: '/produtos/ferramental',
        blocks: [
          { kind: 'p', text: 'Molde, gabarito e dispositivo são itens do tipo **Ferramental (FE)**, com a seção **Ferramental** na ficha do produto. Esse item guarda o que a engenharia usa no roteiro: cavidades, ciclo, postos compatíveis, dono e desgaste no custo. O roteiro aponta para este item.' },
          { kind: 'p', text: 'O bem físico que a manutenção acompanha fica em **Ativos**: contador de golpes, preventiva e ordem de serviço. O campo **Ativo na manutenção** liga os dois quando o ativo já existe. A opção inicial é **Não vinculado**. Cavidade, ciclo, posto e custo valem sem esse vínculo. A lista só mostra ativos já cadastrados; esta tela não cria o ativo. Dá para gravar o ferramental agora e apontar o ativo depois. O cadastro de Ativos ainda não foi revisto, então criar o ativo a partir daqui fica para essa revisão.' },
          {
            kind: 'table', title: 'Dados do ferramental',
            head: ['Campo', 'Para que serve'],
            rows: [
              ['Cavidades nominais e ativas', 'Bloqueie uma cavidade com defeito sem mudar o molde; o tempo por peça sobe na hora'],
              ['Ciclo padrão', 'Segundos por golpe; tempo por peça = ciclo ÷ cavidades ativas'],
              ['Peso do golpe', 'Peças mais canal de alimentação'],
              ['Injetoras ou postos compatíveis', 'O roteiro só aceita postos ativos deste cadastro. Molde só aceita injetora'],
              ['Vida útil e valor', 'Com os dois, o custo inclui o desgaste por peça (só ferramental da Roboflex)'],
              ['Dono', 'Roboflex ou cliente; ferramental de cliente exige o nome do cliente e não entra no custo'],
              ['Ativo na manutenção', 'Opcional. De onde vêm o contador de golpes e a preventiva, quando o ativo já existe'],
            ],
          },
          {
            kind: 'rules',
            items: [
              'Para entrar em roteiro, o molde precisa de cavidades, ciclo e ao menos um posto compatível. O ativo de manutenção não entra nessa exigência.',
              'Sem o ativo vinculado, o contador de golpes fica em zero e a preventiva automática por vida útil não dispara.',
              'Salvar o ferramental recalcula o tempo das operações que o usam, nos roteiros vigentes e nas versões em rascunho. OPs já abertas mantêm o tempo com que nasceram.',
              'A lista marca em vermelho o ferramental acima de 85% da vida útil, contada pelos golpes do ativo vinculado.',
            ],
          },
        ],
        related: ['estrutura-versoes', 'postos', 'ativos', 'manutencao', 'custo-padrao'],
      },
      {
        id: 'mudancas-engenharia', title: 'Mudanças de engenharia (ECO)',
        summary: 'Alteração de estrutura, roteiro ou ferramental com impacto avaliado e data de efetividade.',
        roles: ['Engenharia', 'PCP', 'Gestor'],
        screens: [{ label: 'Mudanças', to: '/produtos/mudancas' }],
        tour: '/produtos/mudancas',
        blocks: [
          { kind: 'p', text: 'Quando a alteração afeta estoque, OP ou pedido, ela passa por uma **mudança de engenharia**. A mudança reúne o motivo, os itens, o destino do estoque atual e a data em que a versão nova passa a valer.' },
          { kind: 'flow', title: 'Etapas da mudança', items: ['Solicitada', 'Em análise', 'Aprovada', 'Implementada', 'ou Recusada'] },
          {
            kind: 'steps', title: 'Conduzir uma mudança',
            items: [
              'Em Produtos → Mudanças, clique em **Solicitar mudança**. Informe título, motivo, prioridade, itens, destino do estoque (usar até acabar, retrabalhar, sucatear, sem estoque) e data de efetividade.',
              'Abra a linha. A tabela **Impacto hoje** mostra, por item, saldo, OPs abertas, pedidos, compras e onde é usado (todos os níveis acima).',
              'Em análise, use **Abrir versão** em cada item: a versão em rascunho nasce ligada à mudança. Ajuste estrutura e roteiro na ficha do item.',
              'Clique em **Aprovar** e, na data, em **Implementar**: todas as versões ligadas são liberadas juntas.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'Aprovar exige o aprovador técnico (Engenharia ou Gestor) e uma versão em rascunho ligada para cada item com estrutura.',
              'Recusar exige motivo. A recusa fica no histórico.',
              'Versão ligada a uma mudança não é liberada pela ficha do item, só pela implementação.',
            ],
          },
        ],
        related: ['estrutura-versoes', 'ferramental'],
      },
      {
        id: 'custos-engenharia', title: 'Custo calculado pela engenharia',
        summary: 'Material, máquina, mão de obra, preparação e desgaste de ferramental.',
        roles: ['Engenharia', 'Gestor', 'Financeiro'],
        screens: [{ label: 'Itens', to: '/produtos' }],
        blocks: [
          { kind: 'p', text: 'A seção **Custos** da ficha calcula o custo por unidade a partir da estrutura vigente e do roteiro, e compara com o custo-padrão.' },
          {
            kind: 'table', title: 'Como cada parcela é calculada',
            head: ['Parcela', 'Cálculo'],
            rows: [
              ['Material', 'Custo dos componentes × necessidade (com perda)'],
              ['Máquina', 'Tempo por unidade × custo-hora do posto'],
              ['Mão de obra', 'Tempo por unidade × equipe × R$ 38,00/h'],
              ['Preparação', 'Setup × (custo-hora do posto + mão de obra) ÷ lote'],
              ['Ferramental', 'Valor ÷ vida útil ÷ cavidades ativas (só ferramental da Roboflex)'],
            ],
          },
          { kind: 'p', text: 'O lote padrão é 200 unidades ou o lote mínimo do item; mude o lote na própria seção para ver o efeito da preparação.' },
        ],
        related: ['custo-padrao', 'ferramental'],
      },
      {
        id: 'embalagem', title: 'Níveis de embalagem',
        summary: 'Unidade, caixa, master e palete, com GTIN, peso e medidas.',
        roles: ['Engenharia', 'Expedição', 'Gestor'],
        screens: [{ label: 'Itens', to: '/produtos' }],
        blocks: [
          { kind: 'p', text: 'A seção **Embalagem** descreve como o item é embalado em cada nível: quantas unidades, qual embalagem do catálogo, GTIN (EAN/DUN), peso e medidas.' },
          {
            kind: 'rules',
            items: [
              'O nível Unidade contém sempre 1.',
              'Cada nível acima contém mais unidades que o anterior, em múltiplo inteiro (10 por caixa, 400 por master = 40 caixas).',
              'O GTIN não pode se repetir entre níveis nem entre itens.',
              'O material de cada nível precisa ser um item de Embalagem (EM).',
            ],
          },
        ],
        related: ['codigos-barras', 'expedicao'],
      },
      {
        id: 'comercial-fiscal', title: 'Camada comercial: descrição, marca e categorias',
        summary: 'O que o cliente enxerga e as dimensões de análise.',
        roles: ['Comercial', 'Gestor'],
        screens: [{ label: 'Itens', to: '/produtos' }],
        blocks: [
          { kind: 'p', text: 'A aba **Comercial** guarda a **descrição comercial**, a **marca**, a **linha comercial** e as **categorias de e-commerce**. Abaixo ficam os códigos de barras, os preços por tabela e a grade. A nota fiscal sai pelo Omie.' },
          {
            kind: 'list', title: 'Dimensões de análise',
            items: [
              '**Marca** e **linha** (por exemplo, Roboflex Hard › Extreme) são livres e aparecem como filtro e coluna na lista.',
              '**Categorias** são várias por item, separadas por vírgula. Os botões abaixo do campo sugerem as categorias já usadas, para evitar grafias diferentes.',
              'Nenhuma dessas dimensões mexe no código nem na classificação: elas servem para filtrar, relatar e publicar no e-commerce.',
            ],
          },
          { kind: 'note', tone: 'info', text: 'Alterar dados comerciais de um item em homologação apaga a aprovação comercial, que precisa ser dada de novo.' },
        ],
        related: ['codigos-barras', 'precos', 'grade'],
      },
      {
        id: 'codigos-barras', title: 'Códigos de barras',
        summary: 'EAN-13, DUN-14 e códigos internos, com um principal.',
        roles: ['Comercial', 'Gestor'],
        blocks: [
          { kind: 'p', text: 'Um item pode ter vários códigos: o **EAN-13** da unidade, o **DUN-14** da caixa de embarque, um **EAN-8** ou um **UPC-A** de importação. Cada código pertence a uma unidade (un, cx10…) e um deles é o **principal**, que vai para o Omie e para a etiqueta.' },
          {
            kind: 'steps',
            items: [
              'Na aba Comercial, em **Códigos de barras**, escolha o tipo e a unidade.',
              'Digite o código ou use **Gerar próximo EAN**, que pega o próximo número livre do prefixo da empresa (78912345) e calcula o dígito verificador.',
              'Use **Tornar principal** para trocar o código principal.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'O código precisa ter o dígito verificador correto e o tamanho do tipo.',
              'O código é único em todo o cadastro: o sistema recusa um código já usado por outro item e diz qual.',
              'Produto acabado ou kit físico ativo não pode ficar sem código principal.',
              '**GTIN × NCM**: o EAN registrado no cadastro nacional (CCG) traz um NCM. Se o NCM do item for diferente, a lista mostra "GTIN × NCM divergente" e a aprovação fiscal não passa até a divergência ser resolvida.',
            ],
          },
        ],
        related: ['comercial-fiscal', 'camada-fiscal'],
      },
      {
        id: 'precos', title: 'Tabelas de preço e vigência',
        summary: 'Preço por tabela, unidade e data.',
        roles: ['Comercial', 'Gestor'],
        blocks: [
          { kind: 'p', text: 'Cada preço pertence a uma **tabela** (Padrão, E-commerce, Exportação em dólar, ou outra que você criar), a uma **unidade** (a base ou uma conversão de venda, como caixa com 10) e a um período de **vigência**. O histórico nunca é apagado.' },
          {
            kind: 'steps',
            items: [
              'Na aba Comercial, em **Preços por tabela**, escolha a tabela, a unidade, o valor e a data de início.',
              'Clique em **Lançar preço**. O preço vigente é encerrado na véspera da nova data.',
              'Um preço futuro aparece na coluna Próximo e pode ser cancelado até começar a valer; o anterior volta a ficar aberto.',
              'Use **Nova tabela** para criar uma tabela com moeda e canal próprios.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'A data de início não pode estar no passado nem ser igual ou anterior a outro preço já lançado na mesma tabela e unidade.',
              'Produto acabado, kits e serviço precisam de preço vigente na **tabela padrão** para passar na aprovação comercial. Item ativo sem preço aparece com a pendência "Sem preço".',
              'A proposta comercial puxa o preço vigente da tabela padrão. Sem preço, usa o custo com a margem padrão.',
            ],
          },
        ],
        related: ['custo-padrao', 'propostas', 'kits'],
      },
      {
        id: 'custo-padrao', title: 'Custo-padrão e curva ABC',
        summary: 'Custo com vigência, custo calculado pela estrutura e classificação ABC.',
        roles: ['Engenharia', 'Compras', 'Gestor'],
        blocks: [
          { kind: 'p', text: 'O **custo-padrão** é lançado com valor, data de início e motivo. Item fabricado tem o lançamento na aba Estrutura e roteiro; item comprado, na aba Estoque e unidades. Lançamento com data de hoje vale na hora; com data futura, entra em vigor sozinho na data.' },
          { kind: 'p', text: 'Para item com estrutura, a seção mostra também o **custo calculado**: a soma dos componentes com as perdas, e a diferença em relação ao custo-padrão, para saber quando é hora de revisar.' },
          {
            kind: 'table', title: 'Curva ABC',
            head: ['Classe', 'Critério'],
            rows: [
              ['A', 'Itens que somam até 80% do valor consumido nos últimos 90 dias'],
              ['B', 'De 80% a 95%'],
              ['C', 'O restante, inclusive itens sem saída no período'],
            ],
          },
          { kind: 'p', text: 'O valor consumido é a soma das saídas de estoque multiplicadas pelo custo. O **giro** é a quantidade que saiu dividida pelo saldo atual. A classe aparece no Núcleo, na aba Estoque, como coluna e como filtro da lista.' },
        ],
        related: ['camada-estoque', 'precos'],
      },
      {
        id: 'camada-fiscal', title: 'Camada fiscal, benefícios e reforma tributária',
        summary: 'NCM, Ex-TIPI, CEST, origem, benefícios por UF e cClassTrib com vigência.',
        roles: ['Financeiro', 'Gestor'],
        screens: [{ label: 'Fiscal', to: '/produtos/fiscal' }],
        blocks: [
          { kind: 'p', text: 'A aba **Fiscal** guarda o **NCM** (validado contra a tabela oficial), o **Ex-TIPI** quando há exceção de IPI, o **CEST** quando o NCM tem substituição tributária, a **origem** da mercadoria e o GTIN tributável quando ele é diferente do principal.' },
          {
            kind: 'rules',
            items: [
              'NCM fora da tabela é recusado.',
              'NCM com substituição tributária exige CEST. Ao escolher o NCM, o CEST sugerido é preenchido.',
              'Ex-TIPI tem 2 ou 3 dígitos e só existe com NCM.',
              'Serviço não tem NCM, CEST nem origem; só a classe da reforma.',
              'Alterar dados fiscais de um item em homologação apaga a aprovação fiscal.',
            ],
          },
          {
            kind: 'list', title: 'Reforma tributária (IBS/CBS)',
            items: [
              'O **cClassTrib** não é digitado direto: cada mudança é um lançamento com a classe, a redução de IBS, a redução de CBS e a data de início.',
              'O lançamento com data de hoje vale na hora; o futuro entra em vigor sozinho. Lançamentos futuros podem ser cancelados.',
            ],
          },
          { kind: 'p', text: 'Em **Benefícios fiscais por UF**, registre o benefício (por exemplo, crédito presumido ou redução de base), a UF, a base legal e, se houver, a data de término. Benefício vencido deixa de aparecer na sugestão de tributação.' },
          { kind: 'p', text: 'A tabela **Tributação sugerida** mostra, para venda dentro do estado, venda para outros estados, transferência e remessa, o CFOP, o CST, as alíquotas e a regra da matriz fiscal que venceu. O item sugere; quem decide é a operação.' },
          { kind: 'note', tone: 'warning', text: 'Depois da ativação, o NCM não é mais editado direto: a mudança passa por uma exceção de campo-chave.' },
          {
            kind: 'table', title: 'Sincronização com o Omie (mão dupla)',
            head: ['Situação', 'O que significa', 'O que fazer'],
            rows: [
              ['Sincronizado', 'NCM, CEST, origem, Ex-TIPI e cClassTrib iguais nos dois lados', 'Nada'],
              ['Enviar ao Omie', 'O fiscal mudou no Thalamus e ainda não foi enviado', 'Clicar em **Enviar ao Omie**'],
              ['Conflito', 'Os dois lados mudaram ao mesmo tempo', 'Comparar campo a campo e escolher **Manter o Thalamus** ou **Aceitar o Omie**'],
            ],
          },
          {
            kind: 'rules',
            items: [
              'Alteração feita no Omie em item sincronizado é aplicada no Thalamus e registrada na auditoria.',
              'Alteração no Omie com envio pendente do Thalamus vira conflito; nada é sobrescrito sozinho.',
              'Rascunho não sincroniza: o item vai ao Omie na ativação.',
              'Item em conflito aparece na pendência "Fiscal em conflito com o Omie" e no contador do Fiscal.',
            ],
          },
        ],
        related: ['matriz-fiscal', 'excecao-campo-chave', 'codigos-barras', 'integracao-omie'],
      },
      {
        id: 'matriz-fiscal', title: 'Matriz fiscal e SPED',
        summary: 'Regras de tributação por operação e o arquivo do Bloco 0.',
        roles: ['Financeiro', 'Gestor'],
        screens: [{ label: 'Fiscal', to: '/produtos/fiscal' }],
        blocks: [
          { kind: 'p', text: 'A **matriz fiscal** (Produtos → Fiscal → Matriz fiscal) é a tabela de regras: operação, UF de origem, UF de destino, prefixo de NCM, CFOP, CST e alíquotas de ICMS, IPI, PIS e COFINS. Ela espelha a matriz do Omie, que continua emitindo a nota.' },
          {
            kind: 'rules', title: 'Qual regra vale',
            items: [
              'Vence a regra mais específica: NCM com mais dígitos pesa mais, depois UF de destino exata, depois UF de origem exata.',
              'Regra sem NCM e com UF "*" é a regra genérica, usada quando nenhuma outra casa.',
              'O CST final junta a origem do item (0, 1, 2…) com o CST da regra.',
            ],
          },
          {
            kind: 'list', title: 'SPED · registro 0200',
            items: [
              'A aba **SPED** gera os registros **0190** (unidades), **0200** (itens) e **0220** (fatores de conversão) da EFD ICMS/IPI a partir do cadastro ativo.',
              'Rascunho, item em homologação e kit virtual ficam fora.',
              'Item sem NCM aparece no aviso acima do arquivo, porque o 0200 sairia incompleto.',
              '**Baixar .txt** gera o arquivo no formato do SPED, pronto para conferência. Cada item também tem a prévia na própria aba Fiscal.',
            ],
          },
        ],
        related: ['camada-fiscal'],
      },
      {
        id: 'grade', title: 'Grade de variações',
        summary: 'Cor, modelo de tablet ou tamanho como itens reais.',
        roles: ['Engenharia', 'Gestor'],
        blocks: [
          { kind: 'p', text: 'Uma **grade** agrupa variações de um mesmo produto. Cada combinação (por exemplo, Case Impact na cor Laranja) é um **item real**, com código, EAN, preço, estoque e estrutura próprios. O item que deu origem é o **item-modelo**.' },
          {
            kind: 'steps',
            items: [
              'No produto acabado ou kit físico, abra a aba Comercial e vá até **Grade (variações)**.',
              'Dê o nome do modelo e os eixos, um por linha, no formato "Cor: Preto, Laranja, Azul" (até 3 eixos). Os atributos da classe marcados como eixo de variação já vêm preenchidos.',
              'Diga qual valor de cada eixo o item-modelo tem e clique em **Criar grade**.',
              'A matriz mostra as combinações. Marque as que quer criar, ou deixe sem marcar para gerar todas as que faltam.',
              'As variantes nascem em rascunho e seguem a homologação normal.',
            ],
          },
          { kind: 'rules', items: ['As variantes herdam fiscal, marca, linha, categorias, dimensões, lotes e unidades do item-modelo.', 'EAN, preço, estrutura e foto são de cada variante.', 'Um item só pertence a uma grade, e a mesma combinação não é gerada duas vezes.'] },
        ],
        related: ['comercial-fiscal', 'ciclo-vida'],
      },
      {
        id: 'kits', title: 'Kits virtuais na venda',
        summary: 'Como o kit vira componentes no pedido e na expedição.',
        roles: ['Comercial', 'Expedição'],
        blocks: [
          { kind: 'p', text: 'O **kit virtual** é vendido como um item, mas não tem estoque. Ao aceitar a proposta, cada linha de kit é **explodida** nos componentes da estrutura vigente, e o preço do kit é rateado entre eles pelo preço (ou custo) de cada componente.' },
          { kind: 'rules', items: ['Todos os componentes precisam estar ativos para a proposta ser aceita.', 'As linhas explodidas ficam marcadas com o kit de origem e são baixadas do estoque na expedição.', 'Serviço dentro do kit entra no pedido, mas não baixa estoque.'] },
        ],
        related: ['propostas', 'expedicao'],
      },
      {
        id: 'midia-projetos', title: 'Mídia e vínculo com projetos',
        summary: 'Fotos, desenhos e fichas; rastreio de P&D por item.',
        roles: ['Engenharia', 'Comercial', 'Gestor'],
        blocks: [
          { kind: 'p', text: 'A aba **Mídia** guarda fotos, desenhos e fichas técnicas. A primeira foto vira a **principal** e aparece no cabeçalho do item; use **Principal** para trocar e as setas para ordenar. Nesta demonstração, cada arquivo tem até 439 KB.' },
          { kind: 'p', text: 'Desenho, ficha técnica e **instrução de trabalho** podem apontar a versão da estrutura a que se referem e ser marcados como **vai na OP**, para acompanhar a ordem de produção.' },
          { kind: 'p', text: 'A aba **Projetos** liga o item a um ou mais projetos, cada vínculo com a atividade da EAP (marco) e uma observação. Os cartões mostram, por projeto, os pedidos de compra e as demandas, com a previsão ainda aberta e o realizado pago.' },
          {
            kind: 'rules',
            items: [
              'Mídia é editada por Engenharia, Comercial e Gestor; projetos, por Engenharia e Gestor.',
              'Item com vínculo de projeto exige a aprovação **técnica**, e todo vínculo precisa apontar a atividade da EAP.',
              'O mesmo projeto e a mesma atividade não são vinculados duas vezes.',
            ],
          },
        ],
        related: ['projetos', 'ciclo-vida'],
      },
      {
        id: 'ciclo-vida', title: 'Ciclo de vida e homologação',
        summary: 'Seis situações e a aprovação de cada papel.',
        roles: ['Engenharia', 'Financeiro', 'PCP', 'Comercial', 'Gestor'],
        screens: [{ label: 'Homologação', to: '/produtos/homologacao' }],
        tour: '/produtos/homologacao',
        blocks: [
          { kind: 'flow', title: 'Situações do item', items: ['Rascunho', 'Em homologação', 'Ativo', 'Alteração pendente', 'Inativação pendente', 'Bloqueado', 'Obsoleto', 'Inativo'] },
          { kind: 'p', text: 'A análise do cadastro novo continua nesta tela. A **homologação de fornecedor** é de outro submódulo, só para matéria-prima, e aqui aparece como retrato somente leitura: fornecedor, situação, referência, validade e testes de P&D. Alteração de descrição, classificação, unidade ou NCM de item ativo exige documento de origem (OS, OP, PAP, oportunidade ou outro) e aprovação; o valor vigente continua até lá. A inativação também é solicitada e aprovada. Depois dela, estoque, ordens e pedidos já abertos seguem, e solicitações que ainda estavam pendentes são negadas. Os papéis de cada aprovação ainda não foram definidos pela especificação; a demonstração mantém os papéis já usados na análise do cadastro.' },
          {
            kind: 'table', title: 'O que cada situação permite',
            head: ['Situação', 'Venda', 'Compra', 'Produção', 'Consumo de saldo', 'Edição'],
            rows: [
              ['Rascunho', 'Não', 'Não', 'Não', 'Não', 'Livre, conforme a camada'],
              ['Em homologação', 'Não', 'Não', 'Não', 'Não', 'Livre; alterar uma camada apaga a aprovação dela'],
              ['Ativo', 'Sim', 'Sim', 'Sim', 'Sim', 'Tipo, unidade base e NCM congelados'],
              ['Bloqueado', 'Não', 'Não', 'Não', 'Não', 'Igual ao ativo'],
              ['Obsoleto', 'Não', 'Não', 'Não', 'Sim, até acabar o saldo', 'Igual ao ativo'],
              ['Inativo', 'Não', 'Não', 'Não', 'Não', 'Somente leitura'],
            ],
          },
          {
            kind: 'table', title: 'Quem aprova o quê',
            head: ['Aprovação', 'Quem registra', 'Exigida para', 'O que é conferido'],
            rows: [
              ['Fiscal', 'Financeiro ou Gestor', 'Todos os tipos', 'NCM válido, CEST quando há ST, origem, cClassTrib e EAN sem divergência de NCM no CCG'],
              ['PCP', 'PCP, Engenharia ou Gestor', 'Produto acabado, peça, kits', 'Estrutura liberada; roteiro para produto acabado e kit físico'],
              ['Comercial', 'Comercial ou Gestor', 'Produto acabado, kits e serviço', 'Descrição comercial; preço vigente na tabela padrão; EAN para produto acabado e kit físico'],
              ['Técnica', 'Engenharia ou Gestor', 'Item com vínculo de projeto', 'Todo vínculo aponta a atividade da EAP'],
            ],
          },
          {
            kind: 'steps', title: 'Homologar um item',
            items: [
              'Quem cadastrou envia o item para homologação.',
              'Cada aprovador vê o item em Homologação → **Aguardando meu papel** e em Minhas tarefas.',
              'Na aba Ciclo e aprovações, cada cartão mostra o que falta para aquele papel. O botão **Aprovar** só fica ativo quando não falta nada.',
              'Quando a última aprovação é registrada e não há pendência, o item é **ativado automaticamente**. Se faltar algo, use **Ativar** depois de resolver.',
              'Se o cadastro estiver errado, um aprovador usa **Devolver a rascunho** com o motivo. As aprovações já dadas são apagadas.',
            ],
          },
          {
            kind: 'list', title: 'Depois de ativo',
            items: [
              '**Bloquear** (com motivo): tira o item de qualquer transação nova sem perder saldo nem histórico. **Reativar** desfaz.',
              '**Obsoletar** (com motivo): tira o item do planejamento; o saldo restante ainda pode ser consumido.',
              '**Inativar** (com motivo): último passo, só a partir de obsoleto e só sem pendências. O sistema lista o que impede: saldo, OPs, requisições, pedidos de compra, demandas, propostas, pedidos de venda não expedidos e uso em estrutura vigente de item ativo.',
              '**Enviar ao Omie**: publica o cadastro do item ativo no Omie.',
            ],
          },
          { kind: 'note', tone: 'info', text: 'Mudar a situação (enviar, ativar, bloquear, obsoletar, inativar) é tarefa de Engenharia e Gestor. As aprovações são de cada papel.' },
        ],
        related: ['excecao-campo-chave', 'acoes-lote'],
      },
      {
        id: 'excecao-campo-chave', title: 'Exceção de campo-chave',
        summary: 'Mudar unidade base ou NCM de um item ativo.',
        roles: ['Engenharia', 'Financeiro', 'Gestor'],
        blocks: [
          { kind: 'p', text: 'Depois da ativação, **unidade base** e **NCM** ficam congelados porque afetam saldo, estruturas, compras e fiscal. Quando é realmente preciso mudar, abre-se uma **solicitação de exceção**. O tipo do item nunca muda depois da ativação.' },
          {
            kind: 'steps',
            items: [
              'No núcleo (unidade) ou na camada fiscal (NCM), clique em **Solicitar exceção** abaixo do campo.',
              'Informe o novo valor e a justificativa.',
              'A solicitação aparece em Homologação → Exceções de campo-chave, em Minhas tarefas do Gestor e na aba Ciclo e aprovações do item.',
              'O Gestor aprova (o novo valor é aplicado na hora) ou recusa com motivo.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'Quem solicitou não aprova a própria exceção.',
              'Só pode haver uma solicitação pendente por campo.',
              'Se o novo NCM exigir CEST, preencha o CEST antes de aprovar.',
              'Solicitação, aprovação e recusa ficam na auditoria do item, com valor anterior, novo valor e motivo.',
            ],
          },
        ],
        related: ['auditoria-item'],
      },
      {
        id: 'permissoes-camada', title: 'Quem edita cada camada',
        summary: 'Permissão de edição no cadastro de itens.',
        blocks: [
          {
            kind: 'table',
            head: ['Camada', 'Quem edita'],
            rows: [
              ['Núcleo, atributos e classificação', 'Engenharia, Gestor'],
              ['Estoque, unidades e embalagem', 'Almoxarifado, Compras, Engenharia, Gestor'],
              ['Estrutura, roteiro e mudanças de engenharia', 'Engenharia, PCP, Gestor'],
              ['Ferramental', 'Engenharia, PCP, Manutenção, Gestor'],
              ['Comercial (descrição, marca, códigos de barras, preços)', 'Comercial, Gestor'],
              ['Fiscal (inclusive reforma, benefícios e matriz fiscal)', 'Financeiro, Gestor'],
              ['Mídia', 'Engenharia, Comercial, Gestor'],
              ['Projetos', 'Engenharia, Gestor'],
              ['Grade (criar e gerar variantes)', 'Engenharia, Gestor'],
              ['Ciclo de vida (mudar situação, excluir)', 'Engenharia, Gestor'],
              ['Decidir exceção e restaurar item excluído', 'Gestor'],
            ],
          },
          { kind: 'p', text: 'Quem não edita uma camada continua vendo os dados dela, com os campos travados e uma faixa indicando os editores.' },
        ],
      },
      {
        id: 'auditoria-item', title: 'Auditoria, onde é usado e exclusão',
        summary: 'Histórico campo a campo e remoção segura.',
        blocks: [
          { kind: 'p', text: 'Cada alteração salva sobe a **versão do registro** (v1, v2…) e grava uma linha por campo na aba **Auditoria**: quando, quem, versão, campo, valor anterior, valor novo e motivo. O cabeçalho do item mostra a versão atual e quem alterou por último.' },
          { kind: 'p', text: 'A aba **Onde é usado** mostra as estruturas vigentes que usam o item, versões antigas ou em rascunho que o citam, o histórico de uso (OPs, compras, demandas, movimentações, pedidos, propostas, chamados, projetos) e o que está em aberto agora.' },
          {
            kind: 'table', title: 'Excluir um item',
            head: ['Situação do item', 'Resultado'],
            rows: [
              ['Rascunho ou inativo, nunca usado', 'Exclusão **física**: o item sai do cadastro'],
              ['Rascunho ou inativo, já usado em algum documento', 'Exclusão **lógica**: some das listas e não entra em transação, mas o histórico fica'],
              ['Qualquer outra situação, ou com saldo', 'Exclusão recusada'],
            ],
          },
          { kind: 'p', text: 'Para ver itens excluídos logicamente, marque **Mostrar só excluídos logicamente** na lista. Só o Gestor restaura.' },
        ],
      },
      {
        id: 'acoes-lote', title: 'Ações em lote e filas de homologação',
        summary: 'Trabalhar muitos itens de uma vez.',
        screens: [{ label: 'Itens', to: '/produtos' }, { label: 'Homologação', to: '/produtos/homologacao' }],
        blocks: [
          {
            kind: 'steps', title: 'Ação em lote',
            items: [
              'Na lista, marque os itens pela caixa de cada linha, ou a caixa do cabeçalho para a página inteira.',
              'Na barra escura que aparece, escolha: enviar para homologação, aprovar no meu papel, bloquear, obsoletar, ou reclassificar num nó.',
              'Bloquear e obsoletar pedem motivo.',
              'O resultado mostra quantos itens mudaram e, para cada recusado, o motivo.',
            ],
          },
          { kind: 'note', tone: 'info', text: 'O lote não pula regras: cada item passa pelas mesmas validações da tela individual.' },
          {
            kind: 'table', title: 'Filas da Homologação',
            head: ['Fila', 'O que mostra'],
            rows: [
              ['Aguardando meu papel', 'Itens em homologação com aprovação que o seu perfil pode dar, com aprovação direta na linha'],
              ['Em homologação', 'Todos os itens em aprovação e o que falta em cada um'],
              ['Rascunhos', 'Cadastros iniciados e ainda não enviados'],
              ['Exceções de campo-chave', 'Pedidos de mudança de unidade ou NCM aguardando a gestão'],
              ['Ativos com pendência', 'Itens ativos com cadastro incompleto (NCM, CEST, EAN, estrutura, roteiro)'],
              ['Bloqueados', 'Itens fora de transação, com o motivo do bloqueio'],
              ['Obsoletos com saldo', 'Itens fora do planejamento que ainda têm estoque'],
            ],
          },
        ],
      },
      {
        id: 'servicos', title: 'Serviços',
        summary: 'Um cadastro mestre. Venda, ordem de serviço e roteiro são usos, independentes do local e de quem executa.',
        roles: ['Engenharia', 'Manutenção', 'Assistência', 'Gestor'],
        screens: [{ label: 'Serviços', to: '/servicos' }],
        tour: '/servicos',
        blocks: [
          { kind: 'p', text: 'O mesmo serviço pode ser vendido, usado numa ordem de serviço e entrar num roteiro de produção ao mesmo tempo. O local habitual (instalações da Roboflex, do cliente ou outro) não define quem executa. Equipe própria no cliente continua sendo execução própria. Fornecedor terceirizado é outra escolha.' },
          {
            kind: 'steps', title: 'Usar a tela',
            items: [
              'A lista ocupa a tela. Filtre por uso ou busque por código e nome.',
              'Clique num serviço para abrir a página dele. A seta ou o caminho **Serviços** no topo voltam para a lista.',
              'Na aba **Cadastro**, os usos ficam à parte do local e de quem executa. Equipe própria mostra setor e instrução. Terceirizado pede o datasheet. Venda ou ordem de serviço abre preço e cenário fiscal.',
              'Na aba **Uso**, aparecem roteiros, propostas e demandas. Alterar abre um rascunho no produto, sem trocar ordem já criada.',
              'Na aba **Histórico**, ficam as versões da instrução e a linha do tempo.',
            ],
          },
          { kind: 'p', text: 'A taxonomia oficial, o formato do código, os campos obrigatórios e quem aprova o cadastro ainda não foram definidos. A unidade mostrada (hora, unidade ou visita) é a lista da demonstração. Não há categoria fechada.' },
          {
            kind: 'list',
            items: [
              '**Equipe própria**: setor responsável, nome da equipe e instrução técnica. Mudar a instrução grava uma versão nova; a anterior fica no histórico. Quem executou de fato fica na ordem, não neste cadastro.',
              '**Terceirizado**: só grava com um datasheet informado. Nesta demonstração fica o nome do arquivo; formato e aprovador ainda não foram definidos. O fornecedor é referência. O desenho da compra ainda não existe.',
              '**Preço e cenário fiscal**: aparecem quando o serviço é vendável ou usado em ordem de serviço. O valor é informado. Não há lista de preço, alíquota nem cálculo. O que já foi gravado num pedido não é reescrito por esta página.',
              '**Tempo**: o estimado é informado aqui. A média dos apontamentos de produção não é calculada, porque fórmula, unidade, base, período e o tratamento de apontamento cancelado ainda não foram definidos.',
              '**Roteiro**: a operação do produto pode apontar para o serviço e guarda a versão da instrução daquele momento. A aba Uso lista produto, revisão e operação. Alterar abre um rascunho de versão no produto, em todos os marcados ou num serviço novo só para os marcados. A revisão liberada não muda. Publicar continua no cadastro do produto.',
              '**Ordens já criadas**: a decisão é manter a versão antiga na ordem em andamento, adotar a nova na ordem criada sem início e usar a nova nas ordens seguintes. Quais situações de ordem entram em cada grupo ainda não foi definido, então o cadastro não troca ordem já criada.',
            ],
          },
          { kind: 'note', tone: 'warning', text: 'Datasheet, preço e instrução desta tela ficam na demonstração, em memória. Não há arquivo armazenado nem classificação fiscal real.' },
        ],
        related: ['demandas', 'estrutura-versoes', 'parceiros'],
      },
      {
        id: 'parceiros', title: 'Parceiros: clientes e fornecedores',
        summary: 'Um cadastro mestre. Cliente, fornecedor e transportadora são papéis.',
        roles: ['Comercial', 'Compras', 'Gestor'],
        screens: [{ label: 'Parceiros', to: '/parceiros' }],
        tour: '/parceiros',
        blocks: [
          { kind: 'p', text: 'O nome Parceiros é temporário. No Omie, cliente e fornecedor são o mesmo registro de pessoa. O Thalamus segue essa lógica: os dados gerais existem uma vez, e cada papel tem situação, perfil e indicadores próprios. Cliente, fornecedor e transportadora se atribuem no mesmo cadastro. Inativar um papel não inativa os outros.' },
          {
            kind: 'steps', title: 'Usar a tela',
            items: [
              'A lista mostra todos os parceiros. Filtre por papel ou busque por nome, documento ou cidade.',
              'Clique em um parceiro para abrir a página dele. A seta ou o caminho **Parceiros** no topo voltam para a lista.',
              'Na aba **Cadastro**, ajuste os dados gerais e os papéis Cliente, Fornecedor e Transportadora. **Inativar** pede o motivo, que fica no histórico. Transportadora inativa deixa de aparecer na expedição.',
              'Na aba **Contatos e endereços**, inclua um contato ou endereço pelos botões **+**. O primeiro contato é o principal.',
              '**Novo parceiro** abre um formulário. Se o documento já existir, a tela oferece abrir o cadastro existente.',
            ],
          },
          { kind: 'p', text: 'O perfil do cliente mostra os pedidos de Vendas, o período e a origem. A fórmula do ticket médio ainda não foi definida, então o valor não é publicado. A classe ABC vigente só muda com aprovação do Coordenador Comercial. Os limites A, B e C também não foram definidos: o alerta anual registra o faturamento e não sugere letra. A classe, sozinha, não libera crédito, desconto nem condição.' },
          { kind: 'p', text: 'O perfil do fornecedor mostra o volume recebido no Almoxarifado. A nota não é publicada enquanto a fórmula não existir. A homologação de matéria-prima aparece só como retrato. Na compra, matéria-prima C1 sem fornecedor homologado para aquele item é bloqueada com o motivo. C2 e C3 não exigem esse registro. Os critérios que classificam C1, C2 e C3 ainda não foram definidos; a criticidade é informada no item.' },
          { kind: 'rules', items: [
            'Documento repetido é avisado antes de criar outro registro.',
            'Papel inativo bloqueia solicitação nova. Pedido, oportunidade e compra já abertos seguem até o fim. Embarque já conferido guarda o nome da transportadora daquele momento.',
            'A política de quem aprova a inativação ainda não foi definida. Nesta demonstração, a solicitação já inativa o papel.',
          ] },
        ],
        related: ['pessoas', 'compras', 'crm', 'expedicao'],
      },
      {
        id: 'pessoas', title: 'Pessoas e organograma',
        summary: 'Cadastro de pessoas, setores, PIN do tablet e acesso.',
        roles: ['Gestor'],
        screens: [{ label: 'Pessoas', to: '/pessoas' }],
        tour: '/pessoas',
        blocks: [
          { kind: 'p', text: 'O organograma mostra os setores com gestor e o código do centro padrão do setor. Esse centro segue na demanda e na compra. O orçamento acompanha pelo setor utilizador, em Orçamentos. Clique num setor para filtrar as pessoas dele.' },
          {
            kind: 'steps', title: 'Cadastrar uma pessoa',
            items: ['Clique em **Nova pessoa**.', 'Informe nome, setor e papel. O papel define o que ela verá no sistema.', 'O sistema gera o PIN de 4 dígitos do tablet.', 'Para tirar o acesso, desative a pessoa: ela some do tablet e das telas, mas o histórico fica.'],
          },
        ],
        related: ['perfis', 'tablet'],
      },
      {
        id: 'postos', title: 'Postos de trabalho',
        summary: 'A vaga da fábrica: capacidade, custo-hora e o que pode receber ordem nova.',
        roles: ['Engenharia', 'PCP', 'Manutenção', 'Gestor'],
        screens: [{ label: 'Postos', to: '/postos' }],
        tour: '/postos',
        blocks: [
          { kind: 'p', text: 'O posto é o lugar da programação e do tablet: injetora, célula, almoxarifado, qualidade ou expedição. Cada posto pertence a uma empresa e tem minutos por dia e, quando faz sentido, custo-hora. O custo da engenharia usa esse custo-hora. O ativo físico (máquina, molde, equipamento) fica em Ativos e aponta para o posto. A lista ocupa a tela; clicar num posto, ou em Novo posto, abre a ficha numa janela.' },
          {
            kind: 'rules',
            items: [
              'Posto novo nasce ativo e já pode ser escolhido no roteiro, no ferramental e na programação.',
              'Molde só é compatível com posto do tipo Injetora. Uma ordem já aberta só muda para outro posto do mesmo tipo.',
              'Inativar tira o posto das escolhas novas. Roteiro gravado e ordem em andamento continuam nele. O tablet ainda mostra o posto inativo enquanto houver ordem aberta.',
              'Excluir só é possível enquanto nenhum roteiro, ordem, ferramental ou ativo aponta para o posto.',
              'Cadastrar o posto não cria o ativo. O vínculo fica na ficha do ativo, no campo Recurso produtivo.',
            ],
          },
        ],
        related: ['estrutura-versoes', 'ferramental', 'ativos', 'planejar-pedido'],
      },
      {
        id: 'ativos', title: 'Ativos: máquinas, moldes e equipamentos',
        summary: 'Capacidade, ciclos e manutenção a partir do ativo.',
        roles: ['Engenharia', 'Manutenção', 'Gestor'],
        screens: [{ label: 'Ativos', to: '/ativos' }],
        tour: '/ativos',
        blocks: [
          { kind: 'p', text: 'Cada ativo tem criticidade, contador de ciclos e plano preventivo. Os moldes somam ciclos a cada OP de injeção concluída (peças boas divididas pelas cavidades). O campo Recurso produtivo liga o ativo a um posto de Cadastros. Sem esse vínculo, a máquina não entra na programação.' },
          { kind: 'p', text: 'O molde como dado de engenharia fica em Produtos, no item de ferramental. Esta tela é o bem que a manutenção acompanha. O vínculo entre os dois é feito na ficha do ferramental, no campo Ativo na manutenção, e só aparece aqui depois que o ativo existe. O produto pode ser gravado antes. Esta tela de Ativos ainda é a da demonstração; a revisão do módulo não foi feita.' },
          {
            kind: 'list', title: 'Ações na ficha do ativo',
            items: ['**Corretiva**: abre uma OS e bloqueia a máquina para produção até a conclusão.', '**Preventiva**: entra no plano de manutenção.', '**Solicitar peça**: abre uma demanda de material ligada ao ativo.'],
          },
          { kind: 'rules', items: ['Quando um molde atinge o limite de ciclos, o sistema abre uma preventiva automaticamente (se ainda não houver uma aberta).'] },
        ],
        related: ['manutencao', 'postos', 'ferramental'],
      },
    ],
  },

  {
    id: 'comercial', title: 'Comercial', icon: HandCoins,
    intro: 'Do primeiro contato com o cliente até a carga faturada.',
    sections: [
      {
        id: 'crm', title: 'CRM: oportunidades e funil',
        summary: 'Acompanhar negociações até o aceite.',
        roles: ['Comercial', 'Gestor'],
        screens: [{ label: 'CRM', to: '/crm' }],
        tour: '/crm',
        blocks: [
          { kind: 'flow', title: 'Etapas da oportunidade', items: ['Lead', 'Qualificação', 'Proposta', 'Negociação', 'Ganha ou Perdida'] },
          {
            kind: 'steps', title: 'Trabalhar uma oportunidade',
            items: [
              'Clique em **Nova oportunidade**: cliente, título, produtos de interesse, quantidade, previsão de fechamento e origem.',
              'Abra a ficha clicando no cartão do funil.',
              'Registre a **próxima ação** (ligação, e-mail, reunião ou tarefa) e marque como feita quando concluir.',
              'Clique numa etapa para avançar ou voltar.',
              'Quando o cliente pedir preço, use **Criar proposta**. Se for desenvolvimento, use **Projeto de desenvolvimento**.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'Toda oportunidade aberta precisa de um próximo passo.',
              '**Ganha não é um clique**: a oportunidade só é ganha quando o cliente aceita uma proposta.',
              'Marcar como perdida pede o motivo e recusa as propostas que ainda estão abertas.',
              'Criar a primeira proposta leva a oportunidade para a etapa Proposta.',
            ],
          },
        ],
        related: ['propostas', 'projetos'],
      },
      {
        id: 'propostas', title: 'Propostas',
        summary: 'Preço, desconto, condições e aceite.',
        roles: ['Comercial', 'Gestor'],
        screens: [{ label: 'CRM', to: '/crm' }],
        blocks: [
          { kind: 'flow', items: ['Rascunho', 'Enviada', 'Aceita, Recusada ou Expirada'] },
          { kind: 'p', text: 'A proposta nasce em rascunho com os produtos da oportunidade, o preço vigente da tabela padrão de cada item e uma data sugerida que considera o prazo de fabricação e o lead time de compra dos componentes. Produtos, kits e serviços podem estar na mesma proposta. Validade padrão de 15 dias e pagamento em 28 dias.' },
          {
            kind: 'rules',
            items: [
              'Em rascunho, quantidade, preço e condições são editáveis.',
              'Abaixo do preço de cada linha aparece o preço da tabela padrão e quanto a negociação se afastou dele, para porcentagem mais ou menos.',
              'Kit virtual entra como uma linha só e é explodido nos componentes quando o cliente aceita.',
              'O desconto vai até **15%**.',
              'Só item **ativo** entra numa proposta. Item bloqueado, obsoleto, em rascunho ou imobilizado é recusado com o motivo.',
              '**Enviar** leva a oportunidade para Negociação.',
              '**Cliente aceitou** confere de novo os itens, aprova o pedido no Omie com todas as linhas e marca a oportunidade como Ganha.',
              '**Recusar** pede o motivo e devolve a oportunidade para a etapa Proposta.',
            ],
          },
        ],
        related: ['pedidos-venda'],
      },
      {
        id: 'pedidos-venda', title: 'Pedidos de venda',
        summary: 'Pedidos aprovados no Omie e o painel do pedido.',
        roles: ['Comercial', 'PCP', 'Expedição', 'Gestor'],
        screens: [{ label: 'Vendas', to: '/pedidos' }],
        tour: '/pedidos',
        blocks: [
          { kind: 'p', text: 'Pedidos aprovados no Omie (ou pelo aceite de uma proposta) chegam ao Thalamus com cliente, produto, quantidade, valor e prazo. A tela Vendas lista os pedidos com a etapa atual e os riscos.' },
          { kind: 'p', text: 'Clicar num pedido abre o **painel do pedido**: a faixa de etapas, as OPs de injeção (grupo azul: a peça plástica feita na injetora) e a OP de montagem (grupo verde: o case do cliente), materiais, compras ligadas e a linha do tempo.' },
          { kind: 'note', tone: 'info', text: 'OP de injeção e OP de montagem são ordens diferentes, em postos diferentes. A injeção produz peças para o estoque; a montagem junta essas peças com componentes comprados.' },
        ],
        related: ['planejar-pedido', 'processo-ponta-a-ponta'],
      },
      {
        id: 'expedicao', title: 'Expedição e faturamento',
        summary: 'Conferência, carga e NF-e pelo Omie.',
        roles: ['Expedição', 'Gestor'],
        screens: [{ label: 'Expedição', to: '/expedicao' }],
        tour: '/expedicao',
        blocks: [
          { kind: 'flow', items: ['Aguardando conferência', 'Conferido', 'Expedido', 'Faturado'] },
          {
            kind: 'steps',
            items: [
              'Quando todas as OPs de montagem do pedido são aprovadas na qualidade, o pedido entra em **Aguardando conferência**.',
              'Confira e informe os volumes. A transportadora é um parceiro com esse papel ativo. **Retirada pelo cliente** continua disponível e não é um cadastro.',
              'Clique em **Expedir**: o produto sai do estoque e o sistema pede a NF-e ao Omie.',
              'Quando o Omie autoriza a nota, o pedido vira **Faturado**, o número da NF-e aparece no pedido. A conta a receber fica no Omie.',
            ],
          },
          { kind: 'rules', items: ['Sem volumes e transportadora não há conferência.', 'Sem conferência não há expedição.', 'A expedição respeita a regra de saldo negativo e os lotes do produto.'] },
          { kind: 'p', text: 'Quando o pedido tem mais de uma linha, a coluna do produto lista todas, com a quantidade de cada uma e o kit virtual de origem quando a linha veio de um kit. Todas são baixadas do estoque na expedição.' },
        ],
        related: ['integracao-omie', 'kits', 'parceiros'],
      },
    ],
  },

  {
    id: 'operacoes', title: 'Planejamento e produção', icon: Factory,
    intro: 'Como um pedido vira peças, cases e lotes aprovados.',
    sections: [
      {
        id: 'processo-ponta-a-ponta', title: 'O processo de ponta a ponta',
        summary: 'As etapas do pedido e como o sistema as calcula.',
        screens: [{ label: 'Fluxo do pedido', to: '/fluxo' }, { label: 'Painel da operação', to: '/painel' }],
        tour: '/fluxo',
        blocks: [
          { kind: 'flow', items: ['Entrada', 'Materiais', 'Injeção', 'Montagem', 'Qualidade', 'Expedição', 'Faturado'] },
          { kind: 'p', text: 'A etapa do pedido **não é digitada**: o sistema calcula a partir do que as áreas registram. Por isso ela é sempre coerente com o chão de fábrica.' },
          {
            kind: 'table', title: 'Como a etapa é calculada',
            head: ['Etapa', 'Quando o pedido está nela'],
            rows: [
              ['Entrada', 'Pedido ainda não planejado'],
              ['Materiais', 'Há OP aguardando material ou planejada e ainda não separada'],
              ['Injeção', 'Alguma OP de injeção está liberada ou em produção'],
              ['Montagem', 'A OP de montagem está em produção'],
              ['Qualidade', 'A OP de montagem terminou e aguarda inspeção'],
              ['Expedição', 'Lote aprovado, em conferência, conferido ou expedido'],
              ['Faturado', 'NF-e emitida pelo Omie'],
            ],
          },
          {
            kind: 'list', title: 'Riscos sinalizados no pedido',
            items: ['Atrasado (passou do prazo prometido)', 'Prazo crítico (até 3 dias e ainda em entrada, materiais ou injeção)', 'Material em falta', 'Operação parada', 'Retrabalho em andamento', 'Aguardando planejamento (em entrada com prazo em até 10 dias)'],
          },
        ],
        related: ['painel'],
      },
      {
        id: 'planejar-pedido', title: 'Planejar um pedido',
        summary: 'Explodir a estrutura, reservar estoque e criar as OPs.',
        roles: ['PCP', 'Gestor'],
        screens: [{ label: 'Vendas', to: '/pedidos' }],
        blocks: [
          {
            kind: 'steps',
            items: [
              'Em Vendas, abra o pedido em Entrada e clique em **Planejar**.',
              'O sistema lê a estrutura **vigente** do produto e o roteiro.',
              'Para cada componente, compara a necessidade com o saldo disponível (saldo menos o já reservado).',
              'Peça injetada em falta vira **OP de injeção**. Componente comprado em falta vira **requisição** de compra.',
              'O case vira a **OP de montagem**, que grava a versão da estrutura usada.',
              'O que tem saldo é reservado. A OP sem todos os materiais fica em **Aguardando material**; com tudo reservado, fica **Planejada**.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'Um pedido só é planejado uma vez.',
              'O produto precisa estar ativo e ter estrutura e roteiro oficiais.',
              'Cada componente precisa poder ser consumido (ativo ou obsoleto com saldo). Componente em falta precisa poder ser comprado ou produzido: bloqueado ou obsoleto em falta impede o planejamento.',
              'Versões de estrutura programadas que já chegaram à data entram em vigor antes do cálculo.',
              'Quando uma compra ou injeção chega, o sistema realoca o estoque e libera as OPs que ficaram completas.',
            ],
          },
        ],
        related: ['estrutura-versoes', 'necessidades', 'ordens-producao'],
      },
      {
        id: 'programacao', title: 'Programação e capacidade',
        summary: 'Distribuir OPs por recurso e dia.',
        roles: ['PCP', 'Líder de produção'],
        screens: [{ label: 'Planejamento', to: '/programacao' }],
        tour: '/programacao',
        blocks: [
          { kind: 'p', text: 'A carga de cada injetora e célula de montagem é calculada pelo tempo padrão das operações programadas (quantidade restante × minutos por unidade). A grade da semana mostra cada OP no recurso e no dia.' },
          { kind: 'steps', items: ['Clique num bloco da grade.', 'Escolha o novo recurso e a nova data.', 'O tablet do posto recebe a nova sequência na hora.'] },
          { kind: 'rules', items: ['OP concluída não pode ser reprogramada.', 'A programação é gravada e não se perde ao recarregar.'] },
        ],
      },
      {
        id: 'ordens-producao', title: 'Ordens de produção',
        summary: 'Situações da OP e das operações.',
        screens: [{ label: 'Ordens de produção', to: '/ordens' }],
        tour: '/ordens',
        blocks: [
          { kind: 'flow', title: 'Situações da OP', items: ['Aguardando material', 'Planejada', 'Liberada', 'Em produção', 'Inspeção (só montagem)', 'Concluída'] },
          { kind: 'flow', title: 'Situações de cada operação', items: ['Aguardando', 'Disponível', 'Em execução', 'Pausada', 'Concluída'] },
          {
            kind: 'list',
            items: [
              '**OP de injeção**: ao concluir a última operação, as peças boas entram no estoque e o contador do molde é atualizado.',
              '**OP de montagem**: ao concluir a última operação, vai para inspeção. A aprovação dá entrada do produto no estoque.',
              'As operações seguem o roteiro: concluir uma libera a próxima.',
            ],
          },
        ],
        related: ['tablet', 'qualidade'],
      },
      {
        id: 'necessidades', title: 'Necessidades de material',
        summary: 'Saldo, reservas, compras em andamento e falta.',
        roles: ['PCP', 'Compras'],
        screens: [{ label: 'Necessidades', to: '/necessidades' }],
        tour: '/necessidades',
        blocks: [
          { kind: 'p', text: 'Para cada item comprado ou injetado, mostra saldo, reservado para OPs, compras a caminho e a falta. As requisições já nascem ligadas ao pedido e à OP que precisam do material.' },
          { kind: 'p', text: 'O botão de comprar mostra a quantidade que a requisição vai gravar, já arredondada pelo **lote mínimo** e pelo **múltiplo** do cadastro do item. Item sem esses parâmetros cai na embalagem padrão da unidade. Quando o arredondamento aumenta o pedido, a linha mostra a falta real e a regra aplicada.' },
          { kind: 'note', tone: 'info', text: 'Só itens ativos entram no planejamento de materiais. Obsoleto, bloqueado, serviço, kit virtual e imobilizado ficam de fora.' },
        ],
        related: ['demandas', 'compras', 'camada-estoque'],
      },
      {
        id: 'separacao', title: 'Separação de kits',
        summary: 'Do almoxarifado para o posto.',
        roles: ['Almoxarifado'],
        screens: [{ label: 'Almoxarifado', to: '/estoque' }],
        tour: '/estoque',
        blocks: [
          { kind: 'steps', items: ['OPs com todos os materiais reservados aparecem em Separação de kits.', 'Separe fisicamente e confirme.', 'Os materiais saem do estoque (com os lotes, quando controlados) e a OP fica **Liberada** no tablet do posto.'] },
          { kind: 'rules', items: ['Só OP planejada (com tudo reservado) pode ser separada.', 'A separação pode ser desfeita até a primeira operação começar; os materiais voltam ao estoque como estorno.'] },
        ],
        related: ['camada-estoque'],
      },
      {
        id: 'injecao-montagem', title: 'Injeção e montagem',
        summary: 'Os painéis de acompanhamento dos postos.',
        roles: ['Líder de produção', 'PCP'],
        screens: [{ label: 'Injeção', to: '/injecao' }, { label: 'Montagem', to: '/montagem' }],
        blocks: [
          { kind: 'p', text: 'O **painel das injetoras** mostra por máquina o estado (produzindo, parada, livre ou em manutenção), a OP em produção, o molde, a quantidade e o refugo. Tudo vem do tablet, sem apontamento em papel.' },
          { kind: 'p', text: 'A OP de injeção nasce do **roteiro da peça**: posto, molde, tempo por peça (ciclo ÷ cavidades ativas), preparação e operações seguintes, como a rebarbação. Peça sem roteiro com molde usa os dados antigos do cadastro.' },
          { kind: 'p', text: 'A **matriz de montagem** cruza OPs e etapas do roteiro. A cor de cada célula indica concluída, em execução, parada ou aguardando.' },
        ],
        related: ['tablet'],
      },
      {
        id: 'tablet', title: 'Tablet do operador',
        summary: 'Entrar, escolher o posto, iniciar, pausar, apontar e concluir.',
        roles: ['Operador', 'Líder de produção'],
        screens: [{ label: 'Tablet', to: '/tablet' }],
        tour: '/tablet',
        blocks: [
          {
            kind: 'steps',
            items: [
              'O operador toca no próprio nome e digita o **PIN** de 4 dígitos.',
              'Escolhe o posto: injetora, célula de montagem, almoxarifado, qualidade ou expedição.',
              'Vê somente a fila daquele posto, na ordem definida pelo PCP.',
              '**Iniciar** começa a contar o tempo da operação.',
              '**Apontar** registra peças boas e refugo. Refugo exige motivo.',
              '**Pausar** pede o motivo da parada.',
              '**Concluir** encerra a operação e libera a próxima etapa.',
              '**Chamar líder** abre um chamado que aparece no sino do líder.',
            ],
          },
          {
            kind: 'rules',
            items: [
              'Não dá para iniciar uma operação em máquina com manutenção corretiva aberta.',
              'A quantidade apontada não pode passar do que a etapa anterior produziu (a primeira etapa aceita até 5% acima da OP).',
              'Só conclui quem já apontou peças boas.',
              'Operação marcada com **primeira peça** aceita só 1 peça boa até a qualidade liberar. Quem produziu não libera a própria peça; o botão **Chamar qualidade** avisa no sino.',
              'Desenhos, fichas e instruções marcados como **vai na OP** aparecem em Documentos da OP, na versão com que a OP nasceu.',
              'Na injeção, o tablet mostra o molde, o ciclo e as cavidades ativas cadastrados no ferramental.',
              'Pausa por **Quebra de máquina** abre uma OS corretiva automaticamente e bloqueia a máquina.',
            ],
          },
          { kind: 'table', title: 'Motivos', head: ['Tipo', 'Opções'], rows: [['Parada', 'Setup / troca de molde, Falta de material, Ajuste de processo, Quebra de máquina, Aguardando qualidade, Intervalo / refeição, Falta de operador'], ['Refugo', 'Rebarba excessiva, Bolha / chupagem, Peça incompleta, Risco / mancha, Montagem incorreta']] },
        ],
        related: ['manutencao', 'ordens-producao'],
      },
      {
        id: 'qualidade', title: 'Qualidade: inspeção e não conformidades',
        summary: 'Aprovar o lote ou reprovar com retrabalho.',
        roles: ['Qualidade'],
        screens: [{ label: 'Qualidade', to: '/qualidade' }],
        tour: '/qualidade',
        blocks: [
          {
            kind: 'steps',
            items: [
              'No tablet da qualidade, **Primeiras peças** lista as operações paradas na primeira peça. **Liberar** deixa o operador seguir.',
              'Lotes de montagem concluídos aparecem em Inspeção final.',
              'Execute o checklist do lote.',
              '**Aprovar** dá entrada do produto no estoque. Se todas as OPs de montagem do pedido estiverem aprovadas, o pedido vai para a expedição.',
              '**Reprovar** pede a quantidade e o defeito: abre uma **não conformidade**, cria a etapa **Retrabalho** na OP e devolve-a para a montagem.',
            ],
          },
          { kind: 'flow', title: 'Não conformidade', items: ['Aberta', 'Em análise', 'Encerrada'] },
          { kind: 'p', text: 'A não conformidade registra causa e ação corretiva e fica ligada à OP e ao pedido. Chamados de assistência em garantia também abrem não conformidade da OP que produziu o lote.' },
        ],
        related: ['assistencia'],
      },
      {
        id: 'painel', title: 'Painel da operação',
        summary: 'A visão do dia para gestores e líderes.',
        screens: [{ label: 'Painel da operação', to: '/painel' }],
        tour: '/painel',
        blocks: [
          { kind: 'list', items: ['**Indicadores do dia**: pedidos em carteira, riscos, eficiência e materiais críticos.', '**Pedidos por etapa**: clique numa etapa para abrir o fluxo.', '**Injetoras**: estado de cada máquina, atualizado pelo tablet.', '**Pontos de atenção**: atrasos, faltas, paradas, chamados do chão de fábrica e falhas de integração.'] },
        ],
      },
    ],
  },

  {
    id: 'suprimentos', title: 'Suprimentos', icon: Warehouse,
    intro: 'Da necessidade ao recebimento e ao controle de estoque.',
    sections: [
      {
        id: 'demandas', title: 'Demandas',
        summary: 'Uma fila única de pedidos de material, serviço e ativo.',
        roles: ['Compras', 'Almoxarifado', 'Gestor'],
        screens: [{ label: 'Demandas', to: '/demandas' }],
        tour: '/demandas',
        blocks: [
          { kind: 'p', text: 'Toda necessidade da empresa vira uma **demanda**, com origem, responsável, prioridade e data necessária. Ela pode ser de material, serviço ou ativo.' },
          { kind: 'table', title: 'Origens', head: ['Origem', 'Exemplo'], rows: [['OP', 'Componente em falta para produzir'], ['Estoque mínimo', 'Item abaixo do mínimo'], ['Manutenção', 'Peça para uma OS'], ['Assistência', 'Peça sem saldo para um chamado'], ['Projeto', 'Material ou serviço já ligado ao projeto, à categoria e ao mês'], ['Manual', 'Pedido avulso']] },
          { kind: 'flow', items: ['Aberta', 'Em atendimento', 'Atendida ou Cancelada'] },
          {
            kind: 'list', title: 'Os três caminhos',
            items: [
              '**Atender pelo estoque**: se o saldo livre cobre a quantidade, dá baixa na hora, registra a saída e cancela a previsão orçamentária.',
              '**Gerar pedido de compra**: abre a cotação. A previsão já existe desde a demanda e não é duplicada na aprovação.',
              '**Contratar e concluir** (serviço): a contratação acompanha a previsão; a conclusão encerra a execução e o realizado aguarda o pagamento do Omie.',
            ],
          },
          { kind: 'rules', items: ['Item da demanda precisa poder ser consumido: bloqueado, rascunho, inativo e excluído são recusados.', 'Obsoleto pode ser atendido pelo saldo, mas não comprado.'] },
        ],
        related: ['compras', 'orcamentos'],
      },
      {
        id: 'compras', title: 'Compras',
        summary: 'Cotação, aprovação e recebimento.',
        roles: ['Compras', 'Gestor', 'Almoxarifado'],
        screens: [{ label: 'Compras', to: '/compras' }],
        tour: '/compras',
        blocks: [
          { kind: 'flow', title: 'Pedido de compra', items: ['Aguardando aprovação', 'Aprovado', 'Recebido parcial', 'Recebido', 'ou Cancelado'] },
          {
            kind: 'steps',
            items: [
              'O pedido nasce de uma demanda, com duas cotações (o fornecedor escolhido e uma alternativa).',
              'Antes da aprovação, escolha a cotação: preço e prazo do pedido passam a ser os dela.',
              '**Aprovar** envia ao fornecedor. A previsão orçamentária continua sendo a da demanda, sem segundo lançamento.',
              '**Receber** dá entrada no estoque (criando lote quando o item controla), e conclui a demanda. A conta a pagar fica no Omie; o orçamento continua em previsão até o pagamento.',
              '**Cancelar** devolve a demanda para Aberta.',
            ],
          },
          { kind: 'rules', items: ['Sem saldo na categoria e no mês, a previsão fica retida e o pedido de compra só é aprovado depois que o Gestor libera em Orçamentos.', 'Só item ativo é comprado. Serviço e kit virtual não são comprados como material.', 'Na requisição manual, a quantidade sobe para o lote mínimo e arredonda para o múltiplo do item; a tela avisa antes de criar.'] },
          { kind: 'p', text: 'As colunas de **requisições** guardam o caminho antigo, ainda usado pelo planejamento: Solicitada → Em cotação → Aprovada → Pedido emitido (no Omie) → Recebida.' },
        ],
        related: ['orcamentos'],
      },
      {
        id: 'almoxarifado', title: 'Almoxarifado: saldos e inventário',
        summary: 'Saldo físico, reservado, disponível e ajustes.',
        roles: ['Almoxarifado'],
        screens: [{ label: 'Almoxarifado', to: '/estoque' }],
        blocks: [
          { kind: 'p', text: 'A tabela de saldos mostra, por item, o saldo físico, o reservado para OPs e o disponível. A separação de kits fica na mesma tela.' },
          { kind: 'steps', title: 'Ajuste de inventário', items: ['Informe a quantidade contada e o motivo.', 'A diferença vira movimentação de ajuste (entrada ou saída, respeitando lotes).', 'O ajuste é enviado ao Omie com o motivo.'] },
          { kind: 'rules', items: ['A contagem não pode ser negativa nem menor que o volume reservado para OPs.', 'Contagem igual ao saldo não gera ajuste.'] },
        ],
        related: ['camada-estoque', 'separacao'],
      },
    ],
  },

  {
    id: 'servicos-campo', title: 'Serviços', icon: Wrench,
    intro: 'Disponibilidade da fábrica e atendimento depois da entrega.',
    sections: [
      {
        id: 'manutencao', title: 'Manutenção',
        summary: 'Corretivas pelo tablet e preventivas do plano.',
        roles: ['Manutenção', 'Líder de produção'],
        screens: [{ label: 'Manutenção', to: '/manutencao' }],
        tour: '/manutencao',
        blocks: [
          { kind: 'flow', items: ['Aberta', 'Em execução', 'Concluída'] },
          { kind: 'list', items: ['**Corretiva**: aberta pela pausa "Quebra de máquina" no tablet ou pela ficha do ativo. A máquina fica bloqueada para produção até a OS ser concluída.', '**Preventiva**: do plano, ou aberta automaticamente quando o ativo do molde atinge o limite de ciclos ou passa de 85% da vida útil. O contador fica no ativo e soma os golpes de cada OP de injeção encerrada (peças boas e refugo ÷ cavidades ativas). Sem o vínculo na ficha do ferramental, essa conta não corre.', '**Orçamento**: toda OS informa custo estimado, categoria e mês. Esses dados criam a previsão; a peça pedida depois segue pela demanda.'] },
          { kind: 'steps', items: ['Abra a OS com custo, categoria e período e clique para iniciar a execução.', 'Se precisar de peça, solicite pela OS (abre uma demanda com a mesma classificação orçamentária).', 'Conclua a OS: o equipamento é liberado para a produção e o pagamento continua aguardando o Omie.'] },
        ],
        related: ['ativos', 'tablet'],
      },
      {
        id: 'assistencia', title: 'Assistência técnica',
        summary: 'Chamados de campo com garantia, peças e cobrança.',
        roles: ['Assistência'],
        screens: [{ label: 'Assistência técnica', to: '/assistencia' }],
        tour: '/assistencia',
        blocks: [
          { kind: 'flow', items: ['Aberta', 'Agendada', 'Em execução', 'Aguardando peça', 'Concluída ou Cancelada'] },
          {
            kind: 'steps',
            items: [
              'Clique em **Novo chamado** e escolha o pedido do cliente. A garantia é calculada pela data de expedição.',
              'Dentro da garantia, a Qualidade recebe uma não conformidade da OP que produziu o lote.',
              'Agende o técnico e inicie o atendimento.',
              'Use peças: com saldo, a peça sai do estoque; sem saldo, abre-se uma demanda para Compras e o chamado fica **Aguardando peça**.',
              'Conclua com o laudo. Se o chamado é cobrável, a conclusão envia a cobrança ao Omie para faturar. Em garantia, a cobrança fica zerada.',
            ],
          },
          { kind: 'p', text: 'O bloco de rastreio liga pedido, OP, versão da estrutura, número de série, não conformidade e demandas de peça.' },
        ],
        related: ['qualidade', 'demandas'],
      },
    ],
  },

  {
    id: 'gestao', title: 'Gestão', icon: LineChart,
    intro: 'Projetos, indicadores, acessos e integração.',
    sections: [
      {
        id: 'projetos', title: 'Projetos',
        summary: 'Marcos, demandas, compras e orçamento num só lugar.',
        roles: ['Engenharia', 'Financeiro', 'Gestor'],
        screens: [{ label: 'Projetos', to: '/projetos' }],
        tour: '/projetos',
        blocks: [
          { kind: 'flow', items: ['Planejado', 'Em andamento', 'Concluído ou Cancelado'] },
          {
            kind: 'steps',
            items: [
              'Clique em **Novo projeto**: tipo (produto novo, molde, melhoria, cliente), responsável, datas e valor.',
              'O tipo cria os marcos padrão. O valor entra no orçamento anual de P&D e cria a previsão rastreável do projeto.',
              'Use **Pedir material** ou **Pedir serviço**: as demandas nascem ligadas ao projeto, com categoria, mês e custo estimado.',
              'Marque os marcos conforme forem concluídos. Quando todos estiverem concluídos, o projeto encerra.',
            ],
          },
          { kind: 'p', text: 'No Gantt, a barra é o prazo, o preenchimento é o avanço físico, a bandeira é o marco e a linha laranja é hoje. Item vinculado a um projeto (aba Projetos do item) exige aprovação técnica para ativar, e o vínculo mostra no item as compras e demandas do projeto.' },
          { kind: 'p', text: 'A ficha do projeto tem a seção **Itens do projeto**, com os itens que apontam para ele, a atividade da EAP de cada vínculo e a situação do cadastro. Clicar abre a página do item.' },
        ],
        related: ['orcamentos', 'demandas', 'midia-projetos'],
      },
      {
        id: 'indicadores', title: 'Indicadores',
        summary: 'Medidas de gestão calculadas dos registros.',
        screens: [{ label: 'Indicadores', to: '/indicadores' }],
        tour: '/indicadores',
        blocks: [
          { kind: 'p', text: 'Entrega no prazo, lead time, refugo, paradas por motivo e produção por recurso. Nada é digitado: tudo sai dos apontamentos, inspeções, expedições e paradas registradas. O indicador **Orçamento consumido** soma apenas o realizado pago confirmado pelo Omie.' },
          { kind: 'p', text: 'A **curva ABC do consumo** mostra quanto valor cada classe representa nos últimos 90 dias, e a tabela ao lado lista os itens que mais consomem valor, com a participação no total e o giro anualizado. A classe é calculada da saída de estoque multiplicada pelo custo, nunca digitada.' },
        ],
        related: ['custo-padrao'],
      },
      {
        id: 'organizacao', title: 'Organização e acessos',
        summary: 'Perfis, funcionalidades e atribuições por empresa.',
        roles: ['Administrador'],
        screens: [{ label: 'Organização e acessos', to: '/organizacao' }],
        tour: '/organizacao',
        blocks: [
          { kind: 'p', text: 'Selecione um perfil e marque as funcionalidades que ele pode executar. Atribua quantos perfis forem necessários para cada pessoa da empresa. O acesso final é a soma dos perfis; não há exceção individual nesta fase.' },
          { kind: 'note', tone: 'info', text: 'Administrador é um perfil de sistema: não pode ser apagado ou reduzido. A mesma funcionalidade será validada também na API, com o tenant da empresa ativo.' },
        ],
        related: ['perfis', 'plataforma'],
      },
      {
        id: 'plataforma', title: 'Plataforma e usuário mestre',
        summary: 'Quem cadastra empresas, grupos econômicos e o vínculo com o Omie.',
        screens: [{ label: 'Plataforma', to: '/plataforma' }],
        tour: '/plataforma',
        blocks: [
          { kind: 'p', text: 'O usuário mestre não pertence a uma empresa e não opera pedidos, estoque ou orçamento. Ele cadastra a empresa, o primeiro administrador e, se houver, o grupo econômico. Também registra a chave da conta Omie. O segredo não fica gravado no navegador.' },
          { kind: 'p', text: 'Ao cadastrar a empresa, o sistema cria o perfil Administrador com todas as funcionalidades que o código publica. Não copia Financeiro nem Gestor. Entrar na empresa abre a sessão desse administrador.' },
          { kind: 'note', tone: 'warning', text: 'Nesta fase a conta Omie é simulada. A chave e o selo de segredo definido servem para ensaiar o cadastro; a chamada real fica para o serviço Core.' },
        ],
        related: ['organizacao', 'integracao-omie'],
      },
      {
        id: 'integracao-omie', title: 'Integração Omie',
        summary: 'Histórico de trocas, falhas e reprocessamento.',
        roles: ['Gestor'],
        screens: [{ label: 'Integração Omie', to: '/integracao' }],
        tour: '/integracao',
        blocks: [
          { kind: 'p', text: 'Cada troca com o Omie fica registrada com entidade, referência, direção (Omie → Thalamus ou Thalamus → Omie), situação e mensagem. O indicador na barra de módulos mostra quantas falhas estão abertas.' },
          { kind: 'table', head: ['Situação', 'Significado'], rows: [['Sincronizado', 'O outro sistema confirmou'], ['Pendente', 'Enviado, aguardando resposta (por exemplo, a NF-e)'], ['Erro', 'Recusado; a mensagem diz o motivo']] },
          { kind: 'steps', title: 'Tratar uma falha', items: ['Leia a mensagem (por exemplo, "produto sem NCM").', 'Corrija a origem no Thalamus (no exemplo, a camada fiscal do item).', 'Clique em **Reprocessar**.'] },
          { kind: 'p', text: 'A tabela **Quem é dono de cada dado** é a regra que evita cadastro em dobro. No fiscal ela é dividida: o **cadastro** do item nasce aqui e vai para o Omie na ativação e a cada vigência que entra; a **apuração** da nota é do Omie. Divergência entre as duas matrizes aparece como erro nesta tela.' },
          { kind: 'p', text: 'O cadastro fiscal do item sincroniza em **mão dupla**: o que o Financeiro muda no Omie volta para o Thalamus, e mudança dos dois lados ao mesmo tempo vira **conflito** a decidir na seção Fiscal da ficha do item. Cada envio e cada retorno ficam registrados aqui.' },
        ],
        related: ['visao-geral', 'matriz-fiscal', 'camada-fiscal'],
      },
    ],
  },

  {
    id: 'financas', title: 'Finanças', icon: CircleDollarSign,
    intro: 'DRE e orçamento por categoria e setor utilizador. O centro de custo continua nas demandas e nas compras. Contas a pagar e a receber estão em estruturação; por enquanto o título, o banco e a contabilidade ficam no Omie.',
    sections: [
      {
        id: 'orcamentos', title: 'Orçamentos',
        summary: 'Orçamento anual por categoria, com responsável, setores utilizadores e executor, e o acompanhamento entre dois meses, da empresa ou do grupo.',
        roles: ['Financeiro', 'Gestor', 'Compras'],
        screens: [{ label: 'Orçamentos', to: '/orcamentos' }],
        tour: '/orcamentos',
        blocks: [
          { kind: 'p', text: 'A chave do orçamento é **categoria + ano**. A árvore tem três níveis: **grupo** (01 Receita Operacional Bruta, 02 Deduções da Receita, 03 Custos, 04 Despesas Variáveis, 05 Despesas Fixas e 09 Investimentos, o CAPEX), **categoria** e **subcategoria**. O valor do ano é informado na subcategoria, no cadastro, na visão geral ou em Planejamento. A categoria macro só mostra a soma. Um total informado no grupo ou na macro é dividido em partes iguais e cada parte continua editável. Enquanto uma categoria não tem subcategoria, o valor fica nela; a primeira subcategoria herda esse valor. O código é gerado (03.10, 03.01.01) e cada nível segue para o Omie.' },
          { kind: 'p', text: 'O acompanhamento muda de lente sem mudar o valor gravado. Na Visão geral, o período vai **de um mês até outro** do mesmo ano, ao lado da escolha da empresa. A fatia de cada mês segue a distribuição mensal planejada; sem ela, cada mês vale 1/12. Previsão e realizado são os do intervalo. O bloqueio de um lançamento novo compara com o saldo do ano, não com a fatia do mês.' },
          { kind: 'p', text: 'O **Financeiro** informa o valor do ano na aba Categorias, sem motivo, mantém categorias, setores utilizadores e regras e trata o pagamento sem categoria. O **responsável da categoria** vê o saldo excedido. O **executor** vê a nota sem vínculo. O **Administrador** vê todas as ações. Clicar na notificação de saldo, fora da justificativa e dos botões, abre a aba Ações. O aviso de limiar chega à pessoa responsável da conta e ao Financeiro, no sino e em Minhas tarefas. Ciente encerra, e o clique no texto abre a categoria. Na Visão geral, Financeiro e Administrador veem todas as contas de custo, despesa e investimento, inclusive sem movimento no período. A depreciação entra com o valor dos ativos. Os demais veem só as categorias em que são o responsável. Outra empresa e a soma do grupo exigem a consulta consolidada e são só leitura. O Financeiro não autoriza a própria exceção de saldo. Inativar uma categoria envia conta_inativa ao Omie; nesta demonstração o envio é simulado.' },
          { kind: 'p', text: 'As categorias são conciliadas com o Omie nos dois sentidos. Criar ou alterar aqui envia na hora. O que o Omie criar ou renomear entra na sincronização, sem duplicar a mesma categoria. O valor do ano continua sendo informado aqui.' },
          { kind: 'p', text: 'A tela **Anual** lê como um DRE. As colunas são o realizado do ano anterior, a participação sobre a receita bruta, o crescimento, o orçamento do ano e a participação do ano. A Receita entra positiva e os demais grupos entram com sinal negativo, porque reduzem o resultado. A linha **Receita Operacional Líquida** é calculada na hora: receita bruta menos deduções. A coluna **Cresc. %** mostra o crescimento sobre o realizado do ano anterior; mudar o percentual recalcula o orçamento da conta. A participação é só leitura. A **meta de faturamento** é o único jeito de aplicar um percentual a todas as contas: ela calcula o crescimento sobre a receita do ano anterior e leva esse percentual a cada conta, cada uma sobre o próprio realizado. Conta sem realizado no ano anterior fica como está.' },
          { kind: 'p', text: 'Na tela **Mensal**, o botão **Repetir sazonalidade** reparte o ano de cada conta pelo peso que cada mês teve no realizado do ano anterior. Conta sem orçamento no ano ou sem realizado no ano anterior fica como está e continua editável mês a mês.' },
          { kind: 'list', title: 'As abas, na ordem', items: ['**Visão geral**: custo, despesa e investimento no período. Quatro números no topo (orçado, realizado, previsão e saldo) e, por conta, orçado, realizado, previsão, desvio e uso, com cor por situação: verde com folga, amarelo a partir de 80% e vermelho acima de 100%. Receita e lucro ficam no DRE. Clicar numa conta abre o gasto de cada **setor utilizador**, com valor e percentual do que foi destinado a ele, mais o cartão **Sem utilizador** para o que não libera demanda. Clicar num setor filtra as origens, listadas da maior para a menor. **Só o que estourou** deixa as contas acima de 100%.', '**Ações**: sem categoria para o Financeiro, sem vínculo para o executor e saldo excedido para o responsável da conta.', '**Categorias**: código, nome, valor, pessoa responsável, valores destinados, setores utilizadores, setor executor, limiar, ação de saldo negativo e situação. O setor só entra com um valor. A soma não passa do valor da categoria e o restante fica sem utilizador. Subcategoria aparece recuada, com linha guia, sob a categoria-mãe, que só soma. **Nova categoria** abre o formulário. A categoria mãe usa código de dois dígitos, como 06. A conta de depreciação continua no plano para o Omie classificar; o valor vem dos ativos.', '**Planejamento**: monta o ano, inclusive a receita. **Anual** (realizado do ano anterior, participação, crescimento e orçamento), **Mensal** (doze meses) e **CAPEX** (investimentos, fora da receita líquida). A depreciação aparece no anual como valor dos ativos e não se edita. Também cadastra uma empresa nova do grupo, com orçamento vazio. Com a consulta consolidada, a soma do grupo é só leitura e a meta do grupo grava o valor no orçamento de cada empresa.'] },
          { kind: 'p', text: 'O custo realizado é a **nota que chega do Omie**. A ficha da categoria mostra o número da nota e, quando existe, o documento do Thalamus de onde ela veio: compra, projeto, ordem de serviço, demanda, chamado ou OP. Nota sem esse vínculo entra no custo do mesmo jeito e fica na aba Ações para o Financeiro ou o Administrador ligarem na mão. Compras, projetos e as demais origens passarão a enviar esse vínculo sozinhas quando esses módulos forem refeitos.' },
          { kind: 'table', head: ['Valor', 'Quando muda'], rows: [['Orçamento informado', 'Valor do ano, no cadastro, na ficha da visão geral ou em Planejamento'], ['Previsão aberta', 'Necessidades de Demandas, OPs, OSs e Projetos no intervalo da lente; baixa ao cancelar ou conforme a nota'], ['Previsão retida', 'Necessidade que deixaria o saldo do ano negativo; fica fora do saldo até o Gestor liberar'], ['Realizado pago', 'Nota do Omie, inclusive parcial e estorno. O vínculo com o documento daqui é outro dado e não muda o valor'], ['Realizado recebido', 'Recebimento do Omie nas categorias de Receita'], ['Saldo', 'Na despesa: fatia do período menos previsão e realizado daquele intervalo. Na Receita: quanto falta vender para a meta. No bloqueio: saldo do ano'], ['Desvio', 'Previsão aberta mais a nota do intervalo, comparados à fatia. O valor aparece num chip verde, amarelo ou vermelho, sem sinal de menos. Na Receita a cor é invertida']] },
          { kind: 'rules', items: ['Ao cruzar o limiar, o sistema registra uma ocorrência e avisa a pessoa responsável da conta e o Financeiro, no sino e em Minhas tarefas. Ciente é dessa pessoa, do Financeiro ou do Administrador, e encerra o aviso.', 'Os setores utilizadores se escolhem na aba Categorias, no botão da coluna Utilizadores. O setor só entra com um valor destinado. A soma pode ficar abaixo do valor da categoria: o que falta fica sem utilizador e não libera demanda. A soma não pode passar do valor. Sem setores, a destinação é removida. Categoria com subcategoria não destina: o valor dela é a soma. Receita, dedução e depreciação não recebem utilizador. **Salvar simulação** guarda o plano do ano; **Aplicar simulação** copia esse retrato para o orçamento.', 'Com bloqueio ativo, a necessidade é registrada mas a previsão fica **retida**. Compra e contratação dessa necessidade só seguem depois que o Gestor libera.', 'Liberar aplica a previsão; recusar cancela a previsão retida. Cancelar a origem encerra a exceção.', 'Pagamento sem categoria, com várias categorias ou com erro fica fora do realizado e aparece para o Financeiro. Sem vínculo aparece para o executor da categoria. O Financeiro escolhe a categoria correta e o pagamento é lançado; ou rejeita com justificativa.', 'Lançamentos preservam origem, projeto, centro de custo e eventos para auditoria e evitam dupla contagem por idempotência. O centro de custo continua nas demandas e nas compras; o orçamento acompanha pelo setor.'] },
          { kind: 'note', tone: 'warning', text: 'O realizado pago e os dados fiscais pertencem ao Omie. Nesta demonstração, pagamentos, parciais e estornos são simulados em memória.' },
        ],
        related: ['centros-de-custo', 'dre', 'compras', 'projetos', 'demandas', 'manutencao'],
      },
      {
        id: 'centros-de-custo', title: 'Centros de custo',
        summary: 'Código do compromisso, o mesmo do Omie. O orçamento da categoria acompanha pelo setor utilizador.',
        roles: ['Financeiro', 'Gestor'],
        screens: [{ label: 'Orçamentos', to: '/orcamentos' }],
        tour: '/orcamentos',
        blocks: [
          { kind: 'p', text: 'O centro de custo continua no lançamento de demanda, compra, projeto e assistência. É o código que o setor traz como padrão e que segue para o Omie. O Thalamus não contabiliza: carimba o código no compromisso.' },
          { kind: 'p', text: 'Orçamentos não tem aba de centros de custo. O valor destinado, a visão geral e o pagamento no DRE usam o **setor utilizador**. O responsável da categoria é uma pessoa. Nesta etapa não há tela para incluir ou editar o plano de centros: o painel saiu de Orçamentos e o cadastro novo ainda não foi colocado em outro lugar. Os centros da demonstração continuam no cenário inicial.' },
          { kind: 'list', title: 'Como entra no dia a dia', items: ['Demanda, compra, projeto e assistência nascem com o centro padrão do setor e podem trocar.', 'A visão geral mostra de onde veio o desvio pelo setor utilizador, não pelo centro.', 'O centro do lançamento antigo permanece no registro.'] },
          { kind: 'note', tone: 'warning', text: 'O vínculo real com o plano de centros do Omie ainda é simulado. Os códigos da demonstração são de exemplo.' },
        ],
        related: ['orcamentos', 'dre', 'pessoas'],
      },
      {
        id: 'dre', title: 'DRE',
        summary: 'Resultado entre dois meses, da empresa ou do grupo, com depreciação dos ativos, premiação estimada e a leitura do período.',
        roles: ['Financeiro', 'Gestor'],
        screens: [{ label: 'DRE', to: '/dre' }],
        tour: '/dre',
        blocks: [
          { kind: 'p', text: 'O DRE não grava orçamento. Ele lê as seções já usadas na referência: receita, deduções, custos, despesas variáveis, despesas fixas, EBITDA, premiação, depreciação, não operacionais, lucro e CAPEX fora do resultado. O período vai de um mês até outro do mesmo ano. Quem tem a consulta consolidada escolhe também outra empresa do grupo ou a soma do grupo; cada lançamento continua sendo da sua empresa.' },
          { kind: 'p', text: 'Nos cards de Receita, EBITDA e Lucro líquido, o **realizado** é o número em destaque, na cor da situação, e o orçado fica em cima como referência, com o percentual atingido. A tabela traz a mesma comparação por linha.' },
          { kind: 'p', text: 'A **Leitura do período** escreve em frases o que os números dizem: quanto da meta de receita foi recebido, quanto de custos e despesas foi consumido, onde está o EBITDA e o setor que mais recebeu pagamento. Ao lado, os cinco setores com mais realizado pago. Esta leitura substitui a antiga tela Leitura financeira, que repetia o DRE e a Visão geral e não era um indicador de gestão.' },
          { kind: 'p', text: 'A depreciação orçada é linear, pelo valor de aquisição e pela vida útil cadastrados em Ativos. Ela não entra na coluna de realizado, porque ainda não há lançamento de depreciação. A premiação SUPERA orçada é estimada: a nota sai dos mesmos fatos de Indicadores (entrega no prazo e refugo) e o valor é 1% do EBITDA vezes essa nota, quando a nota passa de 80. O salário ainda não está em Pessoas. IRPJ e o não operacional ficam zerados até a etapa deles. O CAPEX aparece separado e não altera o lucro.' },
          { kind: 'note', tone: 'warning', text: 'Depreciação e premiação desta tela são estimadas na demonstração. O vínculo real com a folha e com a nota oficial do SUPERA ainda não existe. A leitura do período é calculada; não há modelo de inteligência ligado.' },
        ],
        related: ['orcamentos', 'centros-de-custo', 'ativos', 'pessoas', 'indicadores'],
      },
      {
        id: 'contas-pagar-receber', title: 'Contas a pagar e a receber',
        summary: 'Abas em estruturação. Serão desenhadas junto com Gestão de contratos e a evolução de Ativos.',
        roles: ['Financeiro', 'Gestor'],
        screens: [{ label: 'Contas a pagar', to: '/contas-pagar' }, { label: 'Contas a receber', to: '/contas-receber' }],
        blocks: [
          { kind: 'p', text: 'As duas abas voltaram ao menu de Finanças para marcar o lugar. Cada uma explica de onde virão os títulos: compra aprovada, contrato e ativo no pagar; venda, contrato e assistência no receber. Cada título vai nascer ligado ao documento de origem e consumir a previsão da categoria e do centro.' },
          { kind: 'note', tone: 'info', text: 'Hoje o título, a baixa e o boleto continuam no Omie. O Thalamus lê o pagamento e o recebimento como realizado do orçamento.' },
        ],
        related: ['orcamentos', 'compras', 'ativos'],
      },
    ],
  },

  {
    id: 'referencia', title: 'Referência', icon: BookMarked,
    intro: 'Glossário, situações e solução de problemas.',
    sections: [
      {
        id: 'glossario', title: 'Glossário',
        summary: 'Termos usados no sistema.',
        blocks: [
          {
            kind: 'table',
            head: ['Termo', 'Significado'],
            rows: [
              ['OP', 'Ordem de produção. De injeção (peça) ou de montagem (case).'],
              ['Estrutura (BOM)', 'Lista de componentes e quantidades de um item fabricado.'],
              ['Roteiro', 'Sequência de operações de fabricação, com posto, tempo, preparação, equipe, ferramental e instruções. Faz parte da versão.'],
              ['Versão da estrutura', 'Cada alteração controlada da estrutura e do roteiro (A, B, C…), com vigência.'],
              ['ECO', 'Mudança de engenharia: motivo, itens, impacto, destino do estoque e data de efetividade.'],
              ['Ferramental', 'Item FE em Produtos: molde, gabarito ou dispositivo usado no roteiro. O ativo de manutenção é outro cadastro; o vínculo é opcional.'],
              ['Posto', 'Vaga da fábrica (injetora, célula, almoxarifado, qualidade ou expedição). Tem minutos por dia e custo-hora. O ativo físico aponta para ele.'],
              ['Ativo (patrimônio)', 'Bem físico acompanhado pela manutenção: máquina, molde ou equipamento, com ciclos e preventiva. Não substitui o item de ferramental nem o posto.'],
              ['Cavidade ativa', 'Cavidade do molde em uso. Cavidade bloqueada não produz e aumenta o tempo por peça.'],
              ['Setup', 'Preparação da máquina ou posto antes do lote; rateada no custo pelo tamanho do lote.'],
              ['Atributo', 'Característica técnica definida na classe e herdada pelos itens (cor, grau de proteção, peso).'],
              ['Nível de embalagem', 'Unidade, caixa, master ou palete, com quantidade, GTIN, peso e medidas.'],
              ['Versão do registro', 'Contador de alterações do cadastro do item (v1, v2…).'],
              ['Camada', 'Grupo de dados do item que só existe para certos tipos (estoque, fiscal…).'],
              ['Homologação', 'Aprovação do cadastro por papel antes da ativação.'],
              ['Campo-chave', 'Unidade base e NCM: congelados depois da ativação.'],
              ['FEFO', 'First expired, first out: consome primeiro o lote que vence antes.'],
              ['Reservado', 'Saldo separado para OPs e ainda não retirado.'],
              ['Disponível', 'Saldo menos reservado.'],
              ['Demanda', 'Necessidade de material, serviço ou ativo, de qualquer origem.'],
              ['Categoria orçamentária', 'Classificação com código, grupo, responsável e situação. A chave do controle é categoria + ano.'],
              ['Centro de custo', 'Código do compromisso, o mesmo do Omie. Nasce com a demanda e a compra, pelo centro padrão do setor. O orçamento da categoria acompanha pelo setor utilizador.'],
              ['Setor', 'Equipe do organograma. No orçamento, é o utilizador ou o executor da categoria. Também aponta um centro de custo padrão para o compromisso.'],
              ['Serviço', 'Cadastro mestre único. Venda, ordem de serviço e roteiro são usos independentes do local e de quem executa. Terceirizado exige datasheet. A média de tempo não é calculada enquanto a fórmula não existir.'],
              ['Previsão orçamentária', 'Custo ainda aberto originado por demanda, OP, OS ou projeto.'],
              ['Realizado pago', 'Nota vinda do Omie. Pode ser parcial ou estornada. O vínculo diz de qual compra, projeto ou ordem ela saiu.'],
              ['Realizado recebido', 'Recebimento vindo do Omie nas categorias de Receita. É o que já entrou rumo à meta de faturamento.'],
              ['Saldo orçamentário', 'Na despesa, orçamento informado menos previsão aberta menos realizado pago: o que ainda pode ser gasto. Na Receita, o quanto ainda falta vender para a meta.'],
              ['Desvio orçamentário', 'Previsão aberta mais realizado pago, comparado ao orçamento informado. Abaixo ainda cabe no planejado; acima passou. Não se lê como prejuízo.'],
              ['Exceção orçamentária', 'Saldo excedido, pagamento do Omie sem categoria, ou nota que entrou no custo ainda sem documento do Thalamus.'],
              ['Subcategoria', 'Terceiro nível da árvore. É aqui que o orçamento do ano é informado. A categoria macro mostra a soma.'],
              ['Ocorrência de alerta', 'Registro de quando uma categoria cruzou o limiar. Chega no sino do responsável e do Financeiro, e se encerra em Ciente.'],
              ['NC', 'Não conformidade: defeito registrado com causa e ação.'],
              ['NCM / CEST', 'Classificação fiscal da mercadoria / código da substituição tributária.'],
              ['cClassTrib', 'Classe tributária da reforma (IBS/CBS), lançada com vigência.'],
              ['Curva ABC', 'Classificação dos itens pelo valor consumido: A até 80%, B até 95%, C o restante.'],
              ['DUN-14', 'Código de barras da caixa de embarque.'],
              ['Ex-TIPI', 'Exceção da tabela do IPI dentro de um NCM.'],
              ['Grade', 'Conjunto de variações de um produto, cada uma um item real.'],
              ['Matriz fiscal', 'Regras de CFOP, CST e alíquotas por operação, UF e NCM.'],
              ['SPED 0200', 'Registro de itens do Bloco 0 da EFD ICMS/IPI.'],
              ['EAN / GTIN', 'Código de barras do produto, único no cadastro.'],
              ['Kit virtual', 'Kit não estocado; explode em componentes no pedido.'],
              ['Kit físico', 'Kit montado e estocado como item próprio.'],
            ],
          },
        ],
      },
      {
        id: 'situacoes', title: 'Situações e cores',
        summary: 'Resumo das situações de cada registro.',
        blocks: [
          { kind: 'table', head: ['Cor', 'Significado geral'], rows: [['Azul claro', 'Concluído, aprovado, ativo ou em dia'], ['Laranja', 'Atenção: rascunho, pendente, aguardando'], ['Vermelho', 'Problema: bloqueado, atrasado, erro, falta'], ['Cinza', 'Fora de uso: obsoleto, inativo, substituído, excluído'], ['Azul', 'Informação: em andamento, programado']] },
          {
            kind: 'table', title: 'Situações por registro',
            head: ['Registro', 'Situações'],
            rows: [
              ['Item', 'Rascunho, Em homologação, Ativo, Bloqueado, Obsoleto, Inativo (e Excluído)'],
              ['Versão da estrutura', 'Rascunho, Programada, Vigente, Substituída'],
              ['Pedido de venda (etapa)', 'Entrada, Materiais, Injeção, Montagem, Qualidade, Expedição, Faturado'],
              ['OP', 'Aguardando material, Planejada, Liberada, Em produção, Inspeção, Concluída'],
              ['Demanda', 'Aberta, Em atendimento, Atendida, Cancelada'],
              ['Pedido de compra', 'Aguardando aprovação, Aprovado, Recebido parcial, Recebido, Cancelado'],
              ['Oportunidade', 'Lead, Qualificação, Proposta, Negociação, Ganha, Perdida'],
              ['Proposta', 'Rascunho, Enviada, Aceita, Recusada, Expirada'],
              ['Chamado de assistência', 'Aberta, Agendada, Em execução, Aguardando peça, Concluída, Cancelada'],
              ['OS de manutenção', 'Aberta, Em execução, Concluída'],
              ['Não conformidade', 'Aberta, Em análise, Encerrada'],
              ['Projeto', 'Planejado, Em andamento, Concluído, Cancelado'],
              ['Lançamento orçamentário', 'Ativo, Parcial, Retido, Liquidado, Cancelado, Estornado'],
              ['Alerta orçamentário', 'Aberto, Ciente, Encerrado'],
              ['Categoria orçamentária', 'Ativa ou Inativa. Inativar também inativa no Omie'],
              ['Exceção orçamentária', 'Pendente, Autorizada, Rejeitada, Resolvida'],
            ],
          },
        ],
      },
      {
        id: 'problemas', title: 'Solução de problemas',
        summary: 'Mensagens comuns e o que fazer.',
        blocks: [
          {
            kind: 'table',
            head: ['Mensagem ou situação', 'Causa', 'O que fazer'],
            rows: [
              ['"… está bloqueado e não entra em venda/compra/produção"', 'O item foi bloqueado', 'Veja o motivo na aba Ciclo e aprovações; reative se for o caso'],
              ['"… ainda é rascunho" ou "ainda está em homologação"', 'O item não foi ativado', 'Conclua a homologação em Produtos → Homologação'],
              ['"… não permite estoque negativo"', 'A baixa deixaria o saldo abaixo de zero', 'Confira o saldo, faça o recebimento ou o inventário antes'],
              ['"Produto sem estrutura ou roteiro oficial"', 'Falta versão liberada ou roteiro', 'Libere uma versão da estrutura e cadastre o roteiro'],
              ['"Máquina em manutenção corretiva"', 'Há OS corretiva aberta no recurso', 'Aguarde a Manutenção concluir a OS'],
              ['"Aponte as peças boas antes de concluir"', 'Operação sem apontamento', 'Use Apontar no tablet'],
              ['"Quantidade acima do disponível para esta etapa"', 'Apontamento maior que a etapa anterior', 'Confira o apontamento da etapa anterior'],
              ['Previsão retida por falta de saldo', 'O saldo do ano não cobre a necessidade e o bloqueio está ativo', 'O Gestor libera ou recusa em Ações, com justificativa; ou o Financeiro ajusta o orçamento do ano'],
              ['"Somente o Gestor ou o Administrador libera lançamento acima do saldo"', 'O Financeiro tentou autorizar a exceção', 'Troque para o perfil Gestor ou Administrador'],
              ['Valor na categoria macro', 'A macro tem subcategorias', 'O valor informado nela é dividido entre as subcategorias. O ano também pode ser informado direto na subcategoria'],
              ['"Depois da ativação, a unidade base/NCM muda só por exceção"', 'Campo-chave congelado', 'Use Solicitar exceção abaixo do campo'],
              ['"Quem solicitou não aprova a própria exceção"', 'Mesmo usuário pediu e tentou aprovar', 'Outro Gestor precisa decidir'],
              ['"EAN já usado por …"', 'Código de barras repetido', 'Confira se não é o mesmo item cadastrado duas vezes'],
              ['"Desativação bloqueada: …"', 'Há saldo ou documento em aberto', 'Resolva cada pendência listada e tente de novo'],
              ['Botões e campos travados', 'O perfil atual não edita aquela parte', 'A faixa acima do formulário diz quem pode editar'],
              ['Falha no indicador do Omie', 'O Omie recusou uma troca', 'Abra Integração Omie, corrija a origem e reprocesse'],
            ],
          },
        ],
      },
    ],
  },
]

export interface IndexedSection extends ManualSection {
  number: string
  chapter: ManualChapter
  chapterNumber: number
}

export const MANUAL_SECTIONS: IndexedSection[] = MANUAL.flatMap((chapter, chapterIndex) =>
  chapter.sections.map((section, sectionIndex) => ({ ...section, number: `${chapterIndex + 1}.${sectionIndex + 1}`, chapter, chapterNumber: chapterIndex + 1 })))

export const sectionById = (id: string) => MANUAL_SECTIONS.find(section => section.id === id)

/** Texto corrido da seção, usado na busca do manual. */
export function sectionText(section: ManualSection) {
  const parts = [section.summary, ...(section.roles ?? [])]
  for (const block of section.blocks) {
    if (block.kind === 'p' || block.kind === 'note') parts.push(block.text)
    else if (block.kind === 'table') parts.push(...block.rows.map(row => row.join(': ')))
    else if (block.kind === 'flow') parts.push(block.items.join(' → '))
    else parts.push(...block.items)
    if ('title' in block && block.title) parts.push(block.title)
  }
  return [section.title, ...parts].join(' · ').replace(/\*\*/g, '')
}
