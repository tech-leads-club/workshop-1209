# Fake ERP

Sistema de aula para mostrar como desenvolver software com IA.

Não é um produto. É o código em que a turma trabalha: um ERP de traders/contractors o bastante real para ter domínio, API e tela, e o bastante simples para a aula não virar configuração.

O recorte futuro é o de um ERP de obra e fornecimento: staff, clientes, warehouse, items e procurement. Cada aula acrescenta uma fatia nesse sistema, em vez de começar um playground novo.

A stack (Vite, Fastify, Bun, SQLite) existe para isso: pouca cerimônia, contrato HTTP visível, um repositório só.

## Stack

- Web: Vite + React + TypeScript
- API: Bun + Fastify + Drizzle + SQLite
- DI: container caseiro, classes concretas (sem interfaces)

## Setup

```sh
bun install
bun run dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/health
