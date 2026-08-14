import { model, Schema } from "mongoose";

export interface IWorkSpace extends Document{
    name:string,
    ownerId:string,
    
}
const workspaceSchema=new Schema<IWorkSpace>({
    name:{type:String,required:true},
    ownerId:{type:String,required:true}
},{timestamps:true})
export const WorkSpace=model<IWorkSpace>("WorkSpace",workspaceSchema)