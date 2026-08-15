import { IPost } from "../../models/Post.js";
import { IWorkSpaceMember } from "../../models/WorkspaceMember.js";
import { ISocialAccount } from "../../models/SocialAccount.js";

export interface PublishContext {
    post: IPost;
    account: ISocialAccount;
}

export interface IPublisher {
    publish(context: PublishContext): Promise<void>;
}