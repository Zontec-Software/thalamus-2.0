# Contrato futuro do backend — Orçamentos

Este documento registra o schema `t2_orcamentos` dentro do `thalamus-2-core`, para quando Finanças for evoluída. Não define a ordem do produto: cadastros, operação, compras e vendas seguem funcionando no frontend até a vez de cada um. Login, empresa e permissão ficam no schema `t2_core`. Contas a pagar e contas a receber pertencem a este mesmo schema. O mockup continua sendo a referência funcional. Cada registro pertence a uma empresa, e a visão de grupo econômico é apenas consolidada e autorizada, conforme `docs/multitenancy.md`.

## Recursos

- `budget-groups`: grupos confirmados da taxonomia (02 a 05 hoje; 06 a 10 pendentes). Não são criados pela tela. Pertencem ao tenant.
- `budget-categories`: código gerado pelo servidor na sequência do grupo ou da categoria pai, nome único por nível dentro do tenant, grupo, categoria pai opcional (no máximo dois níveis), papel responsável e situação.
- `budgets`: chave única `tenant_id + category_id + period` (`YYYY`), somente para categoria sem pai, valor informado, limiar de alerta e regra de bloqueio.
- `budget-entries`: ledger imutável de previsão e realizado pago, com valor original, saldo aberto, valor retido, origem, número da nota, vínculo opcional com o documento do Thalamus, projeto, centro de custo e eventos. Pode apontar para subcategoria; os totais somam na categoria pai. Pertence ao tenant.
- `budget-exceptions`: fila do tenant para estouro de saldo, ausência/multiplicidade de categoria e falhas de sincronização.
- `budget-alerts`: ocorrência de alerta ou bloqueio do tenant, com limiar, uso, papéis avisados, situação e quem ficou ciente.
- `omie-payment-events`: evento externo idempotente por tenant de pagamento ou estorno.
- `budget-audits`: valor anterior, novo valor, usuário, data/hora, tenant e motivo (lista fechada, com texto livre só em "Outro").
- `group-budget-categories` e `tenant-category-mappings`: dimensão corporativa e mapeamento explícito para consolidar categorias de empresas do grupo.

## Endpoints mínimos

- `GET /api/budget-categories` e `POST /api/budget-categories` no tenant ativo
- `PATCH /api/budget-categories/{id}`
- `GET /api/budgets?period=YYYY-MM&group=...&category_id=...`
- `PUT /api/budgets/{category_id}/{period}`
- `PATCH /api/budgets/{id}/configuration`
- `GET /api/budget-entries` com filtros por período, grupo, categoria, tipo, origem e projeto
- `POST /api/budget-forecasts` e `POST /api/budget-forecasts/{source_module}/{source_id}/cancel`
- `GET /api/budget-alerts` e `POST /api/budget-alerts/{id}/acknowledge`
- `GET /api/budget-exceptions` e `POST /api/budget-exceptions/{id}/decision` (com `category_id` quando for reclassificação)
- `POST /api/integrations/omie/payment-events`
- `GET /api/economic-groups/{group_id}/budgets?period=YYYY` para consulta consolidada, exigindo a permissão `consultar_consolidado`

Todo request mutável exige validação explícita. Erros usam `message`/`error`, conforme o padrão do backend.

## Regras transacionais

1. O Financeiro mantém categorias, orçamento e configuração e trata pagamentos retidos. O Gestor libera ou recusa lançamento acima do saldo. O Administrador faz as duas coisas. O Financeiro não autoriza a exceção de saldo. Categorias conciliam com o Omie nos dois sentidos pela chave externa. O valor é anual e fica na subcategoria; a macro guarda a soma. Um total no grupo ou na macro é dividido em partes iguais. Mês, trimestre e semestre são consultas proporcionais. O bloqueio usa o saldo do ano. O orçamento permanece no Thalamus.
2. Uma previsão acima do saldo, com bloqueio ativo, é gravada como retida (fora do saldo) e abre exceção. Compra e contratação da origem ficam bloqueadas até a liberação.
3. Liberar aplica o valor retido; recusar cancela a previsão retida. Cancelar a origem encerra a exceção.
4. Reclassificar um pagamento retido reprocessa o evento Omie com a categoria escolhida e cria o realizado na mesma transação.
5. Pagamento reduz o saldo aberto da previsão e cria realizado pago. Estorno cria realizado negativo e reabre a previsão até o valor original.
6. O id externo do evento Omie deve ter índice único por tenant. Repetição retorna o resultado existente sem novo efeito.
7. Evento Omie, ledger, título, alerta e auditoria são persistidos na mesma transação.
8. Cruzar o limiar cria uma ocorrência por categoria, mês e limiar, avisando o responsável da categoria e o Financeiro. Voltar abaixo do limiar encerra a ocorrência.
9. Recebimento físico e conclusão de serviço não criam realizado. A nota do Omie é a fonte do custo. Sem o documento de origem, o Financeiro vincula na mão. Compras, projetos e as outras origens passarão a enviar esse vínculo.
10. A visão geral é calculada por grupo, sem somar deduções da receita com custos, e não armazena totais derivados.
11. Toda mutação usa o tenant resolvido no servidor a partir da sessão; `tenant_id` nunca é aceito livremente no corpo do request.
12. A visão de grupo econômico soma somente empresas autorizadas e categorias explicitamente mapeadas para uma categoria corporativa. Categoria não mapeada é exibida como não classificada; o saldo e o bloqueio continuam na empresa de origem.

## Pré-requisitos da implementação

A API do 2.0 deve criar antes o módulo Core (empresas, grupos econômicos, usuários, associações e permissões). A implementação exige migrations, policies, form requests, serviços transacionais e consumidor/webhook Omie idempotente, todos com contexto de tenant.

Antes de publicar as rotas, confirmar a taxonomia completa de categorias e subcategorias, o mapeamento das categorias corporativas e o payload real de pagamentos/estornos fornecido pela conta Omie da Roboflex.
