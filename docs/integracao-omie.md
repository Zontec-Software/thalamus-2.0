# Integração com o Omie

O domínio de produção conversa com o Omie apenas pelo contrato `OmieGateway` (`src/services/omie/gateway.ts`). Nesta demonstração, `MockOmieGateway` simula latência e respostas sem chamadas externas. Na versão real, o mesmo contrato será implementado por um adaptador no backend.

## Quem é dono de cada dado

A tabela `OWNERSHIP` (exibida na tela **Integração Omie**) define o dono de cada informação. Ela evita que o mesmo dado seja digitado nos dois sistemas e acabe divergindo.

| Dado | Dono | Direção | Gatilho |
| --- | --- | --- | --- |
| Clientes e condições comerciais | Omie | Omie → Thalamus | Webhook + conciliação diária |
| Pedidos de venda aprovados | Omie | Omie → Thalamus | Webhook de aprovação |
| Cadastro fiscal do item (NCM, Ex-TIPI, CEST, origem, benefício por UF, reforma) | Thalamus | Bidirecional | Ativação, cada vigência e cada alteração aqui; webhook de alteração no Omie, com conflito decidido na ficha do item |
| Apuração fiscal e NF-e (CST e alíquota aplicados na nota) | Omie | Omie → Thalamus | Emissão da nota |
| Códigos de barras do item (EAN, DUN, UPC) | Thalamus | Thalamus → Omie | Ativação do item e troca do código principal |
| Tabelas de preço de venda | Thalamus | Thalamus → Omie | Preço que entra em vigência |
| Mídia do item (fotos, desenhos, fichas) | Thalamus | Thalamus → Omie | Publicação do item |
| Estrutura, roteiro e revisão do produto | Thalamus | Thalamus → Omie | Liberação de revisão |
| Reservas, OPs e apontamentos | Thalamus | Thalamus → Omie | Encerramento da OP (consolidado) |
| Pedido de compra | Thalamus | Thalamus → Omie | Aprovação da requisição |
| Recebimento / NF-e de entrada | Omie | Omie → Thalamus | Webhook de recebimento |
| Saldo contábil de estoque | Omie | Bidirecional | Ajustes com motivo + conciliação |
| Faturamento e NF-e de saída | Omie | Omie → Thalamus | Solicitado na expedição |
| Contas a pagar e a receber | Omie | Omie → Thalamus | O título nasce e é baixado no Omie. O Thalamus lê o pagamento e o recebimento como realizado do orçamento. A cobrança de assistência vai ao Omie para faturar |
| Categoria financeira | Thalamus | Bidirecional | Criação ou alteração no Thalamus. Inativar envia conta_inativa. O Omie devolve o que mudou lá |
| Orçamento anual | Thalamus | Interno | Definido no cadastro; acompanhamento mensal, trimestral, semestral ou anual |
| Nota de custo | Omie | Omie → Thalamus | Entra no realizado. Sem documento de origem, o vínculo é manual em Ações |
| Pagamento, parcial e estorno da NF | Omie | Omie → Thalamus | Webhook + conciliação incremental |

### A divisão do fiscal

O fiscal é dividido em duas responsabilidades, para não haver dois cadastros divergentes:

- **Cadastro fiscal do item** nasce no Thalamus. O item é homologado aqui, com NCM validado, Ex-TIPI, CEST, origem, benefícios por UF e a classe da reforma com vigência. É daqui que sai o registro 0200 do SPED. A sincronização é de **mão dupla**:
  - alteração no Thalamus marca o item como "Enviar ao Omie" e é publicada pelo botão da ficha (no real, pela fila);
  - alteração no Omie (webhook de produto) em item sincronizado é aplicada aqui e auditada com o ator "Omie";
  - alteração no Omie com envio pendente vira **Conflito**: a ficha mostra campo a campo (NCM, CEST, origem, Ex-TIPI, cClassTrib) e alguém com permissão fiscal escolhe "Manter o Thalamus" (reenvia) ou "Aceitar o Omie" (aplica e audita);
  - rascunho não sincroniza.
- **Apuração e emissão** são do Omie. A matriz fiscal do Thalamus (`Produtos → Fiscal → Matriz fiscal`) apenas **sugere** CFOP, CST e alíquotas por operação, UF e NCM, para quem cadastra conferir. O valor que vai na nota é o que o Omie aplicar.

Quando a matriz do Thalamus e a do Omie divergirem, vale a do Omie, e a diferença precisa aparecer como erro na tela de integração.

## Pontos de contato no fluxo

1. **Pedido aprovado**: o pedido chega à fila e é importado sem duplicar (chave: id do pedido no Omie).
2. **Compras**: a demanda atendida por compra origina cotação e pedido. Ao aprovar, o pedido é incluído no Omie.
3. **Recebimento**: cada recebimento parcial dá entrada no estoque e libera reservas; o saldo final conclui a demanda. O título a pagar é do Omie e o orçamento só realiza com o pagamento confirmado por ele.
4. **Inventário**: cada ajuste vai ao Omie com motivo. Não é possível ajustar abaixo do que já está reservado.
5. **Produto**: a ativação publica no Omie o cadastro do item, com o fiscal, os códigos de barras e o preço vigente. Depois disso, uma nova revisão de estrutura ou roteiro, um preço que entra em vigência ou uma nova classe da reforma republicam o item.
6. **Expedição**: a carga expedida solicita o faturamento, a NF-e volta para o pedido e gera a conta a receber operacional.
7. **Pagamento**: pagamento parcial ou total confirmado pelo Omie reduz a previsão aberta e cria realizado pago; estorno cria valor negativo e reabre a previsão. O id externo impede processamento duplicado.

Eventos sem categoria, com múltiplas categorias ou com erro ficam na fila de exceções de Orçamento. O Financeiro escolhe a categoria correta e o evento é reprocessado; repetições posteriores do mesmo id não geram novo efeito. Todas as trocas também ficam na tela **Integração Omie**, com situação (sincronizado, pendente ou erro) e botão de reprocessar.

## Regras para a integração real

1. Guardar as credenciais somente no backend, nunca no navegador.
2. Ter uma única camada de integração, com fila assíncrona, retentativa exponencial e fila de mensagens com falha. Nada de rotinas agendadas espalhadas.
3. Garantir idempotência com `entidade + id externo + versão do evento`.
4. Registrar payload, resposta, duração e correlação, sem guardar dados sensíveis desnecessários.
5. Paginar consultas, respeitar os limites da API e buscar de forma incremental pela data da última alteração.
6. Conciliar diariamente pedidos, estoque, compras, faturamento e pagamentos/estornos. Divergências aparecem como erro na tela de integração.
7. Persistir o evento de pagamento e a atualização do ledger na mesma transação, com unicidade do id externo e bloqueio concorrente da categoria/período.

## Próxima etapa

Implementar `OmieGateway` em um serviço de backend. Antes disso, validar com a conta Omie:

- os aplicativos e endpoints habilitados;
- as regras fiscais, confrontando a matriz do Omie com a matriz sugerida pelo Thalamus;
- quais campos do cadastro do item o Omie aceita receber (códigos de barras múltiplos, tabela de preço, classe da reforma);
- a frequência necessária para cada fluxo.
