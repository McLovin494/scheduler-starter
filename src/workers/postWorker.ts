import "dotenv/config";
import { Redis } from "ioredis"
import { Worker } from "bullmq"
import { Post, PostStatus } from "../models/Post.js";
import { PostSocialAccount } from "../models/PostSocialAccount.js";
import { SocialAccount } from "../models/SocialAccount.js";
import { connectDB } from "../config/db.js";

console.log(process.env.REDIS_HOST)
connectDB()
const connection = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    maxRetriesPerRequest: null
})
const worker = new Worker(
    "post-publishing",
    async (job) => {
        console.log("processing job", job.name)
        console.log("job data", job.data)
        const { postId, workspaceId } = job.data
        const post = await Post.findOne({
            _id: postId,
            workspaceId
        })
        if (!post) {
            throw new Error("Post not found")
        }
        if (post.status !== PostStatus.SCHEDULED) {
            throw new Error(
                `Post cannot be published. Current status: ${post.status}`
            )
        }
        const relationships = await PostSocialAccount.find({
            postId
        }).lean()
        if (relationships.length === 0) {
            throw new Error("No Social accounts attached")
        }
        const socialAccountIds = relationships.map(
            relationship => relationship.socialAccountId
        )
        const socialAccounts = await SocialAccount.find({
            _id: { $in: socialAccountIds },
            workspaceId
        }).lean()
        if (socialAccounts.length === 0) {
            throw new Error("No valid social accounts found")
        }
        console.log(`Publishing to ${socialAccounts.length} social account(s)`)
        for (const account of socialAccounts) {
            console.log(`Publishing to ${account.platform}-${account.accountName}`)
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`Successfully published to ${account.platform}`)
        }
        post.status = PostStatus.PUBLISHED;
        post.publishedAt = new Date();
        await post.save()
        console.log(`Post ${postId} published successfully`);

    }, {
    connection
}
)

worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
});

worker.on("failed", (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
});
worker.on("error", (error) => {
    console.error("Worker error:", error);
});
console.log("Post publishing worker started");