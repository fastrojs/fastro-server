// Copyright 2020 - 2021 the Fastro author. All rights reserved. MIT license.

// deno-lint-ignore-file no-explicit-any
import {
  Cookie,
  createElement,
  decodeBase64,
  deleteCookie,
  getCookies,
  green,
  isFormFile,
  MultipartReader,
  parseYml,
  red,
  renderToString,
  Response,
  serve,
  Server,
  ServerRequest,
  setCookie,
  yellow,
} from "../deps.ts";
import { react, root } from "../template/react.ts";
import {
  CONTAINER,
  CONTENT_TYPE,
  CONTROLLER_FILE,
  DENO_ENV,
  DEV_ENV,
  FASTRO_VERSION,
  HOSTNAME,
  MAX_MEMORY,
  MIDDLEWARE_DIR,
  MODULE_DIR,
  NO_CONFIG,
  NO_DEPS,
  NO_MIDDLEWARE,
  NO_SERVICE,
  NO_STATIC_FILE,
  NO_TEMPLATE,
  NOT_FOUND,
  PAGE_FILE,
  PORT,
  REACT_ROOT,
  RUNNING_TEXT,
  STATIC_DIR,
  TEMPLATE_DIR,
  TEMPLATE_FILE,
  TEST_ENV,
} from "./constant.ts";
import {
  Controller,
  Cookies,
  DynamicController,
  DynamicPage,
  Middleware,
  MultiPartData,
  Page,
  Query,
  Schema,
  ServerOptions,
} from "./types.ts";
import { Data, HandlerOptions, HttpMethod } from "./types.ts";
import {
  createError,
  getErrorTime,
  replaceAll,
  validateObject,
} from "./utils.ts";

/**
 * You have to create a `Fastro` class instance.
 * This will load all of your controller file  automatically.
 *
 *      const server = new Fastro();
 *
 * With server options, you can change default service folder, add prefix, or enable cors.
 *
 *      const serverOptions = {
 *        cors: true,
 *        prefix: "api",
 *        moduleDir: "api",
 *        staticFile: true,
 *      };
 *      const server = new Fastro(serverOptions);
 */
export class Fastro {
  private appStatus!: string;
  private corsEnabled!: boolean;
  private cwd = Deno.cwd();
  private dynamicController: DynamicController[] = [];
  private dynamicPage: DynamicPage[] = [];
  private hostname = HOSTNAME;
  private middlewares = new Map<string, Middleware>();
  private pages = new Map<string, Page>();
  private port = PORT;
  private prefix!: string;
  private server!: Server;
  private moduleDir = MODULE_DIR;
  private staticDir = STATIC_DIR;
  private controller = new Map<string, Controller>();
  private staticFiles = new Map<string, any>();
  private templateFiles = new Map<string, any>();
  private container: any = undefined;

  constructor(options?: ServerOptions) {
    if (options && options.cors) this.corsEnabled = options.cors;
    if (options && options.hostname) this.hostname = options.hostname;
    if (options && options.prefix) this.prefix = options.prefix;
    if (options && options.port) this.port = options.port;
    if (options && options.serviceDir) this.moduleDir = options.serviceDir;
    if (options && options.staticDir) this.staticDir = options.staticDir;
    this.initApp();
  }

  private handleRoot(request: Request) {
    const index = this.staticFiles.get("/index.html");
    if (!index) return request.send(`Fastro v${FASTRO_VERSION}`);
    request.send(index);
  }

  private send<T>(
    payload: string | T,
    status: number | undefined = 200,
    headers: Headers | undefined = new Headers(),
    req: Request,
  ) {
    try {
      let body: string | Uint8Array | Deno.Reader | undefined;
      if (
        typeof payload === "string" ||
        payload instanceof Uint8Array
      ) {
        body = payload;
      } else if (typeof payload === "undefined") body = "undefined";
      else if (Array.isArray(payload)) body = JSON.stringify(payload);
      else if (
        typeof payload === "number" ||
        typeof payload === "boolean" ||
        typeof payload === "bigint" ||
        typeof payload === "function" ||
        typeof payload === "symbol"
      ) {
        body = payload.toString();
      } else body = JSON.stringify(payload);
      const date = new Date().toUTCString();
      const cookie = req.response.headers?.get("set-cookie");
      if (cookie) headers.set("Set-Cookie", cookie);
      headers.set("Connection", "keep-alive");
      headers.set("Date", date);
      headers.set("x-powered-by", this.appStatus);
      if (this.corsEnabled) {
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Headers", "*");
        headers.set("Access-Control-Allow-Methods", "*");
      }
      req.respond({ headers, status, body });
    } catch (error) {
      error.message = "SEND_ERROR: " + error.message;
      console.error(error);
    }
  }

