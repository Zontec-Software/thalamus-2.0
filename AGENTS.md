---
description:
alwaysApply: true
---

# AGENTS - Thalamus 2.0

Orienta agentes de IA e desenvolvedores que trabalham no ERP Thalamus da Roboflex.

## Como este sistema está sendo construído

O sistema é desenhado **módulo a módulo**. Para cada módulo existe um **documento formal de especificação**, escrito fora deste repositório (com outra IA), que descreve requisitos funcionais, não funcionais, regras de negócio, casos de uso, histórias e modelo conceitual. Esse documento é a fonte da verdade do módulo.

Fases:

1. **Mockup geral:** este repositório. Vue navegável, estado em `localStorage`, Omie simulado. Todos os módulos continuam aqui, e é aqui que a regra nasce e é revisada.
2. **Sistema oficial:** repositórios `thalamus2-<modulo>`, cada um com as pastas `api/` e `web/`, ao lado deste, com banco real e cadastro pela tela. Um Laravel e um schema por módulo; o `thalamus2-core/api` (schema `t2_core`) é a única fonte de login, empresa, grupo e permissão. O `thalamus2-core/web` é a casca que carrega os módulos. Só vai para o oficial o módulo já revisado no mockup. A lista, o padrão de nomes e as regras estão em `docs/repositorios-oficiais.md`.

O mockup é a **homologação** e o oficial é a **produção**. As telas do oficial são cópias das do mockup; só muda o crucial para o sistema real (login, empresa, permissões validadas na API, persistência). Uma mudança revisada aqui é levada para lá copiando a tela, portando a regra com teste e atualizando a seção "Entrega oficial" do contrato. Mudança no `style.css` chega ao oficial pelo `thalamus2-shared/ui/scripts/sync-mockup.ps1`; mudança no catálogo de `src/domain/access.ts` precisa ir também para o `FunctionalityCatalog.php` do core. Indicadores não têm schema. O produto é independente.

O objetivo é o que há de melhor no mercado, **ajustado à realidade da Roboflex**. É normal implementar algo completo no mockup e recortar depois.

## Leis do redesenho

Toda tela, regra e módulo do Thalamus 2.0 é avaliado contra estas sete leis:

1. **Conquistar o usuário.** Clareza à primeira vista; sem texto sobrando nem botão que ninguém entende.
2. **Economia de tempo.** Menos cliques e digitação; o sistema propõe e a pessoa confirma.
3. **Automação de processos.** O que pode ser calculado ou disparado pelo sistema não é feito à mão.
4. **Gestão à vista.** Desvio, alerta e responsável aparecem sem procurar.
5. **Papéis claros.** Cada ação tem um dono; a tela mostra quem faz e quem decide.
6. **Módulos definidos.** Fronteira clara por módulo, sem função duplicada.
7. **Multitenant.** Todo dado pertence a uma empresa; o grupo é leitura autorizada, nunca mistura.

## Multitenancy e grupos econômicos

- O Thalamus 2.0 é multitenant: cada empresa é um tenant e todo dado de negócio pertence a exatamente um tenant.
- Grupo econômico é uma relação entre empresas; ele **não** mistura os dados operacionais das empresas.
- Consulta consolidada de grupo só é permitida a usuários que tenham permissão explícita para o grupo, o módulo e a ação. A API sempre restringe a consulta aos tenants autorizados.
- Código novo de domínio, persistência, endpoint, fila, integração e auditoria deve carregar o contexto do tenant. Nunca usar o tenant recebido diretamente do navegador sem validar a associação do usuário.
- Agregados entre empresas (por exemplo, orçamento do grupo) são consultas ou projeções derivadas. O lançamento de origem continua pertencendo à empresa.
- Categorias, contas e demais cadastros consolidados exigem um mapeamento explícito para uma dimensão do grupo; não presumir que códigos iguais em empresas diferentes significam a mesma coisa.

## Responsabilidade do agente: harmonia entre módulos

Quem trabalha aqui enxerga o sistema inteiro. Nenhum módulo evolui sozinho.

**Sempre que um módulo for evoluído a partir de um documento:**

1. Implementar o que o documento pede no módulo em questão.
2. **Analisar o impacto nos demais módulos, documentos, manuais e guias.**
3. **Perguntar ao usuário** o que deve ser editado nos outros módulos antes de sair alterando. Use perguntas objetivas, com opções.
4. Só então propagar as mudanças aprovadas.

### Checklist de impacto

Depois de mexer num módulo, verificar sempre:

- **Domínio:** `src/domain/engine.ts` (motor puro), `catalog.ts`, `catalogExtensions.ts`, `enterprise.ts`. Respeitar a direção das importações: `engine` não importa os demais.
- **Store e persistência:** `src/stores/erp.ts`. Campo novo no estado exige subir a `STORAGE_KEY` (sem migração; o seed regenera).
- **Seed:** `src/mocks/seed.ts`. O cenário de demonstração precisa exercitar o recurso novo.
- **Telas dos outros módulos** que consomem o dado alterado (compras, propostas, expedição, planejamento, projetos, indicadores, finanças).
- **Manual do sistema:** `src/help/manual.ts`. Seções novas, texto que ficou errado, glossário, tabelas de permissão e de aprovação.
- **Guias por tela:** `src/tour`.
- **Documentos:** `README.md`, `docs/arquitetura-erp-v3.md`, `docs/integracao-omie.md` e a tabela `OWNERSHIP` em `src/services/omie/gateway.ts`.
- **Canvas de conformidade** do módulo, quando existir, em `~/.cursor/projects/<workspace>/canvases/`.
- **Testes:** `src/tests`. Toda regra de negócio nova tem teste.
- **Backend:** o contrato do módulo em `docs/contrato-backend-<modulo>.md`.
- **Sistema oficial:** se o módulo já existe em `thalamus2-<modulo>` (`api/` e `web/`), a mudança revisada aqui precisa ser levada para lá (regra, teste, tela e manual). Perguntar antes.

### Fronteira entre mockup e realidade

Ao entregar, dizer explicitamente **o que é simulação** e precisa virar integração real (consultas externas, armazenamento de arquivos, dados fiscais de exemplo). Isso é o que permite recortar o mockup para a realidade depois.

## Restrições permanentes

- Responder sempre **em português**.
- O **pedido de venda nasce no Thalamus** (aceite da proposta) e vai ao Omie na confirmação, quando a empresa usa o Omie. O sistema funciona sem o Omie. A fonte oficial de cada entidade é decidida na tela Integração Omie; pendente bloqueia a sincronização.
- **Omie é dono** da apuração fiscal, da nota fiscal e dos títulos. O cadastro fiscal do item nasce no Thalamus.
- **Finanças é operacional**: compromissos e títulos. Banco e contabilidade ficam fora.
- Repositórios legados são **apenas consulta**. Nunca copiar código de lá.
- Não editar o arquivo de plano em `~/.cursor/plans/`.

## Verificação antes de entregar

```bash
npx vue-tsc --noEmit -p tsconfig.app.json
npx eslint src
npx vitest run
npm run build
```

Conferir também no navegador (`npm run serve`, http://localhost:8080) as telas afetadas. A porta é fixa: se a 8080 estiver ocupada, o servidor avisa em vez de subir em outra.
