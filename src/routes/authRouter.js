const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { SECRET, adminAuth, userAuth } = require("../middleware/auth");

const authRouter = express.Router();

// --- 1. SIGNUP ROUTE ---
authRouter.post("/signup", async (req, res) => {
    try {
        // ⚡ NEW: Extract mobile from req.body
        const { name, email, mobile, password, role } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "User already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            email,
            mobile, // ⚡ NEW: Save mobile to the database
            password: hashedPassword,
            role: role || "user"
        });
        await newUser.save();

        const token = jwt.sign(
            { id: newUser._id, role: newUser.role },
            SECRET,
            { expiresIn: "30d" }
        );

        res.status(201).json({
            success: true,
            token,
            // ⚡ NEW: Include mobile in the response
            user: { id: newUser._id, name: newUser.name, email: newUser.email, mobile: newUser.mobile, role: newUser.role }
        });

    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ success: false, message: "Server error during signup." });
    }
});

// --- 2. LOGIN ROUTE ---
authRouter.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        // Compare the provided password with the hashed password in the DB
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid email or password." });
        }

        // ⚡ Generate the 30-day token
        const token = jwt.sign(
            { id: user._id, role: user.role },
            SECRET,
            { expiresIn: "30d" }
        );

        res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });

    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false, message: "Server error during login." });
    }
});

authRouter.get("/users", userAuth, adminAuth, async (req, res) => {
    try {
        // Fetch all users, but exclude the password field, sort by newest first
        const users = await User.find().select("-password").sort({ createdAt: -1 });
        res.json({ success: true, users });
    } catch (error) {
        console.error("Fetch users error:", error);
        res.status(500).json({ success: false, message: "Server error fetching users." });
    }
});

module.exports = authRouter;