import { Request } from "../mod.ts";

export default function (request: Request) {
  request.json({ message: "hello" });
}
