    import "dotenv/config";
    import { Redis } from "ioredis";
    import { Worker } from "bullmq";

    import { Post, PostStatus } from "../models/Post.js";
    import { PostSocialAccount } from "../models/PostSocialAccount.js";
    import { SocialAccount } from "../models/SocialAccount.js";
    import { connectDB } from "../config/db.js";
    import {
        PostPublishResult,
        PublishStatus
    } from "../models/PostPublishResult.js";
import { PublisherFactory } from "../services/publishers/PublisherFactory.js";

    console.log("Redis host:", process.env.REDIS_HOST);

    await connectDB();

    const connection = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        maxRetriesPerRequest: null
    });

    const worker = new Worker(
        "post-publishing",

        async (job) => {
            console.log("=================================");
            console.log("Processing job:", job.name);
            console.log("Job ID:", job.id);
            console.log("Attempt:", job.attemptsMade + 1);
            console.log("Job data:", job.data);
            console.log("=================================");

            const { postId, workspaceId } = job.data;

            // 1. Find post
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            });

            if (!post) {
                throw new Error("Post not found");
            }

            // 2. Make sure post is scheduled
            if (post.status !== PostStatus.SCHEDULED) {
                throw new Error(
                    `Post cannot be published. Current status: ${post.status}`
                );
            }

            // 3. Find attached social accounts
            const relationships = await PostSocialAccount.find({
                postId
            }).lean();

            if (relationships.length === 0) {
                throw new Error("No social accounts attached");
            }

            const socialAccountIds = relationships.map(
                relationship => relationship.socialAccountId
            );

            const socialAccounts = await SocialAccount.find({
                _id: { $in: socialAccountIds },
                workspaceId
            });

            if (socialAccounts.length === 0) {
                throw new Error("No valid social accounts found");
            }

            console.log(
                `Publishing to ${socialAccounts.length} social account(s)`
            );

            // 4. Publish to each social account
            for (const account of socialAccounts) {

                const publishResult = await PostPublishResult.findOne({
                    postId,
                    socialAccountId: account._id.toString()
                });

                if (!publishResult) {
                    console.log(
                        `No publish result found for ${account.accountName}`
                    );
                    continue;
                }

                try {
                    console.log(
                        `Publishing to ${account.platform}-${account.accountName}`
                    );

                   
                    
                    //  Uncomment this line to test retries.
                    
                    // throw new Errors("TEST PUBLISH FAILURE");
                    

                    // Mock publishing
                   const publisher = PublisherFactory.getPublisher(
    account.platform
);

await publisher.publish({
    post,
    account
});

                    // Publishing succeeded
                    publishResult.status = PublishStatus.PUBLISHED;
                    publishResult.publishedAt = new Date();
                    publishResult.errorMessage = null;

                    await publishResult.save();

                    console.log(
                        `Successfully published to ${account.platform}`
                    );

                } catch (error) {

                    const errorMessage =
                        error instanceof Error
                            ? error.message
                            : "Unknown publishing error";

                    console.error(
                        `Failed to publish to ${account.platform}:`,
                        errorMessage
                    );

                    /*
                    * Do NOT mark the result as FAILED here.
                    *
                    * BullMQ may retry this job.
                    */
                    publishResult.errorMessage = errorMessage;

                    await publishResult.save();

                    /*
                    * VERY IMPORTANT:
                    *
                    * Throwing the error tells BullMQ that
                    * this job failed and should be retried.
                    */
                    throw error;
                }
            }

            // 5. Check publishing results
            const results = await PostPublishResult.find({
                postId
            });

            const allPublished =
                results.length > 0 &&
                results.every(
                    result =>
                        result.status === PublishStatus.PUBLISHED
                );

            // 6. Only mark the post PUBLISHED if every account succeeded
            if (allPublished) {
                post.status = PostStatus.PUBLISHED;
                post.publishedAt = new Date();

                await post.save();

                console.log(
                    `Post ${postId} published successfully`
                );
            }
        },

        {
            connection,
            // The queue already controls attempts,
            // but this makes it explicit on the worker too.
            maxStalledCount: 1
        }
    );


    // Job completed
    worker.on("completed", (job) => {
        console.log(
            `Job ${job.id} completed`
        );
    });


    // Job finally failed after all retries
    worker.on("failed", async (job, error) => {

        console.error(
            `Job ${job?.id} failed:`,
            error.message
        );

        if (!job) {
            return;
        }

        console.log(
            `Attempts made: ${job.attemptsMade}`
        );

        /*
        * BullMQ calls this event after the job has
        * exhausted its configured attempts.
        *
        * Our queue currently has:
        *
        * attempts: 3
        *
        * Therefore mark the post FAILED here.
        */

        if (
            job.attemptsMade >=
            Number(job.opts.attempts ?? 1)
        ) {

            const { postId } = job.data;

            await Post.updateOne(
                {
                    _id: postId
                },
                {
                    $set: {
                        status: PostStatus.FAILED
                    }
                }
            );

            await PostPublishResult.updateMany(
                {
                    postId,
                    status: {
                        $ne: PublishStatus.PUBLISHED
                    }
                },
                {
                    $set: {
                        status: PublishStatus.FAILED,
                        errorMessage: error.message
                    }
                }
            );

            console.log(
                `Post ${postId} marked as FAILED`
            );
        }
    });


    // Worker-level errors
    worker.on("error", (error) => {
        console.error(
            "Worker error:",
            error
        );
    });

    console.log(
        "Post publishing worker started"
    );