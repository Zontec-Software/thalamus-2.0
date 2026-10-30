/** Painel que o passo precisa aberto. `close` volta para a tela. */
export type TourPanel = 'proposal' | 'demand' | 'purchase' | 'technical' | 'project' | 'budget' | 'person' | 'asset' | 'close'

export interface TourStep {
  target?: string
  title: string
  body: string
  panel?: TourPanel
}

const t = (target: string | undefined, title: string, body: string, panel?: TourPanel): TourStep => ({ target: target ? `[data-tour="${target}"]` : undefined, title, body, panel })

export const WELCOME_KEY = 'welcome-areas'

export const WELCOME_TOUR: TourStep[] = [
  t(undefined, 'Bem-vindo ao Thalamus 2.0', 'O sistema é dividido em sete áreas: cadastros, suprimentos, comercial, operações, serviços, gestão e finanças. Cada uma mostra apenas o trabalho daquele contexto.'),
  t('home-blocks', 'A tela inicial é o mapa', 'Cada bloco é uma área. O clique abre o mapa dos módulos liberados para o seu perfil. Os atalhos abrem a tela direto. Quem só tem um módulo entra nele sem passar pelo mapa.'),
  t('home-producao', 'Operações', 'Aqui ficam o painel da fábrica, o fluxo, o planejamento, a produção, a qualidade e o tablet. Ao entrar, a barra de módulos no topo mostra apenas isso.'),
  t('home-cadastros', 'Cadastros', 'Produtos e revisões, pessoas, serviços e ativos formam a base compartilhada dos demais fluxos.'),
  t('search', 'Busca', 'De qualquer área, encontre pedidos, OPs, produtos, oportunidades, demandas, projetos, chamados ou pessoas. Produto e pessoa abrem a página do cadastro; o restante abre o detalhe à direita.'),
  t('role', 'Visualizar perfis', 'Só o Administrador vê este seletor. Ele mostra como outro perfil enxerga a interface sem trocar a identidade real. Perfis recebem funcionalidades, não apenas módulos.'),
  t('help', 'Guia de cada tela', 'Depois de entrar numa área, cada tela explica a si mesma na primeira visita. Este botão reabre o guia.'),
]

/** Guia do painel que abre à direita ao clicar num pedido. */
export const ORDER_DRAWER_TOUR: TourStep[] = [
  t('drawer-stages', 'Onde o pedido está', 'Esta faixa é a etapa do pedido inteiro, da entrada no Omie até a nota fiscal. Ela anda sozinha. "Injeção" aqui significa que o pedido está nessa fase, não é a lista de ordens.'),
  t('drawer-injection', 'OP de injeção · a peça', 'Cada cartão azul é uma ordem de injeção: a peça plástica (moldura, tampa, bumper) feita na injetora. Quando ela termina, a peça entra no estoque. O selo "OP de injeção" identifica.'),
  t('drawer-assembly', 'OP de montagem · o case', 'O cartão verde é a ordem de montagem: o case que o cliente comprou. Ela junta as peças das OPs de injeção com os componentes comprados. É outra OP, de outro posto.'),
]

/** Chave do guia para a rota: telas com id na URL compartilham um guia. */
export function tourKey(path: string): string {
  if (path.startsWith('/produtos/item/')) return '/produtos/item'
  if (path.startsWith('/crm/oportunidade/')) return '/crm/oportunidade'
  if (path.startsWith('/postos')) return '/postos'
  if (path.startsWith('/servicos')) return '/servicos'
  if (path.startsWith('/parceiros')) return '/parceiros'
  if (path.startsWith('/pessoas')) return '/pessoas'
  if (path.startsWith('/area/')) return '/area'
  return path
}

