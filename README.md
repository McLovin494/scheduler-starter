# Social Scheduler Backend — Starter

Minimal TypeScript + ESM starter. Server boots, connects to Mongo, has one
model and one route file wired up — everything else is left for you to build.

## Setup

```bash
npm install
cp .env.example .env   # set MONGO_URI and JWT_ACCESS_SECRET
npm run dev
```

## What's here

- `src/server.ts` — entry point
- `src/app.ts` — Express app + route mounting
- `src/config/db.ts` — Mongo connection
- `src/models/User.ts` — one example model (no password hashing yet)
- `src/middleware/auth.ts` — JWT verify middleware, ready to use once login issues tokens
- `src/routes/authRoutes.ts` — `/register` stub (raw password, no hashing) and `/login` stub (501)

## Not built yet — your next steps

- Hash passwords (bcrypt) in `/register`
- Sign JWT and compare password in `/login`
- Workspace model + RBAC
- Post model + CRUD
