# Auditoria e plano — novo motor de prioridade por matéria

## Objetivo e limites

Criar um motor determinístico, versionado e explicável que produza, para cada assunto, `priority_score` de 0–100, `knowledge_state` e um motivo legível. O motor será genérico para estudos de residência médica, sem regras específicas do ENAMED, IA, ML ou FSRS.

Nesta etapa, o novo motor substituirá apenas a prioridade **por assunto**. A urgência própria de cada baralho e as cores de vencimento do calendário continuarão separadas, mas poderão fornecer sinais ao assunto. A integração Anki, notificações, tarefas acionáveis e gamificação ficam pausadas até esta frente ser aprovada e concluída.

## Auditoria do estado atual

### Dados relacionados

- `disciplines`: grande área (`id`, `user_id`, `name`, `color`). As cinco áreas médicas são criadas pela interface; registros antigos são preservados.
- `subjects`: assunto/subassunto e estado atual (`discipline_id`, `parent_id`, `name`, `mastery`, `exam_incidence`, `first_studied_at`, `last_studied_at`, `next_review_at`, `review_count`, `interval_days`, `ease`, `reps`, `lapses`, `stability`, `difficulty` e datas do checklist de preparo).
- `question_logs`: blocos agregados de questões (`subject_id`, `discipline_id`, `banca`, `year`, `total`, `correct`, `created_at`). Não existem tentativas individuais nem tags de tipo de erro.
- `reviews`: avaliações de revisão do assunto (`subject_id`, `rating`, intervalos anterior/novo, `reviewed_at`).
- `study_sessions`: contatos de estudo (`subject_id`, `activity_type`, `minutes`, `started_at`).
- `anki_decks`: baralhos ligados opcionalmente ao assunto, com status, intervalo, última/próxima revisão e dados de sincronização.
- `deck_sessions`: sessões de baralho, com rating e, quando informado, cartões corretos/total.
- `exam_topics`: incidência extraída de análises de prova, em texto; não possui vínculo por chave com `subjects`.

Não existe hoje `priority_score` ou `knowledge_state` persistido. `subjects.exam_incidence` (1–5) é o único campo de incidência diretamente ligado ao assunto.

### Cálculos atuais

- `questionPriority`: prioridade ativa por assunto baseada em acurácia, erros dos últimos 30 dias e `exam_incidence`.
- `deckPriority`: prioridade independente por baralho, baseada em atraso, último acesso, intervalo e acurácia das sessões.
- `dayUrgency`: cor de vencimento no calendário.
- `priorityScore`: cálculo genérico antigo sem consumidores; é código inativo.
- `mastery`: valor persistido e alterado por três fórmulas diferentes: rating da revisão do assunto, média móvel 80/20 após questões e deltas/rating de baralho.
- Para assuntos-pai, a interface mostra a média de `mastery` dos filhos, embora o banco mantenha outro valor no pai.

### Telas e fluxos afetados

- **Hoje/dashboard:** ranking por assunto, revisões atrasadas, recomendações de baralhos e painel de padrões.
- **Assuntos:** etiqueta de prioridade, domínio e hierarquia.
- **Detalhe do assunto:** domínio, desempenho, próxima revisão, histórico e avaliação SRS.
- **Revisões:** ordenação da fila e etiqueta de prioridade.
- **Baralhos:** prioridade própria e sessões que hoje também alteram `mastery` do assunto.
- **Questões:** registro de blocos, início do ciclo e alteração de `mastery`.
- **Calendário:** consome vencimentos de assuntos/baralhos, mas não o score por assunto.
- **Gráficos e análise de provas:** consomem `mastery`, acurácia e incidência; não precisam trocar de métrica nesta primeira entrega.
- **Recomendações e padrões:** possuem limiares paralelos que devem passar a consumir o resultado explicável do novo motor quando se referirem a assuntos.

### Situação dos dados atuais

- 45 assuntos: 34 raízes e 11 subtópicos.
- Apenas 1 assunto possui `mastery` diferente de zero; nenhum avançou no SRS de assunto.
- Não há registros de questões, revisões de assunto ou sessões de estudo no banco atual.
- Há 10 baralhos, todos ligados a assuntos, e 3 sessões de baralho; essas sessões não têm correto/total preenchido.

Assim, o recálculo inicial é de baixo risco: a maioria dos assuntos começará como `NEW`; sessões de baralho podem contar como contato, mas não como evidência de acurácia quando não têm correto/total.

## Especificação proposta do motor

### Constantes centralizadas e versionadas

Um único módulo de configuração conterá pesos e limiares, incluindo:

- pesos: questões `0.40`, atraso `0.25`, erros `0.25`, estabilidade `0.10`;
- confiança: `0→0`, `1–4→0.10`, `5–9→0.30`, `10–19→0.55`, `20–39→0.80`, `40+→1.00`;
- amostra recente: no máximo 30 questões nos últimos 60 dias;
- deterioração: mínimo 10 questões recentes, mínimo 20 questões anteriores e queda mínima de 10 pontos percentuais;
- demais cortes de estado, limites de atraso, erro recorrente e faixas visuais;
- `ENGINE_VERSION`, salvo com cada cálculo para permitir recalibração e recálculo controlado.

