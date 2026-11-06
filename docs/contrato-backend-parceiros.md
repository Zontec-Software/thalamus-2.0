# Contrato do backend — Parceiros

O cadastro mestre de parceiro vive no Thalamus e segue para o Omie. No Omie, cliente e fornecedor são o mesmo registro; aqui são papéis desse registro. O schema é o `t2_comercial`, no `thalamus2-comercial/api`, junto com o CRM. Suprimentos, quando for oficial, lê fornecedores por `GET /api/partners?role=Fornecedor`. O que abaixo está aprovado na especificação:

1. Um parceiro tem um documento fiscal e pode ter o papel Cliente, o papel Fornecedor ou os dois, sem duplicar os dados gerais.
2. Contatos e endereços são registros do parceiro, com finalidade no endereço.
3. Cada papel tem situação própria. Inativar um não inativa o outro. Operação já em andamento segue até o fim. Solicitação nova do papel inativo é recusada.
4. O perfil do cliente lê vendas. O ticket médio não é gravado no cadastro. A fórmula ainda não está definida, então a API não devolve um número de ticket como se a regra existisse. Devolve a base: quantidade, soma, primeira e última data, e a origem Vendas.
5. A classe ABC vigente só muda com aprovação do Coordenador Comercial. Sem os limites A/B/C, a atualização anual gera alerta sem classe sugerida. A classe não autoriza crédito, desconto nem condição comercial.
6. A nota do fornecedor lê recebimentos do almoxarifado. Sem fórmula, a API não publica nota. Devolve volume, período e origem.
7. Homologação de matéria-prima é de outro submódulo. O perfil só lê status, referência, material e testes. Compra de matéria-prima C1 sem homologação daquele fornecedor para aquele item é recusada com motivo. C2 e C3 não exigem registro.
8. Critérios de C1/C2/C3, fórmula do ticket, faixas ABC, fórmula da nota, validação do cliente e quem aprova a inativação continuam pendentes. Não são inferidos.

## Endpoints da primeira entrega

- `GET /api/partners?role=&q=&active=1` (abre também com `modulo.crm.consultar`, para o CRM escolher o cliente; `active=1` deixa só quem tem o papel ativo; cada linha traz papéis, contatos, endereços e cidade), `POST /api/partners` (com `force_duplicate`), `GET|PATCH /api/partners/{id}` (o `GET` traz o histórico com antes e depois)
- `POST /api/partners/{id}/contacts`, `POST /api/partners/{id}/addresses`
- `POST /api/partners/{id}/roles` e `POST /api/partners/{id}/roles/{role}/inactivate` (motivo obrigatório)

Regras já implementadas: razão social com 2 ou mais letras; CPF/CNPJ com 11 ou 14 dígitos; documento repetido na empresa é recusado sem `force_duplicate`; papéis `Cliente`, `Fornecedor`, `Transportadora` com situação própria; fase `Em cadastro`, `Ativo` ou `Inativo` derivada dos papéis; vertical só no papel Cliente, alterada no cadastro ou pela oportunidade, com auditoria de antes e depois. Permissões: `modulo.parceiros.consultar` e `modulo.parceiros.gerir`.

## Entrega oficial

A tela de `thalamus2-comercial/web` é a cópia de `src/views/PartnersView.vue`, na mesma rota (`/parceiros/:id?`, atalhos Clientes com `origem=comercial` e Fornecedores com `origem=suprimentos`). Lista, filtros por papel, novo parceiro com aviso de documento repetido, dados gerais, papéis, contatos, endereços, vertical e histórico são iguais. Sem `modulo.parceiros.gerir`, a tela fica só de leitura.

Escondido até o módulo dono ser oficial: pedidos de Vendas e ticket médio, classe ABC e reclassificação anual (aba Cliente); volume recebido, compras em andamento e homologação de matéria-prima (aba Fornecedor). A aba Fornecedor mostra só a nota "Sem fórmula". A política de quem aprova a inativação continua pendente: a solicitação inativa na hora.