  private getCookiesByName(name: string, request: Request) {
    const cookies = request.headers.get("cookie")?.split(";");
    const results = cookies?.map((v: any) => {
      const [n, value] = v.split("=");
      const name = n.trim();
      return { name, value };
    })
      .filter((c: any) => c.name === name);
    if (!results || results.length < 1) return "";
    const [c] = results;
    return c.value;
  }

  private handleRedirect(url: string, status: number, request: ServerRequest) {
    const headers = new Headers();
    headers.set("Location", url);
    request.respond({ status, headers });
  }

  private async handleFormUrlEncoded(req: ServerRequest, contentType: string) {
    try {
      const d = new TextDecoder();
      const bodyString = d.decode(await Deno.readAll(req.body));
      const body = bodyString
        .replace(contentType, "")
        .split("&");

      const data: Data[] = [];
      body.forEach((i: string) => {
        if (i.includes("=")) {
          const [key, value] = i.split("=");
          const decodedV = decodeURIComponent(value);
          const decodedK = decodeURIComponent(key);
          const obj: Data = {};
          obj[decodedK] = decodedV;
          data.push(obj);
        } else {
          const obj = JSON.parse(i);
          data.push(obj);
        }
      });
      if (data.length > 1) return data;
      if (data.length === 1) {
        const [d] = data;
        return d;
      }
    } catch (error) {
      error.message = "HANDLE_FORM_URL_ENCODED_ERROR: " + error.message;
      throw error;
    }
  }

  private async handleMultipart(req: ServerRequest, contentType: string) {
    try {
      const decode = new TextDecoder().decode;
      const boundaries = contentType?.match(/boundary=([^\s]+)/);
      let boundary;
      const multiPartArray: MultiPartData[] = [];
      if (boundaries && boundaries?.length > 0) [, boundary] = boundaries;
      if (boundary) {
        const reader = new MultipartReader(req.body, boundary);
        const form = await reader.readForm(MAX_MEMORY);
        const map = new Map(form.entries());
        map.forEach((v, key) => {
          const content = form.file(key);
          if (isFormFile(content)) {
            const v = decode(content.content);
            multiPartArray.push({ key, value: v, filename: content.filename });
          } else {
            multiPartArray.push({ key, value: v });
          }
        });
        await form.removeAll();
      }

      return multiPartArray;
    } catch (error) {
      error.message = "HANDLE_MULTIPART_ERROR: " + error.message;
      throw error;
    }
  }

  private validateJsonPayload(payload: Data, url: string) {
    try {
      const controller = this.controller.get(url);
      if (
        controller && controller.options.validationSchema &&
        controller.options.validationSchema.body
      ) {
        const schema = controller.options.validationSchema.body as Schema;
        validateObject(payload, schema);
      }
    } catch (error) {
      error.message = "VALIDATE_JSON_PAYLOAD_ERROR: " + error.message;
      throw error;
    }
  }

  private async getPayload(requestServer: ServerRequest) {
    try {
      const d = new TextDecoder();
      const contentType = requestServer.headers.get(CONTENT_TYPE);
      if (contentType?.includes("multipart/form-data")) {
        return this.handleMultipart(requestServer, contentType);
      } else if (
        contentType?.includes("application/x-www-form-urlencoded")
      ) {
        return this.handleFormUrlEncoded(requestServer, contentType);
      } else if (
        contentType?.includes("application/json")
      ) {
        const payloadString = d.decode(await Deno.readAll(requestServer.body));
        const payload = JSON.parse(payloadString);
        this.validateJsonPayload(payload, requestServer.url);
        return payload;
      } else {
        const payload = d.decode(await Deno.readAll(requestServer.body));
        return payload;
      }
    } catch (error) {
      error.message = "GET_PAYLOAD_ERROR: " + error.message;
      throw error;
    }
  }

