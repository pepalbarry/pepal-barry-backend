const { OAuth2Client } = require("google-auth-library");
const bcrypt = require("bcrypt");
const saltRounds = 10;

const jwt = require("jsonwebtoken");

const User = require("../models/user.model");

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ success: false, message: "User already exists." });
    }

    const salt = await bcrypt.genSalt(saltRounds);
    const hash = await bcrypt.hash(password, salt);

    const createdUser = await User.create({
      name,
      email,
      password: hash,
      provider: "local",
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
    });

    const token = jwt.sign(
      { userId: createdUser._id, email: createdUser.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    });

    const { password: _, ...userWithoutPassword } = createdUser.toObject();
    res.status(200).json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: "User is not registered!" });
    }

    if (user.provider !== "local" || !user.password) {
      return res.status(400).json({ success: false, message: "This account was created with Google. Please use 'Continue with Google'." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Wrong Credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    });

    const { password: _, ...userWithoutPassword } = user.toObject();
    res.status(200).json({ success: true, user: userWithoutPassword });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const googleLogin = async (req, res) => {
  const { code } = req.body;
  try {
    const { tokens } = await client.getToken(code);
    const idToken = tokens.id_token;

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { sub: googleId, name, email, picture } = ticket.getPayload();

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name,
        email,
        picture,
        googleId,
        provider: "google",
      });
    } else if (!user.googleId) {
      // Link Google account to existing email/password account
      user.googleId = googleId;
      if (user.picture && user.picture.includes("ui-avatars.com")) {
        user.picture = picture;
      }
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    });

    const { password: _, ...userWithoutPassword } = user.toObject();
    res.status(200).json({ success: true, user: userWithoutPassword });
  } catch (err) {
    console.error("Google login error:", err);
    res.status(500).json({ success: false, message: "Google login failed" });
  }
};

const logoutUser = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.status(200).json({ success: true, message: "Logged out successfully" });
};

module.exports = { register, login, googleLogin, logoutUser };
