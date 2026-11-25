# Integração Vivere Admin × Engine (STAGING)

Estado: preparação, sem deploy. Fonte operacional: [Issue #3](https://github.com/menezeed/vivere-60plus-admin/issues/3).

## Situação observada em 25/11/2026
- O `index.html` do Admin é uma SPA estática que faz CRUD via `/rest/v1` do Supabase diretamente no navegador.
- A Review API do Engine ainda não tem URL de hospedagem em produção confirmada (Engine issue #46).
- Portanto, NÃO apontar uma nova integração diretamente para production sem validar contrato de API, autenticação e RBAC.

## Contrato a levantar antes do primeiro commit funcional
| Tela do Admin | Situação atual | Futuro uso do Engine |
| --- | --- | --- |
| Atividades | CRUD direto | fila de revisão, detalhe e decisão auditada |
| Locais | CRUD direto | revisão/associação de venue |
| Sugestões | CRUD direto | workflow de triagem |
| Parceiros, categorias, usuários | CRUD direto | manter legado temporariamente até auditoria de acessos |

## Guardrails para Codex/Claude
1. Usar exclusivamente API de staging verificada e perfis de acesso de teste.
2. `REVIEW_API_ENABLED` deverá ser false por padrão; sem fallback implícito para banco de produção.
3. Não inserir `service_role` nem outros segredos em HTML ou JavaScript do browser.
4. Primeiro implementar consultas da fila em modo read-only; nenhuma ação de aprovação/rejeição até aceite de RBAC e autorização específica.
5. Tratar 401/403/409, indisponibilidade, CORS, sessão expirada e entradas sem local.
6. CI/testes direcionados e plano de rollback pela flag, sem repetir testes já aprovados.
7. Sem merge de `main`, Pages deploy, migrações, alterações de cloud, mudanças no Android ou publicação.

## Critério para iniciar código funcional
- Endpoint e contrato reais da Review API em staging identificados.
- Role mapping autenticado documentado.
- Acesso read-only e segregação de ambientes comprovados.
- PR independente de frontend com testes e documentação de configuração.

Nenhuma alteração funcional neste documento.
