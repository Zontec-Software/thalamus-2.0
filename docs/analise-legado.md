# Lições do sistema atual

Os repositórios do ERP atual foram **consultados, não copiados**. Nenhum código foi reaproveitado. O objetivo foi entender o processo real da Roboflex e os pontos em que o sistema antigo gera retrabalho ou informação inconsistente.

| Problema observado | Efeito na operação | Como o Thalamus 2.0 resolve |
| --- | --- | --- |
| Vários significados de situação misturados em um único campo de status | Ninguém sabe ao certo em que etapa o pedido está | A etapa do pedido é **calculada** a partir das OPs, compras, inspeções e expedição. Cada entidade tem o próprio ciclo de vida. |
| Apontamento de injeção e de montagem em módulos e regras diferentes | Dados de produção não comparáveis e treinamento duplicado | Um único modelo de operação e apontamento para todos os postos |
| Aplicativos de tablet duplicados por setor | Manutenção dobrada e comportamentos diferentes | Um único app de tablet: a pessoa entra, escolhe o posto e vê a fila daquele posto |
| Comercial, montagem e expedição misturados no mesmo aplicativo | Telas sobrecarregadas e permissões confusas | Módulos separados, organizados na ordem do processo |
| Estrutura do produto espalhada entre versões de cadastro e planilhas | Divergência de materiais e de revisões | Cadastro único de itens (PA, SE, MP, CP, EM), com estrutura multinível, roteiro e revisão |
| A palavra "estrutura" com sentidos diferentes (acessos, DRE, BOM) | Confusão na comunicação | Vocabulário único: "estrutura" é sempre a lista de materiais |
| Integração com o Omie feita por rotinas agendadas e clientes HTTP duplicados | Falhas silenciosas e dados divergentes | Gateway único, fila com reprocessamento, erros visíveis e dono definido para cada dado |
| Permissões por IDs numéricos, verificadas apenas na interface | Difícil de auditar e inseguro | Perfis com nomes legíveis, verificados no menu e nas rotas. Na versão real, também na API. |
| Programação de injeção por arrastar e soltar que não era salva | Planejamento perdido e retrabalho do PCP | Programação persistida e validada por tipo de recurso |

## Princípios adotados

1. **Uma informação, um lugar.** Cada dado tem um dono (Thalamus ou Omie) e um único cadastro.
2. **Status derivado, não digitado.** A situação de pedidos e máquinas vem dos fatos registrados.
3. **Trilha completa.** Todo evento fica na linha do tempo do pedido, com responsável e horário.
4. **Chão de fábrica sem papel.** O tablet é a única forma de apontar, com motivos padronizados para paradas e refugo.
5. **Regras no domínio.** As validações ficam no motor de regras (`src/domain/engine.ts`), não espalhadas pelas telas.
