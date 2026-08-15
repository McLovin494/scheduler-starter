export interface InstagramPublishInput {
    accessToken: string;
    instagramAccountId: string;
    caption: string;
    imageUrl: string;
}

export class InstagramService {

    private readonly baseUrl = "https://graph.instagram.com";

    async publishImage({
        accessToken,
        instagramAccountId,
        caption,
        imageUrl
    }: InstagramPublishInput): Promise<string> {

        // 1. Create media container
        const containerResponse = await fetch(
            `${this.baseUrl}/${instagramAccountId}/media`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    image_url: imageUrl,
                    caption,
                    access_token: accessToken
                })
            }
        );

        const containerData = await containerResponse.json();

        if (!containerResponse.ok) {
            throw new Error(
                containerData?.error?.message ||
                "Failed to create Instagram media container"
            );
        }

        const creationId = containerData.id;

        console.log(
            "Instagram container created:",
            creationId
        );

        // 2. Publish the container
        const publishResponse = await fetch(
            `${this.baseUrl}/${instagramAccountId}/media_publish`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    creation_id: creationId,
                    access_token: accessToken
                })
            }
        );

        const publishData = await publishResponse.json();

        if (!publishResponse.ok) {
            throw new Error(
                publishData?.error?.message ||
                "Failed to publish Instagram media"
            );
        }

        console.log(
            "Instagram media published:",
            publishData.id
        );

        return publishData.id;
    }
}