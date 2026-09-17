import { AppError } from "@/server/platform/errors";
import { defineRoute } from "@/server/platform/http/route";

/** Unknown API paths return problem+json 404 instead of an HTML page. */
const notFound = defineRoute({ name: "API not found", actor: "none", csrf: "none" }, async () => {
  throw new AppError("NOT_FOUND");
});

export {
  notFound as GET,
  notFound as POST,
  notFound as PUT,
  notFound as PATCH,
  notFound as DELETE,
};
