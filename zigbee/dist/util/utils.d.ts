declare function capitalize(s: string): string;
declare function getZigbee2MQTTVersion(includeCommitHash?: boolean): Promise<{
    commitHash: string;
    version: string;
}>;
declare function getDependencyVersion(depend: string): Promise<{
    version: string;
}>;
declare function formatDate(time: number, type: 'ISO_8601' | 'ISO_8601_local' | 'epoch' | 'relative'): string | number;
declare function objectHasProperties(object: {
    [s: string]: unknown;
}, properties: string[]): boolean;
declare function equalsPartial(object: KeyValue, expected: KeyValue): boolean;
declare function getObjectProperty(object: KeyValue, key: string, defaultValue: unknown): unknown;
declare function getResponse(request: KeyValue | string, data: KeyValue, error: string): MQTTResponse;
declare function parseJSON(value: string, fallback: string): KeyValue | string;
declare function loadModuleFromText(moduleCode: string): unknown;
declare function loadModuleFromFile(modulePath: string): unknown;
declare function getExternalConvertersDefinitions(settings: Settings): Generator<zhc.ExternalDefinition>;
declare function removeNullPropertiesFromObject(obj: KeyValue): void;
declare function toNetworkAddressHex(value: number): string;
declare function toSnakeCase(value: string | KeyValue): any;
declare function validateFriendlyName(name: string, throwFirstError?: boolean): string[];
declare function sleep(seconds: number): Promise<void>;
declare function sanitizeImageParameter(parameter: string): string;
declare function isAvailabilityEnabledForDevice(device: Device, settings: Settings): boolean;
declare function parseEntityID(ID: string): {
    ID: string;
    endpoint: string;
};
declare function isEndpoint(obj: unknown): obj is zh.Endpoint;
declare function isZHGroup(obj: unknown): obj is zh.Group;
declare const _default: {
    endpointNames: string[];
    capitalize: typeof capitalize;
    getZigbee2MQTTVersion: typeof getZigbee2MQTTVersion;
    getDependencyVersion: typeof getDependencyVersion;
    formatDate: typeof formatDate;
    objectHasProperties: typeof objectHasProperties;
    equalsPartial: typeof equalsPartial;
    getObjectProperty: typeof getObjectProperty;
    getResponse: typeof getResponse;
    parseJSON: typeof parseJSON;
    loadModuleFromText: typeof loadModuleFromText;
    loadModuleFromFile: typeof loadModuleFromFile;
    getExternalConvertersDefinitions: typeof getExternalConvertersDefinitions;
    removeNullPropertiesFromObject: typeof removeNullPropertiesFromObject;
    toNetworkAddressHex: typeof toNetworkAddressHex;
    toSnakeCase: typeof toSnakeCase;
    parseEntityID: typeof parseEntityID;
    isEndpoint: typeof isEndpoint;
    isZHGroup: typeof isZHGroup;
    hours: (hours: number) => number;
    minutes: (minutes: number) => number;
    seconds: (seconds: number) => number;
    validateFriendlyName: typeof validateFriendlyName;
    sleep: typeof sleep;
    sanitizeImageParameter: typeof sanitizeImageParameter;
    isAvailabilityEnabledForDevice: typeof isAvailabilityEnabledForDevice;
};
export default _default;
//# sourceMappingURL=utils.d.ts.map