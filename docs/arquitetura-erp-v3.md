# Arquitetura do ERP integrado v3

## Princípios

- Uma necessidade nasce como demanda; requisição, cotação e pedido de compra são documentos distintos.
- Produtos têm identidade estável e revisões liberadas. A revisão leva estrutura e roteiro juntos, e a OP congela a revisão usada no planejamento.
- Alteração com impacto em estoque, OP ou pedido passa por mudança de engenharia (ECO): a revisão nasce ligada à mudança e só é liberada na implementação, na data de efetividade.
- Ferramental (molde, gabarito, dispositivo) é item do catálogo (tipo FE). O roteiro aponta para ele; o tempo de injeção é derivado do ciclo e das cavidades ativas, e o contador de golpes vem do ativo da manutenção.
- Atributos técnicos são definidos na classificação e herdados pelos itens; os marcados como eixo de variação alimentam a grade.
- O item tem um núcleo comum e camadas que só existem para os tipos que precisam delas. Módulo novo entra como camada nova, sem mexer no núcleo.
- Tudo o que muda de valor ao longo do tempo é lançado com vigência e histórico, nunca sobrescrito: estrutura, custo-padrão, preço de venda e classe da reforma.
- O cadastro fiscal do item nasce no Thalamus e sincroniza em mão dupla com o Omie; mudança dos dois lados vira conflito decidido por pessoa. A apuração e a nota são do Omie. A matriz fiscal daqui apenas sugere CFOP, CST e alíquotas.
- Marca, linha, categoria e curva ABC são dimensões de análise, separadas da classificação e sem significado no código do item.
- Curva ABC e custo calculado pela estrutura são derivados do movimento, nunca digitados.
- Pessoas internas e parceiros de negócio são cadastros separados. O parceiro é um registro só, como no Omie: Cliente e Fornecedor são papéis, e inativar um não inativa o outro.
- Pessoa, vínculo, cargo, posição e conta são registros diferentes. A pessoa e o vínculo pertencem a uma empresa. O cargo descreve o trabalho e não forma hierarquia. A posição é a vaga do setor, com headcount e ocupante. A conta autentica, recebe perfis e usa o PIN. Entre empresas do grupo há três caminhos: participação em projeto, segundo vínculo ligado por confirmação humana, ou acesso sem pessoa. CPF e e-mail só sugerem a correspondência. Dado sensível não atravessa a empresa. No mockup a restrição é de tela; a API é que autoriza o campo.
- O catálogo de serviços é um cadastro mestre por empresa. Venda, ordem de serviço e roteiro são usos do mesmo registro, independentes do local e de quem executa. Serviço terceirizado exige datasheet. A mudança no roteiro abre versão nova no produto; a média de tempo não é calculada enquanto a fórmula não existir.
- Projetos agregam marcos, demandas, compras e orçamento; não substituem o PCP.
- Finanças controla o DRE de leitura e o orçamento por setor utilizador. Contas a pagar e a receber estão em estruturação; por enquanto o título, o fiscal, o banco e a contabilidade ficam no Omie.
- Cada empresa é um tenant. Grupo econômico consolida empresas autorizadas para consulta e análise, mas não compartilha seus dados operacionais.
- Orçamento usa categoria + ano como chave. Mês, trimestre e semestre são lentes de acompanhamento, em fatia proporcional. O ledger separa orçamento informado, previsão operacional e realizado pago, cuja fonte é o Omie.
- Tarefas, eventos, permissões e indicadores são derivados da mesma fonte de estado. Permissão é uma funcionalidade de negócio atribuída por perfil; o usuário pode ter vários perfis na empresa e o Administrador é imutável.

## Fluxos principais

### Comercial até recebimento

Oportunidade → proposta multilinha, com o preço vigente da tabela padrão → aceite, que explode os kits virtuais em componentes → pedido aprovado no Omie simulado → planejamento → produção → qualidade → expedição → faturamento no Omie → conta a receber.

### Necessidade até pagamento