**Assunção proposta para aprovação:** “histórico prévio suficiente” em `DETERIORATING` será definido inicialmente como **20 questões anteriores à amostra recente**. Esse corte ficará configurável.

### Formação da amostra recente

1. Considerar apenas blocos dos últimos 60 dias, do mais novo ao mais antigo.
2. Consumir até 30 questões.
3. Como os dados atuais são agregados por bloco, se o bloco de fronteira ultrapassar 30, alocar acertos proporcionalmente à taxa daquele bloco e marcar `sample_is_estimated=true`.
4. O restante proporcional desse bloco e todos os blocos anteriores formam o histórico de base.
5. Nenhum registro histórico será alterado ou apagado.

Essa aproximação é necessária porque o schema atual não informa a ordem de cada questão dentro de um bloco. Uma futura captura questão a questão poderá remover a estimativa sem mudar a fórmula do motor.

### Componentes do score

`priority_score = round(question_component + overdue_component + error_component + stability_component)`, limitado a 0–100.

1. **Desempenho recente — até 40 pontos**
   - `raw_gap = 100 - recent_accuracy`.
   - `question_component = 40 × raw_gap/100 × sample_confidence`.
   - Sem questões recentes: componente zero e confiança zero; ausência de evidência nunca será tratada como domínio nem como lacuna forte.

2. **Tempo desde contato/revisão — até 25 pontos**
   - Fonte de contato: data mais recente entre estudo, questões, revisão do assunto, sessão de baralho ligado e checklist de preparo.
   - Fonte de vencimento: maior risco entre `subjects.next_review_at` e baralhos vinculados vencidos.
   - Antes do vencimento: zero; no dia: risco inicial; atraso cresce linearmente até o teto configurado de 30 dias.
   - Sem vencimento, mas com contato: a antiguidade começa a pesar após 14 dias e atinge o teto em 60 dias.
   - Sem qualquer contato: zero aqui e classificação `NEW`, evitando transformar assuntos nunca iniciados em urgências artificiais.

3. **Erros recentes/recorrentes — até 25 pontos**
   - 60% do componente: volume de erros na amostra recente, atingindo o teto em 10 erros.
   - 40%: recorrência, medida pela proporção dos três blocos recentes com acurácia abaixo de 70%.
   - Poucos erros/blocos geram poucos pontos; os cortes também ficam nas constantes.

4. **Estabilidade/tendência — até 10 pontos**
   - 70%: risco de queda entre acurácia histórica de base e recente, normalizado até uma queda de 20 pontos.
   - 30%: proporção de ratings `Novamente`/`Difícil` nas últimas cinco revisões do assunto e sessões de baralhos ligados.
   - Sem base comparável ou ratings: zero, sem inventar instabilidade.

`exam_incidence` e `exam_topics.incidence_pct` serão preservados, mas ficarão fora deste score porque os quatro pesos obrigatórios já totalizam 100%. Continuarão disponíveis nas análises de prova.

### `knowledge_state` e motivo explicável

Aplicar as regras nesta ordem, com todos os cortes centralizados:

1. `NEW`: nenhum contato e nenhuma evidência de questões/revisões.
2. `PERSISTENT_GAP`: pelo menos 10 questões recentes e 20 anteriores, acurácia recente abaixo de 60% e base histórica também abaixo de 70%.
3. `DETERIORATING`: pelo menos 10 questões recentes, pelo menos 20 anteriores e queda de 10 ou mais pontos entre a base e o recente. Nunca dispara abaixo desses mínimos.
4. `STABLE`: pelo menos 20 questões recentes, acurácia de 80% ou mais, sem queda relevante e sem recorrência alta de ratings difíceis.
5. `FRAGILE`: assunto iniciado com baixa confiança, acurácia recente abaixo de 70%, recorrência de erros ou atraso relevante, sem cumprir os critérios mais fortes acima.
6. `CONSOLIDATING`: assunto iniciado com evolução adequada, mas ainda sem evidência suficiente para `STABLE`.

O motivo será gerado por templates com números reais, por exemplo: “Acurácia recente de 58% em 12 questões; confiança de 55% e 18 dias de atraso.” A tela nunca exibirá apenas o rótulo.

### Hierarquia

- Cada assunto/subassunto terá cálculo próprio com seus registros diretamente vinculados.
- Se um assunto-pai não tiver evidência direta, ele receberá uma síntese dos filhos: score pela média ponderada pela confiança, estado pelo filho de maior risco e motivo indicando agregação.
- Se o pai tiver evidência direta, ela não será misturada silenciosamente com os filhos; a tela mostrará o cálculo direto e um resumo separado dos subtópicos.

