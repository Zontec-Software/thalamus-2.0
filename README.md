# Thalamus 2.0: ERP operacional Roboflex

Protótipo navegável do ERP integrado da Roboflex (cases robustos para tablets). Ele conecta cadastros, suprimentos, comercial, operações, serviços, gestão e finanças operacionais. O Omie simulado continua dono do pedido aprovado, faturamento e dados fiscais; o Thalamus coordena a execução.

## Executar

Requer Node.js 20.19 ou superior.

```bash
npm install
npm run dev
```

Na primeira vez, um **tour de boas-vindas** apresenta o sistema, e cada tela tem um guia próprio na primeira visita. Os guias podem ser reabertos pelo botão de ajuda (?) no topo ou pela **Central de ajuda**.

## Demonstração publicada

Cada push na `main` publica este mockup em <https://zontec-software.github.io/thalamus-2.0/>. É o mesmo protótipo, sem backend: os dados ficam no navegador de quem abre. O `npm run dev` local continua em http://localhost:8080. No GitHub, a origem das Pages precisa ser **GitHub Actions**.

Os dados são fictícios e ficam salvos no navegador. Para voltar ao cenário inicial, use **Integração Omie → Restaurar demonstração**.

## Áreas

- **Cadastros:** Produtos com camadas por tipo, Pessoas, catálogo de Serviços e Ativos.
- **Suprimentos:** Demandas, Compras e Almoxarifado, incluindo recebimento parcial e estorno de separação.
- **Comercial:** CRM, propostas multilinha, pedidos de Venda e Expedição.
- **Operações:** Planejamento, Produção, Qualidade e Tablet com revisão congelada na OP.
- **Serviços:** Manutenção preventiva/corretiva e Assistência Técnica pós-venda.
- **Gestão:** Indicadores, Projetos e tarefas por papel.
- **Finanças:** DRE (entre dois meses, da empresa ou do grupo, com a leitura do período) e Orçamentos por categoria e setor utilizador. Contas a pagar e a receber estão em estruturação; o título, o banco e a contabilidade ficam no Omie.

Troque o **Perfil** no topo para ver o sistema como PCP, Compras, Almoxarifado, Qualidade, Expedição etc. O menu, as tarefas e as permissões mudam conforme o papel.

### Orçamento integrado

O orçamento é controlado por **categoria + mês**. O valor informado, a previsão operacional de Demandas/OPs/OSs/Projetos e o realizado pago são mantidos separadamente. O realizado só nasce de pagamento confirmado pelo Omie; pagamentos parciais, estornos, idempotência, alertas registrados, previsão retida por falta de saldo e fila de exceções fazem parte do cenário navegável. A árvore tem grupo, categoria e subcategoria. O Financeiro define o orçamento e o valor destinado a cada setor utilizador, e o Gestor libera exceções de saldo. Quem responde pela conta é a pessoa responsável da categoria.

## Tablet do chão de fábrica (`/tablet`)

Simulador do tablet do posto, com um roteiro de teste e os PINs à esquerda e o efeito ao vivo na gestão à direita.

- **Operador**: entra com o nome e o PIN e escolhe o posto (injetora ou célula). Na fila do posto, pode iniciar, apontar peças boas e refugo (com motivo), pausar (com motivo), concluir e chamar o líder.
- **Almoxarifado**: separa o kit bipando cada item, o que libera a OP para o posto. Também confirma o recebimento de compras.
- **Qualidade**: aplica o checklist do lote e aprova, ou reprova, o que abre uma NC e envia o lote para retrabalho.
- **Expedição**: confere volumes e transportadora e expede, o que solicita a NF-e ao Omie.
- **Manutenção**: atende as corretivas. Uma pausa por "Quebra de máquina" abre a OS e bloqueia a máquina.

PINs: operadores `1234`, Carlos (almoxarifado) `4444`, Bruno (líder) `5555`, Fernanda (qualidade) `6666`, Rafael (expedição) `7777`, Diego (manutenção) `8888`.

## Módulo de Produtos

Cada item tem um núcleo comum e camadas que só aparecem para os tipos que precisam delas: estoque e unidades, estrutura e roteiro, ferramental, comercial, fiscal, mídia e projetos. O cadastro passa por homologação multi-papel antes de ser ativado. A ficha do item é uma página de objeto: cabeçalho com indicadores clicáveis e seções agrupadas à esquerda.

