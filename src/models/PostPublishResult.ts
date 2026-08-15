import { model, Schema } from "mongoose"

export enum PublishStatus{
    PENDING="PENDINIG",
    PUBLISHED="PUBLISHED",
    FAILED="FAILED"
}
export interface IPostPublishResult extends Document{
    postId:string,
    socialAccountId:string,
    status:PublishStatus,
    publishedAt?:Date|null,
    errorMessage?:string|null
}
const postPublishResultSchema=new Schema<IPostPublishResult>({
    postId:{
        type:String,
        required:true
    },
    socialAccountId:{
        type:String,
        required:true
    },
    status:{
        type:String,
        enum:Object.values(PublishStatus),
        default:PublishStatus.PENDING
    },
    publishedAt:{
        type:Date,
        default:null
    },
    errorMessage:{
        type:String,
        default:null
    }
    
},{timestamps:true})
postPublishResultSchema.index(
    {
        postId: 1,
        socialAccountId: 1
    },
    {
        unique: true
    }
);

export const PostPublishResult = model<IPostPublishResult>(
    "PostPublishResult",
    postPublishResultSchema
);