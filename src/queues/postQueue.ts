import { Queue } from "bullmq";
import {Redis} from "ioredis"
const connection=new Redis({
    host:process.env.REDIS_HOST,
    port:Number(process.env.REDIS_PORT),
    maxRetriesPerRequest:null,
})
export const postQueue = new Queue("post-publishing", {
    connection,
});