  private validateParams(params: Data, url: string) {
    try {
      const [handler] = this.dynamicController.filter((val) => val.url === url);
      if (
        handler && handler.controller.options.validationSchema &&
        handler.controller.options.validationSchema.params
      ) {
        const schema = handler.controller.options.validationSchema
          .params as Schema;
        validateObject(params, schema);
      }
    } catch (error) {
      error.message = "VALIDATE_PARAMS_ERROR: " + error.message;
      throw error;
    }
  }

  private getParams(incoming: string) {
    try {
      const incomingSplit = incoming.substr(1, incoming.length).split("/");
      const params: string[] = [];
      incomingSplit
        .map((path, idx) => {
          return { path, idx };
        })
        .forEach((value) => params.push(incomingSplit[value.idx]));
      this.validateParams(params, incoming);
      return params;
    } catch (error) {
      error.message = "GET_PARAMS_ERROR: " + error.message;
      throw error;
    }
  }

  private validateQuery(query: Data, url: string) {
    try {
      const [handler] = this.dynamicController.filter((val) =>
        url.includes(val.url)
      );
      if (
        handler && handler.controller.options.validationSchema &&
        handler.controller.options.validationSchema.params
      ) {
        const schema = handler.controller.options.validationSchema
          .querystring as Schema;
        validateObject(query, schema);
      }
    } catch (error) {
      error.message = "VALIDATE_QUERY_ERROR: " + error.message;
      throw error;
    }
  }

  private getQuery(key?: string, url?: string) {
    try {
      if (!url) throw new Error("Url empty");
      const [, query] = url.split("?");
      if (!query) throw new Error("Query not found");
      const queryPair = query.split("&");
      const obj: Query = {};
      queryPair.forEach((q) => {
        const [key, value] = q.split("=");
        obj[key] = value;
      });
      this.validateQuery(obj, url);
      if (key) {
        const singleQuery: Query = {};
        singleQuery[key] = obj[key];
        return singleQuery;
      }
      return obj;
    } catch (error) {
      error.message = "GET_QUERY_ERROR: " + error.message;
      throw error;
    }
  }

  private async proxy(url: string, request: Request) {
    try {
      const resp = await fetch(url, {
        method: request.method,
      });
      request.send(new Uint8Array(await resp.arrayBuffer()));
    } catch (error) {
      error.message = "PROXY_ERROR: " + error.message;
      throw error;
    }
  }

  private view(template: string, options?: Data, request?: Request) {
    try {
      let html = this.templateFiles.get(template);
      if (html) {
        for (const key in options) {
          const value = options[key];
          html = replaceAll(html, `{{${key}}}`, value);
        }
      }
      if (request) request.send(html);
    } catch (error) {
      error.message = "VIEW_ERROR" + error.message;
      throw error;
    }
  }

  private transformRequest(serverRequest: ServerRequest, container: any) {
    try {
      const request = serverRequest as unknown as Request;
      request.container = container;
      request.response = {};
      request.response.headers = new Headers();
      request.proxy = (url) => this.proxy(url, request);
      request.view = (template, options) =>
        this.view(template, options, request);
      request.redirect = (url, status = 302) =>
        this.handleRedirect(url, status, serverRequest);
      request.getQuery = (key) => this.getQuery(key, serverRequest.url);
      request.getParams = () => this.getParams(serverRequest.url);
      request.getPayload = () => this.getPayload(serverRequest);
      request.setCookie = (cookie: Cookie) => {
        setCookie(request.response, cookie);
        return request;
      };
      request.clearCookie = (name) => deleteCookie(request.response, name);
      request.getCookies = () => {
        return getCookies({ headers: serverRequest.headers });
      };
      request.getCookie = (name) => this.getCookiesByName(name, request);
      request.json = (payload) => {
        const headers = new Headers();
        headers.set(CONTENT_TYPE, "application/json");
        this.send(payload, request.httpStatus, headers, request);
      };
      request.type = (contentType: string) => {
        request.contentType = contentType;
        return request;
      };
      request.status = (status: number) => {
        request.httpStatus = status;
        return request;
      };
      request.send = (payload, status, headers) => {
        status = request.httpStatus ? request.httpStatus : 200;
        if (request.contentType) {
          headers = new Headers();
          headers.set(CONTENT_TYPE, request.contentType);
        }
        this.send(payload, status, headers, request);
      };
      return request;
    } catch (error) {
      error.message = "TRANSFORM_REQUEST_ERROR: " + error.message;
      console.error(
        `ERROR: ${getErrorTime()}, url: ${serverRequest.url},`,
        error,
      );
    }
  }

