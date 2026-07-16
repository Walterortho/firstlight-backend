import mongoose from "mongoose";

const shipmentSchema = new mongoose.Schema({
  receiver: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    destination: { type: String, required: true }
  },
  sender: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true }
  },
  parcel: {
    photo: { type: String },
    description: { type: String, required: true },
    departureDate: { type: Date, required: true },
    deliveryDate: { type: Date, required: true },
    location: { type: String, required: true },
    terminal: { type: String, required: true },
    weight: { type: Number, required: true }
  },
  tracking: { type: String, required: true, unique: true },
  status: { type: String, default: "Pending" },
  route: [
    {
      locationName: String,
      coords: { lat: Number, lng: Number },
      timestamp: Date
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Shipment", shipmentSchema);

