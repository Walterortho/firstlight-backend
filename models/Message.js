// models/Message.js

import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
    // Unique ID for the conversation (stored in the user's browser)
    sessionId: {
        type: String,
        required: true,
        index: true // For fast lookups
    },
    // Sender type: 'user' or 'admin'
    senderType: {
        type: String,
        enum: ['user', 'admin'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Message', MessageSchema);