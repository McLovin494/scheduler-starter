import { InstagramService } from "../instagram/InstagramService.js";
import { IPublisher, PublishContext } from "./IPublisher.js";
 
export class InstagramPublisher implements IPublisher {

    private instagramService = new InstagramService();

    async publish({
        post,
        account
    }: PublishContext): Promise<void> {

        console.log(
            `Publishing post ${post._id} to Instagram account ${account.accountName}`
        );

        if (!post.media || post.media.length === 0) {
            throw new Error(
                "Instagram post requires at least one image"
            );
        }

        const mediaUrl = post.media[0];

        console.log("Content:", post.content);
        console.log("Media:", mediaUrl);

        const instagramMediaId =
            await this.instagramService.publishImage({
                accessToken: account.accessToken,
                instagramAccountId: account.accountId,
                caption: post.content,
                imageUrl: mediaUrl
            });

        console.log(
            `Successfully published post ${post._id} to Instagram`
        );

        console.log(
            `Instagram Media ID: ${instagramMediaId}`
        );
    }
}