export const PAGE_TOURS: Record<string, TourStep[]> = {
  '/area': [
    t('area-modules', 'Módulos da área', 'Cada cartão é um módulo que o seu perfil pode abrir. O nome da área, no topo, traz de volta para este mapa. A seta ao lado troca de área.'),
  ],
  '/': [
    t('home-blocks', 'As áreas do sistema', 'Entre em uma área por vez. O menu lateral acompanha a área em que você está.'),
    t('home-producao', 'Produção', 'Painel, fluxo, planejamento, injeção, montagem e tablet ficam juntos neste bloco.'),
    t('home-cadastros', 'Cadastros', 'Produtos, postos, pessoas e ativos. Separado da operação do dia.'),
  ],
  '/painel': [
    t('kpis', 'Indicadores do dia', 'Visão rápida de pedidos em carteira, riscos, eficiência e materiais críticos. Os números são calculados a partir das operações reais registradas.'),
    t('stage-strip', 'Pedidos por etapa', 'Quantos pedidos estão em cada fase do processo. Clique em uma etapa para abrir o fluxo completo.'),
    t('machines', 'Situação das injetoras', 'Estado de cada máquina, atualizado pelos apontamentos feitos no tablet: produzindo, parada ou em manutenção.'),
    t('attention', 'Pontos de atenção', 'Exceções que exigem decisão: atrasos, faltas, paradas, chamados do chão de fábrica e falhas de integração.'),
  ],
  '/fluxo': [
    t('flow-board', 'O processo de ponta a ponta', 'Cada coluna é uma etapa, da entrada do pedido ao faturamento. Os cartões avançam sozinhos conforme as áreas registram seu trabalho, sem ninguém precisar mudar o status manualmente.'),
    t('flow-card', 'Detalhe e linha do tempo', 'Clique em um pedido para ver OPs, materiais, compras e a linha do tempo com cada evento: quem fez, quando e em qual módulo.'),
    t('flow-filter', 'Filtros e riscos', 'Filtre por cliente ou mostre apenas pedidos com risco: atraso, falta de material, parada ou retrabalho.'),
  ],
  '/tarefas': [
    t('task-list', 'Fila de trabalho', 'Tudo o que depende de você aparece aqui, já com a ação principal. As tarefas somem quando concluídas e a próxima área é avisada automaticamente.'),
    t('role', 'Visualização de perfil', 'O Administrador pode conferir a interface de outro perfil sem alterar os acessos da pessoa.'),
  ],
  '/pedidos': [
    t('sync-omie', 'Pedidos vêm do Omie', 'Pedidos aprovados no Omie são importados aqui. Cliente, produto, quantidade e prazo chegam prontos.'),
    t('op-legend', 'Dois tipos de OP', 'Todo case gera OPs de dois tipos. A de injeção fabrica a peça plástica na máquina. A de montagem junta essas peças no case do cliente. Elas não são a mesma coisa.'),
    t('orders-table', 'Abra o pedido', 'Clique na linha. No painel, as OPs de injeção ficam no grupo azul e a OP de montagem no grupo verde, cada uma com a peça ou o case que produz.'),
    t('plan-btn', 'Planejar com um clique', 'O sistema olha a estrutura: produto fabricado na injetora em falta vira OP de injeção; matéria-prima em falta vira requisição; o case vira a OP de montagem.'),
  ],
  '/produtos': [
    t('product-side', 'As abas do módulo', 'Portfólio e Classificação ficam na faixa do topo. Ações reúne o que o seu perfil pode fazer agora: completar cadastro, homologar, revisar estrutura, fiscal ou mudança. O número é a quantidade dessas pendências. Ao abrir um produto, estas abas somem e as seções da ficha entram na mesma faixa.'),
    t('product-list', 'Lista feita para milhares de produtos', 'As guias separam a vida do produto. A versão vigente fica em Ativos; se outra versão está em desenvolvimento, o mesmo produto também aparece em Em Revisão. Inativo só mostra quem foi inativado. A faixa de tipos e o filtro de cada coluna continuam valendo dentro da guia aberta.'),
    t('new-record', 'Um código por produto', 'O produto nasce em rascunho, com código sequencial e sem significado. O sistema avisa se já existe descrição parecida. Rascunho não entra em pedido, compra nem produção.'),
  ],
  '/produtos/item': [
    t('product-header', 'A ficha do produto', 'Foto, código, tipo, classificação e versão vigente. As etiquetas abaixo apontam pendências, como atributo obrigatório vazio ou fiscal em conflito com o Omie.'),
    t('product-kpis', 'Indicadores clicáveis', 'Custo, saldo, lead time, roteiro, onde é usado e mudanças abertas. Cada indicador leva à seção que explica o número. No ferramental, mostram cavidades, ciclo e vida útil.'),
    t('product-layers', 'Seções na faixa do topo', 'Geral, engenharia, logística, comercial, documentos e governança ficam na mesma faixa horizontal do orçamento. Só aparecem as seções que o tipo do produto usa. O número marca o que pede ação.'),
    t('product-attributes', 'Atributos herdados', 'Os atributos vêm da classificação. Os marcados com asterisco são obrigatórios para homologar.'),
  ],
  '/produtos/classificacao': [
    t('class-tree', 'Árvore e atributos', 'Selecione um nó para ver os produtos, criar filhos e definir atributos. O que é definido num nó vale para todos os nós abaixo.'),
    t('class-attributes', 'Atributos da classe', 'Defina tipo, unidade, opções e se é obrigatório ou eixo de variação da grade. Os herdados de nós acima aparecem marcados.'),
  ],
  '/produtos/acoes': [
    t('product-actions', 'O que é seu agora', 'Cada linha é uma pendência que o perfil atual pode resolver: homologar, completar um campo, concluir estrutura, tratar fiscal, mudança ou ciclo de vida. Quem não tem a funcionalidade não vê a linha. Abra para ir direto à seção do produto.'),
  ],
  '/produtos/ferramental': [
    t('tooling-list', 'Moldes e gabaritos', 'Cavidades ativas, ciclo, postos compatíveis, vida útil e dono. O ativo de manutenção é opcional: sem ele, o contador de golpes fica em zero. A barra fica vermelha acima de 85% da vida quando o ativo está vinculado.'),
  ],
  '/ajuda/manual': [
    t('manual-index', 'Manual do sistema', 'Cada capítulo cobre uma área e cada seção explica um processo: passo a passo, regras, quem participa e o atalho para a tela.'),
    t('manual-toc', 'Índice numerado', 'Abra e feche os capítulos e vá direto a uma seção. A seção aberta fica destacada.'),
    t('manual-search', 'Busca', 'Procure qualquer palavra, como “lote”, “garantia” ou “orçamento”. Acentos não importam.'),
  ],
  '/parceiros': [
    t('partner-idea', 'Um cadastro, dois papéis', 'Cliente e fornecedor não são fichas separadas. O parceiro guarda os dados gerais uma vez. Cada papel tem o próprio perfil e a própria situação.'),
    t('new-partner', 'Novo parceiro', 'Escolha Cliente, Fornecedor, Transportadora ou mais de um. O documento repetido é avisado antes de criar outro registro. Sem papel, o cadastro fica em cadastro.', 'close'),
    t('partner-list', 'Perfis depois de abrir', 'Clique em um parceiro para abrir a página dele, com as abas Cadastro, Contatos e endereços, Cliente, Fornecedor e Histórico. A aba Cliente mostra a base de vendas e a classe ABC. O do fornecedor mostra os recebimentos e o retrato da homologação. Ticket médio e nota não têm fórmula definida, então o número não é publicado.'),
  ],
  '/pessoas': [
    t('people-areas', 'Cinco abas', 'Colaboradores, Admissão e Desligamento cuidam das pessoas. Organograma e Cargos cuidam da estrutura. A pessoa ocupa uma posição. O cargo é o dessa vaga.'),
    t('record-list', 'Quem trabalha aqui', 'Os filtros mostram quem está sem posição, em desligamento ou com a conta bloqueada. Outras empresas do grupo abre o diretório: dali a pessoa entra num projeto, recebe acesso ou é contratada aqui também.', 'close'),
    t('new-record', 'Nova pessoa', 'Nome, setor, uma vaga que já existe, turno e o perfil da Gestão de acesso. O cargo é o dessa vaga. O resto da ficha vem depois. O PIN do tablet é gerado e não fica à mostra.', 'close'),
    t('org-chart', 'Organograma', 'À esquerda, os setores. Cada vaga já tem um cargo, mesmo vazia. A pessoa ocupa a vaga. A chefia é outra vaga e pode ficar em outro setor. Editar muda o cargo, o setor, a chefia e os lugares. Remover tira a vaga livre.', 'close'),
    t('person-file', 'Dados pessoais', 'A foto fica no topo. Sem arquivo, aparecem as iniciais. O resto é uma página só, por seções, com um botão de salvar. Documento, endereço, família e saúde aparecem só para o RH e para a própria pessoa.'),
    t('person-role', 'Vínculo e trajetória', 'A ficha mostra a posição que a pessoa ocupa. O cargo é o dessa vaga e se troca no organograma. Mudar de posição tem data e não mexe no acesso.'),
    t('person-access', 'A conta, não o catálogo', 'Os perfis são os da Gestão de acesso, por empresa. Eles definem o que a pessoa vê. A conta Google é criada aqui, com o e-mail confirmado, e suspensa na data do desligamento. A senha não aparece.'),
  ],
  '/servicos': [
    t('service-idea', 'Um cadastro, vários usos', 'Venda, ordem de serviço e roteiro podem valer juntos. O local não define quem executa.'),
    t('new-record', 'Novo serviço', 'A página pede os usos, o local e quem executa. Terceirizado só grava com o datasheet. A categoria oficial ainda não foi definida.'),
    t('record-list', 'A lista abre a página', 'Clique num serviço para abrir a página dele, com as abas Cadastro, Uso e Histórico. A seta volta para a lista.'),
    t('service-form', 'Cadastro', 'Equipe própria pede setor e instrução. Venda ou ordem de serviço abre preço e cenário fiscal, sem lista e sem cálculo.'),
    t('service-usage', 'Uso', 'Propostas, demandas e as revisões de roteiro. Alterar abre um rascunho no produto e não troca ordem já criada.'),
  ],
  '/postos': [
    t('post-idea', 'A vaga da fábrica', 'O posto é onde a ordem entra e o que o operador escolhe no tablet. A máquina física continua em Ativos e aponta para este posto.'),
    t('new-post', 'Novo posto', 'Nome, tipo, minutos por dia e custo-hora. Ele já nasce ativo e pode entrar no roteiro, no ferramental e na programação.'),
    t('post-list', 'A lista fica inteira', 'Clique num posto para abrir a ficha por cima da lista. Inativar tira das escolhas novas. Excluir só existe enquanto nada aponta para o posto.'),
    t('post-form', 'A ficha do posto', 'Nome, tipo, minutos e custo-hora ficam nesta janela. Abaixo aparecem os ativos ligados. O vínculo é feito na ficha do ativo. Molde só aceita posto do tipo Injetora.'),
  ],
  '/ativos': [
    t('record-list', 'Ativos e capacidade', 'Cada cartão mostra ciclos, preventiva e OS abertas. Clique abre a ficha, e o guia entra nela agora.', 'close'),
    t('new-record', 'Novo ativo', 'Máquina, molde ou equipamento, com criticidade, limite de ciclos e plano preventivo.', 'close'),
    t('asset-actions', 'Manutenção a partir do ativo', 'Corretiva abre uma OS e bloqueia a máquina para a produção. Preventiva entra no plano. Solicitar peça abre uma demanda de material ligada a este ativo.', 'asset'),
    t('asset-history', 'O que este ativo produz e para', 'Ordens de manutenção, peças do molde, OPs programadas no recurso e as paradas registradas pelo tablet.', 'asset'),
  ],
  '/demandas': [
    t('record-list', 'Uma fila para a empresa inteira', 'A demanda pode nascer de uma OP, do estoque mínimo, da manutenção, da assistência ou de um projeto. Clique na linha para decidir como atender.', 'close'),
    t('new-record', 'Nova demanda', 'Escolha material, serviço ou ativo. A origem define o responsável e já deixa o vínculo preenchido: uma demanda aberta dentro de um projeto nasce ligada a ele.', 'close'),
    t('demand-stock', 'Dá para atender agora?', 'Estoque, reservado para OPs e saldo livre. Se o livre cobre a quantidade, o almoxarifado entrega. Se não cobre, o lead time estima quando a compra chega.', 'demand'),
    t('demand-actions', 'Três caminhos', 'Atender pelo estoque dá baixa e cancela a previsão. Gerar pedido usa a previsão já criada pela demanda, sem duplicá-la. Em serviço, Concluir encerra a execução; o pagamento fica no Omie e o realizado espera a confirmação dele.', 'demand'),
    t('demand-links', 'Origem, categoria e período', 'A origem abre a OP, o chamado ou o projeto. O pedido e o orçamento mostram a categoria, o mês e o saldo que esta demanda consome.', 'demand'),
  ],
  '/crm': [
    t('crm-areas', 'O CRM em cinco abas', 'Painel, Oportunidades, Funil, Propostas e Agenda. O número em cada aba é o que pede ação. Vendedor e grupo, à direita, filtram todas as abas.'),
    t('crm-goal', 'Meta, MRR e ticket', 'MRR é a receita mensal recorrente: o valor que passa a entrar todo mês quando o negócio fecha. A meta compara a soma do MRR conquistado com o alvo. O mês vale um doze avos da meta anual. Em aberto é o MRR ainda em negociação, e o ponderado aplica a probabilidade da fase. Win rate é a parte das encerradas que virou conquista. O ticket, valor do negócio, fica na ficha e na lista. Definir meta fica com quem gerencia o comercial.'),
    t('crm-attention', 'Precisa de atenção', 'Oportunidades sem status, sem próxima ação ou com fechamento vencido. Clique para abrir a ficha e resolver.'),
  ],
  '/crm/oportunidades': [
    t('record-list', 'Todas as oportunidades', 'Guias por situação, atalhos de temperatura e de alerta, e filtro em cada coluna. Ticket é o valor do negócio. MRR é a receita mensal recorrente, a que conta para a meta. Clique na linha para abrir a ficha.'),
    t('new-record', 'Nova oportunidade', 'Cliente, vendedor, origem e a próxima ação com data. A ação já entra na agenda e a ficha abre em seguida.'),
  ],
  '/crm/funil': [
    t('crm-funnel', 'Funil comercial', 'Cada coluna soma o MRR da fase, a receita mensal recorrente. No cartão, o ticket é o valor do negócio. Avançar move uma fase. Conquista só vem pelo aceite da proposta. Clique no cartão para abrir a ficha.'),
  ],
  '/crm/agenda': [
    t('crm-agenda', 'Agenda comercial', 'As próximas ações de todas as oportunidades, das atrasadas às dos próximos dias. Concluir marca a atividade como feita; a linha abre a ficha em Ações.'),
  ],
  '/crm/oportunidade': [
    t('opp-header', 'Ficha da oportunidade', 'Cliente, vendedor e empresa no topo, com os alertas abertos. Criar proposta monta o rascunho com os produtos de interesse. Marcar como perdida pede o motivo e recusa as propostas abertas.'),
    t('opp-stages', 'A fase anda com o trabalho', 'Clique numa fase para avançar ou voltar. Conquista não é um clique: a oportunidade só é conquistada quando o cliente aceita a proposta.'),
    t('opp-kpis', 'O que cada número é', 'Ticket é o valor do negócio, estimado pelos produtos ou trazido pela última proposta. MRR é a receita mensal recorrente e entra na meta. Temperatura é o julgamento do vendedor: Quente, Morno ou Frio. A probabilidade acompanha a fase, de 10% na prospecção a 55% na proposta. Fechamento é a data prevista. Próxima ação abre a agenda. Custo total soma as demandas de material. Cada indicador abre a aba onde ele se resolve.'),
    t('opp-tabs', 'Abas da ficha', 'Dados se editam e se salvam aqui. Ações é a agenda desta oportunidade. Observações guarda o texto livre. Desenvolvimento abre o PAP, as demandas e o projeto.'),
  ],
  '/crm/propostas': [
    t('crm-proposals', 'Propostas', 'Em andamento, aceitas e recusadas. A validade vencida aparece em vermelho para cobrar retorno. Clique para abrir a proposta.', 'close'),
    t('prop-actions', 'Enviar, aceitar ou recusar', 'Enviar mantém a oportunidade em Proposta. Cliente aceitou aprova o pedido no Omie, com todas as linhas de produto, e a oportunidade vira Conquista. Recusar registra o motivo.', 'proposal'),
    t('prop-items', 'Itens, desconto e condições', 'Produtos e serviços na mesma proposta. Em rascunho, quantidade e preço são editáveis e o desconto vai até 15%. Pagamento, validade e entrega sugerida ficam nas condições.', 'proposal'),
  ],
  '/assistencia': [
    t('record-list', 'Chamados de campo', 'Cada linha é um chamado ligado a um pedido. Clique para abrir a ficha com garantia, técnico, peças e cobrança.', 'close'),
    t('new-record', 'Novo chamado', 'Escolha o pedido do cliente. A garantia é calculada pela data de expedição. Dentro da garantia, a Qualidade recebe uma não conformidade da OP que produziu o lote.', 'close'),
    t('tech-actions', 'Do agendamento ao laudo', 'Agende o técnico, inicie o atendimento e conclua com o laudo. Se o chamado é cobrável, a conclusão gera a conta a receber. Em garantia, a cobrança fica zerada.', 'technical'),
    t('tech-parts', 'Peça com ou sem saldo', 'Usar peça com saldo dá baixa no estoque. Sem saldo, o sistema abre uma demanda para Compras e o chamado fica Aguardando peça até a demanda ser atendida.', 'technical'),
    t('tech-trace', 'Rastreio até a OP', 'Pedido, ordem de produção, revisão, número de série, não conformidade e demandas de peça. Cada linha abre o registro de origem.', 'technical'),
  ],
  '/projetos': [
    t('project-gantt', 'Portfólio no tempo', 'A barra é o prazo, o preenchimento é o avanço físico, a bandeira é o marco e a linha laranja é hoje. Clique numa linha para abrir o projeto.', 'close'),
    t('record-list', 'O projeto junta tudo', 'Marcos, demandas, compras e orçamento ficam na mesma ficha. O guia entra nela agora.', 'close'),
    t('new-record', 'Novo projeto', 'O tipo escolhido cria os marcos padrão. O valor informado entra no orçamento anual de P&D e cria uma previsão rastreável do projeto.', 'close'),
    t('project-actions', 'Pedir material ou serviço', 'Os dois botões abrem uma demanda já vinculada ao projeto, com categoria, período e custo estimado para o orçamento.', 'project'),
    t('project-milestones', 'Marcos com responsável', 'Marque o marco para concluí-lo. O atraso aparece em vermelho. Quando todos estão concluídos, o projeto encerra. Dá para incluir um marco novo aqui embaixo.', 'project'),
    t('project-costs', 'Orçamento do projeto', 'A previsão mostra custos ainda abertos. O realizado só aparece quando o Omie confirma o pagamento.', 'project'),
  ],
  '/orcamentos': [
    t('budget-tabs', 'Quatro abas, na ordem do trabalho', 'Visão geral acompanha. Ações decide. Categorias define o valor, o responsável e os setores. Planejamento monta o ano. O guia passa por uma de cada vez.', 'close'),
    t('period-scope', 'Período e empresa', 'Escolha o ano e o intervalo de meses. Quem tem a consulta consolidada também escolhe a empresa do grupo ou a soma do grupo, só para leitura.', 'close'),
    t('record-list', 'Visão geral', 'Custo, despesa e investimento no período: orçado, realizado, previsão, desvio e uso, com a cor da situação. Financeiro e Administrador veem todas as contas, inclusive sem movimento. Os demais veem só as categorias em que são o responsável. Clique numa conta para ver o valor e o percentual de cada setor utilizador. Clique num setor para filtrar as origens, da maior para a menor.', 'close'),
    t('budget-detail', 'A ficha da conta', 'O realizado é a nota do Omie. A linha diz a compra, o projeto ou a ordem. Sem esse vínculo, a ação aparece para o setor executor.', 'budget'),
    t('budget-actions', 'Ações', 'Sem categoria fica com o Financeiro. Sem vínculo fica com o executor da categoria. Saldo excedido fica com o responsável da conta.', 'close'),
    t('budget-categories', 'Categorias', 'O valor do ano, a pessoa responsável, os setores que usam o valor e o setor que recebe a demanda. Nova categoria abre o formulário. A categoria mãe usa um código de dois dígitos.', 'close'),
    t('budget-split', 'Setores da conta', 'Clique nos valores destinados para abrir a destinação desta conta. Informe o valor ou o percentual de cada setor. A soma não passa do valor da categoria. O que ficar sem utilizador não libera demanda.', 'close'),
    t('budget-plan-modes', 'Planejamento', 'Anual monta o ano sobre o realizado anterior, Mensal reparte pelos meses e CAPEX trata o investimento à parte.', 'close'),
    t('budget-assistant', 'Assistente de planejamento', 'Três abordagens a partir do realizado do ano anterior. Mercado, internet e atas são um dossiê de demonstração: a tela não acessa a web nem arquivo de reunião. Usar uma delas grava o crescimento de cada conta sobre o próprio realizado.', 'close'),
    t('budget-summary', 'Meta de faturamento', 'O realizado do ano anterior e o percentual necessário para a meta. Definir meta aplica esse percentual a todas as contas. A coluna Cresc. % ajusta conta por conta.', 'close'),
    t('budget-seasonality', 'Sazonalidade em um clique', 'No Mensal, este botão reparte o ano de cada conta pelo peso de cada mês no realizado do ano anterior. Conta sem base fica como está.', 'close'),
  ],
  '/dre': [
    t('period-scope', 'Período e empresa', 'Ano, mês inicial e mês final. Quem tem a consulta consolidada escolhe também a empresa do grupo ou a soma do grupo.', 'close'),
    t('dre-cards', 'Realizado em destaque', 'O número grande é o realizado, na cor da situação. O orçado fica em cima, como referência, com o percentual atingido.', 'close'),
    t('dre-statement', 'O demonstrativo', 'Receita, custos, EBITDA e lucro do período, orçado e realizado. O investimento fica separado e não entra no lucro.', 'close'),
    t('dre-reading', 'Leitura do período', 'As frases saem dos mesmos números da tabela: meta de receita, consumo de custos, EBITDA e o setor que mais gastou.', 'close'),
  ],
  '/programacao': [
    t('capacity', 'Carga por recurso', 'A ocupação de cada injetora e célula de montagem é calculada pelo tempo padrão das operações programadas.'),
    t('schedule-grid', 'Programação da semana', 'Cada bloco é uma OP no recurso e no dia programados. Clique para reprogramar: o tablet do posto recebe a nova sequência na hora.'),
  ],
  '/ordens': [
    t('op-filters', 'Filtros por situação', 'Separe as OPs aguardando material, prontas para separação, em produção ou em inspeção.'),
    t('op-table', 'Ordens de produção', 'OPs de injeção produzem peças para o estoque; OPs de montagem produzem o case do pedido. Clique para ver materiais, operações e apontamentos.'),
  ],
  '/necessidades': [
    t('mrp-table', 'Necessidades de materiais', 'Saldo, reservas, compras em andamento e falta de cada item. As requisições já nascem vinculadas ao pedido e à OP que precisam do material.'),
  ],
  '/compras': [
    t('purchase-orders', 'Pedidos de compra', 'Clique num pedido para abrir a ficha: cotação, aprovação e recebimento. O guia entra num pedido agora.', 'close'),
    t('po-flow', 'Aprovar formaliza, receber conclui', 'Aprovar envia o pedido ao fornecedor sem criar outra previsão. Receber o saldo dá entrada no estoque e conclui a demanda. O contas a pagar fica no Omie; o realizado pago só nasce quando ele confirma o pagamento.', 'purchase'),
    t('po-quotes', 'Escolher a cotação', 'Antes da aprovação, escolha o fornecedor. Preço e prazo do pedido passam a ser os da cotação escolhida.', 'purchase'),
    t('po-links', 'Demanda, projeto e categoria', 'A demanda de origem, o projeto e a categoria do mês. Cada linha abre o registro correspondente.', 'purchase'),
    t('purchase-pipeline', 'Requisições do cenário atual', 'O fluxo novo passa por Demandas. Estas colunas guardam as requisições que já estavam no caminho: cotação, aprovação, pedido no Omie e recebimento.', 'close'),
  ],
  '/estoque': [
    t('picking', 'Separação de kits', 'OPs com todos os materiais reservados aparecem aqui para separação. Ao confirmar, a OP é liberada no tablet do posto.'),
    t('stock-table', 'Saldos e inventário', 'Saldo físico, reservado e disponível de cada item. Ajustes de inventário são enviados ao Omie com o motivo registrado.'),
  ],
  '/injecao': [
    t('machine-cards', 'Painel das injetoras', 'Estado, OP em produção, molde, quantidade e refugo por máquina. Tudo é alimentado pelo tablet do operador, sem apontamento em papel.'),
  ],
  '/montagem': [
    t('assembly-matrix', 'Matriz OP × etapa', 'Mostra em que etapa do roteiro cada OP de montagem está. A cor indica se a etapa está concluída, em execução, parada ou aguardando.'),
  ],
  '/qualidade': [
    t('inspections', 'Inspeção final', 'Lotes que terminaram a montagem aguardam inspeção. A aprovação libera para a expedição; a reprovação abre uma não conformidade e envia o lote para retrabalho.'),
    t('nc-table', 'Não conformidades', 'Registro de problemas com causa e ação corretiva, ligado à OP e ao pedido.'),
  ],
  '/expedicao': [
    t('shipping-list', 'Conferência e expedição', 'Confira os volumes e escolha a transportadora. A lista traz os parceiros com esse papel ativo, mais a retirada pelo cliente. O Omie emite a NF-e e o pedido é marcado como faturado automaticamente.'),
  ],
  '/manutencao': [
    t('maintenance-list', 'Ordens e previsão', 'Corretivas e preventivas mostram custo estimado, categoria e mês. Esses dados criam a previsão orçamentária. A máquina fica bloqueada para produção até a liberação.'),
    t('assets', 'Máquinas e moldes', 'Ativos com contador de ciclos e próxima preventiva.'),
  ],
  '/indicadores': [
    t('kpi-grid', 'Indicadores de gestão', 'Entrega no prazo, lead time, refugo e compras atrasadas saem dos registros operacionais. O orçamento consumido soma somente pagamentos confirmados pelo Omie.'),
  ],
  '/plataforma': [
    t('platform-intro', 'Usuário mestre', 'Esta tela fica fora das empresas. Cadastre o tenant, o grupo econômico e o primeiro administrador. A empresa nasce só com o perfil Administrador.'),
    t('platform-omie', 'Vínculo Omie', 'A chave identifica a conta. O segredo é informado e descartado. A sincronização continua simulada até o Core existir.'),
  ],
  '/organizacao': [
    t('permissions', 'Perfis por funcionalidade', 'Crie perfis reutilizáveis e marque ações de negócio, como gerir orçamento ou liberar saldo. Atribua vários perfis a uma pessoa; as permissões se somam. No topo, a empresa ou o grupo mostram onde a conta entra. A soma não edita.'),
  ],
  '/integracao': [
    t('sync-table', 'Histórico de integração', 'Cada troca com o Omie fica registrada com direção, resultado e mensagem. Falhas podem ser reprocessadas após a correção.'),
    t('integration-rules', 'Quem é dono de cada dado', 'O Thalamus planeja categorias e previsões. O Omie é a fonte do pagamento, do estorno, da nota e dos dados fiscais.'),
  ],
  '/tablet': [
    t('tablet-device', 'O tablet do posto', 'É isso que o operador vê. Telas simples, botões grandes e poucas decisões: entrar, escolher o posto, pegar a tarefa e apontar.'),
    t('tablet-guide', 'Roteiro de demonstração', 'Siga estes passos para experimentar: entre como operador, escolha um posto e inicie, pause ou aponte uma operação.'),
    t('tablet-live', 'Efeito ao vivo na gestão', 'Cada toque no tablet aparece aqui na hora, exatamente como os gestores veem nos painéis.'),
  ],
}
