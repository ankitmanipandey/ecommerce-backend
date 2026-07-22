const express = require("express");
const trackRouter = express.Router();
const Event = require("../models/Event");

trackRouter.post("/event", async (req, res) => {
    try {
        // ⚡ FIX: Block Meta/Facebook crawlers from creating fake analytics
        const ua = req.get('User-Agent') || '';
        if (/facebookexternalhit|Facebot|WhatsApp|Twitterbot|Googlebot|bytespider/i.test(ua)) {
            return res.status(200).json({ success: true, message: "Bot traffic ignored" });
        }

        const { eventType, path, productName, orderTotal, customerData, utmSource, deviceType, sessionId } = req.body;

        if (!sessionId || !eventType) {
            return res.status(400).json({ success: false, message: "Missing sessionId or eventType" });
        }

        // ⚡ Reduced time limit to 1 minute. If they change their mind and come back, we log it!
        if ((eventType === "product_click" || eventType === "checkout_view") && productName) {
            const timeLimit = new Date(Date.now() - 1 * 60000);
            const existingEvent = await Event.findOne({
                eventType: eventType,
                sessionId: sessionId,
                productName: productName,
                timestamp: { $gt: timeLimit }
            });

            if (existingEvent) {
                return res.status(200).json({ success: true, message: `Duplicate ${eventType} ignored` });
            }
        }

        const newEvent = new Event({
            eventType,
            path,
            productName,
            orderTotal: orderTotal || 0,
            customerData,
            utmSource: utmSource || "direct",
            deviceType: deviceType || "Desktop",
            sessionId
        });

        await newEvent.save();

        if (req.io) {
            req.io.emit("admin:realtime_event", newEvent);
        }

        res.status(201).json({ success: true, message: "Event logged successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to log event" });
    }
});

trackRouter.get("/stats", async (req, res) => {
    try {
        const uniqueClicks = await Event.distinct("sessionId", { eventType: "page_view" });
        const totalAdClicks = uniqueClicks.length;

        const checkouts = await Event.find({ eventType: "checkout_attempt" }).sort({ timestamp: -1 });
        const checkoutAttempts = checkouts.length;

        const totalRevenue = checkouts.reduce((sum, order) => sum + (order.orderTotal || 0), 0);

        const estAdSpend = 1500;
        const estCAC = checkoutAttempts > 0 ? (estAdSpend / checkoutAttempts).toFixed(2) : "0.00";
        const conversionRate = totalAdClicks > 0 ? ((checkoutAttempts / totalAdClicks) * 100).toFixed(1) : "0.0";

        res.json({
            success: true,
            totalAdClicks,
            checkoutAttempts,
            totalRevenue,
            estAdSpend,
            estCAC,
            conversionRate,
            checkouts
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch stats" });
    }
});

trackRouter.get("/traffic", async (req, res) => {
    try {
        const uniqueEvents = await Event.aggregate([
            { $match: { eventType: "page_view" } },
            { $group: { _id: "$sessionId", doc: { $first: "$$ROOT" } } },
            { $replaceRoot: { newRoot: "$doc" } }
        ]);

        const total = uniqueEvents.length;
        let sources = { instagram_reel: 0, fb_carousel: 0, direct: 0 };
        let devices = { Mobile: 0, Desktop: 0 };

        uniqueEvents.forEach(e => {
            if (e.utmSource === 'instagram_reel') sources.instagram_reel++;
            else if (e.utmSource === 'fb_carousel') sources.fb_carousel++;
            else sources.direct++;

            if (e.deviceType === 'Mobile') devices.Mobile++;
            else devices.Desktop++;
        });

        res.json({ success: true, total, sources, devices });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch traffic stats" });
    }
});

trackRouter.get("/product-stats", async (req, res) => {
    try {
        const productStats = await Event.aggregate([
            { $match: { eventType: "product_click", productName: { $ne: "", $exists: true } } },
            { $group: { _id: { product: "$productName", session: "$sessionId" } } },
            { $group: { _id: "$_id.product", clicks: { $sum: 1 } } },
            { $sort: { clicks: -1 } }
        ]);

        res.json({ success: true, productStats });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch product stats" });
    }
});

// ⚡ FIX: Removed Grouping. Now returns a full preserved log of intents!
trackRouter.get("/checkout-intents", async (req, res) => {
    try {
        const recentViews = await Event.aggregate([
            { $match: { eventType: "checkout_view", productName: { $ne: "" } } },
            { $sort: { timestamp: -1 } },
            { $limit: 40 } // Show the last 40 logs
        ]);

        const sessionIds = recentViews.map(v => v.sessionId);

        const attempts = await Event.find({
            eventType: "checkout_attempt",
            sessionId: { $in: sessionIds }
        });

        const checkoutIntents = recentViews.map(view => {
            // Find if this SPECIFIC cart intent was completed
            const attempt = attempts.find(a => a.sessionId === view.sessionId && a.productName === view.productName);
            return {
                _id: view._id,
                orderId: view._id.toString().slice(-4).toUpperCase(),
                productName: view.productName,
                sessionId: view.sessionId,
                timestamp: view.timestamp,
                completed: !!attempt,
                customerName: attempt ? attempt.customerData.name : "N/A (Draft)",
                whatsapp: attempt ? attempt.customerData.whatsapp : "N/A"
            };
        });

        res.json({ success: true, checkoutIntents });
    } catch (error) {
        console.error("Checkout Intents Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch checkout intents" });
    }
});

module.exports = trackRouter;