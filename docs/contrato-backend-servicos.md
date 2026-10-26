# Contrato do backend — Serviços

Cadastro mestre de serviço, de uma empresa. O mesmo registro pode ser vendido, usado em ordem de serviço e compor roteiro de produção. Não se duplica o cadastro por módulo.

## Dados

- Identidade: empresa, código sequencial da demonstração, nome, descrição, unidade informada (`hora`, `un` ou `visita`) e situação (`Ativo` ou `Inativo`).
- Usos independentes: vendável, utilizável em ordem de serviço, utilizável em roteiro.
- Local habitual: instalações da Roboflex, instalações do cliente ou outro local. Não define o executor.
- Executor: equipe própria ou fornecedor terceirizado.
- Equipe própria: setor responsável, nome da equipe e instruções técnicas versionadas. A versão anterior não é sobrescrita.
- Terceirizado: nome do datasheet. Sem esse anexo o cadastro não grava. Fornecedor é referência, não pedido de compra.
- Preço, custo e cenário fiscal são textos ou valores informados quando o serviço é vendável ou usado em ordem de serviço. Não há lista, alíquota nem cálculo.
- Tempo estimado informado. Não há tempo médio calculado.

## Regras

1. Um serviço aceita vários usos ao mesmo tempo.
2. Local e executor são escolhas separadas.
3. Terceirizado sem datasheet é recusado.
4. Alterar a instrução acrescenta uma versão. O texto anterior permanece.
5. Operação de roteiro só aponta serviço marcado para roteiro e ativo. A operação guarda o número da instrução vigente naquele momento. Manter o serviço que a operação já usa continua válido, mesmo inativo.
6. Mudança de serviço usado em roteiro abre rascunho de versão no produto acabado, para os produtos escolhidos, ou cria outro serviço e aponta só esses rascunhos. A revisão liberada não é reescrita.
7. Publicar a versão continua no cadastro do produto. Ordem já criada não é trocada por este cadastro.

## Fora deste contrato

Taxonomia e código oficial, papéis de criar e aprovar, lista de preço, classificação e cálculo fiscal, fórmula da média de tempo, tratamento de apontamento cancelado, validação do arquivo do datasheet e o mapa de quais situações de ordem contam como em andamento ou criadas sem início. O arquivo do datasheet, nesta demonstração, não é armazenado: fica o nome.
