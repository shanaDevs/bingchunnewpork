# Bing Chun Online — Documentation Suite

Enterprise documentation for the Bing Chun multi-channel ordering, branch operations, delivery, and settlement platform.

**Project version snapshot:** Root `1.0.0` · Backend `1.0.0` · Frontend `0.1.0` · Flutter apps `1.0.0+1`  
**Documentation date:** 2026-07-25  
**Source of truth:** Repository code under `backend/`, `frontend/`, `mobile/`, `customer_mobile/`, root Docker/CI configs.

---

## Status legend

| Marker | Meaning |
|--------|---------|
| **Implemented** | Present and wired in production code paths |
| **Partial** | Schema, UI, or stub exists but flow is incomplete |
| **Not Implemented** | Not present as a working feature (do not assume it exists) |

Screenshot image paths in user/admin guides are **placeholders** (`../assets/docs/placeholders/…`). Capture real screenshots separately if needed.

---

## Numbered documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [Project Overview](01_Project_Overview.md) | Purpose, users, features, high-level architecture |
| 02 | [System Architecture](02_System_Architecture.md) | Diagrams and request/auth/data flows |
| 03 | [Technology Stack](03_Technology_Stack.md) | Languages, frameworks, libraries, infra |
| 04 | [Project Structure](04_Project_Structure.md) | Folders and major files |
| 05 | [Database Documentation](05_Database_Documentation.md) | ER diagram, tables, fields, constraints |
| 06 | [API Documentation](06_API_Documentation.md) | All HTTP endpoints and Socket.io rooms |
| 07 | [Business Logic](07_Business_Logic.md) | Workflows, pricing, rules |
| 08 | [Authentication & Authorization](08_Authentication_Authorization.md) | JWT, RBAC, middleware |
| 09 | [Frontend Documentation](09_Frontend_Documentation.md) | Next.js pages, stores, components |
| 10 | [Backend Documentation](10_Backend_Documentation.md) | Controllers, lib modules, middleware |
| 11 | [Environment Configuration](11_Environment_Configuration.md) | Env vars, secrets, Flutter defines |
| 12 | [Installation Guide](12_Installation_Guide.md) | Local setup and Docker |
| 13 | [Deployment Guide](13_Deployment_Guide.md) | CapRover, GitLab CI, production |
| 14 | [Testing Guide](14_Testing_Guide.md) | Unit, E2E, gaps |
| 15 | [Security Documentation](15_Security_Documentation.md) | Controls and OWASP notes |
| 16 | [Performance Analysis](16_Performance_Analysis.md) | Bottlenecks and scalability |
| 17 | [Code Quality Report](17_Code_Quality_Report.md) | Smells and refactor suggestions |
| 18 | [Known Issues](18_Known_Issues.md) | Bugs, limitations, debt |
| 19 | [Developer Guide](19_Developer_Guide.md) | Conventions and how to extend |
| 20 | [User Guide](20_User_Guide.md) | Customer end-user manual |
| 21 | [Admin Guide](21_Admin_Guide.md) | Staff / admin operations |
| 22 | [Deployment Checklist](22_Deployment_Checklist.md) | Pre-go-live checklist |
| 23 | [Maintenance Guide](23_Maintenance_Guide.md) | Backups, logs, recovery |
| 24 | [Change Log](24_Change_Log.md) | Version / feature inventory |
| 25 | [Architecture Diagrams](25_Architecture_Diagrams.md) | Mermaid diagram pack |
| 26 | [Project Report](26_Project_Report.md) | Client-facing project report |
| 31 | [New Product Stock Flow](31_New_Product_Stock_Flow.md) | Super-admin release → branch stock → Coming Soon |
| 32 | [Socket.IO Realtime](32_Socket_Realtime.md) | Who uses sockets, rooms, events, and why |
| 34 | [SEO Guide](34_SEO_Guide.md) | On-site SEO, GSC, GA4, Google Business Profile |
| 35 | [Shop, cashier, and admin architecture](35_Shop_Pos_Admin_Architecture.md) | Separate shop, POS, and admin processes on one database |
| — | [Documentation Update Report](Documentation_Update_Report.md) | Latest docs↔code sync report |

---

## Delivery Service initiative (`feature/delivery-service`)

| Document | Description |
|----------|-------------|
| [27_Delivery_Service.md](27_Delivery_Service.md) | Delivery Service architecture and API surface |
| [28_Driver_App.md](28_Driver_App.md) | Flutter driver app target architecture |
| [29_Delivery_Cutover_Checklist.md](29_Delivery_Cutover_Checklist.md) | Production cutover / rollback checklist |
| [adr/](adr/) | Architecture Decision Records 0001–0007 |
| [delivery/](delivery/) | Delivery feature inventory and dated history. Delivery only, including links from the main app |

---

## Related QA notes (pre-existing)

| File | Topic |
|------|--------|
| [login-e2e-testing.md](login-e2e-testing.md) | Login E2E testing notes |
| [login-e2e-qa-guidance.md](login-e2e-qa-guidance.md) | Login QA guidance |
| [login-unit-testing.md](login-unit-testing.md) | Login unit testing notes |

---

## Quick links

- Root setup: [`../README.md`](../README.md)
- Backend env template: [`../backend/env.example`](../backend/env.example)
- Frontend env template: [`../frontend/env.example`](../frontend/env.example)
- Prisma schema: [`../backend/prisma/schema.prisma`](../backend/prisma/schema.prisma)
- API mount: [`../backend/src/routes/index.ts`](../backend/src/routes/index.ts)
