# Fastro
![][build] ![][stats]

Built on top of [Deno standard library](https://deno.land/std@0.74.0). Written in [TypeScript](https://www.typescriptlang.org/).

The speed is already close to the raw Deno HTTP library. [Check this perfomance test](https://fastro.dev/docs/perfomance).

No need to add or register route declarations, controllers, middlewares, templates, or static files manually.

It will be loaded and saved when the server starts.

## Getting started

Launch a terminal. Make a folder and create a project
```
fastro init
```
Run the server on localhost
```
fastro serve
```
Deploy to google cloud run
```
fastro deploy
```

The app that has been deployed can be seen [here](https://hello-6bxxicr2uq-uc.a.run.app). Go to [**quickstart**](https://fastro.dev/docs/quickstart) for detail information.

## Features
- Body handling `application/json`
- Body handling `application/x-www-form-urlencoded`
- Body handling `multipart/form-data`
- Command line interface
- Data validation
- Dynamic URL parameters
- Serverless deployment
- Supports `cookie`
- Supports middleware
- Supports proxy
- Support querystring
- Support static files
- URL prefix
- URL redirection
- URL routing by file name
- Template rendering

You can see the details in [the examples](https://github.com/fastrodev/fastro/blob/master/services) and [test folder](https://github.com/fastrodev/fastro/blob/master/test).

## What's next:
- [Quickstart](https://fastro.dev/docs/quickstart)
- [Create a handler](https://fastro.dev/docs/handler)
- [Create a middleware](https://fastro.dev/docs/middleware)
- [Create static files](https://fastro.dev/docs/static)
- [Template rendering](https://fastro.dev/docs/rendering)
- [Data validation](https://fastro.dev/docs/validation)
- [Publishing and Deployment](https://fastro.dev/docs/deployment)
- [Fastro API](https://fastro.dev/docs/api)

[build]: https://github.com/fastrodev/fastro/workflows/ci/badge.svg?branch=master "fastro build"
[stats]: https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.fastro.dev%2Fstats "fastro stats"
