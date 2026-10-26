# Contrato do backend — Parceiros

O cadastro mestre de parceiro vive no Thalamus e segue para o Omie. No Omie, cliente e fornecedor são o mesmo registro; aqui são papéis desse registro. O schema ainda não existe. O que abaixo está aprovado na especificação:

1. Um parceiro tem um documento fiscal e pode ter o papel Cliente, o papel Fornecedor ou os dois, sem duplicar os dados gerais.
2. Contatos e endereços são registros do parceiro, com finalidade no endereço.
3. Cada papel tem situação própria. Inativar um não inativa o outro. Operação já em andamento segue até o fim. Solicitação nova do papel inativo é recusada.
4. O perfil do cliente lê vendas. O ticket médio não é gravado no cadastro. A fórmula ainda não está definida, então a API não devolve um número de ticket como se a regra existisse. Devolve a base: quantidade, soma, primeira e última data, e a origem Vendas.
5. A classe ABC vigente só muda com aprovação do Coordenador Comercial. Sem os limites A/B/C, a atualização anual gera alerta sem classe sugerida. A classe não autoriza crédito, desconto nem condição comercial.
6. A nota do fornecedor lê recebimentos do almoxarifado. Sem fórmula, a API não publica nota. Devolve volume, período e origem.
7. Homologação de matéria-prima é de outro submódulo. O perfil só lê status, referência, material e testes. Compra de matéria-prima C1 sem homologação daquele fornecedor para aquele item é recusada com motivo. C2 e C3 não exigem registro.
8. Critérios de C1/C2/C3, fórmula do ticket, faixas ABC, fórmula da nota, validação do cliente e quem aprova a inativação continuam pendentes. Não são inferidos.
