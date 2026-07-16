import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import path from "path";
import bcrypt from "bcryptjs";
import Parcel from "./models/parcel.js";
import Message from './models/Message.js';
import AdminSettings from "./models/AdminSettings.js";
import dotenv from "dotenv"
dotenv.config();

// SOCKET IO Setup
import http from 'http';
import { Server } from 'socket.io';

// -----------------------------------------------------------
// --- GLOBAL DECLARATIONS (CRITICAL FOR SCOPE) ---
// -----------------------------------------------------------
let conn; // Will hold the native MongoDB connection object (used by DELETE route)
const PORT = process.env.PORT || 5000;

const app = express();
// Add middleware to set correct MIME types for PWA files
app.use((req, res, next) => {
    if (req.url === '/manifest.json') {
        res.setHeader('Content-Type', 'application/manifest+json');
    }
    if (req.url === '/service-worker.js') {
        res.setHeader('Content-Type', 'application/javascript');
    }
    next();
});

const allowedOrigins = [
    'https://firstlightlogistics.online',
    'https://www.firstlightlogistics.online',
    'https://firstlight-frontend.vercel.app',
    'http://localhost:5000', // Assuming this is your local dev port
    'http://localhost:3000' // If you also use a local Next.js/React dev server
];

const corsOptions = {
    origin: allowedOrigins, // Use the new array
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    optionsSuccessStatus: 204
};

// HEALTH CHECK ENDPOINT
// This route responds to the /status URL
app.get("/status", (req, res) => {
    // You can return a simple JSON object or just a string
    res.status(200).json({
        status: "OK",
        message: "Backend is operational"
    });
});

// -----------------------------------------------------------
// --- EXPRESS MIDDLEWARE (Basic, non-DB dependent) ---
// -----------------------------------------------------------

app.use(cors(corsOptions));
app.use(express.json());


// -----------------------------------------------------------
// --- MONGODB CONNECTION & SERVER STARTUP (CRITICAL SECTION) ---
// -----------------------------------------------------------

