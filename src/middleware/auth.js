const jwt = require("jsonwebtoken");

// Make sure to put a JWT_SECRET in your .env file!
const SECRET = process.env.JWT_SECRET || "super_secret_dummy_key_123";

const userAuth = (req, res, next) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({ success: false, message: "Access denied. No token provided." });
        }

        const decoded = jwt.verify(token, SECRET);
        req.user = decoded; // Attach the decoded payload (id, role) to the request
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: "Invalid or expired token." });
    }
};

const adminAuth = (req, res, next) => {
    try {
        const token = req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({ success: false, message: "Access denied. No token provided." });
        }

        const decoded = jwt.verify(token, SECRET);

        // ⚡ Check if the role is specifically 'admin'
        if (decoded.role !== "admin") {
            return res.status(403).json({ success: false, message: "Access denied. Admin only." });
        }

        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: "Invalid or expired token." });
    }
};

module.exports = { userAuth, adminAuth, SECRET };