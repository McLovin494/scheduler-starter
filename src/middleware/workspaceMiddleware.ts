import { NextFunction, Response } from "express"
import { AuthedRequest } from "./auth.js"
import { UserRole, WorkSpaceMember } from "../models/WorkspaceMember.js"

export interface WorkspaceRequest extends AuthedRequest {
    workspaceMember?: {
        workspaceId: string
        userId: string,
        userRole: UserRole
    }
}
export const requireWorkspaceMember = async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.id
        const { workspaceId } = req.params
        if (!userId) {
            return res.status(401).json({ success: false, data: {}, message: 'Unauthorized' })
        }
        if (!workspaceId) {
            return res.status(401).json({
                success: false,
                message: "Workspace ID is required",
                data: {}
            })
        }
        const membership = await WorkSpaceMember.findOne({
            workspaceId,
            userId
        }).lean()
        if (!membership) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this workspace",
                data: {},
            });
        }
        req.workspaceMember = {
            workspaceId: membership.workspaceId,
            userId: membership.userId,
            userRole: membership.userRole as UserRole
        }
        next()
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Failed to verify workspace membership",
            data: {},
        });
    }
}
export const requireRoles=(...allowedRoles:UserRole[])=>{
    return (
        req:WorkspaceRequest,
        res:Response,
        next:NextFunction
    )=>{
        const userRole=req.workspaceMember?.userRole
         if (!userRole) {
            return res.status(403).json({
                success: false,
                message: "Workspace membership required",
                data: {},
            });
        }
 if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to perform this action",
                data: {},
            });
        }

        next();
    }
}