  private handleStaticFile(request: Request) {
    try {
      const url = request.url;
      const staticFile = this.staticFiles.get(url);
      if (!staticFile) throw new Error(NOT_FOUND);
      const header = new Headers();
      if (url.includes(".svg")) header.set(CONTENT_TYPE, "image/svg+xml");
      else if (url.includes(".png")) header.set(CONTENT_TYPE, "image/png");
      else if (url.includes(".jpeg")) header.set(CONTENT_TYPE, "image/jpeg");
      else if (url.includes(".css")) header.set(CONTENT_TYPE, "text/css");
      else if (url.includes(".html")) header.set(CONTENT_TYPE, "text/html");
      else if (url.includes(".json")) {
        header.set(CONTENT_TYPE, "application/json");
      } else if (url.includes("favicon.ico")) {
        header.set(CONTENT_TYPE, "image/ico");
      }
      request.send(staticFile, 200, header);
    } catch (error) {
      throw createError("HANDLE_STATIC_FILE_ERROR", error);
    }
  }

  private handleDynamicParams(request: Request) {
    try {
      const [handlerFile] = this.dynamicController.filter((controller) => {
        return request.url.includes(controller.url);
      });
      if (!handlerFile) return this.handlePage(request);
      const options: HandlerOptions = handlerFile.controller.options
        ? handlerFile.controller.options
        : undefined;
      if (
        options &&
        options.methods &&
        !options.methods.includes(request.method as HttpMethod)
      ) {
        throw new Error(NOT_FOUND);
      }
      if (
        options && options.validationSchema && options.validationSchema.headers
      ) {
        const schema = options.validationSchema.headers as Schema;
        this.validateHeaders(request.headers, schema);
      }
      handlerFile.controller.default(request);
    } catch (error) {
      throw createError("HANDLE_DYNAMIC_PARAMS_ERROR", error);
    }
  }

  private handleMiddleware(request: Request) {
    try {
      this.middlewares.forEach((middleware, key) => {
        if (
          middleware.options &&
          middleware.options.methods &&
          !middleware.options.methods.includes(request.method)
        ) {
          throw new Error(NOT_FOUND);
        }

        if (
          middleware.options &&
          middleware.options.validationSchema
        ) {
          const schema = middleware.options.validationSchema.headers as Schema;
          this.validateHeaders(request.headers, schema);
        }

        middleware.default(request, (err: Error) => {
          if (err) {
            if (!err.message) err.message = `Middleware error: ${key}`;
            throw err;
          }
          this.handleRoute(request);
        });
      });
    } catch (error) {
      throw createError("HANDLE_MIDDLEWARE_ERROR", error);
    }
  }

  private validateHeaders(headers: Headers, schema: Schema) {
    try {
      const target: Data = {};
      const { properties } = schema;
      for (const key in properties) target[key] = headers.get(key);
      validateObject(target, schema);
    } catch (error) {
      error.message = "VALIDATE_HEADERS_ERROR: " + error.message;
      throw error;
    }
  }

  private renderComponent(
    page: Page,
    props: any,
    template?: string,
  ) {
    const rendered = renderToString(createElement(page.default, props));
    let reactRoot = root.replace("{{root}}", `${rendered}`);
    reactRoot = reactRoot.replace("{{element}}", `${page.default}`);
    reactRoot = reactRoot.replace("{{props}}", JSON.stringify(props));
    let html = template
      ? template.replace(REACT_ROOT, reactRoot)
      : react.replace(REACT_ROOT, reactRoot);

    if (page.options && page.options.title) {
      html = html.replace("{{title}}", page.options.title);
    } else {
      html = html.replace("{{title}}", "Hello");
    }
    return html;
  }

