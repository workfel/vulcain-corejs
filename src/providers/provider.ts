
import {Schema} from "../schemas/schema";
import { RequestContext } from '../servers/requestContext';

export interface ListOptions {
    /**
     * Max
     *
     * @type {number}
     * @memberOf ListOptions
     */
    maxByPage?: number;  // 0 for all
    /**
     * Page to returns
     *
     * @type {number}
     * @memberOf ListOptions
     */
    page?: number;       //
    /**
     * [Output property] Number of items founded
     *
     * @type {number}
     * @memberOf ListOptions
     */
    length?:number;
    query?:any;
}


/**
 * Persistance provider for a schema
 */
export interface IProvider<T>
{
    /**
     * address of the database
     *
     * @type {string}
     * @memberOf IProvider
     */
    address: string;
    /**
     * Initialize the provider with a tenant and a schema.
     * Called only once by tenant
     *
     * @param {string} tenant - The tenant to use
     * @returns {Promise<() => Promise<any>>} Dispose function
     *
     * @memberOf IProvider
     */
    initializeTenantAsync(context: RequestContext, tenant: string): Promise<() => Promise<any>>;
    /**
     * Find an entity
     *
     * @param {Schema} schema
     * @param {any} query provider specific query
     * @returns {Promise<T>}
     *
     * @memberOf IProvider
     */
    findOneAsync(schema: Schema, query): Promise<T>;
    /**
     * Get an entity list
     *
     * @param {Schema} schema
     * @param {ListOptions} options
     * @returns {Promise<Array<T>>}
     *
     * @memberOf IProvider
     */
    getAllAsync(schema: Schema, options: ListOptions): Promise<Array<T>>;
    /**
     * Get an entity by id
     *
     * @param {Schema} schema
     * @param {string} id
     * @returns {Promise<T>}
     *
     * @memberOf IProvider
     */
    getAsync(schema: Schema, id: string): Promise<T>;
    /**
     * Create an entity
     *
     * @param {Schema} schema
     * @param {T} entity
     * @returns {Promise<T>}
     *
     * @memberOf IProvider
     */
    createAsync(schema: Schema, entity: T): Promise<T>;
    /**
     * Update an entity
     *
     * @param {Schema} schema
     * @param {T} entity
     * @param {T} [old]
     * @returns {Promise<T>}
     *
     * @memberOf IProvider
     */
    updateAsync(schema: Schema, entity: T, old?: T): Promise<T>;
    /**
     * Delete an entity
     *
     * @param {Schema} schema
     * @param {(string|T)} old
     * @returns {Promise<boolean>}
     *
     * @memberOf IProvider
     */
    deleteAsync(schema: Schema, old:string|T ) : Promise<boolean>;
}

