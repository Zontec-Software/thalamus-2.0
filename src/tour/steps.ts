/** Painel que o passo precisa aberto. `close` volta para a tela. */
export type TourPanel = 'opportunity' | 'proposal' | 'demand' | 'purchase' | 'technical' | 'project' | 'budget' | 'person' | 'service' | 'asset' | 'close'

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
  t('home-blocks', 'A tela inicial é o mapa', 'Cada bloco é uma área. Dentro dele estão só as telas daquele trabalho. Os atalhos abrem a tela direto; Entrar abre a primeira dela.'),
  t('home-producao', 'Operações', 'Aqui ficam o painel da fábrica, o fluxo, o planejamento, a produção, a qualidade e o tablet. Ao entrar, a barra de módulos no topo mostra apenas isso.'),
  t('home-cadastros', 'Cadastros', 'Produtos e revisões, pessoas, serviços e ativos formam a base compartilhada dos demais fluxos.'),
  t('search', 'Busca', 'De qualquer área, encontre pedidos, OPs, itens, oportunidades, demandas, projetos, chamados ou pessoas. O resultado abre o detalhe à direita.'),
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
  return path.startsWith('/produtos/item/') ? '/produtos/item' : path
}

export const PAGE_TOURS: Record<string, TourStep[]> = {
  '/': [
    t('home-blocks', 'As áreas do sistema', 'Entre em uma área por vez. O menu lateral acompanha a área em que você está.'),
    t('home-producao', 'Produção', 'Painel, fluxo, planejamento, injeção, montagem e tablet ficam juntos neste bloco.'),
    t('home-cadastros', 'Cadastros', 'Produtos, estruturas e pessoas. Separado da operação do dia.'),
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
    t('plan-btn', 'Planejar com um clique', 'O sistema olha a estrutura: peça injetada em falta vira OP de injeção; componente comprado em falta vira requisição; o case vira a OP de montagem.'),
  ],
  '/produtos': [
    t('product-side', 'O menu é do módulo', 'Esta faixa é o menu de Produtos: itens, classificação, estruturas e roteiros, mudanças, ferramental, estoque, fiscal e a análise do cadastro. O número ao lado mostra o que espera ação.'),
    t('product-list', 'Lista feita para milhares de itens', 'A faixa acima da tabela filtra o tipo: todos, produto acabado, matéria-prima e os demais. Busque por código, descrição, EAN ou NCM e refine situação, classificação ou pendência. Marque vários itens para agir em lote.'),
    t('new-record', 'Um código por item', 'O item nasce em rascunho, com código sequencial e sem significado. O sistema avisa se já existe descrição parecida. Rascunho não entra em pedido, compra nem produção.'),
  ],
  '/produtos/item': [
    t('product-header', 'A ficha do item', 'Foto, código, tipo, classificação e versão vigente. As etiquetas abaixo apontam pendências, como atributo obrigatório vazio ou fiscal em conflito com o Omie.'),
    t('product-kpis', 'Indicadores clicáveis', 'Custo, saldo, lead time, roteiro, onde é usado e mudanças abertas. Cada indicador leva à seção que explica o número. No ferramental, mostram cavidades, ciclo e vida útil.'),
    t('product-layers', 'Seções por assunto', 'Identificação, engenharia, logística, comercial e fiscal, documentos e governança. Só aparecem as seções que o tipo do item usa; o número ao lado indica o que há dentro.'),
    t('product-attributes', 'Atributos herdados', 'Os atributos vêm da classificação. Os marcados com asterisco são obrigatórios para homologar.'),
  ],
  '/produtos/classificacao': [
    t('class-tree', 'Árvore e atributos', 'Selecione um nó para ver os itens, criar filhos e definir atributos. O que é definido num nó vale para todos os nós abaixo.'),
    t('class-attributes', 'Atributos da classe', 'Defina tipo, unidade, opções e se é obrigatório ou eixo de variação da grade. Os herdados de nós acima aparecem marcados.'),
  ],
  '/produtos/mudancas': [
    t('changes-board', 'Quadro de mudanças', 'Cada cartão é uma mudança de engenharia. Ela anda de Solicitada a Implementada; a versão nova da estrutura e do roteiro só vale depois da implementação.'),
    t('changes-new', 'Solicitar mudança', 'Descreva o problema, escolha os itens, o destino do estoque atual e a data de efetividade. O impacto (saldo, OPs, pedidos e compras) é calculado na hora.'),
  ],
  '/produtos/ferramental': [
    t('tooling-list', 'Moldes e gabaritos', 'Cavidades ativas, ciclo, máquinas compatíveis, vida útil e dono. A barra fica vermelha acima de 85% da vida. O contador de golpes vem do ativo na manutenção.'),
  ],
  '/produtos/homologacao': [
    t('product-life', 'Filas em vez de quadro', 'Cada fila mostra um tipo de trabalho: o que espera a sua aprovação, rascunhos, exceções de campo-chave, ativos com cadastro incompleto, bloqueados e obsoletos com saldo.'),
  ],
  '/ajuda/manual': [
    t('manual-index', 'Manual do sistema', 'Cada capítulo cobre uma área e cada seção explica um processo: passo a passo, regras, quem participa e o atalho para a tela.'),
    t('manual-toc', 'Índice numerado', 'Abra e feche os capítulos e vá direto a uma seção. A seção aberta fica destacada.'),
    t('manual-search', 'Busca', 'Procure qualquer palavra, como “lote”, “garantia” ou “orçamento”. Acentos não importam.'),
  ],
  '/parceiros': [
    t('partner-idea', 'Um cadastro, dois papéis', 'Cliente e fornecedor não são fichas separadas. O parceiro guarda os dados gerais uma vez. Cada papel tem o próprio perfil e a própria situação.'),
    t('new-partner', 'Novo parceiro', 'O documento repetido é avisado antes de criar outro registro. Sem papel, o cadastro fica em cadastro.', 'close'),
    t('partner-list', 'Perfis depois de abrir', 'Abra um parceiro. O perfil do cliente mostra a base de vendas e a classe ABC. O do fornecedor mostra os recebimentos e o retrato da homologação. Ticket médio e nota não têm fórmula definida, então o número não é publicado.'),
  ],
  '/pessoas': [
    t('org-chart', 'Organograma', 'Cada setor tem gestor e o código do centro padrão. O cadastro do centro fica em Finanças. Clique em um setor para filtrar as pessoas dele.', 'close'),
    t('record-list', 'A lista abre a ficha', 'Clique em uma pessoa para abrir a ficha à direita. O guia entra nela agora.', 'close'),
    t('new-record', 'Nova pessoa', 'O cadastro gera o PIN do tablet e aplica as permissões do papel escolhido.', 'close'),
    t('person-role', 'Papel, setor e acesso', 'O papel define o que a pessoa vê no sistema. Desativar o acesso tira a pessoa do tablet e das telas, sem apagar o histórico.', 'person'),
    t('person-access', 'O que este papel enxerga', 'Cada área listada aqui é um grupo de telas liberado para o papel. O ajuste fino, módulo a módulo, fica em Gestão → Organização e acessos.', 'person'),
    t('person-team', 'Equipe e pendências', 'Quem gere um setor vê a equipe aqui. Abaixo ficam as tarefas que este papel tem agora, as mesmas de Minhas tarefas.', 'person'),
  ],
  '/servicos': [
    t('record-list', 'Um catálogo, vários usos', 'O mesmo serviço entra em proposta, demanda de terceiro, manutenção e assistência. A coluna Usos mostra onde ele já foi aplicado.', 'close'),
    t('new-record', 'Novo serviço', 'Defina custo, preço e se a execução é de terceiro. Terceiro vira contratação com fornecedor e conta a pagar.', 'close'),
    t('service-form', 'Custo, preço e execução', 'Preço zero significa que o serviço não é vendido. Marcado como terceiro, a demanda pede um fornecedor, cria a previsão orçamentária e gera a conta a pagar na conclusão.', 'service'),
    t('service-usage', 'Onde este serviço aparece', 'Propostas, demandas e chamados que usam o serviço. Cada linha abre o registro correspondente.', 'service'),
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
    t('crm-funnel', 'Funil comercial', 'Cada cartão é uma oportunidade. Clique para abrir a ficha à direita: é nela que a proposta e o projeto nascem.', 'close'),
    t('new-record', 'Nova oportunidade', 'Cliente, produtos de interesse e quantidade. Esses produtos viram as linhas da proposta, já com preço sugerido.', 'close'),
    t('opp-actions', 'Proposta ou projeto, daqui', 'Criar proposta monta o rascunho com os produtos desta oportunidade. Projeto de desenvolvimento abre um projeto já ligado a ela e ao cliente. Marcar como perdida encerra a oportunidade e recusa as propostas que ainda estão abertas.', 'opportunity'),
    t('opp-stages', 'A etapa anda com o trabalho', 'Clique numa etapa para avançar ou voltar. Ganha não é um clique: a oportunidade só é ganha quando o cliente aceita a proposta.', 'opportunity'),
    t('opp-activities', 'Próxima ação', 'Toda oportunidade aberta precisa de um próximo passo. Agende a ligação, a reunião ou a tarefa e marque quando estiver feita. Isso fica na linha do tempo.', 'opportunity'),
    t('opp-proposals', 'Propostas desta oportunidade', 'Cada proposta abre a própria ficha, com preço, validade e, depois do aceite, o pedido gerado. O guia abre uma agora.', 'opportunity'),
    t('prop-actions', 'Enviar, aceitar ou recusar', 'Enviar leva a oportunidade para Negociação. Cliente aceitou aprova o pedido no Omie, com todas as linhas de produto, e a oportunidade vira Ganha. Recusar devolve a oportunidade para a etapa de proposta.', 'proposal'),
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
    t('budget-categories', 'Categorias', 'O valor do ano, a pessoa responsável, os setores que usam o valor e o setor que recebe a demanda. A categoria mãe nova usa um código de dois dígitos.', 'close'),
    t('budget-split', 'Setores da conta', 'O botão abre a destinação desta conta. Informe o valor ou o percentual de cada setor. A soma não passa do valor da categoria. O que ficar sem utilizador não libera demanda.', 'close'),
    t('budget-plan-modes', 'Planejamento', 'Anual monta o ano sobre o realizado anterior, Mensal reparte pelos meses e CAPEX trata o investimento à parte. Aqui também se cadastra uma empresa nova do grupo, com orçamento vazio.', 'close'),
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
    t('shipping-list', 'Conferência e expedição', 'Confira volumes e transportadora e expeça a carga. O Omie emite a NF-e e o pedido é marcado como faturado automaticamente.'),
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
    t('permissions', 'Perfis por funcionalidade', 'Crie perfis reutilizáveis e marque ações de negócio, como gerir orçamento ou liberar saldo. Atribua vários perfis a uma pessoa; as permissões se somam.'),
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
