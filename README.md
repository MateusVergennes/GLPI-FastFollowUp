# GLPI FastFollow

Ferramenta web simples para registrar *follow-ups* em lote no GLPI
e, opcionalmente, ajustar o SLA de vários chamados de uma só vez.

## Prints da funcionalidade:
![image](https://github.com/user-attachments/assets/a8fc898a-bf02-45df-8504-9f72f14ed82e)
(cadastra os comentários no GLPI que deseja realizar em lote)

![image](https://github.com/user-attachments/assets/19c18877-be32-420a-b67e-0ae5c6c450e8)
cadastramento de comentário em lotes, junto com inspeção do SLA


## Funcionalidades
- Vários grupos de chamados → responsável → comentário em um único envio.
- Ajuste opcional do **time_to_resolve** (SLA) quando o chamado estiver atrasado.
- Interface leve em HTML/CSS/JS; back-end Node.js + Express + MySQL.

## Stack
| Camada | Tecnologia |
| ------ | ---------- |
| Front  | HTML 5, CSS flexbox, Vanilla JS |
| API    | Express 4 |
| DB     | MySQL (GLPI tables) |
| Outros | dotenv, nodemon |

## Instalação rápida
```bash
git clone https://github.com/seu-usuario/glpi-fastfollow.git
cd glpi-fastfollow
npm install
cp .env.example .env    # edite com seu host, user e senha
npm run dev
```

# Uso

Acesse [http://localhost:3005](http://localhost:3005).

Crie um ou mais grupos com os seguintes campos:

- **IDs dos tickets**
- **Responsável** (Vini, Leandro ou Luiz)
- **Comentário** *(opcional; usa texto-padrão se vazio)*
- **Novo SLA** *(opcional; deixe em branco para não alterar)*

Clique **"Enviar tudo"**.

Para cada ticket:

- É criado um *follow-up* em `glpi_itilfollowups`.
- Um log é gerado em `glpi_logs`.
- Se definido, o SLA é atualizado em `glpi_tickets`.

---

## Fluxograma

```
┌──────────────────────────┐
│  Navegador (Front-end)   │
│┌────────────────────────┐│
││ 1. Usuário cria grupos ││
││    (tickets +          ││
││     responsável + SLA) ││
│└────────────────────────┘│
└─────────────┬────────────┘
              │ 2. Clique “Enviar tudo”
              ▼
┌──────────────────────────┐
│  POST /followups (API)   │
└─────────────┬────────────┘
              │
              │3. Loop sobre grupos
              ▼
     ┌───────────────────────────────┐
     │ Para cada grupo recebido:     │
     │                               │
     │  a) Loop pelos tickets        │
     │     ┌──────────────────────┐  │
     │     │• (Opc.) UPDATE SLA   │  │
     │     │  └─ glpi_tickets     │  │
     │     │• INSERT Follow-up    │  │
     │     │  └─ glpi_itilfollowups│ │
     │     │• INSERT Log          │  │
     │     │  └─ glpi_logs        │  │
     │     └──────────────────────┘  │
     └───────────────────────────────┘
              │
              │4. Commit / Rollback
              ▼
┌──────────────────────────┐
│   Resposta JSON {ok}     │
└─────────────┬────────────┘
              │5. Front exibe toast
              ▼
┌──────────────────────────┐
│      Fim do fluxo        │
└──────────────────────────┘
```
