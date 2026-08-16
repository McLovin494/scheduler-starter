import { NextFunction, Router, Request, Response } from "express";
import { AuthedRequest, protect } from "../middleware/auth.js";
import { WorkSpace } from "../models/Workspace.js";
import { UserRole, WorkSpaceMember } from "../models/WorkspaceMember.js";
import { requireRoles, requireWorkspaceMember, WorkspaceRequest } from "../middleware/workspaceMiddleware.js";
import { User } from "../models/User.js";
import { SocialAccount, SocialPlatform } from "../models/SocialAccount.js";
import { Console } from "console";
import { Post, PostStatus } from "../models/Post.js";
import { PostSocialAccount } from "../models/PostSocialAccount.js";
import { postQueue } from "../queues/postQueue.js";
import { PostPublishResult, PublishStatus } from "../models/PostPublishResult.js";
import { AppError } from "../utils/AppError.js";
import { HTTP_STATUS } from "../utils/errorCodes.js";

const router = Router()
//creating workspace
router.post("/", protect, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
        const { name } = req.body
        if (!name || !name.trim()) {
            throw new AppError("Missing required fields", HTTP_STATUS.BAD_REQUEST)
        }
        const userId = req.user?.id
        //create workspace
        const workspace = await WorkSpace.create({
            name: name.trim(),
            ownerId: userId
        })
        //create membership
        await WorkSpaceMember.create({
            workspaceId: workspace._id,
            userId: userId,
            userRole: UserRole.OWNER
        })
        return res.status(201).json({
            success: true,
            message: "Workspace successfully created",
            data: {
                workspace,
                role: UserRole.OWNER
            }
        })
    } catch (error) {
        next(error)
    }
})
//fetching the workspace
router.get("/", protect, async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {

        const userId = req.user?.id
        const memberships = await WorkSpaceMember.find({
            userId
        }).lean()
        const workspaceIds = memberships.map((memberhip) => memberhip.workspaceId)
        const workspaces = await WorkSpace.find({
            _id: { $in: workspaceIds },
        }).lean()
        const data = workspaces.map((workspace) => {
            const memberhip = memberships.find((member) => member.workspaceId.toString() === workspace._id.toString())
            return {
                workspace,
                role: memberhip?.userRole
            }
        })
        return res.status(201).json({
            success: true,
            message: "Workspaces fetched successfully",
            data
        })
    } catch (error) {
        next(error)
    }
})
//fetching workspace by id
router.get("/:workspaceId", protect, requireWorkspaceMember, async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
    try {
        const { workspaceId } = req.params
        const workspace = await WorkSpace.findById(workspaceId).lean()
        if (!workspace) {
            throw new AppError("Workspace not found", HTTP_STATUS.NOT_FOUND)
        }
        return res.status(200).json({
            success: true,
            message: "Workspace fetched successfully",
            data: {
                workspace,
                role: req.workspaceMember?.userRole
            }
        })
    } catch (error) {
        next(error)
    }
})
//hard delete everything
router.delete("/all", async (req, res) => {
    const all = await WorkSpaceMember.deleteMany({})
    return res.status(200).json(all)
})
//adding members of a particular workspace
router.post("/:workspaceId/members", protect, requireWorkspaceMember, requireRoles(UserRole.ADMIN, UserRole.OWNER), async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
    try {
        const { workspaceId } = req.params
        const { email, role } = req.body
        if (!email) {
            throw new AppError("Email is required", HTTP_STATUS.BAD_REQUEST)
        }
        const allowedRoles = Object.values(UserRole)
        if (
            !role ||
            !Object.values(UserRole).includes(role) ||
            role === UserRole.OWNER
        ) {
            throw new AppError("Invalid role", HTTP_STATUS.BAD_REQUEST)
        }
        //find user
        const user = await User.findOne({ email })
        if (!user) {
            throw new AppError("User not found", HTTP_STATUS.NOT_FOUND)
        }
        //check existing membership
        const existingMembership = await WorkSpaceMember.findOne({
            workspaceId,
            userId: user._id
        })
        if (existingMembership) {
            throw new AppError("User already part of this workspace", HTTP_STATUS.CONFLICT)
        }
        const membership = await WorkSpaceMember.create({
            workspaceId,
            userId: user._id,
            userRole: role
        })
        return res.status(201).json({
            success: true,
            message: "Member added successfully",
            data: {
                membership,
            },
        });
    } catch (error) {
        next(error)
    }
})
//find members of a particular workspace

