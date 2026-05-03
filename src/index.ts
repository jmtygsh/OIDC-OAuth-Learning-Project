import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import { eq, or } from "drizzle-orm";
import JWT from "jsonwebtoken";
import jose from "node-jose";
import { db } from "./db";
import { usersTable, devConsoleTable } from "./db/schema";
import { PRIVATE_KEY, PUBLIC_KEY } from "./utils/cert";
import type { JWTClaims } from "./utils/user-token";

const app = express();
const PORT = process.env.PORT ?? 8000;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.resolve("public")));

app.get("/", (req, res) => res.json({ message: "Hello from Auth Server" }));

app.get("/health", (req, res) =>
  res.json({ message: "Server is healthy", healthy: true }),
);

// OIDC Endpoints
app.get("/.well-known/openid-configuration", (req, res) => {
  const ISSUER = `http://localhost:${PORT}`;
  return res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/v1/authenticate`,
    userinfo_endpoint: `${ISSUER}/v1/userinfo`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    token_endpoint: `${ISSUER}/v1/tokeninfo`,
  });
});

app.get("/.well-known/jwks.json", async (_, res) => {
  const key = await jose.JWK.asKey(PUBLIC_KEY, "pem");
  return res.json({ keys: [key.toJSON()] });
});

app.get("/v1/authenticate", async (req, res) => {

  const { client_id } = req.query;

  if (!client_id) {
    res.status(400).json({ message: "Missing required query param: client_id" });
    return;
  }

  const [clientApp] = await db
    .select()
    .from(devConsoleTable)
    .where(eq(devConsoleTable.clientId, client_id as string))
    .limit(1);

  if (!clientApp) {
    res.status(401).json({ message: "Invalid client_id." });
    return;
  }

  const appName = escapeHtml(clientApp.applicationName ?? "this application");
  const htmlPath = path.resolve("public", "authenticate.html");
  const html = await readFile(htmlPath, "utf8");
  const renderedHtml = html.replaceAll("{{APP_NAME}}", appName);

  return res.type("html").send(renderedHtml);
});


app.post("/v1/authenticate/sign-in", async (req, res) => {
  const { email, password, client_id } = req.body;

  if (!email || !password || !client_id) {
    res.status(400).json({ message: "Email, password, and client_id are required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user || !user.password || !user.salt) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const hash = crypto
    .createHash("sha256")
    .update(password + user.salt)
    .digest("hex");

  if (hash !== user.password) {
    res.status(401).json({ message: "Invalid email or password." });
    return;
  }


  const code = crypto.randomBytes(8).toString("hex");
  const codeExpireAt = new Date(Date.now() + 60 * 1000); // 1 minute

  const [updatedApp] = await db
    .update(devConsoleTable)
    .set({ code, codeExpireAt })
    .where(eq(devConsoleTable.clientId, client_id))
    .returning({
      redirectUrl: devConsoleTable.redirectUrl,
    });

  if (!updatedApp) {
    return res.status(401).json({ message: "Invalid clientId" });
  }

  const redirectUrl = new URL(updatedApp.redirectUrl);
  redirectUrl.searchParams.set("code", code);

  return res.json({ redirect: redirectUrl.toString() });

});

app.post("/v1/authenticate/sign-up", async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!email || !password || !firstName) {
    res
      .status(400)
      .json({ message: "First name, email, and password are required." });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing) {
    res
      .status(409)
      .json({ message: "An account with this email already exists." });
    return;
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHash("sha256")
    .update(password + salt)
    .digest("hex");

  const [createdUser] = await db.insert(usersTable).values({
    firstName,
    lastName: lastName ?? null,
    email,
    password: hash,
    salt,
  }).returning({
    id: usersTable.id,
  });

  const redirectUrl = new URLSearchParams({
    user_id: createdUser.id
  });

  res.status(201).json({
    ok: true,
    user: createdUser,
    redirect: `/developer-console?${redirectUrl.toString()}`,
  });
});

app.get("/v1/userinfo", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ message: "Missing or invalid Authorization header." });
    return;
  }

  const token = authHeader.slice(7);

  let claims: JWTClaims;
  try {
    claims = JWT.verify(token, PUBLIC_KEY, {
      algorithms: ["RS256"],
    }) as JWTClaims;
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, claims.sub))
    .limit(1);

  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  res.json({
    sub: user.id,
    email: user.email,
    email_verified: user.emailVerified,
    given_name: user.firstName,
    family_name: user.lastName,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    picture: user.profileImageURL,
  });
});


app.post("/v1/tokeninfo", async (req, res) => {
  const { code, client_secret } = req.body;

  if (!code || !client_secret) {
    res.status(400).json({ message: "Code and client_secret are required." });
    return;
  }

  const [clientApp] = await db
    .select()
    .from(devConsoleTable)
    .where(eq(devConsoleTable.code, code))
    .limit(1);

  if (!clientApp) {
    res.status(401).json({ message: "Invalid code." });
    return;
  }

  if (!clientApp.codeExpireAt || clientApp.codeExpireAt < new Date()) {
    res.status(401).json({ message: "Code expired." });
    return;
  }

  if (!clientApp.salt) {
    res.status(401).json({ message: "Invalid client configuration." });
    return;
  }

  const hashedClientSecret = crypto
    .createHash("sha256")
    .update(client_secret + clientApp.salt)
    .digest("hex");

  if (clientApp.clientSecret !== hashedClientSecret) {
    res.status(401).json({ message: "Invalid client_secret." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, clientApp.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ message: "User not found for this client." });
    return;
  }

  const ISSUER = `http://localhost:${PORT}`;
  const now = Math.floor(Date.now() / 1000);

  const claims: JWTClaims = {
    iss: ISSUER,
    sub: user.id,
    email: user.email,
    email_verified: String(user.emailVerified),
    exp: now + 3600,
    given_name: user.firstName ?? "",
    family_name: user.lastName ?? undefined,
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    picture: user.profileImageURL ?? undefined,
  };

  const token = JWT.sign(claims, PRIVATE_KEY, { algorithm: "RS256" });

  await db
    .update(devConsoleTable)
    .set({
      token,
      tokenExpireAt: new Date((now + 3600) * 1000),
      code: null,
      codeExpireAt: null,
    })
    .where(eq(devConsoleTable.id, clientApp.id));

  res.json({ token });
});

