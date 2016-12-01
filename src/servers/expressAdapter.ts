import { Application } from '../application';
import * as express from 'express';
import { AbstractAdapter } from './abstractAdapter';
import { RequestContext, Pipeline } from './requestContext';
import { IContainer } from '../di/resolvers';
import { DefaultServiceNames } from '../di/annotations';
import { Conventions } from '../utils/conventions';
import { QueryData } from '../pipeline/query';
import { HttpResponse } from './../pipeline/common';
import { System } from './../configurations/globals/system';
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const guid = require('node-uuid');
const cors = require("cors");

export class ExpressAdapter extends AbstractAdapter {
    public express: express.Express;
    private auth;

    constructor(domainName: string, container: IContainer, private app: Application) {
        super(domainName, container);

        const self = this;
        this.express = express();

        this.express.use(function(req, res, next) {
            self.initializeRequestContext(req);
            return next();
        });
        this.express.use(cookieParser());
       // if (System.isTestEnvironnment)
        this.express.use(cors());
        this.express.use(bodyParser.urlencoded({ extended: true }));
        this.express.use(bodyParser.json());
        this.auth = (this.container.get<any>(DefaultServiceNames.Authentication, true)).init();
    }

    initialize() {

        this.express.get('/health', (req: express.Request, res: express.Response) => {
            res.status(200).end();
        });

        this.express.get(Conventions.instance.defaultUrlprefix + '/_schemas/:name?', (req: express.Request, res: express.Response) => {
            let domain: any = this.container.get(DefaultServiceNames.Domain);
            let name = req.params.name;
            if (name) {
                let schema = domain.getSchema(name, true);
                res.send(schema);
            }
            else {
                res.send(domain.schemas);
            }
        });

        this.express.get(Conventions.instance.defaultUrlprefix + '/:schemaAction?/:id?', this.auth, async (req: express.Request, res: express.Response) => {

            try {
                let query: QueryData = <any>{ domain: this.domainName };
                this.getActionSchema(query, req, "all");
                if (query.action === "get") {
                    if (!req.params.id) {
                        res.status(400).send({ error: "Id is required", status: "Error" });
                        return;
                    }

                    let requestArgs = this.populateFromQuery(req);
                    if (requestArgs.count === 0) {
                        query.params = req.params.id;
                    }
                    else {
                        query.params = requestArgs.params;
                        query.params.id = req.params.id;
                    }
                }
                else {
                    query.maxByPage = (req.query.$maxByPage && parseInt(req.query.$maxByPage)) || 100;
                    query.page = (req.query.$page && parseInt(req.query.$page)) || 0;
                    query.params = this.populateFromQuery(req).params;
                }
                this.executeRequest(this.executeQueryRequest, query, req, res);
            }
            catch (e) {
                res.status(400).send({ error: e.message || e, status: "Error" });
            }
        });

        // All actions by post
        this.express.post(Conventions.instance.defaultUrlprefix + '/:schemaAction?', this.auth, async (req: express.Request, res: express.Response) => {
            const cmd = this.normalizeCommand(req);
            this.executeRequest(this.executeCommandRequest, cmd, req, res);
        });
    }

    addActionCustomRoute(verb: string, path: string, callback: (req) => { action: string, schema: string, params: any }) {
        this.express[verb](path, this.auth, async (req: express.Request, res: express.Response) => {
            let command: any = callback(req);
            if (!command || !command.action) {
                throw new Error("Invalid custom command configuration");
            }
            command.domain = this.domainName;
            this.executeRequest(this.executeCommandRequest, command, req, res);
        });
    }

    private populateFromQuery(req) {
        let params = {};
        let count = 0;;
        Object.keys(req.query).forEach(name => {
            switch (name) {
                case "$action":
                case "$schema":
                case "$page":
                case "$maxByPage":
                    break;
                case "$query":
                    params = JSON.parse(req.query[name]);
                    break;
                default:
                    count++;
                    params[name] = req.query[name];
            }
        });
        return { params, count };
    }

    private getActionSchema(query, req: express.Request, defaultAction?) {
        let a: string;
        let s: string;

        if (req.params.schemaAction) {
            if (req.params.schemaAction.indexOf('.') >= 0) {
                let parts = req.params.schemaAction.split('.');
                s = parts[0];
                a = parts[1];
            }
            else {
                a = req.params.schemaAction;
            }
        }
        else {
            a = req.query.$action;
            s = req.query.$schema;
        }
        query.action = query.action || a || defaultAction;
        query.schema = query.schema || s;
    }

    private normalizeCommand(req: express.Request) {
        let command = req.body;

        // Body contains only data -> create a new command object
        if (!command.action && !command.params && !command.schema) {
            command = { params: command };
        }
        command.domain = this.domainName;
        this.getActionSchema(command, req);
        command.params = command.params || {};
        return command;
    }