router.get("/:workspaceId/members", protect, requireWorkspaceMember, async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
    try {
        const { workspaceId } = req.params
        const members = await WorkSpaceMember.find({ workspaceId }).lean()
        const userIds = members.map(member => member.userId)
        const users = await User.find({
            _id: { $in: userIds }
        }).select("_id name email").lean()
        const data = members.map(member => {
            const user = users.find(
                user => user._id.toString() === member.userId.toString()
            );

            return {
                user: {
                    id: user?._id,
                    name: user?.name,
                    email: user?.email
                },
                role: member.userRole,
                membershipId: member._id
            };
        });
        return res.status(200).json({
            success: true,
            message: "Workspace members fetched successfully",
            data
        });
    } catch (error) {
        next(error)
    }
})
//changing role of a member in workspace
router.patch("/:workspaceId/members/:userId", protect, requireRoles(UserRole.OWNER), async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
    try {
        const { workspaceId, userId } = req.params
        const { role } = req.body
        if (!role || !Object.values(UserRole).includes(role)) {
            throw new AppError("Invalid role", HTTP_STATUS.BAD_REQUEST)
        }
        if (role === UserRole.OWNER) {
            throw new AppError("Use owner ship transfer to change ownership", HTTP_STATUS.BAD_REQUEST)
        }
        const member = await WorkSpaceMember.findOne({
            workspaceId,
            userId
        })
        if (!member) {
            throw new AppError("Member not found", HTTP_STATUS.NOT_FOUND)
        }
        if (member.userRole === UserRole.OWNER) {
            throw new AppError("Owner cannot be changed", HTTP_STATUS.BAD_REQUEST)
        }
        member.userRole = role;
        member.save()
        return res.status(200).json({
            success: true,
            message: "Member role updated successfully",
            data: {
                membership: member
            }
        });
    } catch (error) {
        next(error)
    }
})
//removing a member from a workspace
router.delete(
    "/:workspaceId/members/:userId",
    protect,
    requireWorkspaceMember,
    requireRoles(UserRole.ADMIN, UserRole.OWNER),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {

            const { workspaceId, userId } = req.params
            const member = await WorkSpaceMember.findOne({
                workspaceId,
                userId
            })
            if (!member) {
                throw new AppError("Member not found", HTTP_STATUS.NOT_FOUND)
            }
            if (member.userRole === UserRole.OWNER) {
                throw new AppError("Workspace owner cannot be removed", HTTP_STATUS.BAD_REQUEST)
            }
            await WorkSpaceMember.deleteOne({
                _id: member._id
            })
            return res.status(200).json({
                success: true,
                message: "Member removed successfully",
                data: {}
            });
        } catch (error) {
            next(error)
        }
    }
)

//add social account to a workspace
router.post("/:workspaceId/social-accounts",
    protect,
    requireWorkspaceMember,
    requireRoles(UserRole.ADMIN, UserRole.OWNER),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId } = req.params
            const {
                platform,
                accountId,
                accountName,
                accessToken,
                refreshToken,
                expiresAt
            } = req.body
            if (
                !platform ||
                !accountId ||
                !accountName ||
                !accessToken
            ) {
                throw new AppError("Required fields are missing", HTTP_STATUS.BAD_REQUEST)
            }
            if (!Object.values(SocialPlatform).includes(platform)) {
                throw new AppError("Invalid social platform", HTTP_STATUS.BAD_REQUEST)
            }
            const existingAccount = await SocialAccount.findOne({
                workspaceId,
                platform,
                accountId
            })
            if (existingAccount) {
                throw new AppError("Social account already connected", HTTP_STATUS.CONFLICT)
            }
            const socialAccount = await SocialAccount.create({
                workspaceId,
                platform,
                accountId,
                accountName,
                accessToken,
                refreshToken,
                expiresAt
            })
            return res.status(201).json({
                success: true,
                message: "Social account connected successfully",
                data: {
                    socialAccount
                }
            })
        } catch (error) {
            next(error)
        }
    }
)
//get all social accounts attached to a workspace
router.get(
    "/:workspaceId/social-accounts",
    protect,
    requireWorkspaceMember,
    async (
        req: WorkspaceRequest,
        res: Response,
        next: NextFunction
    ) => {
        try {
            const { workspaceId } = req.params;

            const socialAccounts = await SocialAccount.find({
                workspaceId
            })
                .select(
                    "_id platform accountId accountName expiresAt createdAt updatedAt"
                )
                .lean();

            return res.status(200).json({
                success: true,
                message: "Social accounts fetched successfully",
                data: {
                    socialAccounts
                }
            });

        } catch (error) {
            next(error)
        }
    }
);

