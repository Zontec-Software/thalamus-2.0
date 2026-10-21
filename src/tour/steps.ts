/** Painel que o passo precisa aberto. `close` volta para a tela. */
export type TourPanel = 'opportunity' | 'proposal' | 'demand' | 'purchase' | 'technical' | 'project' | 'budget' | 'title' | 'person' | 'service' | 'asset' | 'close'

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
  t('search', 'Busca', 'De qualquer área, encontre pedidos, OPs, itens, oportunidades, demandas, projetos, chamados, títulos ou pessoas. O resultado abre o detalhe à direita.'),
  t('role', 'Visualizar perfis', 'Só o Administrador vê este seletor. Ele mostra como outro perfil enxerga a interface sem trocar a identidade real. Perfis recebem funcionalidades, não apenas módulos.'),
  t('help', 'Guia de cada tela', 'Depois de entrar numa área, cada tela explica a si mesma na primeira visita. Este botão reabre o guia.'),
]

/** Guia do painel que abre à direita ao clicar num pedido. */
export const ORDER_DRAWER_TOUR: TourStep[] = [
  t('drawer-stages', 'Onde o pedido está', 'Esta faixa é a etapa do pedido inteiro, da entrada no Omie até a nota fiscal. Ela anda sozinha. "Injeção" aqui significa que o pedido está nessa fase, não é a lista de ordens.'),
  t('drawer-injection', 'OP de injeção · a peça', 'Cada cartão azul é uma ordem de injeção: a peça plástica (moldura, tampa, bumper) feita na injetora. Quando ela termina, a peça entra no estoque. O selo "OP de injeção" identifica.'),
  t('drawer-assembly', 'OP de montagem · o case', 'O cartão verde é a ordem de montagem: o case que o cliente comprou. Ela junta as peças das OPs de injeção com os componentes comprados. É outra OP, de outro posto.'),
]

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
    t('product-side', 'O menu é do módulo', 'Produtos tem o próprio menu: cadastro, camadas (estoque, estrutura, fiscal) e a homologação. Ele não divide espaço com os outros módulos da área.'),
    t('product-list', 'Lista feita para milhares de itens', 'A faixa acima da tabela filtra o tipo: todos, produto acabado, matéria-prima e os demais. Busque por código, descrição, EAN ou NCM e refine situação, classificação ou pendência. Marque vários itens para agir em lote.'),
    t('new-record', 'Um código por item', 'O item nasce em rascunho, com código sequencial e sem significado. O sistema avisa se já existe descrição parecida. Rascunho não entra em pedido, compra nem produção.'),
  ],
  '/produtos/homologacao': [
    t('product-life', 'Filas em vez de quadro', 'Cada fila mostra um tipo de trabalho: o que espera a sua aprovação, rascunhos, exceções de campo-chave, ativos com cadastro incompleto, bloqueados e obsoletos com saldo.'),
  ],
  '/ajuda/manual': [
    t('manual-index', 'Manual do sistema', 'Cada capítulo cobre uma área e cada seção explica um processo: passo a passo, regras, quem participa e o atalho para a tela.'),
    t('manual-toc', 'Índice numerado', 'Abra e feche os capítulos e vá direto a uma seção. A seção aberta fica destacada.'),
    t('manual-search', 'Busca', 'Procure qualquer palavra, como “lote”, “garantia” ou “orçamento”. Acentos não importam.'),
  ],
  '/pessoas': [
    t('org-chart', 'Organograma', 'Cada setor tem gestor e centro de custo. Clique em um setor para filtrar as pessoas dele.', 'close'),
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
    t('demand-actions', 'Três caminhos', 'Atender pelo estoque dá baixa e cancela a previsão. Gerar pedido usa a previsão já criada pela demanda, sem duplicá-la. Em serviço, Concluir gera o contas a pagar e o realizado espera o pagamento do Omie.', 'demand'),
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
    t('record-list', 'O projeto junta tudo', 'Marcos, demandas, compras, orçamento e títulos ficam na mesma ficha. O guia entra nela agora.', 'close'),
    t('new-record', 'Novo projeto', 'O tipo escolhido cria os marcos padrão. O valor informado entra no orçamento anual de P&D e cria uma previsão rastreável do projeto.', 'close'),
    t('project-actions', 'Pedir material ou serviço', 'Os dois botões abrem uma demanda já vinculada ao projeto, com categoria, período e custo estimado para o orçamento.', 'project'),
    t('project-milestones', 'Marcos com responsável', 'Marque o marco para concluí-lo. O atraso aparece em vermelho. Quando todos estão concluídos, o projeto encerra. Dá para incluir um marco novo aqui embaixo.', 'project'),
    t('project-costs', 'Orçamento e títulos do projeto', 'A previsão mostra custos ainda abertos. O realizado só aparece quando o Omie confirma o pagamento; os títulos de origem abrem daqui.', 'project'),
  ],
  '/orcamentos': [
    t('budget-tabs', 'Três visões do controle', 'Visão geral só acompanha. Ações decide nota sem vínculo e saldo excedido. Configurações informa o ano, o limiar e o que acontece com saldo negativo.', 'close'),
    t('budget-tab-acoes', 'Quem decide o quê', 'O sino avisa e, ao clicar na notificação, abre esta aba. A linha mostra o tipo da ação, sem o código. O Financeiro e o Administrador reclassificam o pagamento retido e ligam a nota que chegou sem documento.', 'close'),
    t('budget-tab-configuracao', 'O ano na linha', 'O valor do ano é editado direto na coluna, sem motivo. O grupo e a categoria macro mostram a soma. Inativar também inativa a categoria no Omie.', 'close'),
    t('budget-summary', 'A fatia do período', 'Os cartões usam a lente escolhida acima, na ordem orçamento, realizado pago e previsão aberta. No mês, o orçamento é 1/12 do ano. O grupo começa em todos e também mostra o uso.', 'close'),
    t('record-list', 'Desvio no chip', 'O valor fica num chip verde quando ainda cabe, amarelo no limiar e vermelho acima de 100%. A seta abre as subcategorias. Clique na linha para ver os lançamentos.', 'close'),
    t('budget-detail', 'A nota e de onde ela veio', 'O realizado é a nota do Omie. A linha diz a compra, o projeto ou a ordem. Sem esse vínculo, a nota já está no custo e o Financeiro liga o documento em Ações.', 'budget'),
    t('budget-adjust', 'Valor do ano', 'Na coluna Orçamento, o Financeiro e o Administrador gravam o ano ao sair do campo. Não há motivo. O limiar e o saldo negativo ficam ao lado.', 'close'),
  ],
  '/contas-pagar': [
    t('aging', 'Vencimentos', 'Saldo em aberto por faixa de prazo. Compra recebida e serviço de terceiro concluído geram o título sozinhos.', 'close'),
    t('record-list', 'A linha abre o título', 'Clique para ver quem gerou o valor, baixar ou renegociar. O guia abre um título agora.', 'close'),
    t('title-actions', 'Baixar ou renegociar', 'Registrar pagamento simula o evento vindo do Omie e transforma a previsão em realizado pago. Renegociar pede a nova data e o motivo. Fiscal, banco e a baixa oficial continuam no Omie.', 'title'),
    t('title-origin', 'Quem gerou este título', 'A compra, o serviço, o projeto e o orçamento de origem. Cada um abre a ficha correspondente.', 'title'),
  ],
  '/contas-receber': [
    t('aging', 'Vencimentos', 'Saldo a receber por faixa de prazo. O faturamento da venda e a assistência cobrável geram o título sozinhos.', 'close'),
    t('record-list', 'A linha abre o título', 'Clique para ver o pedido ou o chamado de origem, baixar ou renegociar.', 'close'),
    t('title-actions', 'Receber ou renegociar', 'Registrar recebimento dá baixa operacional e confere com o Omie. Renegociar pede a nova data e o motivo. A cobrança bancária continua no Omie.', 'title'),
    t('title-origin', 'Quem gerou este título', 'O pedido faturado ou o chamado de assistência, com o cliente e os outros títulos dele.', 'title'),
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
    t('purchase-orders', 'Pedidos de compra', 'Clique num pedido para abrir a ficha: cotação, aprovação, recebimento e o título que ele gera. O guia entra num pedido agora.', 'close'),
    t('po-flow', 'Aprovar formaliza, receber gera o título', 'Aprovar envia o pedido ao fornecedor sem criar outra previsão. Receber o saldo dá entrada no estoque, conclui a demanda e gera o contas a pagar. O realizado pago só nasce quando o Omie confirma o pagamento.', 'purchase'),
    t('po-quotes', 'Escolher a cotação', 'Antes da aprovação, escolha o fornecedor. Preço e prazo do pedido passam a ser os da cotação escolhida.', 'purchase'),
    t('po-links', 'Demanda, projeto e categoria', 'A demanda de origem, o projeto, a categoria do mês e o título a pagar. Cada linha abre o registro correspondente.', 'purchase'),
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
