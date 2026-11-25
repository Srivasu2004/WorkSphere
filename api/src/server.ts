          [tenantId, req.params.id, req.user!.userId, parsed.data.body]
        );

        return result.rows[0] ?? null;
      });

      if (!comment) {
        res.status(404).json({
          success: false,
          error: "Task not found",
        });
        return;
      }

      res.status(201).json(comment);
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// ACTIVITY AND AUDIT
// -----------------------------------------------------------------------------

app.get(
  "/api/activity",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(tenantId, (client) =>
        client.query(
          `SELECT *
           FROM activity_events
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT 100`,
          [tenantId]
        )
      );

      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/audit",
  requireAuth,
  allowRoles("organization_owner", "auditor", "platform_admin"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId;

      const result = await withTenant(tenantId, (client) =>
        client.query(
          `SELECT *
           FROM audit_logs
           WHERE tenant_id = $1
           ORDER BY created_at DESC
           LIMIT 200`,
          [tenantId]
        )
      );

      res.status(200).json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// -----------------------------------------------------------------------------
// NOT FOUND AND GLOBAL ERROR HANDLING
// -----------------------------------------------------------------------------

app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    console.error("WorkSphere API Error:", error);

    if (res.headersSent) {
      return;
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
);

// -----------------------------------------------------------------------------
// START SERVER
// -----------------------------------------------------------------------------

async function startServer(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    console.log("PostgreSQL connected successfully");

    app.listen(PORT, "0.0.0.0", () => {
      console.log("----------------------------------");
      console.log("WorkSphere API running");
      console.log(`Port: ${PORT}`);
      console.log(`URL: http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/health`);
      console.log("----------------------------------");
    });
  } catch (error) {
    console.error("DATABASE CONNECTION ERROR:", error);
    process.exit(1);
  }
