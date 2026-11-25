import os
from fastapi import FastAPI, Header, HTTPException
from psycopg import connect
from psycopg.rows import dict_row

app = FastAPI(title="WorkSphere Analytics", version="1.0.0")

def db():
    return connect(os.environ["DATABASE_URL"], row_factory=dict_row)

@app.get("/health")
def health():
    try:
        with db() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "service": "worksphere-analytics"}
    except Exception:
        raise HTTPException(status_code=503, detail="Database unavailable")

@app.get("/internal/analytics/summary")
def summary(x_tenant_id: str = Header(...)):
    # Keep this service private behind the API gateway in production.
    # Do not expose an unauthenticated tenant header to the public internet.
    try:
        with db() as conn:
            conn.execute("BEGIN")
            conn.execute("SELECT set_config('app.tenant_id', %s, true)", (x_tenant_id,))
            projects = conn.execute("""
                SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE status='completed')::int AS completed,
                       count(*) FILTER (WHERE status='active')::int AS active
                FROM projects WHERE tenant_id=%s
            """, (x_tenant_id,)).fetchone()
            tasks = conn.execute("""
                SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE status='done')::int AS done,
                       count(*) FILTER (WHERE status='blocked')::int AS blocked,
                       count(*) FILTER (WHERE status='in_progress')::int AS in_progress
                FROM tasks WHERE tenant_id=%s
            """, (x_tenant_id,)).fetchone()
            conn.commit()
        return {"projects": projects, "tasks": tasks}
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to calculate tenant analytics")
