// tests/setup.js
//
// Shared helpers — each test file calls connectInMemoryMongo() in beforeAll
// and disconnectInMemoryMongo() in afterAll. Collections are cleared between
// tests so files stay isolated.

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

async function connectInMemoryMongo() {
  if (mongoose.connection.readyState === 1) return;
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function disconnectInMemoryMongo() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function clearCollections() {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({}))
  );
}

module.exports = {
  connectInMemoryMongo,
  disconnectInMemoryMongo,
  clearCollections,
};
