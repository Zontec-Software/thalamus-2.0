# Contrato futuro do backend — Produtos

Este documento registra o schema `t2_produtos` dentro do `thalamus-2-core`, para quando o cadastro de itens for evoluído. Login, empresa e permissão ficam no schema `t2_core`. O mockup continua sendo a referência funcional (`src/domain/catalog.ts`, `catalogExtensions.ts` e `engineering.ts`). Cada registro pertence a uma empresa (tenant), conforme `docs/multitenancy.md`. Código igual em empresas diferentes não significa o mesmo item.

## Recursos

- `items`: núcleo do item (código sequencial imutável por tenant, descrição, tipo `PA|SE|MP|CP|EM|KF|KT|SV|IM|FE`, unidade base, classe, situação do ciclo de vida, versão do registro para concorrência otimista).
- `item-layers`: uma linha por camada que o tipo usa (estoque, unidades, manufatura, ferramental, comercial, fiscal, mídia, projetos), com JSON validado por camada ou tabelas próprias, à escolha da implementação.
- `item-classes`: árvore livre de classificação, nome único por nível no tenant.
- `class-attributes`: definição do atributo no nó (`key` igual ao rótulo, tipo `Texto|Número|Lista`, opções, unidade, obrigatório, eixo de variação). Herdado pelos nós filhos.
- `item-attribute-values`: valor por item e chave. A chave precisa existir na classe do item ou acima.
- `product-revisions`: versão A, B, C… com situação (`Rascunho|Programada|Liberada|Substituída`), vigência, checklist, linhas da estrutura (componente, quantidade, perda) e o **roteiro da versão**. Pode apontar para uma mudança de engenharia.
- `revision-route-steps`: sequência, nome, posto, minutos por unidade, preparação, equipe, ferramental (`tool_item_id`), primeira peça e instruções.
- `item-tooling`: dados do item `FE` (tipo, cavidades nominais e ativas, ciclo, peso do golpe, postos compatíveis, vida útil, valor, dono `Roboflex|Cliente`, nome do cliente, ativo de manutenção vinculado).
- `item-packaging-levels`: nível (`Unidade|Caixa|Master|Palete`), unidades, item de embalagem, GTIN, peso e medidas.
- `engineering-changes`: ECO com título, motivo, prioridade, etapa (`Solicitada|Em análise|Aprovada|Implementada|Recusada`), itens, destino do estoque, data de efetividade, aprovação, implementação e histórico.
- `item-fiscal-sync`: situação (`Sincronizado|Enviar ao Omie|Conflito`), data, autor e o retrato remoto (NCM, CEST, origem, Ex-TIPI, cClassTrib) quando há conflito.
- `item-media`: metadados do arquivo em armazenamento de objetos, tipo, ordem, principal, versão da estrutura a que pertence e marca "vai na OP".
- `item-audits`: campo, valor anterior, novo valor, motivo, autor, data/hora e tenant. Mudança vinda do Omie usa o ator `Omie`.

## Endpoints mínimos

- `GET /api/items` com busca, filtros, ordenação e paginação; `POST /api/items`; `PATCH /api/items/{id}/layers/{layer}` com `version` para concorrência
- `GET|POST|PATCH|DELETE /api/item-classes` e `PUT|DELETE /api/item-classes/{id}/attributes/{key}`
- `PUT /api/items/{id}/attributes`
- `POST /api/items/{id}/revisions` (abre rascunho copiando a vigente), `PATCH /api/revisions/{id}/lines`, `PUT|DELETE /api/revisions/{id}/steps/{step_id}`, `POST /api/revisions/{id}/steps/move`, `POST /api/revisions/{id}/steps/copy-from/{item_id}`, `POST /api/revisions/{id}/release`
- `GET /api/revisions/{id}/diff?base={revision_id}`
- `PUT /api/items/{id}/tooling`
- `PUT /api/items/{id}/packaging`
- `GET /api/items/{id}/cost?lot=200` (cálculo derivado, sem gravar)
- `GET|POST /api/engineering-changes`, `PATCH /api/engineering-changes/{id}`, `POST /api/engineering-changes/{id}/items/{item_id}/revision`, `POST /api/engineering-changes/{id}/stage`
- `POST /api/items/{id}/fiscal/push`, `POST /api/items/{id}/fiscal/resolve` (`keep: Thalamus|Omie`)
- `POST /api/integrations/omie/product-events` (webhook de alteração de produto no Omie)

Todo request mutável exige validação explícita e usa o tenant da sessão; `tenant_id` nunca vem do corpo.

## Regras transacionais

1. Só existe uma versão em rascunho por item. Mudar linhas ou roteiro desmarca o checklist.
2. Produto acabado e kit físico não liberam versão com roteiro vazio. Operação com molde exige posto compatível; o tempo por peça é ciclo ÷ cavidades ativas ÷ 60.
3. Versão ligada a uma ECO só é liberada pela implementação da ECO. A aprovação exige o aprovador técnico e um rascunho ligado para cada item com estrutura; a implementação libera todos na data de efetividade, na mesma transação.
4. Salvar o ferramental recalcula o tempo das operações que o usam, nas versões vigentes e nos rascunhos. OPs abertas mantêm o tempo congelado.
5. Atributo obrigatório vazio bloqueia o envio para homologação. Atributo com valor em algum item não pode ser removido. Eixo de variação é fixo na variante.
6. Embalagem: Unidade contém 1; níveis crescentes e múltiplos do anterior; GTIN único no tenant; material do tipo `EM`.
7. Fiscal em mão dupla: alteração local em item não rascunho marca `Enviar ao Omie`; evento do Omie em item sincronizado aplica e audita; evento com envio pendente vira `Conflito` e não sobrescreve nada. O evento tem id externo com índice único por tenant (idempotente).
8. Custo da engenharia é consulta derivada: material (necessidade com perda), máquina (custo-hora do posto), mão de obra (taxa × equipe), preparação rateada no lote e desgaste do ferramental próprio (valor ÷ vida ÷ cavidades ativas).
9. Item, camada, auditoria e evento de integração são persistidos na mesma transação.
10. Alteração de descrição, classificação, unidade base ou NCM de item que já saiu do rascunho só vale depois de aprovada. A solicitação aponta origem externa (OS, OP, PAP, oportunidade ou outro documento), motivo e valores antes/depois. Enquanto pendente, o dado vigente continua e o item pode ser usado. A inativação também é solicitada e aprovada: estoque, ordens e pedidos já abertos não são cancelados; solicitações ainda pendentes são negadas. Item inativo não aceita solicitação nova. O retrato de homologação é leitura, por fornecedor, e só existe em matéria-prima. A convenção do código e os papéis de aprovação continuam pendentes.

## Dependências com outros schemas

- **Produção** congela a revisão e o roteiro na OP, inclusive ferramental e primeira peça.
- **Manutenção** é dona do ativo e do contador de golpes; o item `FE` aponta para o ativo.
- **Omie** recebe o produto ativo e conversa sobre o fiscal em mão dupla, conforme `docs/integracao-omie.md`.

## Pré-requisitos da implementação

Antes de publicar as rotas: módulo Core pronto, taxa de mão de obra e custo-hora dos postos definidos pela Roboflex, payload real do webhook de produto do Omie, consulta real ao cadastro de GTIN (CCG) e armazenamento de objetos para a mídia.
