import {ActionData, CommandResponse, CommandManager, EventData} from './actions';
import {ErrorResponse} from './common';
const guid = require('node-uuid');
import {ICommandBusAdapter, IEventBusAdapter} from '../bus/busAdapter';
import {LocalAdapter} from '../bus/localAdapter';
import {DefaultServiceNames} from '../application';
import * as RX from 'rx';

export class MessageBus {
    private commandBus: ICommandBusAdapter;
    private eventBus: IEventBusAdapter;
    private _events: Map<string,RX.Subject<EventData>> = new Map<string, RX.Subject<EventData>>();

    public getEventsQueue(domain:string): RX.Observable<EventData> {
        let events = this._events.get(domain);
        if (!events) {
            events = new RX.Subject<EventData>();
            this._events.set(domain, events);
            this.eventBus.listenForEvent(domain, this.consumeEventAsync.bind(this));
        }
        return events;
    }

    constructor(private manager: CommandManager) {
        this.commandBus = manager.container.get<ICommandBusAdapter>(DefaultServiceNames.ActionBusAdapter) || new LocalAdapter();
        this.commandBus.listenForTask(manager.domain.name, manager.serviceName, manager.consumeTaskAsync.bind(manager));

        this.eventBus = manager.container.get<IEventBusAdapter>(DefaultServiceNames.EventBusAdapter) || new LocalAdapter();
    }

    private consumeEventAsync(event: EventData) {
        console.log("Receive event : %j", event);
        (<RX.Subject<EventData>>this.getEventsQueue(event.domain)).onNext(event);
    }

    pushTask(command: ActionData) {
        command.status = "Pending";
        command.taskId = guid.v4();
        this.commandBus.publishTask(command.domain, this.manager.serviceName, command);
    }

    sendEvent(response: CommandResponse) {
        this.eventBus.sendEvent(response.domain, response);
    }
}