# Contrato do backend — Pessoas

Repositório `thalamus2-pessoas`: API em `api/` (schema `t2_pessoas`) e tela em `web/`. Login, empresa e permissão vêm do `thalamus2-core/api`. A referência funcional é o mockup: `src/domain/organization.ts`, `src/domain/people.ts` e as telas em `src/views/people`. Todo registro pertence a uma empresa (`tenant_id`, resolvido pela sessão).

## Fronteira com o core

- A **conta** (e-mail, senha, perfil, bloqueio) é do core. A **pessoa** (ficha, vínculo, posição) é de Pessoas.
- A pessoa aponta para a conta por `core_user_id`, sem que uma exija a outra.
- Cadastrar uma pessoa ou efetivar um candidato **com e-mail, perfil e senha** cria a conta no core (`POST /api/users`) com o token de quem está na tela. Isso exige `organizacao.acessos.gerir` no core. Se o core recusar, nada é gravado em Pessoas. E-mail que já tem conta liga a pessoa à conta existente.
- Revogação concluída que inclui o Thalamus bloqueia a conta no core (`PATCH /api/users/{id}`). Se o core recusar, a revogação não é registrada.
- A tela lê do core, com o mesmo token: diretório de contas ativas, perfis, contas, funcionalidades e o mapa de acesso do grupo. Conceder perfil sem vínculo (`POST /api/users/{id}/profiles`) e bloquear ou reativar a conta são chamadas ao core feitas pela tela.

## Recursos

| Recurso | Campos principais |
| --- | --- |
| `sectors` | nome único por empresa, setor superior (sem ciclo), posição de liderança (do próprio setor) |
| `jobs` (cargos) | nome, nível, CBO, missão, requisitos, **salário** (do cargo, não da pessoa), situação |
| `positions` | setor, cargo, posição superior (sem ciclo), quantidade de vagas, situação. O nome e a descrição vêm do cargo |
| `people` | nome, e-mails, telefone, ramal, turno (item da lista da empresa), foto, CPF (válido e único por empresa), nascimento e o restante da ficha (documentos, saúde, endereço, formação, família, contatos de emergência, contas bancárias), conta do core opcional |
| `employments` | pessoa, tipo de contrato, início, fim, local de trabalho, situação (`Ativo`, `Encerrado`). O CBO é o do cargo da posição, não um campo do vínculo |
| `assignments` | pessoa, setor, posição, vigência (`valid_from`, `valid_to`) |
| `performance_reviews` | pessoa, nota, escala, período, origem |
| `identity_links` | ligação confirmada entre o cadastro de origem e o de outra empresa do grupo |
| `job-openings` (vagas) | título, setor, posição, requisitante, responsável, descrição, requisitos, abertura, data alvo, situação (`Aberta`, `Pausada`, `Encerrada`) |
| `candidates` | nome, e-mail, telefone, currículo em texto, última visualização, pessoa vinculada |
| `applications` | candidato, vaga, etapa (`Triagem`, `Entrevista`, `Selecionado`, `Efetivado`, `Encerrado`), histórico |
| `briefings` | leitura do currículo contra os requisitos: evidências, lacunas, perguntas, decisão humana e nota |
| `interviews` | candidatura, data e hora, local, entrevistadores (pessoas da empresa), confirmação |
| `selection_reviews` | resultado da entrevista: origem, observação, quem registrou |
| `checklists` | processo (`vaga` = modelo da vaga, `admissao` = cópia por candidatura, `efetivacao`, `movimentacao`, `desligamento`), referência, itens (rótulo, dono, tipo, obrigatório, situação, evidência, prazo) |
| `offboardings` | pessoa, data efetiva, motivo, situação, quem iniciou e concluiu |
| `access-revocations` | desligamento, sistemas, resultado, falha, referência no cofre (nunca o segredo) |

## Endpoints

- `GET|POST /api/sectors`, `PATCH /api/sectors/{id}` (nome, setor superior, liderança)
- `GET|POST /api/jobs`, `PATCH /api/jobs/{id}`
- `GET|POST /api/positions`, `PATCH|DELETE /api/positions/{id}`
- `GET|POST /api/people`, `GET|PATCH /api/people/{id}`, `POST /api/people/{id}/assignment`, `PATCH /api/people/{id}/employment`, `POST /api/people/{id}/reviews`, `POST|DELETE /api/people/{id}/photo`
- `GET /api/photos/{tenant}/{person}`: a foto, por endereço assinado e temporário que só a leitura autorizada da pessoa gera (a tag `<img>` não manda token)
- `GET /api/group-directory`: pessoas das outras empresas do grupo da sessão. `POST /api/group-directory/{tenant}/{person}/employment`: Contratar aqui também
- `GET|POST /api/job-openings`, `GET|PATCH /api/job-openings/{id}`, `POST /api/job-openings/{id}/checklist-items`
- `GET /api/candidates`, `POST /api/job-openings/{id}/candidates` (com `force` para manter possível duplicata ou `existing_candidate_id` para unir)
- `GET /api/applications/{id}`, `POST /api/applications/{id}/briefing`, `POST /api/briefings/{id}/review`, `POST /api/applications/{id}/interviews`, `POST /api/interviews/{id}/confirmation`, `POST /api/applications/{id}/results`, `POST /api/applications/{id}/view`, `POST /api/applications/{id}/stage`, `POST /api/applications/{id}/hire`
- `PATCH /api/checklists/{id}/items/{item}` (a funcionalidade exigida depende do processo do checklist)
- `GET|POST /api/offboardings`, `GET /api/offboardings/{id}`, `POST /api/offboardings/{id}/revocations`, `POST /api/offboardings/{id}/close`
- `GET /api/board` (contadores para gestão à vista)
- Leitura para outros módulos, só com sessão válida, sem `modulo.pessoas.consultar`: `GET /api/sectors` (Finanças destina o orçamento) e `GET /api/me` (a casca mostra no cabeçalho a foto da pessoa ligada à conta, na empresa ativa)

