---
name: simple-spec
description: Use essa skill sempre que for planejar um novo projeto ou task, especificar uma feature ou implementar uma nova feature que ainda não foi planejada
---

# simple-spec

Planejar e parar. O sim abre os checks. O código começa quando o `implement.md` fecha. A feature pronta passa pelo passo Verifier, no máximo 3 vezes.

Termos de domínio saem de `CONTEXT.md`, em inglês. O que já está decidido em `AGENTS.md` e em `CONTEXT.md` não se reabre.

## Planejar

O problema diz o que dói hoje, quem paga e quanto custa. A solução fica fora dessa frase.
Fatos você descobre no código. Pergunta só decisão de produto: escopo, comportamento, trade-off.
Cada fatia é um resultado que dá para mostrar sozinho. A primeira é a que precisa existir para a feature fazer sentido.
Cada critério é uma frase EARS, um comportamento, com valor concreto: status, campo ou limite.
Padrões: sempre (SHALL), WHEN, WHILE, WHERE, IF. Falha e borda são critério, não nota.
A decisão técnica é só o que custa caro desfazer. Uma linha: a forma literal, e a alternativa rejeitada com o motivo.
Pasta, nome de classe e método ficam para o código.
O que ficou de fora entra numa lista, com o motivo.
A pessoa confirma o plano antes de existir qualquer check.
Design das tabelas e contrato de API.

Antes de escrever o plano, lê `CONTEXT.md`, `AGENTS.md` e o código que a feature toca. Fato que o código já responde não vira pergunta.

Decisão de produto ainda aberta: pergunta essa e para. Não entrega o plano no mesmo turno. Uma mensagem, só o que falta decidir. Cada pergunta traz a resposta que você recomenda e o motivo, em uma linha, a partir do código e do glossário. A pessoa decide; a recomendação não vira decisão sozinha.

Com as decisões fechadas, grava o plano em `.specs/<feature-name>/spec.md` e para. `<feature-name>` é kebab-case, em inglês, o termo da feature. O arquivo usa as seções abaixo, nesta ordem. Não cria a pasta enquanto houver pergunta aberta.

### Problema

Uma frase: o que dói hoje, quem paga, quanto custa. Sem solução, sem endpoint, sem tabela.

### Fatos

O que o código e o glossário já fazem. Cada fato cita o arquivo.

### Fatias

Lista ordenada. Cada item é um resultado que a pessoa vê funcionando sozinho. A primeira é a que precisa existir para a feature fazer sentido. Fatia não é camada: rota, service, tabela ou tela vazia não contam.

### Critérios

Um comportamento por frase, no padrão que couber:

- sempre: The system SHALL …
- WHEN …, the system SHALL …
- WHILE …, the system SHALL …
- WHERE …, the system SHALL …
- IF …, THEN the system SHALL …

Valor concreto na frase: status (`400`, `409`), campo (`sku`) ou limite (`quantity > 0`). Falha e borda são critério. Agrupa os critérios debaixo da fatia que os entrega.

### Decisões

Só o que custa caro desfazer. Uma linha por decisão.

`Forma: …. Rejeitada: …, porque ….`

Sem pasta, classe ou método.

### Fora

Cada item com o motivo. O que já está em "Out of scope" no `ROADMAP.md` não se reabre; cita se a feature esbarrar nele.

### Tabelas

Tabela, coluna, tipo, nulo, unique, referência, índice único. Sem export, sem caminho de código. Nenhuma tabela nova: uma linha dizendo isso e o motivo.

### Contrato

Método e caminho sob `/api`. Campos do body. Status e corpo da resposta. Erro `{ error, statusCode }`. Status que este repositório já usa: `200` com `[]`, `201`, `400`, `409`, `204`, `404`. Nenhum endpoint novo: uma linha dizendo isso e o motivo.

## Parar

O plano é `.specs/<feature-name>/spec.md`. Até a pessoa confirmar, não existe check: nenhum teste, nenhum código. O único arquivo novo é a spec.

Confirmação é um sim explícito ao plano ("confirma", "pode implementar", "aprovado"). Pergunta, silêncio ou edição não confirmam. Se a pessoa mudar o plano, reescreve a spec e para de novo.

Pedido de implementar sem plano confirmado nesta conversa: planeja e para.

## Checks

Só depois do sim ao plano. Lê `.specs/<feature-name>/spec.md` e grava `.specs/<feature-name>/implement.md`. Não há segundo sim: o plano aprovado autoriza esse arquivo.

O check copia o plano. Não inventa requisito.
Cada check é uma afirmação observável, com valor concreto, mais o teste que a decide.
A prova é um teste específico que o projeto já sabe rodar. A suíte inteira não conta.
Sem valor concreto ou sem prova nomeável, pergunta. Não chute.
Toda rota, todo status e toda decisão difícil de desfazer do plano aparece num check.
O arquivo fecha antes da primeira linha de código.

Pergunta aberta impede fechar o `implement.md` e impede código. A pergunta traz a prova que você recomenda e o motivo, em uma linha. A pessoa decide.

Um check, uma afirmação. Quando o mesmo status precisa das duas provas do `AGENTS.md`, são dois checks: o ramo no service (`src/services/<recurso>.service.test.ts`, `sinon.createStubInstance` do repository, sem IO) e o contrato HTTP ou o índice único (`test/<recurso>.integration.test.ts`, `createServer()`, `fastify.inject()`, SQLite). Integração verde não substitui a suite do service. Repository não tem suite. Tela: a prova é o fluxo Playwright em `http://localhost:5173` — clicar, digitar, enviar, navegar — e não vira arquivo no git.

