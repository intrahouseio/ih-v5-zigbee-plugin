"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
const logger_1 = __importDefault(require("../../util/logger"));
const settings = __importStar(require("../../util/settings"));
const extension_1 = __importDefault(require("../extension"));
const defaultConfiguration = {
    minimumReportInterval: 3, maximumReportInterval: 300, reportableChange: 1,
};
const ZNLDP12LM = zigbee_herdsman_converters_1.default.definitions.find((d) => d.model === 'ZNLDP12LM');
const devicesNotSupportingReporting = [
    zigbee_herdsman_converters_1.default.definitions.find((d) => d.model === 'CC2530.ROUTER'),
    zigbee_herdsman_converters_1.default.definitions.find((d) => d.model === 'BASICZBR3'),
    zigbee_herdsman_converters_1.default.definitions.find((d) => d.model === 'ZM-CSW032-D'),
    zigbee_herdsman_converters_1.default.definitions.find((d) => d.model === 'TS0001'),
    zigbee_herdsman_converters_1.default.definitions.find((d) => d.model === 'TS0115'),
];
const reportKey = 1;
const getColorCapabilities = async (endpoint) => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') === undefined) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }
    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities');
    return {
        colorTemperature: (value & 1 << 4) > 0,
        colorXY: (value & 1 << 3) > 0,
    };
};
const clusters = {
    'genOnOff': [
        { attribute: 'onOff', ...defaultConfiguration, minimumReportInterval: 0, reportableChange: 0 },
    ],
    'genLevelCtrl': [
        { attribute: 'currentLevel', ...defaultConfiguration },
    ],
    'lightingColorCtrl': [
        {
            attribute: 'colorTemperature', ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX', ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY', ...defaultConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    'closuresWindowCovering': [
        { attribute: 'currentPositionLiftPercentage', ...defaultConfiguration },
        { attribute: 'currentPositionTiltPercentage', ...defaultConfiguration },
    ],
};
class Report extends extension_1.default {
    constructor() {
        super(...arguments);
        this.queue = new Set();
        this.failed = new Set();
        this.enabled = settings.get().advanced.report;
    }
    shouldIgnoreClusterForDevice(cluster, definition) {
        if (definition === ZNLDP12LM && cluster === 'closuresWindowCovering') {
            // Device announces it but doesn't support it
            // https://github.com/Koenkk/zigbee2mqtt/issues/2611
            return true;
        }
        return false;
    }
    async setupReporting(device) {
        if (this.queue.has(device.ieeeAddr) || this.failed.has(device.ieeeAddr))
            return;
        this.queue.add(device.ieeeAddr);
        const term1 = this.enabled ? 'Setup' : 'Disable';
        const term2 = this.enabled ? 'setup' : 'disabled';
        try {
            for (const ep of device.zh.endpoints) {
                for (const [cluster, configuration] of Object.entries(clusters)) {
                    if (ep.supportsInputCluster(cluster) &&
                        !this.shouldIgnoreClusterForDevice(cluster, device.definition)) {
                        logger_1.default.debug(`${term1} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);
                        const items = [];
                        for (const entry of configuration) {
                            if (!entry.hasOwnProperty('condition') || (await entry.condition(ep))) {
                                const toAdd = { ...entry };
                                if (!this.enabled)
                                    toAdd.maximumReportInterval = 0xFFFF;
                                items.push(toAdd);
                                delete items[items.length - 1].condition;
                            }
                        }
                        this.enabled ?
                            await ep.bind(cluster, this.zigbee.firstCoordinatorEndpoint()) :
                            await ep.unbind(cluster, this.zigbee.firstCoordinatorEndpoint());
                        await ep.configureReporting(cluster, items);
                        logger_1.default.info(`Successfully ${term2} reporting for '${device.ieeeAddr}' - ${ep.ID} - ${cluster}`);
                    }
                }
            }
            if (this.enabled) {
                device.zh.meta.reporting = reportKey;
            }
            else {
                delete device.zh.meta.reporting;
                this.eventBus.emitReconfigure({ device });
            }
            this.eventBus.emitDevicesChanged();
        }
        catch (error) {
            logger_1.default.error(`Failed to ${term1.toLowerCase()} reporting for '${device.ieeeAddr}' - ${error.stack}`);
            this.failed.add(device.ieeeAddr);
        }
        device.zh.save();
        this.queue.delete(device.ieeeAddr);
    }
    shouldSetupReporting(device, messageType) {
        if (!device || !device.zh || !device.definition)
            return false;
        // Handle messages of type endDeviceAnnce and devIncoming.
        // This message is typically send when a device comes online after being powered off
        // Ikea TRADFRI tend to forget their reporting after powered off.
        // Re-setup reporting.
        // Only resetup reporting if configuredReportings was not populated yet,
        // else reconfigure is done in zigbee-herdsman-converters ikea.js/bulbOnEvent
        // configuredReportings are saved since Zigbee2MQTT 1.17.0
        // https://github.com/Koenkk/zigbee2mqtt/issues/966
        if (this.enabled && messageType === 'deviceAnnounce' && device.isIkeaTradfri() &&
            device.zh.endpoints.filter((e) => e.configuredReportings.length === 0).length ===
                device.zh.endpoints.length) {
            return true;
        }
        // These do not support reproting.
        // https://github.com/Koenkk/zigbee-herdsman/issues/110
        const philipsIgnoreSw = ['5.127.1.26581', '5.130.1.30000'];
        if (device.zh.manufacturerName === 'Philips' &&
            philipsIgnoreSw.includes(device.zh.softwareBuildID))
            return false;
        if (device.zh.interviewing === true)
            return false;
        if (device.zh.type !== 'Router' || device.zh.powerSource === 'Battery')
            return false;
        // Gledopto devices don't support reporting.
        if (devicesNotSupportingReporting.includes(device.definition) ||
            device.definition.vendor === 'Gledopto')
            return false;
        if (this.enabled && device.zh.meta.hasOwnProperty('reporting') &&
            device.zh.meta.reporting === reportKey) {
            return false;
        }
        if (!this.enabled && !device.zh.meta.hasOwnProperty('reporting')) {
            return false;
        }
        return true;
    }
    async start() {
        for (const device of this.zigbee.devices(false)) {
            if (this.shouldSetupReporting(device, null)) {
                await this.setupReporting(device);
            }
        }
        this.eventBus.onDeviceAnnounce(this, (data) => this.onZigbeeEvent_('deviceAnnounce', data.device));
        this.eventBus.onDeviceMessage(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceJoined(this, (data) => this.onZigbeeEvent_('dummy', data.device));
        this.eventBus.onDeviceNetworkAddressChanged(this, (data) => this.onZigbeeEvent_('dummy', data.device));
    }
    async onZigbeeEvent_(type, device) {
        if (this.shouldSetupReporting(device, type)) {
            await this.setupReporting(device);
        }
    }
}
exports.default = Report;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvcmVwb3J0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSw0RkFBa0U7QUFDbEUsK0RBQXVDO0FBQ3ZDLDhEQUFnRDtBQUNoRCw2REFBcUM7QUFFckMsTUFBTSxvQkFBb0IsR0FBRztJQUN6QixxQkFBcUIsRUFBRSxDQUFDLEVBQUUscUJBQXFCLEVBQUUsR0FBRyxFQUFFLGdCQUFnQixFQUFFLENBQUM7Q0FDNUUsQ0FBQztBQUVGLE1BQU0sU0FBUyxHQUFHLG9DQUF3QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssV0FBVyxDQUFDLENBQUM7QUFFNUYsTUFBTSw2QkFBNkIsR0FBRztJQUNsQyxvQ0FBd0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLGVBQWUsQ0FBQztJQUM3RSxvQ0FBd0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLFdBQVcsQ0FBQztJQUN6RSxvQ0FBd0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLGFBQWEsQ0FBQztJQUMzRSxvQ0FBd0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLFFBQVEsQ0FBQztJQUN0RSxvQ0FBd0IsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLFFBQVEs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