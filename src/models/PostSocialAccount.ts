import { model, Schema } from "mongoose"

export interface IPostSocialAccount extends Document{
    postId:string,
    socialAccountId:string
}
const postSocialAccountSchema=new Schema<IPostSocialAccount>({
  postId:{
    type:String,
    required:true
  } ,
  socialAccountId:{
    type:String,
    required:true
  } 
},{timestamps:true})
postSocialAccountSchema.index(
    {
        postId: 1,
        socialAccountId: 1,
    },
    {
        unique: true,
    }
);
export const PostSocialAccount = model<IPostSocialAccount>(
    "PostSocialAccount",
    postSocialAccountSchema
);