  private async sendHTML(page: Page, request: Request) {
    try {
      let html;
      let props;

      if (page.props && typeof page.props === "function") {
        props = await page.props(request);
      } else if (page.props) {
        props = page.props;
        props.url = request.url;
        props.params = request.getParams();
        props.cookie = request.getCookies();
      }

      if (page.options && page.options.template) {
        const template = this.templateFiles.get(page.options.template);
        html = this.renderComponent(page, props, template);
      } else html = this.renderComponent(page, props);

      request.type("text/html").send(html);
    } catch (error) {
      throw createError("SEND_HTML_ERROR", error);
    }
  }

  private handlePage(request: Request) {
    const page = this.pages.get(request.url);
    if (!page) return this.handleDynamicPage(request);
    this.sendHTML(page, request);
  }

  private handleDynamicPage(request: Request) {
    const [page] = this.dynamicPage.filter((page) =>
      request.url.includes(page.url)
    );
    if (!page) return this.handleStaticFile(request);
    this.sendHTML(page.page, request);
  }

  private handleRoute(request: Request) {
    try {
      const controller = this.controller.get(request.url);
      const options = controller && controller.options
        ? controller.options
        : undefined;
      if (!controller) return this.handleDynamicParams(request);
      if (
        options &&
        options.methods &&
        !options.methods.includes(request.method as HttpMethod)
      ) {
        throw new Error(NOT_FOUND);
      }
      if (
        options && options.validationSchema && options.validationSchema.headers
      ) {
        const schema = options.validationSchema.headers as Schema;
        this.validateHeaders(request.headers, schema);
      }
      controller.default(request);
    } catch (error) {
      throw createError("HANDLE_ROUTE_ERROR", error);
    }
  }

  private handleRequestError(error: Error, serverRequest: ServerRequest) {
    const err = createError("HANDLE_REQUEST_ERROR", error);
    let status = 500;
    if (error.message.includes(NOT_FOUND)) status = 404;
    if (error.message.includes("VALIDATE")) status = 400;
    const message = JSON.stringify({ error: true, message: error.message });
    const headers = new Headers();
    headers.set(CONTENT_TYPE, "application/json");
    serverRequest.respond({ status, body: message, headers });
    console.error(
      `ERROR: ${getErrorTime()}, url: ${serverRequest.url},`,
      err,
    );
  }

  private handleRequest(serverRequest: ServerRequest, container: any) {
    try {
      const request = this.transformRequest(serverRequest, container);
      if (!request) throw new Error("handle request error");
      if (serverRequest.url === "/") return this.handleRoot(request);
      if (this.middlewares.size > 0) return this.handleMiddleware(request);
      this.handleRoute(request);
    } catch (error) {
      this.handleRequestError(error, serverRequest);
    }
  }

  private async readHtmlTemplate(target: string) {
    try {
      const templateFolder = `${this.cwd}/${target}`;
      const decoder = new TextDecoder("utf-8");
      for await (const dirEntry of Deno.readDir(templateFolder)) {
        if (dirEntry.isFile && dirEntry.name.includes(TEMPLATE_FILE)) {
          const filePath = templateFolder + "/" + dirEntry.name;
          const file = await Deno.readFile(filePath);
          this.templateFiles.set(dirEntry.name, decoder.decode(file));
        } else if (dirEntry.isDirectory) {
          this.readHtmlTemplate(target + "/" + dirEntry.name);
        }
      }
    } catch (error) {
      console.info(yellow(NO_TEMPLATE));
    }
  }

  private isTxtFile(file: string) {
    const extension = [
      ".html",
      ".json",
      ".css",
      ".xml",
      ".txt",
      ".ts",
      ".js",
      ".md",
    ];
    const result = extension.filter((ext) => file.includes(ext));
    return result.length > 0;
  }

  private async readStaticFiles(target: string) {
    try {
      const staticFolder = `${this.cwd}/${target}`;
      const decoder = new TextDecoder("utf-8");
      for await (const dirEntry of Deno.readDir(staticFolder)) {
        if (dirEntry.isFile) {
          const filePath = staticFolder + "/" + dirEntry.name;
          const [, fileKey] = filePath.split(staticFolder);
          const file = await Deno.readFile(filePath);
          if (this.isTxtFile(dirEntry.name)) {
            this.staticFiles.set(fileKey, decoder.decode(file));
          } else this.staticFiles.set(fileKey, file);
        } else if (dirEntry.isDirectory) {
          this.readStaticFiles(target + "/" + dirEntry.name);
        }
      }
    } catch (error) {
      if (Deno.env.get(DENO_ENV) !== TEST_ENV) {
        console.info(yellow(NO_STATIC_FILE));
      }
    }
  }