mongoose.connect(process.env.MONGO_URI)
  .then((connection) => {
    // CRITICAL FIX: 'conn' is assigned only when connection is successful
    conn = connection.connection.db;
    console.log("MongoDB Connected ✅");

    // ---------------------------------------------------------
    // --- SEED ADMIN PIN FROM .env (ONLY IF NOT ALREADY IN DB) ---
    // ---------------------------------------------------------
    (async () => {
        try {
            const existingSettings = await AdminSettings.findOne();
            if (!existingSettings) {
                const hashedPin = await bcrypt.hash(process.env.ADMIN_PIN, 10);
                await AdminSettings.create({ pin: hashedPin });
                console.log("Admin PIN seeded from .env into database ✅");
            }
        } catch (err) {
            console.error("Error seeding admin PIN:", err);
        }
    })();
   
    // ---------------------------------------------------------
    // --- 1. INITIALIZE SERVER AND SOCKET.IO HERE ---
    // ---------------------------------------------------------
   
    // We must define these here so they start listening AFTER the DB connects.
      const server = http.createServer(app);
    const io = new Server(server, {     
        cors: {
            origin: allowedOrigins, // <-- **CHANGE: Use the defined array**
            methods: ["GET", "POST"],
            credentials: true // <-- **ADD THIS: Important for Vercel/Render trust**
        }
    });

    // ---------------------------------------------------------
    // --- 2. SOCKET.IO CHAT LOGIC (MOVED HERE) ---
    // ---------------------------------------------------------
   
    io.on('connection', (socket) => {
        console.log(`User connected: ${socket.id}`);
   
        // --- A. Load History ---
        socket.on('load history', async (sessionId) => {
            try {
                const history = await Message.find({ sessionId }).sort({ timestamp: 1 });
                socket.emit('chat history', history);
            } catch (error) {
                console.error("Error loading chat history:", error);
            }
        });
   
        // --- B. Handle New Messages ---
        socket.on('chat message', async (data) => {
            try {
                const newMessage = new Message(data);
                await newMessage.save();
                io.to(data.sessionId).emit('chat message', newMessage);
             
                if (data.senderType === 'user') {
                     io.to('admin_dashboard').emit('new user message', data.sessionId);
                }
            } catch (error) {
                console.error("Error saving message:", error);
            }
        });
     
        // --- C. Join a Room ---
        socket.on('join session', (sessionId) => {
            socket.join(sessionId);
            console.log(`Socket ${socket.id} joined room ${sessionId}`);
        });
   
        // Handle disconnect
        socket.on('disconnect', () => {
            console.log('User disconnected');
        });
    });


    // ---------------------------------------------------------
    // --- 3. API ROUTES & DEPENDENT MIDDLEWARE (MOVED HERE) ---
    // ---------------------------------------------------------

    // Multer for image upload (Moved inside)
    const storage = multer.diskStorage({
      destination: (req, file, cb) => cb(null, "uploads/"),
      filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
    });
    const upload = multer({ storage });
   
    // Make uploads folder public (Moved inside)
    app.use("/uploads", express.static("uploads"));
   
    // Static file serving (Moved inside)
    app.use(express.static(path.join(process.cwd(), "public")));

    // Base Routes (Moved inside)
    app.get("/", (req, res) => {
      res.sendFile(path.join(process.cwd(), "public", "index.html"));
    });
   
    app.get("/admin", (req, res) => {
      res.sendFile(path.join(process.cwd(), "public", "admin-login.html"));
    });

    // ADMIN LOGIN API ENDPOINT
    app.post("/api/admin/login", async (req, res) => {
        try {
            const { pin } = req.body;
            const settings = await AdminSettings.findOne();
            if (!settings) {
                return res.status(500).json({ success: false, message: "Admin PIN not configured" });
            }
            const match = await bcrypt.compare(pin, settings.pin);
            if (match) {
                return res.json({ success: true, message: "Login successful" });
            } else {
                return res.status(401).json({ success: false, message: "Invalid access pin" });
            }
        } catch (err) {
            console.error("Error during admin login:", err);
            res.status(500).json({ success: false, message: "Error logging in", error: err.message });
        }
    });

    // ADMIN CHANGE PIN ENDPOINT
    app.post("/api/admin/change-pin", async (req, res) => {
        try {
            const { currentPin, newPin } = req.body;

            if (!newPin || newPin.length < 4) {
                return res.status(400).json({ success: false, message: "New PIN must be at least 4 characters" });
            }

            const settings = await AdminSettings.findOne();
            if (!settings) {
                return res.status(500).json({ success: false, message: "Admin PIN not configured" });
            }

            const match = await bcrypt.compare(currentPin, settings.pin);
            if (!match) {
                return res.status(401).json({ success: false, message: "Current PIN is incorrect" });
            }

            settings.pin = await bcrypt.hash(newPin, 10);
            await settings.save();

            res.json({ success: true, message: "PIN updated successfully" });
        } catch (err) {
            console.error("Error changing admin PIN:", err);
            res.status(500).json({ success: false, message: "Error updating PIN", error: err.message });
        }
    });

    // --- CREATE PARCEL ---
    app.post("/api/parcels", upload.single("image"), async (req, res) => {
      try {
        const {
          senderName, senderAddress, senderEmail, senderPhone,
          receiverName, receiverAddress, receiverEmail, receiverPhone,
          parcelWeight, parcelType, description, terminal,
          departureDate, expectedDeliveryDate
        } = req.body;

        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
        const trackingNumber = "TRK" + Date.now();

        const parcel = new Parcel({
          trackingNumber,
          senderName, senderAddress, senderEmail, senderPhone,
          receiverName, receiverAddress, receiverEmail, receiverPhone,
          parcelWeight, parcelType, description, imageUrl,
          terminal, currentLocation: terminal,
          departureDate, expectedDeliveryDate,
          statusHistory: [{ status: "Pending", location: terminal }]
        });

        await parcel.save();
        res.json({ success: true, message: "Parcel created", parcel });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error creating parcel", error: err.message });
      }
    });

    // --- UPDATE PARCEL STATUS ---
    app.put("/api/parcels/:trackingNumber", async (req, res) => {
      try {
        const { trackingNumber } = req.params;
        const { status, location } = req.body;

        const parcel = await Parcel.findOne({ trackingNumber });
        if (!parcel) return res.status(404).json({ success: false, message: "Parcel not found" });

        parcel.statusHistory.push({ status, location });
        parcel.currentLocation = location || parcel.currentLocation;

        await parcel.save();
        res.json({ success: true, message: "Status updated", parcel });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error updating status", error: err.message });
      }
    });

    // --- GET SINGLE PARCEL ---
    app.get("/api/parcels/:trackingNumber", async (req, res) => {
      try {
        const trackingId = req.params.trackingNumber.toUpperCase();
        const parcel = await Parcel.findOne({ trackingNumber: trackingId });
     
        if (!parcel) return res.status(404).json({ success: false, message: "Parcel not found" });
     
        res.json({ success: true, parcel });
      } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching parcel", error: err.message });
      }
    });

    // --- GET ALL PARCELS ---
    app.get("/api/parcels", async (req, res) => {
      try {
        const parcels = await Parcel.find().sort({ createdAt: -1 });
        res.json({ success: true, parcels });
      } catch (err) {
        res.status(500).json({ success: false, message: "Error fetching parcels", error: err.message });
      }
    });

    // --- DELETE ROUTE (Uses 'conn') ---
    app.delete('/api/parcels/:trackingNumber', async (req, res) => {
        // 'conn' is now defined and ready here
       
        try {
            const trackingNumber = req.params.trackingNumber;

            const result = await conn.collection('parcels').deleteOne({ trackingNumber: trackingNumber });

            if (result.deletedCount === 0) {
                return res.status(404).json({ success: false, message: 'Shipment not found.' });
            }

            await conn.collection('chats').deleteMany({ sessionId: trackingNumber });

            res.json({ success: true, message: `Shipment ${trackingNumber} and associated chats deleted successfully.` });
        } catch (err) {
            console.error("Error deleting shipment:", err);
            res.status(500).json({ success: false, message: 'Internal server error during deletion.' });
        }
    });

    // --- GET ACTIVE CHAT SESSIONS FOR ADMIN DASHBOARD ---
    app.get("/api/chats/active-sessions", async (req, res) => {
        try {
            const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            const activeSessions = await Message.aggregate([
                { $match: { timestamp: { $gte: oneWeekAgo } } },
                { $group: {
                    _id: "$sessionId",
                    lastMessageTime: { $max: "$timestamp" }
                }},
                { $sort: { lastMessageTime: -1 } }
            ]);

            res.json({ success: true, sessions: activeSessions });
        } catch (err) {
            console.error("Error fetching active chat sessions:", err);
            res.status(500).json({ success: false, message: "Error fetching sessions", error: err.message });
        }
    });

    // -----------------------------------------------------------
    // --- 4. START SERVER LISTENING (LAST STEP) ---
    // -----------------------------------------------------------
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
   
  })
  .catch(err => console.error("MongoDB Error:", err));