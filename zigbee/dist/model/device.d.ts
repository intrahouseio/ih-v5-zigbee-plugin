export default class Device {
    zh: zh.Device;
    private _definition;
    get ieeeAddr(): string;
    get ID(): string;
    get settings(): DeviceSettings;
    get name(): string;
    get definition(): zhc.Definition;
    constructor(device: zh.Device);
    ensureInSettings(): void;
    endpoint(key?: string | number): zh.Endpoint;
    endpointName(endpoint: zh.Endpoint): string;
    isXiaomi(): boolean;
    isIkeaTradfri(): boolean;
    isDevice(): this is Device;
    isGroup(): this is Group;
}
//# sourceMappingURL=device.d.ts.map