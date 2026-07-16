import mongoose from "mongoose";

const statusUpdateSchema = new mongoose.Schema({
  status: { type: String, required: true },
  location: { type: String }, // e.g., airport, port, city
  date: { type: Date, default: Date.now },
});

const parcelSchema = new mongoose.Schema({
  trackingNumber: { type: String, unique: true, required: true },
 
  // Sender details
  senderName: { type: String, required: true },
  senderAddress: { type: String, required: true },
  senderEmail: { type: String },
  senderPhone: { type: String },
 
  // Receiver details
  receiverName: { type: String, required: true },
  receiverAddress: { type: String, required: true },
  receiverEmail: { type: String },
  receiverPhone: { type: String },
 
  // Parcel details
  parcelWeight: { type: String },
  parcelType: { type: String },
  description: { type: String },
  imageUrl: { type: String },
  terminal: { type: String }, // airport, port, or hub
  currentLocation: { type: String }, // for admin updates
  departureDate: { type: Date },
  expectedDeliveryDate: { type: Date },

  // Tracking status history
  statusHistory: [statusUpdateSchema],

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Parcel", parcelSchema);