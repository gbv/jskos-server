import mongoose from "mongoose"

export const Concept = mongoose.model("Concept", new mongoose.Schema({
  _id: String,
}, {
  versionKey: false,
  strict: false,
  autoIndex: false,
}),
)
