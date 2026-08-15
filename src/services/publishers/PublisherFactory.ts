import { IPublisher } from "./IPublisher.js";
import { InstagramPublisher } from "./InstagramPublisher.js";

export class PublisherFactory {

    static getPublisher(platform: string): IPublisher {

        switch (platform) {

            case "INSTAGRAM":
                return new InstagramPublisher();

            default:
                throw new Error(
                    `Unsupported platform: ${platform}`
                );
        }
    }
}