import serverless from "serverless-http";
import { app } from "../../server/app.js";
import { connectDb } from "../../server/core/db.js";


let dbConnection = null;
function ensureDb() {
  if (!dbConnection) dbConnection = connectDb();
  return dbConnection;
}

const expressHandler = serverless(app);

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await ensureDb();
  return expressHandler(event, context);
};
