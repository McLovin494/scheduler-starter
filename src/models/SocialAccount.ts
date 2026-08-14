import { model, Schema } from "mongoose"

export enum SocialPlatform{
    INSTAGRAM="INSTAGRAM",
    LINKEDIN="LINKEDIN",
    FACEBOOK="FACEBOOK",
    X="X"
}
export interface ISocialAccount extends Document{
    workspaceId:string,
    platform:SocialPlatform,
    accountId:string,
    accountName:string,
    accessToken:string,
    refreshToken?:string,
    expiresAt?:string
}
const socialAccountSchema=new Schema<ISocialAccount>({
    workspaceId:{
        type:String,
        required:true
    },
    platform:{
        type:String,
        enum:Object.values(SocialPlatform),
        required:true
    },
    accountId:{
        type:String,
        required:true
    },
    accountName:{
        type:String,
        required:true
    },
    accessToken:{
        type:String,
        required:true
    },
    refreshToken:String,
    expiresAt:String
},{timestamps:true})
socialAccountSchema.index(
    {
        workspaceId: 1,
        platform: 1,
        accountId: 1,
    },
    {
        unique: true,
    }
);

export const SocialAccount=model<ISocialAccount>("SocialAccount",socialAccountSchema)