  private async importMiddleware(target: string) {
    try {
      const middlewareFolder = `${this.cwd}/${target}`;
      for await (const dirEntry of Deno.readDir(middlewareFolder)) {
        if (dirEntry.isFile) {
          const filePath = middlewareFolder + "/" + dirEntry.name;
          const fileImport = Deno.env.get(DENO_ENV) === DEV_ENV
            ? `file:${filePath}#${new Date().getTime()}`
            : `file:${filePath}`;
          import(fileImport).then((middleware) => {
            this.middlewares.set(dirEntry.name, middleware);
          });
        } else if (dirEntry.isDirectory) {
          this.importMiddleware(target + "/" + dirEntry.name);
        }
      }
    } catch (error) {
      if (Deno.env.get(DENO_ENV) !== TEST_ENV) {
        console.info(yellow(NO_MIDDLEWARE));
      }
    }
  }

  private importContainer() {
    try {
      const container = `${this.cwd}/${CONTAINER}`;
      const fileImport = Deno.env.get(DENO_ENV) === DEV_ENV
        ? `file:${container}#${new Date().getTime()}`
        : `file:${container}`;

      import(fileImport).then((c) => {
        this.container = c.default;
      });
    } catch (error) {
      if (Deno.env.get(DENO_ENV) !== TEST_ENV) {
        console.info(yellow(NO_DEPS));
      }
    }
  }

  private async importController(target: string) {
    try {
      const servicesFolder = `${this.cwd}/${target}`;
      for await (const dirEntry of Deno.readDir(servicesFolder)) {
        if (dirEntry.isDirectory) {
          this.importController(target + "/" + dirEntry.name);
        } else if (
          dirEntry.isFile &&
          (dirEntry.name.includes(CONTROLLER_FILE) ||
            dirEntry.name.includes(PAGE_FILE))
        ) {
          const filePath = servicesFolder + "/" + dirEntry.name;
          const [, splittedFilePath] = filePath.split(this.moduleDir);
          const [splittedWithDot] = splittedFilePath.split(".");

          const finalPath = Deno.env.get(DENO_ENV) === DEV_ENV
            ? `file:${filePath}#${new Date().getTime()}`
            : `file:${filePath}`;

          const fileKey = this.prefix
            ? `/${this.prefix}${splittedWithDot}`
            : `${splittedWithDot}`;

          const isPage = dirEntry.name.includes(PAGE_FILE);

          this.nativeImport(finalPath, fileKey, isPage);
        }
      }
    } catch (error) {
      if (Deno.env.get(DENO_ENV) !== TEST_ENV) {
        console.info(yellow(NO_SERVICE));
      }
    }
  }

  private nativeImport(filePath: string, fileKey: string, isPage: boolean) {
    import(filePath)
      .then((importedFile) => {
        const options = importedFile.options as HandlerOptions;

        fileKey = options && options.prefix
          ? `/${options.prefix}${fileKey}`
          : fileKey;

        if (options && options.params) {
          if (isPage) {
            this.dynamicPage.push({ url: fileKey, page: importedFile });
          } else {
            this.dynamicController.push({
              url: fileKey,
              controller: importedFile,
            });
          }
          return;
        }

        if (isPage) this.pages.set(fileKey, importedFile);
        else this.controller.set(fileKey, importedFile);
      });
  }

  private getAppStatus() {
    const decoded = this.regid
      ? decodeBase64("cmVnaXN0ZXJlZA==")
      : decodeBase64("VU5SRUdJU1RFUkVE");
    const text = new TextDecoder().decode(decoded);
    const version = `Fastro/${FASTRO_VERSION} (${text})`;
    return version;
  }

