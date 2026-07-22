const express = require("express");
require("dotenv").config();
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("../database/database");
const trackRouter = require("../routes/trackRouter");

const app = express();
const PORT = process.env.PORT || 5000;

// 1. Create HTTP server from Express app
const server = http.createServer(app);

// 2. Initialize Socket.io with CORS enabled
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// 3. Make `io` accessible inside Express request handlers (`req.io`)
app.use((req, res, next) => {
    req.io = io;
    next();
});

const activeVisitors = new Map(); // Key will now be sessionId instead of socket.id

io.on("connection", (socket) => {
    console.log("⚡ Socket connected:", socket.id);

    socket.emit("admin:active_users", Array.from(activeVisitors.values()));

    // 1. Visitor joins or refreshes the page
    socket.on("visitor_join", (data) => {
        if (!data.sessionId || (data.path && data.path.startsWith("/admin"))) return;

        // Check if this user already exists in memory (e.g. they just refreshed)
        if (activeVisitors.has(data.sessionId)) {
            const existingUser = activeVisitors.get(data.sessionId);
            // Update their socket ID and mark them online, preserving their original joinTime!
            activeVisitors.set(data.sessionId, {
                ...existingUser,
                socketId: socket.id,
                path: data.path || existingUser.path,
                isOnline: true
            });
        } else {
            // Brand new user
            activeVisitors.set(data.sessionId, {
                ...data,
                socketId: socket.id,
                isOnline: true,
                lastActive: Date.now()
            });
        }

        io.emit("admin:active_users", Array.from(activeVisitors.values()));
    });

    // 2. Visitor navigates to a new page
    socket.on("visitor_update", (data) => {
        const sid = data.sessionId;
        if (!sid || (data.path && data.path.startsWith("/admin"))) {
            if (sid && activeVisitors.has(sid)) {
                activeVisitors.delete(sid);
                io.emit("admin:active_users", Array.from(activeVisitors.values()));
            }
            return;
        }

        if (activeVisitors.has(sid)) {
            const user = activeVisitors.get(sid);
            activeVisitors.set(sid, {
                ...user,
                ...data,
                socketId: socket.id,
                isOnline: true,
                lastActive: Date.now()
            });
            io.emit("admin:active_users", Array.from(activeVisitors.values()));
        } else {
            // Fallback if update comes before join
            activeVisitors.set(sid, {
                ...data,
                socketId: socket.id,
                isOnline: true,
                joinTime: Date.now()
            });
            io.emit("admin:active_users", Array.from(activeVisitors.values()));
        }
    });

    // 3. Visitor closes tab
    socket.on("disconnect", () => {
        // Find user by socket.id and mark them offline
        for (let [sid, user] of activeVisitors.entries()) {
            if (user.socketId === socket.id) {
                activeVisitors.set(sid, {
                    ...user,
                    isOnline: false,
                    offlineAt: Date.now()
                });
                io.emit("admin:active_users", Array.from(activeVisitors.values()));
                break;
            }
        }
        console.log("🔥 Socket disconnected:", socket.id);
    });
});

// 5. Mount the tracking routes
app.use("/api/track", trackRouter);

// 6. Connect DB and Start HTTP + Socket Server
connectDB().then(() => {
    // IMPORTANT: Use server.listen, not app.listen
    server.listen(PORT, () => {
        console.log(`Server & Sockets are successfully running on port ${PORT}`);
    });
}).catch((err) => {
    console.error("Database connection failed:", err);
});