- **Estrutura e roteiro versionados** juntos, com vigência e percentual de perda; comparação entre versões; a OP congela a versão usada. O roteiro tem preparação, equipe, ferramental e inspeção de primeira peça.
- **Atributos por classe**, herdados na árvore, obrigatórios para homologar e usados como eixos da grade.
- **Ferramental** (moldes, gabaritos, dispositivos) como item FE: cavidades ativas, ciclo, máquinas compatíveis, vida útil, dono e vínculo com o ativo da manutenção.
- **Mudanças de engenharia (ECO)** em quadro: impacto (saldo, OPs, pedidos, compras, onde é usado), destino do estoque e liberação conjunta das versões na data de efetividade.
- **Embalagem** em níveis (unidade, caixa, master, palete) com GTIN, peso e medidas.
- **Na produção:** a OP de injeção nasce do roteiro da peça com o molde e as cavidades ativas; operações com primeira peça só seguem após a liberação da qualidade no tablet; documentos "vai na OP" aparecem no posto; o molde acima de 85% da vida útil abre preventiva.

O contrato futuro do backend está em `docs/contrato-backend-produtos.md`.
- **Comercial:** marca, linha e categorias; códigos de barras múltiplos (EAN-13, EAN-8, DUN-14, UPC-A) com um principal; tabelas de preço com vigência, unidade e moeda; grade de variações que gera itens reais.
- **Fiscal:** NCM validado, Ex-TIPI, CEST, origem, benefícios por UF, classe da reforma com vigência, matriz fiscal que sugere CFOP, CST e alíquotas, geração dos registros 0190, 0200 e 0220 do SPED e sincronização em mão dupla com o Omie, com tratamento de conflito.
- **Custos:** custo-padrão com vigência, custo calculado pela engenharia (material, máquina, mão de obra, preparação e desgaste do ferramental) e curva ABC derivada das saídas.

## Arquitetura

- `src/domain/engine.ts`: motor de produção puro (planejamento, reservas, apontamentos, qualidade, expedição e manutenção).
- `src/domain/catalog.ts` e `src/domain/catalogExtensions.ts`: cadastro de itens, camadas, homologação, auditoria e as extensões (preço, código de barras, fiscal, grade, mídia, ABC).
- `src/domain/engineering.ts`: ferramental, roteiro da revisão, comparação de versões, custo da engenharia, embalagem, mudanças de engenharia e sincronização fiscal com o Omie.
- `src/domain/enterprise.ts`: regras dos fluxos integrados de demanda, compras, CRM, assistência, projetos e finanças operacionais.
- `src/domain/budget.ts`: categorias, planejamento mensal, ledger de previsão/realizado pago, bloqueios, auditoria e conciliação Omie.
- `src/mocks/seed.ts`: cenário de demonstração gerado pelo próprio motor, com cada pedido em uma etapa diferente.
- `src/stores/erp.ts`: store Pinia que executa as regras, exibe o resultado e persiste o estado.
- `src/services/omie`: contrato `OmieGateway`, tabela de dono de cada dado e simulador.
- `src/tour`: tour de boas-vindas e guias por tela.

## Documentação

- `docs/integracao-omie.md`: contrato, dono de cada dado e regras para a integração real.
- `docs/analise-legado.md`: problemas do sistema atual e como o novo desenho os evita.
- `docs/arquitetura-erp-v3.md`: limites de domínio e fluxos da evolução integrada.

## Verificação

```bash
npm run lint
npm test
npm run build
```

## Limites desta versão

O Omie é simulado, e não há backend, banco de dados nem autenticação real. A fila de pagamentos, pagamentos parciais, estornos e erros de conciliação usa dados locais; não consulta notas nem baixas reais. As permissões são aplicadas no menu, nas rotas e nas regras de domínio do orçamento. Na versão real, também serão aplicadas na API.

Também são simulações que precisam virar integração real: a consulta ao cadastro nacional de GTIN (CCG), hoje uma tabela fixa, e o armazenamento da mídia do item, hoje no próprio navegador. Preços, regras da matriz fiscal e bases legais do cenário são ilustrativos e não valem como parametrização fiscal.