Ordem das fatias do plano. Cada linha:

`- [ ] <afirmação com o valor concreto> — prova: <arquivo ou fluxo> > "<nome do teste>"`

## Implementar

O `implement.md` já fechou. Um pedaço é um check, logo um commit. O primeiro check aberto da primeira fatia.

O teste nasce do check, com o valor que o check nomeou.
Escreve o teste com o valor do check e o código mínimo para essa prova passar. A prova que vale é a de depois: se continuar vermelha, o pedaço para. O teste nunca se enfraquece.
O que não está num check não se mexe.
Um commit coerente por pedaço. O check se marca feito nesse mesmo commit.
Plano aprovado autoriza editar e commitar no local. Push e deploy pedem um sim próprio.

O fio que a prova precisa para rodar (tabela, rota registrada, `container.clear()` antes de um segundo `createServer()`) entra nesse pedaço. Pasta, classe e método nascem aí, copiando o trio `routes/` → `services/` → `repositories/`. Comportamento que nenhum check nomeou continua intocado.

Marca feito trocando `- [ ]` por `- [x]` na mesma linha, no mesmo commit do pedaço. O último check de um item do `ROADMAP.md` marca esse item done no mesmo commit.

Decisão tomada neste pedaço que a spec não diz: anota em `.specs/<feature-name>/state.md`, no mesmo commit. Uma linha, a forma literal e a alternativa rejeitada com o motivo. O que a spec já decidiu não entra de novo. Pasta, classe e método não entram. O arquivo nasce na primeira decisão.

`Forma: …. Rejeitada: …, porque ….`

O código contradiz o plano confirmado: para e diz a contradição. Não troca a decisão no meio do pedaço e não anota a troca no `state.md`.

Quando todo check do `implement.md` está feito, no mesmo turno, sem perguntar, segue para o passo Verifier. Não abre subagente.

## Verifier

Passo desta skill. Não é um agent.

1. Quem implementou não verifica. O verificador começa sem a conversa anterior.
2. Dispara depois da implementação da feature, no mesmo turno, sem perguntar.
3. Recebe três coisas: o plano, os checks e o diff da feature inteira.
4. Só lê. Não corrige nada.
5. Roda cada prova de novo. "Já passou" não conta.
6. Para cada check, a asserção no teste tem o valor que o check nomeou. Cita `arquivo:linha`. Sem essa linha, o check não está provado.
7. Escreve o veredito: passou ou falhou, um por check.
8. Falha volta para quem pediu a implementação. O verificador não implementa o conserto.

Neste passo o que vale é relido agora: `.specs/<feature-name>/spec.md`, `.specs/<feature-name>/implement.md`, `.specs/<feature-name>/state.md` se existir, e o diff `git diff <base>..HEAD` mais o que ainda não está commitado. `<base>` é o commit anterior ao primeiro commit da feature. A memória de que a prova passou não conta.

O único arquivo que este passo escreve é `.specs/<feature-name>/result.md`. Não edita spec, checks, `state.md`, teste, código, nem `ROADMAP.md`. Não commita.

A prova nomeada no check roda de novo. Teste da API: em `apps/api`, `bun test <arquivo> -t "<nome do teste>"`. A suíte inteira não conta. Tela: repete o fluxo Playwright em `http://localhost:5173` — clicar, digitar, enviar, navegar. Um resultado antigo não conta.

Depois da corrida, abre o teste e acha a asserção. O valor concreto do check tem de estar nessa asserção. Cita `arquivo:linha`. Sem essa linha, o check falhou, mesmo com a prova verde. Prova que não rodou ou valor diferente do check: falhou.

Um por check, na ordem do `implement.md`. Sobrescreve o `result.md`:

```markdown
# Veredito

Rodada: N

- passou: <afirmação do check> — `arquivo:linha`
- falhou: <afirmação do check> — <motivo>
```

No máximo 3 rodadas.

- Todos passaram: para e entrega o arquivo.
- Algum falhou e a rodada é 1 ou 2: volta para Implementar e conserta só os checks falhos, um commit por check. Este passo não conserta. A rodada seguinte relê o diff e roda as provas de novo.
- A rodada 3 ainda falhou: para e entrega o `result.md`. Não há quarta rodada.

## Exemplo

Problema ruim: "Criar POST /api/items para cadastrar material." A solução está na frase.

Problema: "Two materials share a name, so the warehouse issues the wrong Item and the Job stops."

Fatia 1: Catalog shows the new Item after the Operator saves SKU, name, and Unit.

Critério: WHEN `sku`, `name`, and `unit` are present, the system SHALL respond `201` and SHALL return the Item with that `sku`.

Critério: IF `sku` is missing, THEN the system SHALL respond `400` and SHALL NOT create an Item.

Decisão: `Forma: SKU is a unique column on items. Rejeitada: lookup by name, porque two Items can share a name.`

Fora: quantity on the Item — quantity belongs on Stock, not on the Catalog.

Check: `- [ ] WHEN sku, name, and unit are present, the system responds 201 and returns the Item with that sku — prova: test/items.integration.test.ts > "POST /api/items returns 201 with the sku"`
