import { model, Schema } from "mongoose";

export interface IWorkSpaceMember extends Document{
    workspaceId:string,
    userId:string,
    userRole:string,

}
 export enum UserRole {
 
  OWNER="OWNER",
ADMIN="ADMIN",
EDITOR="EDITOR",
VIEWER="VIEWER"
}
const workspaceMemberSchema=new Schema<IWorkSpaceMember>({
    workspaceId:{
        type:String,
        required:true
    },
    userId:{
        type:String,
        required:true
    },
    userRole:{
         
           enum: Object.values(UserRole),
           default:UserRole.VIEWER,
           type:String,
          
       
    }
},{timestamps:true});
workspaceMemberSchema.index(
    { workspaceId: 1, userId: 1 },
    { unique: true }
);
export const WorkSpaceMember=model<IWorkSpaceMember>("WorkSpaceMember",workspaceMemberSchema)