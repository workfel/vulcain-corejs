import { ExecutionResult } from './executionResult';
import { DefaultServiceNames } from '../../di/annotations';
import { IContainer, IInjectionNotification } from '../../di/resolvers';
import { Inject } from '../../di/annotations';
import { RequestContext } from '../../servers/requestContext';
import { IMetrics, MetricsConstant } from '../../metrics/metrics';
import { VulcainLogger } from '../../configurations/log/vulcainLogger';

/**
 * command
 *
 * @export
 * @interface ICommand
 */
export interface ICommand {
    /**
     * execute the command
     * @param args
     */
    runAsync<T>(...args): Promise<T>;
}

/**
 *
 *
 * @export
 * @abstract
 * @class AbstractCommand
 * @template T
 */
export abstract class AbstractCommand<T> implements IInjectionNotification {

    protected metrics: IMetrics;
    protected customTags: any;
    private static METRICS_NAME = "custom_command";

    /**
     *
     *
     * @type {RequestContext}
     */
    public requestContext: RequestContext;

    /**
     * Components container
     *
     * @readonly
     *
     * @memberOf AbstractCommand
     */
    @Inject(DefaultServiceNames.Container)
    container: IContainer;

    /**
     * Creates an instance of AbstractCommand.
     *
     * @param {IContainer} container
     * @param {any} providerFactory
     */
    constructor() {
    }

    onInjectionCompleted() {
        this.metrics = this.container.get<IMetrics>(DefaultServiceNames.Metrics);
    }

    protected setMetricsTags(args: { [key: string] : string }) {
        this.customTags = args;

        let logger = this.container.get<VulcainLogger>(DefaultServiceNames.Logger);
        logger.logAction(this.requestContext, "BC", "Custom", `Command: ${Object.getPrototypeOf(this).constructor.name}`);
    }

    onCommandCompleted(duration: number, success: boolean) {
        if (!this.customTags) {
            throw new Error("setMetricTags must be called at the beginning of runAsync.");
        }
        this.metrics.timing(AbstractCommand.METRICS_NAME + MetricsConstant.duration, duration, this.customTags);
        if (!success)
            this.metrics.increment(AbstractCommand.METRICS_NAME + MetricsConstant.failure, this.customTags);
        let logger = this.container.get<VulcainLogger>(DefaultServiceNames.Logger);
        logger.logAction(this.requestContext, "EC", "Custom", `Command: ${Object.getPrototypeOf(this).constructor.name} completed with ${success ? 'success' : 'error'}`);
    }

    /**
     * execute command
     * @protected
     * @abstract
     * @param {any} args
     * @returns {Promise<T>}
     */
    abstract runAsync(...args): Promise<T>;

    // Must be defined in command
    // protected fallbackAsync(err, ...args)
}
