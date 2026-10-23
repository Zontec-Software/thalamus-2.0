# Contrato futuro do backend — Orçamentos

Este documento registra o schema `t2_orcamentos` dentro do `thalamus-2-core`, para quando Finanças for evoluída. Não define a ordem do produto: cadastros, operação, compras e vendas seguem funcionando no frontend até a vez de cada um. Login, empresa e permissão ficam no schema `t2_core`. O mockup de Finanças tem o DRE e Orçamentos, com os centros de custo como aba de Orçamentos. Contas a pagar e contas a receber aparecem no menu como abas em estruturação, sem dado: o título continua no Omie até elas serem desenhadas junto com Gestão de contratos e Ativos. O mockup continua sendo a referência funcional. Cada registro pertence a uma empresa, e a visão de grupo econômico é apenas consolidada e autorizada, conforme `docs/multitenancy.md`.

## Recursos

- `budget-groups`: grupos confirmados da taxonomia (02 a 05 no documento formal; 01 Receita e 09 CAPEX já existem no mockup e ainda precisam ser levados ao documento; 06 a 08 e 10 pendentes). Não são criados pela tela. Pertencem ao tenant.
- `budget-categories`: código gerado pelo servidor na sequência do grupo ou da categoria pai, nome único por nível dentro do tenant, grupo, categoria pai opcional (no máximo dois níveis), natureza (`Receita` ou `Despesa`, derivada do grupo), marcação de CAPEX e situação. A categoria não tem responsável; quem responde é o responsável de cada centro com fatia.
- `budgets`: chave única `tenant_id + category_id + period` (`YYYY`), somente para categoria sem pai, valor informado, distribuição mensal opcional (12 valores cuja soma é o valor do ano; sem ela, a lente divide em partes iguais), limiar de alerta e regra de bloqueio.
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
8. Cruzar o limiar cria uma ocorrência por categoria, mês e limiar. Ela avisa o responsável de cada centro com fatia nas contas da categoria e o Financeiro. Se parte do valor não tem centro, os usuários do Financeiro entram entre os avisados. O ciente é aceito de um usuário avisado, do Financeiro ou do Administrador; outro usuário recebe erro. Voltar abaixo do limiar encerra a ocorrência.
9. A categoria que recebe valor distribui o ano entre centros de custo da mesma empresa, num modo só: porcentagem ou valor. A distribuição é gravada na própria conta, junto com o valor do ano; não há uma segunda lista no centro. Sem distribuição, o servidor propõe a participação de cada centro no realizado da categoria no ano anterior, e a pessoa confirma. A soma pode ficar abaixo do ano; o restante fica com o Financeiro. A soma não pode passar do ano. Linha zerada não entra. Sem linhas, a distribuição some. Centro inativo ou de outra empresa não entra. Categoria com subcategoria não distribui: o valor dela é a soma. O centro de custo é um cadastro da empresa (código, nome, responsável e situação), independente do setor. O responsável é um usuário ativo da empresa e responde pela fatia do centro em cada conta. O setor guarda um código de centro padrão por empresa (`sector_id + tenant_id → code`).
10. O DRE é uma leitura entre dois meses do mesmo ano, da empresa ou da soma autorizada do grupo: seções no formato da referência (receita, deduções, custos, variáveis, fixas, EBITDA, premiação, depreciação, não operacionais, lucro e CAPEX fora do resultado). Depreciação sai dos ativos, proporcional aos meses. A premiação estimada usa a nota calculada com os mesmos fatos dos indicadores. Contas ainda sem módulo ficam zeradas. A leitura em frases do período sai dos mesmos números e substitui a antiga tela Leitura financeira.
10. Recebimento físico e conclusão de serviço não criam realizado. A nota do Omie é a fonte do custo. Sem o documento de origem, o Financeiro vincula na mão. Compras, projetos e as outras origens passarão a enviar esse vínculo.
11. A visão geral acompanha custo, despesa e investimento (grupos 03, 04, 05 e 09) e não armazena totais derivados. Receita e dedução são planejadas à parte e lidas no DRE. Depreciação orçada sai dos ativos; a categoria correspondente classifica o lançamento e não recebe um segundo valor. Conta sem orçado, realizado e previsão no intervalo não entra nessa visão. A origem do desvio de uma conta agrupa previsão aberta e realizado do intervalo pelo centro do lançamento e compara com a fatia do centro; lançamento sem centro fica com o Financeiro. A distribuição por centro vale para custo, despesa e investimento.
12. Toda mutação usa o tenant resolvido no servidor a partir da sessão; `tenant_id` nunca é aceito livremente no corpo do request.
13. A visão de grupo econômico soma somente empresas autorizadas e categorias explicitamente mapeadas para uma categoria corporativa. Categoria não mapeada é exibida como não classificada; o saldo e o bloqueio continuam na empresa de origem.

## Pré-requisitos da implementação

A API do 2.0 deve criar antes o módulo Core (empresas, grupos econômicos, usuários, associações e permissões). A implementação exige migrations, policies, form requests, serviços transacionais e consumidor/webhook Omie idempotente, todos com contexto de tenant.

Antes de publicar as rotas, confirmar a taxonomia completa de categorias e subcategorias, o mapeamento das categorias corporativas e o payload real de pagamentos/estornos fornecido pela conta Omie da Roboflex.
