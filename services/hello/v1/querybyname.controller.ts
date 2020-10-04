import type { Request } from "../../../mod.ts";
export const params = true;
export const methods = ["GET"];
export const handler = async (request: Request) => {
  const query = await request.getQuery("name");
  request.send(query);
};
