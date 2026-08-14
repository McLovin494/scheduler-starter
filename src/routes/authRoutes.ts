import { Router } from "express";
import { User } from "../models/User.js";
import jwt from "jsonwebtoken"
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { RefreshToken } from "../models/RefreshToken.js";
import crypto from "crypto"
import { WorkSpaceMember } from "../models/WorkspaceMember.js";
const router = Router();
// Starter stub — wire up bcrypt hashing + JWT signing here
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if(!name||!email||!password){
      return res.status(404).json({
        success:false,
        message:"All fields are required",
        data:{}
      })
    }
    const existingUser=await User.findOne({email:email})
    console.log("user=>",existingUser)
    if(existingUser){
      return res.status(401).json({
        success:false,
        message:"User already exists",
        data:existingUser
      })
    }
    const salt= await bcrypt.genSalt(10)
    const hash= await bcrypt.hash(password,salt)
    //create user
    const newUser=await User.create({email:email,passwordHash:hash,name:name})
    res.status(201).json({success:true,message:"User created successfully",data:newUser});
  } catch (err) {
    next(err);
  }
});
router.get("/users",async(req,res)=>{
  console.log("hit")
  const users= await WorkSpaceMember.find({})
  console.log(users)
  return res.status(200).json(users)
})
router.post("/login", async (req, res) => {
try {
   const { email, password } = req.body;

if (!email || !password) {
  return res.status(400).json({
    success: false,
    message: "Email and password are required",
    data: {}
  });
}

const user = await User.findOne({ email }).select("passwordHash");

if (!user) {
  return res.status(401).json({
    success: false,
    message: "Invalid email or password",
    data: {}
  });
}
 
const isPasswordValid = await bcrypt.compare(
  password,
  user.passwordHash
);

if (!isPasswordValid) {
  return res.status(401).json({
    success: false,
    message: "Invalid email or password",
    data: {}
  });
}

const jti = randomUUID();

const accessTokenPayload = {
  id: user._id,
  type: "access"
};

const refreshTokenPayload = {
  id: user._id,
  type: "refresh",
  jti
};

const accessToken = jwt.sign(
  accessTokenPayload,
  process.env.JWT_ACCESS_SECRET!,
  {
    expiresIn: "15m"
  }
);

const refreshToken = jwt.sign(
  refreshTokenPayload,
  process.env.JWT_REFRESH_SECRET!,
  {
    expiresIn: "7d"
  }
);

const refreshTokenHash = crypto
  .createHash("sha256")
  .update(refreshToken)
  .digest("hex");

await RefreshToken.create({
  userId: user._id,
  jti,
  tokenHash: refreshTokenHash,
  issuedAt: new Date(),
  expiredAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
});

return res.status(200).json({
  success: true,
  message: "Login successful",
  data: {
    accessToken,
    refreshToken
  }
});
} catch (error) {
 console.log(error) 
}
});

export default router;
router.get("/get-refresh",async(req,res)=>{
  const tokens=await RefreshToken.find({})
  return res.status(200).json(tokens);
})
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
        data: {},
      });
    }

    // 1. Verify the refresh JWT
    let payload: any;

    try {
      payload = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET!
      );
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
        data: {},
      });
    }

    // 2. Make sure this is actually a refresh token
    if (payload.type !== "refresh") {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
        data: {},
      });
    }

    const userId = payload.id;
    const jti = payload.jti;

    if (!userId || !jti) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
        data: {},
      });
    }

    // 3. Find the refresh-token record
    const storedToken = await RefreshToken.findOne({
      userId,
      jti,
    });

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token not found",
        data: {},
      });
    }

    // 4. Check if token has already been revoked
    if (storedToken.revokedAt) {
      return res.status(401).json({
        success: false,
        message: "Refresh token has been revoked",
        data: {},
      });
    }

    // 5. Check expiration
    if (storedToken.expiredAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: "Refresh token has expired",
        data: {},
      });
    }

    // 6. Hash the token supplied by the client
    const tokenHash =crypto. createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // 7. Compare it with the database hash
    if (tokenHash !== storedToken.tokenHash) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
        data: {},
      });
    }

    // 8. Make sure the user still exists
    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
        data: {},
      });
    }

    // 9. Revoke the OLD refresh token
    storedToken.revokedAt = new Date();
    await storedToken.save();

    // 10. Generate a NEW refresh token
    const newJti = randomUUID();

    const accessTokenPayload = {
      id: user._id,
      type: "access",
    };

    const refreshTokenPayload = {
      id: user._id,
      type: "refresh",
      jti: newJti,
    };

    const newAccessToken = jwt.sign(
      accessTokenPayload,
      process.env.JWT_ACCESS_SECRET!,
      {
        expiresIn: "15m",
      }
    );

    const newRefreshToken = jwt.sign(
      refreshTokenPayload,
      process.env.JWT_REFRESH_SECRET!,
      {
        expiresIn: "7d",
      }
    );

    // 11. Hash the NEW refresh token
    const newTokenHash = crypto.createHash("sha256")
      .update(newRefreshToken)
      .digest("hex");

    // 12. Store the NEW refresh token
    await RefreshToken.create({
      userId: user._id,
      jti: newJti,
      tokenHash: newTokenHash,
      issuedAt: new Date(),
      expiredAt: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ),
      revokedAt: null,
    });

    // 13. Return new tokens
    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      data: {},
    });
  }});