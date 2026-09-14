import serverless from "serverless-http";
import { app } from "../../server/app.js";
import { connectDb } from "../../server/core/db.js";


let dbConnection = null;
function ensureDb() {
  // A rejected connection attempt must not be cached — the next invocation
  // needs to retry, not keep replaying a stale failure forever.
  if (!dbConnection) {
    dbConnection = connectDb().catch((err) => {
      dbConnection = null;
      throw err;
    });
  }
  return dbConnection;
}

const expressHandler = serverless(app);

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  try {
    await ensureDb();
  } catch (err) {
    // Netlify turns a rejected handler promise into a bare 502 with no body
    // — exactly the unhelpful thing this project's own error handling
    // (server/app.js's) always tries to avoid. Return a real JSON error
    // instead, and put the actual reason where it's actually visible: this
    // function's logs in the Netlify dashboard.
    console.error("Netlify function: database connection failed:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "db_unavailable", message: "Could not reach the database. Check MONGODB_URI and Atlas network access." }),
    };
  }
  return expressHandler(event, context);
};
