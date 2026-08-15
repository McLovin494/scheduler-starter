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

const router = Router()
router.post("/", protect, async (req: AuthedRequest, res: Response) => {
    try {
        const { name } = req.body
        if (!name || !name.trim()) {
            return res.status(404).json({
                success: false,
                message: "Name is required",
                data: {}
            })
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
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Failed to create workspace",
            data: {},
        });
    }
})
router.get("/", protect, async (req: AuthedRequest, res: Response) => {
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
        console.log(error)
        return res.status(500).json({
            message: "Failed to fetch workspaces",
            success: false,
            data: {}
        })
    }
})
router.get("/:workspaceId", protect, requireWorkspaceMember, async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
    try {
        const { workspaceId } = req.params
        const workspace = await WorkSpace.findById(workspaceId).lean()
        if (!workspace) {
            return res.status(404).json({
                success: false,
                message: "Workspace not found",
                data: {},
            });
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
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch workspace",
            data: {},
        });
    }
})
router.delete("/all", async (req, res) => {
    const all = await WorkSpaceMember.deleteMany({})
    return res.status(200).json(all)
})

router.post("/:workspaceId/members", protect, requireWorkspaceMember, requireRoles(UserRole.ADMIN, UserRole.OWNER), async (req: WorkspaceRequest, res: Response, next: NextFunction) => {
    try {
        const { workspaceId } = req.params
        const { email, role } = req.body
        if (!email) {
            return res.status(401).json({
                success: false,
                message: "Email is required",
                data: {}
            })
        }
        const allowedRoles = Object.values(UserRole)
        if (
            !role ||
            !Object.values(UserRole).includes(role) ||
            role === UserRole.OWNER
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid role",
                data: {},
            });
        }
        //find user
        const user = await User.findOne({ email })
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found",
                data: {}
            })
        }
        //check existing membership
        const existingMembership = await WorkSpaceMember.findOne({
            workspaceId,
            userId: user._id
        })
        if (existingMembership) {
            return res.status(409).json({
                success: false,
                message: 'User is already member of this workspace',
                data: {}
            })
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
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Failed to add member",
            data: {},
        });
    }
})
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
        console.log(error)
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch workspace members",
            data: {}
        });
    }
})
router.patch("/:workspaceId/members/:userId", protect, requireRoles(UserRole.OWNER), async (req: WorkspaceRequest, res: Response) => {
    try {
        const { workspaceId, userId } = req.params
        const { role } = req.body
        if (!role || !Object.values(UserRole).includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role",
                data: {}
            });
        }
        if (role === UserRole.OWNER) {
            return res.status(400).json({
                success: false,
                message: "Use ownership transfer to change ownership",
                data: {}
            });
        }
        const member = await WorkSpaceMember.findOne({
            workspaceId,
            userId
        })
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found',
                data: {}
            })
        }
        if (member.userRole === UserRole.OWNER) {
            return res.status(400).json({
                success: false,
                message: "Owner role cannot be changed",
                data: {}
            });
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
        console.error(error);

        return res.status(500).json({
            success: false,
            message: "Failed to update member role",
            data: {}
        });
    }
})
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
                return res.status(404).json({
                    success: false,
                    message: "Member not found",
                    data: {}
                })
            }
            if (member.userRole === UserRole.OWNER) {
                return res.status(403).json({
                    success: false,
                    message: "Workspace owner cannot be removed",
                    data: {}
                });
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to remove member",
                data: {}
            });
        }
    }
)
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
                return res.status(400).json({
                    success: false,
                    message: "Required fields are missing",
                    data: {}
                });
            }
            if (!Object.values(SocialPlatform).includes(platform)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid social platform",
                    data: {}
                })
            }
            const existingAccount = await SocialAccount.findOne({
                workspaceId,
                platform,
                accountId
            })
            if (existingAccount) {
                return res.status(409).json({
                    success: false,
                    message: "Social account already connected",
                    data: {}
                });
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to connect social account",
                data: {}
            });
        }
    }
)
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
            console.log(error);

            return res.status(500).json({
                success: false,
                message: "Internal server error",
                data: {}
            });
        }
    }
);


