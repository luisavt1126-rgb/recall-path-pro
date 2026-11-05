# Caderno de Erros — Fase 0 (auditoria) e plano

## Auditoria: o que já existe

- **Hierarquia de assuntos** já existe e será reaproveitada: `disciplines` (Grande área / Especialidade, com a lista fixa em `src/lib/areas.ts`) → `subjects` (aulas, com `parent_id`) → `subject_subtopics` (subassuntos opcionais). Nenhuma lista paralela será criada.
- **Já existe um caderno de erros básico**: tela `/erros` e tabela `question_errors` (assunto, subassunto, quantidade, motivo, "o que errei", nota, status `ativo / em_melhora / resolvido / recorrente`, datas). Hoje ela **está vazia** (0 registros), então não há dados a migrar nem risco de perda.
- Outros pontos que já usam essa tabela:
  - `QuestionErrorSection` (detalhe do assunto) e `ReviewRecorder` → `errorReconciliation.ts`: ao registrar questões com ≥ 80% de acerto, os erros do assunto avançam de status automaticamente.
  - `assuntos.index.tsx`: apaga os erros ao excluir um assunto.
- **Motivos atuais** (`ERROR_REASONS` em `data.ts`): 7 opções livres — diferentes das 4 origens pedidas.
- **Ligação com o Priority Engine já existe**: `priorityEngine.ts` recebe `manualErrors` (data, quantidade, motivo, status) e eles entram só no componente `error_score` (0–25), com peso por status (`resolvido` = 0, `em_melhora` = 0,5). `knowledge_state` e o motivo legível não leem o caderno diretamente. Não há `recommended_action` persistido hoje.
- **Questões** (`question_logs`) são blocos agregados (total/acertos por assunto e banca); continuam separados — o caderno registra erros individuais.
- Faltam no banco hoje: banca, ano, questão de referência, correção, como evitar, origem padronizada, prioridade Alta/Média/Superado, data do erro escolhida pela usuária e histórico de revisões do segundo ciclo.

## Decisão principal

**Evoluir a tabela `question_errors` existente** (só adicionando campos) em vez de criar uma nova. Assim, o motor de prioridade, o detalhe do assunto e a reconciliação automática continuam funcionando sem duplicação. Para o histórico do segundo ciclo, criar uma tabela nova pequena só de revisões.

## Migrações (só aditivas, nada apagado)

1. `question_errors` — novos campos opcionais/com padrão:
   - `banca` (texto), `exam_year` (inteiro)
   - `question_ref` (texto), `correction` (texto), `how_to_avoid` (texto)
   - `origin` (texto: `desconhecimento`, `confusao`, `esquecimento`, `interpretacao`; padrão `desconhecimento`)
   - `priority` (texto: `alta`, `media`, `superado`; padrão `media`)
   - `error_date` (data, padrão hoje)
   - `last_reviewed_at`, `review_count` (padrão 0)
   - índices por usuário + prioridade e usuário + data
   - Campos antigos (`reason`, `what`, `note`, `status`, `error_count`) permanecem; `what` passa a ser usado como "descrição do erro".
2. Nova tabela `question_error_reviews`: `user_id`, `error_id` (apaga junto com o erro), `outcome` (`superei` / `ainda_erro`), `reviewed_at`. Mesmo padrão de acesso do resto do app (cada usuária só vê os próprios dados). Nenhuma regra de acesso existente é alterada.

## Regras de domínio (funções puras centralizadas)

Novo `src/lib/errorNotebook.ts` (sem React/banco), com testes:
- Constantes: origens, prioridades, bancas sugeridas (ENARE/ENAMED, HCPA, UFCSPA/Santa Casa POA, USP-RP, USP-SP, SUS-SP, Outra — campo editável).
- Sincronia prioridade ↔ status antigo: `superado` ⇄ `resolvido`; reconciliação automática por questões passa a poder rebaixar Alta → Média → Superado, mantendo a mesma lógica de hoje.
- Fila do segundo ciclo: só não superados; Alta antes de Média; dentro disso, nunca revisados primeiro, depois a revisão mais antiga, depois o erro mais antigo.
- Filtros combinados (texto, área, banca, origem, prioridade, período) e agrupamento área → especialidade → aula.
- Estatísticas do painel: total, % superados, contagens por área/banca/origem/prioridade, série semanal registrados vs. superados.
- Backup: formato JSON versionado; importação valida campos, casa assuntos pelo id ou pelo nome da hierarquia e ignora duplicados (não sobrescreve nada).

## Ligação com o Priority Engine (sem misturar conceitos)

- O caderno alimenta **somente** o componente `error_score` ("erros recentes/recorrentes"), como já acontece.
- Ajustes: usar `error_date` (não a data de cadastro) para a janela de recência; peso por prioridade (Alta 1, Média 0,6, Superado 0) em constantes do motor; cada "Ainda erro" no segundo ciclo conta como sinal de recorrência.
- `knowledge_state` continua derivado de questões/revisões; `priority_score` só muda via `error_score`; nenhuma ação recomendada é gravada a partir do caderno. A versão do motor sobe e os resumos são recalculados após cada gravação (como hoje).

## Telas (visual atual, mobile-first)

`/erros` vira uma seção com abas no topo:
- **Meus erros** (`/erros`): botão "Registrar erro", busca, filtros combinados (em gaveta no celular), lista agrupada Área → Especialidade → Aula, editar e excluir com confirmação.
- **Formulário de registro/edição**: Área → Especialidade → Aula (e subassunto opcional), banca, ano, questão, descrição do erro, correção, como evitar, origem (obrigatória), prioridade, data (hoje por padrão).
- **Segundo ciclo** (`/erros/revisao`): um erro por vez, correção oculta até "Revelar correção", botões "Superei" e "Ainda erro", contador de restantes.
- **Painel** (`/erros/painel`): totais, % superados, gráficos por área, banca, origem, prioridade e evolução semanal (mesma biblioteca de gráficos já usada).
- Exportar/importar JSON no painel.
- O formulário rápido no detalhe do assunto continua existindo, passando a usar as novas origens/prioridade.

## Arquivos

Criar: `src/lib/errorNotebook.ts`, `src/lib/errorNotebook.test.ts`, `src/lib/errorNotebook.backup.ts`, `src/components/errors/ErrorForm.tsx`, `ErrorFilters.tsx`, `ErrorList.tsx`, `ErrorReviewCard.tsx`, `ErrorCharts.tsx`, rotas `erros.index.tsx`, `erros.revisao.tsx`, `erros.painel.tsx`.

Modificar: `erros.tsx` (vira o contêiner com abas), `data.ts` (hooks de revisões; `ERROR_REASONS` substituído pelas origens), `errorStatus.ts`, `errorReconciliation.ts`, `QuestionErrorSection.tsx`, `ReviewRecorder.tsx`, `priorityEngine.ts` / `.input.ts` / `.batch.ts` / `.service.ts` e seus testes, `roadmap.md`, `AGENTS.md`.

## Riscos de regressão

- Testes do motor que fixam valores de `error_score` mudam com os novos pesos — serão atualizados com valores explícitos.
- Detalhe do assunto e registro de questões gravam erros: precisam preencher origem/prioridade padrão.
- Converter `/erros` em seção com abas mantém o mesmo endereço; links existentes continuam válidos.
- Motivos antigos: como a tabela está vazia, não há conversão necessária; ainda assim um mapeamento simples motivo → origem fica na função pura para importações.

## Fora do escopo

Redesign de outras telas, mudanças de login/acesso, IA, e qualquer exclusão de dados ou campos.