//add posts to workspace
router.post(
    "/:workspaceId/posts",
    protect,
    requireWorkspaceMember,
    requireRoles(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId } = req.params
            const { content, media } = req.body
            if (!content || !content.trim()) {
                throw new AppError("Post content is required", HTTP_STATUS.BAD_REQUEST)
            }
            if (media !== undefined && !Array.isArray(media)) {
                throw new AppError("Media must be an array", HTTP_STATUS.BAD_REQUEST)

            }
            const post = await Post.create({
                workspaceId,
                createdBy: req.user?.id,
                content: content.trim(),
                media: media || [],
                status: PostStatus.DRAFT
            })
            console.log("CREATE POST REQUEST");
            console.log({
                workspaceId,
                userId: req.user?.id,
                content,
                media
            });
            return res.status(201).json({
                success: true,
                message: "Draft created successfully",
                data: {
                    post
                }
            })
        } catch (error) {
            next(error)
        }
    }
)
//view posts of workspace
router.get(
    "/:workspaceId/posts",
    protect,
    requireWorkspaceMember,
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId } = req.params;
            const { status } = req.query;

            const filter: any = {
                workspaceId
            };

            if (status) {
                if (!Object.values(PostStatus).includes(status as PostStatus)) {
                    throw new AppError("Invalid post status", HTTP_STATUS.BAD_REQUEST)

                }

                filter.status = status;
            }

            const posts = await Post.find(filter)
                .sort({ createdAt: -1 })
                .lean();
            console.log(posts)
            return res.status(200).json({
                success: true,
                message: "Posts fetched successfully",
                data: {
                    posts
                }
            });

        } catch (error) {
            next(error)
        }
    }
);
//view particular post of a workspace
router.get(
    "/:workspaceId/posts/:postId",
    protect,
    requireWorkspaceMember,
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            console.log("hit")
            const { workspaceId, postId } = req.params
            console.log(workspaceId, postId)
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            }).lean()
            console.log(post)
            if (!post) {
                throw new AppError("Post not found", HTTP_STATUS.NOT_FOUND)

            }
            return res.status(200).json({
                success: true,
                message: "Post fetched successfully",
                data: { post }
            });

        } catch (error) {
            next(error)
        }
    }
)
//updating the post of workspace
router.patch(
    "/:workspaceId/posts/:postId",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            console.log("hit")
            const { workspaceId, postId } = req.params;
            const { content, media } = req.body;

            const post = await Post.findOne({
                _id: postId,
                workspaceId
            });

            if (!post) {
                throw new AppError("Post not found", HTTP_STATUS.NOT_FOUND)

            }

            // Don't allow editing published posts for now
            if (post.status === PostStatus.PUBLISHED) {
                throw new AppError("Published posts cannot be edited", HTTP_STATUS.BAD_REQUEST)

            }

            if (content !== undefined) {
                if (!content.trim()) {
                    throw new AppError("Content cannot be empty", HTTP_STATUS.BAD_REQUEST)

                }

                post.content = content.trim();
            }

            if (media !== undefined) {
                if (!Array.isArray(media)) {
                    throw new AppError("Media must be an array", HTTP_STATUS.BAD_REQUEST)

                }

                post.media = media;
            }

            await post.save();

            return res.status(200).json({
                success: true,
                message: "Post updated successfully",
                data: {
                    post
                }
            });

        } catch (error) {
            next(error)
        }
    }
);
//deleting a particular post of workspace
router.delete(
    "/:workspaceId/posts/:postId",
    protect,
    requireWorkspaceMember,
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId, postId } = req.params
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })
            if (!post) {
                throw new AppError("Post not found", HTTP_STATUS.NOT_FOUND)

            }
            if (post.status === PostStatus.PUBLISHED) {
                throw new AppError("Published posts cannot be deleted", HTTP_STATUS.BAD_REQUEST)

            }

            await Post.deleteOne({
                _id: postId,
                workspaceId
            })
            return res.status(200).json({
                success: true,
                message: "Post deleted successfully",
                data: {}
            });

        } catch (error) {
            next(error)
        }
    }
)
router.post(
    "/:workspaceId/posts/:postId/social-accounts",
    protect,
    requireWorkspaceMember,
    requireRoles(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId, postId } = req.params
            const { socialAccountIds } = req.body
            if (
                !Array.isArray(socialAccountIds) ||
                socialAccountIds.length === 0
            ) {
                throw new AppError("Social accounts IDs must be non-empty array", HTTP_STATUS.BAD_REQUEST)

            }
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })
            if (!post) {
                throw new AppError("Post not found", HTTP_STATUS.NOT_FOUND)

            }
            const socialAccounts = await SocialAccount.find({
                _id: { $in: socialAccountIds },
                workspaceId
            }).lean()

            if (socialAccounts.length !== socialAccountIds.length) {
                throw new AppError("One or more social accounts are invalid", HTTP_STATUS.BAD_REQUEST)

            }
            const relationships = socialAccountIds.map(
                (socialAccountId: string) => ({
                    postId, socialAccountId
                })
            )
            // await PostSocialAccount.insertMany(
            //     relationships,
            //     { ordered: false }
            // )
            for (const socialAccountId of socialAccountIds) {
                await PostSocialAccount.updateOne(
                    {
                        postId,
                        socialAccountId
                    },
                    {
                        $setOnInsert: {
                            postId,
                            socialAccountId
                        }
                    },
                    {
                        upsert: true
                    }
                );
            }
            return res.status(201).json({
                success: true,
                message: "Social accounts attached successfully",
                data: {
                    socialAccountIds
                }
            });
        } catch (error) {
            next(error)

        }
    }
)
router.get(
    "/:workspaceId/posts/:postId/social-accounts",
    protect,
    requireWorkspaceMember,
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId, postId } = req.params;

            // Make sure post belongs to workspace
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            });

            if (!post) {
                throw new AppError("Post not found", HTTP_STATUS.NOT_FOUND)

            }

            const relationships = await PostSocialAccount.find({
                postId
            }).lean();

            const socialAccountIds = relationships.map(
                relationship => relationship.socialAccountId
            );

            const socialAccounts = await SocialAccount.find({
                _id: { $in: socialAccountIds },
                workspaceId
            }).lean();

            return res.status(200).json({
                success: true,
                message: "Post social accounts fetched successfully",
                data: {
                    socialAccounts
                }
            });

        } catch (error) {
            next(error)

        }
    }
);
router.delete(
    "/:workspaceId/posts/:postId/social-accounts/:socialAccountId",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const {
                workspaceId,
                postId,
                socialAccountId
            } = req.params
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })
            if (!post) {
                throw new AppError("Post not found ", HTTP_STATUS.NOT_FOUND)

            }
            const socialAccount = await SocialAccount.findOne({
                _id: socialAccountId,
                workspaceId
            })
            if (!socialAccount) {
                throw new AppError("Social account not found", HTTP_STATUS.NOT_FOUND)

            }
            const result = await PostSocialAccount.deleteOne({
                postId,
                socialAccountId
            })

            if (result.deletedCount === 0) {
                throw new AppError("Social acocunt is not attached to this post", HTTP_STATUS.BAD_REQUEST)

            }
            return res.status(200).json({
                success: true,
                message: "Social account removed from post",
                data: {}
            });
        } catch (error) {
            next(error)

        }
    }
)
//for scheduling a post
router.post(
    "/:workspaceId/posts/:postId/schedule",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId, postId } = req.params
            const { scheduledAt } = req.body
            if (!scheduledAt) {
                throw new AppError("ScheduledAt is required", HTTP_STATUS.BAD_REQUEST)

            }
            const scheduleDate = new Date(scheduledAt)
            if (isNaN(scheduleDate.getTime())) {
                throw new AppError("Invalid scheduledAt", HTTP_STATUS.BAD_REQUEST)

            }
            if (scheduledAt < new Date()) {
                throw new AppError("Scheduled time must be in future", HTTP_STATUS.BAD_REQUEST)

            }
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })
            if (!post) {
                throw new AppError("Post not found", HTTP_STATUS.NOT_FOUND)

            }
            if (post.status !== PostStatus.DRAFT) {
                throw new AppError("Only draft posts can be scheduled", HTTP_STATUS.BAD_REQUEST)


            }
            const socialAccounts = await PostSocialAccount.find({
                postId
            })
            if (socialAccounts.length === 0) {
                throw new AppError("Attach at least one social account before scheduling", HTTP_STATUS.BAD_REQUEST)


            }

            await PostPublishResult.deleteMany({
                postId
            });

            await PostPublishResult.insertMany(
                socialAccounts.map(account => ({
                    postId,
                    socialAccountId: account.socialAccountId,
                    status: PublishStatus.PENDING
                }))
            );


            post.status = PostStatus.SCHEDULED
            post.scheduledAt = scheduleDate

            console.log("added to the queue")
            const job = await postQueue.add(
                "publish-post",
                {
                    postId: post._id.toString(),
                    workspaceId
                },
                {
                    jobId: `post-${post.id.toString()}`,
                    delay: scheduleDate.getTime() - Date.now(),
                    attempts: 3,
                    backoff: {
                        type: "exponential",
                        delay: 5000
                    },
                    removeOnComplete: true,
                    removeOnFail: false
                }
            )

            post.jobId = job.id
            await post.save()
            console.log("schedule====>", post)
            console.log("queue addition successfull")
            return res.status(200).json({
                success: false,
                message: "Post scheduled successfully",
                data: {
                    post
                }
            })
        } catch (error) {
            next(error)
        }
    }
)
//rescheduling a post
router.patch(
    "/:workspaceId/posts/:postId/reschedule",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId, postId } = req.params;
            const { scheduledAt } = req.body;

            if (!scheduledAt) {
                throw new AppError("ScheduledAt is required", HTTP_STATUS.BAD_REQUEST)

            }

            const scheduleDate = new Date(scheduledAt);

            if (isNaN(scheduleDate.getTime())) {
                throw new AppError("Invalid scheduledAt", HTTP_STATUS.BAD_REQUEST)


            }

            if (scheduleDate.getTime() <= Date.now()) {
                throw new AppError("Scheduled time must be in the future", HTTP_STATUS.BAD_REQUEST)


            }

            const post = await Post.findOne({
                _id: postId,
                workspaceId
            });

            if (!post) {
                throw new AppError("Post not found", HTTP_STATUS.NOT_FOUND)

            }

            if (post.status !== PostStatus.SCHEDULED) {
                throw new AppError("Only scheduled posts can be rescheduled", HTTP_STATUS.BAD_REQUEST)


            }

            // Remove old BullMQ job
            if (post.jobId) {
                const oldJob = await postQueue.getJob(post.jobId);

                if (oldJob) {
                    await oldJob.remove();
                    console.log(`Old job ${post.jobId} removed`);
                }
            }

            // Create new BullMQ job
            const newJob = await postQueue.add(
                "publish-post",
                {
                    postId: post._id.toString(),
                    workspaceId
                },
                {
                    delay: scheduleDate.getTime() - Date.now(),
                    attempts: 3,
                    backoff: {
                        type: "exponential",
                        delay: 5000
                    },
                    removeOnComplete: true,
                    removeOnFail: false
                }
            );

            // Update post
            post.scheduledAt = scheduleDate;
            post.jobId = newJob.id;

            await post.save();

            return res.status(200).json({
                success: true,
                message: "Post rescheduled successfully",
                data: {
                    post
                }
            });

        } catch (error) {
            next(error)
        }
    }
);
//cancelling a post
router.post(
    "/:workspaceId/posts/:postId/cancel",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
        try {
            const { workspaceId, postId } = req.params
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })

            if (!post) {
                throw new AppError("Post not found", HTTP_STATUS.NOT_FOUND)

            }
            console.log("post=====>", post)
            if (post.status !== PostStatus.SCHEDULED) {
                throw new AppError("Only scheduled posts can be cancelled", HTTP_STATUS.BAD_REQUEST)


            }

            if (post.jobId) {
                const job = await postQueue.getJob(post.jobId)
                if (job) {
                    await job.remove()
                }
            }

            post.status = PostStatus.CANCELLED
            post.jobId = null;
            await post.save()

            return res.status(200).json({
                success: true,
                message: "Post cancelled successfully",
                data: {
                    post
                }
            })

        } catch (error) {
            next(error)

        }
    }
)
//changing the status
router.post("/change", async (req, res) => {
    const post = await Post.findOne({
        _id: "6a7f40bce060c4d709f77e3f",
        workspaceId: "6a7f3f016ae66b30195de196"
    })
    if (!post) {
        return res.status(404).json({
            message: "not found"
        })
    }
    post.status = PostStatus.DRAFT;
    await post.save()
    return res.status(200).json("done")
})
export default router;