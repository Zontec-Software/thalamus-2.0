# Contrato futuro do backend — Orçamentos

Este documento registra o schema `t2_orcamentos` dentro do `thalamus-2-core`, para quando Finanças for evoluída. Não define a ordem do produto: cadastros, operação, compras e vendas seguem funcionando no frontend até a vez de cada um. Login, empresa e permissão ficam no schema `t2_core`. O mockup de Finanças tem o DRE e Orçamentos. O orçamento destina o valor da categoria a setores utilizadores; o centro de custo permanece nas demandas, nas compras e no cadastro do setor, fora da tela de Orçamentos. Contas a pagar e contas a receber aparecem no menu como abas em estruturação, sem dado: o título continua no Omie até elas serem desenhadas junto com Gestão de contratos e Ativos. O mockup continua sendo a referência funcional. Cada registro pertence a uma empresa, e a visão de grupo econômico é apenas consolidada e autorizada, conforme `docs/multitenancy.md`.

## Recursos

- `budget-groups`: grupos confirmados da taxonomia (01 Receita, 02 Deduções, 03 Custos, 04 Despesas variáveis, 05 Despesas fixas e 09 CAPEX) mais os grupos criados pela tela, com código de dois dígitos e nome livre (por exemplo `06. Despesas com pessoal`). Pertencem ao tenant.
- `budget-categories`: código gerado pelo servidor na sequência do grupo ou da categoria pai, nome único por nível dentro do tenant, grupo, categoria pai opcional (no máximo dois níveis), natureza (`Receita` ou `Despesa`, derivada do grupo), marcação de CAPEX, pessoa responsável, setor executor e situação.
- `budgets`: chave única `tenant_id + category_id + period` (`YYYY`), somente para categoria sem pai, valor informado, destinação por setor (`sector_id + amount`; a soma pode ficar abaixo do valor e não pode passar), distribuição mensal opcional (12 valores cuja soma é o valor do ano; sem ela, a lente divide em partes iguais), limiar de alerta e regra de bloqueio.
- `budget-entries`: ledger imutável de previsão e realizado pago, com valor original, saldo aberto, valor retido, origem, número da nota, vínculo opcional com o documento do Thalamus, projeto, centro de custo e eventos. Pode apontar para subcategoria; os totais somam na categoria pai. Pertence ao tenant.
- `budget-exceptions`: fila do tenant para estouro de saldo, ausência/multiplicidade de categoria e falhas de sincronização.
- `budget-alerts`: ocorrência de alerta ou bloqueio do tenant, com limiar, uso, papéis avisados, situação e quem ficou ciente.
- `omie-payment-events`: evento externo idempotente por tenant de pagamento ou estorno.
- `budget-audits`: valor anterior, novo valor, usuário, data/hora, tenant e motivo (lista fechada, com texto livre só em "Outro").
- `group-budget-categories` e `tenant-category-mappings`: dimensão corporativa e mapeamento explícito para consolidar categorias de empresas do grupo.

## Endpoints mínimos

- `GET /api/budget-categories` e `POST /api/budget-categories` no tenant ativo
- `PATCH /api/budget-categories/{id}`
- `GET /api/budgets?year=YYYY&from_month=MM&to_month=MM&group=...&category_id=...` (intervalo de meses do mesmo ano; a fatia segue a distribuição mensal)
- `GET /api/dre?year=YYYY&from_month=MM&to_month=MM&scope=tenant|group` (leitura; `group` exige `consultar_consolidado`)
- `GET /api/budgets/{category_id}/{period}/cost-center-suggestion` e `PUT /api/budgets/{category_id}/{period}/cost-centers`
- `PUT /api/budgets/{category_id}/{period}`
- `PATCH /api/budgets/{id}/configuration`
- `GET /api/budget-entries` com filtros por período, grupo, categoria, tipo, origem e projeto
- `POST /api/budget-forecasts` e `POST /api/budget-forecasts/{source_module}/{source_id}/cancel`
- `GET /api/budget-alerts` e `POST /api/budget-alerts/{id}/acknowledge`
- `GET /api/budget-exceptions` e `POST /api/budget-exceptions/{id}/decision` (com `category_id` quando for reclassificação)
- `POST /api/integrations/omie/payment-events`
- `GET /api/economic-groups/{group_id}/budgets?period=YYYY` para consulta consolidada, exigindo a permissão `consultar_consolidado`
- `POST /api/budgets/planning/growth` aplica um percentual sobre o realizado do ano anterior a um conjunto de categorias do tenant ativo
- `POST /api/budgets/planning/revenue-target` calcula o percentual da meta de faturamento e aplica a todas as categorias ativas do tenant
- `PUT /api/budgets/{category_id}/{period}/monthly` grava a distribuição mensal, rejeitando soma diferente do valor do ano
- `POST /api/budgets/planning/seasonality` reparte o ano de cada categoria pelo peso mensal do realizado do ano anterior; categoria sem orçamento ou sem base fica como está
- `POST /api/economic-groups/{group_id}/budgets/planning/growth` e `POST /api/economic-groups/{group_id}/budgets/planning/revenue-target` exigem `consultar_consolidado` e `gerir`; gravam um orçamento por empresa, cada uma sobre o próprio realizado, e não criam lançamento de grupo

