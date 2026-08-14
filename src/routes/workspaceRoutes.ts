import { NextFunction, Router, Request, Response } from "express";
import { AuthedRequest, protect } from "../middleware/auth.js";
import { WorkSpace } from "../models/Workspace.js";
import { UserRole, WorkSpaceMember } from "../models/WorkspaceMember.js";
import { requireRoles, requireWorkspaceMember, WorkspaceRequest } from "../middleware/workspaceMiddleware.js";
import { User } from "../models/User.js";
import { SocialAccount, SocialPlatform } from "../models/SocialAccount.js";
import { Console } from "console";
import { Post, PostStatus } from "../models/Post.js";

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
export default router;