import { glob } from "../modules/glob.ts";

export const loader = async () => {
  const target = Deno.cwd();
  const files = await glob("controller,service", target);
  const promiseImport = files.map((file) => import(file).then(() => {}));
  return Promise.all(promiseImport);
};