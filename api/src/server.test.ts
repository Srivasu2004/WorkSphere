import { describe, it, expect } from "vitest";
describe("WorkSphere API starter",()=> {
  it("documents the expected role model",()=> {
    const roles=["platform_admin","organization_owner","project_manager","team_member","auditor"];
    expect(roles).toContain("organization_owner");
    expect(roles).toHaveLength(5);
  });
});
