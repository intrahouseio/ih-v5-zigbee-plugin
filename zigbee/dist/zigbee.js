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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
const zigbee_herdsman_1 = require("zigbee-herdsman");
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const data_1 = __importDefault(require("./util/data"));
const utils_1 = __importDefault(require("./util/utils"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const device_1 = __importDefault(require("./model/device"));
const group_1 = __importDefault(require("./model/group"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
class Zigbee {
    constructor(eventBus) {
        this.groupLookup = {};
        this.deviceLookup = {};
        this.eventBus = eventBus;
    }
    async start() {
        const infoHerdsman = await utils_1.default.getDependencyVersion('zigbee-herdsman');
        logger_1.default.info(`Starting zigbee-herdsman (${infoHerdsman.version})`);
        const herdsmanSettings = {
            network: {
                panID: settings.get().advanced.pan_id === 'GENERATE' ?
                    this.generatePanID() : settings.get().advanced.pan_id,
                extendedPanID: settings.get().advanced.ext_pan_id,
                channelList: [settings.get().advanced.channel],
                networkKey: settings.get().advanced.network_key === 'GENERATE' ?
                    this.generateNetworkKey() : settings.get().advanced.network_key,
            },
            databasePath: data_1.default.joinPath('database.db'),
            databaseBackupPath: data_1.default.joinPath('database.db.backup'),
            backupPath: data_1.default.joinPath('coordinator_backup.json'),
            serialPort: {
                baudRate: settings.get().advanced.baudrate,
                rtscts: settings.get().advanced.rtscts,
                path: settings.get().serial.port,
                adapter: settings.get().serial.adapter,
            },
            adapter: {
                concurrent: settings.get().advanced.adapter_concurrent,
                delay: settings.get().advanced.adapter_delay,
                disableLED: settings.get().serial.disable_led,
            },
            acceptJoiningDeviceHandler: this.acceptJoiningDeviceHandler,
        };
        const herdsmanSettingsLog = (0, object_assign_deep_1.default)({}, herdsmanSettings, { network: { networkKey: 'HIDDEN' } });
        logger_1.default.debug(`Using zigbee-herdsman with settings: '${(0, json_stable_stringify_without_jsonify_1.default)(herdsmanSettingsLog)}'`);
        let startResult;
        try {
            this.herdsman = new zigbee_herdsman_1.Controller(herdsmanSettings, logger_1.default);
            startResult = await this.herdsman.start();
        }
        catch (error) {
            logger_1.default.error(`Error while starting zigbee-herdsman`);
            throw error;
        }
        this.herdsman.on('adapterDisconnected', () => this.eventBus.emitAdapterDisconnected());
        this.herdsman.on('lastSeenChanged', (data) => {
            this.eventBus.emitLastSeenChanged({ device: this.resolveDevice(data.device.ieeeAddr) });
        });
        this.herdsman.on('permitJoinChanged', (data) => {
            this.eventBus.emitPermitJoinChanged(data);
        });
        this.herdsman.on('deviceNetworkAddressChanged', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.debug(`Device '${device.name}' changed network address`);
            this.eventBus.emitDeviceNetworkAddressChanged({ device });
        });
        this.herdsman.on('deviceAnnounce', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.debug(`Device '${device.name}' announced itself`);
            this.eventBus.emitDeviceAnnounce({ device });
        });
        this.herdsman.on('deviceInterview', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            const d = { device, status: data.status };
            this.logDeviceInterview(d);
            this.eventBus.emitDeviceInterview(d);
        });
        this.herdsman.on('deviceJoined', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.info(`Device '${device.name}' joined`);
            this.eventBus.emitDeviceJoined({ device });
        });
        this.herdsman.on('deviceLeave', (data) => {
            var _a;
            const name = ((_a = settings.getDevice(data.ieeeAddr)) === null || _a === void 0 ? void 0 : _a.friendly_name) || data.ieeeAddr;
            logger_1.default.warn(`Device '${name}' left the network`);
            this.eventBus.emitDeviceLeave({ ieeeAddr: data.ieeeAddr, name });
        });
        this.herdsman.on('message', (data) => {
            const device = this.resolveDevice(data.device.ieeeAddr);
            logger_1.default.debug(`Received Zigbee message from '${device.name}', type '${data.type}', ` +
                `cluster '${data.cluster}', data '${(0, json_stable_stringify_without_jsonify_1.default)(data.data)}' from endpoint ${data.endpoint.ID}` +
                (data.hasOwnProperty('groupID') ? ` with groupID ${data.groupID}` : ``));
            this.eventBus.emitDeviceMessage({ ...data, device });
        });
        logger_1.default.info(`zigbee-herdsman started (${startResult})`);
        logger_1.default.info(`Coordinator firmware version: '${(0, json_stable_stringify_without_jsonify_1.default)(await this.getCoordinatorVersion())}'`);
        logger_1.default.debug(`Zigbee network parameters: ${(0, json_stable_stringify_without_jsonify_1.default)(await this.herdsman.getNetworkParameters())}`);
        for (const device of this.devices(false)) {
            // If a passlist is used, all other device will be removed from the network.
            const passlist = settings.get().passlist.concat(settings.get().whitelist);
            const blocklist = settings.get().blocklist.concat(settings.get().ban);
            const remove = async (device) => {
                try {
                    await device.zh.removeFromNetwork();
                }
                catch (error) {
                    logger_1.default.error(`Failed to remove '${device.ieeeAddr}' (${error.message})`);
                }
            };
            if (passlist.length > 0) {
                if (!passlist.includes(device.ieeeAddr)) {
                    logger_1.default.warn(`Device which is not on passlist connected (${device.ieeeAddr}), removing...`);
                    await remove(device);
                }
            }
            else if (blocklist.includes(device.ieeeAddr)) {
                logger_1.default.warn(`Device on blocklist is connected (${device.ieeeAddr}), removing...`);
                await remove(device);
            }
        }
        // Check if we have to turn off the led
        if (settings.get().serial.disable_led) {
            await this.herdsman.setLED(false);
        }
        // Check if we have to set a transmit power
        if (settings.get().experimental.hasOwnProperty('transmit_power')) {
            const transmitPower = settings.get().experimental.transmit_power;
            await this.herdsman.setTransmitPower(transmitPower);
            logger_1.default.info(`Set transmit power to '${transmitPower}'`);
        }
        return startResult;
    }
    logDeviceInterview(data) {
        const name = data.device.name;
        if (data.status === 'successful') {
            logger_1.default.info(`Successfully interviewed '${name}', device has successfully been paired`);
            if (data.device.definition) {
                const { vendor, description, model } = data.device.definition;
                logger_1.default.info(`Device '${name}' is supported, identified as: ${vendor} ${description} (${model})`);
            }
            else {
                logger_1.default.warn(`Device '${name}' with Zigbee model '${data.device.zh.modelID}' and manufacturer name ` +
                    `'${data.device.zh.manufacturerName}' is NOT supported, ` +
                    `please follow https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html`);
            }
        }
        else if (data.status === 'failed') {
            logger_1.default.error(`Failed to interview '${name}', device has not successfully been paired`);
        }
        else { // data.status === 'started'
            logger_1.default.info(`Starting interview of '${name}'`);
        }
    }
    generateNetworkKey() {
        const key = Array.from({ length: 16 }, () => Math.floor(Math.random() * 255));
        settings.set(['advanced', 'network_key'], key);
        return key;
    }
    generatePanID() {
        const panID = Math.floor(Math.random() * (0xFFFF - 2)) + 1;
        settings.set(['advanced', 'pan_id'], panID);
        return panID;
    }
    async getCoordinatorVersion() {
        return this.herdsman.getCoordinatorVersion();
    }
    isStopping() {
        return this.herdsman.isStopping();
    }
    async getNetworkParameters() {
        return this.herdsman.getNetworkParameters();
    }
    async reset(type) {
        await this.herdsman.reset(type);
    }
    async stop() {
        logger_1.default.info('Stopping zigbee-herdsman...');
        await this.herdsman.stop();
        logger_1.default.info('Stopped zigbee-herdsman');
    }
    getPermitJoin() {
        return this.herdsman.getPermitJoin();
    }
    getPermitJoinTimeout() {
        return this.herdsman.getPermitJoinTimeout();
    }
    async permitJoin(permit, device, time = undefined) {
        if (permit) {
            logger_1.default.info(`Zigbee: allowing new devices to join${device ? ` via ${device.name}` : ''}.`);
        }
        else {
            logger_1.default.info('Zigbee: disabling joining new devices.');
        }
        if (device && permit) {
            await this.herdsman.permitJoin(permit, device.zh, time);
        }
        else {
            await this.herdsman.permitJoin(permit, undefined, time);
        }
    }
    resolveDevice(ieeeAddr) {
        if (!this.deviceLookup[ieeeAddr]) {
            const device = this.herdsman.getDeviceByIeeeAddr(ieeeAddr);
            device && (this.deviceLookup[ieeeAddr] = new device_1.default(device));
        }
        const device = this.deviceLookup[ieeeAddr];
        if (device && !device.zh.isDeleted) {
            device.ensureInSettings();
            return device;
        }
    }
    resolveGroup(groupID) {
        const group = this.herdsman.getGroupByID(Number(groupID));
        if (group && !this.groupLookup[groupID]) {
            this.groupLookup[groupID] = new group_1.default(group);
        }
        return this.groupLookup[groupID];
    }
    resolveEntity(key) {
        if (typeof key === 'object') {
            return this.resolveDevice(key.ieeeAddr);
        }
        else if (typeof key === 'string' && key.toLowerCase() === 'coordinator') {
            return this.resolveDevice(this.herdsman.getDevicesByType('Coordinator')[0].ieeeAddr);
        }
        else {
            const settingsDevice = settings.getDevice(key.toString());
            if (settingsDevice)
                return this.resolveDevice(settingsDevice.ID);
            const groupSettings = settings.getGroup(key);
            if (groupSettings) {
                const group = this.resolveGroup(groupSettings.ID);
                // If group does not exist, create it (since it's already in configuration.yaml)
                return group ? group : this.createGroup(groupSettings.ID);
            }
        }
    }
    firstCoordinatorEndpoint() {
        return this.herdsman.getDevicesByType('Coordinator')[0].endpoints[0];
    }
    groups() {
        return this.herdsman.getGroups().map((g) => this.resolveGroup(g.groupID));
    }
    devices(includeCoordinator = true) {
        return this.herdsman.getDevices()
            .map((d) => this.resolveDevice(d.ieeeAddr))
            .filter((d) => includeCoordinator || d.zh.type !== 'Coordinator');
    }
    async acceptJoiningDeviceHandler(ieeeAddr) {
        // If passlist is set, all devices not on passlist will be rejected to join the network
        const passlist = settings.get().passlist.concat(settings.get().whitelist);
        const blocklist = settings.get().blocklist.concat(settings.get().ban);
        if (passlist.length > 0) {
            if (passlist.includes(ieeeAddr)) {
                logger_1.default.info(`Accepting joining device which is on passlist '${ieeeAddr}'`);
                return true;
            }
            else {
                logger_1.default.info(`Rejecting joining not in passlist device '${ieeeAddr}'`);
                return false;
            }
        }
        else if (blocklist.length > 0) {
            if (blocklist.includes(ieeeAddr)) {
                logger_1.default.info(`Rejecting joining device which is on blocklist '${ieeeAddr}'`);
                return false;
            }
            else {
                logger_1.default.info(`Accepting joining not in blocklist device '${ieeeAddr}'`);
                return true;
            }
        }
        else {
            return true;
        }
    }
    async touchlinkFactoryResetFirst() {
        return this.herdsman.touchlinkFactoryResetFirst();
    }
    async touchlinkFactoryReset(ieeeAddr, channel) {
        return this.herdsman.touchlinkFactoryReset(ieeeAddr, channel);
    }
    async touchlinkIdentify(ieeeAddr, channel) {
        await this.herdsman.touchlinkIdentify(ieeeAddr, channel);
    }
    async touchlinkScan() {
        return this.herdsman.touchlinkScan();
    }
    createGroup(ID) {
        this.herdsman.createGroup(ID);
        return this.resolveGroup(ID);
    }
    deviceByNetworkAddress(networkAddress) {
        const device = this.herdsman.getDeviceByNetworkAddress(networkAddress);
        return device && this.resolveDevice(device.ieeeAddr);
    }
    groupByID(ID) {
        return this.resolveGroup(ID);
    }
}
__decorate([
    bind_decorator_1.default
], Zigbee.prototype, "acceptJoiningDeviceHandler", null);
exports.default = Zigbee;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiemlnYmVlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vbGliL3ppZ2JlZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxxREFBMkM7QUFDM0MsMkRBQW1DO0FBQ25DLDBEQUE0QztBQUM1Qyx1REFBK0I7QUFDL0IseURBQWlDO0FBQ2pDLDRFQUFrRDtBQUNsRCxrSEFBOEQ7QUFDOUQsNERBQW9DO0FBQ3BDLDBEQUFrQztBQUVsQyxvRUFBa0M7QUFFbEMsTUFBcUIsTUFBTTtJQU12QixZQUFZLFFBQWtCO1FBSHRCLGdCQUFXLEdBQXlCLEVBQUUsQ0FBQztRQUN2QyxpQkFBWSxHQUEwQixFQUFFLENBQUM7UUFHN0MsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLO1FBQ1AsTUFBTSxZQUFZLEdBQUcsTUFBTSxlQUFLLENBQUMsb0JBQW9CLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUN6RSxnQkFBTSxDQUFDLElBQUksQ0FBQyw2QkFBNkIsWUFBWSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUM7UUFDbEUsTUFBTSxnQkFBZ0IsR0FBRztZQUNyQixPQUFPLEVBQUU7Z0JBQ0wsS0FBSyxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBTSxLQUFLLFVBQVUsQ0FBQyxDQUFDO29CQUNsRCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsTUFBZ0I7Z0JBQ25FLGFBQWEsRUFBRSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVU7Z0JBQ2pELFdBQVcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO2dCQUM5QyxVQUFVLEVBQUUsUUFBUSxDQUFDLEdBQUcs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