    private initializeTenant(ctx: RequestContext, req: express.Request) {
        // 1 - tenant in url (test only)
        ctx.tenant = (System.isTestEnvironnment && req.query.$tenant);
        if (ctx.tenant) {
            return;
        }

        // 2 - Header
        ctx.tenant = req.header("X-VULCAIN-TENANT");
        if (ctx.tenant) {
            if (ctx.tenant === "?") {
                // from load-balancer so resolve from hostname
                // Get the first sub-domain
                let pos = ctx.hostName.indexOf('.');
                ctx.tenant = pos > 0 ? ctx.hostName.substr(0, pos) : ctx.hostName;
                // Remove port
                pos = ctx.tenant.indexOf(':');
                if (pos > 0) {
                    ctx.tenant = ctx.tenant.substr(0, pos);
                }
                return;
            }
            if (ctx.tenant.substr(0, 8) !== "pattern:") {
                return;
            }
            let patterns = ctx.tenant.substr(9).split(',');
            for (let pattern of patterns) {
                try {
                const regex = new RegExp(pattern.trim());
                const groups = regex.exec(ctx.hostName);
                if (groups && groups.length > 0) {
                    ctx.tenant = groups[1];
                    return;
                }
                }
                catch (e) {
                    ctx.logError(e, "TENANT pattern cannot be resolved " + pattern);
                }
            }
        }

        // 3 - Environnement variable
        ctx.tenant = System.defaultTenant;
        if (ctx.tenant) {
            return;
        }

        // 4 - test mode
        if (System.isTestEnvironnment) {
            ctx.tenant = RequestContext.TestTenant;
        }
        else {
            // 5 - default
            ctx.tenant = "default";
        }
    }

    private initializeRequestContext(req: express.Request) {
        let ctx: RequestContext = new RequestContext(this.container, Pipeline.HttpRequest);

        ctx.correlationId = req.header("X-VULCAIN-CORRELATION-ID") || guid.v4();
        ctx.correlationPath = req.header("X-VULCAIN-CORRELATION-PATH") || "-";
        ctx.headers = req.headers;
        ctx.hostName = req.get('Host');
        this.initializeTenant(ctx, req);

        // Set requestcontext for authentication middlewares
        (<any>req).requestContext = ctx;
    }

    private async executeRequest(handler: Function, command, req: express.Request, res: express.Response) {
        const begin = super.startRequest(command);
        let ctx: RequestContext = (<any>req).requestContext;
        (<any>req).requestContext = null; // release for gc

        try {
            // Initialize user context
            if (req.user) {
                ctx.user = req.user;
                if (ctx.user.tenant) {
                    ctx.tenant = ctx.user.tenant;
                }
                else {
                    ctx.user.tenant = ctx.tenant;
                }
                ctx.bearer = ctx.bearer || ctx.user.bearer;
                ctx.user.bearer = null;
            }
            // Process handler
            let result = await handler.apply(this, [command, ctx]);
            // Response
            if (result instanceof HttpResponse) {
                let customResponse: HttpResponse = result;
                if (customResponse.headers) {
                    for (const [k, v] of customResponse.headers) {
                        res.setHeader(k, v);
                    }
                }
                res.statusCode = customResponse.statusCode || 200;
                if (customResponse.contentType) {
                    res.contentType(customResponse.contentType);
                }
                if (customResponse.content) {
                    if (customResponse.encoding) {
                        res.end(customResponse.content, customResponse.encoding);
                    }
                    else {
                        res.send(customResponse.content);
                    }
                }
                else {
                    res.end();
                }
            }
            else {
                res.statusCode = result.code || 200;
                res.send(result.value);
            }

            this.endRequest(begin, result, ctx);
        }
        catch (e) {
            let result = command;
            result.error = { message: e.message || e };
            res.statusCode = e.statusCode || 500;
            res.send({ error: { message: e.message || e, errors: e.errors } });
            this.endRequest(begin, result, ctx, e);
        }
        finally {
            ctx && ctx.dispose();
        }
    }

    /**
     * Set static root for public web site
     *
     * @param {string} basePath
     *
     * @memberOf ExpressAdapter
     */
    setStaticRoot(basePath: string) {
        System.log.info(null, "Set wwwroot to " + basePath);
        if (!basePath) {
            throw new Error("BasePath is required.");
        }
        // TODO
        //this.express.use(express.static(basePath));
        this.express.use('/assets', express.static(basePath + '/assets'));
        this.express.all('/*', function(req, res, next) {
            // Just send the index.html for other files to support HTML5Mode
            res.sendFile('index.html', { root: basePath });
        });
    }

    start(port: number) {
        let listener = this.express.listen(port, (err) => {
            System.log.info(null, 'Listening on port ' + port);
        });

        this.app.onServerStarted(listener, this);
    }

    useMiddleware(verb: string, path: string, handler: Function) {
        this.express[verb](path, handler);
    }
}
