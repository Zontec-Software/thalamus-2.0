# Contrato do backend — Postos

Cadastro da vaga de fábrica. Não é produto, não é ativo e não vai ao Omie. O registro pertence a uma empresa.

## Dados

- Identidade: empresa, nome único na empresa, tipo (`Injetora`, `Montagem`, `Almoxarifado`, `Qualidade`, `Expedição`), situação (`Ativo` ou `Inativo`).
- Capacidade: minutos disponíveis por dia (inteiro, a partir de 1) e custo-hora opcional (zero ou positivo). O custo-hora cobre máquina, energia e depreciação. A mão de obra não entra nele.
- Sem exclusão física enquanto roteiro, revisão, ordem, ferramental compatível ou ativo apontar para o posto.

## Regras

1. Posto novo nasce ativo.
2. Escolha nova (operação de roteiro, compatibilidade de ferramental, reprogramação para outro posto, vínculo de ativo) só aceita posto ativo. Manter o posto que o registro já usa continua válido, mesmo inativo.
3. Molde só é compatível com posto do tipo Injetora. Ordem aberta só muda para outro posto do mesmo tipo.
4. Inativar não cancela ordem nem apaga roteiro. O tablet continua oferecendo o posto inativo enquanto houver ordem aberta nele.
5. Trocar o tipo é recusado enquanto o posto estiver em uso.
6. Cadastrar o posto não cria ativo. O ativo guarda o posto em que está.

## Fora deste contrato

Fórmula de mão de obra, depreciação contábil e o submódulo de manutenção. O contador de golpes e a preventiva ficam no ativo.