  private async readConfig() {
    try {
      const configFile = await Deno.readTextFile("config.yml");
      const parsedConfig = parseYml(configFile);
      if (configFile && parsedConfig) {
        const { email, regid } = <{
          email: string;
          regid: string;
        }> parsedConfig;
        this.regid = regid;
        this.email = email;
      }
    } catch (error) {
      if (Deno.env.get(DENO_ENV) !== TEST_ENV) {
        console.info(yellow(NO_CONFIG));
      }
    }
  }

  private regid!: string;
  private email!: string;
  initApp() {
    this.readConfig()
      .then(() => this.appStatus = this.getAppStatus())
      .then(() => this.importMiddleware(MIDDLEWARE_DIR))
      .then(() => this.readHtmlTemplate(TEMPLATE_DIR))
      .then(() => this.importController(this.moduleDir))
      .then(() => this.readStaticFiles(this.staticDir))
      .then(() => this.importContainer())
      .then(() => this.listen());
  }

  /**
   * Close server
   *
   *      server.close()
   */
  public close() {
    if (this.server) this.server.close();
  }

  private async listen() {
    try {
      if (Deno.env.get(DENO_ENV) !== TEST_ENV) {
        const addr = `http://${this.hostname}:${this.port}`;
        const runningText = `${RUNNING_TEXT}: ${addr}`;
        if (!this.regid) {
          console.info(red(this.getAppStatus()));
          console.info(green(runningText));
        } else {
          console.info(green(this.getAppStatus()));
          console.info(green(runningText));
        }
      }
      this.server = serve({ hostname: this.hostname, port: this.port });
      for await (const request of this.server) {
        this.handleRequest(request, this.container);
      }
    } catch (error) {
      error.message = "LISTEN_ERROR: " + error.message;
      console.error(red(`ERROR: ${getErrorTime()}`), error);
      Deno.exit(1);
    }
  }
}

export class Request extends ServerRequest {
  response!: Response;
  contentType!: string;
  httpStatus!: number;
  /**
   * Set content type before send
   *
   *      request.type("text/html").send("hello");
   */
  type!: {
    (contentType: string): Request;
  };

  /**
   * Set HTTP Status
   *
   *      request.status(404).send("not found");
   */
  status!: {
    (httpStatus: number): Request;
  };
  /**
   * Get all cookies
   *
   *    const cookies = request.getCookies();
   */
  getCookies!: {
    (): Cookies;
  };
  /**
   * Get cookie by name
   *
   *    const cookie = request.getCookie("my-cookie");
   */
  getCookie!: {
    (name: string): string;
  };
  /**
   * Set cookie
   *
   *    import { Cookie } from "../mod.ts";
   *    const cookie: Cookie = { name: "hello", value: "pram" };
   *    request.setCookie(cookie);
   */
  setCookie!: {
    (cookie: Cookie): Request;
  };
  /**
   * Clear cookie by name
   *
   *      request.clearCookie("hello")
   */
  clearCookie!: {
    (name: string): void;
  };
  /**
   * Redirect to the specified url, the status code is optional (default to 302)
   *
   *      request.redirect("/", 302)
   */
  redirect!: {
    (url: string, status?: number): void;
  };
  /**
   *  Sends the payload to the user, could be a plain text, a buffer, JSON, stream, or an Error object.
   *
   *        request.send("hello");
   */
  send!: {
    <T>(payload: string | T, status?: number, headers?: Headers): void;
  };
  /**
   *  Sends json object.
   *
   *        request.send({ message: "hello" });
   */
  json!: {
    (payload: any): void;
  };
  /**
   * Get url parameters
   *
   *
   *      const params = request.getParams();
   */
  getParams!: {
    (): string[];
  };
  /**
   * Get payload. Could be plain text, json, multipart, or url-encoded
   *
   *
   *      const payload = await request.getPayload();
   */
  getPayload!: {
    (): Promise<any>;
  };

  /**
   * Get query
   *
   *      const query = await request.getQuery()
   */
  getQuery!: {
    (name?: string): Query;
  };

  /**
   * URL proxy
   *
   *      request.proxy("https://github.com/fastrodev/fastro");
   */
  proxy!: {
    (url: string): void;
  };

  /**
   * Render html template
   *
   *      request.view("index.template.html", { title: "Hello" });
   */
  view!: {
    (template: string, options?: any): void;
  };
  /**
   * You can access container that defined on server creation
   *
   *        request.container;
   */
  container!: any;
  [key: string]: any
}
