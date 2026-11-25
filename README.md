# WorkSphere — Multi-Tenant Project Management & Workflow Automation

This is a runnable MVP foundation based on the supplied assessment handbook. It includes organization registration/login, tenant-scoped projects and tasks, comments, activity/audit records, a FastAPI analytics endpoint, PostgreSQL schema, Docker Compose, and a GitHub Actions CI starter.

## Requirements
- Docker Desktop (recommended), or Node.js 20+, Python 3.11+, PostgreSQL 16
- Git and VS Code

## Run with Docker
1. Copy `.env.example` to `.env`.
2. Change `POSTGRES_PASSWORD` and `JWT_SECRET` in `.env`.
3. Ensure `DATABASE_URL` uses the same password.
4. Run `docker compose up --build`.
5. Open:
   - Frontend: http://localhost:3000
   - API health: http://localhost:4000/health
   - Analytics docs: http://localhost:8000/docs

The database schema is applied automatically on the first PostgreSQL volume initialization.

## Create the first organization owner
Use PowerShell:
```powershell
$body = @{
  organizationName = "Acme"
  name = "Vasu"
  email = "vasu@example.com"
  password = "ChangeMe123!"
} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:4000/api/auth/register" -Method Post -ContentType "application/json" -Body $body
```
Then sign in on the frontend with that email and password.

## Main API routes
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`
- `GET/POST /api/projects/:projectId/tasks`, `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/comments`
- `GET /api/activity`, `GET /api/audit`
- `GET /health`

All protected API requests require `Authorization: Bearer <token>`. The JWT contains the user, tenant, and role. Queries are tenant-scoped, and PostgreSQL row-level security is enabled for tenant-owned tables.

## Assessment coverage
This MVP gives you a working base, not a completed 1,500-point assessment. Still to implement and evidence: invitation lifecycle, milestones, file/object storage, workflow rule builder, email/webhook integrations with signature verification, BullMQ worker/retries/idempotency, WebSocket/SSE live updates, advanced CSV processing, complete UI pages, refresh-token rotation/revocation, full unit/integration/E2E tests, security/dependency scans, production deployment, backups/restore drills, and incident-response report.

## Development without Docker
API:
```bash
cd api
npm install
npm run dev
```
Frontend:
```bash
cd frontend
npm install
npm run dev
```
Analytics:
```bash
cd analytics
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Never commit `.env`, credentials, production tokens, or real personal data.