Todo request mutável exige validação explícita. Erros usam `message`/`error`, conforme o padrão do backend.

## Regras transacionais

1. O Financeiro mantém categorias, orçamento e configuração e trata pagamentos retidos. O Gestor libera ou recusa lançamento acima do saldo. O Administrador faz as duas coisas. O Financeiro não autoriza a exceção de saldo. Categorias conciliam com o Omie nos dois sentidos pela chave externa. O valor é anual e fica na subcategoria; a macro guarda a soma. Um total no grupo ou na macro é dividido em partes iguais. Mês, trimestre e semestre são consultas proporcionais. O bloqueio usa o saldo do ano. O orçamento permanece no Thalamus.
2. Uma previsão acima do saldo, com bloqueio ativo, é gravada como retida (fora do saldo) e abre exceção. Compra e contratação da origem ficam bloqueadas até a liberação.
3. Liberar aplica o valor retido; recusar cancela a previsão retida. Cancelar a origem encerra a exceção.
4. Reclassificar um pagamento retido reprocessa o evento Omie com a categoria escolhida e cria o realizado na mesma transação.
5. Pagamento reduz o saldo aberto da previsão e cria realizado pago. Estorno cria realizado negativo e reabre a previsão até o valor original.
6. O id externo do evento Omie deve ter índice único por tenant. Repetição retorna o resultado existente sem novo efeito.
7. Evento Omie, ledger, alerta e auditoria são persistidos na mesma transação.
8. Cruzar o limiar cria uma ocorrência por categoria, mês e limiar. Ela avisa a pessoa responsável da categoria e o Financeiro. O ciente é aceito dessa pessoa, do Financeiro ou do Administrador; outro usuário recebe erro. Voltar abaixo do limiar encerra a ocorrência.
9. A categoria que recebe valor destina o ano a setores, em valor. Cada linha exige setor e valor maior que zero. A soma pode ficar abaixo do valor da categoria; o restante não libera demanda. A soma não pode passar. Sem linhas, a destinação some. Categoria com subcategoria não destina: o valor dela é a soma. Receita, dedução e depreciação não recebem utilizador. A pessoa responsável e o setor executor ficam na categoria. Sem categoria aparece para o Financeiro. Sem vínculo aparece para quem está no setor executor. Saldo excedido aparece para a pessoa responsável. O centro de custo continua no lançamento e no padrão do setor, fora desta destinação.
10. O DRE é uma leitura entre dois meses do mesmo ano, da empresa ou da soma autorizada do grupo: seções no formato da referência (receita, deduções, custos, variáveis, fixas, EBITDA, premiação, depreciação, não operacionais, lucro e CAPEX fora do resultado). Depreciação sai dos ativos, proporcional aos meses. A premiação estimada usa a nota calculada com os mesmos fatos dos indicadores. Contas ainda sem módulo ficam zeradas. A leitura em frases do período sai dos mesmos números e substitui a antiga tela Leitura financeira.
10. Recebimento físico e conclusão de serviço não criam realizado. A nota do Omie é a fonte do custo. Sem o documento de origem, o Financeiro vincula na mão. Compras, projetos e as outras origens passarão a enviar esse vínculo.
11. A visão geral acompanha custo, despesa e investimento (grupos que não são receita nem dedução) e não armazena totais derivados. Financeiro e Administrador veem todas as categorias; os demais veem só as contas em que são o responsável. Receita e dedução são planejadas à parte e lidas no DRE. Depreciação orçada sai dos ativos; a categoria correspondente classifica o lançamento e não recebe um segundo valor. Conta sem orçado, realizado e previsão no intervalo não entra nessa visão. A origem do desvio de uma conta agrupa previsão aberta e realizado do intervalo pelo setor do lançamento e compara com o valor destinado ao setor; o que não tem utilizador não libera demanda. O DRE mostra o pago por setor.
12. Toda mutação usa o tenant resolvido no servidor a partir da sessão; `tenant_id` nunca é aceito livremente no corpo do request.
13. A visão de grupo econômico soma somente empresas autorizadas e categorias explicitamente mapeadas para uma categoria corporativa. Categoria não mapeada é exibida como não classificada; o saldo e o bloqueio continuam na empresa de origem.

## Pré-requisitos da implementação

A API do 2.0 deve criar antes o módulo Core (empresas, grupos econômicos, usuários, associações e permissões). A implementação exige migrations, policies, form requests, serviços transacionais e consumidor/webhook Omie idempotente, todos com contexto de tenant.

Antes de publicar as rotas, confirmar a taxonomia completa de categorias e subcategorias, o mapeamento das categorias corporativas e o payload real de pagamentos/estornos fornecido pela conta Omie da Roboflex.
