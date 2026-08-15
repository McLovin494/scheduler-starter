import { model, Schema } from "mongoose"

export enum PostStatus {
    DRAFT = "DRAFT",
    SCHEDULED = "SCHEDULED",
    PUBLISHED = "PUBLISHED",
    CANCELLED = "CANCELLED",
    FAILED = "FAILED"
}
export interface IPost extends Document {
    workspaceId: string,
    createdBy: string,
    content: string,
    jobId?: string|null,
    media: string[],
    status: string,
    scheduledAt?: Date | null,
    publishedAt?: Date | null

}
const postSchema = new Schema<IPost>({
    workspaceId: {
        type: String,
        required: true
    },
    createdBy: {
        type: String,
        required: true
    },
    jobId: {
        type: String,
        default: null
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    media: {
        type: [String],
        default: []
    },
    status: {
        type: String,
        enum: Object.values(PostStatus),
        default: PostStatus.DRAFT
    },
    scheduledAt: {
        type: Date,
        default: null
    },
    publishedAt: {
        type: Date,
        default: null
    }
}, { timestamps: true })
postSchema.index({
    workspaceId: 1,
    status: 1,
});

postSchema.index({
    workspaceId: 1,
    scheduledAt: 1,
});
export const Post = model<IPost>("Post", postSchema);