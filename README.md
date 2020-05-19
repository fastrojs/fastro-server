![ci](https://github.com/fastrojs/fastro-server/workflows/ci/badge.svg)
# Fastro
Fast, unopinionated, minimalist web framework for [deno](https://deno.land/).

```ts
import { Fastro } from "https://deno.land/x/fastro/mod.ts";

const server = new Fastro();

server.get("/", (req) => req.send("root"));

await server.listen({ port: 8000 });

```

Available route shorthand declaration 
- `server.get(path, handler)`
- `server.post(path, handler)`
- `server.put(path, handler)`
- `server.head(path, handler)`
- `server.delete(path, handler)`
- `server.options(path, handler)`
- `server.patch(path, handler)`

## Example
You can see above basic example code here: [hello.ts](https://github.com/fastrojs/fastro-server/blob/master/examples/hello.ts)

Check the following [source code](https://github.com/fastrojs/fastro-server/blob/master/examples/main.ts) to find out how to:
- [send simple text & json data](https://github.com/fastrojs/fastro-server/blob/master/examples/main.ts#L5)
- [handle url parameters](https://github.com/fastrojs/fastro-server/blob/master/examples/main.ts#L35)
- [set custom http headers & status](https://github.com/fastrojs/fastro-server/blob/master/examples/main.ts#L25)
- [handle http posts & get the payload](https://github.com/fastrojs/fastro-server/blob/master/examples/main.ts#L47)
- [add optional callback](https://github.com/fastrojs/fastro-server/blob/master/examples/main.ts#L58)
