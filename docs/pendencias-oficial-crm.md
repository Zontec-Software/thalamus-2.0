# Pendências do oficial: pacote CRM (novembro de 2026)

O mockup recebeu a revisão do pacote "CRM Thalamus 2.0". Os repositórios `thalamus2-*` **não foram alterados**. Esta lista diz o que editar em cada um quando a revisão for levada. A regra está em `docs/contrato-backend-crm.md` (seção "Revisão da rotina comercial") e nos testes `src/tests/crm.test.ts` do mockup.

## `thalamus2-core`

- `api/app/Domain/Access/FunctionalityCatalog.php`: registrar `crm.equipe.consultar`, `crm.evidencia.revisar`, `crm.regua.gerir`, `crm.meta.aprovar` e `crm.carteira.gerir` (descrições em `src/domain/access.ts` do mockup).
- Perfil de sistema **Supervisão comercial** (as cinco acima, mais `produtos.comercial.gerir` e `produtos.homologar.comercial`). O Gestor recebe as cinco.
- Papel `Supervisão comercial` na lista de papéis (Gestão de acesso, ficha da pessoa) e em `GET /api/directory`, para o vendedor ser escolhido.
- `web/src/navigation.ts`: abas novas do CRM (Minhas tarefas, Faturamento, Canais, Equipe) quando o remoto as expuser.

## `thalamus2-comercial/api`

- Migrações: `seller_links`, `effort_rules`, `effort_records`, `partner_owners` (vigências), `sale_invoices`, `channel_cases`; colunas novas em `opportunities` (trilha derivada da etapa, soluções, Discovery, início da implantação), `activities` (resumo, participantes, data da interação, registro, referências, anexos, origem, chave de idempotência, próxima ação), `partners` (`commercial_class`), `sales_goals` (versão, quem salvou, quem aprovou, dia de corte), `sales_orders` ou equivalente (canal e dono da conta). Todas com `tenant_id` e `BelongsToTenant`.
- Etapas e probabilidades das duas trilhas; Discovery como bloqueio de Cálculo de custo; `startImplementation`; aceite por trilha (Soluções → Conquistado sem pedido, Locação → contrato sem pedido, Produtos → um pedido com canal e dono da conta; repetido é idempotente). Hoje o oficial só grava `PropostaAceita` no outbox.
- Faturamento por competência (`billingForMonth`): classificação e dedupe, "sem conciliação" distinto de zero, meta só da versão aprovada (quem salva não aprova), unidades MRR, Implantação e Venda avulsa. A nota vem do Omie pela integração, que ainda não existe; até lá, a tela fica sem realizado.
- Esforço: semana segunda a domingo, estados registrada/pendente/validada/devolvida, idempotência por origem, régua com vigência, supervisão que não revisa o próprio registro, visibilidade por escopo (vendedor, equipe, grupo).
- Carteira: histórico de responsável, triagem, classe comercial. Canais: atendimento, vínculo com pedido (mesmo cliente e canal), dedupe por canal + identificador externo.
- Registro por MCP (`registerActivityViaMcp`): endpoint idempotente, ator "ChatGPT via MCP". O conector real é externo.
- Anexos: disco `local` em pasta por empresa, 5 arquivos de 10 MB, formatos da lista do contrato, servidos só com sessão.
- Listas de Cadastros gerais: origens novas (Feira, Integrador, Mercado Livre) e as soluções Zontec.
- Migração do CRM antigo (`src/domain/crmMigration.ts`): Desenvolvimento → Levantamento com demanda; Elaboração → proposta em rascunho; o uso Ganho, Perda, Suspensão ou Cancelamento decide o desfecho. Fica como comando de importação, rodado uma vez por empresa.
- Testes em `api/tests/Feature` para cada regra acima.

## `thalamus2-comercial/web`

- Copiar de `src/views/crm`: `CrmLayout`, `CrmDashboardView`, `CrmPipelineView`, `OpportunityListView`, `OpportunityPage`, `NewOpportunityModal`, `ActivityEvidenceModal`, `McpRecordModal`, `EffortWeekCard`, `BillingView`, `MyTasksView`, `ChannelsView`, `TeamView`, `shared.ts`; e `PartnersView.vue` (classe comercial e responsável da carteira).
- Rotas novas: `/crm/tarefas`, `/crm/faturamento`, `/crm/canais`, `/crm/equipe`.
- Adaptador `web/src/stores/comercial.ts`: ações e estado novos com os nomes da store do mockup (`completeActivity`, `saveDiscovery`, `startImplementation`, `reviewEffort`, `correctEffort`, `saveSellerLink`, `saveEffortRule`, `assignPartnerOwner`, `setCommercialClass`, `createChannelCase`, `answerChannelCase`, `linkChannelOrder`, `registerActivityViaMcp`, `approveSalesGoal`, `crmSellers`).
- Domínio local: `crmEffort.ts`, `crmRoutine.ts` (só leituras que a tela precisa) e `opportunityIsOpen`/`opportunityIsWon` em lugar de comparar com `'Ganho'`.
- Tons de status (`utils/format.ts`): Discovery, Cálculo de custo, Demonstração, Conquistado, Implantação, Conciliada, Parcial, Sem conciliação, Validada, Em conferência, Devolvida, Registrada, Respondido.
- Escondido até haver dono: o que depende de Vendas, Compras, Almoxarifado, Expedição, Projetos e Demandas, como no contrato atual. Agenda do Google, Meet e ChatGPT continuam simulados.
- Manual e guias: copiar as seções do CRM de `src/help/manual.ts` e os passos `/crm/*` de `src/tour/steps.ts`.

## Outros módulos que leem o CRM

- `thalamus2-pessoas`: papel `Supervisão comercial` na ficha e na criação de conta (`CoreAccounts`).
- `thalamus2-engenharia`: nada além de `GET /api/sellable-items` já usado.
- `thalamus2-financas`: nada. Faturamento do CRM não é orçamento.
- `thalamus2-ui`: tons de status novos, se o pacote compartilhado tiver o mapa.

## Decisões em aberto (sem número aprovado, a API não inventa)

- Meta de parceiros ativos tratados do perfil de canais ("A calibrar") e a régua de cobertura por classe comercial.
- Valores de partida da régua de cada perfil: sugestão do pacote, a confirmar com a gestão.
- Perfil Paraguai do pacote: fora desta entrega; a Zontec usa a trilha Soluções dentro da própria empresa.