## Schema proposto

Criar `subject_priority_snapshots`, uma linha por usuário/assunto:

- chaves: `subject_id` (único e FK), `user_id` (FK);
- resultado: `priority_score`, `knowledge_state`, `reason`;
- componentes: `question_score`, `overdue_score`, `error_score`, `stability_score`;
- evidência: `recent_questions`, `recent_accuracy`, `historical_questions`, `historical_accuracy`, `sample_confidence`, `sample_is_estimated`;
- auditoria: `engine_version`, `calculated_at`.

A tabela terá `CHECK` para score 0–100 e estados válidos, índice por usuário/score, acesso apenas ao próprio usuário e permissões explícitas para usuários autenticados e serviço interno.

Não remover nem reutilizar `mastery`, campos SRS, `exam_incidence` ou históricos. O snapshot é recalculável; as tabelas de eventos continuam sendo a fonte da verdade.

## Onde os cálculos rodarão

- Fórmula pura e testável em um módulo único do motor; nenhuma tela terá pesos ou cortes próprios.
- Uma função autenticada do servidor carregará todo o histórico do usuário com paginação, calculará e fará `upsert` dos snapshots.
- O hook de leitura do app chamará essa função e devolverá resultados prontos para todas as telas.
- Após registrar questões, revisão de assunto, estudo, preparo ou sessão de baralho, a consulta do motor será invalidada e recalculada. Isso evita resultados locais divergentes entre dispositivos.
- O cálculo não dependerá dos limites atuais dos hooks de tela (1.000 questões/500 revisões), preservando o histórico completo.

## Alterações de interface previstas

- **Hoje:** ranking único de assuntos pelo novo score, estado e motivo; recomendações passam a usar esse resultado. O ranking separado de baralhos continua existindo.
- **Assuntos:** substituir a etiqueta calculada por `questionPriority` pelo score/estado novo; pais mostram claramente quando o valor é agregado dos filhos.
- **Detalhe do assunto:** adicionar score, estado, motivo, confiança/amostra e decomposição 40/25/25/10; manter domínio e SRS como informações separadas.
- **Revisões:** ordenar assuntos pendentes pelo novo score, sem mudar datas nem os quatro ratings do SRS.
- **Padrões identificados:** reutilizar estados e motivos para evitar alertas contraditórios; padrões por banca continuam independentes.
- **Calendário:** manter cores por vencimento e fluxos atuais; apenas consumir recálculo após uma conclusão, sem substituir urgência diária pelo score.
- **Questões, baralhos e temporizador:** sem redesenho; somente garantir recálculo após gravações relevantes.
- **Gráficos/análise de provas:** manter `mastery` e incidência nesta entrega; uma migração visual posterior poderá ser avaliada sem misturar conceitos agora.

## Migração e riscos

1. Criar a tabela de snapshots sem alterar tabelas históricas.
2. Implementar motor e testes antes de trocar consumidores.
3. Fazer recálculo inicial de todos os assuntos pela função autenticada, nunca por `INSERT` fixo na migração.
4. Trocar os quatro cálculos duplicados de ranking por um único hook.
5. Manter temporariamente `questionPriority` apenas para comparação interna; remover o código morto/legado somente após validar equivalência de telas.
6. Não usar `mastery` como entrada do score: ele foi produzido por fórmulas concorrentes e diverge em assuntos-pai.
7. Tratar registros sem `subject_id` como métricas gerais, não como evidência de uma matéria.
8. Testar concorrência de gravações e impedir que um snapshot antigo sobrescreva cálculo mais novo.
9. Exibir “amostra estimada” quando houver corte proporcional de bloco.

## Validação antes da entrega

- Testes unitários para todas as faixas de confiança e limites exatos (0/1/4/5/9/10/19/20/39/40).
- Testes da janela de 30 questões/60 dias e corte proporcional de bloco.
- Testes de `DETERIORATING`: 9 recentes, 19 históricas e queda de 9 pontos não disparam; 10 recentes, 20 históricas e queda de 10 disparam.
- Testes de score sempre entre 0 e 100, soma dos quatro componentes e motivos coerentes.
- Testes para histórico vazio, dados antigos, baralho sem acurácia, múltiplos baralhos e hierarquia pai/filho.
- Comparação dos resultados antigos e novos em modo de auditoria antes de substituir as etiquetas.
- Verificação visual mobile/desktop em Hoje, Assuntos, detalhe e Revisões; validação de tipos e build.

## Decisões incluídas para aprovação

- Histórico prévio suficiente para deterioração: 20 questões.
- Blocos agregados serão cortados proporcionalmente ao completar as últimas 30 questões e identificados como estimativa.
- Assunto-pai sem evidência direta agregará filhos; pai com evidência direta manterá cálculo próprio.
- `exam_incidence` será preservado, mas não participará do novo score.
- `mastery` e SRS continuarão funcionando separadamente; o novo motor não os sobrescreverá.
