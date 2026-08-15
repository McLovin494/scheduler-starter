import { IPublisher, PublishContext } from "./IPublisher.js";

export class InstagramPublisher implements IPublisher {
    async publish({ post, account }: PublishContext): Promise<void> {
        console.log(`Publishing post ${post._id} to Instagram account ${account.accountName}`)
        console.log("Content:", post.content);
        console.log("Media:", post.media);
        await new Promise(resolve =>
            setTimeout(resolve, 1000)
        );

        console.log(
            `Successfully published post ${post._id} to Instagram`
        );
    }
}