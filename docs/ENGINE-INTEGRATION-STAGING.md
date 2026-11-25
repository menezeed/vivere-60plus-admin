# Integração Vivere Admin × Engine (STAGING)

Estado da fase 1: fila e adapter preparados, flag desligada e configuração de staging por preencher. Fonte operacional: [Issue #3](https://github.com/menezeed/vivere-60plus-admin/issues/3).

## Situação observada em 25/11/2026
- O `index.html` do Admin é uma SPA estática que faz CRUD via `/rest/v1` do Supabase diretamente no navegador.
- A Review API do Engine ainda não tem URL de hospedagem em produção confirmada (Engine issue #46).
- Portanto, NÃO apontar uma nova integração diretamente para production sem validar contrato de API, autenticação e RBAC.

## Âmbito da integração
| Tela do Admin | Situação atual | Futuro uso do Engine |
| --- | --- | --- |
| Atividades | CRUD direto do catálogo publicado | fila separada de staging via `GET /api/activities` |
| Locais | CRUD direto do catálogo publicado | fila separada de staging via `GET /api/venues` |
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

## Ativação futura em staging

O Claude confirmou as rotas, filtros e formato de paginação no [contrato do Engine, PR #51](https://github.com/menezeed/vivere-engine/pull/51). A [revisão do PR #4](https://github.com/menezeed/vivere-60plus-admin/pull/4#issuecomment-7168633847) confirma que a API ainda não tem hospedagem e que esta fase usa mocks. Para ativar, faltam a origem HTTPS hospedada, uma conta de staging com papel `viewer` e o CORS liberado para a origem isolada do Admin de teste.

Preencher `REVIEW_API_STAGING_CONFIG` em `index.html` na versão isolada de staging, após revisão do contrato:

- `stagingOrigin` é a origem HTTPS exata, sem caminho nem barra final. `stagingIssuer` é o emissor HTTPS exato do JWT de staging.
- O adapter usa `page`, `pageSize=20`, `status` e `totalPages` conforme o contrato. O filtro Pendente envia `pending_review`. A indicação de local da atividade, quando presente, vem de `venue_mention_raw_text`.
- `getStagingToken()` obtém o token efêmero da sessão dedicada de staging. O adapter verifica emissor e expiração antes de enviar o token. A assinatura e o papel são validados pela API. A sessão do Admin legado permanece independente.

O navegador consulta somente por GET, sem cookies e com redirecionamentos rejeitados. A flag `REVIEW_API_ENABLED` controla a aba adicional e seu carregamento. O rollback consiste em voltar a flag para `false` e a configuração para `null`.

Execute `node --test tests/review-queue.test.js` na raiz. Os testes usam respostas e JWTs sintéticos, sem acesso à API ou ao banco.

## Checklist de QA em staging

- Com a flag desligada, conferir as seis abas existentes, login e ausência de pedidos à Review API.
- Com o host e a sessão dedicada verificados, conferir as duas listas, os três estados, paginação, lista vazia e atividade sem indicação de local.
- Conferir a saída com sessão expirada e após 401, permissão ausente (403), conflito (409) e falha de CORS. A renovação, se disponível, deve ocorrer no cliente de autenticação de staging e no máximo uma vez por pedido.
- Confirmar no navegador que os pedidos usam GET, a origem isolada e somente a sessão de staging. Reverter pela flag e confirmar que a aba desaparece.
