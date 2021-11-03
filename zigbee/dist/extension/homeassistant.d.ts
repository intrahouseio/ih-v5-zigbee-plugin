import Extension from './extension';
interface DiscoveryEntry {
    mockProperties: string[];
    type: string;
    object_id: string;
    discovery_payload: KeyValue;
}
/**
 * This extensions handles integration with HomeAssistant
 */
export default class HomeAssistant extends Extension {
    private discovered;
    private mapping;
    private discoveredTriggers;
    private legacyApi;
    private discoveryTopic;
    private statusTopic;
    private entityAttributes;
    private zigbee2MQTTVersion;
    constructor(zigbee: Zigbee, mqtt: MQTT, state: State, publishEntityState: PublishEntityState, eventBus: EventBus, enableDisableExtension: (enable: boolean, name: string) => Promise<void>, restartCallback: () => void, addExtension: (extension: Extension) => void);
    start(): Promise<void>;
    private exposeToConfig;
    private populateMapping;
    onDeviceRemoved(data: eventdata.DeviceRemoved): void;
    onGroupMembersChanged(data: eventdata.GroupMembersChanged): void;
    onPublishEntityState(data: eventdata.PublishEntityState): Promise<void>;
    onDeviceRenamed(data: eventdata.DeviceRenamed): void;
    private getConfigs;
    private getDiscoverKey;
    private discover;
    private onMQTTMessage;
    onZigbeeEvent(data: {
        device: Device;
    }): void;
    private getDevicePayload;
    adjustMessageBeforePublish(entity: Device | Group, message: KeyValue): void;
    private getEncodedBaseTopic;
    private getDiscoveryTopic;
    private publishDeviceTriggerDiscover;
    _getMapping(): {
        [s: string]: DiscoveryEntry[];
    };
    _clearDiscoveredTrigger(): void;
}
export {};
//# sourceMappingURL=homeassistant.d.ts.map