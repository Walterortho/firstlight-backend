import mongoose from "mongoose";

// Stores the admin login PIN in the database (hashed) so it can be
// changed at runtime, instead of being fixed in the .env file.
// There should only ever be one document in this collection.
const adminSettingsSchema = new mongoose.Schema(
  {
    pin: { type: String, required: true }, // bcrypt-hashed PIN
  },
  { timestamps: true }
);

export default mongoose.model("AdminSettings", adminSettingsSchema);
