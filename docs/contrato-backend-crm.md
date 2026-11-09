# Contrato do backend — CRM

Repositório `thalamus2-comercial`: API em `api/` (schema `t2_comercial`) e tela em `web/`. O CRM divide o schema com Parceiros (`docs/contrato-backend-parceiros.md`): o cliente da oportunidade é o parceiro com papel Cliente ativo, no mesmo schema. Produtos vêm da API de Engenharia. A referência funcional é o mockup: `src/domain/enterprise.ts` (seção CRM e Propostas), `src/domain/crmBrief.ts` e `src/views/crm`.

## Recursos

| Recurso | Campos principais |
| --- | --- |
| `opportunities` | cliente (parceiro), título, responsável (conta do core), etapa, probabilidade, valor, MRR, temperatura, tipo (`Venda`, `Locação`), previsão de fechamento, origem, contato, telefone, e-mail, próxima ação, observação, motivo da perda |
| `activities` | oportunidade, tipo (`Ligação`, `E-mail`, `Reunião`, `Tarefa`), data e hora, texto, pauta, setor, concluída |
| `proposals` | oportunidade, cliente, desconto (%), validade, data sugerida, condição de pagamento, situação (`Rascunho`, `Enviada`, `Aceita`, `Recusada`), motivo da recusa |
| `proposal-lines` | proposta, produto (id na Engenharia), descrição, quantidade, preço unitário |
| `sales-goals` | ano, valor, doze meses |

## Endpoints

- `GET|POST /api/opportunities` (`?group=1` lê o grupo autorizado; `?status=` filtra), `GET|PATCH /api/opportunities/{id}` (`PATCH` aceita `partner_id` para trocar o cliente e `vertical`, que grava no cadastro do cliente)
- `POST /api/opportunities/{id}/stage`, `POST /api/opportunities/{id}/advance`, `POST /api/opportunities/{id}/lose`
- `POST /api/opportunities/{id}/activities` (`update_status` copia o texto para o status), `POST /api/activities/{id}/toggle`, `GET /api/agenda`
- `POST /api/opportunities/{id}/proposals`, `GET /api/proposals` (`?group=1`), `GET|PATCH /api/proposals/{id}`
- `POST /api/proposals/{id}/lines`, `PATCH|DELETE /api/proposals/{id}/lines/{line}`
- `POST /api/proposals/{id}/advance`, `POST /api/proposals/{id}/reject`
- `GET /api/crm/dashboard?year=YYYY` (funil por etapa, ganho, perdido, meta)
- `GET /api/crm/scope` (se a sessão pode ler o grupo e quais empresas), `GET /api/sales-goals?year=&group=1`, `PUT /api/sales-goals/{year}`

## Permissões

| Funcionalidade | O que libera |
| --- | --- |
| `modulo.crm.consultar` | Ler oportunidades, agenda, propostas, metas e painel |
| `modulo.crm.gerir` | Criar e alterar oportunidades, atividades e propostas, e gravar a meta comercial do ano |
| `crm.desconto.aprovar` | Aprovar ou devolver proposta Em aprovação (desconto acima do limite). Quem pediu não aprova |
| `crm.consultar_consolidado` | Ler oportunidades, propostas e metas das empresas do grupo que a sessão pode ler. Só leitura |

## Regras

1. Etapas: Novo contato, Qualificação, Levantamento, Proposta, Negociação, Ganho (100%), Perdido (0%). Mudar a etapa atualiza a probabilidade. Origem, motivo de perda e motivo de recusa vêm das listas de Cadastros gerais (Indicação, Site, Prospecção, Cliente existente, Outro; Preço, Prazo, Solução, Concorrente, Cancelamento, Outro; Preço, Prazo, Solução, Concorrente, Outro).
2. Oportunidade nova exige título e cliente com papel Cliente ativo. Nasce em Prospecção, Frio, Venda.
3. Oportunidade encerrada (Ganho ou Perdido) não é editada.
4. Ganho só vem da proposta aceita. Perdido só com motivo; as propostas em andamento são canceladas com o mesmo motivo.
5. Atividade exige texto. A próxima ação da oportunidade é a primeira atividade pendente em ordem de data.
6. Proposta só em oportunidade aberta. Criar proposta leva a oportunidade para Proposta, se estiver antes.
7. Só rascunho é editado. Situações: Rascunho, Em aprovação, Enviada, Aceita, Recusada, Vencida, Cancelada, com número de versão. Desconto acima de 15% leva a proposta para Em aprovação; outra pessoa com `crm.desconto.aprovar` aprova (envia) ou devolve ao rascunho com motivo. Enviada passa a Vencida quando a validade termina. Nova versão sai de enviada, recusada ou vencida, nasce em rascunho e cancela a anterior. Cancelar exige motivo. Quantidade maior que zero e preço não negativo. A linha de produto usa o produto liberado para venda na Engenharia; o preço padrão é o da Engenharia.
8. O valor da oportunidade acompanha o total da proposta em edição: soma de quantidade × preço, menos o desconto.
9. Enviar exige ao menos uma linha. Aceitar exige ao menos um produto, proposta dentro da validade, e leva a oportunidade para Ganho. O aceite cria o **pedido de venda no Thalamus**, aguardando análise, com as linhas e a revisão liberada de cada produto. A confirmação do pedido o envia ao Omie quando a empresa usa o Omie e a fonte de Pedido de venda está decidida; sem Omie, o pedido fica só no Thalamus.
10. Recusar exige motivo e vale para proposta enviada (vira Recusada) ou em aprovação (volta a Rascunho).
11. Meta: doze valores não negativos; sem meses, o ano é dividido por igual e o último mês absorve o resto.