router.post(
    "/:workspaceId/posts",
    protect,
    requireWorkspaceMember,
    requireRoles(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR),
    async (req: WorkspaceRequest, res: Response) => {
        try {
            const { workspaceId } = req.params
            const { content, media } = req.body
            if (!content || !content.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Post content is required",
                    data: {}
                })
            }
            if (media !== undefined && !Array.isArray(media)) {
                return res.status(400).json({
                    success: false,
                    message: "Media must be an array",
                    data: {}
                })
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to create post",
                data: {}
            });
        }
    }
)
router.get(
    "/:workspaceId/posts",
    protect,
    requireWorkspaceMember,
    async (req: WorkspaceRequest, res: Response) => {
        try {
            const { workspaceId } = req.params;
            const { status } = req.query;

            const filter: any = {
                workspaceId
            };

            if (status) {
                if (!Object.values(PostStatus).includes(status as PostStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid post status",
                        data: {}
                    });
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch posts",
                data: {}
            });
        }
    }
);
router.get(
    "/:workspaceId/posts/:postId",
    protect,
    requireWorkspaceMember,
    async (req: WorkspaceRequest, res: Response) => {
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
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                });
            }
            return res.status(200).json({
                success: true,
                message: "Post fetched successfully",
                data: { post }
            });

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch post",
                data: {}
            });
        }
    }
)

router.patch(
    "/:workspaceId/posts/:postId",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response) => {
        try {
            console.log("hit")
            const { workspaceId, postId } = req.params;
            const { content, media } = req.body;

            const post = await Post.findOne({
                _id: postId,
                workspaceId
            });

            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                });
            }

            // Don't allow editing published posts for now
            if (post.status === PostStatus.PUBLISHED) {
                return res.status(400).json({
                    success: false,
                    message: "Published posts cannot be edited",
                    data: {}
                });
            }

            if (content !== undefined) {
                if (!content.trim()) {
                    return res.status(400).json({
                        success: false,
                        message: "Content cannot be empty",
                        data: {}
                    });
                }

                post.content = content.trim();
            }

            if (media !== undefined) {
                if (!Array.isArray(media)) {
                    return res.status(400).json({
                        success: false,
                        message: "Media must be an array",
                        data: {}
                    });
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to update post",
                data: {}
            });
        }
    }
);

router.delete(
    "/:workspaceId/posts/:postId",
    protect,
    requireWorkspaceMember,
    async (req: WorkspaceRequest, res: Response) => {
        try {
            const { workspaceId, postId } = req.params
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })
            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                })
            }
            if (post.status === PostStatus.PUBLISHED) {
                return res.status(400).json({
                    success: false,
                    message: "Published posts cannot be deleted",
                    data: {}
                });
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to delete post",
                data: {}
            });
        }
    }
)
router.post(
    "/:workspaceId/posts/:postId/social-accounts",
    protect,
    requireWorkspaceMember,
    requireRoles(UserRole.OWNER, UserRole.ADMIN, UserRole.EDITOR),
    async (req: WorkspaceRequest, res: Response) => {
        try {
            const { workspaceId, postId } = req.params
            const { socialAccountIds } = req.body
            if (
                !Array.isArray(socialAccountIds) ||
                socialAccountIds.length === 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Social accounts IDs must be non-empty array",
                    data: {}
                })
            }
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })
            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                })
            }
            const socialAccounts = await SocialAccount.find({
                _id: { $in: socialAccountIds },
                workspaceId
            }).lean()

            if (socialAccounts.length !== socialAccountIds.length) {
                return res.status(400).json({
                    success: false,
                    message: "One or more social accounts are invalid",
                    data: {}
                })
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to attach social accounts",
                data: {}
            });
        }
    }
)
router.get(
    "/:workspaceId/posts/:postId/social-accounts",
    protect,
    requireWorkspaceMember,
    async (req: WorkspaceRequest, res: Response) => {
        try {
            const { workspaceId, postId } = req.params;

            // Make sure post belongs to workspace
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            });

            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                });
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to fetch post social accounts",
                data: {}
            });
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
    async (req: WorkspaceRequest, res: Response) => {
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
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                })
            }
            const socialAccount = await SocialAccount.findOne({
                _id: socialAccountId,
                workspaceId
            })
            if (!socialAccount) {
                return res.status(404).json({
                    success: false,
                    message: "Social account not found"
                })
            }
            const result = await PostSocialAccount.deleteOne({
                postId,
                socialAccountId
            })

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Social account is not attached to this post",
                    data: {}
                })
            }
            return res.status(200).json({
                success: true,
                message: "Social account removed from post",
                data: {}
            });
        } catch (error) {
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to remove social account",
                data: {}
            });
        }
    }
)

