import { Router } from "express";
import { AuthError } from "../auth/auth.service.js";
import {
  createPublicKeyPem,
  getIssuerPublicKeyDocument,
  renderIssuerPublicKeyHtml,
  rsaPublicJwkSchema
} from "../utils/create-public-key.js";

export const utilsRoutes = Router();

utilsRoutes.get("/createPublicKey", async (request, response, next) => {
  try {
    const document = await getIssuerPublicKeyDocument();
    if (request.accepts(["html", "json"]) === "html") {
      response.status(200).type("html").send(renderIssuerPublicKeyHtml(document));
      return;
    }
    response.status(200).json(document);
  } catch (error) {
    next(error);
  }
});

utilsRoutes.post("/createPublicKey", (request, response, next) => {
  try {
    const parsed = rsaPublicJwkSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AuthError(400, "Invalid request body");
    }
    let publicKeyPem: string;
    try {
      publicKeyPem = createPublicKeyPem(parsed.data);
    } catch {
      throw new AuthError(400, "Invalid RSA public key parameters");
    }
    response.status(200).json({ publicKeyPem });
  } catch (error) {
    next(error);
  }
});