Demanda/OP/OS/Projeto → previsão por categoria e mês → compra/execução sem duplicar a previsão → recebimento físico e conta a pagar → nota do Omie entra no realizado. A nota mostra o documento de origem quando ele já veio; sem esse vínculo, o Financeiro liga na mão. Compras, projetos e as outras origens passarão a enviar o vínculo quando forem refeitos. Cancelamento baixa a previsão; estorno reabre o saldo previsto. Eventos externos são idempotentes.

Se o lançamento ultrapassar o saldo e o bloqueio estiver ativo, a previsão entra no ledger como **retida**, fora do saldo, e abre uma exceção. O Gestor ou o Administrador libera ou recusa; o Financeiro, que define o orçamento, não autoriza a própria exceção. O Administrador também informa orçamento e reclassifica pagamento retido. Compra e contratação da origem esperam a liberação. Pagamentos sem categoria, com múltiplas categorias ou com falha de sincronização ficam na fila até o Financeiro reclassificar, e só então entram no realizado.

A taxonomia tem grupo, categoria e subcategoria. O orçamento do ano é informado na subcategoria, no cadastro ou na visão geral. A categoria macro mostra a soma. Um total informado no grupo ou na macro é dividido em partes iguais e cada parte continua editável. Enquanto a macro não tem filha, o valor fica nela. O bloqueio usa o saldo do ano. Ao cruzar o limiar da fatia em acompanhamento, uma ocorrência de alerta é registrada e chega no sino da pessoa responsável da conta e do Financeiro.

### Pós-venda

Chamado de assistência → vínculo com cliente, pedido, lote ou serial → agenda → execução → laudo → conta a receber quando cobrável. Peças indisponíveis geram demanda.

### Produção

Pedido aprovado → OP com revisão congelada → reserva → separação → execução no tablet → inspeção → expedição. A separação pode ser desfeita antes do primeiro apontamento. O posto é cadastro da empresa (tipo, minutos por dia e custo-hora). O ativo físico aponta para o posto; o ferramental continua no item.

## Persistência do protótipo

O estado fica no `localStorage`, na chave `thalamus-erp-v50`. Não há banco de dados nem API nesta fase. Restaurar a demonstração recria o seed completo.

Campo novo no estado exige subir a chave. Não há migração: a chave nova nasce do seed, e a antiga é descartada.

## Fronteiras para implementação real

- Um backend Laravel (`thalamus-2-core`) e um frontend. A fronteira do módulo é o schema. O esboço inteiro permanece usável. O schema `t2_core` vem primeiro. Finanças, quando for a vez, é o orçamento em `t2_orcamentos`. O mockup ainda não tem título a pagar nem a receber: as abas existem em estruturação e serão desenhadas com Gestão de contratos e Ativos. Até lá o registro é do Omie, e o Thalamus só lê o pagamento e o recebimento como realizado. Indicadores permanecem leitura sobre os outros.
- Banco relacional com migrações e controle de concorrência.
- Arquivos em armazenamento de objetos, vinculados por metadados. No protótipo, a mídia do item fica no navegador, com limite por arquivo.
- Consulta ao cadastro nacional de GTIN (CCG) para o cruzamento GTIN × NCM. No protótipo é uma tabela fixa.
- Integração Omie assíncrona, idempotente e observável.
- Conta Google por empresa, no mesmo desenho: o domínio fica na conexão, o segredo no cofre e a senha da pessoa nunca volta. No protótipo o Admin SDK é simulado. A criação pede confirmação do e-mail; a suspensão corre na data efetiva do desligamento e a falha fica visível.
- Persistência transacional do ledger orçamentário, com chave única para eventos Omie, trilha imutável e controle de concorrência na categoria/período.
- Autenticação corporativa; PIN do tablet limitado ao contexto do posto.
- Eventos de domínio para tarefas, alertas, integrações e indicadores.
- Isolamento multitenant: toda entidade de negócio terá `tenant_id`; autorização, filas, eventos, auditoria e integrações carregarão o contexto do tenant. Consultas de grupo econômico serão agregações autorizadas, conforme `docs/multitenancy.md`.

A infraestrutura de publicação (ambientes, esteira, banco por schema de módulo e plano de implantação) está em `docs/infraestrutura-deploy.md`.