router.post(
    "/:workspaceId/posts/:postId/schedule",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response) => {
        try {
            const { workspaceId, postId } = req.params
            const { scheduledAt } = req.body
            if (!scheduledAt) {
                return res.status(400)
                    .json({
                        success: false,
                        message: "ScheduledAt is required",
                        data: {}
                    })
            }
            const scheduleDate = new Date(scheduledAt)
            if (isNaN(scheduleDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid scheduledAt",
                    data: {}
                })
            }
            if (scheduledAt < new Date()) {
                return res.status(400).json({
                    success: false,
                    message: "Scheduled time must be in future",
                    data: {}
                })
            }
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })
            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                })
            }
            if (post.status !== PostStatus.DRAFT) {
                return res.status(400).json({
                    success: false,
                    message: "Only draft posts can be scheduled",
                    data: {}
                })
            }
            const socialAccounts = await PostSocialAccount.find({
                postId
            })
            if (socialAccounts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Attach at least one social account before scheduling"
                })
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
                    jobId:`post-${post.id.toString()}`,
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
            console.log("schedule====>",post)
            console.log("queue addition successfull")
            return res.status(200).json({
                success: false,
                message: "Post scheduled successfully",
                data: {
                    post
                }
            })
        } catch (error) {
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to schedule post",
                data: {}
            });
        }
    }
)

router.patch(
    "/:workspaceId/posts/:postId/reschedule",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response) => {
        try {
            const { workspaceId, postId } = req.params;
            const { scheduledAt } = req.body;

            if (!scheduledAt) {
                return res.status(400).json({
                    success: false,
                    message: "ScheduledAt is required",
                    data: {}
                });
            }

            const scheduleDate = new Date(scheduledAt);

            if (isNaN(scheduleDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid scheduledAt",
                    data: {}
                });
            }

            if (scheduleDate.getTime() <= Date.now()) {
                return res.status(400).json({
                    success: false,
                    message: "Scheduled time must be in the future",
                    data: {}
                });
            }

            const post = await Post.findOne({
                _id: postId,
                workspaceId
            });

            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                });
            }

            if (post.status !== PostStatus.SCHEDULED) {
                return res.status(400).json({
                    success: false,
                    message: "Only scheduled posts can be rescheduled",
                    data: {}
                });
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
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to reschedule post",
                data: {}
            });
        }
    }
);
router.post(
    "/:workspaceId/posts/:postId/cancel",
    protect,
    requireWorkspaceMember,
    requireRoles(
        UserRole.OWNER,
        UserRole.ADMIN,
        UserRole.EDITOR
    ),
    async (req: WorkspaceRequest, res: Response) => {
        try {
            const { workspaceId, postId } = req.params
            const post = await Post.findOne({
                _id: postId,
                workspaceId
            })

            if (!post) {
                return res.status(404).json({
                    success: false,
                    message: "Post not found",
                    data: {}
                })
            }
            console.log("post=====>",post)
            if (post.status !== PostStatus.SCHEDULED) {
                return res.status(400).json({
                    success: false,
                    message: "Only scheduled posts can be cancelled"
                })
            }

            if(post.jobId){
                const job=await postQueue.getJob(post.jobId)
                if(job){
                    await job.remove()
                }
            }

            post.status = PostStatus.CANCELLED
            post.jobId=null;
            await post.save()

            return res.status(200).json({
                success: true,
                message: "Post cancelled successfully",
                data: {
                    post
                }
            })

        } catch (error) {
            console.error(error);

            return res.status(500).json({
                success: false,
                message: "Failed to cancel post",
                data: {}
            });
        }
    }
)
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