// trust form routes
app.get("/developer-console", (req, res) => {
  return res.sendFile(path.resolve("public", "developer-console.html"));
});

app.post("/developer-console", async (req, res) => {
  const { userId, applicationName, baseUrl, redirectUrl } = req.body;

  if (!userId || !applicationName || !baseUrl || !redirectUrl) {
    res
      .status(400)
      .json({ message: "User Id, Application Name, Base Url, and Redirect Url are required." });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  const [existing] = await db
    .select({ id: devConsoleTable.id })
    .from(devConsoleTable)
    .where(
      or(
        eq(devConsoleTable.baseUrl, baseUrl),
        eq(devConsoleTable.redirectUrl, redirectUrl),
      ),
    )
    .limit(1);

  if (existing) {
    res
      .status(409)
      .json({ message: "A trust with this base URL or redirect URL already exists." });
    return;
  }

  // Generate credentials
  const clientId = crypto.randomUUID(); //generate
  const clientSecret = crypto.randomBytes(32).toString("hex"); //generate 
  const salt = crypto.randomBytes(16).toString("hex");


  const secretHash = crypto
    .createHash("sha256")
    .update(clientSecret + salt)
    .digest("hex");

  await db.insert(devConsoleTable).values({
    userId: user.id,
    applicationName,
    baseUrl,
    redirectUrl,
    clientId,
    clientSecret: secretHash,
    salt,
  });

  // Return the raw secret to the user ONCE.
  res.status(201).json({ clientId, clientSecret });
});

app.listen(PORT, () => {
  console.log(`AuthServer is running on PORT ${PORT}`);
});
