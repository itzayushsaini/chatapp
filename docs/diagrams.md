# Diagrams

Mermaid diagrams for the project report. GitHub and VS Code (with a Mermaid
extension) render them directly; for the report, paste each block into
<https://mermaid.live> and export as PNG or SVG.

---

## 1. System architecture

```mermaid
flowchart LR
    subgraph Browser
        UI[React app<br/>zustand store]
        AX[axios<br/>REST]
        SK[socket.io-client]
        UI --> AX
        UI --> SK
    end

    subgraph Server["One Node.js process"]
        EX[Express<br/>routes + controllers]
        IO[Socket.IO<br/>handlers]
        SV[Services<br/>auth · friend · message · presence]
        PR[(Presence Map<br/>in memory)]
        ST[Static files<br/>client/dist]
        EX --> SV
        IO --> SV
        SV --> PR
        SV -. emitToUser .-> IO
    end

    DB[(MongoDB)]

    AX -- "HTTPS /api/*<br/>httpOnly cookie" --> EX
    SK <-- "WebSocket /socket.io<br/>same cookie" --> IO
    Browser -- "GET /, /login" --> ST
    SV --> DB
```

REST is for data that is **fetched**; Socket.IO is for things that
**happen**. Both call the same services, and MongoDB is the single source of
truth.

---

## 2. Data model

```mermaid
erDiagram
    USER ||--o{ FRIENDSHIP : "requester / recipient"
    USER ||--o{ MESSAGE : sends
    CONVERSATION ||--o{ MESSAGE : contains
    USER }o--o{ CONVERSATION : "participants (exactly 2)"

    USER {
        ObjectId _id
        string username UK "lowercase, immutable"
        string displayName
        string email UK
        string passwordHash "select: false"
        date lastSeen
    }
    FRIENDSHIP {
        ObjectId _id
        string pairKey UK "sorted ids joined by _"
        ObjectId requester
        ObjectId recipient
        string status "pending | accepted | declined"
        date respondedAt
    }
    CONVERSATION {
        ObjectId _id
        string pairKey UK
        ObjectId[] participants "sorted"
        object lastMessage "text, sender, createdAt"
    }
    MESSAGE {
        ObjectId _id
        ObjectId conversation
        ObjectId sender
        string text "1-2000 chars"
        string clientId "UUID from browser"
    }
```

Unique indexes that enforce rules at database level:
`User.username`, `User.email`, `Friendship.pairKey`, `Conversation.pairKey`,
`Message.(sender, clientId)`.

---

## 3. Friendship lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: A sends request
    pending --> accepted: B accepts<br/>(or B sends a request to A)
    pending --> declined: B declines<br/>(A is not told)
    pending --> [*]: A cancels<br/>(document deleted)
    declined --> pending: B sends a request<br/>or A, after 7 days
    accepted --> [*]: either unfriends<br/>(conversation kept)
```

There is only ever **one** Friendship document per pair (unique `pairKey`), so
duplicate or crossed requests are impossible.

---

## 4. Sending a message

```mermaid
sequenceDiagram
    autonumber
    participant A as Aman's tab
    participant S as Server (socket handler)
    participant DB as MongoDB
    participant B as Priya's tabs
    participant A2 as Aman's other tabs

    A->>A: show bubble "sending"<br/>clientId = randomUUID()
    A->>S: message:send {conversationId, text, clientId}
    S->>S: rate limit + zod validation
    S->>DB: assertParticipant
    S->>DB: assertFriends
    S->>DB: save Message (unique sender+clientId)
    S->>DB: update Conversation.lastMessage
    S-->>B: message:new
    S-->>A2: message:new
    S->>A: ack {ok: true, message}
    A->>A: replace bubble with saved message
    Note over A,S: No ack within 10 s → bubble "failed", Retry resends<br/>the SAME clientId, so the server never saves it twice
```

If any step before the save fails, nothing is emitted and the ack is
`{ ok: false, error }`, so a message never appears on screen without being
stored.

---

## 5. Presence (why we count connections)

```mermaid
sequenceDiagram
    participant T1 as Priya tab 1
    participant T2 as Priya tab 2
    participant S as Server (Map userId → count)
    participant F as Friends' rooms

    T1->>S: connect
    S->>S: count 0 → 1
    S-->>F: presence:update {online: true}
    S->>T1: presence:snapshot
    T2->>S: connect
    S->>S: count 1 → 2 (no news for friends)
    S->>T2: presence:snapshot
    T1->>S: disconnect
    S->>S: count 2 → 1 (still online - nothing sent)
    T2->>S: disconnect
    S->>S: count 1 → 0, save lastSeen
    S-->>F: presence:update {online: false, lastSeen}
```

---

## 6. Authentication

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Express
    participant DB as MongoDB

    B->>E: POST /api/auth/login {identifier, password}
    E->>DB: find user by username OR email (+passwordHash)
    E->>E: bcrypt.compare (dummy hash if user not found)
    E-->>B: 200 {user} + Set-Cookie: token=JWT<br/>HttpOnly; SameSite=Lax; Secure
    Note over B: JavaScript cannot read the cookie
    B->>E: GET /api/friends (cookie sent automatically)
    E->>E: requireAuth: verify JWT, load user
    E-->>B: 200 {friends}
    B->>E: Socket.IO handshake (same cookie)
    E->>E: socketAuth: parse cookie, verify JWT
```
