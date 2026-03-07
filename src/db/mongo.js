const mongoose = require("mongoose");

async function connectMongo(mongodbUri) {
  await mongoose.connect(mongodbUri);
}

module.exports = {
  connectMongo,
};
