# Contrato futuro do backend — Core

O schema `t2_core`, dentro do único backend `thalamus-2-core`, existe antes de qualquer publicação e é a fonte de verdade para identidade, sessão, empresas, grupos econômicos, perfis e funcionalidades. Os outros módulos desse mesmo Laravel não leem esse schema.

## Recursos

- `users`: identidade, e-mail, senha com hash, situação e último acesso.
- `tenants`: empresas do produto, com cadastro legal e situação.
- `economic-groups`: grupos econômicos e suas empresas.
- `functionalities`: catálogo versionado de ações estáveis (`<módulo>.<ação>`).
- `access-profiles`: perfis reutilizáveis por empresa, com funcionalidades.
- `user-profile-assignments`: vários perfis por usuário e empresa; permissões se somam.
- `group-permissions`: funcionalidades consolidadas concedidas no grupo econômico.
- `sessions` e `refresh-tokens`: sessões revogáveis.
- `access-audits`: criação, alteração, atribuição, revogação, login e visualização administrativa.

## Regras

1. `Administrador` é perfil de sistema por empresa: código reservado, não apagável, sem remoção de funcionalidades e com todas as funcionalidades presentes e futuras. O catálogo nasce no código de cada módulo. Ao criar a empresa, o Core copia o catálogo atual para esse perfil. Perfis como Financeiro e Gestor não vêm prontos: o administrador da empresa os cria.
2. O usuário mestre é identidade da plataforma, sem tenant. Ele cadastra empresas, grupos econômicos e o vínculo Omie (chave e segredo em cofre). Não recebe funcionalidade operacional do ERP.
3. Perfil é atribuído por empresa. Usuário sem perfil na empresa não acessa dados dela. Cargo e setor descrevem a pessoa; não autorizam a ação.
4. Ações usam funcionalidades, não o nome do perfil. Exemplos: `orcamentos.consultar`, `orcamentos.gerir`, `orcamentos.liberar_saldo`, `organizacao.acessos.gerir`.
5. Não há concessão ou negação individual de funcionalidade na primeira versão. Para uma exceção, criar e atribuir outro perfil.
6. Permissão de grupo econômico só permite as ações declaradas de consulta/exportação consolidada; não concede mutação operacional em empresas.
7. Token contém `user_id`, `active_tenant_id`, perfil(is), funcionalidades efetivas e `permission_version`. O mestre omite o tenant. Cada serviço valida assinatura, tenant e versão.
8. Alterar um perfil ou uma atribuição incrementa `permission_version`, revoga cache de autorização e cria auditoria.
9. Impersonação é exclusiva do Administrador da empresa, exige justificativa e auditoria na API real. O seletor do mockup é somente visualização de teste.

## Endpoints mínimos

```text
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/me
PUT  /api/session/active-tenant

GET  /api/tenants
POST /api/tenants
PATCH /api/tenants/{id}
GET  /api/economic-groups
POST /api/economic-groups
PATCH /api/economic-groups/{id}

GET  /api/functionalities
GET  /api/access-profiles
POST /api/access-profiles
PATCH /api/access-profiles/{id}
POST /api/users/{id}/profiles
DELETE /api/users/{id}/profiles/{profileId}
GET  /api/access-audits
```

Todo endpoint mutável exige `organizacao.acessos.gerir`, exceto o fluxo do próprio usuário para login, logout e escolha de empresa autorizada.

## Integração com os módulos

Os módulos não leem o schema `t2_core`. Eles recebem o token validado e usam o contexto assinado. Quando precisarem consultar identidade ou empresa, chamam o código do módulo Core no mesmo Laravel. Cada request, job, evento, log e auditoria carrega `user_id` e `tenant_id`.
