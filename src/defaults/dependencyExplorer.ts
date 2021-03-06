import { LifeTime } from '../di/annotations';
import { Query } from '../pipeline/annotations';
import { QueryHandler } from '../pipeline/annotations.handlers';
import { System } from './../configurations/globals/system';
import { VulcainManifest } from './../configurations/dependencies/annotations';
import { RequestContext } from '../servers/requestContext';
import { ForbiddenRequestError } from '../errors/applicationRequestError';

@QueryHandler({ scope: "?", serviceLifeTime: LifeTime.Singleton })
export class DependencyExplorer {

    constructor() {
    }

    @Query({ outputSchema: "VulcainManifest", description: "Get service dependencies", action: "_serviceDependencies" })
    getDependencies() {
        let ctx: RequestContext = (<any>this).requestContext;
        if (ctx.publicPath)
            throw new ForbiddenRequestError();

        return System.manifest;
    }
}