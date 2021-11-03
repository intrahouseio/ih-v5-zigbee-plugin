export default class MQTT {
    private publishedTopics;
    private connectionTimer;
    private client;
    private eventBus;
    constructor(eventBus: EventBus);
    connect(): Promise<void>;
    private onConnect;
    disconnect(): Promise<void>;
    subscribe(topic: string): void;
    onMessage(topic: string, message: string): void;
    isConnected(): boolean;
    publish(topic: string, payload: string, options?: MQTTOptions, base?: string, skipLog?: boolean, skipReceive?: boolean): Promise<void>;
}
//# sourceMappingURL=mqtt.d.ts.map