## Permissões

| Funcionalidade | O que libera |
| --- | --- |
| `modulo.pessoas.consultar` | Ver as telas: setores, cargos, posições, pessoas (parte profissional), vagas e desligamentos |
| `pessoas.estrutura.gerir` | Organograma, cargos, cadastro, ficha, foto, contrato, avaliações, mudança de posição, checklist de movimentação e Contratar aqui também |
| `pessoas.admissao.gerir` | Vagas, candidatos, leitura, entrevistas, resultados, checklists de admissão e efetivação, efetivar |
| `pessoas.desligamento.gerir` | Iniciar, conduzir o checklist, registrar revogação e concluir o desligamento |
| `pessoas.dados_sensiveis.consultar` | Ver e alterar documentos, saúde, endereço, família, banco e o salário do cargo. Sem ela, esses campos não saem na resposta |
| `organizacao.acessos.gerir` (core) | Criar a conta junto com o cadastro ou a efetivação, dar perfil e bloquear ou reativar a conta |

## Regras

1. Setor: nome obrigatório e único na empresa. Um setor não fica abaixo de si nem de um descendente.
2. Liderança do setor é uma posição ativa do próprio setor. O líder é quem ocupa a posição.
3. Cargo exige nome, missão e nível. O nível é um item da lista da empresa. Essa lista tem ordem: o 1 é o mais alto. O par nome e nível é único na empresa. Salário, quando informado, é número maior ou igual a zero. O turno da pessoa também sai de uma lista da empresa, sem ordem: renomear atualiza as pessoas, e remover só vale quando ninguém usa.
4. Posição: setor e cargo da mesma empresa; posição superior ativa e fora da própria cadeia abaixo; vagas inteiro ≥ 1 e nunca abaixo dos ocupantes atuais.
5. Remover posição com ocupante ou com posição respondendo a ela é recusado. Se já teve ocupante, fica inativa para o histórico; senão é apagada.
6. Trocar a posição de uma pessoa exige vaga livre e vigência nova depois da atual. A vigência anterior termina no dia anterior. A troca abre o checklist de movimentação (acesso, equipamento, treinamento).
7. Vaga exige título e data de abertura. Candidato só entra em vaga aberta. E-mail ou telefone já cadastrado é possível duplicata: recusa sem `force` ou sem a união com o candidato existente.
8. A leitura do currículo é determinística (palavras dos requisitos no texto) e só sugere. A decisão humana exige nota.
9. Entrevista exige data, local e ao menos um entrevistador da empresa. A primeira entrevista leva a candidatura de Triagem para Entrevista.
10. Marcar Selecionado abre o checklist de efetivação. Efetivar exige Selecionado e checklist obrigatório concluído. Efetivar cria pessoa, vínculo e, com posição, a vigência (com vaga livre). Com perfil e senha, cria a conta no core. Se o e-mail do candidato já é de uma pessoa da empresa, a efetivação une os cadastros em vez de criar outro.
11. Desligamento: um em andamento por pessoa, data efetiva e motivo obrigatórios. O item de acesso só conclui pela revogação. A confirmação final só depois dos demais obrigatórios. Concluir encerra o vínculo e a vigência na data efetiva. Revogação com segredo no texto é recusada; a referência do cofre é aceita.
12. Ficha: quem não tem `pessoas.dados_sensiveis.consultar` recebe a visão profissional e não pode gravar campo sensível (403). Sexo, gênero, estado civil, escolaridade, categoria da CNH, UF, cor ou raça, PCD, camisa, calçado, parentesco, nível da formação e tipo de conta saem de listas fechadas; vazio é permitido. A data de admissão do vínculo ativo pode ser alterada. O CEP é consultado no navegador (ViaCEP) e preenche logradouro, bairro, cidade e UF; a API só grava o endereço. `GET /api/me` também devolve `person_id` e `missing` (nascimento, sexo, CPF, celular e endereço). Sem `pessoas.estrutura.gerir` e sem `pessoas.dados_sensiveis.consultar`, a própria pessoa lê e grava só Dados pessoais e Saúde; o restante da ficha não sai na resposta e outra pessoa dá 403.
13. Foto: imagem em data URL, até 439 KB.
14. Diretório do grupo: só as empresas do grupo da sessão (`groupPeers`). Contratar aqui também exige setor e tipo de contrato, cria outro cadastro nesta empresa com a mesma conta e liga os dois por confirmação.
15. Toda mudança grava auditoria no schema do módulo.

## Entrega no sistema oficial

Situação em 05/11/2026: telas copiadas do mockup em `thalamus2-pessoas/web/src/views/people`, com rotas aninhadas sob `/pessoas` (Colaboradores, Admissão, Desligamento, Organograma, Cargos). O adaptador `web/src/stores/people.ts` traduz a API para o formato das telas do mockup.

Fica de fora no oficial, por decisão: conta Google (Admin SDK), Participar de um projeto, PIN do tablet e os guias por tela. O "O que ela vê" da aba Acesso lista módulos, sem as áreas do shell. Não há visão "financeira" separada: quem consulta dados sensíveis vê a ficha completa e os demais, a profissional.

Pendências no core: uma funcionalidade de leitura consolidada de Pessoas no grupo (hoje o diretório usa os `groupPeers` da sessão) e um endpoint da navegação para a aba Acesso mostrar as áreas.
