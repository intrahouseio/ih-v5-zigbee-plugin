"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
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
                this.eventBus.emitReportingDisabled({ device });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwb3J0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvcmVwb3J0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDRGQUFrRTtBQUNsRSwrREFBdUM7QUFDdkMsOERBQWdEO0FBQ2hELDZEQUFxQztBQUVyQyxNQUFNLG9CQUFvQixHQUFHO0lBQ3pCLHFCQUFxQixFQUFFLENBQUMsRUFBRSxxQkFBcUIsRUFBRSxHQUFHLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztDQUM1RSxDQUFDO0FBRUYsTUFBTSxTQUFTLEdBQUcsb0NBQXdCLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxXQUFXLENBQUMsQ0FBQztBQUU1RixNQUFNLDZCQUE2QixHQUFHO0lBQ2xDLG9DQUF3QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssZUFBZSxDQUFDO0lBQzdFLG9DQUF3QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssV0FBVyxDQUFDO0lBQ3pFLG9DQUF3QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssYUFBYSxDQUFDO0lBQzNFLG9DQUF3QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDO0lBQ3RFLG9DQUF3QixDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFD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