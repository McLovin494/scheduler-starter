import { model, Schema } from "mongoose"

export enum PostStatus{
    DRAFT="DRAFT",
    SCHEDULED="SCHEDULED",
    PUBLISHED="PUBLISHED",
    CANCELLED="CANCELLED"
}
export interface IPost extends Document{
    workspaceId:string,
    createdBy:string,
    content:string,
    media:string[],
    status:string,
    scheduledAt?:Date,
    publishedAt?:Date
}
const postSchema=new Schema<IPost>({
    workspaceId:{
        type:String,
        required:true
    },
    createdBy:{
        type:String,
        required:true
    },
    content:{
        type:String,
        required:true,
        trim:true
    },
    media:{
        type:[String],
        default:[]
    },
    status:{
        type:String,
        enum:Object.values(PostStatus),
        default:PostStatus.DRAFT
    },
    scheduledAt:{
        type:Date
    },
    publishedAt:{
        type:Date
    }
},{timestamps:true})
postSchema.index({
    workspaceId: 1,
    status: 1,
});

postSchema.index({
    workspaceId: 1,
    scheduledAt: 1,
});
export const Post = model<IPost>("Post", postSchema);