const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    eventType: {
        type: String,
        required: true,
        // ⚡ NEW: Added "checkout_view" to the enum
        enum: ["page_view", "product_click", "checkout_view", "checkout_attempt"]
    },
    path: { type: String, default: "/" },
    productName: { type: String, default: "" },
    orderTotal: { type: Number, default: 0 },
    customerData: {
        name: { type: String, default: "" },
        whatsapp: { type: String, default: "" },
        address: { type: String, default: "" }
    },
    utmSource: { type: String, default: "direct" },
    deviceType: { type: String, default: "Desktop" },
    sessionId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", eventSchema);