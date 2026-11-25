import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
export type Role = "platform_admin"|"organization_owner"|"project_manager"|"team_member"|"auditor";
export interface AuthUser { userId:string; tenantId:string; role:Role; email:string }
declare global { namespace Express { interface Request { user?: AuthUser } } }
const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return value;
};
export function signToken(user: AuthUser) { return jwt.sign(user, secret(), { expiresIn:"30m", issuer:"worksphere" }); }
export function requireAuth(req:Request,res:Response,next:NextFunction) {
  const token=req.headers.authorization?.replace(/^Bearer\s+/i,"");
  if(!token) return res.status(401).json({error:"Authentication required"});
  try { req.user=jwt.verify(token,secret(),{issuer:"worksphere"}) as AuthUser; next(); }
  catch { return res.status(401).json({error:"Invalid or expired token"}); }
}
export function allowRoles(...roles:Role[]) {
  return (req:Request,res:Response,next:NextFunction) => {
    if(!req.user || !roles.includes(req.user.role)) return res.status(403).json({error:"Insufficient permissions"});
    next();
  };
}
export const authenticate = async (req, res, next) => {
    if (!req.headers.authorization) {
        return res.status(401).json({
            message: "Unauthorized"
        });
      
    }

    return next();
  import { Request, Response, NextFunction } from "express";

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Your authentication logic

    next();
    return;
  } catch (error) {
    res.status(401).json({
      message: "Authentication failed"
    });
    return;
  }
};
  
};
