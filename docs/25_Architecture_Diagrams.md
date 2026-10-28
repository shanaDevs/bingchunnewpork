# 25 — Architecture Diagrams

Mermaid diagram pack for Bing Chun Online. Render in any Mermaid-compatible viewer (GitHub, GitLab, many IDEs).

---

## 1. System architecture

```mermaid
flowchart TB
  subgraph clients [Clients]
    Web[Next.js_Web]
    Admin[Next.js_Admin]
    CApp[Flutter_Customer]
    DApp[Flutter_Driver]
  end

  subgraph platform [Application_Platform]
    API[Express_API]
    IO[Socket_IO]
    Prisma[Prisma]
  end

  DB[(MySQL_8)]
  PayHere[PayHere]
  Spaces[DO_Spaces]
  FCM[Firebase_FCM]
  Maps[Google_Maps]
  OSRM[OSRM]

  Web --> API
  Admin --> API
  CApp --> API
  DApp --> API
  Web --> IO
  Admin --> IO
  API --> Prisma --> DB
  API --> IO
  API --> PayHere
  API --> Spaces
  API --> FCM
  API --> Maps
  API --> OSRM
```

---

## 2. Database (core ER)

```mermaid
erDiagram
  User ||--o{ Order : places
  User ||--o| Cart : has
  Store ||--o{ Order : fulfills
  Store ||--o| StoreWallet : has
  Store ||--o{ DeliveryJob : runs
  Order ||--o{ OrderItem : contains
  Order }o--o{ DeliveryJob : DeliveryJobOrder
  Role ||--o{ AdminUser : assigns
  AdminUser ||--o{ Permission : has
  Product }o--|| Category : in
  Product ||--o{ StoreProduct : stocked
```

Full field documentation: [05_Database_Documentation.md](05_Database_Documentation.md).

---

## 3. Authentication sequence

```mermaid
sequenceDiagram
  participant U as Client
  participant A as API
  participant D as MySQL

  U->>A: POST /api/auth/login
  A->>D: Lookup user + bcrypt verify
  A-->>U: accessToken + refreshToken
  U->>A: GET /api/auth/me Authorization Bearer
  A->>A: jwt.verify
  A-->>U: profile
  U->>A: POST /api/auth/refresh
  A-->>U: new accessToken
```

Admin and delivery PIN flows are analogous with different endpoints and payloads.

---

## 4. API / order flow sequence

```mermaid
sequenceDiagram
  participant C as Customer
  participant API as Express
  participant DB as MySQL
  participant PH as PayHere
  participant S as Socket_IO
  participant B as Branch_Admin

  C->>API: POST /api/orders
  API->>DB: Create order + items
  API->>S: Notify store room
  S-->>B: New order event
  alt Online_PayHere
    C->>API: GET /payments/payhere/:orderNumber
    C->>PH: Pay
    PH->>API: POST /orders/payment-notify
    API->>DB: Mark PAID + wallet credit
  end
  B->>API: PUT /orders/:id/status
  API->>DB: Status event
  API->>S: Order update
  S-->>C: Track update
```

---

## 5. Deployment diagram

```mermaid
flowchart LR
  Dev[Developer_push] --> GL[GitLab_CI]
  GL --> Reg[Container_Registry]
  GL -->|main| CR[CapRover]
  CR --> FE[bing-chung]
  CR --> BE[bing-chun-backend]
  BE --> DB[(MySQL)]
  Users[Users] -->|HTTPS| FE
  Users -->|HTTPS| BE
```

**NGINX/PM2 in repo:** Not Implemented — CapRover edge proxy used.

---

## 6. Class / module diagram (simplified)

```mermaid
classDiagram
  class Routes {
    +mount /api/*
  }
  class Controllers {
    +auth
    +order
    +wallet
    +admin*
  }
  class LibDomain {
    +pricing
    +orderStatus
    +walletService
    +commission
    +roadRouting
  }
  class PrismaClient {
    +user
    +order
    +store
  }
  class Integrations {
    +payhere
    +maps
    +sms_mock
    +email_mock
  }

  Routes --> Controllers
  Controllers --> LibDomain
  Controllers --> PrismaClient
  LibDomain --> PrismaClient
  Controllers --> Integrations
```

**Repository classes:** Not Implemented.

---

## Related

- [02_System_Architecture.md](02_System_Architecture.md)
- [35_Shop_Pos_Admin_Architecture.md](35_Shop_Pos_Admin_Architecture.md) — shop, cashier, and admin process split
- [08_Authentication_Authorization.md](08_Authentication_Authorization.md)
- [13_Deployment_Guide.md](13_Deployment_Guide.md)