## Integrações da primeira entrega

- **Vendedor:** conta do core, escolhida em `GET /api/directory` do core (contas ativas da empresa, sem e-mail). A oportunidade guarda `owner_user_id` e o nome no momento da escolha. Sem escolha, o vendedor é quem cria.
- **Cliente:** `GET /api/partners?role=Cliente&active=1` abre com `modulo.crm.consultar`, sem exigir o cadastro de parceiros. Criar cliente na mesma tela exige `modulo.parceiros.gerir`.
- **Produto:** a Engenharia expõe `GET /api/sellable-items?q=` e `GET /api/sellable-items/{id}` só com sessão (`id`, `code`, `description`, `unit`, `price`; 404 quando o item não está liberado para venda). O CRM lê pelo `InternalClient` com o token do usuário. Fora do ar, a linha de produto é recusada com `dependency_unavailable`. A linha guarda `list_price`, o preço da Engenharia no momento, para a tela mostrar quanto a negociação se afastou da tabela.
- **Pedido:** o aceite grava `PropostaAceita` no `kernel_outbox` na mesma transação, com parceiro (documento e razão social), condição de pagamento, data sugerida, total e linhas (`product_id`, `product_code`, quantidade e preço). A publicação para o Omie é da integração, ainda não implementada.
- **Status:** a oportunidade tem `status_note` (situação atual, texto livre). Sem status, sem ação pendente ou com previsão vencida, a tela mostra o sinal de atenção.

- **Grupo:** `?group=1` usa `readableTenantIds('crm.consultar_consolidado')` da sessão. A linha de outra empresa vem com `tenant_id` e `own=false`, sem histórico. Toda escrita continua no tenant ativo; registro de outra empresa responde 404.

## Pendente para o oficial

Revisado no mockup em novembro de 2026 e ainda não levado ao `thalamus2-comercial`: novas etapas e listas, aprovação de desconto, vencimento, versão e cancelamento da proposta, pedido nascido no Thalamus (hoje o oficial grava `PropostaAceita` no outbox), e `crm.desconto.aprovar` no `FunctionalityCatalog.php` do core.

## Entrega oficial

As telas de `thalamus2-comercial/web` são cópias das de `src/views/crm` e da gaveta `src/components/records/ProposalRecord.vue`, com as mesmas rotas (`/crm`, `/crm/oportunidades`, `/crm/funil`, `/crm/propostas`, `/crm/agenda`, `/crm/oportunidade/:id`) e o mesmo `meta`. Só a origem dos dados muda, por um adaptador (`web/src/stores/comercial.ts`) com os nomes da store do mockup.

- **Painel:** igual. A meta grava na empresa ativa; o seletor de grupo só aparece com `crm.consultar_consolidado` e a soma é leitura.
- **Oportunidades:** igual, sem o CAC no cartão de prévia.
- **Nova oportunidade:** igual, com a empresa fixa na ativa e sem o botão de áudio. O relato é lido por comparação de texto, como no mockup.
- **Ficha da oportunidade:** igual, sem CAC, sem áudio e com as ações Tarefa, Reunião, E-mail e Ligação. O setor da tarefa vem dos setores do diretório do core. Oportunidade de outra empresa do grupo abre só para consulta.
- **Proposta (gaveta):** igual para produto, desconto, condições, envio, aceite e recusa. Mostra total, validade e entrega sugerida; o aceite mostra que o pedido aguarda o Omie.

Escondido até o módulo dono ser oficial: CAC, demanda, PAP e projeto a partir da oportunidade; margem, custo e prazo de fabricação dos produtos; kit virtual; estoque disponível; linha de serviço; link do pedido de venda. Simulação do mockup que não foi levada: agenda Google e gravação do Meet, gravação de áudio, anexos.
